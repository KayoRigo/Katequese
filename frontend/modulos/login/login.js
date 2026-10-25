// =====================================================================
// modulos/login/login.js — entrar e cadastrar-se (login.html).
// =====================================================================

const $ = (id) => document.getElementById(id);
const mensagem = $("mensagem");

function avisar(texto, tipo = "erro") {
  mensagem.textContent = texto;
  mensagem.className = "mensagem " + tipo;
}

// Mostra só uma das três telas: formulários, aguardando ou recusado
function mostrarTela(qual) {
  $("tela-formularios").hidden = qual !== "formularios";
  $("tela-aguardando").hidden = qual !== "aguardando";
  $("tela-recusado").hidden = qual !== "recusado";
}

// ---------- Troca entre as abas "Entrar" e "Cadastrar-se" ----------
document.querySelectorAll(".aba").forEach(aba => {
  aba.addEventListener("click", () => {
    document.querySelectorAll(".aba").forEach(a => a.classList.toggle("ativa", a === aba));
    $("form-entrar").hidden = aba.dataset.aba !== "entrar";
    $("form-cadastro").hidden = aba.dataset.aba !== "cadastro";
    avisar("");
  });
});

if (!configurado) {
  avisar("O banco de dados ainda não foi configurado (config.js).");
}

// Nome de usuário: já vai deixando minúsculo e sem espaço enquanto a pessoa digita
document.querySelectorAll(".campo-usuario").forEach(campo => {
  campo.addEventListener("input", () => {
    campo.value = campo.value.toLowerCase().replace(/\s/g, "").replace(/^@/, "");
  });
});

// ---------- Confere a situação de quem está logado ----------
async function verificarSituacao() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return mostrarTela("formularios");

  const { data: perfil } = await sb.from("perfis").select("status").eq("id", session.user.id).maybeSingle();
  if (perfil?.status === "aprovado") return location.replace("index.html");
  mostrarTela(perfil?.status === "recusado" ? "recusado" : "aguardando");
}

if (configurado) await verificarSituacao();

// ---------- Entrar ----------
$("form-entrar").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (!configurado) return;
  avisar("Entrando...", "ok");

  const { error } = await sb.auth.signInWithPassword({
    email: emailDe($("entrar-usuario").value),
    password: senhaReal($("entrar-senha").value),
  });
  if (error) return avisar("Usuário ou senha incorretos.");
  avisar("");
  await verificarSituacao();
});

// ---------- Cadastrar-se ----------
$("form-cadastro").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (!configurado) return;

  const usuario = normalizarUsuario($("cad-usuario").value);
  const nome = $("cad-nome").value.trim();
  const senha = $("cad-senha").value;

  // Só letras minúsculas, números, ponto, traço e underline (sem espaço nem acento)
  if (!/^[a-z0-9._-]{3,20}$/.test(usuario)) {
    return avisar("Nome de usuário: de 3 a 20 caracteres, só letras sem acento, números, ponto, - ou _.");
  }
  if (senha.length < 4) return avisar("A senha precisa ter pelo menos 4 caracteres.");
  if (senha !== $("cad-senha2").value) return avisar("As senhas não são iguais.");

  avisar("Enviando cadastro...", "ok");
  const { data, error } = await sb.auth.signUp({
    email: emailDe(usuario),
    password: senhaReal(senha),
    options: { data: { usuario, nome } }, // o banco usa isso para criar o perfil
  });

  if (error) {
    if (/registered|exists/i.test(error.message)) return avisar("Esse nome de usuário já existe. Escolha outro.");
    if (/rate limit/i.test(error.message)) return avisar("O Supabase está tentando enviar e-mail de confirmação. O administrador precisa desligar o \"Confirm email\".");
    return avisar("Não foi possível cadastrar: " + error.message);
  }
  if (!data.session) {
    return avisar("Cadastro criado, mas o Supabase está pedindo confirmação de e-mail. O administrador precisa desligar isso.");
  }
  avisar("");
  await verificarSituacao();
});

// ---------- Botões das telas de espera ----------
$("verificar").addEventListener("click", verificarSituacao);
$("sair-aguardando").addEventListener("click", sair);
$("sair-recusado").addEventListener("click", sair);
