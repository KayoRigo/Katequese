// =====================================================================
// tema.js — cores do site.
//
// Dois níveis:
//   1) PALETA: cada pessoa escolhe a sua no botão redondo do menu.
//   2) TEMA GLOBAL: o admin liga um tema (ex: Halloween) que vale para
//      TODO MUNDO e passa por cima da paleta de cada um.
//
// É carregado no <head> de todas as páginas, antes de tudo aparecer,
// para a página não "piscar" com a cor errada.
// As cores de verdade ficam no style.css.
// =====================================================================

// ---------------------------------------------------------------------
// 1) PALETAS (escolha de cada pessoa)
// ---------------------------------------------------------------------

// "fundo" e "destaque" aqui servem só para desenhar a amostra no menu
const PALETAS = [
  { id: "grafite",  nome: "Grafite",  fundo: "#111214", destaque: "#f26b3a" },
  { id: "oceano",   nome: "Oceano",   fundo: "#0e1217", destaque: "#4ea1ff" },
  { id: "floresta", nome: "Floresta", fundo: "#0f1311", destaque: "#5fbf77" },
  { id: "vinho",    nome: "Vinho",    fundo: "#140f11", destaque: "#e0607e" },
  { id: "ouro",     nome: "Ouro",     fundo: "#121110", destaque: "#e5b84b" },
  { id: "claro",    nome: "Claro",    fundo: "#f4f4f2", destaque: "#e35d2a" },
];

// O navegador lembra a escolha (localStorage).
// O try/catch evita erro se o navegador bloquear esse armazenamento.
function paletaSalva() {
  let id = "grafite";
  try { id = localStorage.getItem("paleta") || id; } catch (e) {}
  return PALETAS.some(p => p.id === id) ? id : "grafite";
}

function aplicarPaleta(id) {
  document.documentElement.dataset.paleta = id; // vira <html data-paleta="...">
  try { localStorage.setItem("paleta", id); } catch (e) {}
}

aplicarPaleta(paletaSalva());

// Ícone da aba (favicon SVG leve) para não gerar erro 404 de /favicon.ico no console
if (typeof document !== "undefined" && document.head && !document.querySelector('link[rel="icon"]')) {
  const icone = document.createElement("link");
  icone.rel = "icon";
  icone.type = "image/svg+xml";
  icone.href = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#191a1d"/><text x="32" y="46" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="42" fill="#f26b3a">K</text></svg>'
  );
  document.head.appendChild(icone);
}

// HTML do botão redondo + menu de paletas (o menu.js coloca no cabeçalho)
function htmlSeletorPaleta() {
  return `
    <div class="paleta">
      <button class="botao-paleta" id="botao-paleta" title="Cores do site" aria-label="Cores do site"><span></span></button>
      <div class="menu-paleta" id="menu-paleta" hidden>
        <p>Cores do site</p>
        ${PALETAS.map(p => `
          <button class="opcao-paleta" data-paleta="${p.id}">
            <span class="amostra" style="background: linear-gradient(90deg, ${p.fundo} 50%, ${p.destaque} 50%)"></span>
            ${p.nome}
          </button>`).join("")}
      </div>
    </div>`;
}

// Liga os cliques do seletor (abrir, escolher e fechar ao clicar fora)
function ligarSeletorPaleta() {
  const botao = document.getElementById("botao-paleta");
  const menu = document.getElementById("menu-paleta");

  function marcarAtual() {
    menu.querySelectorAll(".opcao-paleta").forEach(op =>
      op.classList.toggle("ativa", op.dataset.paleta === document.documentElement.dataset.paleta));
  }

  botao.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    marcarAtual();
  });
  menu.addEventListener("click", (e) => {
    const opcao = e.target.closest(".opcao-paleta");
    if (!opcao) return;
    aplicarPaleta(opcao.dataset.paleta);
    marcarAtual();
  });
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target)) menu.hidden = true;
  });
}

// ---------------------------------------------------------------------
// 2) TEMAS GLOBAIS (o admin liga para todo mundo)
// ---------------------------------------------------------------------

const TEMAS_GLOBAIS = [
  { id: "halloween", nome: "Halloween", descricao: "Abóboras, velas, doces, teias, morcegos e fantasmas pelo site" },
  { id: "natal", nome: "Natal", descricao: "Neve, pisca-pisca, árvore, presentes, sinos, trenó, boneco de neve e guerra de bola de neve" },
];

// Qual função decora cada tema (as funções ficam mais abaixo neste arquivo)
const DECORAR_TEMA = { halloween: () => decorarHalloween(), natal: () => decorarNatal() };

