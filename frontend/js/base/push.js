// =====================================================================
// push.js — ativar/desativar notificações neste aparelho.
// Usado pelo Perfil. Precisa do config.js (VAPID_PUBLIC_KEY) e do banco.js (sb).
// =====================================================================

// Converte a chave pública para o formato que o navegador pede
function chaveParaBytes(texto) {
  const base64 = (texto + "=".repeat((4 - (texto.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const estaInstalado = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

// Situação neste aparelho:
//  "sem-suporte" | "instalar" (iPhone fora do app) | "bloqueado" | "desligado" | "ligado"
async function pushStatus() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return ehIphone() && !estaInstalado() ? "instalar" : "sem-suporte";
  }
  if (Notification.permission === "denied") return "bloqueado";
  const reg = await navigator.serviceWorker.getRegistration();
  const inscricao = reg ? await reg.pushManager.getSubscription() : null;
  return inscricao && Notification.permission === "granted" ? "ligado" : "desligado";
}

async function ativarPush() {
  try { localStorage.removeItem("push-desligado"); } catch (_) {}
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") throw new Error("A permissão não foi dada. Libere as notificações nas configurações do aparelho.");
  const reg = await navigator.serviceWorker.ready;
  let inscricao = await reg.pushManager.getSubscription();
  if (!inscricao) {
    inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(VAPID_PUBLIC_KEY) });
  }
  const j = inscricao.toJSON();
  const { error } = await sb.rpc("salvar_inscricao_push", {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_agente: navigator.userAgent.slice(0, 200),
  });
  if (error) {
    await inscricao.unsubscribe().catch(() => {});
    throw new Error(error.code === "PGRST202" ? "O banco ainda não tem o supabase-23.sql." : error.message);
  }
}

async function desativarPush() {
  try { localStorage.setItem("push-desligado", "1"); } catch (_) {} // quem desligou não é incomodado de novo
  const reg = await navigator.serviceWorker.getRegistration();
  const inscricao = reg ? await reg.pushManager.getSubscription() : null;
  if (!inscricao) return;
  await sb.rpc("remover_inscricao_push", { p_endpoint: inscricao.endpoint });
  await inscricao.unsubscribe().catch(() => {});
}

// ---------------------------------------------------------------------
// Automático: as notificações já nascem ligadas.
//  - Permissão já dada: registra o aparelho em silêncio (inclusive aparelho novo ou conta trocada).
//  - Permissão ainda não perguntada: mostra uma faixa com um toque para ativar
//    (os navegadores exigem esse toque; não dá para ligar sem a pessoa permitir).
//  - Quem desligou no Perfil, ou tocou em "Agora não", não é incomodado por 7 dias / nunca.
// ---------------------------------------------------------------------
const guardado = {
  ler(chave) { try { return localStorage.getItem(chave); } catch (_) { return null; } },
  gravar(chave, valor) { try { localStorage.setItem(chave, valor); } catch (_) {} },
};

async function sincronizarPush(perfil) {
  const reg = await navigator.serviceWorker.ready;
  let inscricao = await reg.pushManager.getSubscription();
  if (!inscricao) {
    inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(VAPID_PUBLIC_KEY) });
  }
  const marca = perfil.id + "|" + inscricao.endpoint;
  if (guardado.ler("push-sincronizado") === marca) return; // já registrado neste aparelho para esta conta
  const j = inscricao.toJSON();
  const { error } = await sb.rpc("salvar_inscricao_push", {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_agente: navigator.userAgent.slice(0, 200),
  });
  if (!error) guardado.gravar("push-sincronizado", marca);
}

function mostrarFaixaPush(perfil) {
  if (document.getElementById("aviso-push")) return;
  const faixa = document.createElement("div");
  faixa.id = "aviso-push";
  faixa.className = "aviso-atualizacao aviso-push";
  faixa.setAttribute("role", "dialog");
  faixa.innerHTML = '<span>Receber os avisos do grupo neste aparelho?</span>' +
    '<button type="button" class="botao-pequeno" data-ativar>Ativar</button>' +
    '<button type="button" class="botao-link" data-depois>Agora não</button>';
  faixa.querySelector("[data-depois]").addEventListener("click", () => {
    guardado.gravar("push-adiado", String(Date.now()));
    faixa.remove();
  });
  faixa.querySelector("[data-ativar]").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    try {
      await ativarPush();
      guardado.gravar("push-sincronizado", "");
      faixa.remove();
    } catch (erro) {
      faixa.querySelector("span").textContent = erro.message;
      faixa.querySelector("[data-ativar]").remove();
    }
  });
  document.body.appendChild(faixa);
}

async function iniciarPushAutomatico(perfil) {
  try {
    if (!VAPID_PUBLIC_KEY || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    if (guardado.ler("push-desligado") === "1") return;
    if (Notification.permission === "granted") { await sincronizarPush(perfil); return; }
    if (Notification.permission !== "default") return; // bloqueado: só o Perfil explica como liberar
    const adiado = Number(guardado.ler("push-adiado") || 0);
    if (Date.now() - adiado < 7 * 24 * 3600 * 1000) return;
    setTimeout(() => mostrarFaixaPush(perfil), 2500);
  } catch (_) { /* nunca atrapalha a página */ }
}
