// =====================================================================
// modulos/enquetes/enquetes.js — criação e votação em enquetes (enquetes.html).
// =====================================================================

const eu = await iniciarPagina();
const $ = (id) => document.getElementById(id);
const form = $("form-enquete");

// Visitantes não criam enquetes
if (!eu.katequista) {
  $("abrir-form").hidden = true;
  $("subtitulo").textContent = "Você está vendo as enquetes liberadas para visitantes.";
}

// ================= MOSTRAR AS ENQUETES =================
let enquetes = [];

// Quanto tempo falta, em palavras: "em 2 dias", "em 5 h", "em 12 min"
function faltam(data) {
  const min = Math.round((new Date(data) - Date.now()) / 60000);
  if (min >= 1.5 * 1440) return `em ${Math.round(min / 1440)} dias`;
  if (min >= 1440) return "em 1 dia";
  if (min >= 60) return `em ${Math.round(min / 60)} h`;
  return `em ${Math.max(1, min)} min`;
}
const dataCurta = (d) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function htmlEnquete(e, opcoes, resultados, meusVotos, linkFoto) {
  const aberta = new Date(e.termina_em) > new Date();
  const podeVotar = aberta && (eu.katequista || e.visitantes_votam);
  const jaVotei = opcoes.some(o => meusVotos.has(o.id));
  const pessoas = Number(resultados[opcoes[0]?.id]?.pessoas_votaram || 0);

  const selos = [
    e.multipla ? "Várias opções" : "",
    e.anonima ? "Votos anônimos" : "",
    eu.katequista ? (e.visitantes_votam ? "Visitantes votam" : e.visivel_visitantes ? "Visitantes só veem" : "Só katequistas") : "",
  ].filter(Boolean);

  const linhas = opcoes.map(o => {
    const res = resultados[o.id] || { total: 0, votantes: null };
    const total = Number(res.total);
    const pct = pessoas ? Math.round((total / pessoas) * 100) : 0;
    const escolhida = meusVotos.has(o.id);
    return `
      <label class="opcao-enquete ${escolhida ? "escolhida" : ""} ${podeVotar ? "clicavel" : ""}">
        <span class="opcao-barra" style="width: ${pct}%"></span>
        ${podeVotar ? `<input type="${e.multipla ? "checkbox" : "radio"}" name="enquete-${e.id}" value="${o.id}" ${escolhida ? "checked" : ""}>` : ""}
        <span class="opcao-texto">${esc(o.texto)}</span>
        <span class="opcao-numeros">${pct}% · ${total}</span>
        ${res.votantes?.length ? `<small class="votantes">${res.votantes.map(esc).join(", ")}</small>` : ""}
      </label>`;
  }).join("");

  return `
    <article class="caixa enquete ${aberta ? "" : "encerrada"}">
      ${linkFoto ? `<img class="enquete-foto" src="${esc(linkFoto)}" alt="">` : ""}
      <div class="enquete-topo">
        <h3>${esc(e.titulo)}</h3>
        ${eu.katequista && (e.autor_id === eu.id || eu.admin) ? `<button class="link-apagar" data-apagar="${e.id}">Apagar</button>` : ""}
      </div>
      ${e.descricao ? `<p class="enquete-desc">${esc(e.descricao)}</p>` : ""}
      <p class="enquete-meta">
        Criada por ${htmlNome(e.perfis, e.autor_id)} ·
        ${aberta ? `termina ${faltam(e.termina_em)}` : `encerrada em ${dataCurta(e.termina_em)}`} ·
        ${pessoas} ${pessoas === 1 ? "pessoa votou" : "pessoas votaram"}
      </p>
      ${selos.length ? `<div class="enquete-selos">${selos.map(s => `<span>${s}</span>`).join("")}</div>` : ""}
      <form class="enquete-opcoes" data-enquete="${e.id}">
        ${linhas}
        ${podeVotar ? `
          <div class="acoes">
            <button class="botao-pequeno" type="submit">${jaVotei ? "Mudar voto" : "Votar"}</button>
            ${jaVotei ? `<button class="link-apagar" type="button" data-retirar="${e.id}">Retirar voto</button>` : ""}
          </div>`
        : aberta ? '<p class="enquete-meta">Visitantes não votam nesta enquete.</p>' : ""}
      </form>
    </article>`;
}

async function mostrarEnquetes() {
  const [{ data: lista }, { data: opcoes }, { data: votos }, { data: resultados }] = await Promise.all([
    sb.from("enquetes").select("*, perfis(nome, apelido)").order("termina_em"),
    sb.from("enquete_opcoes").select("*").order("ordem"),
    sb.from("enquete_votos").select("enquete_id, opcao_id"),  // só os MEUS votos
    sb.rpc("resultados_enquetes"),
  ]);
  enquetes = lista || [];

  if (!enquetes.length) {
    $("enquetes").innerHTML = '<p class="vazio">Por enquanto não há enquetes.</p>';
    return;
  }

  // Organiza os dados para achar rápido: opções de cada enquete e resultado de cada opção
  const opcoesDe = {};
  (opcoes || []).forEach(o => (opcoesDe[o.enquete_id] ||= []).push(o));
  const resultadoDe = {};
  (resultados || []).forEach(r => resultadoDe[r.opcao_id] = r);
  const meusVotos = new Set((votos || []).map(v => v.opcao_id));
  const links = await linksDosArquivos(enquetes.map(e => e.foto_path));

  const agora = new Date();
  const abertas = enquetes.filter(e => new Date(e.termina_em) > agora);              // as que acabam antes primeiro
  const encerradas = enquetes.filter(e => new Date(e.termina_em) <= agora).reverse(); // a mais recente primeiro
  const cartao = (e) => htmlEnquete(e, opcoesDe[e.id] || [], resultadoDe, meusVotos, links[e.foto_path]);

  $("enquetes").innerHTML = `
    <h2 class="subtitulo">Abertas</h2>
    ${abertas.length ? `<div class="lista-enquetes">${abertas.map(cartao).join("")}</div>`
                     : '<p class="vazio">Nenhuma enquete aberta.</p>'}
    ${encerradas.length ? `
      <h2 class="subtitulo">Encerradas</h2>
      <div class="lista-enquetes">${encerradas.map(cartao).join("")}</div>` : ""}`;
}
await mostrarEnquetes();