// Carrega (ou remove) o arquivo CSS específico do tema global em css/temas/<id>.css
function carregarCssTema(id) {
  let link = document.getElementById("css-tema-global");
  if (!id) {
    link?.remove();
    return;
  }
  const href = `../css/temas/${id}.css`;
  if (!link) {
    link = document.createElement("link");
    link.id = "css-tema-global";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}

// Chamado pelo banco.js depois de ler a configuração do site.
// Guarda uma cópia no navegador para o tema já aparecer na próxima abertura,
// antes mesmo de o banco responder (e na tela de login).
function aplicarTemaGlobal(id) {
  const existe = TEMAS_GLOBAIS.some(t => t.id === id);
  try { existe ? localStorage.setItem("temaGlobal", id) : localStorage.removeItem("temaGlobal"); } catch (e) {}

  removerDecoracoes();
  if (!existe) {
    delete document.documentElement.dataset.temaGlobal;
    carregarCssTema(null);
    return;
  }
  document.documentElement.dataset.temaGlobal = id; // vira <html data-tema-global="...">
  carregarCssTema(id);
  DECORAR_TEMA[id]?.();
}

// Aplica já a cor do último tema global conhecido (as decorações entram quando a página termina de carregar)
(function () {
  let id = null;
  try { id = localStorage.getItem("temaGlobal"); } catch (e) {}
  if (TEMAS_GLOBAIS.some(t => t.id === id)) {
    document.documentElement.dataset.temaGlobal = id;
    carregarCssTema(id);
    document.addEventListener("DOMContentLoaded", () => {
      DECORAR_TEMA[document.documentElement.dataset.temaGlobal]?.();
    });
  }
})();

function removerDecoracoes() {
  document.querySelectorAll("[data-decoracao]").forEach(el => el.remove());
  if (typeof soltarBola === "function") soltarBola();
}

// Quando gira o celular ou muda a largura da janela, refaz o varal ou o pisca-pisca na medida nova
let timerLargura = null;
window.addEventListener("resize", () => {
  clearTimeout(timerLargura);
  timerLargura = setTimeout(() => {
    const largura = Math.max(180, window.innerWidth - (window.innerWidth <= 600 ? 150 : 300));
    const varal = document.querySelector(".hw-varal");
    if (varal) varal.innerHTML = svgVaral(largura);
    const luzes = document.querySelector(".nt-luzes");
    if (luzes) luzes.innerHTML = svgLuzes(largura);
  }, 150);
});

// =====================================================================
// HALLOWEEN
// Os desenhos são feitos em SVG (código de desenho) direto aqui, sem imagens.
// =====================================================================

// ----- Desenhos -----

// Abóbora com rosto (jack-o'-lantern). Clicar faz o rosto acender e piscar.
function svgAbobora() {
  return `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M30 14c0-5 2-9 7-10l1 3c-3 1-4 4-4 7z" fill="#4f7a28"/>
      <ellipse cx="19" cy="38" rx="14" ry="19" fill="#d9590c"/>
      <ellipse cx="45" cy="38" rx="14" ry="19" fill="#d9590c"/>
      <ellipse cx="32" cy="38" rx="15" ry="21" fill="#ff7a1a"/>
      <g class="rosto" fill="#ffcf5c">
        <polygon points="20,33 28,33 24,25"/>
        <polygon points="36,33 44,33 40,25"/>
        <polygon points="17,42 47,42 44,50 40,46 36,51 32,46 28,51 24,46 20,50"/>
      </g>
    </svg>`;
}

// Teia de aranha no canto: linhas saindo do canto + arcos ligando as linhas
function svgTeia() {
  const angulos = [0, 18, 36, 54, 72, 90].map(g => g * Math.PI / 180);
  const raios = [24, 50, 78, 106, 134];
  const p = (r, a) => `${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`;
  let d = angulos.map(a => `M0 0 L${p(150, a)}`).join(" ");
  raios.forEach(r => {
    for (let i = 0; i < angulos.length - 1; i++) {
      const meio = (angulos[i] + angulos[i + 1]) / 2;
      d += ` M${p(r, angulos[i])} Q${p(r * 0.86, meio)} ${p(r, angulos[i + 1])}`; // o arco "cede" um pouco
    }
  });
  return `<svg viewBox="0 0 150 150" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;
}

function svgAranha() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12L4 6M12 12L3 11M12 12L4 17M12 12L6 21M12 12L20 6M12 12L21 11M12 12L20 17M12 12L18 21"
            stroke="#9c8aa8" stroke-width="1.4" stroke-linecap="round" fill="none"/>
      <ellipse cx="12" cy="13.5" rx="4" ry="5" fill="#1d1622" stroke="#9c8aa8" stroke-width=".8"/>
      <circle cx="12" cy="7.8" r="2.6" fill="#1d1622" stroke="#9c8aa8" stroke-width=".8"/>
      <circle cx="11" cy="7.4" r=".6" fill="#ff4d3d"/><circle cx="13" cy="7.4" r=".6" fill="#ff4d3d"/>
    </svg>`;
}

function svgFantasma() {
  return `
    <svg viewBox="0 0 60 70" aria-hidden="true">
      <path d="M30 4C16 4 8 15 8 28v34l7-6 7 6 8-6 8 6 7-6 7 6V28C52 15 44 4 30 4z" fill="#f4f0ea"/>
      <ellipse cx="23" cy="28" rx="3.5" ry="5" fill="#1d1622"/>
      <ellipse cx="37" cy="28" rx="3.5" ry="5" fill="#1d1622"/>
      <ellipse cx="30" cy="42" rx="4" ry="5" fill="#1d1622"/>
    </svg>`;
}

function svgMorcego() {
  // Morcego visto de frente. As duas asas são o MESMO desenho: a da direita é a da esquerda espelhada.
  // Cada asa gira em volta do "ombro" (perto do corpo), como uma asa de verdade.
  const asa = `<path class="asa" d="M47 21C40 14 28 10 16 9 10 9 5 11 2 15c5 0 8 3 9 7 4-3 9-2 11 2 3-3 8-3 11 1 3-3 8-2 11 3z"/>`;
  return `
    <svg viewBox="0 0 100 50" aria-hidden="true">
      <g class="corpo-morcego">
        ${asa}
        <g transform="translate(100 0) scale(-1 1)">${asa}</g>
        <path d="M45.5 14 44.5 5.5 49 11zM54.5 14l1-8.5L51 11z"/>
        <circle cx="50" cy="16" r="5"/>
        <ellipse cx="50" cy="26" rx="5" ry="8.5"/>
        <circle cx="48.2" cy="15.6" r="0.9" fill="#d9b860" stroke="none"/><circle cx="51.8" cy="15.6" r="0.9" fill="#d9b860" stroke="none"/>
      </g>
    </svg>`;
}

// Vela com chama (a chama treme sozinha; clicar apaga e ela reacende)
function svgVela(altura = 40) {
  const topo = 60 - altura; // a vela "cresce" de baixo para cima
  return `
    <svg viewBox="0 0 20 64" aria-hidden="true">
      <g class="chama" style="transform-origin: 10px ${topo - 2}px">
        <path d="M10 ${topo - 18}c3 5 5 8 5 11a5 5 0 0 1-10 0c0-3 2-6 5-11z" fill="#ffad33"/>
        <path d="M10 ${topo - 13}c2 3 3 5 3 7a3 3 0 0 1-6 0c0-2 1-4 3-7z" fill="#fff1a8"/>
      </g>
      <line x1="10" y1="${topo - 3}" x2="10" y2="${topo + 1}" stroke="#2a1a10" stroke-width="1.5"/>
      <rect x="3" y="${topo}" width="14" height="${altura + 4}" rx="2" fill="#efe6d8"/>
      <path d="M3 ${topo + 2}h14v3c-2 0-2 6-4 6s-1-5-3-5-2 4-4 4-1-5-3-5z" fill="#ddd2c0"/>
    </svg>`;
}

// Doces: milho doce (candy corn), bala embrulhada e pirulito
function svgMilhoDoce() {
  return `
    <svg viewBox="0 0 30 32" aria-hidden="true">
      <path d="M15 2C19 2 28 24 28 27C28 31 2 31 2 27C2 24 11 2 15 2Z" fill="#fff4e0"/>
      <path d="M7.6 15H22.4C25 20 28 25 28 27C28 31 2 31 2 27C2 25 5 20 7.6 15Z" fill="#ff8a1f"/>
      <path d="M4 23H26C27 25 28 26 28 27C28 31 2 31 2 27C2 26 3 25 4 23Z" fill="#ffcf3a"/>
    </svg>`;
}

function svgBala(cor) {
  return `
    <svg viewBox="0 0 48 24" aria-hidden="true">
      <path d="M13 12L2 4L5 12L2 20Z" fill="${cor}"/>
      <path d="M35 12L46 4L43 12L46 20Z" fill="${cor}"/>
      <ellipse cx="24" cy="12" rx="12" ry="9" fill="${cor}"/>
      <path d="M19 4l-4 16M26 3l-4 18M32 5l-3 14" stroke="rgba(255,255,255,.45)" stroke-width="2.4"/>
    </svg>`;
}

function svgPirulito(cor) {
  return `
    <svg viewBox="0 0 30 60" aria-hidden="true">
      <line x1="15" y1="27" x2="15" y2="58" stroke="#f4efe6" stroke-width="3" stroke-linecap="round"/>
      <circle cx="15" cy="15" r="13" fill="${cor}"/>
      <path d="M15 15m-9 0a9 9 0 1 0 18 0a6 6 0 1 0 -12 0a3 3 0 1 0 6 0" fill="none" stroke="#f4efe6" stroke-width="2.4"/>
    </svg>`;
}

// Lápide com "RIP"
function svgLapide() {
  return `
    <svg viewBox="0 0 60 72" aria-hidden="true">
      <path d="M8 72V28C8 12 18 4 30 4s22 8 22 24v44z" fill="#2e2436"/>
      <path d="M8 72V28C8 12 18 4 30 4" fill="none" stroke="#45384f" stroke-width="2"/>
      <text x="30" y="38" text-anchor="middle" font-family="Archivo, sans-serif" font-weight="800" font-size="13" fill="#6d5a7a">RIP</text>
      <path d="M18 50h24M20 56h20" stroke="#45384f" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
}

// Caldeirão com poção verde borbulhando
function svgCaldeirao() {
  return `
    <svg viewBox="0 0 80 74" aria-hidden="true">
      <g class="bolhas" fill="#8af08f">
        <circle cx="30" cy="16" r="3"/><circle cx="44" cy="12" r="2.4"/><circle cx="52" cy="17" r="2"/><circle cx="38" cy="18" r="1.8"/>
      </g>
      <ellipse cx="40" cy="22" rx="30" ry="7" fill="#5fd068"/>
      <path d="M8 22c0 26 14 40 32 40s32-14 32-40z" fill="#1f1824"/>
      <ellipse cx="40" cy="22" rx="32" ry="6" fill="none" stroke="#2f2636" stroke-width="5"/>
      <path d="M22 60l-6 10M58 60l6 10" stroke="#1f1824" stroke-width="5" stroke-linecap="round"/>
    </svg>`;
}

// Varal de bandeirinhas embaixo do menu (feito na largura da tela)
function svgVaral(largura) {
  const passo = 44;
  const qtd = Math.max(4, Math.floor(largura / passo));
  const cores = ["#ff7a1a", "#5a4570", "#1d1622", "#ffad42", "#5fd068"];
  const curva = (x) => 4 + Math.sin((x / largura) * Math.PI) * 14; // o fio "cede" no meio
  let bandeiras = "";
  for (let i = 0; i < qtd; i++) {
    const x = i * passo + passo / 2, y = curva(x);
    bandeiras += `<path d="M${x - 13} ${y}L${x + 13} ${y}L${x} ${y + 24}Z" fill="${cores[i % cores.length]}"/>`;
  }
  return `
    <svg viewBox="0 0 ${largura} 46" width="${largura}" height="46" aria-hidden="true">
      <path d="M0 4Q${largura / 2} 32 ${largura} 4" fill="none" stroke="#6d5a7a" stroke-width="1.5"/>
      ${bandeiras}
    </svg>`;
}

// ----- Montagem -----

function decorarHalloween() {
  if (document.querySelector("[data-decoracao]")) return; // já está decorado
  const capa = document.querySelector(".capa");
  // No Admin o rodapé fixo fica livre (barra de Salvar); na página inicial o "chão" já tem tudo isso
  const semCantoFixo = !!document.querySelector(".barra-salvar") || !!capa;
  const teia = () => `
    ${svgTeia()}
    <div class="hw-alvo"></div>
    <div class="hw-pendurada"><div class="hw-fio"></div><div class="hw-aranha">${svgAranha()}</div></div>`;

  document.body.insertAdjacentHTML("beforeend", `
    <div class="hw-varal" data-decoracao>${svgVaral(Math.max(200, window.innerWidth - 300))}</div>
    <div class="hw-teia esquerda" data-decoracao>${teia()}</div>
    <div class="hw-teia direita" data-decoracao>${teia()}</div>
    <div class="hw-ceu" data-decoracao>
      ${[1, 2, 3, 4, 5].map(() => `<div class="hw-morcego">${svgMorcego()}</div>`).join("")}
    </div>
    ${semCantoFixo ? "" : `
      <div class="hw-canto" data-decoracao>
        <div class="hw-vela" style="width: 12px">${svgVela(30)}</div>
        <div class="hw-abobora">${svgAbobora()}</div>
        <div class="hw-vela" style="width: 15px">${svgVela(44)}</div>
        <div class="hw-doce" style="width: 20px">${svgMilhoDoce()}</div>
      </div>
      <div class="hw-fantasma" data-decoracao><span class="hw-buu">Buu!</span>${svgFantasma()}</div>`}`);

  voarMorcegos();

  // Na página inicial: céu com lua e estrelas, neblina e um "chão" cheio de coisas
  if (capa) {
    const estrelas = Array.from({ length: 22 }, () =>
      `<i style="left:${(Math.random() * 100).toFixed(1)}%; top:${(Math.random() * 45).toFixed(1)}%;
         animation-delay:${(-Math.random() * 4).toFixed(1)}s"></i>`).join("");
    capa.insertAdjacentHTML("beforeend", `
      <div class="hw-estrelas" data-decoracao>${estrelas}</div>
      <div class="hw-lua" data-decoracao title="Clique na lua"></div>
      <div class="hw-neblina" data-decoracao></div>
      <div class="hw-chao" data-decoracao>
        <div class="hw-lapide" style="left: 2%; width: 56px; transform: rotate(-5deg)">${svgLapide()}</div>
        <div class="hw-abobora" style="left: 8%; width: clamp(70px, 10vw, 120px)">${svgAbobora()}</div>
        <div class="hw-doce" style="left: 19%; width: 24px">${svgMilhoDoce()}</div>
        <div class="hw-lapide some-celular" style="left: 22%; width: 40px; transform: rotate(4deg)">${svgLapide()}</div>
        <div class="hw-vela" style="left: 28%; width: 13px">${svgVela(28)}</div>
        <div class="hw-vela" style="left: 30.5%; width: 16px">${svgVela(46)}</div>
        <div class="hw-vela" style="left: 33.5%; width: 12px">${svgVela(20)}</div>
        <div class="hw-doce" style="left: 38%; width: 40px">${svgBala("#8b5cf6")}</div>
        <div class="hw-doce some-celular" style="left: 44%; width: 22px">${svgMilhoDoce()}</div>
        <div class="hw-doce" style="left: 56%; width: 22px">${svgPirulito("#ff7a1a")}</div>
        <div class="hw-caldeirao some-celular" style="left: 61%; width: 84px" title="Clique no caldeirão">${svgCaldeirao()}</div>
        <div class="hw-doce" style="left: 72%; width: 38px">${svgBala("#5fd068")}</div>
        <div class="hw-vela" style="left: 77%; width: 14px">${svgVela(36)}</div>
        <div class="hw-vela" style="left: 79.5%; width: 12px">${svgVela(24)}</div>
        <div class="hw-abobora" style="right: 9%; width: clamp(54px, 7vw, 86px)">${svgAbobora()}</div>
        <div class="hw-doce" style="right: 6%; width: 20px">${svgPirulito("#8b5cf6")}</div>
        <div class="hw-fantasma" style="position: absolute; right: 3.5%; bottom: 40px; width: 48px"><span class="hw-buu">Buu!</span>${svgFantasma()}</div>
        <div class="hw-lapide" style="right: 1.5%; width: 60px; transform: rotate(5deg)">${svgLapide()}</div>
      </div>`);
  }
}

