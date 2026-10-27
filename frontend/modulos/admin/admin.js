// =====================================================================
// modulos/admin/admin.js — painel de administração (admin.html).
// =====================================================================

// Só entra quem é administrador. Os outros voltam para a página inicial.
const eu = await iniciarPagina({ soAdmin: true });
const $ = (id) => document.getElementById(id);

// ================= SUB-ABAS =================
function abrirSecao(id) {
  const secoes = [...document.querySelectorAll(".admin-secoes > section")];
  if (!secoes.some(sec => sec.id === id)) id = secoes[0].id;
  secoes.forEach(sec => sec.hidden = sec.id !== id);
  document.querySelectorAll("#admin-nav a").forEach(a => a.classList.toggle("ativa", a.getAttribute("href") === "#" + id));
  document.querySelector(".barra-salvar").hidden = id !== "sec-frases";
  history.replaceState(null, "", "#" + id);
}
$("admin-nav").addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a) return;
  e.preventDefault();
  abrirSecao(a.getAttribute("href").slice(1));
});
window.addEventListener("hashchange", () => abrirSecao(location.hash.slice(1)));
abrirSecao(location.hash.slice(1));

// Lista de todas as pessoas cadastradas (usada em Pessoas e em Tags)
let pessoas = [];
async function carregarPessoas() {
  const { data } = await sb.from("perfis").select("*").order("criado_em");
  pessoas = data || [];
}
const aprovados = () => pessoas.filter(p => p.status === "aprovado")
  .sort((a, b) => a.nome.localeCompare(b.nome));

// ================= PESSOAS =================
const ORDEM_STATUS = { pendente: 0, aprovado: 1, recusado: 2 };

async function mostrarPessoas() {
  const ordenadas = [...pessoas].sort((a, b) => ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status]);
  const links = await linksDosArquivos(ordenadas.map(p => p.foto_path));

  const idKatequista = tags.find(t => t.sistema && t.nome === "Katequista")?.id;
  const ehKatequista = (p) => p.admin || donos.some(d => d.perfil_id === p.id && d.tag_id === idKatequista);

  $("lista-pessoas").innerHTML = ordenadas.map(p => {
    const souEu = p.id === eu.id;
    let botoes = "";
    if (p.status === "pendente") {
      botoes = `<button class="botao-pequeno" data-acao="aprovar" data-id="${p.id}">Aprovar</button>
                <button class="botao-pequeno perigo" data-acao="recusar" data-id="${p.id}">Recusar</button>`;
    } else if (p.status === "aprovado" && !souEu) {
      const botaoAcesso = !p.admin && idKatequista
        ? `<button class="botao-pequeno" data-katequista="${ehKatequista(p) ? "tirar" : "dar"}" data-id="${p.id}">
             ${ehKatequista(p) ? "Tornar visitante" : "Tornar katequista"}</button>`
        : "";
      botoes = `${botaoAcesso}
                <button class="botao-pequeno" data-acao="${p.admin ? "tirar-admin" : "dar-admin"}" data-id="${p.id}">
                  ${p.admin ? "Remover admin" : "Tornar admin"}</button>
                <button class="botao-pequeno perigo" data-acao="recusar" data-id="${p.id}">Bloquear</button>`;
    } else if (p.status === "recusado") {
      botoes = `<button class="botao-pequeno" data-acao="aprovar" data-id="${p.id}">Desbloquear</button>`;
    }

    return `
      <div class="pessoa">
        ${htmlAvatar(p, links[p.foto_path], "pequena")}
        <div class="info">
          <strong>${esc(p.nome)}</strong>
          ${p.status === "recusado" ? '<span class="etiqueta recusado">bloqueado</span>' : ""}
          ${p.status === "pendente" ? '<span class="etiqueta pendente">pendente</span>' : ""}
          ${p.admin ? '<span class="etiqueta admin">admin</span>' : ""}
          ${p.status === "aprovado" && idKatequista
            ? `<span class="etiqueta ${ehKatequista(p) ? "aprovado" : ""}">${ehKatequista(p) ? "katequista" : "visitante"}</span>` : ""}
          <small>@${esc(p.usuario)}${souEu ? " (você)" : ""} · cadastro em ${new Date(p.criado_em).toLocaleDateString("pt-BR")}</small>
        </div>
        <div class="acoes">${botoes}</div>
      </div>`;
  }).join("");
}

