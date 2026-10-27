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
  const reg = await navigator.serviceWorker.getRegistration();
  const inscricao = reg ? await reg.pushManager.getSubscription() : null;
  if (!inscricao) return;
  await sb.rpc("remover_inscricao_push", { p_endpoint: inscricao.endpoint });
  await inscricao.unsubscribe().catch(() => {});
}