// ----- Voo dos morcegos -----
// Em vez de seguir um caminho fixo do CSS, cada morcego "persegue" um ponto invisível
// que muda de lugar de tempos em tempos. Somando um pouco de tremida, ele faz curvas,
// sobe, desce, plana e às vezes sai da tela e volta por outro lado, como um morcego de verdade.
function voarMorcegos() {
  const ceu = document.querySelector(".hw-ceu");
  if (!ceu) return;
  const sorteio = (min, max) => min + Math.random() * (max - min);

  const morcegos = [...ceu.querySelectorAll(".hw-morcego")].map((el, i) => {
    const m = { el, tamanho: sorteio(34, 64) };
    // Os menores parecem mais longe: voam mais devagar e ficam um pouco apagados
    m.velMax = 1.2 + (m.tamanho / 64) * 2.2;
    el.style.width = m.tamanho + "px";
    el.style.opacity = (0.55 + (m.tamanho / 64) * 0.45).toFixed(2);
    entrar(m, i * 0.2);
    el._fugir = () => fugir(m);
    return m;
  });

  // Coloca o morcego fora da tela, de um lado aleatório, já voando para dentro
  function entrar(m, atraso = 0) {
    const L = ceu.clientWidth, A = ceu.clientHeight;
    const daEsquerda = Math.random() < 0.5;
    m.x = daEsquerda ? -80 : L + 80;
    m.y = sorteio(0.05, 0.8) * A;
    m.vx = daEsquerda ? m.velMax : -m.velMax;
    m.vy = 0;
    m.fase = Math.random() * 10;                   // para a batida das asas não ficar sincronizada
    m.espera = atraso * 60 + sorteio(0, 240);      // quadros até aparecer
    m.fugindo = false;
    m.planando = 0;
    m.voltas = Math.floor(sorteio(3, 7));          // quantos pontos visita antes de ir embora
    novoAlvo(m);
  }

  function novoAlvo(m) {
    const L = ceu.clientWidth, A = ceu.clientHeight;
    if (m.voltas-- <= 0) {
      // Hora de ir embora: o alvo fica fora da tela
      m.alvoX = m.x < L / 2 ? -150 : L + 150;
      m.alvoY = sorteio(0, A);
    } else {
      m.alvoX = sorteio(0.05, 0.95) * L;
      m.alvoY = sorteio(0.05, 0.85) * A;
    }
  }

  function fugir(m) {
    if (m.fugindo) return;
    m.fugindo = true;
    m.alvoX = m.x < ceu.clientWidth / 2 ? -200 : ceu.clientWidth + 200;
    m.alvoY = -200;
  }

  let quadro = 0;
  function passo() {
    if (!document.body.contains(ceu)) return;      // tema desligado: para tudo
    quadro++;
    const L = ceu.clientWidth, A = ceu.clientHeight;

    for (const m of morcegos) {
      if (m.espera > 0) { m.espera--; m.el.style.visibility = "hidden"; continue; }
      m.el.style.visibility = "";

      // Direção até o alvo
      const dx = m.alvoX - m.x, dy = m.alvoY - m.y;
      const dist = Math.hypot(dx, dy) || 1;
      const forca = m.fugindo ? 0.5 : 0.07;
      m.vx += (dx / dist) * forca;
      m.vy += (dy / dist) * forca;

      // Tremidinha: morcego nunca voa reto
      if (!m.fugindo) {
        m.vx += sorteio(-0.18, 0.18);
        m.vy += sorteio(-0.22, 0.22);
      }

      // Limite de velocidade (fugindo pode ir mais rápido)
      const vmax = m.fugindo ? m.velMax * 4 : m.velMax;
      const vel = Math.hypot(m.vx, m.vy);
      if (vel > vmax) { m.vx *= vmax / vel; m.vy *= vmax / vel; }

      m.x += m.vx;
      m.y += m.vy;

      // De vez em quando ele para de bater as asas e plana um pouquinho
      if (m.planando > 0) m.planando--;
      else if (!m.fugindo && Math.random() < 0.004) m.planando = Math.floor(sorteio(25, 60));
      m.el.classList.toggle("planando", m.planando > 0);

      // Chegou perto do alvo: escolhe outro
      if (dist < 40 && !m.fugindo) novoAlvo(m);

      // Saiu da tela: volta depois por outro lado
      if (m.x < -160 || m.x > L + 160 || m.y < -220 || m.y > A + 160) { entrar(m, 1); continue; }

      // Asas batendo: sobe um pouco a cada batida (planando, ele só desce devagar)
      const sobeDesce = m.planando > 0 ? 0 : Math.sin(quadro * 0.45 + m.fase) * 2;
      const inclina = Math.max(-25, Math.min(25, m.vx * 7));   // inclina na direção da curva
      m.el.style.transform = `translate(${m.x.toFixed(1)}px, ${(m.y + sobeDesce).toFixed(1)}px) rotate(${inclina.toFixed(1)}deg)`;
    }
    requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);
}

