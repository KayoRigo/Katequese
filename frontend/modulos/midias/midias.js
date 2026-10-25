// =====================================================================
// modulos/midias/midias.js — galeria e envio de fotos (midias.html).
// =====================================================================

const eu = await iniciarPagina();
const $ = (id) => document.getElementById(id);
const form = $("form-midia");
let fotos = [];   // lista atual (para a janela saber qual abrir)
let links = {};   // caminho do arquivo → link temporário

// Visitantes só olham: sem botão de enviar, e um aviso do que estão vendo
if (!eu.katequista) {
  $("abrir-form").hidden = true;
  $("subtitulo").textContent = "Você está vendo as fotos liberadas para visitantes.";
}

// ---------- Mostrar a galeria ----------
async function mostrarGaleria() {
  const { data } = await sb
    .from("midias")
    .select("*, perfis(nome, apelido)")
    .order("criado_em", { ascending: false });
  fotos = data || [];

  if (!fotos.length) {
    $("galeria").innerHTML = '<p class="vazio">Por enquanto não há fotos.</p>';
    return;
  }

  links = await linksDosArquivos(fotos.map(f => f.path));
  $("galeria").innerHTML = `<div class="galeria">${fotos.map((f, i) => `
    <button class="item-midia" data-indice="${i}" title="${esc(f.titulo)}">
      <img src="${esc(links[f.path])}" alt="${esc(f.titulo)}" loading="lazy">
      ${f.titulo ? `<span class="legenda">${esc(f.titulo)}</span>` : ""}
    </button>`).join("")}</div>`;
}
await mostrarGaleria();

// ---------- Abrir uma foto em tamanho grande ----------
let abertaAgora = null;
$("galeria").addEventListener("click", (e) => {
  const item = e.target.closest("[data-indice]");
  if (!item) return;
  const f = fotos[item.dataset.indice];
  abertaAgora = f;

  $("janela-midia").innerHTML = `<img src="${esc(links[f.path])}" alt="">`;
  $("janela-texto").innerHTML = `
    ${f.titulo ? `<h3>${esc(f.titulo)}</h3>` : ""}
    ${f.descricao ? `<p>${esc(f.descricao)}</p>` : ""}
    <small>Enviada por ${htmlNome(f.perfis, f.autor_id)} em ${new Date(f.criado_em).toLocaleDateString("pt-BR")}
      ${eu.katequista ? " · " + htmlVisibilidade(f) : ""}</small>`;
  $("apagar").hidden = !(eu.katequista && (f.autor_id === eu.id || eu.admin)); // autor ou admin
  $("janela").showModal();
});

function fecharJanela() {
  $("janela").close();
}
$("fechar").addEventListener("click", fecharJanela);
$("janela").addEventListener("click", (e) => { if (e.target === $("janela")) fecharJanela(); }); // clique fora

$("apagar").addEventListener("click", async () => {
  if (!abertaAgora || !(await confirmar("Apagar esta foto?", "Apagar"))) return;
  await sb.from("midias").delete().eq("id", abertaAgora.id);
  await apagarArquivo(abertaAgora.path);
  fecharJanela();
  await mostrarGaleria();
});

// ---------- Formulário de envio ----------
$("abrir-form").addEventListener("click", () => {
  form.hidden = false;
  $("abrir-form").hidden = true;
});
function fecharForm() {
  form.reset();
  form.hidden = true;
  $("abrir-form").hidden = false;
  $("progresso").textContent = "";
}
$("cancelar").addEventListener("click", fecharForm);

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const arquivo = $("arquivo").files[0];
  if (!arquivo) return;
  if (!arquivo.type.startsWith("image/")) {
    $("progresso").textContent = "Só é possível enviar imagens.";
    return;
  }

  $("enviar").disabled = true;
  $("progresso").textContent = "Enviando foto...";

  try {
    const caminho = await enviarArquivo("midias", await reduzirImagem(arquivo));
    const { error } = await sb.from("midias").insert({
      path: caminho,
      tipo: "foto",
      titulo: $("titulo").value.trim(),
      descricao: $("descricao").value.trim(),
      visivel_visitantes: $("visivel").checked,
    });
    if (error) {
      await apagarArquivo(caminho); // não deixa arquivo "solto" se o registro falhar
      throw error;
    }
    fecharForm();
    await mostrarGaleria();
  } catch (erro) {
    $("progresso").textContent = "Não foi possível enviar: " + erro.message;
  } finally {
    $("enviar").disabled = false;
  }
});
