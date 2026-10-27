// =====================================================================
// modulos/pagamentos/pagamentos.js — divisão de contas (pagamentos.html).
// Cada item é dividido igualmente entre quem participa dele.
// Verde = pagou. Vermelho = ainda não pagou.
// =====================================================================

const eu = await iniciarPagina();
const $ = (id) => document.getElementById(id);
const BRL = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

let contas = [];   // contas com pessoas e itens, vindas do banco
let membros = [];  // membros aprovados do site (sugestões de nome)
let fotos = {};    // { caminho: link }

// Formulário de nova conta (estado enquanto a pessoa preenche)
let novasPessoas = [];  // [{ nome, perfil_id }]
let novosItens = [];    // [{ nome, valor, pessoas: [nome, ...] }]
let editandoId = null;  // id da conta que está sendo editada (null = conta nova)

// ---------------- Carregar ----------------
async function carregarTudo() {
  const [{ data: lista, error }, { data: pessoas }] = await Promise.all([
    sb.from("pagamentos")
      .select("*, criador:perfis!criado_por(nome, apelido), pagamento_pessoas(*), pagamento_itens(*, pagamento_item_pessoas(pessoa_id))")
      .order("criado_em", { ascending: false }),
    sb.from("perfis").select("id, nome, apelido, usuario").eq("status", "aprovado").order("nome"),
  ]);
  if (error) {
    const msg = error.code === "42P01"
      ? "A aba Pagamentos ainda não está no banco. O admin precisa rodar o <b>supabase-22.sql</b>."
      : "Não consegui carregar as contas: " + esc(error.message);
    $("lista").innerHTML = `<p class="vazio">${msg}</p>`;
    return;
  }
  contas = lista || [];
  membros = pessoas || [];
  fotos = await linksDosArquivos(contas.map(c => c.foto_path));
  preencherSugestoes();
  mostrar();
}

// ---------------- Contas e divisão ----------------
function itensDaConta(c) {
  return [...(c.pagamento_itens || [])].sort((a, b) => a.ordem - b.ordem);
}

// { id_da_pessoa: quanto ela deve }, somando a parte de cada item
function quantoDeve(c) {
  const devido = {};
  itensDaConta(c).forEach(item => {
    const quem = (item.pagamento_item_pessoas || []).map(x => x.pessoa_id);
    if (!quem.length) return;
    const parte = Number(item.valor) / quem.length;
    quem.forEach(id => { devido[id] = (devido[id] || 0) + parte; });
  });
  return devido;
}

function resumo(c) {
  const pessoas = c.pagamento_pessoas || [];
  const pagos = pessoas.filter(p => p.pago).length;
  const total = itensDaConta(c).reduce((s, i) => s + Number(i.valor), 0);
  return { pagos, total, quantas: pessoas.length };
}

function podeMexer(c) {
  return eu.admin || c.criado_por === eu.id;
}