// Chuva de doces (clicar na lua)
function chuvaDeDoces() {
  const desenhos = [svgMilhoDoce(), svgBala("#8b5cf6"), svgBala("#5fd068"), svgPirulito("#ff7a1a"), svgMilhoDoce()];
  for (let i = 0; i < 40; i++) {
    const doce = document.createElement("div");
    doce.className = "hw-doce-caindo";
    doce.dataset.decoracao = "";
    doce.innerHTML = desenhos[i % desenhos.length];
    doce.style.left = Math.random() * 100 + "vw";
    doce.style.width = 18 + Math.random() * 18 + "px";
    doce.style.animationDuration = 2.5 + Math.random() * 2 + "s";
    doce.style.animationDelay = Math.random() * 0.8 + "s";
    document.body.appendChild(doce);
    setTimeout(() => doce.remove(), 6000);
  }
}

// ----- Interações (um ouvinte só para todas as decorações) -----
document.addEventListener("click", (e) => {
  const alvo = e.target.closest(".hw-abobora, .hw-alvo, .hw-fantasma, .hw-morcego, .hw-vela, .hw-doce, .hw-caldeirao, .hw-lua, .hw-lapide");
  if (!alvo) return;

  // Repete uma animação: tira a classe, força o navegador a "perceber" e coloca de novo
  const animar = (el, classe, ms) => {
    el.classList.remove(classe);
    void el.offsetWidth;
    el.classList.add(classe);
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove(classe), ms);
  };

  const c = alvo.classList;
  if (c.contains("hw-abobora")) animar(alvo, "acesa", 1600);                        // rosto acende e pisca
  else if (c.contains("hw-alvo")) animar(alvo.closest(".hw-teia"), "descendo", 3200); // aranha desce pelo fio
  else if (c.contains("hw-fantasma")) animar(alvo, "assustando", 2600);              // "Buu!" e some
  else if (c.contains("hw-morcego")) alvo._fugir?.();                                // morcego foge
  else if (c.contains("hw-vela")) animar(alvo, "apagada", 2400);                     // sopra: apaga, sai fumaça e reacende
  else if (c.contains("hw-doce")) animar(alvo, "pulando", 700);                      // o doce pula e gira
  else if (c.contains("hw-caldeirao")) animar(alvo, "fervendo", 2000);               // a poção ferve e solta fumaça verde
  else if (c.contains("hw-lapide")) animar(alvo, "tremendo", 600);                   // a lápide treme
  else if (c.contains("hw-lua")) chuvaDeDoces();                                     // chove doce!
});


