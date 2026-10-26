// =====================================================================
// modulos/eventos/eventos.js — criação, edição, listagem e presença (eventos.html).
// =====================================================================

const eu = await iniciarPagina();
const $ = (id) => document.getElementById(id);
const form = $("form-evento");
const POR_PAGINA_ANTERIORES = 6;

let paginaAnteriores = 1;
let cacheEventos = [];
let eventoEditando = null;

if (!eu.katequista) {
  $("abrir-form").hidden = true;
  $("subtitulo").textContent = "Você está vendo os eventos liberados para visitantes.";
}

// ---------- Mostrar a lista ----------
async function mostrarEventos(pagina = paginaAnteriores) {
  const eventos = await buscarEventos();
  cacheEventos = eventos || [];
  if (!eventos.length) {
    $("eventos").innerHTML = '<p class="vazio">Por enquanto não há eventos ativos.</p>';
    return;
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const proximos = eventos.filter(ev => lerData(ev.data) >= hoje);
  const todosAnteriores = eventos.filter(ev => lerData(ev.data) < hoje).reverse();

  const pag = calcularPaginacao(pagina, todosAnteriores.length, POR_PAGINA_ANTERIORES);
  paginaAnteriores = pag.pagina;
  const anteriores = todosAnteriores.slice(pag.inicio, pag.fim + 1);

  // Só busca presença e assina links dos eventos visíveis nesta página
  const visiveis = [...proximos, ...anteriores];
  const presencas = await buscarPresencas(visiveis.map(ev => ev.id));
  const fotosPerfis = Object.values(presencas).flat().map(r => r.perfis?.foto_path);
  const links = await linksDosArquivos([...visiveis.map(ev => ev.foto_path), ...fotosPerfis]);

  const cartao = (ev, passou) => htmlEvento(ev, links[ev.foto_path], passou,
    eu.katequista && (ev.autor_id === eu.id || eu.admin), eu.katequista,
    htmlPresenca(ev, presencas[ev.id] || [], links, eu.katequista && !passou, passou));

  $("eventos").innerHTML = `
    <h2 class="subtitulo">Próximos</h2>
    ${proximos.length
      ? `<div class="lista-eventos">${proximos.map(ev => cartao(ev, false)).join("")}</div>`
      : '<p class="vazio">Por enquanto não há eventos ativos.</p>'}
    ${todosAnteriores.length ? `
      <h2 class="subtitulo">Anteriores</h2>
      <div class="lista-eventos">${anteriores.map(ev => cartao(ev, true)).join("")}</div>
      ${htmlPaginacao({ pagina: paginaAnteriores, total: todosAnteriores.length, porPagina: POR_PAGINA_ANTERIORES, rotulo: todosAnteriores.length === 1 ? "evento anterior" : "eventos anteriores" })}` : ""}`;
}
await mostrarEventos(1);

// ---------- Abrir e fechar o formulário ----------
function abrirFormEditar(ev = null) {
  eventoEditando = ev;
  form.reset();
  form.querySelector("h2").textContent = ev ? "Editar evento" : "Novo evento";
  $("salvar").textContent = ev ? "Salvar alterações" : "Publicar evento";
  if (ev) {
    $("titulo").value = ev.titulo || "";
    $("data").value = ev.data || "";
    $("hora").value = ev.hora ? ev.hora.slice(0, 5) : "";
    $("local").value = ev.local || "";
    $("descricao").value = ev.descricao || "";
    $("visivel").checked = !!ev.visivel_visitantes;
  }
  form.hidden = false;
  $("abrir-form").hidden = true;
  $("titulo").focus();
  form.scrollIntoView({ behavior: "smooth" });
}

$("abrir-form").addEventListener("click", () => abrirFormEditar(null));

function fecharForm() {
  eventoEditando = null;
  form.reset();
  form.querySelector("h2").textContent = "Novo evento";
  $("salvar").textContent = "Publicar evento";
  form.hidden = true;
  $("abrir-form").hidden = false;
  $("progresso").textContent = "";
}
$("cancelar").addEventListener("click", fecharForm);

// ---------- Publicar ou Salvar Edição ----------
form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  $("salvar").disabled = true;
  $("progresso").textContent = eventoEditando ? "Salvando alterações..." : "Publicando...";

  try {
    let foto_path = eventoEditando ? eventoEditando.foto_path : null;
    const fotoAntiga = eventoEditando?.foto_path || null;
    const arquivo = $("foto").files[0];
    if (arquivo) {
      $("progresso").textContent = "Enviando foto...";
      foto_path = await enviarArquivo("eventos", await reduzirImagem(arquivo));
    }

    const dadosEvento = {
      titulo: $("titulo").value.trim(),
      data: $("data").value,
      hora: $("hora").value || null,
      local: $("local").value.trim(),
      descricao: $("descricao").value.trim(),
      foto_path,
      visivel_visitantes: $("visivel").checked,
    };

    const { error } = eventoEditando
      ? await sb.from("eventos").update(dadosEvento).eq("id", eventoEditando.id)
      : await sb.from("eventos").insert(dadosEvento);
    if (error) throw error;

    if (eventoEditando && arquivo && fotoAntiga && fotoAntiga !== foto_path) {
      await apagarArquivo(fotoAntiga);
    }

    fecharForm();
    await mostrarEventos(paginaAnteriores);
  } catch (erro) {
    $("progresso").textContent = "Não foi possível salvar: " + erro.message;
  } finally {
    $("salvar").disabled = false;
  }
});

// ---------- Paginação, presença, editar e apagar ----------
$("eventos").addEventListener("click", async (e) => {
  const pag = e.target.closest("[data-pagina]");
  if (pag && !pag.disabled) {
    await mostrarEventos(Number(pag.dataset.pagina));
    return;
  }

  const botaoPresenca = e.target.closest("[data-presenca]");
  if (botaoPresenca) {
    const cartao = botaoPresenca.closest("[data-evento]");
    cartao.querySelectorAll("[data-presenca]").forEach(b => b.disabled = true);
    const { error } = await responderPresenca(Number(cartao.dataset.evento), botaoPresenca.dataset.presenca, botaoPresenca.dataset.atual || null);
    if (error) await avisarJanela("Não foi possível responder: " + error.message);
    await mostrarEventos(paginaAnteriores);
    return;
  }

  const botaoEditar = e.target.closest("[data-editar]");
  if (botaoEditar) {
    const alvo = cacheEventos.find(x => x.id === Number(botaoEditar.dataset.editar));
    if (alvo) abrirFormEditar(alvo);
    return;
  }

  const botaoApagar = e.target.closest("[data-apagar]");
  if (botaoApagar && await confirmar("Apagar este evento?", "Apagar")) {
    const { data: ev } = await sb.from("eventos").select("foto_path").eq("id", botaoApagar.dataset.apagar).maybeSingle();
    await sb.from("eventos").delete().eq("id", botaoApagar.dataset.apagar);
    await apagarArquivo(ev?.foto_path);
    await mostrarEventos(paginaAnteriores);
  }
});
