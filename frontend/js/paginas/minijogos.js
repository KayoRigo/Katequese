// =====================================================================
// minijogos.js — os minijogos de cada profissão e a janela do "turno".
//
// Como um turno funciona:
//   1) A pessoa clica em Trabalhar → abre a janela com as instruções.
//   2) "Começar" chama comecar_trabalho no banco (a espera já começa a contar).
//   3) Contagem 3, 2, 1 → minijogo → ele devolve um desempenho de 0 a 100.
//   4) trabalhar(id, desempenho) no banco paga e devolve o resultado.
//
// Cada minijogo é uma função jogoX(ctx) que devolve uma Promise com o
// desempenho. O ctx tem:
//   ctx.palco      → o elemento onde o jogo é desenhado
//   ctx.ajuda      → 0, 1, 2... (equipamentos deixam o jogo mais fácil)
//   ctx.placar(t)  → texto do placar no topo da janela
//   ctx.tempo(f)   → barrinha de tempo/progresso (1 = cheia, 0 = vazia)
//   ctx.repetir(fn)→ chama fn a cada quadro (60x por segundo) até ela devolver false
// =====================================================================

const agora = () => performance.now();
const entre = (min, max) => min + Math.random() * (max - min);

// Os minijogos de cada profissão
const MINIJOGOS = {
  entregador: {
    nome: "Rota de entregas",
    como: "Clique nos pontos de entrega na ordem: 1, 2, 3... Clicar no ponto errado custa 1 segundo.",
    ajuda: "Veículo e GPS dão mais tempo.",
    jogar: jogoEntregador,
  },
  churrasqueiro: {
    nome: "Ponto da carne",
    como: "Clique em cada carne quando a barrinha estiver na faixa verde. Antes disso está crua; depois, passou.",
    ajuda: "Os equipamentos deixam a faixa verde maior.",
    jogar: jogoChurrasco,
  },
  dj: {
    nome: "Sequência",
    como: "Preste atenção na ordem em que os botões acendem e repita. A cada rodada a sequência aumenta.",
    ajuda: "Os equipamentos tocam a sequência mais devagar e dão vidas extras.",
    jogar: jogoDJ,
  },
  programador: {
    nome: "Caça aos bugs",
    como: "Clique nos bugs antes que eles sumam. Não clique nos testes que passaram (marcados com ✓).",
    ajuda: "Os equipamentos deixam os bugs mais tempo na tela.",
    jogar: jogoProgramador,
  },
  empresario: {
    nome: "Negociação",
    como: "Clique em \"Fechar acordo\" quando o marcador estiver dentro da faixa. São 5 negociações.",
    ajuda: "Os equipamentos deixam a faixa maior e o marcador mais lento.",
    jogar: jogoEmpresario,
  },
};


