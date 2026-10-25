// =====================================================================
// modulos/economia/cassino.js — Cassino Katequista:
//   - Concessão de Dono do Cassino (30 dias, ganha 25% das perdas dos outros)
//   - Revoada da Katequese (Aviator)
//   - Campo Minado do Churrasco (Bomba 5x5)
//   - Tigrinho da Katequese (Slot 3x3 com 5 linhas + Coringa + Bônus 10x)
//   - Cara ou Coroa, Roleta Europeia e Caça-níquel Clássico
// =====================================================================

// ---------------- Fórmulas matemáticas (iguais às do banco) ----------------

// Multiplicador do Campo Minado 5x5 (25 casas) com RTP de 97%
function multiplicadorBomba(qtdBombas, acertos) {
  const b = Number(qtdBombas) || 3;
  const a = Number(acertos) || 0;
  if (a <= 0) return 1;
  let mult = 1;
  for (let k = 0; k < a; k++) {
    mult *= (25 - k) / (25 - b - k);
  }
  return Math.max(1.01, Math.floor(mult * 0.97 * 100) / 100);
}

// Multiplicador da Revoada (Aviator) pelo tempo de voo em segundos
function multiplicadorVoo(segundos) {
  const s = Math.max(0, Number(segundos) || 0);
  if (s === 0) return 1;
  return Math.max(1, Math.floor(Math.exp(0.12 * s) * 100) / 100);
}

// Comissão de 25% do Dono do Cassino sobre a perda líquida de OUTROS jogadores
function calcularComissaoDono(apostadorId, donoId, aposta, premio = 0, cashback = 0) {
  if (!donoId || apostadorId === donoId) return 0;
  const perda = Number(aposta || 0) - Number(premio || 0) - Number(cashback || 0);
  if (perda <= 0) return 0;
  return Math.floor(perda * 0.25);
}

// As 5 linhas de pagamento da grade 3x3 (índices de 0 a 8: 3 horizontais + 2 diagonais)
const LINHAS_TIGRINHO = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 4, 8],
  [2, 4, 6],
];

// ---------------- Desenhos SVG dos jogos ----------------

const SIMBOLOS = {
  cereja:  `<svg viewBox="0 0 40 40"><path d="M20 6c-2 8-8 12-10 18M20 6c2 8 6 12 8 16" fill="none" stroke="#4caf68" stroke-width="2.5" stroke-linecap="round"/><path d="M20 6c5-2 9 0 11 3-4 1-8 0-11-3z" fill="#4caf68"/><circle cx="11" cy="28" r="7" fill="#d83a3a"/><circle cx="28" cy="27" r="7" fill="#c42f2f"/><circle cx="9" cy="26" r="2" fill="#fff" opacity=".5"/></svg>`,
  limao:   `<svg viewBox="0 0 40 40"><ellipse cx="20" cy="21" rx="14" ry="11" fill="#f2d33c"/><path d="M6 21c-2 0-3-1-3-2M34 21c2 0 3-1 3-2" stroke="#d9b82a" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="15" cy="17" rx="4" ry="2" fill="#fff" opacity=".45"/></svg>`,
  sino:    `<svg viewBox="0 0 40 40"><path d="M20 5c-7 0-11 6-11 13v7l-3 5h28l-3-5v-7c0-7-4-13-11-13z" fill="#e5a93a"/><circle cx="20" cy="33" r="3.5" fill="#b9802a"/><rect x="18" y="2" width="4" height="4" rx="1" fill="#b9802a"/></svg>`,
  estrela: `<svg viewBox="0 0 40 40"><path d="M20 4l4.9 10.6 11.6 1.3-8.6 7.8 2.4 11.4L20 29.3 9.7 35.1l2.4-11.4-8.6-7.8 11.6-1.3z" fill="#f2c94c" stroke="#d9a520" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  sete:    `<svg viewBox="0 0 40 40"><text x="20" y="32" text-anchor="middle" font-family="Archivo, sans-serif" font-size="32" font-weight="900" fill="#e5484d" stroke="#8f1f22" stroke-width="1.5">7</text></svg>`,
};
const NOMES_SIMBOLOS = Object.keys(SIMBOLOS);

// Símbolos do Tigrinho da Katequese (3x3)
const SIMBOLOS_TIGRINHO = {
  laranja:   `<svg viewBox="0 0 44 44"><circle cx="22" cy="24" r="14" fill="#ff8a1f"/><path d="M22 10c2-4 7-5 9-2-3 2-6 3-9 2z" fill="#4caf68"/><circle cx="17" cy="19" r="3" fill="#fff" opacity=".35"/></svg>`,
  chopp:     `<svg viewBox="0 0 44 44"><rect x="10" y="14" width="20" height="24" rx="3" fill="#f2c94c" stroke="#c99a2e" stroke-width="2"/><path d="M30 18h5a4 4 0 0 1 0 12h-5" fill="none" stroke="#c99a2e" stroke-width="3"/><path d="M9 14c0-4 4-6 7-5 2-3 8-3 10 0 3-1 6 1 6 5z" fill="#fff"/></svg>`,
  churrasco: `<svg viewBox="0 0 44 44"><ellipse cx="22" cy="24" rx="15" ry="11" fill="#b84a27" stroke="#6e2610" stroke-width="2"/><ellipse cx="18" cy="22" rx="5" ry="4" fill="#f4efe6"/><path d="M14 14l16 16M28 14L14 28" stroke="#6e2610" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  ouro:      `<svg viewBox="0 0 44 44"><path d="M12 16h20l4 20a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill="#e5b84b" stroke="#a87d22" stroke-width="2"/><text x="22" y="31" text-anchor="middle" font-family="Archivo, sans-serif" font-size="11" font-weight="900" fill="#5a3d06">K$</text></svg>`,
  trofeu:    `<svg viewBox="0 0 44 44"><path d="M14 8h16v10a8 8 0 0 1-16 0z" fill="#f2c94c" stroke="#c99a2e" stroke-width="2"/><path d="M14 11H9a4 4 0 0 0 4 7M30 11h5a4 4 0 0 1-4 7" fill="none" stroke="#c99a2e" stroke-width="2"/><rect x="19" y="26" width="6" height="7" fill="#c99a2e"/><rect x="13" y="33" width="18" height="4" rx="1" fill="#e5b84b"/></svg>`,
  tigrinho:  `<svg viewBox="0 0 44 44"><circle cx="11" cy="12" r="5" fill="#ff9f1c"/><circle cx="33" cy="12" r="5" fill="#ff9f1c"/><circle cx="22" cy="24" r="15" fill="#ff9f1c" stroke="#b85d00" stroke-width="2"/><path d="M15 13h14M17 10h10M10 23h5M29 23h5" stroke="#2a1604" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="21" r="2.2" fill="#1b1208"/><circle cx="27" cy="21" r="2.2" fill="#1b1208"/><ellipse cx="22" cy="27" rx="6" ry="4.5" fill="#fff4e0"/><polygon points="22,24 19,27 25,27" fill="#d94e34"/><text x="22" y="42" text-anchor="middle" font-family="Archivo, sans-serif" font-size="8" font-weight="900" fill="#f2c94c">WILD</text></svg>`,
};
const NOMES_TIGRINHO = Object.keys(SIMBOLOS_TIGRINHO);