// ---------------- Mostrar lista ou uma conta ----------------
function mostrar() {
  const id = Number((location.hash.match(/^#conta-(\d+)$/) || [])[1]);
  const conta = contas.find(c => c.id === id);
  $("form-conta").hidden = true;
  if (conta) {
    $("lista").hidden = true;
    $("detalhe").hidden = false;
    mostrarDetalhe(conta);
  } else {
    $("lista").hidden = false;
    $("detalhe").hidden = true;
    mostrarLista();
  }
}

function mostrarLista() {
  if (!contas.length) {
    $("lista").innerHTML = `<p class="vazio">Nenhuma conta ainda.${eu.katequista ? " Clique em <b>Nova conta</b> para dividir uma janta ou confraternização." : ""}</p>`;
    return;
  }
  $("lista").innerHTML = contas.map(c => {
    const r = resumo(c);
    const pct = r.quantas ? Math.round((r.pagos / r.quantas) * 100) : 0;
    return `
      <a class="cartao-conta" href="#conta-${c.id}">
        ${c.foto_path && fotos[c.foto_path] ? `<img src="${esc(fotos[c.foto_path])}" alt="">` : ""}
        <div class="cartao-texto">
          <strong>${esc(c.titulo)}</strong>
          <span class="suave">${esc(nomeDe(c.criador))} · ${esc(new Date(c.criado_em).toLocaleDateString("pt-BR"))}</span>
          <span>Total ${BRL(r.total)}</span>
          <div class="barra"><div style="width: ${pct}%"></div></div>
          <span class="suave">${r.pagos} de ${r.quantas} pagaram</span>
        </div>
      </a>`;
  }).join("");
}

function mostrarDetalhe(c) {
  const devido = quantoDeve(c);
  const r = resumo(c);
  const pessoas = [...(c.pagamento_pessoas || [])].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const itens = itensDaConta(c);
  const pct = r.quantas ? Math.round((r.pagos / r.quantas) * 100) : 0;

  $("detalhe").innerHTML = `
    <a href="#" class="botao-link">← Todas as contas</a>
    <div class="caixa cabecalho-conta">
      ${c.foto_path && fotos[c.foto_path] ? `<img class="foto-conta" src="${esc(fotos[c.foto_path])}" alt="">` : ""}
      <div>
        <h2>${esc(c.titulo)}</h2>
        ${c.descricao ? `<p>${esc(c.descricao)}</p>` : ""}
        <p class="suave">Criada por ${esc(nomeDe(c.criador))} em ${esc(new Date(c.criado_em).toLocaleDateString("pt-BR"))}</p>
        <p><b>Total ${BRL(r.total)}</b> · ${r.pagos} de ${r.quantas} pagaram</p>
        <div class="barra"><div style="width: ${pct}%"></div></div>
      </div>
      ${podeMexer(c) ? `<div class="acoes-conta">
        <button class="botao-pequeno" data-editar="${c.id}">Editar conta</button>
        <button class="botao-link perigo" data-excluir="${c.id}">Apagar conta</button>
      </div>` : ""}
    </div>

    <h3>Quem paga</h3>
    <div class="lista-pessoas">
      ${pessoas.map(p => {
        const deve = devido[p.id] || 0;
        return `
          <div class="pessoa-linha ${p.pago ? "pago" : "nao-pago"}">
            <div class="pessoa-nome">
              <b>${esc(p.nome)}</b>
              ${p.perfil_id ? "" : `<span class="suave">(de fora)</span>`}
            </div>
            <div class="pessoa-valor">${BRL(deve)}</div>
            <span class="selo ${p.pago ? "selo-pago" : "selo-nao"}">${p.pago ? "Pagou" : "Não pagou"}</span>
            <button class="botao-pequeno" data-marcar="${p.id}" data-pago="${p.pago ? "false" : "true"}">
              ${p.pago ? "Desmarcar" : "Marcar como pago"}
            </button>
          </div>`;
      }).join("")}
    </div>

    <h3>Itens</h3>
    <div class="lista-itens">
      ${itens.map(item => {
        const quem = (item.pagamento_item_pessoas || []).map(x => pessoas.find(p => p.id === x.pessoa_id)?.nome).filter(Boolean);
        const parte = quem.length ? Number(item.valor) / quem.length : 0;
        return `
          <div class="caixa item-conta">
            <div>
              <b>${esc(item.nome)}</b> · ${BRL(item.valor)}
              <p class="suave">Dividido entre ${quem.length}: ${esc(quem.join(", "))}</p>
            </div>
            <div class="suave">${BRL(parte)} cada</div>
          </div>`;
      }).join("")}
    </div>
  `;
}

// ---------------- Eventos da página de conta ----------------
$("detalhe").addEventListener("click", async (e) => {
  const marcar = e.target.closest("[data-marcar]");
  const excluir = e.target.closest("[data-excluir]");
  const editar = e.target.closest("[data-editar]");
  if (editar) {
    abrirFormulario(contas.find(c => c.id === Number(editar.dataset.editar)));
  } else if (marcar) {
    marcar.disabled = true;
    const { error } = await sb.rpc("marcar_pago", { p_pessoa: Number(marcar.dataset.marcar), p_pago: marcar.dataset.pago === "true" });
    if (error) { avisarJanela("Não foi possível salvar: " + error.message); marcar.disabled = false; return; }
    await carregarTudo();
  } else if (excluir) {
    if (!(await confirmar("Apagar esta conta inteira? Isso não pode ser desfeito.", "Apagar"))) return;
    const apagada = contas.find(c => c.id === Number(excluir.dataset.excluir));
    const { error } = await sb.rpc("excluir_pagamento", { p_id: Number(excluir.dataset.excluir) });
    if (error) { avisarJanela("Não foi possível apagar: " + error.message); return; }
    if (apagada?.foto_path) await apagarArquivo(apagada.foto_path).catch(() => {});
    location.hash = "";
    await carregarTudo();
  }
});

// ---------------- Nova conta ----------------
function preencherSugestoes() {
  $("lista-membros").innerHTML = membros.map(m => `<option value="${esc(nomeDe(m))}"></option>`).join("");
}

function nomeDoMembro(texto) {
  const t = texto.trim().toLowerCase();
  return membros.find(m => (m.apelido || "").toLowerCase() === t || (m.nome || "").toLowerCase() === t);
}

function desenharPessoas() {
  $("chips-pessoas").innerHTML = novasPessoas.map((p, i) => `
    <span class="chip">${esc(p.nome)}${p.perfil_id ? "" : " (de fora)"}
      <button type="button" data-tirar-pessoa="${i}" aria-label="Tirar">×</button></span>`).join("")
    || `<span class="suave">Ninguém adicionado ainda.</span>`;
  desenharItens();
}

function desenharItens() {
  $("itens-form").innerHTML = novosItens.map((item, i) => `
    <div class="item-form">
      <div class="linha-campo">
        <input data-item="${i}" data-campo="nome" maxlength="60" placeholder="Ex: Comida" value="${esc(item.nome)}">
        <input data-item="${i}" data-campo="valor" type="number" step="0.01" min="0.01" placeholder="Valor" value="${item.valor ?? ""}">
        <button class="botao-link perigo" type="button" data-tirar-item="${i}">Tirar item</button>
      </div>
      <div class="chips">
        ${novasPessoas.length ? novasPessoas.map((p, j) => `
          <label class="chip-check">
            <input type="checkbox" data-item="${i}" data-pessoa="${j}" ${item.pessoas.includes(p.nome) ? "checked" : ""}>
            ${esc(p.nome)}
          </label>`).join("") : `<span class="suave">Adicione pessoas primeiro.</span>`}
      </div>
    </div>`).join("");
}

// Sem argumento: conta nova. Com uma conta: edita ela (pessoas e itens já preenchidos)
function abrirFormulario(conta = null) {
  $("form-conta").reset();
  editandoId = conta ? conta.id : null;
  $("form-titulo").textContent = conta ? "Editar conta" : "Nova conta";
  $("form-enviar").textContent = conta ? "Salvar alterações" : "Criar conta";
  $("foto-rotulo").textContent = conta ? "Trocar foto (deixe vazio para manter)" : "Foto (opcional)";
  if (conta) {
    const pessoas = conta.pagamento_pessoas || [];
    $("titulo").value = conta.titulo;
    $("descricao").value = conta.descricao || "";
    novasPessoas = pessoas.map(p => ({ nome: p.nome, perfil_id: p.perfil_id }));
    novosItens = itensDaConta(conta).map(i => ({
      nome: i.nome, valor: Number(i.valor),
      pessoas: (i.pagamento_item_pessoas || []).map(x => pessoas.find(p => p.id === x.pessoa_id)?.nome).filter(Boolean),
    }));
  } else {
    novasPessoas = [];
    novosItens = [{ nome: "", valor: null, pessoas: [] }];
  }
  $("form-msg").textContent = "";
  $("form-conta").hidden = false;
  $("form-conta").scrollIntoView({ behavior: "smooth", block: "start" });
  desenharPessoas();
}

$("abrir-form").addEventListener("click", () => abrirFormulario());
$("cancelar-form").addEventListener("click", () => { $("form-conta").hidden = true; });

$("add-pessoa").addEventListener("click", () => {
  const nome = $("pessoa-nome").value.trim();
  if (!nome) return;
  if (novasPessoas.some(p => p.nome.toLowerCase() === nome.toLowerCase())) {
    $("form-msg").textContent = `"${nome}" já está na lista.`;
    return;
  }
  const membro = nomeDoMembro(nome);
  novasPessoas.push({ nome: membro ? nomeDe(membro) : nome, perfil_id: membro?.id || null });
  $("pessoa-nome").value = "";
  $("form-msg").textContent = "";
  desenharPessoas();
});

$("pessoa-nome").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("add-pessoa").click(); }
});