// =====================================================================
// A JANELA DO TURNO
// =====================================================================
// trabalho: linha da tabela "trabalhos". aoTerminar: chamada depois de fechar.
function abrirTurno(trabalho, aoTerminar) {
  const jogo = MINIJOGOS[trabalho.id] || MINIJOGOS.entregador;
  const janela = document.createElement("dialog");
  janela.className = "janela janela-jogo";
  janela.innerHTML = `
    <div class="mj-topo">
      <div>
        <span class="rotulo">${esc(trabalho.nome)}</span>
        <h2>${esc(jogo.nome)}</h2>
      </div>
      <b class="mj-placar" id="mj-placar"></b>
    </div>
    <div class="mj-tempo" hidden><div id="mj-tempo"></div></div>
    <div class="mj-palco" id="mj-palco">
      <div class="mj-intro">
        <p>${esc(jogo.como)}</p>
        <p class="eco-dica">${esc(jogo.ajuda)} Quanto melhor você jogar, mais recebe e maior a chance de ${esc(trabalho.nome_extra.toLowerCase())}.</p>
        <p class="eco-dica">Depois de começar, a espera do trabalho já conta: se fechar no meio, perde o turno.</p>
        <div class="mj-botoes">
          <button class="botao-pequeno" data-fechar>Agora não</button>
          <button class="botao" data-comecar>Começar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(janela);

  let jogando = false;
  // Esc só fecha antes de começar ou depois de terminar
  janela.addEventListener("cancel", (e) => { if (jogando) e.preventDefault(); });
  janela.addEventListener("close", () => { janela.remove(); aoTerminar?.(); });
  janela.querySelector("[data-fechar]").addEventListener("click", () => janela.close());

  janela.querySelector("[data-comecar]").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    const { data: turno, error } = await sb.rpc("comecar_trabalho", { id_trabalho: trabalho.id });
    if (error) {
      avoEcoSeguro(error.message);
      janela.close();
      return;
    }
    jogando = true;
    const comecou = agora();
    prepararSom();

    const palco = janela.querySelector("#mj-palco");
    const placarEl = janela.querySelector("#mj-placar");
    const tempoEl = janela.querySelector("#mj-tempo");
    tempoEl.parentElement.hidden = false;
    tempoEl.style.width = "100%";

    await contagemRegressiva(palco);

    // Contexto que o minijogo recebe
    let laco = null;
    const ctx = {
      palco,
      ajuda: Math.min(4, turno?.ajuda || 0),
      placar: (t) => { placarEl.textContent = t; },
      tempo: (f) => { tempoEl.style.width = Math.max(0, Math.min(1, f)) * 100 + "%"; tempoEl.classList.toggle("acabando", f < 0.25); },
      repetir: (fn) => {
        const quadro = () => { if (fn() !== false && janela.open) laco = requestAnimationFrame(quadro); };
        laco = requestAnimationFrame(quadro);
      },
    };
    palco.innerHTML = "";
    let desempenho = 0;
    try {
      desempenho = Math.round(await jogo.jogar(ctx));
    } catch (erro) {
      console.error(erro);
    }
    cancelAnimationFrame(laco);
    placarEl.textContent = "";
    tempoEl.parentElement.hidden = true;

    // O banco só aceita fechar o turno depois de alguns segundos
    palco.innerHTML = `<p class="mj-fechando">Fechando o turno...</p>`;
    const falta = 4500 - (agora() - comecou);
    if (falta > 0) await espera(falta);

    const { data, error: erro2 } = await sb.rpc("trabalhar", { id_trabalho: trabalho.id, desempenho });
    jogando = false;
    if (erro2) {
      palco.innerHTML = `<p class="mj-fechando">${esc(erro2.message)}</p>
        <div class="mj-botoes"><button class="botao" data-fechar>Fechar</button></div>`;
      palco.querySelector("[data-fechar]").addEventListener("click", () => janela.close());
      return;
    }
    mostrarResultadoTurno(palco, data, trabalho, () => janela.close());
  });

  janela.showModal();
}

// Mostra o aviso de erro da economia, se existir (o economia.js define avisoEco)
function avoEcoSeguro(msg) {
  if (typeof avisoEco === "function") avisoEco(esc(msg), "erro");
  else avisarJanela(msg);
}

// 3, 2, 1 grande no meio do palco
async function contagemRegressiva(palco) {
  for (const n of ["3", "2", "1"]) {
    palco.innerHTML = `<div class="mj-contagem">${n}</div>`;
    tocar(392, 0.08);
    await espera(650);
  }
  tocar(784, 0.12);
}

// Tela final: desempenho, pagamento contando, extra e níveis
async function mostrarResultadoTurno(palco, r, trabalho, fechar) {
  const notaTexto = r.desempenho >= 90 ? "Excelente" : r.desempenho >= 70 ? "Bom" : r.desempenho >= 40 ? "Regular" : "Fraco";
  palco.innerHTML = `
    <div class="mj-resultado">
      <div class="mj-nota">
        <span class="rotulo">Desempenho</span>
        <strong><span id="res-nota">0</span>%</strong>
        <small>${notaTexto}</small>
        <div class="barra-xp"><div id="res-barra" style="width: 0"></div></div>
      </div>
      <ul class="mj-ganhos">
        <li><span>Pagamento</span><b id="res-ganho">K$ 0</b></li>
        <li class="mj-extra ${r.extra > 0 ? "" : "sem"}" id="res-extra" hidden>
          <span>${esc(r.nome_extra)}</span><b>${r.extra > 0 ? "+ " + moeda(r.extra) : "não veio desta vez"}</b>
        </li>
        <li><span>Experiência</span><b>+ ${r.xp_ganho} XP</b></li>
      </ul>
      <div class="mj-niveis" id="res-niveis"></div>
      <div class="mj-botoes"><button class="botao" data-fechar>Fechar</button></div>
    </div>`;
  palco.querySelector("[data-fechar]").addEventListener("click", fechar);

  // Animações em sequência
  palco.querySelector("#res-barra").style.width = r.desempenho + "%";
  await animarNumero(palco.querySelector("#res-nota"), 0, r.desempenho, 700, (n) => String(n));
  await animarNumero(palco.querySelector("#res-ganho"), 0, r.ganho, 900, moeda);
  tocar(660, 0.1);
  const extra = palco.querySelector("#res-extra");
  await espera(250);
  extra.hidden = false;
  if (r.extra > 0) {
    extra.classList.add("apareceu");
    tocar(880, 0.12);
    chuvaMoedas(palco.querySelector(".mj-resultado"), 18);
  }
  const niveis = [];
  if (r.subiu_trabalho) niveis.push(`Nível ${r.nivel_trabalho} como ${esc(trabalho.nome)}`);
  if (r.subiu_nivel) niveis.push(`Você chegou ao nível ${r.nivel}`);
  if (niveis.length) {
    await espera(300);
    palco.querySelector("#res-niveis").innerHTML = niveis.map(t => `<p>${t}</p>`).join("");
  }
  if (typeof mostrarSaldo === "function") mostrarSaldo(r.saldo);
}


// =====================================================================
// AJUDANTES VISUAIS (usados também pelo cassino)
// =====================================================================

// Número que vai contando de "de" até "para"
function animarNumero(el, de, para, ms = 800, formato = moeda) {
  return new Promise(ok => {
    // Aba escondida não desenha animações: mostra o valor final direto
    if (document.hidden) { el.textContent = formato(para); return ok(); }
    const inicio = agora();
    const passo = () => {
      const t = Math.min(1, (agora() - inicio) / ms);
      const suave = 1 - Math.pow(1 - t, 3);
      el.textContent = formato(Math.round(de + (para - de) * suave));
      if (t < 1) requestAnimationFrame(passo); else ok();
    };
    requestAnimationFrame(passo);
  });
}

// Moedinhas caindo dentro de um elemento (para prêmios)
function chuvaMoedas(container, quantidade = 24) {
  if (!container) return;
  const camada = document.createElement("div");
  camada.className = "chuva-moedas";
  container.appendChild(camada);
  for (let i = 0; i < quantidade; i++) {
    const m = document.createElement("i");
    m.style.left = entre(4, 96) + "%";
    camada.appendChild(m);
    const altura = container.clientHeight + 40;
    m.animate([
      { transform: `translateY(-30px) rotateY(0deg)`, opacity: 1 },
      { transform: `translateY(${altura}px) rotateY(${entre(360, 1080)}deg)`, opacity: 0.9 },
    ], { duration: entre(900, 1700), delay: entre(0, 500), easing: "cubic-bezier(.4,.1,.8,.6)", fill: "both" });
  }
  setTimeout(() => camada.remove(), 2400);
}

// Sons curtinhos (bipes) com o Web Audio, sem arquivos
let somCtx = null;
function prepararSom() {
  try { somCtx = somCtx || new (window.AudioContext || window.webkitAudioContext)(); somCtx.resume(); } catch { somCtx = null; }
}
function tocar(freq, duracao = 0.15, tipo = "triangle") {
  if (!somCtx) return;
  try {
    const osc = somCtx.createOscillator();
    const vol = somCtx.createGain();
    osc.type = tipo;
    osc.frequency.value = freq;
    vol.gain.setValueAtTime(0.06, somCtx.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.0001, somCtx.currentTime + duracao);
    osc.connect(vol).connect(somCtx.destination);
    osc.start();
    osc.stop(somCtx.currentTime + duracao);
  } catch {}
}

// Treme um elemento (erro)
function tremer(el) {
  el.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }],
    { duration: 300 });
}

// Texto que sobe e some (ex: "−1 s", "+1")
function textoFlutuante(pai, texto, x, y, classe = "") {
  const el = document.createElement("span");
  el.className = "mj-flutua " + classe;
  el.textContent = texto;
  el.style.left = x + "px";
  el.style.top = y + "px";
  pai.appendChild(el);
  setTimeout(() => el.remove(), 900);
}


// =====================================================================
// 1) ENTREGADOR — Rota de entregas
// =====================================================================
// 8 pontos espalhados num mapa; clicar na ordem. Nota: 90% pelas entregas
// feitas + até 10% pelo tempo que sobrou (se entregar tudo).
function jogoEntregador(ctx) {
  return new Promise(fim => {
    const N = 8;
    const total = 9000 + ctx.ajuda * 1500;
    const pontos = posicoesSoltas(N, 15);
    ctx.palco.innerHTML = `
      <div class="mj-mapa">
        <svg class="mj-rota" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="" /></svg>
        ${pontos.map((p, i) => `<button class="mj-ponto ${i === 0 ? "alvo" : ""}" data-i="${i}" style="left: ${p.x}%; top: ${p.y}%">${i + 1}</button>`).join("")}
      </div>`;
    const mapa = ctx.palco.querySelector(".mj-mapa");
    const linha = mapa.querySelector("polyline");
    let proximo = 0, penalidade = 0, acabou = false;
    const inicio = agora();
    const restante = () => total - (agora() - inicio) - penalidade;
    ctx.placar(`0/${N} entregues`);

    mapa.addEventListener("click", (e) => {
      const botao = e.target.closest(".mj-ponto");
      if (!botao || acabou || botao.classList.contains("feito")) return;
      const i = Number(botao.dataset.i);
      const caixa = mapa.getBoundingClientRect();
      if (i === proximo) {
        botao.classList.remove("alvo");
        botao.classList.add("feito");
        tocar(520 + proximo * 40, 0.08);
        proximo++;
        linha.setAttribute("points", pontos.slice(0, proximo).map(p => `${p.x},${p.y}`).join(" "));
        ctx.placar(`${proximo}/${N} entregues`);
        if (proximo === N) return terminar();
        mapa.querySelector(`[data-i="${proximo}"]`).classList.add("alvo");
      } else {
        penalidade += 1000;
        tremer(botao);
        tocar(150, 0.15, "square");
        textoFlutuante(mapa, "−1 s", e.clientX - caixa.left, e.clientY - caixa.top, "ruim");
      }
    });

    ctx.repetir(() => {
      if (acabou) return false;
      const r = restante();
      ctx.tempo(r / total);
      if (r <= 0) { terminar(); return false; }
    });

    function terminar() {
      if (acabou) return;
      acabou = true;
      const sobra = Math.max(0, restante()) / total;
      fim(Math.round((proximo / N) * 90 + (proximo === N ? 10 * Math.min(1, sobra * 2) : 0)));
    }
  });
}

// Sorteia posições (em %) que não fiquem muito perto umas das outras
function posicoesSoltas(n, distancia) {
  const lista = [];
  let tentativas = 0;
  while (lista.length < n && tentativas < 2000) {
    tentativas++;
    const p = { x: Math.round(entre(8, 92)), y: Math.round(entre(12, 88)) };
    if (lista.every(q => Math.hypot(q.x - p.x, (q.y - p.y) * 0.62) >= distancia)) lista.push(p);
  }
  return lista;
}


// =====================================================================
// 2) CHURRASQUEIRO — Ponto da carne
// =====================================================================
// 12 carnes aparecem numa grelha de 6 lugares; cada uma vai assando.
// Clicar com a barrinha na faixa verde = no ponto. Nota = % no ponto.
function jogoChurrasco(ctx) {
  return new Promise(fim => {
    const VAGAS = 6, TOTAL = 12;
    const faixa = [0.6 - 0.035 * ctx.ajuda, 0.78 + 0.035 * ctx.ajuda];
    ctx.palco.innerHTML = `<div class="mj-grelha">${[...Array(VAGAS)].map((_, i) => `<div class="mj-vaga" data-v="${i}"></div>`).join("")}</div>`;
    const vagas = [...ctx.palco.querySelectorAll(".mj-vaga")];
    const carnes = Array(VAGAS).fill(null);
    let colocadas = 0, resolvidas = 0, acertos = 0, ultimaColocada = 0, acabou = false;
    const nomes = ["Picanha", "Linguiça", "Coração", "Fraldinha", "Costela", "Asinha"];
    ctx.placar(`0 no ponto`);

    function colocar() {
      const livres = carnes.map((c, i) => c ? -1 : i).filter(i => i >= 0);
      if (!livres.length || colocadas >= TOTAL) return;
      const v = sortear(livres);
      const el = document.createElement("button");
      el.className = "mj-carne";
      el.innerHTML = `<span class="mj-peca"></span><small>${sortear(nomes)}</small>
        <span class="mj-assado"><i style="left: ${faixa[0] * 100 / 1.15}%; width: ${(faixa[1] - faixa[0]) * 100 / 1.15}%"></i><b></b></span>`;
      vagas[v].appendChild(el);
      carnes[v] = { el, inicio: agora(), dur: entre(3000, 4400), v };
      colocadas++;
      ultimaColocada = agora();
    }

    function resolver(c, texto, classe) {
      carnes[c.v] = null;
      resolvidas++;
      c.el.disabled = true;
      c.el.classList.add("saiu", classe);
      c.el.querySelector("small").textContent = texto;
      setTimeout(() => c.el.remove(), 600);
      ctx.placar(`${acertos} no ponto`);
      if (resolvidas >= TOTAL) { acabou = true; fim((acertos / TOTAL) * 100); }
    }

    ctx.palco.querySelector(".mj-grelha").addEventListener("click", (e) => {
      const el = e.target.closest(".mj-carne");
      const c = carnes.find(x => x && x.el === el);
      if (!c || acabou) return;
      const p = (agora() - c.inicio) / c.dur;
      if (p >= faixa[0] && p <= faixa[1]) {
        acertos++;
        tocar(700, 0.1);
        resolver(c, "No ponto", "boa");
      } else {
        tocar(160, 0.15, "square");
        resolver(c, p < faixa[0] ? "Crua" : "Passou", "ruim");
      }
    });

    colocar(); colocar(); colocar();
    ctx.repetir(() => {
      if (acabou) return false;
      if (agora() - ultimaColocada > 1200) colocar();
      for (const c of carnes) {
        if (!c) continue;
        const p = (agora() - c.inicio) / c.dur;
        c.el.querySelector(".mj-peca").style.background = corDaCarne(p);
        c.el.querySelector(".mj-assado b").style.left = Math.min(100, (p / 1.15) * 100) + "%";
        c.el.classList.toggle("fumaca", p > 0.9);
        if (p >= 1.15) { tocar(120, 0.2, "square"); resolver(c, "Queimou", "ruim"); }
      }
      ctx.tempo(1 - resolvidas / TOTAL);
    });
  });
}

// Cor da carne conforme assa: rosada → dourada → marrom → preta
function corDaCarne(p) {
  const paradas = [[0, [214, 120, 120]], [0.68, [176, 98, 52]], [1, [110, 58, 30]], [1.15, [35, 25, 20]]];
  for (let i = 1; i < paradas.length; i++) {
    if (p <= paradas[i][0]) {
      const [p0, c0] = paradas[i - 1], [p1, c1] = paradas[i];
      const t = Math.max(0, (p - p0) / (p1 - p0));
      return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * t)).join(",")})`;
    }
  }
  return "rgb(35,25,20)";
}


