// =====================================================================
// leis.js — Leis e Câmara, dentro da página Política (sub-abas
// "Leis em vigor", "Câmara", "Gestão" e "Admin"). A página chama iniciarLeis(eu).
// As regras de verdade ficam no banco (supabase-17.sql a supabase-20.sql).
// =====================================================================

// Pirâmide de Hierarquia Jurídica da Katequese (do 1º ao 4º escalão)
const CATEGORIAS_LEI = [
  {
    id: "constitucional",
    ordem: 1,
    sigla: "1º Escalão · Constitucional",
    curto: "Constituição",
    nome: "Constituição Katequista (Carta Magna)",
    resumo: "Regras máximas do grupo, direitos dos membros e funcionamento dos poderes.",
    classe: "cat-constitucional",
  },
  {
    id: "stk",
    ordem: 2,
    sigla: "2º Escalão · STK",
    curto: "Superior Tribunal (STK)",
    nome: "Superior Tribunal Katequista (STK)",
    resumo: "Julgamentos, punições, multas, advertências e conduta disciplinar do grupo.",
    classe: "cat-stk",
  },
  {
    id: "geral",
    ordem: 3,
    sigla: "3º Escalão · Lei Geral",
    curto: "Leis Gerais",
    nome: "Leis Gerais do Grupo",
    resumo: "Regras de convivência, churrascos, encontros, mural e dia a dia da Katequese.",
    classe: "cat-geral",
  },
  {
    id: "decreto",
    ordem: 4,
    sigla: "4º Escalão · Decreto & Economia",
    curto: "Decretos & Economia",
    nome: "Decretos & Economia (K$)",
    resumo: "Regras do cassino, salários K$, sorteios, apostas e decretos de mandato.",
    classe: "cat-decreto",
  },
];

function infoCategoriaLei(cat) {
  return CATEGORIAS_LEI.find(c => c.id === cat) || CATEGORIAS_LEI[2];
}

function ordenarLeisPorHierarquia(lista = []) {
  return [...lista].sort((a, b) => {
    const da = infoCategoriaLei(a.categoria).ordem;
    const db = infoCategoriaLei(b.categoria).ordem;
    if (da !== db) return da - db;
    return (a.numero || 0) - (b.numero || 0);
  });
}

function assinaturaLei(l) {
  if (l?.autor_nome && l?.aprovado_por_nome && l.autor_nome !== l.aprovado_por_nome) {
    return `Ideia de ${l.autor_nome} · Sancionada por ${l.aprovado_por_nome}`;
  }
  if (l?.autor_nome) return `Proposta por ${l.autor_nome}`;
  return "";
}

function htmlCartaoLei(l, formatarData = (d) => d, indice = 0) {
  const cat = infoCategoriaLei(l?.categoria);
  const assinatura = assinaturaLei(l);
  return `
    <article class="caixa lei ${cat.classe} pol-animar" style="--i: ${Math.min(indice, 8)}">
      <div class="proposta-topo">
        <span class="lei-numero">Lei nº ${l.numero}</span>
        <span class="selo-categoria ${cat.classe}">${esc(cat.sigla)} · ${esc(cat.nome)}</span>
      </div>
      <h2>${esc(l.titulo)}</h2>
      <div class="lei-corpo">
        <p class="lei-texto">${esc(l.texto)}</p>
      </div>
      <div class="lei-rodape">
        <small>${assinatura ? `<b>${esc(assinatura)}</b>` : "Código Oficial da Katequese"}</small>
        <small>Em vigor desde ${formatarData(l.criada_em)}${l.alterada_em ? ` · alterada em ${formatarData(l.alterada_em)}` : ""}</small>
      </div>
    </article>`;
}

// Trilha visual do passo a passo legislativo de uma proposta
function htmlTrilhaProposta(p) {
  if (!p) return "";
  const st = p.status;
  const e1 = st === "sugestao" ? "atual" : st === "cancelada" ? "" : "feito";
  const e2 = st === "camara" ? "atual" : ["empate", "popular", "aprovada", "rejeitada"].includes(st) ? "feito" : "";
  const e3 = st === "empate" || st === "popular" ? "atual" : st === "aprovada" ? "feito" : st === "rejeitada" ? "rejeitado" : "";
  const rotulo3 = st === "empate" || st === "popular" ? "3. Voto Popular" : st === "rejeitada" ? "3. Rejeitada" : "3. Em vigor";

  return `
    <div class="trilha-etapas" aria-label="Etapa da proposta">
      <span class="passo-trilha ${e1}">1. Aval do Presidente</span>
      <span class="passo-trilha ${e2}">2. Voto dos 4 Deputados</span>
      <span class="passo-trilha ${e3}">${rotulo3}</span>
    </div>`;
}

// Barra visual de quórum (enquanto aberta na Câmara) ou de placar Sim vs Não (após encerrar)
function htmlPlacarProposta(p) {
  if (!p) return "";
  if (p.status === "camara") {
    const total = Math.max(1, Number(p.total_deputados) || 4);
    const votaram = Math.min(total, Number(p.votaram_camara) || 0);
    const pct = Math.round((votaram / total) * 100);
    const cadeiras = Array.from({ length: total }, (_, i) =>
      `<span class="quorum-ponto ${i < votaram ? "votou" : ""}" title="Deputado ${i + 1}"></span>`
    ).join("");
    return `
      <div class="quorum-box">
        <div class="quorum-topo">
          <span>Quórum da Câmara: <b>${votaram} de ${total}</b> deputados votaram</span>
          <span class="quorum-pontos">${cadeiras}</span>
        </div>
        <div class="quorum-barra"><div style="width: ${pct}%"></div></div>
      </div>`;
  }

  const sim = Number(p.camara_sim) || 0;
  const nao = Number(p.camara_nao) || 0;
  if (p.status !== "sugestao" && sim + nao > 0) {
    const pctSim = Math.round((sim / (sim + nao)) * 100);
    return `
      <div class="placar-box">
        <div class="placar-rotulos">
          <span class="sim">Sim: <b>${sim}</b> (${pctSim}%)</span>
          <span class="nao">Não: <b>${nao}</b> (${100 - pctSim}%)</span>
        </div>
        <div class="placar-barra">
          <div class="placar-sim" style="width: ${pctSim}%"></div>
          <div class="placar-nao" style="width: ${100 - pctSim}%"></div>
        </div>
      </div>`;
  }
  return "";
}

// Separa estritamente o cargo político (Presidente / Deputado) do acesso de Admin do site.
function permissoesPolitica(eu) {
  const souPresidente = Boolean(eu?.katequista && temCargo(eu.id, "Presidente"));
  const souDeputado = Boolean(eu?.katequista && temCargo(eu.id, "Deputado"));
  const souAdmin = Boolean(eu?.katequista && eu?.admin);
  return {
    souPresidente,
    souDeputado,
    souAdmin,
    podeGerir: Boolean(souPresidente || souDeputado),
    podeAprovarSugestao: souPresidente,
  };
}

// Regra de quem pode arquivar/cancelar uma proposta aberta nas abas políticas normais
function podeArquivarProposta(p, eu, modoAdmin = false) {
  if (!p || !p.aberta) return false;
  const { souPresidente, souAdmin } = permissoesPolitica(eu);
  if (modoAdmin && souAdmin) return true;
  if (p.status === "sugestao") {
    return Boolean(souPresidente || (eu?.id && p.autor_id === eu.id));
  }
  if (p.status === "empate") {
    return souPresidente;
  }
  return Boolean(souPresidente && (!p.autor_id || p.autor_id === eu.id));
}