const ACOES = {
  "aprovar":     { status: "aprovado" },
  "recusar":     { status: "recusado", admin: false },
  "dar-admin":   { admin: true },
  "tirar-admin": { admin: false },
};

$("lista-pessoas").addEventListener("click", async (e) => {
  const botao = e.target.closest("[data-acao], [data-katequista]");
  if (!botao) return;
  botao.disabled = true;
  let error;
  if (botao.dataset.katequista) {
    const idKatequista = tags.find(t => t.sistema && t.nome === "Katequista").id;
    ({ error } = botao.dataset.katequista === "dar"
      ? await sb.from("perfil_tags").insert({ perfil_id: botao.dataset.id, tag_id: idKatequista })
      : await sb.from("perfil_tags").delete().eq("perfil_id", botao.dataset.id).eq("tag_id", idKatequista));
  } else {
    ({ error } = await sb.from("perfis").update(ACOES[botao.dataset.acao]).eq("id", botao.dataset.id));
  }
  if (error) await avisarJanela("Não foi possível alterar: " + error.message);
  await recarregar();
});

async function recarregar() {
  await Promise.all([carregarPessoas(), carregarTags()]);
  mostrarTags();
  await mostrarPessoas();
  if (typeof mostrarVagasPolitica === "function") await mostrarVagasPolitica();

  const pendentes = pessoas.filter(p => p.status === "pendente").length;
  const bolinha = document.querySelector('#menu a[href="admin.html"] .bolinha');
  if (bolinha && pendentes) bolinha.textContent = pendentes;
  else if (bolinha) bolinha.remove();
}

// ================= TEMA DO SITE =================
const temaAtual = dados.temaGlobal || "";
$("temas-globais").innerHTML = [{ id: "", nome: "Nenhum", descricao: "Cada pessoa usa a própria paleta" }, ...TEMAS_GLOBAIS]
  .map(t => `
    <label class="opcao-tema">
      <input type="radio" name="tema-global" value="${t.id}" ${t.id === temaAtual ? "checked" : ""}>
      <span><strong>${esc(t.nome)}</strong><small>${esc(t.descricao)}</small></span>
    </label>`).join("");

$("temas-globais").addEventListener("change", async (e) => {
  const escolhido = e.target.value || null;
  $("tema-msg").textContent = "Salvando...";
  try {
    await gravarNaConfig("temaGlobal", escolhido);
    $("tema-msg").textContent = escolhido ? "Tema ligado para todos." : "Tema desligado. Cada um volta à própria paleta.";
    setTimeout(() => location.reload(), 700);
  } catch (erro) {
    $("tema-msg").textContent = "Não foi possível salvar: " + erro.message;
  }
});

// ================= TAGS: mostrar todas =================
$("mostrar-todas-tags").checked = dados.mostrarTodasTags === true;
$("mostrar-todas-tags").addEventListener("change", async (e) => {
  const ligado = e.target.checked;
  $("tags-todas-msg").textContent = "Salvando...";
  try {
    await gravarNaConfig("mostrarTodasTags", ligado);
    $("tags-todas-msg").textContent = ligado ? "Ligado: os nomes mostram todas as tags." : "Desligado: os nomes mostram só a tag mais alta.";
    setTimeout(() => location.reload(), 600);
  } catch (erro) {
    e.target.checked = !ligado;
    $("tags-todas-msg").textContent = "Não foi possível salvar: " + erro.message;
  }
});

// ================= CADASTRO =================
$("visitantes-ativos").checked = dados.visitantesAtivos !== false;
$("visitantes-ativos").addEventListener("change", async (e) => {
  const ligado = e.target.checked;
  $("cadastro-msg").textContent = "Salvando...";
  try {
    await gravarNaConfig("visitantesAtivos", ligado);
    $("cadastro-msg").textContent = ligado
      ? "Ligado: novos cadastros entram como Visitante."
      : "Desligado: novos cadastros já entram como Katequista.";
  } catch (erro) {
    e.target.checked = !ligado;
    $("cadastro-msg").textContent = "Não foi possível salvar: " + erro.message;
  }
});