// =====================================================================
// NATAL
// Mesma ideia do Halloween: desenhos em SVG, montagem e um ouvinte de
// cliques para todas as decorações. Extra: GUERRA DE BOLA DE NEVE —
// clique num montinho de neve para pegar uma bola e clique em qualquer
// lugar para arremessar (Esc solta a bola).
// =====================================================================

const CORES_LUZES = ["#e5484d", "#f2c94c", "#3fb56b", "#4ea1ff"];

// ----- Desenhos -----

// Fio de pisca-pisca embaixo do menu (clique numa lâmpada: muda o jeito de piscar)
function svgLuzes(largura) {
  const passo = 34;
  const qtd = Math.max(5, Math.floor(largura / passo));
  const curva = (x) => 6 + Math.sin((x / largura) * Math.PI) * 14;
  let lampadas = "";
  for (let i = 0; i < qtd; i++) {
    const x = i * passo + passo / 2, y = curva(x);
    const cor = CORES_LUZES[i % CORES_LUZES.length];
    const giro = ((i % 2) ? 1 : -1) * 12;
    lampadas += `
      <g class="nt-lampada" style="--i: ${i}" transform="translate(${x} ${y}) rotate(${giro})">
        <rect x="-3" y="0" width="6" height="5" rx="1" fill="#3a4a40"/>
        <ellipse class="vidro" cx="0" cy="12" rx="5" ry="8" fill="${cor}" style="--cor: ${cor}"/>
      </g>`;
  }
  return `
    <svg viewBox="0 0 ${largura} 46" width="${largura}" height="46" aria-hidden="true">
      <path d="M0 6Q${largura / 2} 34 ${largura} 6" fill="none" stroke="#2c3b33" stroke-width="2"/>
      ${lampadas}
    </svg>`;
}

// Sino dourado com laço vermelho (clique: balança e toca)
function svgSino() {
  return `
    <svg viewBox="0 0 50 60" aria-hidden="true">
      <path d="M25 8c-3-5-12-6-14-1-1 4 6 6 14 4 8 2 15 0 14-4-2-5-11-4-14 1z" fill="#c92f37"/>
      <circle cx="25" cy="9" r="3.5" fill="#a5242c"/>
      <g class="badalo-sino">
        <path d="M25 13c-9 0-13 8-13 18v8l-4 6h34l-4-6v-8c0-10-4-18-13-18z" fill="#e8b93e"/>
        <path d="M17 22c1-4 4-6 7-6" stroke="#fff1b8" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <rect x="8" y="44" width="34" height="3" rx="1.5" fill="#c99a2e"/>
        <circle cx="25" cy="51" r="4" fill="#c99a2e"/>
      </g>
    </svg>`;
}

// Raminho de azevinho (folhas + frutinhas) para os cantos
function svgAzevinho() {
  return `
    <svg viewBox="0 0 120 70" aria-hidden="true">
      <path d="M60 30C48 14 30 10 14 14c6 4 4 10 10 12-6 2-4 8 2 10 12 4 26 0 34-6z" fill="#2f7a46"/>
      <path d="M60 30C72 14 90 10 106 14c-6 4-4 10-10 12 6 2 4 8-2 10-12 4-26 0-34-6z" fill="#276b3c"/>
      <path d="M60 30C20 22 30 24 18 18M60 30c40-8 30-6 42-12" stroke="#1c5230" stroke-width="1.5" fill="none"/>
      <circle cx="54" cy="32" r="6" fill="#d9363e"/><circle cx="66" cy="32" r="6" fill="#c92f37"/><circle cx="60" cy="40" r="6" fill="#e5484d"/>
      <circle cx="52" cy="30" r="1.8" fill="#fff" opacity=".5"/><circle cx="58" cy="38" r="1.8" fill="#fff" opacity=".5"/>
    </svg>`;
}

// Árvore de Natal com bolinhas e estrela (clique: acende tudo e balança)
function svgArvore() {
  const enfeites = [[30, 30], [44, 40], [26, 50], [50, 56], [36, 62], [20, 70], [58, 72], [42, 78], [30, 84], [62, 86], [16, 88]]
    .map(([x, y], i) => `<circle class="enfeite" cx="${x}" cy="${y}" r="3.6" fill="${CORES_LUZES[i % 4]}" style="--i: ${i}"/>`).join("");
  return `
    <svg viewBox="0 0 80 110" aria-hidden="true">
      <rect x="34" y="92" width="12" height="14" rx="2" fill="#6b4226"/>
      <path d="M40 10L62 44H52L70 70H58L78 96H2L22 70H10L28 44H18z" fill="#1f6b3a"/>
      <path d="M40 10L62 44H52L70 70H58L78 96H40z" fill="#185a30"/>
      <path d="M24 46q16 8 34-2M16 72q24 10 46-2" stroke="#f2c94c" stroke-width="1.6" fill="none" stroke-dasharray="2 3"/>
      ${enfeites}
      <path class="estrela-topo" d="M40 0l3.2 6.6 7.2 1-5.2 5 1.2 7.2L40 16.4 33.6 19.8l1.2-7.2-5.2-5 7.2-1z" fill="#f2c94c" stroke="#c99a2e" stroke-width="1"/>
    </svg>`;
}

