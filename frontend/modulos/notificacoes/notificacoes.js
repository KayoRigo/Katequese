// =====================================================================
// modulos/notificacoes/notificacoes.js — enviar avisos para o celular (notificacoes.html).
// Só admin e Presidente chegam aqui. O envio de verdade é feito pela função
// "enviar-notificacao" do Supabase (no Supabase ela ficou com o endereço "smart-processor") (veja backend/funcoes/).
// =====================================================================

const eu = await iniciarPagina();
const $ = (id) => document.getElementById(id);
const podeEnviar = eu.admin || (eu.katequista && temCargo(eu.id, "Presidente"));

let membros = [];
let comAparelho = new Set(); // ids de quem ativou as notificações
const marcados = new Set();

function atualizarContagem() {
  $("contagem").textContent = `${marcados.size} escolhido(s) de ${comAparelho.size} com notificação ligada`;
}

function desenharLista() {
  $("lista-destino").innerHTML = membros.map(m => {
    const tem = comAparelho.has(m.id);
    return `<label class="destino ${tem ? "" : "sem-aparelho"}">
      <input type="checkbox" value="${esc(m.id)}" ${tem ? "" : "disabled"} ${marcados.has(m.id) ? "checked" : ""}>
      <span class="nome-destino">${esc(m.apelido || m.nome)}</span>
      ${tem ? "" : "<small>desligada</small>"}
    </label>`;
  }).join("") || '<p class="suave">Nenhum membro encontrado.</p>';
  atualizarContagem();
}

async function carregar() {
  const [{ data: lista }, { data: ids, error }] = await Promise.all([
    sb.from("perfis").select("id, nome, apelido").eq("status", "aprovado").order("nome"),
    sb.rpc("quem_recebe_notificacoes"),
  ]);
  if (error) {
    $("lista-destino").innerHTML = '<p class="vazio">As notificações ainda não estão no banco. O admin precisa rodar o <b>supabase-23.sql</b>.</p>';
    $("botao-enviar").disabled = true;
    return;
  }
  membros = lista || [];
  comAparelho = new Set((ids || []).map(x => (typeof x === "string" ? x : Object.values(x)[0])));
  desenharLista();
  carregarHistorico();
}

async function carregarHistorico() {
  const { data } = await sb.from("notificacoes").select("*").order("criado_em", { ascending: false }).limit(10);
  $("historico").innerHTML = (data || []).map(n => `
    <div class="item-historico">
      <strong>${esc(n.titulo)}</strong>
      <p>${esc(n.texto)}</p>
      <span class="suave">${new Date(n.criado_em).toLocaleString("pt-BR")} · ${n.entregues} aparelho(s) de ${n.escolhidos} pessoa(s)</span>
    </div>`).join("") || '<p class="suave">Nada enviado ainda.</p>';
}

$("lista-destino").addEventListener("change", (e) => {
  if (e.target.type !== "checkbox") return;
  e.target.checked ? marcados.add(e.target.value) : marcados.delete(e.target.value);
  atualizarContagem();
});
$("marcar-todos").addEventListener("click", () => { comAparelho.forEach(id => marcados.add(id)); desenharLista(); });
$("desmarcar-todos").addEventListener("click", () => { marcados.clear(); desenharLista(); });

$("form-envio").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("envio-msg");
  if (!podeEnviar) { msg.textContent = "Só admin e Presidente enviam notificações."; return; }
  if (!marcados.size) { msg.textContent = "Escolha pelo menos uma pessoa."; return; }
  $("botao-enviar").disabled = true;
  msg.textContent = "Enviando...";
  const { data, error } = await sb.functions.invoke("smart-processor", {
    body: { titulo: $("titulo").value.trim(), texto: $("texto").value.trim(), destinatarios: [...marcados] },
  });
  $("botao-enviar").disabled = false;
  if (error || data?.erro) {
    let detalhe = data?.erro || "";
    try { detalhe = detalhe || (await error.context.json()).erro; } catch (_) {}
    msg.textContent = detalhe || "Não consegui enviar. A função enviar-notificacao já foi criada no Supabase?";
    return;
  }
  if (typeof data?.entregues !== "number") {
    msg.textContent = "A função do Supabase respondeu algo inesperado (o código dela está certo?): " + JSON.stringify(data).slice(0, 150);
    return;
  }
  msg.textContent = `Enviado para ${data.entregues} aparelho(s).`;
  $("form-envio").reset();
  marcados.clear();
  carregar();
});

if (!podeEnviar) {
  document.querySelector("main").innerHTML = '<p class="vazio">Só admin e Presidente enviam notificações.</p>';
} else {
  carregar();
}