// ================= MEMBRO DA SEMANA =================
let semana = { nome: "", descricao: "", foto: null, ...(dados.membroSemana || {}) };
const fotosSemana = [semana.foto].filter(Boolean);

async function mostrarSemana() {
  const link = (await linksDosArquivos([semana.foto]))[semana.foto];
  $("semana-foto").innerHTML = link
    ? `<img class="foto-semana" src="${esc(link)}" alt="" style="width: 140px; height: 140px; border-radius: 8px; object-fit: cover">`
    : `<div class="foto-semana iniciais" style="width: 140px; height: 140px; border-radius: 8px; margin: 0">?</div>`;
  $("semana-nome").value = semana.nome;
  $("semana-descricao").value = semana.descricao;
}
await mostrarSemana();

$("semana-trocar").addEventListener("click", () => $("semana-arquivo").click());
$("semana-arquivo").addEventListener("change", async () => {
  const arquivo = $("semana-arquivo").files[0];
  if (!arquivo) return;
  $("semana-msg").textContent = "Enviando foto...";
  try {
    semana.foto = await enviarArquivo("semana", await reduzirImagem(arquivo, 800));
    fotosSemana.push(semana.foto);
    semana.nome = $("semana-nome").value;
    semana.descricao = $("semana-descricao").value;
    await mostrarSemana();
    $("semana-msg").textContent = "Foto pronta. Clique em \"Salvar membro da semana\".";
  } catch (erro) {
    $("semana-msg").textContent = "Não foi possível enviar: " + erro.message;
  }
  $("semana-arquivo").value = "";
});

async function gravarNaConfig(chave, valor) {
  const { data: atual } = await sb.from("config").select("dados").eq("id", 1).single();
  const { error } = await sb.from("config").update({ dados: { ...atual.dados, [chave]: valor } }).eq("id", 1);
  if (error) throw error;
  rascunho[chave] = valor;
}
const gravarSemana = (valor) => gravarNaConfig("membroSemana", valor);

$("semana-salvar").addEventListener("click", async () => {
  semana.nome = $("semana-nome").value.trim();
  semana.descricao = $("semana-descricao").value.trim();
  if (!semana.nome) return $("semana-msg").textContent = "Coloque pelo menos o nome.";
  try {
    await gravarSemana(semana);
    await limparFotosAntigas(fotosSemana, [semana.foto]);
    fotosSemana.splice(0, fotosSemana.length, ...(semana.foto ? [semana.foto] : []));
    $("semana-msg").textContent = "Salvo. Já aparece na página inicial.";
  } catch (erro) {
    $("semana-msg").textContent = "Não foi possível salvar: " + erro.message;
  }
});

$("semana-limpar").addEventListener("click", async () => {
  if (!(await confirmar("Tirar o membro da semana da página inicial?", "Remover"))) return;
  await gravarSemana(null);
  await limparFotosAntigas(fotosSemana, []);
  fotosSemana.length = 0;
  semana = { nome: "", descricao: "", foto: null };
  await mostrarSemana();
  $("semana-msg").textContent = "Removido.";
});

// ================= POLÍTICA =================
let mostrarVagasPolitica = null;
const { data: polBanco, error: erroPol } = await sb.from("politica").select("*").eq("id", 1).maybeSingle();
const { data: linkBanco } = await sb.from("politica_link").select("link").eq("id", 1).maybeSingle();

