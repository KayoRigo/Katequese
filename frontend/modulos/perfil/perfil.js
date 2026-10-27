// =====================================================================
// modulos/perfil/perfil.js — visualização, edição e troca de senha (perfil.html).
// =====================================================================

const perfil = await iniciarPagina();
const $ = (id) => document.getElementById(id);
const campos = ["nome", "apelido", "aniversario", "bio"];
let linkFoto = null;

// ---------- Ficha (visualização) ----------
function atualizarFicha() {
  const nome = $("nome").value.trim() || perfil.usuario;
  $("ver-foto").innerHTML = htmlAvatar({ nome }, linkFoto, "grande");
  $("ver-nome").textContent = nome;
  $("ver-usuario").textContent = "@" + perfil.usuario;
  $("ver-apelido").textContent = $("apelido").value.trim();
  $("ver-bio").textContent = $("bio").value.trim();
  $("remover-foto").hidden = !perfil.foto_path;
}

// Preenche com o que está salvo no banco
campos.forEach(c => $(c).value = perfil[c] || "");
linkFoto = (await linksDosArquivos([perfil.foto_path]))[perfil.foto_path] || null;
atualizarFicha();
campos.forEach(c => $(c).addEventListener("input", atualizarFicha)); // muda enquanto digita

// Tags que o admin deu para mim
const minhasTags = (await buscarTagsDosPerfis())[perfil.id] || [];
$("ver-tags").innerHTML = minhasTags.map(t => htmlTag(t)).join("");

// ---------- Economia (saldo e nível) ----------
if (perfil.katequista) {
  const { data: c, error } = await sb.rpc("abrir_carteira");
  if (!error) {
    const nivel = Math.floor(Math.sqrt(c.xp / 50)) + 1;          // mesma conta do banco
    const inicio = 50 * (nivel - 1) ** 2, proximo = 50 * nivel ** 2;
    $("perfil-saldo").textContent = "K$ " + c.saldo.toLocaleString("pt-BR");
    $("perfil-nivel").textContent = `Nível ${nivel} · ${c.xp} XP (faltam ${proximo - c.xp} para o ${nivel + 1})`;
    $("perfil-barra").style.width = Math.round(((c.xp - inicio) / (proximo - inicio)) * 100) + "%";
    $("caixa-economia").hidden = false;
  }
}

// ---------- Foto de perfil ----------
$("trocar-foto").addEventListener("click", () => $("arquivo-foto").click());

$("arquivo-foto").addEventListener("change", async () => {
  const arquivo = $("arquivo-foto").files[0];
  if (!arquivo) return;
  $("foto-msg").textContent = "Enviando foto...";
  try {
    const antiga = perfil.foto_path;
    const caminho = await enviarArquivo("perfis", await reduzirImagem(arquivo, 600));
    const { error } = await sb.from("perfis").update({ foto_path: caminho }).eq("id", perfil.id);
    if (error) throw error;
    await apagarArquivo(antiga); // não deixa a foto velha ocupando espaço
    perfil.foto_path = caminho;
    linkFoto = (await linksDosArquivos([caminho]))[caminho];
    $("foto-msg").textContent = "";
    atualizarFicha();
  } catch (erro) {
    $("foto-msg").textContent = "Não foi possível trocar a foto: " + erro.message;
  }
  $("arquivo-foto").value = "";
});

$("remover-foto").addEventListener("click", async () => {
  if (!(await confirmar("Remover sua foto de perfil?", "Remover"))) return;
  await sb.from("perfis").update({ foto_path: null }).eq("id", perfil.id);
  await apagarArquivo(perfil.foto_path);
  perfil.foto_path = null;
  linkFoto = null;
  atualizarFicha();
});

// ---------- Salvar dados ----------
$("form-perfil").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const novo = {
    nome: $("nome").value.trim(),
    apelido: $("apelido").value.trim(),
    aniversario: $("aniversario").value || null, // data vazia vira "nenhuma data"
    bio: $("bio").value.trim(),
  };
  $("salvo").textContent = "Salvando...";
  const { error } = await sb.from("perfis").update(novo).eq("id", perfil.id);
  $("salvo").textContent = error ? "Não foi possível salvar." : "Salvo.";
});

// ---------- Trocar senha ----------
$("form-senha").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const nova = $("nova-senha").value;
  if (nova !== $("nova-senha2").value) return $("senha-msg").textContent = "As senhas não são iguais.";
  const { error } = await sb.auth.updateUser({ password: senhaReal(nova) });
  $("senha-msg").textContent = error ? "Não foi possível trocar: " + error.message : "Senha trocada.";
  if (!error) $("form-senha").reset();
});


// ---------- Notificações neste aparelho ----------
async function atualizarPush() {
  let estado = "sem-suporte";
  try { estado = await Promise.race([pushStatus(), new Promise((ok) => setTimeout(() => ok("sem-suporte"), 4000))]); } catch (_) {}
  const textos = {
    "sem-suporte": "Este aparelho ou navegador não aceita notificações.",
    "instalar": "No iPhone, primeiro instale o site: toque em Compartilhar e depois em \"Adicionar à Tela de Início\". Abra pelo ícone e volte aqui.",
    "bloqueado": "As notificações estão bloqueadas. Libere nas configurações do aparelho ou do navegador e volte aqui.",
    "desligado": "Receba avisos do grupo neste aparelho.",
    "ligado": "Notificações ligadas neste aparelho.",
  };
  $("push-texto").textContent = textos[estado];
  const botao = $("push-botao");
  botao.hidden = estado !== "desligado" && estado !== "ligado";
  botao.textContent = estado === "ligado" ? "Desligar" : "Ligar notificações";
  botao.dataset.estado = estado;
  botao.disabled = false;
}

$("push-botao").addEventListener("click", async (e) => {
  const botao = e.currentTarget;
  botao.disabled = true;
  try {
    if (botao.dataset.estado === "ligado") await desativarPush();
    else await ativarPush();
  } catch (erro) {
    $("push-texto").textContent = erro.message;
    botao.disabled = false;
    return;
  }
  atualizarPush();
});
atualizarPush();
