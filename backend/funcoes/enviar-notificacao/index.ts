// =====================================================================
// enviar-notificacao — função do Supabase (Edge Function, Deno).
// Recebe { titulo, texto, destinatarios: [id, ...] } e envia a notificação
// para todos os aparelhos desses membros. Só admin e Presidente podem usar.
//
// Secrets necessários (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:seu-email)
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já existem sozinhos.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cabecalhos = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: cabecalhos });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cabecalhos });
  if (req.method !== "POST") return resposta({ erro: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:exemplo@exemplo.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  // Lê o pedido uma vez só
  let corpo: { processar?: boolean; titulo?: string; texto?: string; destinatarios?: string[] };
  try { corpo = await req.json(); } catch { return resposta({ erro: "Pedido inválido." }, 400); }

  // MODO AUTOMÁTICO: o banco chama sem login e só pede para entregar o que está na fila.
  // Não dá para mandar texto por aqui, então não há o que abusar.
  if (corpo.processar === true) {
    const { data: linhas, error: erroFila } = await admin.rpc("reivindicar_fila", { p_limite: 200 });
    if (erroFila) return resposta({ erro: erroFila.message }, 500);
    const mortos = new Set<number>();
    let enviadas = 0;
    await Promise.all((linhas ?? []).map(async (l: Record<string, string | number>) => {
      try {
        await webpush.sendNotification(
          { endpoint: String(l.endpoint), keys: { p256dh: String(l.chave_p256dh), auth: String(l.chave_auth) } },
          JSON.stringify({ titulo: l.titulo, texto: l.texto, url: l.url }), { TTL: 86400 });
        enviadas++;
      } catch (e) {
        const codigo = (e as { statusCode?: number }).statusCode;
        if (codigo === 404 || codigo === 410) mortos.add(Number(l.insc_id));
      }
    }));
    if (mortos.size) await admin.from("push_inscricoes").delete().in("id", [...mortos]);
    return resposta({ enviadas, removidos: mortos.size });
  }

  // MODO MANUAL (tela Notificações): só admin e Presidente

  // 1) Quem está chamando? Usa o login da pessoa para perguntar ao banco se pode.
  const doUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: usuario } = await doUsuario.auth.getUser();
  if (!usuario?.user) return resposta({ erro: "Faça login de novo." }, 401);
  const { data: pode } = await doUsuario.rpc("pode_notificar");
  if (!pode) return resposta({ erro: "Só admin e Presidente enviam notificações." }, 403);

  // 2) Confere o que veio
  const titulo = String(corpo.titulo ?? "").trim();
  const texto = String(corpo.texto ?? "").trim();
  const destinatarios = Array.isArray(corpo.destinatarios) ? [...new Set(corpo.destinatarios.map(String))].slice(0, 500) : [];
  if (titulo.length < 1 || titulo.length > 60) return resposta({ erro: "O título precisa ter de 1 a 60 letras." }, 400);
  if (texto.length < 1 || texto.length > 200) return resposta({ erro: "A mensagem precisa ter de 1 a 200 letras." }, 400);
  if (!destinatarios.length) return resposta({ erro: "Escolha pelo menos uma pessoa." }, 400);

  // 3) Busca os aparelhos (chave de serviço: a tabela não é aberta para o site)
  const { data: aparelhos, error } = await admin
    .from("push_inscricoes").select("id, endpoint, chave_p256dh, chave_auth").in("perfil_id", destinatarios);
  if (error) return resposta({ erro: "Não consegui ler os aparelhos: " + error.message }, 500);

  // 4) Envia; aparelhos que não existem mais (404/410) são apagados
  const mensagem = JSON.stringify({ titulo, texto, url: "/paginas/index.html" });
  let entregues = 0;
  const mortos: number[] = [];
  await Promise.all((aparelhos ?? []).map(async (a) => {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.chave_p256dh, auth: a.chave_auth } }, mensagem, { TTL: 86400 });
      entregues++;
    } catch (e) {
      const codigo = (e as { statusCode?: number }).statusCode;
      if (codigo === 404 || codigo === 410) mortos.push(a.id);
    }
  }));
  if (mortos.length) await admin.from("push_inscricoes").delete().in("id", mortos);

  // 5) Guarda no histórico
  await admin.from("notificacoes").insert({
    titulo, texto, enviado_por: usuario.user.id, escolhidos: destinatarios.length, entregues,
  });

  return resposta({ entregues, removidos: mortos.length });
});