if (erroPol || !polBanco) {
  $("politica-form").innerHTML = `<p class="aviso">Rode o <b>supabase-6.sql</b> no Supabase para liberar esta parte.</p>`;
} else {
  const vagas = {
    presidente: {
      perfil_id: polBanco.presidente_id || "",
      nome: polBanco.presidente_nome || "",
      partido: polBanco.presidente_partido || "",
      foto: polBanco.presidente_foto || null,
    },
  };
  [0, 1, 2, 3].forEach(i => {
    const d = polBanco.deputados[i] || {};
    vagas[i] = { perfil_id: d.perfil_id || "", nome: d.nome || "", partido: d.partido || "", foto: d.foto || null };
  });
  const fotosAntigas = Object.values(vagas).map(v => v.foto).filter(Boolean);
  let vagaDaFoto = null;

  const paraCampo = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  $("pol-desde").value = polBanco.mandato_desde || "";
  $("pol-abre").value = paraCampo(polBanco.eleicao_abre);
  $("pol-fecha").value = paraCampo(polBanco.eleicao_fecha);
  $("pol-link").value = linkBanco?.link || "";

  const lerNomes = () => document.querySelectorAll("[data-vaga]").forEach(linha => {
    const cPerfil = linha.querySelector("[data-campo=perfil_id]");
    const cNome = linha.querySelector("[data-campo=nome]");
    const cPartido = linha.querySelector("[data-campo=partido]");
    if (cPerfil && cPerfil.options.length > 1) vagas[linha.dataset.vaga].perfil_id = cPerfil.value;
    if (cNome) vagas[linha.dataset.vaga].nome = cNome.value;
    if (cPartido) vagas[linha.dataset.vaga].partido = cPartido.value;
  });

  async function mostrarVagas() {
    if (document.querySelector("[data-vaga] [data-campo=nome]")) lerNomes();
    const links = await linksDosArquivos(Object.values(vagas).map(v => v.foto));
    const membrosAprovados = aprovados();
    document.querySelectorAll("[data-vaga]").forEach(linha => {
      const chave = linha.dataset.vaga;
      const v = vagas[chave];
      const rotulo = chave === "presidente" ? "Nome do presidente" : `Deputado ${Number(chave) + 1}`;
      const opcoesMembros = `<option value="">— Escolher membro (sincroniza a tag) —</option>` +
        membrosAprovados.map(p => `<option value="${p.id}" ${v.perfil_id === p.id ? "selected" : ""}>${esc(p.nome)} (@${esc(p.usuario)})</option>`).join("");
      linha.innerHTML = `
        ${htmlAvatar({ nome: v.nome || "?" }, links[v.foto])}
        <label class="campo"><span>Membro no site</span><select data-campo="perfil_id">${opcoesMembros}</select></label>
        <label class="campo"><span>${rotulo}</span><input data-campo="nome" maxlength="60" value="${esc(v.nome)}"></label>
        <label class="campo"><span>Partido</span><input data-campo="partido" maxlength="60" placeholder="Ex: PC · Partido Cuiudo" value="${esc(v.partido)}"></label>
        <button class="botao-pequeno" type="button" data-foto="${chave}">Foto</button>
        ${v.foto ? `<button class="botao-pequeno perigo" type="button" data-tirar-foto="${chave}">Tirar foto</button>` : ""}`;
    });
  }
  mostrarVagasPolitica = mostrarVagas;
  await mostrarVagas();

  $("politica-form").addEventListener("change", (e) => {
    const sel = e.target.closest("select[data-campo=perfil_id]");
    if (!sel) return;
    const linha = sel.closest("[data-vaga]");
    const pessoa = aprovados().find(p => p.id === sel.value);
    const inputNome = linha?.querySelector("[data-campo=nome]");
    if (pessoa && inputNome) inputNome.value = pessoa.nome;
  });

  $("politica-form").addEventListener("click", async (e) => {
    const botaoFoto = e.target.closest("[data-foto]");
    const botaoTirar = e.target.closest("[data-tirar-foto]");
    if (botaoFoto) {
      vagaDaFoto = botaoFoto.dataset.foto;
      $("pol-arquivo").click();
    } else if (botaoTirar) {
      lerNomes();
      vagas[botaoTirar.dataset.tirarFoto].foto = null;
      await mostrarVagas();
      $("pol-msg").textContent = "Foto retirada. Clique em \"Salvar política\".";
    }
  });

  $("pol-arquivo").addEventListener("change", async () => {
    const arquivo = $("pol-arquivo").files[0];
    if (!arquivo || vagaDaFoto === null) return;
    $("pol-msg").textContent = "Enviando foto...";
    try {
      lerNomes();
      vagas[vagaDaFoto].foto = await enviarArquivo("politica", await reduzirImagem(arquivo, 800));
      await mostrarVagas();
      $("pol-msg").textContent = "Foto pronta. Clique em \"Salvar política\".";
    } catch (erro) {
      $("pol-msg").textContent = "Não foi possível enviar: " + erro.message;
    }
    $("pol-arquivo").value = "";
  });

  $("pol-salvar").addEventListener("click", async () => {
    lerNomes();
    const abre = $("pol-abre").value, fecha = $("pol-fecha").value;
    const link = $("pol-link").value.trim();
    if (abre && fecha && new Date(fecha) <= new Date(abre)) {
      return $("pol-msg").textContent = "A votação precisa fechar depois de abrir.";
    }
    if (link && !/^https?:\/\//i.test(link)) {
      return $("pol-msg").textContent = "O link precisa começar com https://";
    }
    $("pol-msg").textContent = "Salvando...";

    const deputados = [0, 1, 2, 3].map(i => {
      const nome = vagas[i].nome.trim();
      const pid = vagas[i].perfil_id || null;
      return nome ? { perfil_id: pid, nome, partido: vagas[i].partido.trim(), foto: vagas[i].foto } : {};
    });
    const payloadPol = {
      presidente_nome: vagas.presidente.nome.trim(),
      presidente_partido: vagas.presidente.partido.trim(),
      presidente_foto: vagas.presidente.foto,
      mandato_desde: $("pol-desde").value || null,
      deputados,
      eleicao_abre: abre ? new Date(abre).toISOString() : null,
      eleicao_fecha: fecha ? new Date(fecha).toISOString() : null,
    };
    if (vagas.presidente.perfil_id !== undefined) {
      payloadPol.presidente_id = vagas.presidente.perfil_id || null;
    }
    let { error: e1 } = await sb.from("politica").update(payloadPol).eq("id", 1);
    if (e1 && /presidente_id/i.test(e1.message)) {
      delete payloadPol.presidente_id;
      ({ error: e1 } = await sb.from("politica").update(payloadPol).eq("id", 1));
    }
    const { error: e2 } = await sb.from("politica_link").update({ link }).eq("id", 1);

    if (e1 || e2) {
      $("pol-msg").textContent = "Não foi possível salvar: " + (e1 || e2).message;
      return;
    }

    const presId = vagas.presidente.perfil_id || null;
    const depIds = deputados.map(d => d.perfil_id).filter(Boolean);
    if (presId || depIds.length) {
      await sb.rpc("sincronizar_cargos_politica", { pres_id: presId, dep_ids: depIds });
      await Promise.all([recarregar(), carregarCargos()]);
    }

    // Sincroniza também o mandato atual (atual = true) no Mural Político
    await sb.from("politica_mandatos").update({
      presidente_nome: vagas.presidente.nome.trim() || "Pedro Henrique Galli",
      presidente_partido: vagas.presidente.partido.trim(),
      presidente_foto: vagas.presidente.foto,
      deputados: deputados.filter(d => d && d.nome),
      inicio: $("pol-desde").value || null,
    }).eq("atual", true);

    const usadas = [vagas.presidente.foto, ...deputados.map(d => d.foto)].filter(Boolean);
    for (const antiga of fotosAntigas) if (!usadas.includes(antiga)) await apagarArquivo(antiga);
    fotosAntigas.splice(0, fotosAntigas.length, ...usadas);
    $("pol-msg").textContent = "Salvo. Cargos e tags atualizados na aba Política.";
  });
}

