// =====================================================================
// modulos/mural/mural.js — anúncios oficiais e recados paginados (mural.html).
// =====================================================================

const eu = await iniciarPagina();
const $ = (id) => document.getElementById(id);
const POR_PAGINA_RECADOS = 15;
const POR_PAGINA_ANUNCIOS = 10;

let paginaRecados = 1;
let paginaAnuncios = 1;

const possoAnunciar = eu.admin || temCargo(eu.id, "Presidente") || temCargo(eu.id, "Deputado");
const possoPriorizar = eu.admin || temCargo(eu.id, "Presidente");

$("form-recado").hidden = !eu.katequista;
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
mostrarAba(location.hash === "#recados" ? "recados" : "anuncios");

// ---------- Recados (15 por página) ----------
async function mostrarRecados(pagina = paginaRecados) {
  const { count, error: erroContagem } = await sb.from("recados").select("id", { count: "exact", head: true });
  if (erroContagem) {
    $("lista-recados").innerHTML = '<p class="vazio">O Mural ainda não está pronto no banco. O admin precisa rodar o <b>supabase-12.sql</b>.</p>';
    return;
  }
  const total = count || 0;
  if (!total) {
    $("lista-recados").innerHTML = '<p class="vazio">Nenhum recado ainda.</p>';
    return;
  }

  const pag = calcularPaginacao(pagina, total, POR_PAGINA_RECADOS);
  paginaRecados = pag.pagina;

  const { data: recados } = await sb
    .from("recados")
    .select("*, perfis(nome, apelido, usuario, foto_path, admin)")
    .order("fixado", { ascending: false })
    .order("criado_em", { ascending: false })
    .range(pag.inicio, pag.fim);

  const lista = recados || [];
  const links = await linksDosArquivos(lista.map(r => r.perfis?.foto_path));
  $("lista-recados").innerHTML = lista.map(r => {
    const acoes = [
      eu.admin ? `<button class="botao-link" data-fixar="${r.id}" data-fixado="${r.fixado}">${r.fixado ? "Desafixar" : "Fixar"}</button>` : "",
      r.autor_id === eu.id || eu.admin ? `<button class="botao-link perigo" data-apagar-recado="${r.id}">Apagar</button>` : "",
    ].join("");
    return htmlRecado(r, links[r.perfis?.foto_path], acoes, eu.katequista);
  }).join("") + htmlPaginacao({ pagina: paginaRecados, total, porPagina: POR_PAGINA_RECADOS, rotulo: total === 1 ? "recado" : "recados" });
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
  await mostrarRecados(1);
});

$("lista-recados").addEventListener("click", async (e) => {
  const pag = e.target.closest("[data-pagina]");
  if (pag && !pag.disabled) {
    await mostrarRecados(Number(pag.dataset.pagina));
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const fixar = e.target.closest("[data-fixar]");
  const apagar = e.target.closest("[data-apagar-recado]");
  if (fixar) {
    await sb.from("recados").update({ fixado: fixar.dataset.fixado !== "true" }).eq("id", fixar.dataset.fixar);
    await mostrarRecados(paginaRecados);
  } else if (apagar && await confirmar("Apagar este recado?", "Apagar")) {
    await sb.from("recados").delete().eq("id", apagar.dataset.apagarRecado);
    await mostrarRecados(paginaRecados);
  }
});

// ---------- Anúncios (10 por página) ----------
async function mostrarAnuncios(pagina = paginaAnuncios) {
  const { count, error: erroContagem } = await sb.from("anuncios").select("id", { count: "exact", head: true });
  if (erroContagem) {
    $("lista-anuncios").innerHTML = '<p class="vazio">O Mural ainda não está pronto no banco. O admin precisa rodar o <b>supabase-12.sql</b>.</p>';
    return;
  }
  const total = count || 0;
  document.querySelector('.abas-mural [data-aba="anuncios"]').textContent = `Anúncios oficiais (${total})`;
  if (!total) {
    $("lista-anuncios").innerHTML = '<p class="vazio">Nenhum anúncio oficial ainda.</p>';
    return;
  }

  const pag = calcularPaginacao(pagina, total, POR_PAGINA_ANUNCIOS);
  paginaAnuncios = pag.pagina;

  const { data: anuncios } = await sb
    .from("anuncios")
    .select("*, perfis(nome, apelido, usuario, foto_path, admin)")
    .order("prioridade", { ascending: false })
    .order("criado_em", { ascending: false })
    .range(pag.inicio, pag.fim);

  $("lista-anuncios").innerHTML = (anuncios || []).map(a => {
    const acoes = [
      possoPriorizar ? `<button class="botao-link" data-priorizar="${a.id}" data-prioridade="${a.prioridade}">${a.prioridade ? "Tirar prioridade" : "Dar prioridade"}</button>` : "",
      a.autor_id === eu.id || eu.admin ? `<button class="botao-link perigo" data-apagar-anuncio="${a.id}">Apagar</button>` : "",
    ].join("");
    return htmlAnuncio(a, acoes, eu.katequista);
  }).join("") + htmlPaginacao({ pagina: paginaAnuncios, total, porPagina: POR_PAGINA_ANUNCIOS, rotulo: total === 1 ? "anúncio" : "anúncios" });
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
  await mostrarAnuncios(1);
});

$("lista-anuncios").addEventListener("click", async (e) => {
  const pag = e.target.closest("[data-pagina]");
  if (pag && !pag.disabled) {
    await mostrarAnuncios(Number(pag.dataset.pagina));
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const priorizar = e.target.closest("[data-priorizar]");
  const apagar = e.target.closest("[data-apagar-anuncio]");
  if (priorizar) {
    const { error } = await sb.from("anuncios").update({ prioridade: priorizar.dataset.prioridade !== "true" }).eq("id", priorizar.dataset.priorizar);
    if (error) await avisarJanela("Não foi possível mudar: " + error.message);
    await mostrarAnuncios(paginaAnuncios);
  } else if (apagar && await confirmar("Apagar este anúncio?", "Apagar")) {
    await sb.from("anuncios").delete().eq("id", apagar.dataset.apagarAnuncio);
    await mostrarAnuncios(paginaAnuncios);
  }
});

await Promise.all([mostrarRecados(1), mostrarAnuncios(1)]);