const SVG_ESTRELA_BOMBA = `<svg viewBox="0 0 36 36"><path d="M18 4l4.2 9 9.8 1.2-7.2 6.8 2 9.8L18 26l-8.8 4.8 2-9.8-7.2-6.8L13.8 13z" fill="#f2c94c" stroke="#c99a2e" stroke-width="1.5"/></svg>`;
const SVG_BOMBA = `<svg viewBox="0 0 36 36"><circle cx="17" cy="21" r="10" fill="#25262b" stroke="#ef5350" stroke-width="2"/><path d="M23 13l4-4m0 0l3 1m-3-1l1-3" stroke="#f2c94c" stroke-width="2" stroke-linecap="round"/><circle cx="14" cy="18" r="2.5" fill="#fff" opacity=".45"/></svg>`;
const SVG_AVIAO = `<svg viewBox="0 0 64 36"><path d="M6 22l50-14-14 22-12-6-8 6 2-8z" fill="var(--destaque)" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

const VERMELHOS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const corDoNumero = (n) => n === 0 ? "verde" : VERMELHOS.includes(n) ? "vermelho" : "preto";
const ORDEM_ROLETA = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

// ---------------- Estado do Cassino ----------------
let jogoAtual = "aviator";
let anguloMoeda = 0;
let roda = { angulo: 0, bola: 0, raioBola: 133 };
let historicoRoleta = [];
let historicoAviator = [1.42, 2.35, 1.12, 5.80, 1.04, 3.15];
let esperaCassino = { aviator: 3, bomba: 2, tigrinho: 3, moeda: 0, roleta: 0, slots: 0 };
let proximaAposta = {};
let vigiaCassino = null;
let estadoDono = null;

async function carregarEsperaCassino() {
  const [{ data: cfg }, { data: ultimas }, { data: est }] = await Promise.all([
    sb.from("config").select("dados").eq("id", 1).single(),
    sb.from("ultimas_apostas").select("jogo, em").eq("perfil_id", euEco.id),
    sb.rpc("estado_cassino"),
  ]);
  esperaCassino = { aviator: 3, bomba: 2, tigrinho: 3, moeda: 0, roleta: 0, slots: 0, ...(cfg?.dados?.cassinoEspera || {}) };
  (ultimas || []).forEach(u => {
    proximaAposta[u.jogo] = new Date(u.em).getTime() + Number(esperaCassino[u.jogo] || 0) * 1000;
  });
  if (est) estadoDono = est;
}

// ---------------- Cartão do Dono do Cassino (topo) ----------------
async function htmlPainelDono() {
  if (!estadoDono) return "";
  const preco = Number(estadoDono.preco || 25000);
  if (estadoDono.dono_id) {
    const links = await linksDosArquivos([estadoDono.dono_foto]);
    const souDono = estadoDono.dono_id === euEco.id;
    return `
      <div class="caixa dono-cassino com-dono">
        <div class="dono-info">
          ${htmlAvatar({ nome: estadoDono.dono_nome || "?" }, links[estadoDono.dono_foto], "pequena")}
          <div>
            <span class="rotulo">Dono do Cassino · mandato de 30 dias</span>
            <strong>${ htmlNome({ nome: estadoDono.dono_nome }, estadoDono.dono_id) }${souDono ? " (você)" : ""}</strong>
            <small>Recebe 25% das apostas perdidas pelos outros · encerra em <b>${contagem(estadoDono.ate)}</b></small>
          </div>
        </div>
        <div class="dono-lucro">
          <span>Lucro acumulado</span>
          <b>${moeda(estadoDono.lucro_acumulado)}</b>
        </div>
      </div>`;
  }
  const podeComprar = carteira.saldo >= preco;
  return `
    <div class="caixa dono-cassino a-venda">
      <div>
        <span class="rotulo">Concessão mensal aberta</span>
        <h3>O Cassino da Katequese está à venda!</h3>
        <p>Compre o cassino por <b>30 dias</b> e receba automaticamente <b>25% de todas as apostas perdidas</b> pelos outros jogadores.</p>
      </div>
      <button class="botao" id="comprar-cassino" ${podeComprar ? "" : "disabled"}>
        ${podeComprar ? `Comprar Cassino · ${moeda(preco)}` : `Custa ${moeda(preco)}`}
      </button>
    </div>`;
}

// ---------------- Aba Principal do Cassino ----------------
async function abaCassino(el) {
  await carregarEsperaCassino();
  const painelDono = await htmlPainelDono();

  el.innerHTML = `
    <div id="painel-dono">${painelDono}</div>
    <div class="cassino-jogos">
      <button data-jogo="aviator">Revoada</button>
      <button data-jogo="bomba">Campo Minado</button>
      <button data-jogo="tigrinho">Tigrinho</button>
      <button data-jogo="moeda">Cara ou Coroa</button>
      <button data-jogo="roleta">Roleta</button>
      <button data-jogo="slots">Caça-níquel</button>
    </div>
    <div class="caixa cassino-mesa" id="mesa"></div>
    <p class="eco-dica">Aposta mínima K$ 10 e máxima K$ 50.000. Tudo é sorteado e conferido pelo banco de dados.</p>`;

  ligarBotaoComprarCassino(el);

  el.querySelector(".cassino-jogos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-jogo]");
    if (b) { jogoAtual = b.dataset.jogo; montarMesa(el); }
  });
  montarMesa(el);
}

function ligarBotaoComprarCassino(el) {
  el.querySelector("#comprar-cassino")?.addEventListener("click", async (e) => {
    const preco = Number(estadoDono?.preco || 25000);
    if (!(await confirmar(`Comprar o Cassino da Katequese por ${moeda(preco)} durante 30 dias? Você receberá 25% de todas as apostas perdidas pelos outros membros.`, "Comprar Cassino"))) return;
    e.currentTarget.disabled = true;
    const { data, error } = await sb.rpc("comprar_cassino");
    if (error) { e.currentTarget.disabled = false; return avisoEco(esc(error.message), "erro"); }
    mostrarSaldo(data.saldo);
    estadoDono = data.estado;
    avisoEco("Você agora é o <b>Dono do Cassino</b> por 30 dias!", "ganho");
    await atualizarCarteira();
    await abaCassino(el);
  });
}

async function atualizarPainelDono(el) {
  const { data } = await sb.rpc("estado_cassino");
  if (data) {
    estadoDono = data;
    const caixa = el.querySelector("#painel-dono");
    if (caixa) {
      caixa.innerHTML = await htmlPainelDono();
      ligarBotaoComprarCassino(el);
    }
  }
}

// Campo de valor da aposta com atalhos
function htmlAposta(extra = "") {
  return `
    <div class="aposta">
      <label class="campo" style="margin: 0"><span>Aposta</span>
        <input id="valor-aposta" type="number" min="10" step="1" value="${Math.min(50, Math.max(10, carteira.saldo))}">
      </label>
      <div class="atalhos-aposta">
        <button type="button" data-valor="10">10</button>
        <button type="button" data-valor="50">50</button>
        <button type="button" data-valor="100">100</button>
        <button type="button" data-valor="500">500</button>
        <button type="button" data-valor="metade">Metade</button>
        <button type="button" data-valor="tudo">Tudo</button>
      </div>
      ${extra}
    </div>`;
}

function ligarAtalhosAposta(mesa) {
  mesa.querySelector(".atalhos-aposta")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-valor]");
    if (!b) return;
    const v = b.dataset.valor;
    mesa.querySelector("#valor-aposta").value =
      v === "tudo" ? Math.min(carteira.saldo, 50000) : v === "metade" ? Math.max(10, Math.floor(carteira.saldo / 2)) : v;
  });
}

function montarMesa(el) {
  el.querySelectorAll(".cassino-jogos button").forEach(b => b.classList.toggle("ativa", b.dataset.jogo === jogoAtual));
  clearInterval(vigiaCassino);
  const antiga = el.querySelector("#mesa");
  const mesa = antiga.cloneNode(false);
  antiga.replaceWith(mesa);

  if (jogoAtual === "aviator") return montarAviator(mesa, el);
  if (jogoAtual === "bomba") return montarBomba(mesa, el);
  if (jogoAtual === "tigrinho") return montarTigrinho(mesa, el);
  return montarJogosClassicos(mesa, el);
}

// =====================================================================
// 1) REVOADA DA KATEQUESE (AVIATOR)
// =====================================================================
function htmlHistoricoAviator() {
  return historicoAviator.map(m => {
    const cl = m >= 10 ? "alto" : m >= 2 ? "medio" : "baixo";
    return `<span class="av-hist ${cl}">${Number(m).toFixed(2)}×</span>`;
  }).join("");
}

function montarAviator(mesa, el) {
  mesa.innerHTML = `
    <h2>Revoada da Katequese</h2>
    <p class="eco-dica" style="margin-top: 0">Pule antes que o avião dê furo no rolê! Quanto mais alto, maior o prêmio.</p>
    <div class="historico-roleta" id="av-historico">${htmlHistoricoAviator()}</div>
    <div class="palco-aviator" id="av-palco">
      <svg viewBox="0 0 400 200" class="av-grafico" preserveAspectRatio="none">
        <path id="av-area" d="M 0 200 L 0 200 Z" class="av-area"/>
        <path id="av-linha" d="M 0 200" class="av-linha"/>
      </svg>
      <div class="av-aviao" id="av-aviao">${SVG_AVIAO}</div>
      <div class="av-centro">
        <strong id="av-mult">1.00×</strong>
        <small id="av-status">Pronto para decolar</small>
      </div>
    </div>
    ${htmlAposta(`
      <label class="campo av-auto" style="margin: 0"><span>Auto-pular em (opcional)</span>
        <input id="av-auto" type="number" min="1.1" max="500" step="0.1" placeholder="Ex: 2.0">
      </label>`)}
    <div class="botoes-jogo">
      <button class="botao" id="av-acao" data-escolha="decolar">Decolar</button>
    </div>
    <p class="espera-aposta" id="espera-aposta"></p>
    <p class="resultado-jogo" id="resultado"></p>`;

  ligarAtalhosAposta(mesa);
  const botao = mesa.querySelector("#av-acao");
  const multEl = mesa.querySelector("#av-mult");
  const statusEl = mesa.querySelector("#av-status");
  const palco = mesa.querySelector("#av-palco");
  const aviao = mesa.querySelector("#av-aviao");
  const linha = mesa.querySelector("#av-linha");
  const area = mesa.querySelector("#av-area");
  const resEl = mesa.querySelector("#resultado");

  let voando = false;
  let pulando = false;
  let apostaAtual = 0;
  let inicioVoo = 0;
  let rAF = null;
  let timerChecagem = null;

  vigiaCassino = setInterval(() => {
    if (!mesa.isConnected) return clearInterval(vigiaCassino);
    if (voando) return;
    const resta = Math.ceil(((proximaAposta.aviator || 0) - Date.now()) / 1000);
    botao.disabled = resta > 0;
    mesa.querySelector("#espera-aposta").textContent = resta > 0 ? `Próximo voo em ${resta} s` : "";
  }, 200);

  function desenharCurva(seg) {
    const progresso = Math.min(1, seg / 14);
    const x = 18 + progresso * 340;
    const y = 184 - Math.pow(progresso, 1.35) * 150;
    linha.setAttribute("d", `M 0 190 Q ${x * 0.55} 188 ${x} ${y}`);
    area.setAttribute("d", `M 0 190 Q ${x * 0.55} 188 ${x} ${y} L ${x} 200 L 0 200 Z`);
    aviao.style.transform = `translate(${(x / 400) * 100}%, ${(y / 200) * 100}%) rotate(-14deg)`;
  }

  function encerrarVisual(explodiu, pontoCrash, premio, lucro, cashback, saldoFinal) {
    voando = false;
    pulando = false;
    cancelAnimationFrame(rAF);
    clearInterval(timerChecagem);
    palco.classList.remove("voando");
    palco.classList.toggle("explodiu", explodiu);
    botao.className = "botao";
    botao.textContent = "Decolar";
    botao.disabled = false;

    if (pontoCrash) {
      historicoAviator = [Number(pontoCrash), ...historicoAviator].slice(0, 10);
      mesa.querySelector("#av-historico").innerHTML = htmlHistoricoAviator();
    }

    if (explodiu) {
      multEl.textContent = `${Number(pontoCrash).toFixed(2)}×`;
      statusEl.textContent = "Deu furo no rolê!";
      tocar(150, 0.25, "sawtooth");
      resEl.innerHTML = cashback > 0
        ? `Voou embora em ${Number(pontoCrash).toFixed(2)}×! Voltaram ${moeda(cashback)} de cashback.`
        : `Voou embora em ${Number(pontoCrash).toFixed(2)}×! Perdeu ${moeda(apostaAtual)}.`;
      resEl.className = "resultado-jogo perdeu";
    } else {
      statusEl.textContent = `Você pulou em ${Number(premio / apostaAtual).toFixed(2)}×!`;
      tocar(660, 0.12); setTimeout(() => tocar(880, 0.16), 120);
      chuvaMoedas(mesa, premio >= apostaAtual * 5 ? 36 : 16);
      resEl.innerHTML = `Pulou a tempo! Ganhou <b>${moeda(premio)}</b> (lucro de ${moeda(lucro)})`;
      resEl.className = "resultado-jogo ganhou";
    }
    if (saldoFinal !== undefined) mostrarSaldo(saldoFinal);
    atualizarCarteira();
    atualizarPainelDono(el);
  }

  async function pularAgora(alvo = null) {
    if (!voando || pulando) return;
    pulando = true;
    botao.disabled = true;
    const { data, error } = await sb.rpc("sacar_aviator", { alvo });
    if (error) {
      avisoEco(esc(error.message), "erro");
      encerrarVisual(true, 1.00, 0, 0, 0, carteira.saldo);
      return;
    }
    if (data.explodiu) {
      encerrarVisual(true, data.ponto_crash, 0, 0, data.cashback, data.saldo);
    } else {
      multEl.textContent = `${Number(data.multiplicador).toFixed(2)}×`;
      encerrarVisual(false, data.ponto_crash, data.premio, data.lucro, 0, data.saldo);
    }
  }

  botao.addEventListener("click", async () => {
    if (voando) return pularAgora();

    const valor = Number(mesa.querySelector("#valor-aposta").value);
    const autoValor = Number(mesa.querySelector("#av-auto").value) || 0;
    botao.disabled = true;
    resEl.textContent = "";
    resEl.className = "resultado-jogo";
    palco.classList.remove("explodiu");
    prepararSom();

    const { data, error } = await sb.rpc("iniciar_aviator", { valor });
    if (error) {
      botao.disabled = false;
      return avisoEco(esc(error.message), "erro");
    }
    apostaAtual = valor;
    proximaAposta.aviator = Date.now() + Number(data.espera || 3) * 1000;
    mostrarSaldo(data.saldo);

    if (data.explodiu) {
      desenharCurva(0);
      return encerrarVisual(true, data.ponto_crash, 0, 0, data.cashback, data.saldo);
    }

    voando = true;
    pulando = false;
    inicioVoo = performance.now();
    palco.classList.add("voando");
    statusEl.textContent = "Subindo...";
    botao.className = "botao cor-verde";
    botao.disabled = false;

    function animarQuadro() {
      if (!voando) return;
      const seg = (performance.now() - inicioVoo) / 1000;
      const m = multiplicadorVoo(seg);
      multEl.textContent = `${m.toFixed(2)}×`;
      botao.textContent = `Pular Agora (${moeda(Math.floor(apostaAtual * m))})`;
      desenharCurva(seg);

      if (autoValor >= 1.1 && m >= autoValor && !pulando) {
        pularAgora(autoValor);
        return;
      }
      rAF = requestAnimationFrame(animarQuadro);
    }
    rAF = requestAnimationFrame(animarQuadro);

    timerChecagem = setInterval(async () => {
      if (!voando || pulando) return;
      const { data: chk } = await sb.rpc("checar_aviator");
      if (chk && chk.explodiu && voando) {
        encerrarVisual(true, chk.ponto_crash, 0, 0, chk.cashback, chk.saldo);
      }
    }, 900);
  });
}

// =====================================================================
// 2) CAMPO MINADO DO CHURRASCO (BOMBA 5x5)
// =====================================================================
function montarBomba(mesa, el) {
  const ativa = estadoDono?.bomba_ativa || null;
  let jogando = !!ativa;
  let valorAposta = ativa ? Number(ativa.aposta) : 50;
  let qtdBombas = ativa ? Number(ativa.qtd_bombas) : 3;
  let abertas = new Set(ativa?.abertas || []);
  let multAtual = ativa ? Number(ativa.multiplicador || 1) : 1;

  mesa.innerHTML = `
    <h2>Campo Minado do Churrasco</h2>
    <p class="eco-dica" style="margin-top: 0">Abra as estrelas sem encostar nas bombas. Você pode retirar o prêmio após qualquer acerto!</p>
    <div class="bomba-painel">
      <div class="bomba-status">
        <span>Multiplicador: <b id="bm-mult">${multAtual.toFixed(2)}×</b></span>
        <span>Próximo acerto: <b id="bm-prox">${multiplicadorBomba(qtdBombas, abertas.size + 1).toFixed(2)}×</b></span>
      </div>
      <div class="grade-bomba" id="bm-grade">
        ${[...Array(25)].map((_, i) => {
          const casa = i + 1;
          const jaAberta = abertas.has(casa);
          return `<button class="casa-bomba ${jaAberta ? "segura" : ""}" data-casa="${casa}" ${!jogando || jaAberta ? "disabled" : ""}>
            ${jaAberta ? SVG_ESTRELA_BOMBA : ""}
          </button>`;
        }).join("")}
      </div>
    </div>
    <div id="bm-controles">
      ${htmlAposta(`
        <label class="campo" style="margin: 0; width: 130px"><span>Bombas</span>
          <select id="bm-qtd">
            ${[1, 3, 5, 10, 15].map(n => `<option value="${n}" ${n === qtdBombas ? "selected" : ""}>${n} ${n === 1 ? "bomba" : "bombas"}</option>`).join("")}
          </select>
        </label>`)}
    </div>
    <div class="botoes-jogo">
      <button class="botao ${jogando ? "cor-verde" : ""}" id="bm-acao">
        ${jogando ? (abertas.size ? `Retirar ${moeda(Math.floor(valorAposta * multAtual))}` : "Escolha uma casa no tabuleiro") : "Começar Partida"}
      </button>
    </div>
    <p class="resultado-jogo" id="resultado"></p>`;

  ligarAtalhosAposta(mesa);
  const controles = mesa.querySelector("#bm-controles");
  const botaoAcao = mesa.querySelector("#bm-acao");
  const grade = mesa.querySelector("#bm-grade");
  const resEl = mesa.querySelector("#resultado");
  controles.hidden = jogando;
  if (jogando && !abertas.size) botaoAcao.disabled = true;

  mesa.querySelector("#bm-qtd")?.addEventListener("change", (e) => {
    qtdBombas = Number(e.target.value);
    mesa.querySelector("#bm-prox").textContent = multiplicadorBomba(qtdBombas, 1).toFixed(2) + "×";
  });

  function revelarTabuleiro(bombas = []) {
    const setBombas = new Set(bombas);
    grade.querySelectorAll(".casa-bomba").forEach(b => {
      const c = Number(b.dataset.casa);
      b.disabled = true;
      if (setBombas.has(c)) {
        b.classList.add("mina");
        b.innerHTML = SVG_BOMBA;
      } else if (!abertas.has(c)) {
        b.classList.add("revelada");
        b.innerHTML = SVG_ESTRELA_BOMBA;
      }
    });
  }

  botaoAcao.addEventListener("click", async () => {
    prepararSom();
    if (!jogando) {
      valorAposta = Number(mesa.querySelector("#valor-aposta").value);
      qtdBombas = Number(mesa.querySelector("#bm-qtd").value);
      botaoAcao.disabled = true;
      resEl.textContent = "";
      resEl.className = "resultado-jogo";

      const { data, error } = await sb.rpc("iniciar_bomba", { valor: valorAposta, qtd_bombas: qtdBombas });
      if (error) {
        botaoAcao.disabled = false;
        return avisoEco(esc(error.message), "erro");
      }
      mostrarSaldo(data.saldo);
      jogando = true;
      abertas = new Set();
      multAtual = 1;
      controles.hidden = true;
      mesa.querySelector("#bm-mult").textContent = "1.00×";
      mesa.querySelector("#bm-prox").textContent = multiplicadorBomba(qtdBombas, 1).toFixed(2) + "×";
      grade.querySelectorAll(".casa-bomba").forEach(b => {
        b.className = "casa-bomba";
        b.innerHTML = "";
        b.disabled = false;
      });
      botaoAcao.className = "botao cor-verde";
      botaoAcao.textContent = "Escolha uma casa no tabuleiro";
      botaoAcao.disabled = true;
      return;
    }

    // Sacar prêmio acumulado
    botaoAcao.disabled = true;
    const { data, error } = await sb.rpc("sacar_bomba");
    if (error) {
      botaoAcao.disabled = false;
      return avisoEco(esc(error.message), "erro");
    }
    jogando = false;
    if (estadoDono) estadoDono.bomba_ativa = null;
    revelarTabuleiro(data.bombas);
    controles.hidden = false;
    botaoAcao.className = "botao";
    botaoAcao.textContent = "Jogar Novamente";
    botaoAcao.disabled = false;
    tocar(660, 0.12); setTimeout(() => tocar(880, 0.16), 120);
    chuvaMoedas(mesa, 20);
    resEl.innerHTML = `Retirou em ${Number(data.multiplicador).toFixed(2)}×! Ganhou <b>${moeda(data.premio)}</b> (lucro de ${moeda(data.lucro)})`;
    resEl.className = "resultado-jogo ganhou";
    mostrarSaldo(data.saldo);
    await atualizarCarteira();
  });

  grade.addEventListener("click", async (e) => {
    const btn = e.target.closest(".casa-bomba");
    if (!btn || !jogando || btn.disabled) return;
    const casa = Number(btn.dataset.casa);
    btn.disabled = true;
    prepararSom();

    const { data, error } = await sb.rpc("abrir_casa_bomba", { casa });
    if (error) {
      btn.disabled = false;
      return avisoEco(esc(error.message), "erro");
    }

    if (data.explodiu) {
      jogando = false;
      if (estadoDono) estadoDono.bomba_ativa = null;
      btn.classList.add("explodiu");
      revelarTabuleiro(data.bombas);
      tocar(130, 0.28, "sawtooth");
      controles.hidden = false;
      botaoAcao.className = "botao";
      botaoAcao.textContent = "Tentar de Novo";
      botaoAcao.disabled = false;
      resEl.innerHTML = data.cashback > 0
        ? `BUM! Explodiu na casa ${casa}, mas voltaram ${moeda(data.cashback)} de cashback.`
        : `BUM! Explodiu na casa ${casa}. Perdeu ${moeda(valorAposta)}.`;
      resEl.className = "resultado-jogo perdeu";
      mostrarSaldo(data.saldo);
      await atualizarCarteira();
      await atualizarPainelDono(el);
      return;
    }

    abertas = new Set(data.abertas);
    multAtual = Number(data.multiplicador);
    btn.classList.add("segura");
    btn.innerHTML = SVG_ESTRELA_BOMBA;
    tocar(520 + abertas.size * 35, 0.09);
    mesa.querySelector("#bm-mult").textContent = multAtual.toFixed(2) + "×";

    if (data.finalizou) {
      jogando = false;
      if (estadoDono) estadoDono.bomba_ativa = null;
      revelarTabuleiro(data.bombas);
      controles.hidden = false;
      botaoAcao.className = "botao";
      botaoAcao.textContent = "Jogar Novamente";
      botaoAcao.disabled = false;
      chuvaMoedas(mesa, 40);
      resEl.innerHTML = `Limpou o tabuleiro! Ganhou <b>${moeda(data.premio)}</b>`;
      resEl.className = "resultado-jogo ganhou";
      mostrarSaldo(data.saldo);
      await atualizarCarteira();
      return;
    }

    mesa.querySelector("#bm-prox").textContent = multiplicadorBomba(qtdBombas, abertas.size + 1).toFixed(2) + "×";
    botaoAcao.textContent = `Retirar ${moeda(data.premio_atual)} (${multAtual.toFixed(2)}×)`;
    botaoAcao.disabled = false;
  });
}

// =====================================================================
// 3) TIGRINHO DA KATEQUESE (SLOT 3x3 COM 5 LINHAS E BÔNUS 10x)
// =====================================================================
function montarTigrinho(mesa, el) {
  const gradeInicial = [...Array(9)].map(() => sortear(NOMES_TIGRINHO));
  mesa.innerHTML = `
    <h2>Tigrinho da Katequese</h2>
    <p class="eco-dica" style="margin-top: 0">Grade 3×3 com 5 linhas (3 horizontais + 2 diagonais). O Tigrinho é Coringa (WILD) e fechar as 5 linhas multiplica tudo por <b>10×</b>!</p>
    <div class="tigre-palco" id="tigre-palco">
      <div class="tigre-grade" id="tigre-grade">
        ${gradeInicial.map((s, i) => `<div class="tigre-celula" data-pos="${i}">${SIMBOLOS_TIGRINHO[s]}</div>`).join("")}
      </div>
    </div>
    ${htmlAposta()}
    <div class="botoes-jogo"><button class="botao" data-escolha="tigrinho">Girar Tigrinho</button></div>
    <p class="espera-aposta" id="espera-aposta"></p>
    <p class="resultado-jogo" id="resultado"></p>
    <details class="tabela-premios">
      <summary>Prêmios por linha (3 iguais ou com WILD)</summary>
      <ul>
        <li>${SIMBOLOS_TIGRINHO.tigrinho}<b>25× por linha (WILD)</b></li>
        <li>${SIMBOLOS_TIGRINHO.trofeu}<b>12× por linha</b></li>
        <li>${SIMBOLOS_TIGRINHO.ouro}<b>5× por linha</b></li>
        <li>${SIMBOLOS_TIGRINHO.churrasco}<b>2,5× por linha</b></li>
        <li>${SIMBOLOS_TIGRINHO.chopp}<b>1,2× por linha</b></li>
        <li>${SIMBOLOS_TIGRINHO.laranja}<b>0,5× por linha</b></li>
      </ul>
    </details>`;

  ligarAtalhosAposta(mesa);
  ligarApostaPadrao(mesa, el);
}

async function animarTigrinho(mesa, res) {
  const celulas = [...mesa.querySelectorAll(".tigre-celula")];
  celulas.forEach(c => c.classList.remove("vencedora"));
  mesa.querySelector("#tigre-palco").classList.remove("tela-cheia");

  // Efeito de giro por coluna (colunas 0, 1 e 2 param em sequência)
  for (let passo = 0; passo < 10; passo++) {
    celulas.forEach((c, idx) => {
      const col = idx % 3;
      if (passo < 4 + col * 3) {
        c.classList.add("girando");
        c.innerHTML = SIMBOLOS_TIGRINHO[sortear(NOMES_TIGRINHO)];
      } else if (passo === 4 + col * 3) {
        c.classList.remove("girando");
        c.innerHTML = SIMBOLOS_TIGRINHO[res.grade[idx]];
        tocar(340 + col * 90, 0.06, "square");
      }
    });
    await espera(110);
  }
  celulas.forEach((c, idx) => {
    c.classList.remove("girando");
    c.innerHTML = SIMBOLOS_TIGRINHO[res.grade[idx]];
  });

  // Destaca as casas das linhas vencedoras
  const posVencedoras = new Set();
  (res.linhas || []).forEach(l => LINHAS_TIGRINHO[l]?.forEach(p => posVencedoras.add(p)));
  posVencedoras.forEach(p => celulas[p]?.classList.add("vencedora"));
  if (res.tela_cheia) mesa.querySelector("#tigre-palco").classList.add("tela-cheia");
}

// =====================================================================
// 4) JOGOS CLÁSSICOS (Cara ou Coroa, Roleta e Caça-níquel)
// =====================================================================
function montarJogosClassicos(mesa, el) {
  if (jogoAtual === "moeda") {
    const borda = [...Array(9)].map((_, i) => `<div class="moeda-borda" style="transform: translateZ(${i - 4}px)"></div>`).join("");
    mesa.innerHTML = `
      <h2>Cara ou Coroa</h2>
      <p class="eco-dica" style="margin-top: 0">Acertou, recebe 2× a aposta.</p>
      <div class="palco-moeda">
        <div class="moeda-voo" id="moeda-voo">
          <div class="moeda" id="moeda" style="transform: rotateX(${anguloMoeda}deg)">
            <div class="face cara">Cara</div>${borda}<div class="face coroa">Coroa</div>
          </div>
        </div>
        <div class="moeda-sombra" id="moeda-sombra"></div>
      </div>
      ${htmlAposta()}
      <div class="botoes-jogo">
        <button class="botao" data-escolha="cara">Apostar em Cara</button>
        <button class="botao" data-escolha="coroa">Apostar em Coroa</button>
      </div>
      <p class="espera-aposta" id="espera-aposta"></p>
      <p class="resultado-jogo" id="resultado"></p>`;
  } else if (jogoAtual === "roleta") {
    mesa.innerHTML = `
      <h2>Roleta</h2>
      <p class="eco-dica" style="margin-top: 0">Números de 0 a 36. Vermelho ou preto pagam 2×; verde (o 0) paga 36×.</p>
      <div class="palco-roda">${svgRoda()}</div>
      <div class="historico-roleta" id="historico-roleta">${htmlHistoricoRoleta()}</div>
      ${htmlAposta()}
      <div class="botoes-jogo">
        <button class="botao cor-vermelho" data-escolha="vermelho">Vermelho · 2×</button>
        <button class="botao cor-preto" data-escolha="preto">Preto · 2×</button>
        <button class="botao cor-verde" data-escolha="verde">Verde · 36×</button>
      </div>
      <p class="espera-aposta" id="espera-aposta"></p>
      <p class="resultado-jogo" id="resultado"></p>`;
    posicionarRoda(mesa);
  } else {
    mesa.innerHTML = `
      <h2>Caça-níquel</h2>
      <div class="maquina-caixa">
        <div class="maquina" id="maquina">
          ${[0, 1, 2].map(i => `<div class="rolo"><div class="fita-rolo" id="rolo-${i}">${htmlSimbolos([sortear(NOMES_SIMBOLOS), sortear(NOMES_SIMBOLOS), sortear(NOMES_SIMBOLOS)])}</div></div>`).join("")}
        </div>
        <button class="alavanca" id="alavanca" data-escolha="slots" title="Girar"><span class="alavanca-haste"></span><span class="alavanca-bola"></span></button>
      </div>
      ${htmlAposta()}
      <div class="botoes-jogo"><button class="botao" data-escolha="slots">Girar</button></div>
      <p class="espera-aposta" id="espera-aposta"></p>
      <p class="resultado-jogo" id="resultado"></p>
      <details class="tabela-premios">
        <summary>Tabela de prêmios</summary>
        <ul>
          <li>${SIMBOLOS.sete}${SIMBOLOS.sete}${SIMBOLOS.sete}<b>100×</b></li>
          <li>${SIMBOLOS.estrela}${SIMBOLOS.estrela}${SIMBOLOS.estrela}<b>30×</b></li>
          <li>${SIMBOLOS.sino}${SIMBOLOS.sino}${SIMBOLOS.sino}<b>15×</b></li>
          <li>${SIMBOLOS.limao}${SIMBOLOS.limao}${SIMBOLOS.limao}<b>8×</b></li>
          <li>${SIMBOLOS.cereja}${SIMBOLOS.cereja}${SIMBOLOS.cereja}<b>5×</b></li>
          <li>${SIMBOLOS.cereja}${SIMBOLOS.cereja}<span class="qualquer">?</span><b>devolve</b></li>
        </ul>
      </details>`;
  }

  ligarAtalhosAposta(mesa);
  ligarApostaPadrao(mesa, el);
}

function ligarApostaPadrao(mesa, el) {
  let girando = false;
  vigiaCassino = setInterval(() => {
    if (!mesa.isConnected) return clearInterval(vigiaCassino);
    if (girando) return;
    const resta = Math.ceil(((proximaAposta[jogoAtual] || 0) - Date.now()) / 1000);
    mesa.querySelectorAll("[data-escolha]").forEach(x => x.disabled = resta > 0);
    mesa.querySelector("#espera-aposta").textContent = resta > 0 ? `Próxima aposta neste jogo em ${resta} s` : "";
  }, 200);

  mesa.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-escolha]");
    if (!b || girando) return;
    const valor = Number(mesa.querySelector("#valor-aposta").value);
    const botoes = mesa.querySelectorAll("[data-escolha]");
    girando = true;
    botoes.forEach(x => x.disabled = true);
    const resultadoEl = mesa.querySelector("#resultado");
    resultadoEl.textContent = "";
    resultadoEl.className = "resultado-jogo";
    prepararSom();

    const escolha = (jogoAtual === "slots" || jogoAtual === "tigrinho") ? null : b.dataset.escolha;
    if (jogoAtual === "slots") puxarAlavanca(mesa);
    const { data, error } = await sb.rpc("apostar", { jogo: jogoAtual, valor, escolha });
    if (error) {
      avisoEco(esc(error.message), "erro");
      botoes.forEach(x => x.disabled = false);
      girando = false;
      return;
    }
    proximaAposta[jogoAtual] = Date.now() + Number(data.espera || 0) * 1000;
    mostrarSaldo(carteira.saldo - valor);

    if (jogoAtual === "moeda") await animarMoeda(mesa, data.resultado.lado);
    else if (jogoAtual === "roleta") await animarRoleta(mesa, data.resultado.numero);
    else if (jogoAtual === "tigrinho") await animarTigrinho(mesa, data.resultado);
    else await animarSlots(mesa, data.resultado.rolos, data.premio > 0);

    if (data.lucro > 0) {
      const extraTigre = data.resultado?.tela_cheia ? " · <b>TELA CHEIA 10×!</b>" : "";
      resultadoEl.innerHTML = `Ganhou <b>${moeda(data.premio)}</b> (lucro de ${moeda(data.lucro)})${extraTigre}`;
      resultadoEl.classList.add("ganhou");
      tocar(660, 0.12); setTimeout(() => tocar(880, 0.16), 120);
      chuvaMoedas(mesa, data.premio >= valor * 10 ? 40 : 14);
    } else if (data.lucro === 0 && data.premio > 0) {
      resultadoEl.innerHTML = `Recebeu ${moeda(data.premio)}: a aposta voltou.`;
    } else if (data.cashback > 0) {
      resultadoEl.innerHTML = `Perdeu ${moeda(valor)}, mas voltaram ${moeda(data.cashback)} de cashback.`;
      resultadoEl.classList.add("perdeu");
    } else {
      resultadoEl.innerHTML = `Perdeu ${moeda(valor)}.`;
      resultadoEl.classList.add("perdeu");
    }
    mostrarSaldo(data.saldo);
    await atualizarCarteira();
    await atualizarPainelDono(el);
    botoes.forEach(x => x.disabled = false);
    girando = false;
  });
}

// ---- Animações de Moeda, Roleta e Caça-níquel Clássico ----
async function animarMoeda(mesa, lado) {
  const voo = mesa.querySelector("#moeda-voo");
  const m = mesa.querySelector("#moeda");
  const sombra = mesa.querySelector("#moeda-sombra");
  const inicio = anguloMoeda % 360;
  const fimMod = lado === "coroa" ? 180 : 0;
  const final = inicio + 7 * 360 + ((fimMod - inicio + 360) % 360);
  const dur = 2200;
  anguloMoeda = fimMod;
  tocar(1200, 0.05, "sine");
  m.animate([{ transform: `rotateX(${inicio}deg)` }, { transform: `rotateX(${final}deg)` }],
    { duration: dur * 0.86, easing: "cubic-bezier(.3,.55,.4,1)", fill: "forwards" });
  voo.animate([
    { transform: "translateY(0)", easing: "cubic-bezier(.2,.6,.4,1)" },
    { transform: "translateY(-150px)", offset: 0.42, easing: "cubic-bezier(.6,0,.8,.4)" },
    { transform: "translateY(0)", offset: 0.84, easing: "ease-out" },
    { transform: "translateY(-16px)", offset: 0.92, easing: "ease-in" },
    { transform: "translateY(0)" },
  ], { duration: dur, fill: "forwards" });
  sombra.animate([
    { transform: "scale(1)", opacity: 0.5 },
    { transform: "scale(0.45)", opacity: 0.15, offset: 0.42 },
    { transform: "scale(1)", opacity: 0.5, offset: 0.84 },
    { transform: "scale(0.85)", opacity: 0.4, offset: 0.92 },
    { transform: "scale(1)", opacity: 0.5 },
  ], { duration: dur, fill: "forwards" });
  await espera(dur * 0.84);
  tocar(900, 0.06, "sine");
  await espera(dur * 0.16 + 50);
  m.getAnimations().forEach(a => a.cancel());
  m.style.transform = `rotateX(${fimMod}deg)`;
  m.animate([{ transform: `rotateX(${fimMod}deg) scale(1)` }, { transform: `rotateX(${fimMod}deg) scale(1.08)` }, { transform: `rotateX(${fimMod}deg) scale(1)` }], { duration: 300 });
}

const RODA_C = 150;
function polar(r, graus) {
  const a = graus * Math.PI / 180;
  return [RODA_C + r * Math.sin(a), RODA_C - r * Math.cos(a)];
}
function svgRoda() {
  const passo = 360 / 37;
  const casas = ORDEM_ROLETA.map((n, i) => {
    const a0 = (i - 0.5) * passo, a1 = (i + 0.5) * passo;
    const [x1, y1] = polar(127, a0), [x2, y2] = polar(127, a1), [x3, y3] = polar(96, a1), [x4, y4] = polar(96, a0);
    const [tx, ty] = polar(114, i * passo);
    return `<path class="casa-roda ${corDoNumero(n)}" d="M${x1},${y1} A127,127 0 0 1 ${x2},${y2} L${x3},${y3} A96,96 0 0 0 ${x4},${y4} Z"/>
      <text x="${tx}" y="${ty}" transform="rotate(${i * passo} ${tx} ${ty})" class="num-roda">${n}</text>`;
  }).join("");
  const raios = [0, 90, 180, 270].map(a => { const [x, y] = polar(56, a); return `<line x1="150" y1="150" x2="${x}" y2="${y}"/>`; }).join("");
  return `
    <svg viewBox="0 0 300 300" class="roda">
      <circle cx="150" cy="150" r="149" class="roda-aro"/>
      <circle cx="150" cy="150" r="141" class="roda-pista"/>
      <g id="roda-giro">
        ${casas}
        <circle cx="150" cy="150" r="96" class="roda-cone"/>
        <circle cx="150" cy="150" r="70" class="roda-miolo"/>
        <g class="roda-raios">${raios}</g>
        <circle cx="150" cy="150" r="10" class="roda-centro"/>
      </g>
      <circle id="bola" r="5.5" class="bola"/>
    </svg>`;
}
function posicionarRoda(mesa) {
  mesa.querySelector("#roda-giro").setAttribute("transform", `rotate(${roda.angulo} 150 150)`);
  const [x, y] = polar(roda.raioBola, roda.bola);
  const bola = mesa.querySelector("#bola");
  bola.setAttribute("cx", x);
  bola.setAttribute("cy", y);
}
function htmlHistoricoRoleta() {
  return historicoRoleta.map(n => `<span class="${corDoNumero(n)}">${n}</span>`).join("");
}
function animarRoleta(mesa, numero) {
  return new Promise(ok => {
    const giro = mesa.querySelector("#roda-giro");
    const bola = mesa.querySelector("#bola");
    const passo = 360 / 37;
    const idx = ORDEM_ROLETA.indexOf(numero);
    const T = 5600, QUEDA = 0.6;
    const W0 = roda.angulo, Wtotal = 360 * 3 + Math.random() * 360;
    const W = (s) => W0 + Wtotal * (1 - Math.pow(1 - s, 3));
    const casa = (s) => W(s) + idx * passo;
    const ATRASO = 30;
    const B0 = roda.bola, R0 = roda.raioBola;
    const alvo = casa(QUEDA) + ATRASO;
    let Bq = B0 - 360 * 5;
    Bq -= (((Bq - alvo) % 360) + 360) % 360;
    const inicio = performance.now();
    let ultimoTique = 0;

    function quadro(t) {
      const s = Math.min(1, (t - inicio) / T);
      giro.setAttribute("transform", `rotate(${W(s)} 150 150)`);
      let ang, raio;
      if (s < QUEDA) {
        const u = s / QUEDA;
        ang = B0 + (Bq - B0) * (1 - Math.pow(1 - u, 2));
        raio = s < 0.06 ? R0 + (133 - R0) * (s / 0.06) : 133;
      } else {
        const u = (s - QUEDA) / (1 - QUEDA);
        ang = casa(s) + ATRASO * Math.pow(1 - u, 3);
        raio = 111 + 22 * Math.pow(1 - u, 2) * Math.abs(Math.cos(u * Math.PI * 3));
        if (u < 0.6 && t - ultimoTique > 90 + u * 300) { tocar(1500, 0.02, "square"); ultimoTique = t; }
      }
      const [x, y] = polar(raio, ang);
      bola.setAttribute("cx", x);
      bola.setAttribute("cy", y);
      if (s < 1) return requestAnimationFrame(quadro);
      roda = { angulo: W(1) % 360, bola: casa(1) % 360, raioBola: 111 };
      historicoRoleta = [numero, ...historicoRoleta].slice(0, 12);
      const hist = mesa.querySelector("#historico-roleta");
      hist.innerHTML = htmlHistoricoRoleta();
      hist.firstElementChild?.classList.add("novo");
      ok();
    }
    requestAnimationFrame(quadro);
  });
}

function htmlSimbolos(lista) {
  return lista.map(s => `<div class="simbolo">${SIMBOLOS[s]}</div>`).join("");
}
function puxarAlavanca(mesa) {
  const a = mesa.querySelector("#alavanca");
  if (!a) return;
  a.classList.remove("puxada");
  void a.offsetWidth;
  a.classList.add("puxada");
}
async function animarSlots(mesa, rolos, ganhou) {
  const ALTURA = 84;
  const maquina = mesa.querySelector("#maquina");
  maquina.classList.remove("ganhou");
  const vencedores = [];
  await Promise.all(rolos.map((final, i) => {
    const fita = mesa.querySelector("#rolo-" + i);
    const lista = [...Array(26 + i * 9)].map(() => sortear(NOMES_SIMBOLOS));
    const posicao = lista.length;
    lista.push(final, sortear(NOMES_SIMBOLOS));
    fita.style.transition = "none";
    fita.style.transform = "translateY(0)";
    fita.innerHTML = htmlSimbolos(lista);
    vencedores.push(fita.children[posicao]);
    void fita.offsetWidth;
    const tempo = 1.5 + i * 0.55;
    fita.parentElement.classList.add("girando");
    fita.style.transition = `transform ${tempo}s cubic-bezier(0.2, 0.75, 0.3, 1.04)`;
    fita.style.transform = `translateY(${-(posicao - 1) * ALTURA}px)`;
    setTimeout(() => fita.parentElement.classList.remove("girando"), tempo * 1000 * 0.75);
    return espera(tempo * 1000 + 60).then(() => tocar(300 + i * 80, 0.06, "square"));
  }));
  if (ganhou) {
    maquina.classList.add("ganhou");
    vencedores.forEach(v => v.classList.add("vencedor"));
  }
}