// ================= TAGS =================
let tags = [];
let donos = [];

async function carregarTags() {
  const [{ data: t }, { data: d }] = await Promise.all([
    sb.from("tags").select("*").order("nome"),
    sb.from("perfil_tags").select("perfil_id, tag_id"),
  ]);
  tags = (t || []).sort((a, b) => (a.ordem ?? 500) - (b.ordem ?? 500));
  donos = d || [];
}

function mostrarTags() {
  if (!tags.length) {
    $("lista-tags").innerHTML = '<p class="aviso" style="margin: 0">Nenhuma tag criada ainda.</p>';
    return;
  }

  $("lista-tags").innerHTML = `<p class="dica-admin" style="margin-top: 0">Ordem da hierarquia (de cima para baixo).
    Ao lado do nome aparece só a tag mais alta; admins mostram "Admin" e a próxima. <b>Admin</b> fica sempre no topo.</p>` +
    tags.map((tag, k) => {
    const temTag = donos.filter(d => d.tag_id === tag.id).map(d => d.perfil_id);
    const comTag = aprovados().filter(p => temTag.includes(p.id));
    let semTag = aprovados().filter(p => !temTag.includes(p.id));
    if (tag.sistema && tag.nome === "Visitante") {
      const idKatequista = tags.find(t => t.sistema && t.nome === "Katequista")?.id;
      semTag = semTag.filter(p => !p.admin && !donos.some(d => d.perfil_id === p.id && d.tag_id === idKatequista));
    }
    return `
      <div class="item-tag">
        <div class="item-tag-topo">
          <span class="setas-ordem">
            <button title="Subir na hierarquia" data-subir="${k}" ${k === 0 ? "disabled" : ""}>↑</button>
            <button title="Descer na hierarquia" data-descer="${k}" ${k === tags.length - 1 ? "disabled" : ""}>↓</button>
          </span>
          ${htmlTag(tag)}
          <span class="contagem-tag">${comTag.length} ${comTag.length === 1 ? "membro" : "membros"}</span>
          ${tag.sistema
            ? '<span class="selo-sistema" title="Tag do sistema: não pode ser apagada">sistema</span>'
            : `<button class="link-apagar" data-apagar-tag="${tag.id}">Apagar</button>`}
        </div>
        <div class="membros-tag">
          ${comTag.map(p => `
            <span class="pessoa-chip">${esc(p.nome)}<button title="Tirar a tag" data-tirar="${tag.id}" data-perfil="${p.id}">×</button></span>`).join("")}
          ${semTag.length ? `
            <select class="mini" data-dar="${tag.id}">
              <option value="">+ adicionar</option>
              ${semTag.map(p => `<option value="${p.id}">${esc(p.nome)} (@${esc(p.usuario)})</option>`).join("")}
            </select>` : ""}
        </div>
      </div>`;
  }).join("");
}