// Créditos de autoria: destaca quando a ideia veio de um Deputado e foi enviada pelo Presidente
function creditosProposta(p) {
  const autor = p?.autor || "alguém";
  if (p?.status === "sugestao") return `Ideia de ${autor}`;
  if (p?.aprovado_por && p?.autor && p.aprovado_por !== p.autor) {
    return `Ideia de ${autor} · Enviada à Câmara por ${p.aprovado_por}`;
  }
  return `Proposta por ${autor}`;
}

// Mostra como cada Deputado votou SOMENTE após a votação na Câmara encerrar
function htmlVotosNominais(p) {
  if (!p || p.status === "camara" || p.status === "sugestao") return "";
  const lista = Array.isArray(p.votos_nominais) ? p.votos_nominais : [];
  if (!lista.length) return "";
  return `
    <div class="votos-nominais">
      <span class="rotulo-votos">Votos na Câmara:</span>
      ${lista.map(v => `
        <span class="chip-voto ${v.voto ? "sim" : "nao"}">
          ${esc(v.nome)}: <b>${v.voto ? "Sim" : "Não"}</b>
        </span>`).join("")}
    </div>`;
}

// Cartão de uma lei revogada (com o texto completo e a categoria visíveis para consulta)
function htmlLeiRevogada(l, formatarData = (d) => d) {
  const cat = infoCategoriaLei(l?.categoria);
  return `
    <div class="lei-revogada-item">
      <div class="proposta-topo">
        <strong>Lei nº ${l.numero}: ${esc(l.titulo)}</strong>
        <span class="selo-categoria ${cat.classe}">${esc(cat.curto)}</span>
      </div>
      <p class="lei-texto">${esc(l.texto)}</p>
      <small>Revogada em ${formatarData(l.revogada_em)}</small>
    </div>`;
}

// Linha do tempo padrão do Mural Político (1º Mandato de Pedro via WhatsApp + 2º Mandato atual)
function mandatosPadrao(polAtual = {}) {
  const depsAtuais = Array.isArray(polAtual?.deputados)
    ? polAtual.deputados.filter(d => d && d.nome)
    : [];
  return [
    {
      numero: 2,
      titulo: "2º Mandato · 1ª Legislatura Oficial",
      metodo_eleicao: "Eleição Oficial · Urnas",
      presidente_nome: polAtual?.presidente_nome || "Pedro Henrique Galli",
      presidente_partido: polAtual?.presidente_partido || "PC · Partido Cuiudo",
      presidente_foto: polAtual?.presidente_foto || null,
      deputados: depsAtuais,
      inicio: polAtual?.mandato_desde || "2026-10-25",
      fim: null,
      historia: "Mandato organizado com eleições oficiais, criação da Câmara de 4 Deputados e Código de Leis com o Superior Tribunal Katequista (STK).",
      atual: true,
    },
    {
      numero: 1,
      titulo: "1º Mandato · Fundação",
      metodo_eleicao: "Enquete no WhatsApp",
      presidente_nome: "Pedro Henrique Galli",
      presidente_partido: "PC · Partido Cuiudo",
      presidente_foto: null,
      deputados: [],
      inicio: "2026-04-25",
      fim: "2026-10-25",
      historia: "Primeiro mandato presidencial da história da Katequese, escolhido por enquete no grupo do WhatsApp antes da criação da Câmara de Deputados e das eleições oficiais.",
      atual: false,
    },
  ];
}

function formatarPeriodoMandato(m) {
  const fmt = (iso) => {
    if (!iso) return "";
    const d = lerData(String(iso).slice(0, 10));
    return isNaN(d) ? String(iso) : d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  };
  if (m?.inicio && m?.fim) return `${fmt(m.inicio)} — ${fmt(m.fim)}`;
  if (m?.inicio && m?.atual) return `Desde ${fmt(m.inicio)}`;
  if (m?.inicio) return fmt(m.inicio);
  return m?.atual ? "Mandato atual" : "Histórico";
}

function htmlCartaoMandato(m, fotosMap = {}, indice = 0) {
  const deps = (Array.isArray(m?.deputados) ? m.deputados : []).filter(d => d && d.nome);
  const periodo = formatarPeriodoMandato(m);
  const fotoPres = m?.presidente_foto ? fotosMap[m.presidente_foto] : null;
  const titulo = m?.titulo || `${m?.numero || 1}º Mandato`;

  return `
    <article class="caixa mandato-card ${m?.atual ? "mandato-atual" : ""} pol-animar" style="--i: ${Math.min(indice, 8)}">
      <div class="proposta-topo">
        <div class="proposta-tags">
          <span class="lei-numero">${esc(titulo)}</span>
          ${m?.metodo_eleicao ? `<span class="selo-categoria ${m.numero === 1 ? "cat-constitucional" : "cat-decreto"}">${esc(m.metodo_eleicao)}</span>` : ""}
        </div>
        <span class="selo-status ${m?.atual ? "selo-ativo" : ""}">${m?.atual ? "Em exercício · " : ""}${esc(periodo)}</span>
      </div>

      <div class="mandato-presidente">
        ${htmlAvatar({ nome: m?.presidente_nome || "?" }, fotoPres)}
        <div>
          <span class="cargo">Presidente</span>
          <strong>${esc(m?.presidente_nome || "—")}</strong>
          ${m?.presidente_partido ? `<small>${esc(m.presidente_partido)}</small>` : ""}
        </div>
      </div>

      ${m?.historia ? `<p class="mandato-historia">${esc(m.historia)}</p>` : ""}

      <div class="mandato-camara">
        <span class="rotulo-votos">Câmara de Deputados neste mandato:</span>
        ${deps.length ? `
          <div class="mandato-deputados">
            ${deps.map(d => `
              <div class="mandato-dep-chip">
                ${htmlAvatar({ nome: d.nome }, d.foto ? fotosMap[d.foto] : null, "pequena")}
                <div>
                  <strong>${esc(d.nome)}</strong>
                  ${d.partido ? `<small>${esc(d.partido)}</small>` : `<small>Deputado</small>`}
                </div>
              </div>`).join("")}
          </div>` : `
          <div class="mandato-sem-camara">
            Mandato Presidencialista · Sem Câmara de Deputados (anterior à criação da Câmara)
          </div>`}
      </div>
    </article>`;
}

