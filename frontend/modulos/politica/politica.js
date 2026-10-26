// =====================================================================
// modulos/politica/politica.js — Governo, candidatos e eleição (politica.html).
// As sub-abas de Leis e Câmara ficam em modulos/politica/leis.js.
// =====================================================================

const eu = await iniciarPagina();
iniciarLeis(eu);   // sub-abas de Leis (não espera: o Governo aparece logo)
const area = document.getElementById("politica");

// Presidente, deputados e datas (todo aprovado consegue ler)
const { data: pol, error } = await sb.from("politica").select("*").eq("id", 1).maybeSingle();
if (error || !pol) {
  area.innerHTML = `<p class="vazio">A aba Política ainda não está pronta no banco. O admin precisa rodar o <b>supabase-6.sql</b>.</p>`;
  throw new Error("tabela politica não encontrada");
}

// O link da votação: o banco só entrega para katequistas.
let link = "";
if (eu.katequista) {
  const { data } = await sb.from("politica_link").select("link").eq("id", 1).maybeSingle();
  link = data?.link || "";
}

// Candidatos da eleição (tabela que só katequistas leem; visitantes recebem vazio)
let eleicao = null;
if (eu.katequista) {
  const { data } = await sb.from("politica_eleicao").select("dados").eq("id", 1).maybeSingle();
  if (data?.dados?.chapas?.length) eleicao = data.dados;
}

// Fotos (presidente + deputados) de uma vez só
const deputados = [0, 1, 2, 3].map(i => pol.deputados[i] || null).map(d => d && d.nome ? d : null);
const fotos = await linksDosArquivos([pol.presidente_foto, ...deputados.map(d => d?.foto)]);

// Preenche o painel de resumo vivo do topo (Presidência + Câmara)
const caixaResumo = document.getElementById("pol-resumo");
if (caixaResumo) {
  caixaResumo.hidden = false;
  const ocupadas = deputados.filter(Boolean).length;
  document.getElementById("resumo-pol-presidente").textContent = pol.presidente_nome || "Vago";
  document.getElementById("resumo-pol-partido").textContent = pol.presidente_partido || "Poder Executivo";
  document.getElementById("resumo-pol-deputados").textContent = `${ocupadas} de 4`;
  document.getElementById("resumo-pol-cadeiras").textContent = ocupadas === 4 ? "Bancada completa" : `${4 - ocupadas} vaga(s) aberta(s)`;

  caixaResumo.addEventListener("click", (e) => {
    const card = e.target.closest("[data-ir-aba]");
    if (!card) return;
    const btn = document.querySelector(`#pol-abas [data-aba="${card.dataset.irAba}"]`);
    if (btn && !btn.hidden) btn.click();
  });
}