$("lista-tags").addEventListener("change", async (e) => {
  const lista = e.target.closest("select[data-dar]");
  if (!lista || !lista.value) return;
  lista.disabled = true;
  await sb.from("perfil_tags").insert({ perfil_id: lista.value, tag_id: Number(lista.dataset.dar) });
  await recarregar();
});

$("form-tag").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const { error } = await sb.from("tags").insert({ nome: $("tag-nome").value.trim(), cor: $("tag-cor").value });
  if (error) return avisarJanela(/duplicate|unique/i.test(error.message) ? "Já existe uma tag com esse nome." : "Não foi possível criar: " + error.message);
  $("tag-nome").value = "";
  await recarregar();
});

$("lista-tags").addEventListener("click", async (e) => {
  const apagar = e.target.closest("[data-apagar-tag]");
  const tirar = e.target.closest("[data-tirar]");
  const subir = e.target.closest("[data-subir]");
  const descer = e.target.closest("[data-descer]");

  if (subir || descer) {
    const k = Number((subir || descer).dataset[subir ? "subir" : "descer"]);
    const outro = subir ? k - 1 : k + 1;
    [tags[k], tags[outro]] = [tags[outro], tags[k]];
    mostrarTags();
    const { error } = await sb.rpc("ordenar_tags", { ids: tags.map(t => t.id) });
    if (error) avisarJanela("Não foi possível salvar a ordem: " + error.message);
    await carregarCargos();
    return;
  }

  if (apagar) {
    if (!(await confirmar("Apagar esta tag? Ela sai de todos os membros.", "Apagar"))) return;
    await sb.from("tags").delete().eq("id", apagar.dataset.apagarTag);
  } else if (tirar) {
    await sb.from("perfil_tags").delete().eq("tag_id", tirar.dataset.tirar).eq("perfil_id", tirar.dataset.perfil);
  } else {
    return;
  }
  await recarregar();
});

