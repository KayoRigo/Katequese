// =====================================================================
// economia.js — a página Economia (carteira, trabalhos, transferências,
// loja, cassino, ranking e admin). Os minijogos ficam no minijogos.js.
//
// IMPORTANTE: este arquivo só MOSTRA as coisas e chama as funções do banco
// (sb.rpc). Quem decide quanto você ganha, se pode trabalhar, o resultado da
// aposta etc. é o banco (supabase-14.sql e supabase-15.sql).
// =====================================================================

// ---------------- Ajudantes ----------------

// 1234 → "K$ 1.234"
const moeda = (n) => "K$ " + Number(n || 0).toLocaleString("pt-BR");
// 0.15 → "15%"
const pct = (v) => (Number(v) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";

// Mesmas fórmulas do banco (nivel_de e nivel_trabalho), só para desenhar as barras
function infoNivel(xp, fator) {
  const nivel = Math.floor(Math.sqrt(Math.max(0, xp) / fator)) + 1;
  const inicio = fator * (nivel - 1) ** 2;    // XP em que esse nível começou
  const proximo = fator * nivel ** 2;          // XP do próximo nível
  return { nivel, falta: proximo - xp, porcento: Math.round(((xp - inicio) / (proximo - inicio)) * 100) };
}
const nivelGeral = (xp) => infoNivel(xp, 50);
const nivelNoTrabalho = (xp) => infoNivel(xp, 3);

// "12:05" ou "1:02:05" até uma data
function contagem(ate) {
  const s = Math.max(0, Math.round((new Date(ate) - Date.now()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = s % 60;
  const dois = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${dois(m)}:${dois(seg)}` : `${m}:${dois(seg)}`;
}

// 90 → "1 h 30 min"; 25.5 → "26 min"
function emMinutos(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

// Aviso rápido no canto da tela
function avisoEco(texto, tipo = "") {
  const el = document.createElement("div");
  el.className = `eco-aviso ${tipo}`;
  el.innerHTML = texto;
  document.getElementById("eco-avisos").appendChild(el);
  setTimeout(() => el.classList.add("saindo"), 3600);
  setTimeout(() => el.remove(), 4000);
}

const espera = (ms) => new Promise(ok => setTimeout(ok, ms));

// ---------------- Estado da página ----------------
let euEco = null;           // perfil de quem está logado
let carteira = null;        // { saldo, xp, nivel, diario_disponivel }
let relogios = [];          // contagens regressivas da aba Trabalhos
let irParaAba = null;       // função para trocar de sub-aba (definida no começo)
let saldoNaTela = 0;        // o número que está aparecendo agora (para animar)

// Atualiza a carteira (lendo do banco) e o resumo de cima
async function atualizarCarteira() {
  const { data, error } = await sb.rpc("abrir_carteira");
  if (error) throw error;
  carteira = data;
  const info = nivelGeral(carteira.xp);
  mostrarSaldo(carteira.saldo);
  document.getElementById("resumo-nivel").textContent = info.nivel;
  document.getElementById("resumo-xp").textContent = `${carteira.xp} XP · faltam ${info.falta} para o nível ${info.nivel + 1}`;
  document.getElementById("resumo-barra").style.width = info.porcento + "%";
}

// Mostra o saldo novo contando até ele (verde se subiu, vermelho se desceu)
function mostrarSaldo(saldo) {
  if (carteira) carteira.saldo = saldo;
  const el = document.getElementById("resumo-saldo");
  const de = saldoNaTela;
  saldoNaTela = saldo;
  if (de === saldo) { el.textContent = moeda(saldo); return; }
  const caixa = el.closest(".eco-saldo");
  caixa.classList.remove("subiu", "desceu");
  void caixa.offsetWidth;
  caixa.classList.add(saldo > de ? "subiu" : "desceu");
  animarNumero(el, de, saldo, Math.min(1200, 400 + Math.abs(saldo - de) / 5));
}

// Equipamentos (tabela do supabase-15) e os que eu tenho
async function carregarEquipamentos() {
  const [{ data: equips, error }, { data: meus }] = await Promise.all([
    sb.from("equipamentos").select("*").order("linha").order("ordem"),
    sb.from("meus_equipamentos").select("equipamento_id").eq("perfil_id", euEco.id),
  ]);
  if (error) return null;
  return { equips: equips || [], meus: new Set((meus || []).map(m => m.equipamento_id)) };
}

// Soma dos efeitos dos meus equipamentos numa profissão (vale o melhor de cada linha).
// Mesma regra da função efeitos_trabalho do banco.
function efeitosDe(idTrabalho, eq) {
  const melhores = {};
  for (const e of eq.equips) {
    if (e.trabalho_id !== idTrabalho || !eq.meus.has(e.id)) continue;
    if (!melhores[e.linha] || e.ordem > melhores[e.linha].ordem) melhores[e.linha] = e;
  }
  const itens = Object.values(melhores);
  const soma = (k) => itens.reduce((a, e) => a + Number(e[k]), 0);
  return { itens, pagamento: soma("pagamento"), espera: Math.min(0.6, soma("espera")), extra: soma("extra"), ajuda: soma("ajuda") };
}

// Textinhos dos efeitos de um equipamento
function listaEfeitos(e, nomeExtra) {
  const l = [];
  if (Number(e.pagamento)) l.push(`+${pct(e.pagamento)} pagamento`);
  if (Number(e.espera)) l.push(`−${pct(e.espera)} espera`);
  if (Number(e.extra)) l.push(`+${pct(e.extra)} chance de ${nomeExtra.toLowerCase()}`);
  if (Number(e.ajuda)) l.push("minijogo mais fácil");
  return l;
}

// Bônus dos itens da loja (função meus_bonus_itens do supabase-16)
let bonusItens = { diario: 0, rendimento: 0, cassino_premio: 0, cassino_volta: 0, desconto: 0, por_trabalho: {} };
async function carregarBonusItens() {
  const { data } = await sb.rpc("meus_bonus_itens");
  if (data) bonusItens = data;
  return bonusItens;
}
const bonusDoTrabalho = (id) => ({ pagamento: 0, espera: 0, extra: 0, ajuda: 0, xp: 0, ...(bonusItens.por_trabalho?.[id] || {}) });
// Preço com o desconto dos itens
const comDesconto = (preco) => Math.ceil(Number(preco) * (1 - Number(bonusItens.desconto || 0)));

const AVISO_SQL15 = '<p class="vazio">Falta atualizar o banco: o admin precisa rodar o <b>supabase-15.sql</b>.</p>';

// ---------------- Começo ----------------
async function iniciarEconomia(eu) {
  euEco = eu;
  const main = document.querySelector(".pagina-economia");

  // Visitantes: só olham o ranking (não trabalham, não compram, não recebem nem mandam dinheiro)
  if (!eu.katequista) {
    main.insertAdjacentHTML("beforeend", `
      <p class="eco-dica">Visitantes só podem ver o ranking. Para participar da economia, é preciso ser Katequista.</p>
      <section class="eco-secao" id="aba-visitante"></section>`);
    await abaRanking(document.getElementById("aba-visitante"));
    return;
  }
  try {
    await atualizarCarteira();
    await carregarBonusItens();
  } catch (erro) {
    main.insertAdjacentHTML("beforeend",
      '<p class="vazio">A economia ainda não está pronta no banco. O admin precisa rodar o <b>supabase-14.sql</b>.</p>');
    return;
  }

  document.getElementById("eco-resumo").hidden = false;
  document.getElementById("eco-abas").hidden = false;
  if (eu.admin) document.querySelector('[data-aba="admin"]').hidden = false;

  // Sub-abas: cada uma é desenhada quando abre (e redesenhada ao voltar, para ficar atualizada)
  const desenhar = {
    carteira: abaCarteira, trabalhos: abaTrabalhos, transferir: abaTransferir,
    loja: abaLoja, cassino: abaCassino, ranking: abaRanking, admin: abaAdmin,
  };
  async function abrirAba(nome) {
    if (!desenhar[nome] || (nome === "admin" && !eu.admin)) nome = "carteira";
    relogios.forEach(clearInterval);
    relogios = [];
    document.querySelectorAll("#eco-abas button").forEach(b => b.classList.toggle("ativa", b.dataset.aba === nome));
    document.querySelectorAll(".eco-secao").forEach(s => s.hidden = s.id !== "aba-" + nome);
    history.replaceState(null, "", "#" + nome);
    await desenhar[nome](document.getElementById("aba-" + nome));
  }
  irParaAba = abrirAba;
  document.getElementById("eco-abas").addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-aba]");
    if (botao) abrirAba(botao.dataset.aba);
  });
  await abrirAba(location.hash.slice(1) || "carteira");
}

// =====================================================================
// CARTEIRA: bônus diário + extrato
// =====================================================================
async function abaCarteira(el) {
  const { data: extrato } = await sb
    .from("transacoes")
    .select("valor, tipo, descricao, criado_em")
    .eq("perfil_id", euEco.id)
    .order("criado_em", { ascending: false })
    .limit(60);

  el.innerHTML = `
    <div class="caixa eco-diario">
      <div>
        <h2>Bônus diário</h2>
        <p>${moeda(50 + 10 * nivelGeral(carteira.xp).nivel + Number(bonusItens.diario || 0))} por dia (aumenta com o seu nível e com itens)${Number(bonusItens.rendimento) > 0
          ? `, mais ${pct(bonusItens.rendimento)} do seu saldo (até K$ 2.000)` : ""}. Renova à meia-noite.</p>
      </div>
      <button class="botao" id="pegar-diario" ${carteira.diario_disponivel ? "" : "disabled"}>
        ${carteira.diario_disponivel ? "Pegar bônus" : "Já pego hoje"}</button>
    </div>

    <div class="caixa">
      <h2>Extrato</h2>
      ${(extrato || []).length ? `<ul class="extrato">
        ${extrato.map(t => `
          <li>
            <span class="extrato-desc">${esc(t.descricao)}<small>${new Date(t.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></span>
            <b class="${t.valor >= 0 ? "entrada" : "saida"}">${t.valor >= 0 ? "+" : "−"} ${moeda(Math.abs(t.valor))}</b>
          </li>`).join("")}
      </ul>` : '<p class="aviso" style="margin: 0">Nenhuma movimentação ainda.</p>'}
    </div>`;

  el.querySelector("#pegar-diario").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    const { data, error } = await sb.rpc("bonus_diario");
    if (error) return avisoEco(esc(error.message), "erro");
    avisoEco(`Bônus diário: <b>+ ${moeda(data.ganho)}</b>${data.rendimento ? ` (rendimento: ${moeda(data.rendimento)})` : ""}`, "ganho");
    await atualizarCarteira();
    await abaCarteira(el);
  });
}

// =====================================================================
// TRABALHOS: todas as profissões liberadas; cada turno é um minijogo
// =====================================================================
async function abaTrabalhos(el) {
  const [{ data: trabalhos }, { data: meus }, eq] = await Promise.all([
    sb.from("trabalhos").select("*").order("ordem"),
    sb.from("trabalho_niveis").select("*").eq("perfil_id", euEco.id),
    carregarEquipamentos(),
    carregarBonusItens(),
  ]);
  if (!eq) { el.innerHTML = AVISO_SQL15; return; }
  const meu = (id) => (meus || []).find(m => m.trabalho_id === id) || { xp: 0, vezes: 0, ultimo_em: null };

  el.innerHTML = `
    <p class="eco-dica">Cada turno é um minijogo rápido: quanto melhor você joga, mais recebe. Subir de nível numa profissão paga 10% a mais por nível e libera equipamentos melhores na Loja.</p>
    <div class="lista-trabalhos">
      ${(trabalhos || []).map(t => {
        const m = meu(t.id);
        const nt = nivelNoTrabalho(m.xp);
        const ef = efeitosDe(t.id, eq);
        const bi = bonusDoTrabalho(t.id);        // bônus dos itens da loja
        const mult = (1 + 0.1 * (nt.nivel - 1)) * (1 + ef.pagamento + Number(bi.pagamento));
        const reducao = Math.min(0.6, ef.espera + Number(bi.espera));
        const esperaMin = t.espera_min * (1 - reducao);
        const proximo = m.ultimo_em ? new Date(new Date(m.ultimo_em).getTime() + esperaMin * 60000) : null;
        const esperando = proximo && proximo > new Date();
        const chance = Number(t.chance_extra) + ef.extra + Number(bi.extra);
        const jogo = MINIJOGOS[t.id];
        return `
          <article class="caixa trabalho" data-trabalho="${t.id}">
            <div class="trabalho-topo">
              <h3>${esc(t.nome)}</h3>
              <span class="trabalho-nivel">Nível ${nt.nivel}</span>
            </div>
            <p>${esc(t.descricao)}</p>
            ${jogo ? `<p class="trabalho-jogo">Minijogo: ${esc(jogo.nome)}</p>` : ""}
            <ul class="trabalho-info">
              <li><span>Pagamento</span><b>${moeda(Math.floor(t.pagamento_min * mult * 0.4))} a ${moeda(Math.floor(t.pagamento_max * mult))}</b></li>
              <li><span>Espera</span><b>${reducao ? `<s>${emMinutos(t.espera_min)}</s> ` : ""}${emMinutos(esperaMin)}</b></li>
              <li><span>Chance de ${esc(t.nome_extra.toLowerCase())}</span><b>${pct(chance)} a ${pct(chance + 0.15)}</b></li>
              <li><span>Turnos</span><b>${m.vezes}</b></li>
            </ul>
            <div class="trabalho-equip">
              ${ef.itens.length
                ? ef.itens.map(e => `<span>${esc(e.nome)}</span>`).join("")
                : '<small>Nenhum equipamento</small>'}
            </div>
            <div class="barra-xp pequena" title="Faltam ${nt.falta} XP para o nível ${nt.nivel + 1}"><div style="width: ${nt.porcento}%"></div></div>
            <div class="trabalho-acao">
              ${esperando
                ? `<button class="botao" disabled data-ate="${proximo.toISOString()}">Disponível em ${contagem(proximo)}</button>`
                : `<button class="botao" data-trabalhar="${t.id}">Trabalhar</button>`}
              <button class="botao-pequeno" data-equip="${t.id}">Equipamentos</button>
            </div>
          </article>`;
      }).join("")}
    </div>`;

  // Contagens regressivas dos trabalhos em espera
  relogios.push(setInterval(() => {
    el.querySelectorAll("[data-ate]").forEach(b => {
      if (new Date(b.dataset.ate) <= new Date()) {
        b.removeAttribute("data-ate");
        b.disabled = false;
        b.dataset.trabalhar = b.closest("[data-trabalho]").dataset.trabalho;
        b.textContent = "Trabalhar";
      } else {
        b.textContent = `Disponível em ${contagem(b.dataset.ate)}`;
      }
    });
  }, 1000));

  el.querySelector(".lista-trabalhos").addEventListener("click", async (e) => {
    const equip = e.target.closest("[data-equip]");
    if (equip) {
      lojaModo = "equip";
      lojaProfissao = equip.dataset.equip;
      return irParaAba("loja");
    }
    const botao = e.target.closest("[data-trabalhar]");
    if (!botao || botao.disabled) return;
    const t = trabalhos.find(x => x.id === botao.dataset.trabalhar);
    // Abre a janela do minijogo; quando ela fecha, atualiza tudo
    abrirTurno(t, async () => {
      await atualizarCarteira();
      if (!document.getElementById("aba-trabalhos").hidden) await abaTrabalhos(el);
    });
  });
}

// =====================================================================
// TRANSFERIR
// =====================================================================
async function abaTransferir(el) {
  const [{ data: pessoas }, tags, { data: historico }] = await Promise.all([
    sb.from("perfis").select("id, nome, apelido, usuario, admin").eq("status", "aprovado").order("nome"),
    buscarTagsDosPerfis(),
    sb.from("transacoes").select("valor, tipo, descricao, criado_em").eq("perfil_id", euEco.id)
      .in("tipo", ["enviada", "recebida"]).order("criado_em", { ascending: false }).limit(20),
  ]);
  // Só dá para mandar para outros katequistas
  const destinos = (pessoas || []).filter(p => p.id !== euEco.id && ehKatequistaPerfil(p, tags[p.id]));

  const liberado = nivelGeral(carteira.xp).nivel >= 3;
  el.innerHTML = `
    <form class="caixa eco-form" id="form-transferir" ${liberado ? "" : "inert"}>
      <h2>Enviar dinheiro</h2>
      ${liberado ? "" : '<p class="aviso">Transferências liberam no nível 3 (para ninguém criar contas só para mandar dinheiro).</p>'}
      <div class="linha-campos">
        <label class="campo"><span>Para</span>
          <select id="transf-para" required>
            <option value="">Escolha alguém</option>
            ${destinos.map(p => `<option value="${p.id}">${esc(nomeDe(p))} (@${esc(p.usuario)})</option>`).join("")}
          </select>
        </label>
        <label class="campo"><span>Valor (seu saldo: ${moeda(carteira.saldo)})</span>
          <input id="transf-valor" type="number" min="1" max="${carteira.saldo}" step="1" required>
        </label>
      </div>
      <label class="campo"><span>Mensagem (opcional)</span>
        <input id="transf-msg" maxlength="120" placeholder="Ex: a parte do churrasco">
      </label>
      <button class="botao" type="submit">Enviar</button>
    </form>

    <div class="caixa">
      <h2>Últimas transferências</h2>
      ${(historico || []).length ? `<ul class="extrato">
        ${historico.map(t => `
          <li>
            <span class="extrato-desc">${esc(t.descricao)}<small>${new Date(t.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></span>
            <b class="${t.valor >= 0 ? "entrada" : "saida"}">${t.valor >= 0 ? "+" : "−"} ${moeda(Math.abs(t.valor))}</b>
          </li>`).join("")}
      </ul>` : '<p class="aviso" style="margin: 0">Nenhuma transferência ainda.</p>'}
    </div>`;

  el.querySelector("#form-transferir").addEventListener("submit", async (e) => {
    e.preventDefault();
    const para = el.querySelector("#transf-para");
    const valor = Number(el.querySelector("#transf-valor").value);
    const nome = para.selectedOptions[0].textContent;
    if (!(await confirmar(`Enviar ${moeda(valor)} para ${nome}?`, "Enviar"))) return;
    const { error } = await sb.rpc("transferir", { para: para.value, valor, mensagem: el.querySelector("#transf-msg").value.trim() });
    if (error) return avisoEco(esc(error.message), "erro");
    avisoEco(`Enviado: <b>${moeda(valor)}</b> para ${esc(nome)}`, "ganho");
    await atualizarCarteira();
    await abaTransferir(el);
  });
}

// =====================================================================
// LOJA: equipamentos das profissões (linhas de progressão) + outros itens
// =====================================================================
let lojaModo = "equip";           // "equip" ou "itens"
let lojaProfissao = "entregador";

// Nome de cada linha de equipamentos
const NOMES_LINHAS = {
  veiculo: "Veículo", bag: "Bag", celular: "Celular",
  ferramentas: "Ferramentas", churrasqueira: "Churrasqueira", visual: "Visual",
  fone: "Fone", equipamento: "Equipamento", show: "Show",
  setup: "Mesa", computador: "Computador", cafe: "Café",
  roupa: "Roupa", escritorio: "Escritório", equipe: "Equipe",
};
const nomeLinha = (l) => NOMES_LINHAS[l] || l.charAt(0).toUpperCase() + l.slice(1);

async function abaLoja(el) {
  relogios.forEach(clearInterval);
  relogios = [];
  el.innerHTML = `
    <div class="cassino-jogos loja-modos">
      <button data-modo="equip" class="${lojaModo === "equip" ? "ativa" : ""}">Equipamentos de trabalho</button>
      <button data-modo="itens" class="${lojaModo === "itens" ? "ativa" : ""}">Outros itens</button>
    </div>
    <div id="loja-conteudo"></div>`;
  el.querySelector(".loja-modos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-modo]");
    if (b) { lojaModo = b.dataset.modo; abaLoja(el); }
  });
  const conteudo = el.querySelector("#loja-conteudo");
  if (lojaModo === "equip") await lojaEquipamentos(conteudo, el);
  else await lojaItens(conteudo, el);
}

// ---- Equipamentos: uma "trilha" por linha, com os itens em sequência ----
async function lojaEquipamentos(conteudo, el) {
  const [{ data: trabalhos }, { data: niveis }, eq] = await Promise.all([
    sb.from("trabalhos").select("id, nome, nome_extra").order("ordem"),
    sb.from("trabalho_niveis").select("trabalho_id, xp").eq("perfil_id", euEco.id),
    carregarEquipamentos(),
    carregarBonusItens(),
  ]);
  if (!eq) { conteudo.innerHTML = AVISO_SQL15; return; }
  if (!(trabalhos || []).some(t => t.id === lojaProfissao)) lojaProfissao = trabalhos?.[0]?.id;
  const t = trabalhos.find(x => x.id === lojaProfissao);
  const xp = (niveis || []).find(n => n.trabalho_id === t.id)?.xp || 0;
  const nivelProf = nivelNoTrabalho(xp).nivel;
  const ef = efeitosDe(t.id, eq);
  const daProfissao = eq.equips.filter(e => e.trabalho_id === t.id);
  const linhas = [...new Set(daProfissao.map(e => e.linha))];
  const nomeEquip = (id) => eq.equips.find(e => e.id === id)?.nome || id;
  const resumo = listaEfeitos({ ...ef }, t.nome_extra);

  conteudo.innerHTML = `
    <div class="profissoes">
      ${trabalhos.map(x => `<button data-prof="${x.id}" class="${x.id === t.id ? "ativa" : ""}">${esc(x.nome)}</button>`).join("")}
    </div>
    <div class="caixa loja-prof">
      <div class="loja-prof-topo">
        <div>
          <h2>${esc(t.nome)}</h2>
          <p class="eco-dica" style="margin: 0">Seu nível na profissão: <b>${nivelProf}</b>. Em cada linha vale só o melhor item que você tem.</p>
        </div>
        <div class="loja-bonus">${resumo.length ? resumo.map(r => `<span>${r}</span>`).join("") : "<small>Sem bônus ainda</small>"}</div>
      </div>
      ${linhas.map(linha => {
        const itens = daProfissao.filter(e => e.linha === linha).sort((a, b) => a.ordem - b.ordem);
        const melhorTenho = Math.max(0, ...itens.filter(e => eq.meus.has(e.id)).map(e => e.ordem));
        return `
          <div class="trilha">
            <span class="trilha-nome">${esc(nomeLinha(linha))}</span>
            <div class="trilha-passos">
              ${itens.map(e => {
                const tem = eq.meus.has(e.id);
                const nivelOk = nivelProf >= e.nivel_min;
                const reqOk = !e.requer || eq.meus.has(e.requer);
                const estado = tem ? (e.ordem < melhorTenho ? "tem superado" : "tem") : nivelOk && reqOk ? "pode" : "bloqueado";
                const botao = tem
                  ? `<button class="botao" disabled>${e.ordem < melhorTenho ? "Substituído" : "Comprado"}</button>`
                  : !nivelOk ? `<button class="botao" disabled>Nível ${e.nivel_min} na profissão</button>`
                  : !reqOk ? `<button class="botao" disabled>Precisa: ${esc(nomeEquip(e.requer))}</button>`
                  : carteira.saldo < comDesconto(e.preco) ? `<button class="botao" disabled>Saldo insuficiente</button>`
                  : `<button class="botao" data-comprar-equip="${e.id}" data-nome="${esc(e.nome)}" data-preco="${comDesconto(e.preco)}">Comprar</button>`;
                return `
                  <article class="equip ${estado}">
                    <div class="equip-topo"><h3>${esc(e.nome)}</h3>${tem ? '<span class="equip-check">✓</span>' : ""}</div>
                    <p>${esc(e.descricao)}</p>
                    <div class="equip-efeitos">${listaEfeitos(e, t.nome_extra).map(x => `<span>${x}</span>`).join("")}</div>
                    <div class="equip-preco"><b>${comDesconto(e.preco) < e.preco ? `<s>${moeda(e.preco)}</s> ` : ""}${moeda(comDesconto(e.preco))}</b><small>Nível ${e.nivel_min}+</small></div>
                    ${botao}
                  </article>`;
              }).join("")}
            </div>
          </div>`;
      }).join("") || '<p class="aviso">Nenhum equipamento para esta profissão.</p>'}
    </div>`;

  conteudo.querySelector(".profissoes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-prof]");
    if (b) { lojaProfissao = b.dataset.prof; lojaEquipamentos(conteudo, el); }
  });
  conteudo.querySelector(".loja-prof").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-comprar-equip]");
    if (!b) return;
    if (!(await confirmar(`Comprar ${b.dataset.nome} por ${moeda(b.dataset.preco)}?`, "Comprar"))) return;
    b.disabled = true;
    const { data, error } = await sb.rpc("comprar_equipamento", { id_equip: b.dataset.comprarEquip });
    if (error) { b.disabled = false; return avisoEco(esc(error.message), "erro"); }
    mostrarSaldo(data.saldo);
    avisoEco(`Comprou <b>${esc(b.dataset.nome)}</b>`, "ganho");
    await atualizarCarteira();
    await lojaEquipamentos(conteudo, el);
    // Destaca o item recém-comprado
    const novo = [...conteudo.querySelectorAll(".equip h3")].find(h => h.textContent === b.dataset.nome);
    novo?.closest(".equip").classList.add("acabou-de-comprar");
  });
}

// ---- Outros itens (a loja antiga) + inventário ----
async function lojaItens(conteudo, el) {
  const agoraISO = new Date().toISOString();
  const [{ data: itens }, { data: meus }, { data: ativos }, { data: trabalhos }, eq] = await Promise.all([
    sb.from("itens_loja").select("*").eq("ativo", true).order("preco"),
    sb.from("inventario").select("item_id, quantidade, itens_loja(*)").eq("perfil_id", euEco.id).gt("quantidade", 0),
    sb.from("efeitos_ativos").select("item_id, ate, itens_loja(nome)").eq("perfil_id", euEco.id).gt("ate", agoraISO),
    sb.from("trabalhos").select("id, nome"),
    carregarEquipamentos(),
    carregarBonusItens(),
  ]);
  const nivelAtual = nivelGeral(carteira.xp).nivel;
  const meusEquip = eq ? eq.equips.filter(e => eq.meus.has(e.id)) : [];
  const nomesTrab = Object.fromEntries((trabalhos || []).map(t => [t.id, t.nome]));
  const quantos = (id) => (meus || []).find(m => m.item_id === id)?.quantidade || 0;
  const links = await linksDosArquivos([...(itens || []), ...(meus || []).map(m => m.itens_loja || {})].map(i => i.foto_path));

  conteudo.innerHTML = `
    ${(ativos || []).length ? `
      <div class="caixa efeitos-ativos">
        <h2>Efeitos ativos</h2>
        ${ativos.map(a => `<span>${esc(a.itens_loja?.nome || "Item")} <small data-ate="${a.ate}">${contagem(a.ate)}</small></span>`).join("")}
      </div>` : ""}

    <div class="lista-loja">
      ${(itens || []).map(i => {
        const bloqueado = nivelAtual < i.nivel_minimo;
        const esgotado = i.estoque !== null && i.estoque < 1;
        const preco = comDesconto(i.preco);
        const semDinheiro = carteira.saldo < preco;
        const noLimite = i.limite !== null && quantos(i.id) >= i.limite;
        const efeitos = listaEfeitosItem(i, nomesTrab);
        return `
          <article class="caixa item-loja ${bloqueado ? "bloqueado" : ""}">
            ${links[i.foto_path] ? `<img class="item-foto" src="${esc(links[i.foto_path])}" alt="">` : ""}
            <h3>${esc(i.nome)}</h3>
            <p>${esc(i.descricao)}</p>
            ${efeitos.length ? `<div class="equip-efeitos">${efeitos.map(x => `<span>${x}</span>`).join("")}</div>` : ""}
            <small class="item-tipo">${tipoDoItem(i)}</small>
            <div class="item-loja-info">
              <b>${preco < i.preco ? `<s>${moeda(i.preco)}</s> ` : ""}${moeda(preco)}</b>
              <small>${i.nivel_minimo > 1 ? `Nível ${i.nivel_minimo}+` : ""}${i.estoque !== null ? ` · ${i.estoque} em estoque` : ""}</small>
            </div>
            <button class="botao" data-comprar="${i.id}" data-nome="${esc(i.nome)}" data-preco="${preco}"
              ${bloqueado || esgotado || semDinheiro || noLimite ? "disabled" : ""}>
              ${bloqueado ? `Libera no nível ${i.nivel_minimo}` : esgotado ? "Esgotado" : noLimite ? "Você já tem o máximo" : semDinheiro ? "Saldo insuficiente" : "Comprar"}</button>
          </article>`;
      }).join("") || '<p class="vazio">A loja está vazia.</p>'}
    </div>

    <div class="caixa" style="margin-top: 16px">
      <h2>Seu inventário</h2>
      ${(meus || []).length || meusEquip.length
        ? `<div class="inventario">
            ${meusEquip.map(e => `<span class="de-trabalho">${esc(e.nome)}</span>`).join("")}
            ${(meus || []).map(m => {
              const i = m.itens_loja || {};
              return `<span class="item-inv">
                <b>${m.quantidade}×</b> ${esc(i.nome || "Item")}
                ${i.duracao_horas ? `<button class="botao-link" data-usar="${m.item_id}" data-nome="${esc(i.nome)}">Usar</button>` : ""}
                ${Number(i.revenda) > 0 ? `<button class="botao-link" data-vender="${m.item_id}" data-nome="${esc(i.nome)}" data-valor="${Math.floor(i.preco * Math.min(1, i.revenda))}">Vender</button>` : ""}
              </span>`;
            }).join("")}
          </div>`
        : '<p class="aviso" style="margin: 0">Você ainda não comprou nada.</p>'}
    </div>`;

  // Contagem dos efeitos ativos
  relogios.push(setInterval(() => {
    conteudo.querySelectorAll("[data-ate]").forEach(x => { x.textContent = contagem(x.dataset.ate); });
  }, 1000));

  conteudo.addEventListener("click", async (e) => {
    const comprar = e.target.closest("[data-comprar]");
    const usar = e.target.closest("[data-usar]");
    const vender = e.target.closest("[data-vender]");
    if (comprar) {
      if (!(await confirmar(`Comprar ${comprar.dataset.nome} por ${moeda(comprar.dataset.preco)}?`, "Comprar"))) return;
      const { data, error } = await sb.rpc("comprar", { id_item: Number(comprar.dataset.comprar) });
      if (error) return avisoEco(esc(error.message), "erro");
      mostrarSaldo(data.saldo);
      avisoEco(`Comprou <b>${esc(comprar.dataset.nome)}</b>`, "ganho");
    } else if (usar) {
      const { data, error } = await sb.rpc("usar_item", { id_item: Number(usar.dataset.usar) });
      if (error) return avisoEco(esc(error.message), "erro");
      avisoEco(`<b>${esc(usar.dataset.nome)}</b> ativo por ${contagem(data.ate)}`, "nivel");
    } else if (vender) {
      if (!(await confirmar(`Vender 1 ${vender.dataset.nome} por ${moeda(vender.dataset.valor)}?`, "Vender"))) return;
      const { data, error } = await sb.rpc("vender_item", { id_item: Number(vender.dataset.vender) });
      if (error) return avisoEco(esc(error.message), "erro");
      mostrarSaldo(data.saldo);
      avisoEco(`Vendeu <b>${esc(vender.dataset.nome)}</b>: + ${moeda(data.valor)}`, "ganho");
    } else return;
    await atualizarCarteira();
    await abaLoja(el);
  }, { once: false });
}

// "Permanente", "De usar: dura 2 h" etc.
function tipoDoItem(i) {
  const partes = [i.duracao_horas ? `De usar: efeito por ${emMinutos(Number(i.duracao_horas) * 60)}` : "Efeito enquanto você tiver"];
  if (i.limite !== null && i.limite !== undefined) partes.push(`máx. ${i.limite} por pessoa`);
  if (Number(i.revenda) > 0) partes.push(`revende por ${pct(Math.min(1, i.revenda))}`);
  return partes.join(" · ");
}

// Lista dos efeitos de um item da loja
function listaEfeitosItem(i, nomesTrab = {}) {
  const alvo = i.trabalho_alvo ? ` (${esc(nomesTrab[i.trabalho_alvo] || i.trabalho_alvo)})` : "";
  const l = [];
  if (Number(i.pagamento)) l.push(`+${pct(i.pagamento)} pagamento${alvo}`);
  if (Number(i.espera)) l.push(`−${pct(i.espera)} espera${alvo}`);
  if (Number(i.extra)) l.push(`+${pct(i.extra)} chance de gorjeta${alvo}`);
  if (Number(i.ajuda)) l.push(`minijogo mais fácil${alvo}`);
  if (Number(i.xp)) l.push(`+${pct(i.xp)} XP nos trabalhos${alvo}`);
  if (Number(i.diario)) l.push(`+${moeda(i.diario)} no bônus diário`);
  if (Number(i.rendimento)) l.push(`rende ${pct(i.rendimento)} do saldo por dia`);
  if (Number(i.cassino_premio)) l.push(`+${pct(i.cassino_premio)} no lucro do cassino`);
  if (Number(i.cassino_volta)) l.push(`${pct(i.cassino_volta)} de volta ao perder no cassino`);
  if (Number(i.desconto)) l.push(`−${pct(i.desconto)} nos preços da loja`);
  return l;
}

// =====================================================================
// CASSINO: Cara ou Coroa, Roleta e Caça-níquel
// =====================================================================

// Desenhos dos símbolos do caça-níquel (SVG simples)
const SIMBOLOS = {
  cereja:  `<svg viewBox="0 0 40 40"><path d="M20 6c-2 8-8 12-10 18M20 6c2 8 6 12 8 16" fill="none" stroke="#4caf68" stroke-width="2.5" stroke-linecap="round"/><path d="M20 6c5-2 9 0 11 3-4 1-8 0-11-3z" fill="#4caf68"/><circle cx="11" cy="28" r="7" fill="#d83a3a"/><circle cx="28" cy="27" r="7" fill="#c42f2f"/><circle cx="9" cy="26" r="2" fill="#fff" opacity=".5"/></svg>`,
  limao:   `<svg viewBox="0 0 40 40"><ellipse cx="20" cy="21" rx="14" ry="11" fill="#f2d33c"/><path d="M6 21c-2 0-3-1-3-2M34 21c2 0 3-1 3-2" stroke="#d9b82a" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="15" cy="17" rx="4" ry="2" fill="#fff" opacity=".45"/></svg>`,
  sino:    `<svg viewBox="0 0 40 40"><path d="M20 5c-7 0-11 6-11 13v7l-3 5h28l-3-5v-7c0-7-4-13-11-13z" fill="#e5a93a"/><circle cx="20" cy="33" r="3.5" fill="#b9802a"/><rect x="18" y="2" width="4" height="4" rx="1" fill="#b9802a"/></svg>`,
  estrela: `<svg viewBox="0 0 40 40"><path d="M20 4l4.9 10.6 11.6 1.3-8.6 7.8 2.4 11.4L20 29.3 9.7 35.1l2.4-11.4-8.6-7.8 11.6-1.3z" fill="#f2c94c" stroke="#d9a520" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  sete:    `<svg viewBox="0 0 40 40"><text x="20" y="32" text-anchor="middle" font-family="Archivo, sans-serif" font-size="32" font-weight="900" fill="#e5484d" stroke="#8f1f22" stroke-width="1.5">7</text></svg>`,
};
const NOMES_SIMBOLOS = Object.keys(SIMBOLOS);
const VERMELHOS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const corDoNumero = (n) => n === 0 ? "verde" : VERMELHOS.includes(n) ? "vermelho" : "preto";
// Ordem dos números numa roleta europeia de verdade (no sentido horário)
const ORDEM_ROLETA = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

let jogoAtual = "moeda";
// Guardam onde a moeda/roleta pararam, para a próxima jogada começar dali
let anguloMoeda = 0;
let roda = { angulo: 0, bola: 0, raioBola: 133 };
let historicoRoleta = [];
// Espera entre apostas (segundos, por jogo; o admin muda) e quando cada jogo libera de novo
let esperaCassino = { moeda: 0, roleta: 0, slots: 0 };
let proximaAposta = {};
let vigiaCassino = null;

async function carregarEsperaCassino() {
  const [{ data: cfg }, { data: ultimas }] = await Promise.all([
    sb.from("config").select("dados").eq("id", 1).single(),
    sb.from("ultimas_apostas").select("jogo, em").eq("perfil_id", euEco.id),
  ]);
  esperaCassino = { moeda: 0, roleta: 0, slots: 0, ...(cfg?.dados?.cassinoEspera || {}) };
  (ultimas || []).forEach(u => { proximaAposta[u.jogo] = new Date(u.em).getTime() + Number(esperaCassino[u.jogo] || 0) * 1000; });
}

async function abaCassino(el) {
  await carregarEsperaCassino();
  el.innerHTML = `
    <div class="cassino-jogos">
      <button data-jogo="moeda">Cara ou Coroa</button>
      <button data-jogo="roleta">Roleta</button>
      <button data-jogo="slots">Caça-níquel</button>
    </div>
    <div class="caixa cassino-mesa" id="mesa"></div>
    <p class="eco-dica">Aposta mínima K$ 10 e máxima K$ 50.000. O resultado é sorteado pelo banco de dados.</p>`;

  el.querySelector(".cassino-jogos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-jogo]");
    if (b) { jogoAtual = b.dataset.jogo; montarMesa(el); }
  });
  montarMesa(el);
}

// Campo de valor da aposta com atalhos (10, 50, 100, metade, tudo)
function htmlAposta() {
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
    </div>`;
}

function montarMesa(el) {
  el.querySelectorAll(".cassino-jogos button").forEach(b => b.classList.toggle("ativa", b.dataset.jogo === jogoAtual));
  // Troca a mesa por uma nova (assim os cliques do jogo anterior não ficam grudados nela)
  const antiga = el.querySelector("#mesa");
  const mesa = antiga.cloneNode(false);
  antiga.replaceWith(mesa);

  if (jogoAtual === "moeda") {
    // A borda da moeda é feita de várias "fatias" empilhadas em 3D
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

  // Atalhos de valor
  mesa.querySelector(".atalhos-aposta").addEventListener("click", (e) => {
    const b = e.target.closest("[data-valor]");
    if (!b) return;
    const v = b.dataset.valor;
    mesa.querySelector("#valor-aposta").value =
      v === "tudo" ? Math.min(carteira.saldo, 50000) : v === "metade" ? Math.max(10, Math.floor(carteira.saldo / 2)) : v;
  });

  // Aviso de espera entre apostas (embaixo dos botões)
  mesa.querySelector(".botoes-jogo").insertAdjacentHTML("afterend", '<p class="espera-aposta" id="espera-aposta"></p>');
  let girando = false;
  clearInterval(vigiaCassino);
  vigiaCassino = setInterval(() => {
    if (!mesa.isConnected) return clearInterval(vigiaCassino);
    if (girando) return;
    const resta = Math.ceil(((proximaAposta[jogoAtual] || 0) - Date.now()) / 1000);
    mesa.querySelectorAll("[data-escolha]").forEach(x => x.disabled = resta > 0);
    mesa.querySelector("#espera-aposta").textContent = resta > 0 ? `Próxima aposta neste jogo em ${resta} s` : "";
  }, 200);

  // Apostar (botões de baixo ou a alavanca)
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

    const escolha = jogoAtual === "slots" ? null : b.dataset.escolha;
    if (jogoAtual === "slots") puxarAlavanca(mesa);
    const { data, error } = await sb.rpc("apostar", { jogo: jogoAtual, valor, escolha });
    if (error) {
      avisoEco(esc(error.message), "erro");
      botoes.forEach(x => x.disabled = false);
      girando = false;
      return;
    }
    // Começa a contar a espera para a próxima aposta neste jogo
    proximaAposta[jogoAtual] = Date.now() + Number(data.espera || 0) * 1000;
    // O saldo cai na hora (a aposta saiu); o prêmio aparece quando a animação termina
    mostrarSaldo(carteira.saldo - valor);

    if (jogoAtual === "moeda") await animarMoeda(mesa, data.resultado.lado);
    else if (jogoAtual === "roleta") await animarRoleta(mesa, data.resultado.numero);
    else await animarSlots(mesa, data.resultado.rolos, data.premio > 0);

    if (data.lucro > 0) {
      resultadoEl.innerHTML = `Ganhou <b>${moeda(data.premio)}</b> (lucro de ${moeda(data.lucro)})`;
      resultadoEl.classList.add("ganhou");
      tocar(660, 0.12); setTimeout(() => tocar(880, 0.16), 120);
      // Prêmio grande (10× ou mais): chuva de moedas
      chuvaMoedas(mesa, data.premio >= valor * 10 ? 40 : 14);
    } else if (data.lucro === 0) {
      resultadoEl.innerHTML = "Empate: a aposta voltou.";
    } else if (data.cashback > 0) {
      resultadoEl.innerHTML = `Perdeu ${moeda(valor)}, mas voltaram ${moeda(data.cashback)} de cashback.`;
      resultadoEl.classList.add("perdeu");
    } else {
      resultadoEl.innerHTML = `Perdeu ${moeda(valor)}.`;
      resultadoEl.classList.add("perdeu");
    }
    mostrarSaldo(data.saldo);
    await atualizarCarteira();
    botoes.forEach(x => x.disabled = false);
    girando = false;
  });
}

// ---- Moeda: sobe girando, cai, quica e para na face sorteada ----
async function animarMoeda(mesa, lado) {
  const voo = mesa.querySelector("#moeda-voo");
  const m = mesa.querySelector("#moeda");
  const sombra = mesa.querySelector("#moeda-sombra");
  const inicio = anguloMoeda % 360;                 // 0 (cara) ou 180 (coroa)
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

// ---- Roleta de verdade: a roda gira, a bola corre ao contrário e cai no número ----
const RODA_C = 150;   // centro do desenho
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
    const T = 5600, QUEDA = 0.6;                       // duração e momento em que a bola cai
    const W0 = roda.angulo, Wtotal = 360 * 3 + Math.random() * 360;
    const W = (s) => W0 + Wtotal * (1 - Math.pow(1 - s, 3));   // ângulo da roda (desacelerando)
    const casa = (s) => W(s) + idx * passo;                     // onde está o número sorteado
    const ATRASO = 30;                                          // a bola cai um pouco antes da casa e escorrega
    const B0 = roda.bola, R0 = roda.raioBola;
    // A bola corre no sentido contrário (~5 voltas) e termina exatamente sobre (casa + ATRASO)
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
        // Cai quicando nas casas até parar
        raio = 111 + 22 * Math.pow(1 - u, 2) * Math.abs(Math.cos(u * Math.PI * 3));
        // "tique" de quando a bola bate nas divisórias
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

// ---- Caça-níquel: alavanca, rolos borrados girando, parada com "tranco" ----
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
  const ALTURA = 84; // altura de cada símbolo (igual ao CSS)
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
    const tempo = 1.5 + i * 0.55; // cada rolo para um pouco depois do anterior
    fita.parentElement.classList.add("girando");
    // O rolo mostra 3 símbolos; o sorteado para no do meio. O fim da curva passa
    // um pouquinho do ponto e volta (o "tranco" da parada).
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

// =====================================================================
// RANKING
// =====================================================================
async function abaRanking(el) {
  const { data } = await sb.from("carteiras").select("perfil_id, saldo, xp, perfis(nome, apelido, usuario, foto_path)");
  const lista = data || [];
  const links = await linksDosArquivos(lista.map(c => c.perfis?.foto_path));
  const linha = (c, i, valor) => `
    <li class="${c.perfil_id === euEco.id ? "sou-eu" : ""}">
      <span class="posicao">${i + 1}</span>
      ${htmlAvatar(c.perfis || {}, links[c.perfis?.foto_path], "pequena")}
      <span class="nome">${htmlNome(c.perfis, c.perfil_id)}</span>
      <b>${valor}</b>
    </li>`;
  const ricos = [...lista].sort((a, b) => b.saldo - a.saldo).slice(0, 10);
  const niveis = [...lista].sort((a, b) => b.xp - a.xp).slice(0, 10);

  el.innerHTML = lista.length ? `
    <div class="rankings">
      <div class="caixa"><h2>Mais ricos</h2><ol class="ranking">${ricos.map((c, i) => linha(c, i, moeda(c.saldo))).join("")}</ol></div>
      <div class="caixa"><h2>Maiores níveis</h2><ol class="ranking">${niveis.map((c, i) => linha(c, i, `Nível ${nivelGeral(c.xp).nivel}`)).join("")}</ol></div>
    </div>` : '<p class="vazio">Ninguém entrou na economia ainda.</p>';
}

// =====================================================================
// ADMIN: dar/tirar dinheiro, criar/editar itens da loja e equipamentos
// =====================================================================

// Atributos que um item da loja pode ter. [coluna, rótulo, escala, dica]
// escala 100 = o admin digita em % (10 → guarda 0.10 no banco)
const EFEITOS_ITEM = [
  { grupo: "Trabalhos", campos: [
    ["pagamento", "Pagamento a mais (%)", 100, "10 = paga 10% a mais em cada turno"],
    ["espera", "Espera a menos (%)", 100, "Soma com equipamentos; o total vai até 60%"],
    ["extra", "Chance de gorjeta a mais (%)", 100, "10 = +10 pontos na chance do extra"],
    ["ajuda", "Ajuda no minijogo (0 a 3)", 1, "Mais tempo, faixas maiores, bugs mais lentos"],
    ["xp", "XP a mais nos trabalhos (%)", 100, "50 = ganha 50% mais XP geral por turno"],
  ]},
  { grupo: "Carteira", campos: [
    ["diario", "K$ a mais no bônus diário", 1, "Valor fixo somado ao bônus diário"],
    ["rendimento", "Rendimento do saldo por dia (%)", 100, "0,5 = 0,5% do saldo no bônus diário (até K$ 2.000; soma até 5%)"],
  ]},
  { grupo: "Cassino", campos: [
    ["cassino_premio", "Lucro a mais nos prêmios (%)", 100, "20 = o lucro de cada prêmio vem 20% maior"],
    ["cassino_volta", "Cashback quando perde (%)", 100, "10 = devolve 10% da aposta perdida (até 50%)"],
  ]},
  { grupo: "Loja", campos: [
    ["desconto", "Desconto na loja e nos equipamentos (%)", 100, "Soma até 50%"],
    ["revenda", "Pode revender por (% do preço)", 100, "0 = não pode vender"],
  ]},
];
const CAMPOS_EFEITO = EFEITOS_ITEM.flatMap(g => g.campos);

// Modelos prontos para começar (o admin pode mudar tudo depois)
const MODELOS_ITEM = [
  { nome: "Energético", descricao: "Uma lata e o turno passa voando.", preco: 150, duracao_horas: 1, espera: 0.3, ajuda: 1 },
  { nome: "Relógio de ouro", descricao: "Cliente confia em quem tem relógio bom.", preco: 4000, nivel_minimo: 3, pagamento: 0.08, limite: 1, revenda: 0.5 },
  { nome: "Poupança", descricao: "O dinheiro parado rende um pouquinho todo dia.", preco: 6000, nivel_minimo: 4, rendimento: 0.005, limite: 1 },
  { nome: "Trevo de quatro folhas", descricao: "Parte do que você perde no cassino volta.", preco: 3000, cassino_volta: 0.1, limite: 1, revenda: 0.3 },
  { nome: "Cartão fidelidade", descricao: "Desconto em tudo na loja.", preco: 2500, desconto: 0.1, limite: 1 },
  { nome: "Livro de estudos", descricao: "Aprende mais rápido em qualquer trabalho.", preco: 300, duracao_horas: 3, xp: 0.5 },
  { nome: "Mascote", descricao: "Só para mostrar no inventário.", preco: 800, revenda: 0.8 },
];

let itemEditando = null;   // id do item que está sendo editado (null = criando um novo)
let fotoItem = null;       // caminho da imagem do item no formulário

async function abaAdmin(el) {
  const [{ data: pessoas }, tags, { data: itens }, { data: trabalhos }, { data: equips }] = await Promise.all([
    sb.from("perfis").select("id, nome, apelido, usuario, admin").eq("status", "aprovado").order("nome"),
    buscarTagsDosPerfis(),
    sb.from("itens_loja").select("*").order("preco"),
    sb.from("trabalhos").select("id, nome").order("ordem"),
    sb.from("equipamentos").select("*").order("linha").order("ordem"),
  ]);
  const katequistas = (pessoas || []).filter(p => ehKatequistaPerfil(p, tags[p.id]));
  const nomesTrab = Object.fromEntries((trabalhos || []).map(t => [t.id, t.nome]));
  const links = await linksDosArquivos((itens || []).map(i => i.foto_path));

  el.innerHTML = `
    <form class="caixa eco-form" id="form-ajuste">
      <h2>Dar ou tirar dinheiro</h2>
      <div class="linha-campos">
        <label class="campo"><span>Pessoa</span>
          <select id="ajuste-pessoa" required>
            <option value="">Escolha</option>
            ${katequistas.map(p => `<option value="${p.id}">${esc(nomeDe(p))} (@${esc(p.usuario)})</option>`).join("")}
          </select>
        </label>
        <label class="campo"><span>Valor (negativo tira)</span><input id="ajuste-valor" type="number" step="1" required></label>
      </div>
      <label class="campo"><span>Motivo</span><input id="ajuste-motivo" maxlength="100" required placeholder="Ex: prêmio do campeonato"></label>
      <button class="botao" type="submit">Aplicar</button>
    </form>

    <form class="caixa eco-form" id="form-espera" style="margin-top: 16px">
      <h2>Cassino: espera entre apostas</h2>
      <p class="eco-dica">Segundos que cada pessoa espera entre uma aposta e outra no mesmo jogo (0 = sem espera).</p>
      <div class="linha-campos">
        <label class="campo"><span>Cara ou Coroa</span><input id="espera-moeda" type="number" min="0" max="3600" step="1"></label>
        <label class="campo"><span>Roleta</span><input id="espera-roleta" type="number" min="0" max="3600" step="1"></label>
        <label class="campo"><span>Caça-níquel</span><input id="espera-slots" type="number" min="0" max="3600" step="1"></label>
      </div>
      <button class="botao" type="submit">Salvar esperas</button>
    </form>

    <form class="caixa eco-form form-item" id="form-item" style="margin-top: 16px">
      <h2 id="item-titulo">Novo item da loja</h2>
      <div class="modelos-item">
        <span>Começar de um modelo:</span>
        ${MODELOS_ITEM.map((m, k) => `<button type="button" class="botao-pequeno" data-modelo="${k}">${esc(m.nome)}</button>`).join("")}
      </div>

      <fieldset>
        <legend>Básico</legend>
        <div class="item-basico">
          <div class="item-imagem">
            <div id="item-foto-previa" class="item-foto-previa">Sem imagem</div>
            <input id="item-arquivo" type="file" accept="image/*" hidden>
            <button type="button" class="botao-pequeno" id="item-escolher-foto">Escolher imagem</button>
            <button type="button" class="botao-link perigo" id="item-tirar-foto" hidden>Remover imagem</button>
          </div>
          <div>
            <div class="linha-campos">
              <label class="campo"><span>Nome</span><input id="it-nome" maxlength="60" required></label>
              <label class="campo"><span>Preço (K$)</span><input id="it-preco" type="number" min="1" step="1" required></label>
              <label class="campo"><span>Nível geral mínimo</span><input id="it-nivel_minimo" type="number" min="1" step="1" value="1" required></label>
            </div>
            <label class="campo"><span>Descrição</span><input id="it-descricao" maxlength="300"></label>
            <div class="linha-campos">
              <label class="campo"><span>Estoque (vazio = infinito)</span><input id="it-estoque" type="number" min="0" step="1"></label>
              <label class="campo"><span>Máximo por pessoa (vazio = sem limite)</span><input id="it-limite" type="number" min="1" step="1"></label>
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Tipo</legend>
        <div class="linha-campos">
          <label class="campo"><span>Como funciona</span>
            <select id="it-tipo">
              <option value="permanente">Permanente: vale enquanto a pessoa tiver o item</option>
              <option value="usar">De usar: gasta 1 e o efeito dura algumas horas</option>
            </select>
          </label>
          <label class="campo"><span>Duração do efeito (horas)</span><input id="it-duracao_horas" type="number" min="0.1" step="0.1" disabled></label>
          <label class="campo"><span>Efeitos de trabalho valem em</span>
            <select id="it-trabalho_alvo">
              <option value="">Todas as profissões</option>
              ${(trabalhos || []).map(t => `<option value="${t.id}">Só ${esc(t.nome)}</option>`).join("")}
            </select>
          </label>
        </div>
      </fieldset>

      ${EFEITOS_ITEM.map(g => `
        <fieldset>
          <legend>Efeitos: ${g.grupo}</legend>
          <div class="campos-efeito">
            ${g.campos.map(([col, rotulo, escala, dica]) => `
              <label class="campo"><span>${rotulo}</span>
                <input id="it-${col}" type="number" step="${escala === 100 ? "0.1" : "1"}" min="0" placeholder="0">
                <small>${dica}</small>
              </label>`).join("")}
          </div>
        </fieldset>`).join("")}

      <div class="mj-botoes" style="justify-content: flex-start">
        <button class="botao" type="submit" id="item-salvar">Adicionar à loja</button>
        <button class="botao-pequeno" type="button" id="item-cancelar" hidden>Cancelar edição</button>
      </div>
    </form>

    <div class="caixa" style="margin-top: 16px">
      <h2>Itens da loja</h2>
      <p class="eco-dica">Mude preço e nível direto aqui, ou clique em Editar para mudar tudo.</p>
      <ul class="extrato lista-itens-admin">
        ${(itens || []).map(i => `
          <li data-item="${i.id}">
            ${links[i.foto_path] ? `<img class="item-mini" src="${esc(links[i.foto_path])}" alt="">` : '<span class="item-mini"></span>'}
            <span class="extrato-desc">${esc(i.nome)}${i.ativo ? "" : " · <i>escondido</i>"}
              <small>${[tipoDoItem(i), ...listaEfeitosItem(i, nomesTrab)].join(" · ")}${i.estoque !== null ? ` · estoque ${i.estoque}` : ""}</small></span>
            <span class="edicao-rapida">
              <label>K$ <input type="number" min="1" step="1" value="${i.preco}" data-campo="preco"></label>
              <label>Nível <input type="number" min="1" step="1" value="${i.nivel_minimo}" data-campo="nivel_minimo"></label>
              <button class="botao-link" data-salvar-rapido>Salvar</button>
            </span>
            <span class="recado-acoes" style="margin: 0">
              <button class="botao-link" data-editar="${i.id}">Editar</button>
              <button class="botao-link" data-ativo="${i.id}" data-valor="${!i.ativo}">${i.ativo ? "Esconder" : "Mostrar"}</button>
              <button class="botao-link perigo" data-apagar-item="${i.id}">Apagar</button>
            </span>
          </li>`).join("") || '<li>Nenhum item.</li>'}
      </ul>
    </div>

    <div class="caixa" style="margin-top: 16px">
      <h2>Equipamentos das profissões</h2>
      <p class="eco-dica">Preço e nível NA PROFISSÃO de cada equipamento. Os bônus se editam no Supabase (Table Editor → equipamentos).</p>
      ${(trabalhos || []).map(t => `
        <h3 class="admin-prof">${esc(t.nome)}</h3>
        <ul class="extrato lista-equip-admin">
          ${(equips || []).filter(e => e.trabalho_id === t.id).map(e => `
            <li data-equip="${e.id}">
              <span class="extrato-desc">${esc(e.nome)}<small>${esc(nomeLinha(e.linha))} · ${listaEfeitos(e, "gorjeta").join(" · ")}</small></span>
              <span class="edicao-rapida">
                <label>K$ <input type="number" min="1" step="1" value="${e.preco}" data-campo="preco"></label>
                <label>Nível <input type="number" min="1" step="1" value="${e.nivel_min}" data-campo="nivel_min"></label>
                <button class="botao-link" data-salvar-rapido>Salvar</button>
              </span>
            </li>`).join("")}
        </ul>`).join("")}
    </div>`;

  const $ = (id) => el.querySelector("#" + id);

  // ---------- Dar/tirar dinheiro ----------
  $("form-ajuste").addEventListener("submit", async (e) => {
    e.preventDefault();
    const quem = $("ajuste-pessoa");
    const valor = Number($("ajuste-valor").value);
    const { error } = await sb.rpc("admin_ajustar_saldo", { quem: quem.value, valor, motivo: $("ajuste-motivo").value.trim() });
    if (error) return avisoEco(esc(error.message), "erro");
    avisoEco(`${valor > 0 ? "Deu" : "Tirou"} ${moeda(Math.abs(valor))} ${valor > 0 ? "para" : "de"} ${esc(quem.selectedOptions[0].textContent)}`, "ganho");
    await atualizarCarteira();
    e.target.reset();
  });

  // ---------- Espera do cassino (fica na config, chave "cassinoEspera") ----------
  await carregarEsperaCassino();
  ["moeda", "roleta", "slots"].forEach(j => { $("espera-" + j).value = esperaCassino[j] ?? 0; });
  $("form-espera").addEventListener("submit", async (e) => {
    e.preventDefault();
    const novas = Object.fromEntries(["moeda", "roleta", "slots"].map(j => [j, Math.max(0, Number($("espera-" + j).value) || 0)]));
    const { data: atual } = await sb.from("config").select("dados").eq("id", 1).single();
    const { error } = await sb.from("config").update({ dados: { ...(atual?.dados || {}), cassinoEspera: novas } }).eq("id", 1);
    if (error) return avisoEco(esc(error.message), "erro");
    avisoEco("Esperas do cassino salvas", "ganho");
  });

  // ---------- Formulário de item ----------
  const tipo = $("it-tipo"), duracao = $("it-duracao_horas");
  tipo.addEventListener("change", () => {
    duracao.disabled = tipo.value !== "usar";
    if (tipo.value === "usar" && !duracao.value) duracao.value = 1;
  });

  async function mostrarFoto() {
    const link = fotoItem ? (await linksDosArquivos([fotoItem]))[fotoItem] : null;
    $("item-foto-previa").innerHTML = link ? `<img src="${esc(link)}" alt="">` : "Sem imagem";
    $("item-tirar-foto").hidden = !fotoItem;
  }
  $("item-escolher-foto").addEventListener("click", () => $("item-arquivo").click());
  $("item-arquivo").addEventListener("change", async () => {
    const arquivo = $("item-arquivo").files[0];
    if (!arquivo) return;
    $("item-foto-previa").textContent = "Enviando...";
    try {
      fotoItem = await enviarArquivo("loja", await reduzirImagem(arquivo, 600));
    } catch (erro) {
      avisoEco("Não foi possível enviar: " + esc(erro.message), "erro");
    }
    $("item-arquivo").value = "";
    mostrarFoto();
  });
  $("item-tirar-foto").addEventListener("click", () => { fotoItem = null; mostrarFoto(); });

  // Preenche o formulário com um item (para editar) ou um modelo
  function preencher(i) {
    $("it-nome").value = i.nome || "";
    $("it-descricao").value = i.descricao || "";
    $("it-preco").value = i.preco || "";
    $("it-nivel_minimo").value = i.nivel_minimo || 1;
    $("it-estoque").value = i.estoque ?? "";
    $("it-limite").value = i.limite ?? "";
    tipo.value = i.duracao_horas ? "usar" : "permanente";
    duracao.disabled = !i.duracao_horas;
    duracao.value = i.duracao_horas || "";
    $("it-trabalho_alvo").value = i.trabalho_alvo || "";
    for (const [col, , escala] of CAMPOS_EFEITO) {
      const v = Number(i[col] || 0);
      $("it-" + col).value = v ? +(v * escala).toFixed(2) : "";
    }
    fotoItem = i.foto_path || null;
    mostrarFoto();
  }
  function modoCriar() {
    itemEditando = null;
    $("form-item").reset();
    duracao.disabled = true;
    fotoItem = null;
    mostrarFoto();
    $("item-titulo").textContent = "Novo item da loja";
    $("item-salvar").textContent = "Adicionar à loja";
    $("item-cancelar").hidden = true;
  }
  modoCriar();

  el.querySelector(".modelos-item").addEventListener("click", (e) => {
    const b = e.target.closest("[data-modelo]");
    if (b) preencher(MODELOS_ITEM[Number(b.dataset.modelo)]);
  });
  $("item-cancelar").addEventListener("click", modoCriar);

  $("form-item").addEventListener("submit", async (e) => {
    e.preventDefault();
    const numero = (id, vazio = null) => $(id).value === "" ? vazio : Number(String($(id).value).replace(",", "."));
    const dados = {
      nome: $("it-nome").value.trim(),
      descricao: $("it-descricao").value.trim(),
      preco: numero("it-preco"),
      nivel_minimo: numero("it-nivel_minimo", 1),
      estoque: numero("it-estoque"),
      limite: numero("it-limite"),
      duracao_horas: tipo.value === "usar" ? numero("it-duracao_horas", 1) : null,
      trabalho_alvo: $("it-trabalho_alvo").value || null,
      foto_path: fotoItem,
    };
    for (const [col, , escala] of CAMPOS_EFEITO) dados[col] = (numero("it-" + col, 0) || 0) / escala;
    const { error } = itemEditando
      ? await sb.from("itens_loja").update(dados).eq("id", itemEditando)
      : await sb.from("itens_loja").insert(dados);
    if (error) return avisoEco(esc(error.message), "erro");
    avisoEco(itemEditando ? "Item atualizado" : "Item adicionado à loja", "ganho");
    itemEditando = null;
    await abaAdmin(el);
  });

  // ---------- Lista de itens ----------
  el.querySelector(".lista-itens-admin").addEventListener("click", async (e) => {
    const li = e.target.closest("[data-item]");
    if (!li) return;
    const id = Number(li.dataset.item);
    if (e.target.closest("[data-salvar-rapido]")) {
      const mudar = {};
      li.querySelectorAll("[data-campo]").forEach(inp => { mudar[inp.dataset.campo] = Number(inp.value); });
      const { error } = await sb.from("itens_loja").update(mudar).eq("id", id);
      if (error) return avisoEco(esc(error.message), "erro");
      return avisoEco("Preço e nível salvos", "ganho");
    }
    if (e.target.closest("[data-editar]")) {
      const item = itens.find(i => i.id === id);
      preencher(item);
      itemEditando = id;
      $("item-titulo").textContent = `Editando: ${item.nome}`;
      $("item-salvar").textContent = "Salvar alterações";
      $("item-cancelar").hidden = false;
      $("form-item").scrollIntoView({ behavior: "smooth" });
      return;
    }
    const ativo = e.target.closest("[data-ativo]");
    if (ativo) {
      await sb.from("itens_loja").update({ ativo: ativo.dataset.valor === "true" }).eq("id", id);
    } else if (e.target.closest("[data-apagar-item]")) {
      if (!(await confirmar("Apagar este item? Ele some também do inventário de quem comprou.", "Apagar"))) return;
      await sb.from("itens_loja").delete().eq("id", id);
    } else return;
    await abaAdmin(el);
  });

  // ---------- Equipamentos: preço e nível ----------
  el.querySelectorAll(".lista-equip-admin").forEach(lista => lista.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-salvar-rapido]")) return;
    const li = e.target.closest("[data-equip]");
    const mudar = {};
    li.querySelectorAll("[data-campo]").forEach(inp => { mudar[inp.dataset.campo] = Number(inp.value); });
    const { error } = await sb.from("equipamentos").update(mudar).eq("id", li.dataset.equip);
    if (error) return avisoEco(esc(error.message), "erro");
    avisoEco("Equipamento salvo", "ganho");
  }));
}