// Presente com laço (clique: a tampa pula e saem estrelinhas)
function svgPresente(cor, fita) {
  return `
    <svg viewBox="0 0 60 60" aria-hidden="true">
      <rect x="6" y="24" width="48" height="34" rx="2" fill="${cor}"/>
      <rect x="26" y="24" width="8" height="34" fill="${fita}"/>
      <g class="tampa">
        <path d="M30 16c-6-10-18-10-17-3 1 5 10 5 17 3zM30 16c6-10 18-10 17-3-1 5-10 5-17 3z" fill="${fita}"/>
        <rect x="2" y="15" width="56" height="11" rx="2" fill="${cor}" style="filter: brightness(1.12)"/>
        <rect x="26" y="15" width="8" height="11" fill="${fita}"/>
      </g>
    </svg>`;
}

// Bengala doce listrada (clique: gira)
function svgBengala() {
  return `
    <svg viewBox="0 0 30 70" aria-hidden="true">
      <path d="M20 68V20a8 8 0 0 0-16 0" fill="none" stroke="#f6f3ee" stroke-width="7" stroke-linecap="round"/>
      <path d="M20 68V20a8 8 0 0 0-16 0" fill="none" stroke="#d9363e" stroke-width="7" stroke-linecap="round" stroke-dasharray="5 6"/>
    </svg>`;
}

// Boneco de neve com cachecol e cartola (clique: a cartola pula e ele treme de frio)
function svgBoneco() {
  return `
    <svg viewBox="0 0 70 96" aria-hidden="true">
      <path d="M14 56L2 46M56 56l12-10" stroke="#6b4226" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="35" cy="72" r="22" fill="#f4f7fa"/>
      <circle cx="35" cy="40" r="15" fill="#f8fbfd"/>
      <path d="M22 76a22 22 0 0 0 26 15" stroke="#d6e2ea" stroke-width="3" fill="none"/>
      <circle cx="35" cy="66" r="2" fill="#1d2228"/><circle cx="35" cy="75" r="2" fill="#1d2228"/>
      <circle cx="30" cy="37" r="1.8" fill="#1d2228"/><circle cx="40" cy="37" r="1.8" fill="#1d2228"/>
      <path d="M35 41l11 3-11 1.6z" fill="#f08a24"/>
      <path d="M24 50c7 4 15 4 22 0v6c-7 3-15 3-22 0z" fill="#d9363e"/>
      <path d="M40 54l3 14h6l-4-15z" fill="#c92f37"/>
      <g class="cartola">
        <rect x="21" y="23" width="28" height="4" rx="1" fill="#1d2228"/>
        <rect x="25" y="8" width="20" height="16" rx="1" fill="#1d2228"/>
        <rect x="25" y="19" width="20" height="3" fill="#d9363e"/>
      </g>
    </svg>`;
}

// Montinho de neve (clique: pega uma bola de neve)
function svgMonte() {
  return `
    <svg viewBox="0 0 90 40" aria-hidden="true">
      <path d="M2 40C4 22 18 14 30 18c6-12 26-14 34-2 12-4 24 6 24 24z" fill="#eef4f8"/>
      <path d="M30 18c6-12 26-14 34-2-8-4-22-5-34 2zM62 18c10-2 20 6 22 16-6-8-14-14-22-16z" fill="#ffffff"/>
      <path d="M8 36c10-6 24-8 36-4 12-4 26-2 38 4" stroke="#cfdde6" stroke-width="2" fill="none"/>
      <circle cx="40" cy="30" r="5" fill="#ffffff" stroke="#d6e2ea"/><circle cx="52" cy="33" r="4" fill="#ffffff" stroke="#d6e2ea"/>
    </svg>`;
}

// Trenó do Papai Noel com duas renas (passa voando; clique: solta presentes)
function svgTreno() {
  const rena = (x) => `
    <g transform="translate(${x} 0)">
      <path d="M0 30c4-6 18-7 24-2l6-8 3 2-5 9c2 3 1 6-2 7l1 10h-3l-2-8h-12l-3 8h-3l2-10c-4-2-6-5-6-8z" fill="#8a5a36"/>
      <path d="M29 20l-2-8M29 20l4-7M27 14l-4-2M32 15l3-3" stroke="#d6b48a" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="32" cy="23" r="1.6" fill="#e5484d"/>
    </g>`;
  return `
    <svg viewBox="0 0 230 60" aria-hidden="true">
      ${rena(150)}${rena(190)}
      <path d="M100 34L156 31M100 38l56-3" stroke="#c99a2e" stroke-width="1.2"/>
      <path d="M8 50h92c6 0 8-4 10-8" stroke="#e8b93e" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M14 26h80l-6 20H22c-6 0-10-8-8-20z" fill="#c92f37"/>
      <path d="M20 26c0-8 8-12 16-10h12c2-6 10-6 12 0" fill="#7a4a2a"/>
      <circle cx="66" cy="12" r="7" fill="#f2d2b4"/>
      <path d="M58 12c0-10 16-10 16 0" fill="#d9363e"/><circle cx="76" cy="5" r="3" fill="#fff"/>
      <path d="M60 15c2 8 10 8 12 0" fill="#fff"/>
      <path d="M56 20h20l2 8H54z" fill="#d9363e"/>
    </svg>`;
}

// Mancha de neve onde a bola bate
function svgSplash() {
  return `
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <path d="M40 18c6 0 8 6 14 4s10 4 8 10 6 8 4 14-8 6-8 12-8 6-14 4-10 4-14-2-10-4-8-10-8-8-4-14 4-10 2-14 8-8 12-6 6-4 12-4z" fill="#f4f8fb"/>
      <circle cx="12" cy="20" r="4" fill="#f4f8fb"/><circle cx="68" cy="14" r="3" fill="#f4f8fb"/>
      <circle cx="72" cy="62" r="4" fill="#f4f8fb"/><circle cx="8" cy="62" r="3" fill="#f4f8fb"/>
      <circle cx="40" cy="4" r="2.5" fill="#f4f8fb"/><circle cx="36" cy="40" r="10" fill="#ffffff"/>
    </svg>`;
}

// ----- Montagem -----