// ================= USO DO ESPAÇO =================
const MB = 1024 * 1024;
const LIMITE_BANCO = 500 * MB;
const LIMITE_ARQUIVOS = 1024 * MB;

function tamanho(bytes) {
  return bytes >= 1024 * MB ? (bytes / 1024 / MB).toFixed(2) + " GB" : (bytes / MB).toFixed(1) + " MB";
}

function htmlUso(titulo, usado, limite, detalhe) {
  const pct = Math.min(100, (usado / limite) * 100);
  return `
    <div class="uso ${pct >= 80 ? "alerta" : ""}">
      <div class="uso-topo"><strong>${titulo}</strong><span>${tamanho(usado)} de ${tamanho(limite)}</span></div>
      <div class="trilho"><div style="width: ${pct.toFixed(1)}%"></div></div>
      <small>${pct.toFixed(1)}% usado${detalhe ? " · " + detalhe : ""}</small>
    </div>`;
}

async function mostrarUso() {
  const { data: uso, error } = await sb.rpc("uso_do_espaco");
  const projeto = new URL(SUPABASE_URL).hostname.split(".")[0];
  const trafego = `
    <div class="uso">
      <div class="uso-topo"><strong>Tráfego do mês</strong><span>limite de 5 GB</span></div>
      <small>O Supabase não informa esse número para o site.
        <a href="https://supabase.com/dashboard/project/${projeto}/usage" target="_blank" rel="noopener">Ver no painel do Supabase →</a></small>
    </div>`;

  if (error || !uso) {
    $("usos").innerHTML = '<p class="aviso" style="margin: 0">Não foi possível medir. Confira se o supabase-3.sql foi executado.</p>' + trafego;
    return;
  }
  $("usos").innerHTML =
    htmlUso("Banco de dados", uso.banco, LIMITE_BANCO, "textos, perfis, eventos") +
    htmlUso("Arquivos", uso.arquivos, LIMITE_ARQUIVOS, `${uso.qtd_arquivos} ${uso.qtd_arquivos === 1 ? "foto" : "fotos"}`) +
    trafego;
}

// ================= RASCUNHO DA CONFIG =================
const rascunho = JSON.parse(JSON.stringify(dados));

function marcarAlterado() {
  $("status").textContent = "Há alterações não salvas.";
}
$("sec-frases").addEventListener("input", marcarAlterado);

$("t-lemas").value = (rascunho.lemas || []).join("\n");
$("t-gritos").value = (rascunho.gritos || []).join("\n");
$("t-sabedorias").value = (rascunho.sabedorias || []).join("\n");

// ================= SALVAR =================
const linhas = (texto) => texto.split("\n").map(l => l.trim()).filter(l => l);

$("salvar").addEventListener("click", async () => {
  rascunho.lemas = linhas($("t-lemas").value);
  rascunho.gritos = linhas($("t-gritos").value);
  rascunho.sabedorias = linhas($("t-sabedorias").value);

  if (!rascunho.lemas.length || !rascunho.gritos.length || !rascunho.sabedorias.length) {
    $("status").textContent = "Cada lista de frases precisa de pelo menos uma frase.";
    return;
  }
  $("status").textContent = "Salvando...";
  const { data: atual } = await sb.from("config").select("dados").eq("id", 1).single();
  const { error } = await sb.from("config").update({ dados: { ...(atual?.dados || rascunho),
    lemas: rascunho.lemas, gritos: rascunho.gritos, sabedorias: rascunho.sabedorias } }).eq("id", 1);
  $("status").textContent = error ? "Não foi possível salvar: " + error.message : "Salvo. Já vale para todos.";
});

await Promise.all([recarregar(), mostrarUso()]);