// ================= VOTAR, RETIRAR VOTO E APAGAR =================
$("enquetes").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const formulario = evento.target;
  const escolhidas = [...formulario.querySelectorAll("input:checked")].map(i => Number(i.value));
  if (!escolhidas.length) return avisarJanela("Escolha pelo menos uma opção.");
  const { error } = await sb.rpc("votar", { id_enquete: Number(formulario.dataset.enquete), opcoes: escolhidas });
  if (error) return avisarJanela("Não foi possível votar: " + error.message);
  await mostrarEnquetes();
});

$("enquetes").addEventListener("click", async (e) => {
  const retirar = e.target.closest("[data-retirar]");
  const apagar = e.target.closest("[data-apagar]");
  if (retirar) {
    await sb.rpc("votar", { id_enquete: Number(retirar.dataset.retirar), opcoes: [] });
    await mostrarEnquetes();
  } else if (apagar) {
    if (!(await confirmar("Apagar esta enquete e todos os votos dela?", "Apagar"))) return;
    const enquete = enquetes.find(x => x.id === Number(apagar.dataset.apagar));
    await sb.from("enquetes").delete().eq("id", enquete.id);
    await apagarArquivo(enquete.foto_path);
    await mostrarEnquetes();
  }
});

// ================= CRIAR ENQUETE =================
function adicionarOpcao(texto = "") {
  const lista = $("lista-opcoes");
  if (lista.children.length >= 10) return;
  lista.insertAdjacentHTML("beforeend", `
    <div class="linha-opcao">
      <input class="texto-opcao" maxlength="100" placeholder="Opção ${lista.children.length + 1}" value="${esc(texto)}">
      <button type="button" class="link-apagar" title="Tirar opção">×</button>
    </div>`);
  $("mais-opcao").hidden = lista.children.length >= 10;
}

function limparForm() {
  form.reset();
  $("lista-opcoes").innerHTML = "";
  adicionarOpcao();
  adicionarOpcao();
  $("campo-fim").hidden = true;
  $("linha-visitantes-votam").hidden = true;
  $("progresso").textContent = "";
}
limparForm();

$("mais-opcao").addEventListener("click", () => adicionarOpcao());
$("lista-opcoes").addEventListener("click", (e) => {
  if (!e.target.closest(".link-apagar")) return;
  if ($("lista-opcoes").children.length <= 2) return; // no mínimo 2
  e.target.closest(".linha-opcao").remove();
  $("mais-opcao").hidden = false;
});

// "Escolher data e hora" mostra o campo de data
$("duracao").addEventListener("change", () => {
  $("campo-fim").hidden = $("duracao").value !== "data";
});
// "Visitantes também podem votar" só faz sentido se visitantes puderem ver
$("visivel").addEventListener("change", () => {
  $("linha-visitantes-votam").hidden = !$("visivel").checked;
  if (!$("visivel").checked) $("visitantes-votam").checked = false;
});

$("abrir-form").addEventListener("click", () => {
  form.hidden = false;
  $("abrir-form").hidden = true;
  $("titulo").focus();
});
$("cancelar").addEventListener("click", () => {
  limparForm();
  form.hidden = true;
  $("abrir-form").hidden = false;
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const opcoes = [...document.querySelectorAll(".texto-opcao")].map(i => i.value.trim()).filter(Boolean);
  if (opcoes.length < 2) return $("progresso").textContent = "Coloque pelo menos 2 opções.";

  // Quando termina: agora + a duração escolhida, ou a data escolhida
  let termina;
  if ($("duracao").value === "data") {
    if (!$("fim").value) return $("progresso").textContent = "Escolha a data e a hora em que a enquete termina.";
    termina = new Date($("fim").value);
  } else {
    termina = new Date(Date.now() + Number($("duracao").value));
  }
  if (termina <= new Date()) return $("progresso").textContent = "A data de término precisa ser no futuro.";

  $("publicar").disabled = true;
  $("progresso").textContent = "Publicando...";
  let foto_path = null;
  try {
    const arquivo = $("foto").files[0];
    if (arquivo) {
      $("progresso").textContent = "Enviando imagem...";
      foto_path = await enviarArquivo("enquetes", await reduzirImagem(arquivo));
    }
    const { error } = await sb.rpc("criar_enquete", {
      titulo: $("titulo").value.trim(),
      descricao: $("descricao").value.trim(),
      foto_path,
      termina_em: termina.toISOString(),
      multipla: $("multipla").checked,
      anonima: $("anonima").checked,
      visivel_visitantes: $("visivel").checked,
      visitantes_votam: $("visitantes-votam").checked,
      opcoes,
    });
    if (error) throw error;

    limparForm();
    form.hidden = true;
    $("abrir-form").hidden = false;
    await mostrarEnquetes();
  } catch (erro) {
    await apagarArquivo(foto_path); // não deixa imagem "solta" se a enquete não foi criada
    $("progresso").textContent = "Não foi possível publicar: " + erro.message;
  } finally {
    $("publicar").disabled = false;
  }
});