// =====================================================================
// 3) DJ — Sequência
// =====================================================================
// 6 rodadas: a sequência começa com 3 e aumenta 1 por rodada.
// Errou: perde uma vida e ouve de novo. Nota = rodadas completas / 6.
async function jogoDJ(ctx) {
  const RODADAS = 6;
  const NOTAS = [262, 330, 392, 523];
  const velocidade = 470 + 70 * ctx.ajuda;
  let vidas = 1 + Math.min(2, ctx.ajuda);
  ctx.palco.innerHTML = `
    <div class="mj-pads">${NOTAS.map((_, i) => `<button class="mj-pad pad-${i}" data-p="${i}" disabled></button>`).join("")}</div>
    <p class="mj-msg" id="mj-msg"></p>`;
  const pads = [...ctx.palco.querySelectorAll(".mj-pad")];
  const msg = ctx.palco.querySelector("#mj-msg");
  const seq = [...Array(3 + RODADAS - 1)].map(() => Math.floor(Math.random() * 4));
  let completas = 0;

  const acender = async (i, ms) => {
    pads[i].classList.add("aceso");
    tocar(NOTAS[i], ms / 1000, "square");
    await espera(ms * 0.7);
    pads[i].classList.remove("aceso");
    await espera(ms * 0.3);
  };
  const placar = () => ctx.placar(`Rodada ${Math.min(completas + 1, RODADAS)}/${RODADAS} · ${vidas} ${vidas === 1 ? "vida" : "vidas"}`);

  // Espera a pessoa repetir; devolve true (acertou tudo) ou false (errou)
  const ouvir = (tamanho) => new Promise(ok => {
    let pos = 0;
    pads.forEach(p => p.disabled = false);
    const clique = async (e) => {
      const b = e.target.closest(".mj-pad");
      if (!b) return;
      const i = Number(b.dataset.p);
      b.classList.add("aceso");
      tocar(NOTAS[i], 0.18, "square");
      setTimeout(() => b.classList.remove("aceso"), 160);
      if (i !== seq[pos]) { acabar(false); return; }
      pos++;
      if (pos >= tamanho) acabar(true);
    };
    const acabar = (resultado) => {
      ctx.palco.removeEventListener("click", clique);
      pads.forEach(p => p.disabled = true);
      ok(resultado);
    };
    ctx.palco.addEventListener("click", clique);
  });

  while (completas < RODADAS && vidas > 0) {
    placar();
    ctx.tempo(1 - completas / RODADAS);
    const tamanho = 3 + completas;
    msg.textContent = "Ouça...";
    await espera(500);
    for (let k = 0; k < tamanho; k++) await acender(seq[k], velocidade);
    msg.textContent = "Sua vez";
    const acertou = await ouvir(tamanho);
    if (acertou) {
      completas++;
      msg.textContent = completas < RODADAS ? "Isso. Próxima rodada." : "Sequência completa.";
      ctx.palco.querySelector(".mj-pads").animate([{ transform: "scale(1)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }], { duration: 300 });
    } else {
      vidas--;
      tremer(ctx.palco.querySelector(".mj-pads"));
      tocar(140, 0.3, "sawtooth");
      msg.textContent = vidas > 0 ? "Errou. Ouça de novo." : "Errou.";
    }
    await espera(700);
  }
  ctx.tempo(1 - completas / RODADAS);
  placar();
  return (completas / RODADAS) * 100;
}


// =====================================================================
// 4) PROGRAMADOR — Caça aos bugs
// =====================================================================
// 16 coisas aparecem em linhas de código: ~85% bugs (clicar) e ~15% testes
// que passaram (não clicar). Nota = (bugs pegos − cliques errados) / bugs
// (pegar 90% dos bugs já dá 100).
function jogoProgramador(ctx) {
  return new Promise(fim => {
    const TOTAL = 16;
    const vidaBug = 1500 + 250 * ctx.ajuda;   // quanto tempo cada bug fica na tela (ms)
    const linhas = [
      "const site = criar();", "if (!usuario) return;", "for (let i = 0; i < n; i++)", "await sb.from(\"eventos\")",
      "botao.addEventListener(", "return dados.map(esc);", "let total = soma(lista);", "export default App;",
      "fetch(url).then(r => r.json())", "el.innerHTML = html;", "while (fila.length) {", "console.log(\"ok\");",
    ];
    ctx.palco.innerHTML = `<div class="mj-codigo">${linhas.map((l, i) => `<div class="mj-linha" data-l="${i}"><span class="mj-num">${i + 1}</span><code>${esc(l)}</code></div>`).join("")}</div>`;
    const celulas = [...ctx.palco.querySelectorAll(".mj-linha")];
    const ocupada = Array(celulas.length).fill(null);
    let surgidos = 0, bugs = 0, pegos = 0, erros = 0, resolvidos = 0, ultimo = 0, acabou = false;
    ctx.placar("0 bugs corrigidos");

    function surgir() {
      const livres = ocupada.map((o, i) => o ? -1 : i).filter(i => i >= 0);
      if (!livres.length || surgidos >= TOTAL) return;
      const l = sortear(livres);
      const ehBug = Math.random() < 0.85 || (surgidos === TOTAL - 1 && bugs === 0);
      const el = document.createElement("button");
      el.className = ehBug ? "mj-bug" : "mj-ok";
      el.innerHTML = ehBug ? SVG_BUG : "✓";
      el.style.left = entre(45, 85) + "%";
      celulas[l].appendChild(el);
      ocupada[l] = { el, ehBug, nasceu: agora(), vida: ehBug ? vidaBug : 1300, l };
      surgidos++;
      if (ehBug) bugs++;
      ultimo = agora();
    }

    function sair(o, classe) {
      ocupada[o.l] = null;
      resolvidos++;
      o.el.disabled = true;
      celulas[o.l].classList.add(classe);
      setTimeout(() => celulas[o.l].classList.remove(classe), 350);
      o.el.classList.add("sumindo");
      setTimeout(() => o.el.remove(), 200);
      // Pegar 90% dos bugs já vale nota máxima
      if (resolvidos >= TOTAL) { acabou = true; fim(bugs ? Math.min(100, Math.max(0, pegos - erros) / bugs * 100 / 0.9) : 0); }
    }

    ctx.palco.querySelector(".mj-codigo").addEventListener("click", (e) => {
      const el = e.target.closest(".mj-bug, .mj-ok");
      const o = ocupada.find(x => x && x.el === el);
      if (!o || acabou) return;
      if (o.ehBug) { pegos++; tocar(760, 0.08); sair(o, "corrigida"); }
      else { erros++; tocar(150, 0.2, "square"); tremer(celulas[o.l]); sair(o, "quebrou"); }
      ctx.placar(`${pegos} ${pegos === 1 ? "bug corrigido" : "bugs corrigidos"}${erros ? ` · ${erros} ${erros === 1 ? "erro" : "erros"}` : ""}`);
    });

    ctx.repetir(() => {
      if (acabou) return false;
      if (agora() - ultimo > 800) surgir();
      for (const o of ocupada) {
        if (o && agora() - o.nasceu > o.vida) sair(o, o.ehBug ? "escapou" : "passou");
      }
      ctx.tempo(1 - resolvidos / TOTAL);
    });
    surgir();
  });
}

const SVG_BUG = `<svg viewBox="0 0 32 32"><g stroke="#2a1a14" stroke-width="2" stroke-linecap="round"><path d="M9 12L4 9M9 17H3M9 22l-5 3M23 12l5-3M23 17h6M23 22l5 3M13 7l-2-4M19 7l2-4"/></g><ellipse cx="16" cy="18" rx="7" ry="9" fill="#5fbf77" stroke="#2a1a14" stroke-width="2"/><circle cx="16" cy="9" r="4" fill="#2a1a14"/><path d="M16 11v15" stroke="#2a1a14" stroke-width="1.5"/></svg>`;


// =====================================================================
// 5) EMPRESÁRIO — Negociação
// =====================================================================
// 5 negociações: um marcador vai e volta numa barra; clicar com ele dentro
// da faixa. Nota de cada uma pela distância do centro; nota final = média.
function jogoEmpresario(ctx) {
  return new Promise(fim => {
    const RODADAS = 5;
    const largura = 12 + 3 * ctx.ajuda;   // largura da faixa (em %)
    ctx.palco.innerHTML = `
      <div class="mj-negocio">
        <p class="mj-msg" id="mj-msg">Negociação 1 de ${RODADAS}</p>
        <div class="mj-barra-negocio" id="mj-barra">
          <div class="mj-faixa" id="mj-faixa"></div>
          <div class="mj-marcador" id="mj-marcador"></div>
        </div>
        <div class="mj-escala"><span>Proposta baixa</span><span>Proposta alta</span></div>
        <button class="botao mj-fechar" id="mj-fechar">Fechar acordo</button>
        <ol class="mj-acordos" id="mj-acordos"></ol>
      </div>`;
    const faixaEl = ctx.palco.querySelector("#mj-faixa");
    const marcador = ctx.palco.querySelector("#mj-marcador");
    const botao = ctx.palco.querySelector("#mj-fechar");
    const msg = ctx.palco.querySelector("#mj-msg");
    const acordos = ctx.palco.querySelector("#mj-acordos");
    const notas = [];
    let rodada = 0, centro = 50, periodo = 1500, inicioRodada = 0, fase = 0, parado = false, pos = 0;

    function novaRodada() {
      centro = entre(largura / 2 + 6, 94 - largura / 2);
      periodo = 1500 - rodada * 140 + ctx.ajuda * 160;
      fase = Math.random();
      faixaEl.style.left = (centro - largura / 2) + "%";
      faixaEl.style.width = largura + "%";
      msg.textContent = `Negociação ${rodada + 1} de ${RODADAS}`;
      inicioRodada = agora();
      parado = false;
      botao.disabled = false;
      ctx.placar(`${rodada}/${RODADAS} acordos`);
    }

    function fechar() {
      if (parado) return;
      parado = true;
      botao.disabled = true;
      const dist = Math.abs(pos - centro);
      const nota = dist <= largura / 2 ? 100 - (dist / (largura / 2)) * 20 : Math.max(0, 80 - (dist - largura / 2) * 4);
      notas.push(nota);
      const texto = nota >= 90 ? "Acordo excelente" : nota >= 70 ? "Acordo bom" : nota >= 40 ? "Acordo fraco" : "Acordo ruim";
      msg.textContent = texto;
      acordos.insertAdjacentHTML("beforeend", `<li class="${nota >= 70 ? "bom" : "ruim"}">${texto}</li>`);
      marcador.classList.add(nota >= 70 ? "bom" : "ruim");
      tocar(nota >= 70 ? 660 : 180, 0.15, nota >= 70 ? "triangle" : "square");
      rodada++;
      ctx.tempo(1 - rodada / RODADAS);
      setTimeout(() => {
        marcador.classList.remove("bom", "ruim");
        if (rodada >= RODADAS) {
          ctx.placar(`${RODADAS}/${RODADAS} acordos`);
          fim(notas.reduce((a, b) => a + b, 0) / RODADAS);
        } else novaRodada();
      }, 900);
    }

    botao.addEventListener("click", fechar);
    ctx.palco.querySelector("#mj-barra").addEventListener("click", fechar);
    novaRodada();
    ctx.repetir(() => {
      if (rodada >= RODADAS) return false;
      if (parado) return;
      // Vai e volta (onda triangular entre 0 e 100)
      const t = ((agora() - inicioRodada) / periodo + fase) % 2;
      pos = (t < 1 ? t : 2 - t) * 100;
      marcador.style.left = pos + "%";
      // Ficou parado tempo demais sem decidir: fecha sozinho
      if (agora() - inicioRodada > 7000) fechar();
    });
  });
}