// ---------- Datas ----------
const formatar = (data) => {
  const dia = data.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} às ${hora}`;
};

function falta(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  const p = (n, s, pl) => `${n} ${n === 1 ? s : pl}`;
  if (d) return p(d, "dia", "dias") + (h ? " e " + p(h, "hora", "horas") : "");
  if (h) return p(h, "hora", "horas") + (m ? " e " + p(m, "minuto", "minutos") : "");
  return p(m, "minuto", "minutos");
}

// ---------- Cartão da eleição ----------
function htmlEleicao() {
  const abre = pol.eleicao_abre ? new Date(pol.eleicao_abre) : null;
  const fecha = pol.eleicao_fecha ? new Date(pol.eleicao_fecha) : null;
  const agora = new Date();

  let estado, titulo, texto;
  if (!abre || !fecha) {
    estado = "sem-data";
    titulo = "Sem eleição marcada";
    texto = "A data da próxima eleição ainda não foi definida.";
  } else if (agora < abre) {
    estado = "em-breve";
    titulo = "Próxima eleição";
    texto = `A votação abre ${formatar(abre)} e fecha ${formatar(fecha)}. Começa em ${falta(abre - agora)}.`;
  } else if (agora < fecha) {
    estado = "aberta";
    titulo = "Votação aberta";
    texto = `Vai até ${formatar(fecha)}. Faltam ${falta(fecha - agora)}.`;
  } else {
    const proxima = new Date(fecha);
    proxima.setMonth(proxima.getMonth() + 6);
    const mes = proxima.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    estado = "encerrada";
    titulo = "Votação encerrada";
    const meses = Math.max(1, Math.round((proxima - agora) / (30 * 86400000)));
    texto = `A votação terminou ${formatar(fecha)}. Próxima eleição prevista para ${mes}, daqui a cerca de ${meses} ${meses === 1 ? "mês" : "meses"}.`;
  }

  let acao = "";
  if (!eu.katequista) {
    acao = `<p class="eleicao-aviso">Só Katequistas votam nas eleições.</p>`;
  } else if (link && estado !== "encerrada") {
    acao = `<a class="botao" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Ir para o site da votação →</a>`;
  } else if (link) {
    acao = `<a class="botao-pequeno" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Ver o site da votação</a>`;
  } else {
    acao = `<p class="eleicao-aviso">O link da votação ainda não foi colocado.</p>`;
  }

  return `
    <section class="caixa eleicao ${estado} pol-animar" style="--i: 2">
      <h2>Urnas e Calendário Eleitoral</h2>
      <p class="eleicao-titulo">${estado === "aberta" ? '<span class="ponto-aberta"></span>' : ""}${titulo}</p>
      <p class="eleicao-texto">${esc(texto)}</p>
      ${acao}
    </section>`;
}

// ---------- Presidente ----------
function htmlPresidente() {
  if (!pol.presidente_nome) return `<p class="vazio">Sem presidente no momento.</p>`;
  const foto = fotos[pol.presidente_foto];
  const dInicio = pol.mandato_desde ? lerData(pol.mandato_desde) : null;
  const diasMandato = dInicio ? Math.max(1, Math.floor((Date.now() - dInicio.getTime()) / 86400000)) : 0;
  const desde = dInicio
    ? `<p class="cargo-desde">No cargo desde ${dInicio.toLocaleDateString("pt-BR")} · <b>${diasMandato} ${diasMandato === 1 ? "dia" : "dias"} de mandato</b></p>` : "";
  return `
    <div class="presidente">
      <div class="presidente-moldura">
        ${foto ? `<img src="${esc(foto)}" alt="">`
               : `<div class="iniciais">${esc(pol.presidente_nome[0].toUpperCase())}</div>`}
      </div>
      <div class="presidente-info">
        <div class="proposta-tags">
          <span class="cargo">Presidente da Katequese</span>
          ${pol.presidente_partido ? `<span class="selo-partido">${esc(pol.presidente_partido)}</span>` : ""}
        </div>
        <strong>${esc(pol.presidente_nome)}</strong>
        ${desde}
        <p class="poderes-resumo">Chefe do Executivo · Propõe leis, avalia ideias dos Deputados e convoca Voto Popular em empates.</p>
      </div>
    </div>`;
}

// ---------- Deputados (4 vagas) ----------
function htmlDeputados() {
  return deputados.map((d, i) => d ? `
    <div class="deputado pol-animar" style="--i: ${i + 1}">
      <span class="cadeira-num">Cadeira 0${i + 1}</span>
      ${htmlAvatar({ nome: d.nome }, fotos[d.foto])}
      <strong>${esc(d.nome)}</strong>
      <small>Deputado${d.partido ? " · " + esc(d.partido) : ""}</small>
    </div>` : `
    <div class="deputado vaga pol-animar" style="--i: ${i + 1}">
      <span class="cadeira-num">Cadeira 0${i + 1}</span>
      <div class="iniciais">${i + 1}</div>
      <strong>Vaga aberta</strong>
      <small>Sem titular eleito</small>
    </div>`).join("");
}

// ---------- Candidatos (só katequistas) ----------
function htmlFoto(foto, classe) {
  if (!foto) return `<div class="${classe}"></div>`;
  const url = eleicao.fotosDe + foto.arquivo;
  return `<div class="${classe}" style="background-image: url('${esc(url)}'); background-size: ${esc(foto.tamanho)}; background-position: ${esc(foto.posicao)}"></div>`;
}
function htmlPropostas(lista, rotulo) {
  if (!lista?.length) return "";
  return `
    <details class="propostas">
      <summary>${rotulo} (${lista.length})</summary>
      <ol>${lista.map(p => `<li><strong>${esc(p.titulo)}</strong><span>${esc(p.texto)}</span></li>`).join("")}</ol>
    </details>`;
}
function htmlCandidatos() {
  if (!eleicao) return "";
  const totalDeputados = eleicao.chapas.reduce((n, c) => n + c.deputados.length, 0);
  return `
    <section class="caixa pol-animar" style="margin-top: 16px; --i: 2">
      <h2>Candidatos · ${esc(eleicao.titulo)}</h2>
      <p class="candidatos-resumo">${eleicao.chapas.length} chapas para presidente e ${totalDeputados} candidatos a deputado.
        Os ${eleicao.vagasDeputado} deputados mais votados são eleitos.</p>
      <div class="chapas">
        ${eleicao.chapas.map((c, idx) => `
          <article class="chapa pol-animar" style="--i: ${idx + 1}">
            <div class="chapa-topo">
              ${htmlFoto(c.foto, "chapa-foto")}
              <div>
                <span class="chapa-numero">${esc(c.numero)}</span>
                <span class="chapa-partido">${esc(c.sigla)} · ${esc(c.partido)}</span>
              </div>
            </div>
            <strong class="chapa-nome">${esc(c.presidente)}</strong>
            <span class="chapa-cargo">Candidato a presidente${c.reeleicao ? " · tenta a reeleição" : ""}</span>
            <p class="chapa-slogan">“${esc(c.slogan)}”</p>
            ${htmlPropostas(c.propostas, "Propostas")}
            <p class="rotulo" style="margin: 16px 0 8px">Deputados da chapa</p>
            ${c.deputados.map(d => `
              <div class="candidato-deputado">
                ${htmlFoto(d.foto, "deputado-foto")}
                <div>
                  <strong>${esc(d.nome)}</strong> <span class="numero-deputado">${esc(d.numero)}</span>
                  <p>“${esc(d.slogan)}”</p>
                  ${htmlPropostas(d.propostas, "Propostas")}
                </div>
              </div>`).join("")}
          </article>`).join("")}
      </div>
    </section>`;
}

function montar() {
  const encerrada = pol.eleicao_fecha && new Date() >= new Date(pol.eleicao_fecha);
  area.innerHTML = `
    <section class="caixa presidente-caixa pol-animar" style="--i: 0">
      <h2>Poder Executivo · Presidente Atual</h2>
      ${htmlPresidente()}
    </section>
    <section class="caixa pol-animar" style="margin-top: 16px; --i: 1">
      <h2>Poder Legislativo · Bancada de Deputados (4 cadeiras)</h2>
      <div class="deputados">${htmlDeputados()}</div>
    </section>
    ${encerrada ? "" : htmlCandidatos()}
    <div style="margin-top: 16px">${htmlEleicao()}</div>`;
}
montar();

// Atualiza só o cartão da eleição a cada 30 segundos (pausa quando a aba está oculta)
setInterval(() => {
  if (document.hidden) return;
  const atual = area.querySelector(".eleicao");
  if (atual) atual.outerHTML = htmlEleicao();
}, 30000);
