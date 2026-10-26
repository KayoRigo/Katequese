// =====================================================================
// modulos/midias/midias.js — galeria paginada e envio de fotos (midias.html).
// =====================================================================

const eu = await iniciarPagina();
const $ = (id) => document.getElementById(id);
const form = $("form-midia");
const POR_PAGINA = 12;

let paginaAtual = 1;
let totalFotos = 0;
let fotos = [];   // fotos da página atual
let links = {};   // caminho do arquivo → link temporário

if (!eu.katequista) {
  $("abrir-form").hidden = true;
  $("subtitulo").textContent = "Você está vendo as fotos liberadas para visitantes.";
}

// ---------- Mostrar a galeria (12 fotos por vez) ----------
async function mostrarGaleria(pagina = paginaAtual) {
  const { count } = await sb.from("midias").select("id", { count: "exact", head: true });
  totalFotos = count || 0;

  if (!totalFotos) {
    fotos = [];
    $("galeria").innerHTML = '<p class="vazio">Por enquanto não há fotos.</p>';
    return;
  }

  const pag = calcularPaginacao(pagina, totalFotos, POR_PAGINA);
  paginaAtual = pag.pagina;

  const { data } = await sb
    .from("midias")
    .select("*, perfis(nome, apelido)")
    .order("criado_em", { ascending: false })
    .range(pag.inicio, pag.fim);
  fotos = data || [];

  // Só gera links temporários para as 12 fotos visíveis nesta página
  links = await linksDosArquivos(fotos.map(f => f.path));
  $("galeria").innerHTML = `
    <div class="galeria">${fotos.map((f, i) => `
      <button class="item-midia" data-indice="${i}" title="${esc(f.titulo)}">
        <img src="${esc(links[f.path])}" alt="${esc(f.titulo)}" loading="lazy">
        ${f.titulo ? `<span class="legenda">${esc(f.titulo)}</span>` : ""}
      </button>`).join("")}</div>
    ${htmlPaginacao({ pagina: paginaAtual, total: totalFotos, porPagina: POR_PAGINA, rotulo: totalFotos === 1 ? "foto" : "fotos" })}`;
}
await mostrarGaleria(1);

// ---------- Abrir uma foto em tamanho grande (com Anterior / Próxima) ----------
let indiceAberto = -1;

function abrirFotoIndice(i) {
  if (i < 0 || i >= fotos.length) return;
  indiceAberto = i;
  const f = fotos[i];

  $("janela-midia").innerHTML = `<img src="${esc(links[f.path])}" alt="">`;
  $("janela-texto").innerHTML = `
    ${f.titulo ? `<h3>${esc(f.titulo)}</h3>` : ""}
    ${f.descricao ? `<p>${esc(f.descricao)}</p>` : ""}
    <small>Enviada por ${htmlNome(f.perfis, f.autor_id)} em ${new Date(f.criado_em).toLocaleDateString("pt-BR")}
      ${eu.katequista ? " · " + htmlVisibilidade(f) : ""}</small>`;
  $("foto-ant").disabled = i === 0;
  $("foto-prox").disabled = i === fotos.length - 1;
  $("apagar").hidden = !(eu.katequista && (f.autor_id === eu.id || eu.admin));
  if (!$("janela").open) $("janela").showModal();
}

$("galeria").addEventListener("click", async (e) => {
  const pag = e.target.closest("[data-pagina]");
  if (pag && !pag.disabled) {
    await mostrarGaleria(Number(pag.dataset.pagina));
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const item = e.target.closest("[data-indice]");
  if (item) abrirFotoIndice(Number(item.dataset.indice));
});

$("foto-ant").addEventListener("click", () => abrirFotoIndice(indiceAberto - 1));
$("foto-prox").addEventListener("click", () => abrirFotoIndice(indiceAberto + 1));
document.addEventListener("keydown", (e) => {
  if (!$("janela").open) return;
  if (e.key === "ArrowLeft") abrirFotoIndice(indiceAberto - 1);
  else if (e.key === "ArrowRight") abrirFotoIndice(indiceAberto + 1);
});

// Gesto de deslizar o dedo (swipe) no celular para trocar de foto
let toqueX = null;
$("janela").addEventListener("touchstart", (e) => {
  toqueX = e.changedTouches?.[0]?.clientX ?? null;
}, { passive: true });
$("janela").addEventListener("touchend", (e) => {
  if (toqueX === null || !$("janela").open) return;
  const dx = (e.changedTouches?.[0]?.clientX ?? toqueX) - toqueX;
  toqueX = null;
  if (Math.abs(dx) < 45) return;
  if (dx < 0) abrirFotoIndice(indiceAberto + 1);
  else abrirFotoIndice(indiceAberto - 1);
}, { passive: true });

function fecharJanela() {
  $("janela").close();
}
$("fechar").addEventListener("click", fecharJanela);
$("janela").addEventListener("click", (e) => { if (e.target === $("janela")) fecharJanela(); });

$("apagar").addEventListener("click", async () => {
  const f = fotos[indiceAberto];
  if (!f || !(await confirmar("Apagar esta foto?", "Apagar"))) return;
  await sb.from("midias").delete().eq("id", f.id);
  await apagarArquivo(f.path);
  fecharJanela();
  await mostrarGaleria(paginaAtual);
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
      await apagarArquivo(caminho);
      throw error;
    }
    fecharForm();
    await mostrarGaleria(1);
  } catch (erro) {
    $("progresso").textContent = "Não foi possível enviar: " + erro.message;
  } finally {
    $("enviar").disabled = false;
  }
});