$("chips-pessoas").addEventListener("click", (e) => {
  const tirar = e.target.closest("[data-tirar-pessoa]");
  if (!tirar) return;
  const pessoa = novasPessoas[Number(tirar.dataset.tirarPessoa)];
  novasPessoas.splice(Number(tirar.dataset.tirarPessoa), 1);
  novosItens.forEach(item => { item.pessoas = item.pessoas.filter(n => n !== pessoa.nome); });
  desenharPessoas();
});

$("add-item").addEventListener("click", () => {
  novosItens.push({ nome: "", valor: null, pessoas: [] });
  desenharItens();
});

// Guarda o que a pessoa digita enquanto preenche (sem redesenhar, para não perder o foco)
$("itens-form").addEventListener("input", (e) => {
  const el = e.target;
  const item = novosItens[Number(el.dataset.item)];
  if (!item || el.type === "checkbox") return;
  if (el.dataset.campo === "nome") item.nome = el.value;
  if (el.dataset.campo === "valor") item.valor = el.value === "" ? null : Number(el.value);
});

$("itens-form").addEventListener("change", (e) => {
  const el = e.target;
  if (el.type !== "checkbox") return;
  const item = novosItens[Number(el.dataset.item)];
  const nome = novasPessoas[Number(el.dataset.pessoa)].nome;
  item.pessoas = el.checked ? [...new Set([...item.pessoas, nome])] : item.pessoas.filter(n => n !== nome);
});