function decorarNatal() {
  if (document.querySelector("[data-decoracao]")) return;
  const capa = document.querySelector(".capa");
  const semCantoFixo = !!document.querySelector(".barra-salvar") || !!capa;
  const canto = (lado) => `
    <div class="nt-canto-topo ${lado}" data-decoracao>
      <div class="nt-azevinho">${svgAzevinho()}</div>
      <div class="nt-pendente"><div class="nt-fita"></div><div class="nt-sino">${svgSino()}</div></div>
    </div>`;

  // Flocos caindo (bolinhas brancas com tamanhos, velocidades e "ventos" diferentes)
  const flocos = Array.from({ length: 46 }, () => {
    const tam = (1.5 + Math.random() * 4).toFixed(1);
    return `<i style="left: ${(Math.random() * 100).toFixed(1)}%; width: ${tam}px; height: ${tam}px;
      animation-duration: ${(8 + Math.random() * 12).toFixed(1)}s; animation-delay: ${(-Math.random() * 20).toFixed(1)}s;
      --vento: ${(Math.random() * 80 - 40).toFixed(0)}px; opacity: ${(0.4 + Math.random() * 0.5).toFixed(2)}"></i>`;
  }).join("");

  document.body.insertAdjacentHTML("beforeend", `
    <div class="nt-neve" data-decoracao>${flocos}</div>
    <div class="nt-luzes modo-0" data-decoracao>${svgLuzes(Math.max(200, window.innerWidth - 300))}</div>
    ${canto("esquerda")}${canto("direita")}
    <div class="nt-ceu" data-decoracao><div class="nt-treno" title="Clique no trenó">${svgTreno()}</div></div>
    ${semCantoFixo ? "" : `
      <div class="nt-canto" data-decoracao>
        <div class="nt-arvore" style="width: 52px">${svgArvore()}</div>
        <div class="nt-presente" style="width: 30px">${svgPresente("#2f7a46", "#f2c94c")}</div>
        <div class="nt-monte" style="width: 64px" title="Pegue uma bola de neve">${svgMonte()}</div>
        <div class="nt-bengala" style="width: 14px">${svgBengala()}</div>
      </div>
      <div class="nt-boneco" data-decoracao><span class="nt-fala">Brrr!</span>${svgBoneco()}</div>`}`);

  voarTreno();

  // Página inicial: estrela grande (clique: nevasca), estrelinhas e um chão de neve cheio de coisas
  if (capa) {
    const estrelas = Array.from({ length: 22 }, () =>
      `<i style="left:${(Math.random() * 100).toFixed(1)}%; top:${(Math.random() * 45).toFixed(1)}%;
         animation-delay:${(-Math.random() * 4).toFixed(1)}s"></i>`).join("");
    capa.insertAdjacentHTML("beforeend", `
      <div class="hw-estrelas nt-estrelas" data-decoracao>${estrelas}</div>
      <div class="nt-estrela-guia" data-decoracao title="Clique na estrela">
        <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 2l9 37 39 11-39 11-9 37-9-37L2 50l39-11z" fill="#fff6d6"/></svg>
      </div>
      <div class="nt-chao" data-decoracao>
        <svg class="nt-chao-neve" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 30C80 10 160 26 240 18s160-14 250 4 170 10 260-6 170 4 250 14V60H0z" fill="#eef4f8"/>
        </svg>
        <div class="nt-arvore" style="left: 3%; width: clamp(90px, 11vw, 140px)">${svgArvore()}</div>
        <div class="nt-presente" style="left: 15%; width: 44px">${svgPresente("#d9363e", "#f2c94c")}</div>
        <div class="nt-presente some-celular" style="left: 20%; width: 34px">${svgPresente("#4ea1ff", "#f6f3ee")}</div>
        <div class="nt-bengala" style="left: 26%; width: 18px; transform: rotate(-8deg)">${svgBengala()}</div>
        <div class="nt-monte" style="left: 31%; width: 110px" title="Pegue uma bola de neve">${svgMonte()}</div>
        <div class="nt-presente some-celular" style="left: 46%; width: 40px">${svgPresente("#2f7a46", "#e5484d")}</div>
        <div class="nt-monte some-celular" style="left: 56%; width: 80px" title="Pegue uma bola de neve">${svgMonte()}</div>
        <div class="nt-bengala some-celular" style="left: 66%; width: 16px; transform: rotate(10deg)">${svgBengala()}</div>
        <div class="nt-arvore some-celular" style="left: 70%; width: 70px">${svgArvore()}</div>
        <div class="nt-presente" style="right: 13%; width: 36px">${svgPresente("#f2c94c", "#d9363e")}</div>
        <div class="nt-boneco" style="position: absolute; right: 3%; bottom: 10px; width: clamp(56px, 7vw, 84px)"><span class="nt-fala">Brrr!</span>${svgBoneco()}</div>
      </div>`);
  }
}

// ----- Trenó: passa pelo céu de tempos em tempos -----
function voarTreno() {
  const ceu = document.querySelector(".nt-ceu");
  const treno = ceu?.querySelector(".nt-treno");
  if (!treno) return;
  const passar = () => {
    if (!document.body.contains(ceu)) return;           // tema desligado
    const L = window.innerWidth, A = ceu.clientHeight;
    const praDireita = Math.random() < 0.5;
    const y0 = A * (0.15 + Math.random() * 0.5);
    const ondas = [0, 0.25, 0.5, 0.75, 1].map(t => ({
      transform: `translate(${praDireita ? -260 + t * (L + 520) : L + 260 - t * (L + 520)}px, ${y0 + Math.sin(t * Math.PI * 2) * 30 - t * 40}px) scaleX(${praDireita ? 1 : -1})`,
    }));
    treno.style.visibility = "visible";
    const anim = treno.animate(ondas, { duration: 11000 + Math.random() * 5000, easing: "linear" });
    anim.onfinish = () => { treno.style.visibility = "hidden"; setTimeout(passar, 18000 + Math.random() * 25000); };
  };
  treno.style.visibility = "hidden";
  setTimeout(passar, 3000 + Math.random() * 5000);
}

// Presentes caindo de um ponto (o trenó)
function soltarPresentes(x, y, qtd = 6) {
  const cores = [["#d9363e", "#f2c94c"], ["#2f7a46", "#f6f3ee"], ["#4ea1ff", "#f2c94c"], ["#f2c94c", "#d9363e"]];
  for (let i = 0; i < qtd; i++) {
    const p = document.createElement("div");
    p.className = "nt-presente-caindo";
    p.dataset.decoracao = "";
    const [cor, fita] = cores[i % cores.length];
    p.innerHTML = svgPresente(cor, fita);
    p.style.left = x + "px";
    p.style.top = y + "px";
    p.style.width = 20 + Math.random() * 16 + "px";
    document.body.appendChild(p);
    const queda = window.innerHeight - y + 60;
    p.animate([
      { transform: "translate(0, 0) rotate(0)" },
      { transform: `translate(${(Math.random() * 160 - 80).toFixed(0)}px, ${queda}px) rotate(${(Math.random() * 720 - 360).toFixed(0)}deg)` },
    ], { duration: 1800 + Math.random() * 900, delay: i * 90, easing: "cubic-bezier(.4,0,.9,.6)", fill: "both" })
      .onfinish = () => p.remove();
  }
}

