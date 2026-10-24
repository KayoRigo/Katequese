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
];

// Chamado pelo banco.js depois de ler a configuração do site.
// Guarda uma cópia no navegador para o tema já aparecer na próxima abertura,
// antes mesmo de o banco responder (e na tela de login).
function aplicarTemaGlobal(id) {
  const existe = TEMAS_GLOBAIS.some(t => t.id === id);
  try { existe ? localStorage.setItem("temaGlobal", id) : localStorage.removeItem("temaGlobal"); } catch (e) {}

  removerDecoracoes();
  if (!existe) {
    delete document.documentElement.dataset.temaGlobal;
    return;
  }
  document.documentElement.dataset.temaGlobal = id; // vira <html data-tema-global="...">
  if (id === "halloween") decorarHalloween();
}

// Aplica já a cor do último tema global conhecido (as decorações entram quando a página termina de carregar)
(function () {
  let id = null;
  try { id = localStorage.getItem("temaGlobal"); } catch (e) {}
  if (TEMAS_GLOBAIS.some(t => t.id === id)) {
    document.documentElement.dataset.temaGlobal = id;
    document.addEventListener("DOMContentLoaded", () => {
      if (document.documentElement.dataset.temaGlobal === "halloween") decorarHalloween();
    });
  }
})();

function removerDecoracoes() {
  document.querySelectorAll("[data-decoracao]").forEach(el => el.remove());
}

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