async function iniciarLeis(eu) {
  const $ = (id) => document.getElementById(id);
  const { souPresidente, souDeputado, souAdmin, podeGerir } = permissoesPolitica(eu);
  const POR_PAGINA_HISTORICO = 10;

  const btnCamara = document.querySelector('#pol-abas [data-aba="camara"]');
  const btnGestao = document.querySelector('#pol-abas [data-aba="gestao"]');
  const btnAdmin = document.querySelector('#pol-abas [data-aba="admin"]');

  if (eu.katequista && btnCamara) btnCamara.hidden = false;
  if (podeGerir && btnGestao) {
    btnGestao.hidden = false;
    btnGestao.textContent = souPresidente ? "Gestão · Presidente" : "Ideias · Deputado";
  }
  if (souAdmin && btnAdmin) btnAdmin.hidden = false;

  let leis = [];
  let propostas = [];
  let mandatos = [];
  let fotosMandatos = {};
  let filtroCategoria = "todas";
  let buscaLei = "";
  let paginaHistorico = 1;
  let relogio = null;

  const quando = (t) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // "2 h 05 min", "12 min 30 s" até uma data
  function falta(ate) {
    const s = Math.max(0, Math.round((new Date(ate) - Date.now()) / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d) return `${d} d ${h} h`;
    if (h) return `${h} h ${String(m).padStart(2, "0")} min`;
    return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  }

  // Opções de prazo e de categoria
  const PRAZOS = [[1, "1 hora"], [6, "6 horas"], [12, "12 horas"], [24, "1 dia"], [48, "2 dias"], [72, "3 dias"], [168, "7 dias"]];
  const htmlPrazo = (id, padrao = 24) =>
    `<select id="${id}">${PRAZOS.map(([h, t]) => `<option value="${h}" ${h === padrao ? "selected" : ""}>${t}</option>`).join("")}</select>`;

  const htmlSelectCategoria = (id, padrao = "geral") =>
    `<select id="${id}">${CATEGORIAS_LEI.map(c => `<option value="${c.id}" ${c.id === padrao ? "selected" : ""}>${c.sigla} — ${c.nome}</option>`).join("")}</select>`;

  function atualizarContadoresAbas() {
    const ativas = leis.filter(l => l.ativa).length;
    const revogadas = leis.length - ativas;
    const emVotacao = propostas.filter(p => p.status === "camara" || p.status === "empate" || p.status === "popular").length;
    const sugestoes = propostas.filter(p => p.status === "sugestao").length;

    if (btnCamara) btnCamara.textContent = emVotacao ? `Câmara (${emVotacao})` : "Câmara";
    if (btnGestao && podeGerir) {
      const base = souPresidente ? "Gestão · Presidente" : "Ideias · Deputado";
      btnGestao.textContent = souPresidente && sugestoes ? `${base} (${sugestoes})` : base;
    }

    if ($("resumo-pol-leis")) {
      $("resumo-pol-leis").textContent = `${ativas} ${ativas === 1 ? "lei" : "leis"}`;
      $("resumo-pol-revogadas").textContent = revogadas ? `${revogadas} revogada(s) no histórico` : "Todas ativas";
    }
    if ($("resumo-pol-atividade")) {
      if (emVotacao > 0) {
        $("resumo-pol-atividade").textContent = `${emVotacao} em votação`;
        $("resumo-pol-detalhe").textContent = "Plenário da Câmara aberto";
      } else if (sugestoes > 0) {
        $("resumo-pol-atividade").textContent = `${sugestoes} ${sugestoes === 1 ? "ideia" : "ideias"}`;
        $("resumo-pol-detalhe").textContent = "Na mesa do Presidente";
      } else {
        $("resumo-pol-atividade").textContent = "Sem pendências";
        $("resumo-pol-detalhe").textContent = "Câmara em dia";
      }
    }
  }

  async function carregar() {
    const [{ data: l, error }, p, { data: polRow }, { data: mRows }] = await Promise.all([
      sb.from("leis").select("*").order("numero"),
      eu.katequista ? sb.rpc("propostas_situacao") : Promise.resolve({ data: [] }),
      sb.from("politica").select("*").eq("id", 1).maybeSingle(),
      sb.from("politica_mandatos").select("*").order("numero", { ascending: false }),
    ]);
    const listaMandatos = (mRows && mRows.length) ? mRows : mandatosPadrao(polRow || {});
    if (polRow) {
      listaMandatos.forEach(m => {
        if (m.atual) {
          m.presidente_nome = polRow.presidente_nome || m.presidente_nome;
          m.presidente_partido = polRow.presidente_partido || m.presidente_partido;
          m.presidente_foto = polRow.presidente_foto || m.presidente_foto;
          const depsVivos = (polRow.deputados || []).filter(d => d && d.nome);
          if (depsVivos.length) m.deputados = depsVivos;
          if (polRow.mandato_desde) m.inicio = polRow.mandato_desde;
        }
      });
    }
    mandatos = [...listaMandatos].sort((a, b) => (b.numero || 0) - (a.numero || 0));
    const caminhosFotos = mandatos.flatMap(m => [m.presidente_foto, ...(m.deputados || []).map(d => d?.foto)]).filter(Boolean);
    fotosMandatos = await linksDosArquivos(caminhosFotos);

    if (error) {
      ["aba-vigor", "aba-camara", "aba-gestao", "aba-admin"].forEach(id => {
        if ($(id)) $(id).innerHTML = '<p class="vazio">Falta atualizar o banco: o admin precisa rodar o <b>supabase-17.sql</b> e o <b>supabase-20.sql</b>.</p>';
      });
      if ($("aba-mandatos")) desenharMandatos();
      return false;
    }
    leis = l || [];
    propostas = p.data || [];
    atualizarContadoresAbas();
    return true;
  }

  // ---------------- Sub-abas ----------------
  let abaAtual = "governo";
  let leisProntas = false;
  function abrirAba(nome) {
    const botao = document.querySelector(`#pol-abas [data-aba="${nome}"]`);
    if (!botao || botao.hidden) nome = "governo";
    abaAtual = nome;
    document.querySelectorAll("#pol-abas button").forEach(b => b.classList.toggle("ativa", b.dataset.aba === nome));
    document.querySelectorAll(".pol-secao").forEach(s => s.hidden = s.id !== "aba-" + nome);
    history.replaceState(null, "", nome === "governo" ? location.pathname : "#" + nome);
    if (nome !== "governo" && leisProntas) desenhar();
  }
  $("pol-abas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-aba]");
    if (b) abrirAba(b.dataset.aba);
  });
  window.addEventListener("hashchange", () => {
    const alvo = location.hash.slice(1) || "governo";
    if (alvo !== abaAtual) abrirAba(alvo);
  });

  function desenhar() {
    clearInterval(relogio);
    if (abaAtual === "mandatos") desenharMandatos();
    else if (abaAtual === "vigor") desenharVigor();
    else if (abaAtual === "camara") desenharCamara();
    else if (abaAtual === "gestao") desenharGestao();
    else if (abaAtual === "admin") desenharAdmin();
  }

  // ---------------- Mural Político (Galeria de Mandatos) ----------------
  function desenharMandatos() {
    const el = $("aba-mandatos");
    if (!el) return;
    const lista = mandatos.length ? mandatos : mandatosPadrao({});
    el.innerHTML = `
      <div class="caixa papel-aviso presidente pol-animar" style="--i: 0">
        <span class="rotulo-papel">Memória Histórica da Katequese</span>
        <p>Todos os mandatos presidenciais e legislaturas da Katequese ficam eternizados neste mural — desde o <b>1º Mandato de Pedro</b> (escolhido por enquete no WhatsApp) até os governos eleitos com Câmara de Deputados.</p>
      </div>
      <div class="trilha-mandatos">
        ${lista.map((m, i) => htmlCartaoMandato(m, fotosMandatos, i + 1)).join("")}
      </div>`;
  }

  // ---------------- Leis em vigor (organizadas por Hierarquia + Busca) ----------------
  function desenharVigor() {
    const todasAtivas = ordenarLeisPorHierarquia(leis.filter(l => l.ativa));
    const revogadas = leis.filter(l => !l.ativa);
    const termo = buscaLei.trim().toLowerCase();
    const ativas = termo
      ? todasAtivas.filter(l =>
          String(l.numero).includes(termo) ||
          (l.titulo || "").toLowerCase().includes(termo) ||
          (l.texto || "").toLowerCase().includes(termo)
        )
      : todasAtivas;

    const barraTopo = todasAtivas.length ? `
      <div class="barra-vigor pol-animar" style="--i: 0">
        <div class="filtros-leis" role="tablist" aria-label="Filtrar por hierarquia de lei">
          <button type="button" class="pilula-filtro ${filtroCategoria === "todas" ? "ativa" : ""}" data-filtro-cat="todas">
            Todas (${todasAtivas.length})
          </button>
          ${CATEGORIAS_LEI.map(c => {
            const qtd = todasAtivas.filter(l => infoCategoriaLei(l.categoria).id === c.id).length;
            return `
              <button type="button" class="pilula-filtro ${c.classe} ${filtroCategoria === c.id ? "ativa" : ""}" data-filtro-cat="${c.id}">
                ${esc(c.curto)} (${qtd})
              </button>`;
          }).join("")}
        </div>
        <input type="search" id="busca-leis" class="campo-busca-lei" placeholder="Buscar lei por nº, título ou texto..." value="${esc(buscaLei)}">
      </div>` : "";

    let conteudoAtivas = '<p class="vazio">Nenhuma lei aprovada ainda.</p>';
    if (todasAtivas.length) {
      const categoriasVisiveis = filtroCategoria === "todas"
        ? CATEGORIAS_LEI
        : CATEGORIAS_LEI.filter(c => c.id === filtroCategoria);

      let idxGlobal = 1;
      const blocos = categoriasVisiveis.map(cat => {
        const leisDaCat = ativas.filter(l => infoCategoriaLei(l.categoria).id === cat.id);
        if (!leisDaCat.length) {
          return filtroCategoria === "todas" ? "" : `<p class="vazio">Nenhuma lei ativa em <b>${esc(cat.nome)}</b>${termo ? " para essa busca" : ""}.</p>`;
        }
        return `
          <section class="bloco-hierarquia ${cat.classe} pol-animar" style="--i: ${Math.min(idxGlobal++, 6)}">
            <header class="cabecalho-hierarquia">
              <div>
                <span class="selo-categoria ${cat.classe}">${esc(cat.sigla)}</span>
                <h2 class="titulo-hierarquia">${esc(cat.nome)}</h2>
                <p class="resumo-hierarquia">${esc(cat.resumo)}</p>
              </div>
              <span class="contagem-hierarquia">${leisDaCat.length} ${leisDaCat.length === 1 ? "lei" : "leis"}</span>
            </header>
            ${leisDaCat.map((l, i) => htmlCartaoLei(l, quando, i + 1)).join("")}
          </section>`;
      }).filter(Boolean).join("");

      conteudoAtivas = blocos || '<p class="vazio">Nenhuma lei encontrada para essa pesquisa.</p>';
    }

    $("aba-vigor").innerHTML = `
      ${barraTopo}
      <div id="lista-vigor-blocos">${conteudoAtivas}</div>
      ${revogadas.length ? `
        <details class="caixa revogadas" style="margin-top: 18px">
          <summary>Histórico de leis revogadas (${revogadas.length})</summary>
          <div class="lista-revogadas">
            ${revogadas.map(l => htmlLeiRevogada(l, quando)).join("")}
          </div>
        </details>` : ""}`;

    const inputBusca = $("busca-leis");
    if (inputBusca && document.activeElement?.id === "busca-leis") {
      inputBusca.focus();
      inputBusca.setSelectionRange(inputBusca.value.length, inputBusca.value.length);
    }
  }

  $("aba-vigor").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filtro-cat]");
    if (!btn) return;
    filtroCategoria = btn.dataset.filtroCat;
    desenharVigor();
  });

  $("aba-vigor").addEventListener("input", (e) => {
    if (e.target.id !== "busca-leis") return;
    buscaLei = e.target.value;
    desenharVigor();
    const el = $("busca-leis");
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  // ---------------- Câmara: votações e sugestões ----------------
  const NOMES_STATUS = {
    sugestao: "Na mesa do Presidente",
    camara: "Na Câmara",
    empate: "Empate (2 a 2)",
    popular: "Voto popular",
    aprovada: "Aprovada",
    rejeitada: "Rejeitada",
    cancelada: "Arquivada",
  };
  function tituloTipo(p) {
    if (p.tipo === "criar") return p.status === "sugestao" ? "Ideia de nova lei" : "Nova lei";
    return `${p.tipo === "alterar" ? "Alterar" : "Revogar"} a Lei nº ${p.lei_numero ?? "?"}`;
  }
  function botoesVoto(tipo, p, meu) {
    return `
      <div class="voto-botoes">
        <button class="botao-pequeno ${meu === true ? "votado" : ""}" data-votar="${tipo}" data-id="${p.id}" data-voto="true">Votar Sim</button>
        <button class="botao-pequeno ${meu === false ? "votado" : ""}" data-votar="${tipo}" data-id="${p.id}" data-voto="false">Votar Não</button>
        ${meu !== null && meu !== undefined ? `<small>Seu voto: <b>${meu ? "Sim" : "Não"}</b> (dá para mudar até encerrar)</small>` : ""}
      </div>`;
  }

  function htmlProposta(p, indice = 0) {
    const cat = infoCategoriaLei(p.categoria);
    let etapa = "";
    if (p.status === "sugestao") {
      etapa = souPresidente ? `
        <div class="voto-botoes">
          <label class="campo-inline">Prazo na Câmara ${htmlPrazo("prazo-sug-" + p.id, 24)}</label>
          <button class="botao-pequeno votado" data-aprovar-sugestao="${p.id}">Aprovar e enviar à Câmara</button>
          <button class="botao-pequeno perigo" data-arquivar="${p.id}">Recusar ideia</button>
        </div>` : `<p class="eco-dica">Ideia enviada ao Presidente. Se o Presidente aprovar, entra em votação na Câmara.</p>`;
    } else if (p.status === "camara") {
      etapa = `
        ${htmlPlacarProposta(p)}
        <p class="etapa">Prazo restante na Câmara: <b data-ate="${p.fim_camara}">${falta(p.fim_camara)}</b></p>
        ${souDeputado ? botoesVoto("camara", p, p.meu_voto_camara) : '<p class="eco-dica">Votação secreta: só os 4 deputados votam. O resultado e os votos aparecem quando encerrar.</p>'}`;
    } else if (p.status === "empate") {
      etapa = `
        ${htmlPlacarProposta(p)}
        <p class="etapa">${esc(p.resultado)}</p>
        ${htmlVotosNominais(p)}
        ${souPresidente ? `
          <div class="voto-botoes">
            <label class="campo-inline">Prazo ${htmlPrazo("prazo-pop-" + p.id, 24)}</label>
            <button class="botao-pequeno votado" data-popular="${p.id}">Levar ao voto popular (Katequistas)</button>
          </div>` : '<p class="eco-dica">Empate na Câmara: o Presidente decide se leva ao voto popular dos Katequistas ou se arquiva.</p>'}`;
    } else if (p.status === "popular") {
      etapa = `
        ${htmlPlacarProposta(p)}
        <p class="etapa">${esc(p.resultado)}</p>
        ${htmlVotosNominais(p)}
        <p class="etapa">Voto popular (Katequistas): <b>${p.votaram_popular}</b> ${p.votaram_popular === 1 ? "voto" : "votos"} · encerra em <b data-ate="${p.fim_popular}">${falta(p.fim_popular)}</b></p>
        ${botoesVoto("popular", p, p.meu_voto_popular)}`;
    } else {
      etapa = `
        ${htmlPlacarProposta(p)}
        <p class="etapa">${esc(p.resultado)}</p>
        ${htmlVotosNominais(p)}`;
    }

    const mostrarBotaoArquivar = podeArquivarProposta(p, eu, false) && !(p.status === "sugestao" && souPresidente);
    const rotuloArquivar = p.status === "sugestao" ? "Retirar minha ideia" : "Arquivar proposta";
    const htmlAnterior = p.texto_anterior ? `
      <details class="propostas">
        <summary>Ver texto anterior da lei</summary>
        <p class="lei-texto" style="margin-top: 8px">${esc(p.texto_anterior)}</p>
      </details>` : "";

    return `
      <article class="caixa proposta ${p.status} pol-animar" style="--i: ${Math.min(indice, 8)}">
        <div class="proposta-topo">
          <div class="proposta-tags">
            <span class="lei-numero">${tituloTipo(p)}</span>
            <span class="selo-categoria ${cat.classe}">${esc(cat.sigla)}</span>
          </div>
          <span class="selo-status">${NOMES_STATUS[p.status] || esc(p.status)}</span>
        </div>
        ${htmlTrilhaProposta(p)}
        <h3>${esc(p.titulo)}</h3>
        ${p.tipo !== "revogar" ? `<div class="lei-corpo"><p class="lei-texto">${esc(p.texto)}</p></div>` : ""}
        ${htmlAnterior}
        ${p.justificativa ? `<p class="justificativa"><b>Justificativa:</b> ${esc(p.justificativa)}</p>` : ""}
        <small>${esc(creditosProposta(p))} · ${quando(p.criada_em)}</small>
        ${etapa}
        ${mostrarBotaoArquivar ? `<button class="botao-link perigo" data-arquivar="${p.id}">${rotuloArquivar}</button>` : ""}
      </article>`;
  }

  function desenharCamara() {
    const abertas = propostas.filter(p => p.aberta);
    const fechadas = propostas.filter(p => !p.aberta);
    const pag = calcularPaginacao(paginaHistorico, fechadas.length, POR_PAGINA_HISTORICO);
    paginaHistorico = pag.pagina;
    const fatiaFechadas = fechadas.slice(pag.inicio, pag.fim + 1);

    const resumoPapelCamara = souDeputado
      ? `<div class="caixa papel-aviso deputado pol-animar" style="--i: 0"><span class="rotulo-papel">Seu papel na Câmara: Deputado</span><p>Você vota <b>Sim</b> ou <b>Não</b> nas propostas que estão na Câmara. Para sugerir uma ideia de lei ao Presidente, use a aba <b>Ideias · Deputado</b>.</p></div>`
      : souPresidente
        ? `<div class="caixa papel-aviso presidente pol-animar" style="--i: 0"><span class="rotulo-papel">Seu papel na Câmara: Presidente</span><p>Os 4 Deputados votam nas propostas na Câmara. Você aprova a ida de ideias à Câmara e decide empates (2 a 2).</p></div>`
        : "";

    $("aba-camara").innerHTML = `
      ${resumoPapelCamara}
      <h2 class="titulo-secao">Em andamento (${abertas.length})</h2>
      ${abertas.length ? abertas.map((p, i) => htmlProposta(p, i + 1)).join("") : '<p class="aviso">Nenhuma votação ou ideia aberta no momento.</p>'}
      <h2 class="titulo-secao">Histórico (${fechadas.length})</h2>
      ${fatiaFechadas.length
        ? fatiaFechadas.map((p, i) => htmlProposta(p, i + 2)).join("") + htmlPaginacao({
            pagina: paginaHistorico,
            total: fechadas.length,
            porPagina: POR_PAGINA_HISTORICO,
            rotulo: fechadas.length === 1 ? "proposta" : "propostas",
          })
        : '<p class="aviso">Nada por aqui ainda.</p>'}`;

    // Contagens regressivas; quando uma acaba, recarrega (o banco apura)
    relogio = setInterval(async () => {
      if (document.hidden) return;
      let acabou = false;
      document.querySelectorAll("#aba-camara [data-ate]").forEach(el => {
        if (new Date(el.dataset.ate) <= new Date()) acabou = true;
        el.textContent = falta(el.dataset.ate);
      });
      if (acabou) { clearInterval(relogio); await carregar(); desenhar(); }
    }, 1000);
  }

  $("aba-camara").addEventListener("click", async (e) => {
    const pag = e.target.closest("[data-pagina]");
    if (pag && !pag.disabled) {
      paginaHistorico = Number(pag.dataset.pagina);
      desenharCamara();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const votar = e.target.closest("[data-votar]");
    const popular = e.target.closest("[data-popular]");
    const arquivar = e.target.closest("[data-arquivar]");
    const aprovarSug = e.target.closest("[data-aprovar-sugestao]");
    let erro = null;

    if (votar) {
      const funcao = votar.dataset.votar === "camara" ? "votar_camara" : "votar_popular";
      ({ error: erro } = await sb.rpc(funcao, { pid: Number(votar.dataset.id), voto: votar.dataset.voto === "true" }));
    } else if (aprovarSug) {
      const pid = Number(aprovarSug.dataset.aprovarSugestao);
      const horas = Number($("prazo-sug-" + pid)?.value || 24);
      if (!(await confirmar("Aprovar esta ideia e abrir votação na Câmara dos Deputados?", "Enviar à Câmara"))) return;
      ({ error: erro } = await sb.rpc("avaliar_sugestao", { pid, aprovar: true, horas }));
    } else if (popular) {
      const horas = Number($("prazo-pop-" + popular.dataset.popular).value);
      if (!(await confirmar("Levar esta proposta empatada ao voto popular? Todos os Katequistas poderão votar.", "Levar"))) return;
      ({ error: erro } = await sb.rpc("levar_ao_voto_popular", { pid: Number(popular.dataset.popular), horas }));
    } else if (arquivar) {
      const pid = Number(arquivar.dataset.arquivar);
      const alvo = propostas.find(x => x.id === pid);
      const msg = alvo?.status === "sugestao"
        ? (souPresidente ? "Recusar esta ideia de lei? Ela será arquivada sem abrir votação na Câmara." : "Retirar sua ideia de lei?")
        : "Arquivar esta proposta? A votação acaba e nada muda nas leis.";
      if (!(await confirmar(msg, "Confirmar"))) return;
      ({ error: erro } = await sb.rpc("arquivar_proposta", { pid }));
    } else return;

    if (erro) avisarJanela(erro.message);
    await carregar();
    desenhar();
  });

  // ---------------- Gestão Política (estritamente Presidente ou Deputado) ----------------
  function desenharGestao() {
    const ativas = ordenarLeisPorHierarquia(leis.filter(l => l.ativa));
    const sugestoes = propostas.filter(p => p.status === "sugestao");
    const minhasSugestoes = sugestoes.filter(p => p.autor_id === eu.id);

    const bannerPapel = souPresidente ? `
      <div class="caixa papel-aviso presidente pol-animar" style="margin-bottom: 16px; --i: 0">
        <span class="rotulo-papel">Atuando como: Presidente</span>
        <p>Você pode <b>avaliar as ideias enviadas pelos Deputados</b> (aprovando para irem à Câmara ou recusando) e também <b>propor leis direto para a Câmara</b>.</p>
      </div>` : `
      <div class="caixa papel-aviso deputado pol-animar" style="margin-bottom: 16px; --i: 0">
        <span class="rotulo-papel">Atuando como: Deputado</span>
        <p>Como Deputado, aqui você <b>cria ideias de leis</b> (escolhendo o escalão, como <b>Superior Tribunal Katequista — STK</b> ou <b>Lei Geral</b>) e envia para a mesa do <b>Presidente</b>.${souAdmin ? ' <small>(Suas ferramentas de Admin do site ficam separadas na aba <b>Admin</b>.)</small>' : ""}</p>
      </div>`;

    const caixaSugestoesPresidente = souPresidente && sugestoes.length ? `
      <div class="caixa pol-animar" style="margin-bottom: 16px; --i: 1" id="caixa-sugestoes">
        <h2>Ideias dos Deputados aguardando sua avaliação (${sugestoes.length})</h2>
        <p class="eco-dica">Aprove para abrir votação na Câmara, revise o texto/escalão no formulário antes de enviar ou recuse.</p>
        <div class="lista-sugestoes">
          ${sugestoes.map(s => {
            const cat = infoCategoriaLei(s.categoria);
            return `
              <article class="sugestao-item">
                <div class="proposta-topo">
                  <div class="proposta-tags">
                    <span class="lei-numero">${tituloTipo(s)} · por ${esc(s.autor || "Deputado")}</span>
                    <span class="selo-categoria ${cat.classe}">${esc(cat.sigla)}</span>
                  </div>
                  <small>${quando(s.criada_em)}</small>
                </div>
                <strong>${esc(s.titulo)}</strong>
                ${s.tipo !== "revogar" ? `<p class="lei-texto">${esc(s.texto)}</p>` : ""}
                ${s.justificativa ? `<p class="justificativa"><b>Justificativa:</b> ${esc(s.justificativa)}</p>` : ""}
                <div class="voto-botoes">
                  <label class="campo-inline">Prazo ${htmlPrazo("gestao-prazo-sug-" + s.id, 24)}</label>
                  <button class="botao-pequeno votado" type="button" data-gestao-aprovar="${s.id}">Aprovar e enviar à Câmara</button>
                  ${s.tipo !== "revogar" ? `<button class="botao-pequeno" type="button" data-gestao-revisar="${s.id}">Revisar texto no formulário</button>` : ""}
                  <button class="botao-pequeno perigo" type="button" data-gestao-recusar="${s.id}">Recusar</button>
                </div>
              </article>`;
          }).join("")}
        </div>
      </div>` : "";

    const caixaMinhasSugestoesDeputado = !souPresidente && minhasSugestoes.length ? `
      <div class="caixa pol-animar" style="margin-bottom: 16px; --i: 1" id="caixa-minhas-sugestoes">
        <h2>Minhas ideias na mesa do Presidente (${minhasSugestoes.length})</h2>
        <div class="lista-sugestoes">
          ${minhasSugestoes.map(s => {
            const cat = infoCategoriaLei(s.categoria);
            return `
              <article class="sugestao-item">
                <div class="proposta-topo">
                  <div class="proposta-tags">
                    <span class="lei-numero">${tituloTipo(s)}</span>
                    <span class="selo-categoria ${cat.classe}">${esc(cat.sigla)}</span>
                  </div>
                  <span class="selo-status">Aguardando Presidente</span>
                </div>
                <strong>${esc(s.titulo)}</strong>
                ${s.tipo !== "revogar" ? `<p class="lei-texto">${esc(s.texto)}</p>` : ""}
                <button class="botao-link perigo" type="button" data-retirar-minha="${s.id}">Retirar ideia</button>
              </article>`;
          }).join("")}
        </div>
      </div>` : "";

    const tituloInicial = souPresidente ? "Propor nova lei (Presidente)" : "Criar ideia de nova lei (Deputado)";
    const textoBotaoInicial = souPresidente ? "Enviar para a Câmara" : "Enviar ideia para o Presidente";
    const dicaInicial = souPresidente
      ? "A votação acaba no prazo ou quando os 4 deputados votarem. Mais 'sim' aprova; mais 'não' rejeita; empate (2 a 2) você decide se vai para o voto popular dos Katequistas."
      : "Sua ideia ficará com o status 'Na mesa do Presidente'. Assim que o Presidente aprovar, ela entra em votação na Câmara com seu nome nos créditos.";

    $("aba-gestao").innerHTML = `
      ${bannerPapel}
      ${caixaSugestoesPresidente}
      ${caixaMinhasSugestoesDeputado}
      <form class="caixa eco-form pol-animar" id="form-lei" style="--i: 2">
        <h2 id="lei-form-titulo">${tituloInicial}</h2>
        <input type="hidden" id="lei-tipo" value="criar">
        <input type="hidden" id="lei-id" value="">
        <input type="hidden" id="lei-sugestao-id" value="">
        <label class="campo">
          <span>Hierarquia / Tipo da Lei</span>
          ${htmlSelectCategoria("lei-categoria", "geral")}
        </label>
        <label class="campo"><span>Título</span><input id="lei-titulo" maxlength="120" required></label>
        <label class="campo"><span>Texto da lei</span><textarea id="lei-texto" rows="6" maxlength="5000" required></textarea></label>
        <label class="campo"><span>Justificativa (opcional)</span><textarea id="lei-justificativa" rows="2" maxlength="1000"></textarea></label>
        <label class="campo" id="campo-lei-prazo" style="max-width: 260px" ${souPresidente ? "" : "hidden"}>
          <span>Prazo da votação na Câmara</span>${htmlPrazo("lei-prazo", 24)}
        </label>
        <p class="eco-dica" id="lei-dica">${dicaInicial}</p>
        <div class="mj-botoes" style="justify-content: flex-start">
          <button class="botao" type="submit" id="lei-enviar">${textoBotaoInicial}</button>
          <button class="botao-pequeno" type="button" id="lei-cancelar" hidden>Cancelar</button>
        </div>
      </form>

      <div class="caixa pol-animar" style="margin-top: 16px; --i: 3" id="caixa-leis-ativas">
        <h2>Leis em vigor (${souPresidente ? "propor alteração ou revogação" : "sugerir alteração ou revogação ao Presidente"})</h2>
        ${ativas.length ? `<ul class="extrato">${ativas.map(l => {
          const cat = infoCategoriaLei(l.categoria);
          return `
            <li>
              <span class="extrato-desc">
                <span class="selo-categoria ${cat.classe}" style="margin-right: 6px">${esc(cat.curto)}</span>
                Lei nº ${l.numero}: ${esc(l.titulo)}
              </span>
              <span class="recado-acoes" style="margin: 0">
                <button class="botao-link" data-alterar="${l.id}">${souPresidente ? "Propor alteração" : "Sugerir alteração"}</button>
                <button class="botao-link perigo" data-revogar="${l.id}">${souPresidente ? "Propor revogação" : "Sugerir revogação"}</button>
              </span>
            </li>`;
        }).join("")}</ul>` : '<p class="aviso" style="margin: 0">Nenhuma lei em vigor.</p>'}
      </div>`;

    const form = $("form-lei");
    const modo = (tipo, lei = null, sugestao = null) => {
      $("lei-tipo").value = tipo;
      $("lei-id").value = lei ? lei.id : "";
      $("lei-sugestao-id").value = sugestao ? sugestao.id : "";
      $("lei-categoria").value = infoCategoriaLei(sugestao?.categoria || lei?.categoria || "geral").id;
      $("lei-titulo").value = sugestao ? sugestao.titulo : (lei ? lei.titulo : "");
      $("lei-texto").value = sugestao ? sugestao.texto : (lei ? lei.texto : "");
      $("lei-justificativa").value = sugestao ? (sugestao.justificativa || "") : "";
      const revogar = tipo === "revogar";
      $("lei-categoria").disabled = revogar;
      $("lei-titulo").disabled = revogar;
      $("lei-texto").disabled = revogar;

      if (sugestao) {
        $("lei-form-titulo").textContent = `Revisar ideia de ${sugestao.autor || "Deputado"} e enviar à Câmara`;
        $("lei-enviar").textContent = "Aprovar e enviar para a Câmara";
      } else if (tipo === "criar") {
        $("lei-form-titulo").textContent = tituloInicial;
        $("lei-enviar").textContent = textoBotaoInicial;
      } else {
        const verbo = souPresidente ? "Propor" : "Sugerir";
        $("lei-form-titulo").textContent = `${verbo} ${revogar ? "revogação da" : "alteração da"} Lei nº ${lei.numero}`;
        $("lei-enviar").textContent = souPresidente
          ? (revogar ? "Enviar revogação para a Câmara" : "Enviar para a Câmara")
          : (revogar ? "Enviar ideia de revogação ao Presidente" : "Enviar ideia ao Presidente");
      }

      $("lei-cancelar").hidden = tipo === "criar" && !sugestao;
      if (tipo !== "criar" || sugestao) form.scrollIntoView({ behavior: "smooth" });
    };

    $("lei-cancelar").addEventListener("click", () => modo("criar"));

    $("caixa-leis-ativas").addEventListener("click", (e) => {
      const alterar = e.target.closest("[data-alterar]");
      const revogar = e.target.closest("[data-revogar]");
      if (alterar) modo("alterar", leis.find(l => l.id === Number(alterar.dataset.alterar)));
      if (revogar) modo("revogar", leis.find(l => l.id === Number(revogar.dataset.revogar)));
    });

    const caixaMinhas = $("caixa-minhas-sugestoes");
    if (caixaMinhas) {
      caixaMinhas.addEventListener("click", async (e) => {
        const retirar = e.target.closest("[data-retirar-minha]");
        if (!retirar) return;
        if (!(await confirmar("Retirar sua ideia de lei da mesa do Presidente?", "Retirar"))) return;
        const { error } = await sb.rpc("arquivar_proposta", { pid: Number(retirar.dataset.retirarMinha) });
        if (error) return avisarJanela(error.message);
        await carregar();
        desenhar();
      });
    }

    const caixaSug = $("caixa-sugestoes");
    if (caixaSug) {
      caixaSug.addEventListener("click", async (e) => {
        const aprovar = e.target.closest("[data-gestao-aprovar]");
        const revisar = e.target.closest("[data-gestao-revisar]");
        const recusar = e.target.closest("[data-gestao-recusar]");
        if (revisar) {
          const s = sugestoes.find(x => x.id === Number(revisar.dataset.gestaoRevisar));
          if (s) modo(s.tipo, leis.find(l => l.id === s.lei_id) || null, s);
          return;
        }
        if (aprovar) {
          const pid = Number(aprovar.dataset.gestaoAprovar);
          const horas = Number($("gestao-prazo-sug-" + pid)?.value || 24);
          if (!(await confirmar("Aprovar esta ideia e abrir votação na Câmara dos Deputados?", "Enviar à Câmara"))) return;
          const { error } = await sb.rpc("avaliar_sugestao", { pid, aprovar: true, horas });
          if (error) return avisarJanela(error.message);
          await carregar();
          abrirAba("camara");
        } else if (recusar) {
          const pid = Number(recusar.dataset.gestaoRecusar);
          if (!(await confirmar("Recusar esta ideia de lei?", "Recusar"))) return;
          const { error } = await sb.rpc("avaliar_sugestao", { pid, aprovar: false });
          if (error) return avisarJanela(error.message);
          await carregar();
          desenhar();
        }
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const idSugestao = $("lei-sugestao-id").value ? Number($("lei-sugestao-id").value) : null;
      const categoria = $("lei-categoria").value || "geral";
      let error = null;

      if (idSugestao && souPresidente) {
        ({ error } = await sb.rpc("avaliar_sugestao", {
          pid: idSugestao,
          aprovar: true,
          horas: Number($("lei-prazo").value || 24),
          novo_titulo: $("lei-titulo").value.trim() || null,
          novo_texto: $("lei-texto").value.trim() || null,
          nova_justificativa: $("lei-justificativa").value.trim(),
          nova_categoria: categoria,
        }));
      } else {
        const tipo = $("lei-tipo").value;
        ({ error } = await sb.rpc("propor_lei", {
          tipo,
          id_lei: $("lei-id").value ? Number($("lei-id").value) : null,
          titulo: $("lei-titulo").value.trim() || "-",
          texto: $("lei-texto").value.trim() || "-",
          justificativa: $("lei-justificativa").value.trim(),
          horas: Number($("lei-prazo").value || 24),
          como_admin: false,
          categoria,
        }));
      }

      if (error) return avisarJanela(error.message);
      await carregar();
      abrirAba("camara");
    });
  }

  // ---------------- Aba Admin (separada dos cargos de Deputado e Presidente) ----------------
  function desenharAdmin() {
    if (!souAdmin) return;
    const abertas = propostas.filter(p => p.aberta);
    const meuCargoPolitico = souPresidente && souDeputado
      ? "Presidente e Deputado"
      : souPresidente
        ? "Presidente"
        : souDeputado
          ? "Deputado"
          : "Nenhum cargo político";

    $("aba-admin").innerHTML = `
      <div class="caixa papel-aviso admin pol-animar" style="margin-bottom: 16px; --i: 0">
        <span class="rotulo-papel">Painel Admin da Política (Separado do seu cargo político)</span>
        <p>Seu cargo político atual no grupo é <b>${meuCargoPolitico}</b>. Nas abas <b>Câmara</b> e <b>${souPresidente ? "Gestão · Presidente" : "Ideias · Deputado"}</b> você vê apenas o que o seu cargo político permite. Use esta aba <b>somente</b> se precisar intervir como Administrador do site.</p>
        <div class="voto-botoes">
          <a class="botao-pequeno" href="admin.html#sec-politica" style="text-decoration: none">Editar Presidente, Deputados e Eleição →</a>
        </div>
      </div>

      <div class="caixa pol-animar" style="margin-bottom: 16px; --i: 1" id="admin-propostas-abertas">
        <h2>Intervenção de Admin em propostas abertas (${abertas.length})</h2>
        <p class="eco-dica">Destrave ideias caso o grupo esteja sem Presidente ativo, desempate ou cancele propostas problemáticas.</p>
        ${abertas.length ? `<div class="lista-sugestoes">${abertas.map(p => {
          const cat = infoCategoriaLei(p.categoria);
          return `
            <article class="sugestao-item">
              <div class="proposta-topo">
                <div class="proposta-tags">
                  <span class="lei-numero">${tituloTipo(p)} · ${esc(creditosProposta(p))}</span>
                  <span class="selo-categoria ${cat.classe}">${esc(cat.sigla)}</span>
                </div>
                <span class="selo-status">${NOMES_STATUS[p.status] || esc(p.status)}</span>
              </div>
              <strong>${esc(p.titulo)}</strong>
              <div class="voto-botoes">
                ${p.status === "sugestao" ? `
                  <label class="campo-inline">Prazo ${htmlPrazo("adm-prazo-sug-" + p.id, 24)}</label>
                  <button class="botao-pequeno votado" type="button" data-adm-aprovar="${p.id}">Aprovar para a Câmara (Admin)</button>` : ""}
                ${p.status === "empate" ? `
                  <label class="campo-inline">Prazo ${htmlPrazo("adm-prazo-pop-" + p.id, 24)}</label>
                  <button class="botao-pequeno votado" type="button" data-adm-popular="${p.id}">Levar ao voto popular (Admin)</button>` : ""}
                <button class="botao-pequeno perigo" type="button" data-adm-arquivar="${p.id}">Arquivar / Cancelar (Admin)</button>
              </div>
            </article>`;
        }).join("")}</div>` : '<p class="aviso" style="margin: 0">Nenhuma proposta ou ideia aberta no momento.</p>'}
      </div>

      <details class="caixa pol-animar" style="--i: 2; margin-bottom: 16px">
        <summary style="cursor: pointer; font-weight: 700">Gerenciar Mural Político (Registrar / Atualizar Mandato)</summary>
        <form class="eco-form" id="form-mandato-admin" style="margin-top: 14px">
          <p class="eco-dica">Adicione ou edite um mandato histórico no Mural Político (se usar o mesmo número de mandato, ele atualiza o existente).</p>
          <div class="linha-campos">
            <label class="campo"><span>Nº do Mandato</span><input id="adm-man-num" type="number" min="1" step="1" value="${(mandatos[0]?.numero || 2)}" required></label>
            <label class="campo"><span>Título</span><input id="adm-man-titulo" maxlength="80" value="2º Mandato · 1ª Legislatura Oficial" required></label>
            <label class="campo"><span>Como foi eleito</span><input id="adm-man-metodo" maxlength="80" value="Eleição Oficial · Urnas" required></label>
          </div>
          <div class="linha-campos">
            <label class="campo"><span>Início</span><input id="adm-man-inicio" type="date"></label>
            <label class="campo"><span>Fim (vazio = atual)</span><input id="adm-man-fim" type="date"></label>
          </div>
          <label class="campo"><span>História / Resumo do mandato</span><textarea id="adm-man-historia" rows="2" maxlength="600" placeholder="Ex: Primeiro mandato com Câmara de Deputados..."></textarea></label>
          <label class="campo-check"><input id="adm-man-atual" type="checkbox" checked> Este é o mandato atual em exercício (puxa Presidente e Deputados atuais)</label>
          <button class="botao" type="submit">Salvar no Mural Político</button>
        </form>
      </details>

      <details class="caixa pol-animar" style="--i: 3">
        <summary style="cursor: pointer; font-weight: 700">Enviar proposta direto à Câmara como Admin (emergência)</summary>
        <form class="eco-form" id="form-lei-admin" style="margin-top: 14px">
          <p class="eco-dica">Envia uma nova lei direto para votação na Câmara usando poder de Admin (pula a etapa de sugestão).</p>
          <label class="campo"><span>Hierarquia / Tipo da Lei</span>${htmlSelectCategoria("adm-lei-categoria", "geral")}</label>
          <label class="campo"><span>Título</span><input id="adm-lei-titulo" maxlength="120" required></label>
          <label class="campo"><span>Texto da lei</span><textarea id="adm-lei-texto" rows="5" maxlength="5000" required></textarea></label>
          <label class="campo"><span>Justificativa (opcional)</span><textarea id="adm-lei-justificativa" rows="2" maxlength="1000"></textarea></label>
          <label class="campo" style="max-width: 260px"><span>Prazo na Câmara</span>${htmlPrazo("adm-lei-prazo", 24)}</label>
          <button class="botao" type="submit">Enviar direto para a Câmara (Admin)</button>
        </form>
      </details>`;

    $("admin-propostas-abertas").addEventListener("click", async (e) => {
      const aprovar = e.target.closest("[data-adm-aprovar]");
      const popular = e.target.closest("[data-adm-popular]");
      const arquivar = e.target.closest("[data-adm-arquivar]");
      let erro = null;

      if (aprovar) {
        const pid = Number(aprovar.dataset.admAprovar);
        const horas = Number($("adm-prazo-sug-" + pid)?.value || 24);
        if (!(await confirmar("Intervenção de Admin: aprovar esta ideia e abrir votação na Câmara?", "Aprovar (Admin)"))) return;
        ({ error: erro } = await sb.rpc("avaliar_sugestao", { pid, aprovar: true, horas }));
      } else if (popular) {
        const pid = Number(popular.dataset.admPopular);
        const horas = Number($("adm-prazo-pop-" + pid)?.value || 24);
        if (!(await confirmar("Intervenção de Admin: levar esta proposta empatada ao voto popular?", "Levar (Admin)"))) return;
        ({ error: erro } = await sb.rpc("levar_ao_voto_popular", { pid, horas }));
      } else if (arquivar) {
        const pid = Number(arquivar.dataset.admArquivar);
        if (!(await confirmar("Intervenção de Admin: arquivar/cancelar esta proposta?", "Arquivar (Admin)"))) return;
        ({ error: erro } = await sb.rpc("arquivar_proposta", { pid }));
      } else return;

      if (erro) avisarJanela(erro.message);
      await carregar();
      desenhar();
    });

    $("form-lei-admin").addEventListener("submit", async (e) => {
      e.preventDefault();
      const { error } = await sb.rpc("propor_lei", {
        tipo: "criar",
        id_lei: null,
        titulo: $("adm-lei-titulo").value.trim(),
        texto: $("adm-lei-texto").value.trim(),
        justificativa: $("adm-lei-justificativa").value.trim(),
        horas: Number($("adm-lei-prazo").value || 24),
        como_admin: true,
        categoria: $("adm-lei-categoria").value || "geral",
      });
      if (error) return avisarJanela(error.message);
      await carregar();
      abrirAba("camara");
    });

    $("form-mandato-admin")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { data: polRow } = await sb.from("politica").select("*").eq("id", 1).maybeSingle();
      const numero = Number($("adm-man-num").value || 2);
      const ehAtual = $("adm-man-atual").checked;
      if (ehAtual) {
        await sb.from("politica_mandatos").update({ atual: false }).neq("numero", numero);
      }
      const { error } = await sb.from("politica_mandatos").upsert({
        numero,
        titulo: $("adm-man-titulo").value.trim(),
        metodo_eleicao: $("adm-man-metodo").value.trim(),
        presidente_nome: polRow?.presidente_nome || "Pedro Henrique Galli",
        presidente_partido: polRow?.presidente_partido || "",
        presidente_foto: polRow?.presidente_foto || null,
        deputados: ehAtual ? (polRow?.deputados || []).filter(d => d && d.nome) : [],
        inicio: $("adm-man-inicio").value || null,
        fim: $("adm-man-fim").value || null,
        historia: $("adm-man-historia").value.trim(),
        atual: ehAtual,
      }, { onConflict: "numero" });
      if (error) return avisarJanela(error.message);
      await carregar();
      abrirAba("mandatos");
    });
  }

  abrirAba(location.hash.slice(1) || "governo");
  leisProntas = await carregar();
  if (leisProntas && abaAtual !== "governo") desenhar();
}