// Nevasca (clique na estrela grande): muitos flocos caindo rápido por alguns segundos
function nevasca() {
  for (let i = 0; i < 90; i++) {
    const f = document.createElement("i");
    f.className = "nt-floco-forte";
    f.dataset.decoracao = "";
    const tam = 3 + Math.random() * 6;
    f.style.cssText = `left: ${Math.random() * 100}vw; width: ${tam}px; height: ${tam}px;
      animation-duration: ${1.8 + Math.random() * 1.8}s; animation-delay: ${Math.random() * 1.2}s; --vento: ${Math.random() * 200 - 60}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 5500);
  }
}

// Estrelinhas saindo de um presente aberto
function estrelinhas(el) {
  for (let i = 0; i < 8; i++) {
    const e = document.createElement("span");
    e.className = "nt-faisca";
    const ang = (i / 8) * Math.PI * 2;
    e.style.setProperty("--dx", Math.cos(ang) * 40 + "px");
    e.style.setProperty("--dy", Math.sin(ang) * 40 - 30 + "px");
    e.style.background = CORES_LUZES[i % 4];
    el.appendChild(e);
    setTimeout(() => e.remove(), 900);
  }
}

// Som de sino (Web Audio, sem arquivos)
let somNatal = null;
function tocarSino() {
  try {
    somNatal = somNatal || new (window.AudioContext || window.webkitAudioContext)();
    const agora = somNatal.currentTime;
    [880, 1320, 1760].forEach((f, k) => {
      const o = somNatal.createOscillator(), g = somNatal.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.05 / (k + 1), agora);
      g.gain.exponentialRampToValueAtTime(0.0001, agora + 1.4);
      o.connect(g).connect(somNatal.destination);
      o.start(agora);
      o.stop(agora + 1.4);
    });
  } catch (e) {}
}

// ----- Guerra de bola de neve -----
let bolaNaMao = null;

function pegarBola(e) {
  if (bolaNaMao) return;
  bolaNaMao = document.createElement("div");
  bolaNaMao.className = "nt-bola nt-bola-mao";
  bolaNaMao.dataset.decoracao = "";
  document.body.appendChild(bolaNaMao);
  document.documentElement.classList.add("nt-segurando");
  moverBola(e);
  document.addEventListener("pointermove", moverBola);
}

function moverBola(e) {
  if (bolaNaMao) bolaNaMao.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 10}px)`;
}

function soltarBola() {
  bolaNaMao?.remove();
  bolaNaMao = null;
  document.documentElement.classList.remove("nt-segurando");
  document.removeEventListener("pointermove", moverBola);
}

// A bola sai da mão, faz uma curva e se espatifa no ponto clicado
function arremessar(x, y) {
  const r = bolaNaMao.getBoundingClientRect();
  const x0 = r.left, y0 = r.top;
  soltarBola();
  const alvo = document.elementFromPoint(x, y);
  const bola = document.createElement("div");
  bola.className = "nt-bola";
  bola.dataset.decoracao = "";
  document.body.appendChild(bola);
  const meioX = (x0 + x) / 2, meioY = Math.min(y0, y) - 60 - Math.abs(x - x0) * 0.08;
  bola.animate([
    { transform: `translate(${x0}px, ${y0}px) scale(1.2)` },
    { transform: `translate(${meioX}px, ${meioY}px) scale(1)` },
    { transform: `translate(${x - 9}px, ${y - 9}px) scale(0.85)` },
  ], { duration: 420, easing: "cubic-bezier(.3,.1,.7,1)" }).onfinish = () => {
    bola.remove();
    espatifar(x, y);
    reagirABola(alvo, x, y);
  };
}

function espatifar(x, y) {
  const s = document.createElement("div");
  s.className = "nt-splash";
  s.dataset.decoracao = "";
  s.innerHTML = svgSplash();
  s.style.left = x + "px";
  s.style.top = y + "px";
  s.style.setProperty("--giro", Math.floor(Math.random() * 360) + "deg");
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 2600);
}

// Acertou uma decoração? Cada uma reage de um jeito
function reagirABola(alvo, x, y) {
  if (!alvo) return;
  const animar = (el, classe, ms) => {
    el.classList.remove(classe); void el.offsetWidth; el.classList.add(classe);
    clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove(classe), ms);
  };
  const boneco = alvo.closest(".nt-boneco");
  const treno = alvo.closest(".nt-treno");
  const sino = alvo.closest(".nt-sino");
  const arvore = alvo.closest(".nt-arvore");
  if (boneco) animar(boneco, "sem-cartola", 2600);           // a cartola voa longe
  else if (treno) soltarPresentes(x, y, 8);                   // derruba presentes
  else if (sino) { animar(sino, "tocando", 1400); tocarSino(); }
  else if (arvore) animar(arvore, "acesa", 2200);
}

// Arremesso: pega o clique ANTES de tudo (fase de captura), para não clicar em links/botões sem querer
document.addEventListener("click", (e) => {
  if (!bolaNaMao) return;
  e.preventDefault();
  e.stopPropagation();
  arremessar(e.clientX, e.clientY);
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") soltarBola(); });

// ----- Interações do Natal -----
document.addEventListener("click", (e) => {
  const alvo = e.target.closest(".nt-lampada, .nt-sino, .nt-arvore, .nt-presente, .nt-bengala, .nt-boneco, .nt-monte, .nt-treno, .nt-estrela-guia");
  if (!alvo) return;
  const animar = (el, classe, ms) => {
    el.classList.remove(classe); void el.offsetWidth; el.classList.add(classe);
    clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove(classe), ms);
  };
  const c = alvo.classList;
  if (c.contains("nt-monte")) { animar(alvo, "pegando", 400); pegarBola(e); }   // pega uma bola de neve
  else if (c.contains("nt-lampada")) {                                           // troca o jeito de piscar
    const fio = alvo.closest(".nt-luzes");
    const modo = (Number(fio.dataset.modo || 0) + 1) % 4;
    fio.dataset.modo = modo;
    fio.className = `nt-luzes modo-${modo}`;
  }
  else if (c.contains("nt-sino")) { animar(alvo, "tocando", 1400); tocarSino(); }  // balança e toca
  else if (c.contains("nt-arvore")) animar(alvo, "acesa", 2200);                   // acende e balança
  else if (c.contains("nt-presente")) {                                             // abre e saem estrelinhas
    animar(alvo, "aberto", 900);
    estrelinhas(alvo);
  }
  else if (c.contains("nt-bengala")) animar(alvo, "girando", 700);
  else if (c.contains("nt-boneco")) animar(alvo, "tremendo", 2000);                 // treme de frio e "Brrr!"
  else if (c.contains("nt-treno")) { const r = alvo.getBoundingClientRect(); soltarPresentes(r.left + r.width / 3, r.top + r.height / 2); }
  else if (c.contains("nt-estrela-guia")) nevasca();
});
