// =====================================================================
// modulos/mural/mural.js — anúncios oficiais e recados (mural.html).
// =====================================================================

const eu = await iniciarPagina();
const $ = (id) => document.getElementById(id);

// Meus cargos (carregados pelo iniciarPagina): decidem o que eu posso fazer nos anúncios
const possoAnunciar = eu.admin || temCargo(eu.id, "Presidente") || temCargo(eu.id, "Deputado");
const possoPriorizar = eu.admin || temCargo(eu.id, "Presidente");

$("form-recado").hidden = !eu.katequista; // visitantes só leem os recados
$("form-anuncio").hidden = !possoAnunciar;
$("aviso-anuncio").hidden = possoAnunciar;
$("linha-prioridade").hidden = !possoPriorizar;
if (!eu.katequista) $("subtitulo").textContent = "Você está vendo os recados e anúncios liberados para visitantes.";

// ---------- Abas ----------
function mostrarAba(nome) {
  document.querySelectorAll(".abas-mural .aba").forEach(a => a.classList.toggle("ativa", a.dataset.aba === nome));
  $("secao-recados").hidden = nome !== "recados";
  $("secao-anuncios").hidden = nome !== "anuncios";
  history.replaceState(null, "", nome === "recados" ? "#recados" : location.pathname);
}
document.querySelectorAll(".abas-mural .aba").forEach(a => a.addEventListener("click", () => mostrarAba(a.dataset.aba)));
mostrarAba(location.hash === "#recados" ? "recados" : "anuncios"); // abre nos anúncios oficiais

// ---------- Recados ----------
async function mostrarRecados() {
  const recados = await buscarRecados();
  if (recados === null) {
    $("lista-recados").innerHTML = '<p class="vazio">O Mural ainda não está pronto no banco. O admin precisa rodar o <b>supabase-12.sql</b>.</p>';
    return;
  }
  if (!recados.length) {
    $("lista-recados").innerHTML = '<p class="vazio">Nenhum recado ainda.</p>';
    return;
  }
  const links = await linksDosArquivos(recados.map(r => r.perfis?.foto_path));
  $("lista-recados").innerHTML = recados.map(r => {
    const acoes = [
      eu.admin ? `<button class="botao-link" data-fixar="${r.id}" data-fixado="${r.fixado}">${r.fixado ? "Desafixar" : "Fixar"}</button>` : "",
      r.autor_id === eu.id || eu.admin ? `<button class="botao-link perigo" data-apagar-recado="${r.id}">Apagar</button>` : "",
    ].join("");
    return htmlRecado(r, links[r.perfis?.foto_path], acoes, eu.katequista);
  }).join("");
}

$("recado-texto").addEventListener("input", () => {
  $("recado-letras").textContent = `${$("recado-texto").value.length}/1000`;
});

$("form-recado").addEventListener("submit", async (e) => {
  e.preventDefault();
  const texto = $("recado-texto").value.trim();
  if (!texto) return;
  $("recado-msg").textContent = "Publicando...";
  const { error } = await sb.from("recados").insert({ texto, visivel_visitantes: $("recado-visivel").checked });
  if (error) return $("recado-msg").textContent = "Não foi possível publicar: " + error.message;
  $("form-recado").reset();
  $("recado-letras").textContent = "0/1000";
  $("recado-msg").textContent = "";
  await mostrarRecados();
});

$("lista-recados").addEventListener("click", async (e) => {
  const fixar = e.target.closest("[data-fixar]");
  const apagar = e.target.closest("[data-apagar-recado]");
  if (fixar) {
    await sb.from("recados").update({ fixado: fixar.dataset.fixado !== "true" }).eq("id", fixar.dataset.fixar);
    await mostrarRecados();
  } else if (apagar && await confirmar("Apagar este recado?", "Apagar")) {
    await sb.from("recados").delete().eq("id", apagar.dataset.apagarRecado);
    await mostrarRecados();
  }
});

// ---------- Anúncios ----------
async function mostrarAnuncios() {
  const anuncios = await buscarAnuncios();
  if (anuncios === null) {
    $("lista-anuncios").innerHTML = '<p class="vazio">O Mural ainda não está pronto no banco. O admin precisa rodar o <b>supabase-12.sql</b>.</p>';
    return;
  }
  // O número de anúncios aparece no nome da aba
  document.querySelector('.abas-mural [data-aba="anuncios"]').textContent = `Anúncios oficiais (${anuncios.length})`;
  if (!anuncios.length) {
    $("lista-anuncios").innerHTML = '<p class="vazio">Nenhum anúncio oficial ainda.</p>';
    return;
  }
  $("lista-anuncios").innerHTML = anuncios.map(a => {
    const acoes = [
      possoPriorizar ? `<button class="botao-link" data-priorizar="${a.id}" data-prioridade="${a.prioridade}">${a.prioridade ? "Tirar prioridade" : "Dar prioridade"}</button>` : "",
      a.autor_id === eu.id || eu.admin ? `<button class="botao-link perigo" data-apagar-anuncio="${a.id}">Apagar</button>` : "",
    ].join("");
    return htmlAnuncio(a, acoes, eu.katequista);
  }).join("");
}

$("form-anuncio").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("anuncio-msg").textContent = "Publicando...";
  const { error } = await sb.from("anuncios").insert({
    titulo: $("anuncio-titulo").value.trim(),
    texto: $("anuncio-texto").value.trim(),
    prioridade: possoPriorizar && $("anuncio-prioridade").checked,
    visivel_visitantes: $("anuncio-visivel").checked,
  });
  if (error) return $("anuncio-msg").textContent = "Não foi possível publicar: " + error.message;
  $("form-anuncio").reset();
  $("anuncio-msg").textContent = "";
  await mostrarAnuncios();
});

$("lista-anuncios").addEventListener("click", async (e) => {
  const priorizar = e.target.closest("[data-priorizar]");
  const apagar = e.target.closest("[data-apagar-anuncio]");
  if (priorizar) {
    const { error } = await sb.from("anuncios").update({ prioridade: priorizar.dataset.prioridade !== "true" }).eq("id", priorizar.dataset.priorizar);
    if (error) await avisarJanela("Não foi possível mudar: " + error.message);
    await mostrarAnuncios();
  } else if (apagar && await confirmar("Apagar este anúncio?", "Apagar")) {
    await sb.from("anuncios").delete().eq("id", apagar.dataset.apagarAnuncio);
    await mostrarAnuncios();
  }
});

await Promise.all([mostrarRecados(), mostrarAnuncios()]);