$("itens-form").addEventListener("click", (e) => {
  const tirar = e.target.closest("[data-tirar-item]");
  if (!tirar) return;
  novosItens.splice(Number(tirar.dataset.tirarItem), 1);
  desenharItens();
});

$("form-conta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("form-msg");
  msg.textContent = "";
  if (!novasPessoas.length) return msg.textContent = "Adicione pelo menos uma pessoa.";
  if (!novosItens.length) return msg.textContent = "Adicione pelo menos um item.";
  for (const item of novosItens) {
    if (!item.nome.trim()) return msg.textContent = "Todo item precisa de um nome.";
    if (!(item.valor > 0)) return msg.textContent = `O valor de "${item.nome}" precisa ser maior que zero.`;
    if (!item.pessoas.length) return msg.textContent = `Marque quem divide "${item.nome}".`;
  }

  const botao = e.submitter || e.target.querySelector("[type=submit]");
  botao.disabled = true;
  msg.textContent = "Salvando...";
  try {
    let foto = null;
    const arquivo = $("foto").files[0];
    if (arquivo) foto = await enviarArquivo("pagamentos", await reduzirImagem(arquivo));

    const dados = {
      p_titulo: $("titulo").value.trim(),
      p_descricao: $("descricao").value.trim(),
      p_foto: foto,
      p_pessoas: novasPessoas,
      p_itens: novosItens.map(i => ({ nome: i.nome.trim(), valor: i.valor, pessoas: i.pessoas })),
    };
    let idConta;
    if (editandoId) {
      const fotoAntiga = contas.find(c => c.id === editandoId)?.foto_path;
      const { error } = await sb.rpc("editar_pagamento", { p_id: editandoId, ...dados });
      if (error) { if (foto) await apagarArquivo(foto); throw error; }
      if (foto) await apagarArquivo(fotoAntiga);
      idConta = editandoId;
    } else {
      const { data: idNovo, error } = await sb.rpc("criar_pagamento", dados);
      if (error) { if (foto) await apagarArquivo(foto); throw error; }
      idConta = idNovo;
    }
    $("form-conta").hidden = true;
    editandoId = null;
    location.hash = `conta-${idConta}`;
    await carregarTudo();
  } catch (erro) {
    msg.textContent = "Não foi possível salvar: " + erro.message;
  } finally {
    botao.disabled = false;
  }
});

// ---------------- Início ----------------
if (!eu.katequista) {
  $("abrir-form").hidden = true;
  $("subtitulo").textContent = "Só katequistas veem as contas de pagamento.";
  $("lista").innerHTML = `<p class="vazio">Esta aba é só para katequistas.</p>`;
} else {
  window.addEventListener("hashchange", mostrar);
  carregarTudo();
}
