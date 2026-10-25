// =====================================================================
// modulos/sorteios/sorteios.js — sorteios com roleta e histórico (sorteios.html).
// =====================================================================

const eu = await iniciarPagina();
const $ = (id) => document.getElementById(id);
const form = $("form-sorteio");
const janela = $("janela");

if (!eu.katequista) {
  $("abrir-form").hidden = true;
  $("subtitulo").textContent = "Você está vendo os sorteios liberados para visitantes.";
}

// "Um item por linha", sem linhas vazias e sem repetidos
const lerItens = (texto) => [...new Set(texto.split("\n").map(l => l.trim()).filter(Boolean))];

let sorteios = [];     // lista vinda do banco
let resultados = {};   // { id_do_sorteio: [resultados, do mais novo para o mais antigo] }
let links = {};        // fotos

// ---------- Buscar e mostrar a lista ----------
async function carregar() {
  const { data, error } = await sb
    .from("sorteios")
    .select("*, perfis!autor_id(nome, apelido)")
    .order("criado_em", { ascending: false });
  if (error) {
    $("sorteios").innerHTML = `<p class="vazio">A aba Sorteios ainda não está pronta no banco. O admin precisa rodar o <b>supabase-11.sql</b>.</p>`;
    return false;
  }
  sorteios = data;

  const ids = sorteios.map(s => s.id);
  resultados = {};
  if (ids.length) {
    const { data: rs } = await sb
      .from("sorteio_resultados")
      .select("id, sorteio_id, item, sorteado_em, sorteado_por, perfis(nome, apelido)")
      .in("sorteio_id", ids)
      .order("sorteado_em", { ascending: false });
    (rs || []).forEach(r => (resultados[r.sorteio_id] ||= []).push(r));
  }
  links = await linksDosArquivos(sorteios.map(s => s.foto_path));
  return true;
}

function mostrarLista() {
  if (!sorteios.length) {
    $("sorteios").innerHTML = '<p class="vazio">Nenhum sorteio ainda.</p>';
    return;
  }
  $("sorteios").innerHTML = `<div class="lista-sorteios">${sorteios.map(s => {
    const ultimo = resultados[s.id]?.[0];
    return `
      <button class="sorteio-card" data-abrir="${s.id}">
        ${links[s.foto_path] ? `<img src="${esc(links[s.foto_path])}" alt="">` : ""}
        <span class="sorteio-corpo">
          <strong>${esc(s.titulo)}</strong>
          <small>${s.itens.length} itens · criado por ${htmlNome(s.perfis, s.autor_id)}${eu.katequista ? " · " + htmlVisibilidade(s) : ""}</small>
          <span class="sorteio-ultimo">${ultimo ? `Último resultado: <b>${esc(ultimo.item)}</b>` : "Ainda não sorteado"}</span>
        </span>
      </button>`;
  }).join("")}</div>`;
}

// ---------- A roleta ----------
// Cada linha da roleta tem esta altura (igual ao CSS: --linha-roleta)
const ALTURA = 64;

// Monta a "fita" da roleta com o item que deve aparecer no meio
function htmlFita(lista) {
  return lista.map(item => `<div class="roleta-item">${esc(item)}</div>`).join("");
}

// Gira a roleta e para no resultado. Devolve uma Promise que termina quando ela para.
function girar(roleta, itens, resultado) {
  const fita = roleta.querySelector(".roleta-fita");
  // Sequência: muitos itens embaralhados, o resultado, e mais um depois (para a linha de baixo)
  const voltas = Math.max(36, itens.length * 3);
  const sequencia = [];
  for (let i = 0; i < voltas; i++) {
    let item;
    do { item = sortear(itens); } while (itens.length > 1 && item === sequencia[sequencia.length - 1]);
    sequencia.push(item);
  }
  const posicaoResultado = sequencia.length;
  sequencia.push(resultado, sortear(itens));

  roleta.classList.remove("parou");
  fita.innerHTML = htmlFita(sequencia);
  fita.style.transition = "none";
  fita.style.transform = "translateY(0)";
  void fita.offsetHeight; // força o navegador a "aplicar" a posição inicial antes de animar

  // A roleta mostra 3 linhas: o resultado tem que parar na do meio (por isso o "- 1")
  return new Promise(terminar => {
    fita.style.transition = "transform 4.2s cubic-bezier(0.12, 0.8, 0.18, 1)"; // começa rápido e freia devagar
    fita.style.transform = `translateY(${-(posicaoResultado - 1) * ALTURA}px)`;
    fita.addEventListener("transitionend", () => {
      fita.children[posicaoResultado].classList.add("vencedor");
      roleta.classList.add("parou");
      terminar();
    }, { once: true });
  });
}

// Roleta parada mostrando um item no meio (sem animação)
function pararEm(roleta, itens, item) {
  const fita = roleta.querySelector(".roleta-fita");
  fita.style.transition = "none";
  fita.style.transform = "translateY(0)";
  fita.innerHTML = htmlFita([sortear(itens), item, sortear(itens)]);
  if (item !== "?") fita.children[1].classList.add("vencedor");
}

// ---------- Janela de um sorteio ----------
function abrirSorteio(id) {
  const s = sorteios.find(x => x.id === id);
  if (!s) return;
  history.replaceState(null, "", "#" + id); // dá para mandar o link direto deste sorteio

  const historico = resultados[s.id] || [];
  const jaSairam = new Set(historico.map(r => r.item));
  const restam = s.sem_repetir ? s.itens.filter(i => !jaSairam.has(i)).length : s.itens.length;
  const podeSortear = eu.katequista && (s.autor_id === eu.id || eu.admin);
  const quando = (d) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  janela.innerHTML = `
    <div class="sorteio-janela">
      <div class="sorteio-topo">
        <div>
          <h2>${esc(s.titulo)}</h2>
          <small>${s.itens.length} itens${s.sem_repetir ? ` · sem repetir · restam ${restam}` : ""} · criado por ${htmlNome(s.perfis, s.autor_id)}</small>
        </div>
        <button class="botao-pequeno" data-fechar>Fechar</button>
      </div>
      ${links[s.foto_path] ? `<img class="sorteio-imagem" src="${esc(links[s.foto_path])}" alt="">` : ""}

      <div class="roleta" id="roleta"><div class="roleta-fita"></div></div>

      <div class="sorteio-acoes">
        ${podeSortear
          ? `<button class="botao" id="botao-sortear" ${restam ? "" : "disabled"}>${restam ? "Sortear" : "Todos os itens já saíram"}</button>`
          : `<p class="aviso">Só quem criou o sorteio pode sortear.</p>`}
        ${historico.length ? `<button class="botao-pequeno" id="rever">Rever animação</button>` : ""}
      </div>

      <div class="sorteio-colunas">
        <div>
          <p class="rotulo">Itens</p>
          <div class="sorteio-itens">
            ${s.itens.map(i => `<span class="${s.sem_repetir && jaSairam.has(i) ? "saiu" : ""}">${esc(i)}</span>`).join("")}
          </div>
        </div>
        <div>
          <p class="rotulo">Histórico</p>
          ${historico.length ? `<ol class="sorteio-historico">
            ${historico.map(r => `<li><b>${esc(r.item)}</b><small>${quando(r.sorteado_em)}${r.perfis ? " · por " + htmlNome(r.perfis, r.sorteado_por) : ""}</small></li>`).join("")}
          </ol>` : '<p class="aviso" style="margin-top: 0">Ainda não sorteado.</p>'}
        </div>
      </div>

      ${podeSortear ? `
        <div class="sorteio-rodape">
          ${historico.length ? `<button class="botao-pequeno" id="limpar">Limpar histórico</button>` : ""}
          <button class="botao-pequeno perigo" id="apagar">Apagar sorteio</button>
        </div>` : ""}
    </div>`;

  const roleta = $("roleta");
  let girando = false;
  pararEm(roleta, s.itens, historico[0]?.item || "?");
  if (!janela.open) janela.showModal();

  // Sortear: o banco escolhe, depois a roleta gira até o resultado
  $("botao-sortear")?.addEventListener("click", async (e) => {
    if (girando) return;
    girando = true;
    const botao = e.currentTarget;
    botao.disabled = true;
    if ($("rever")) $("rever").disabled = true;
    botao.textContent = "Sorteando...";
    const { data: resultado, error } = await sb.rpc("sortear", { id_sorteio: s.id });
    if (error) {
      girando = false;
      botao.textContent = "Sortear";
      botao.disabled = false;
      if ($("rever")) $("rever").disabled = false;
      return avisarJanela(error.message);
    }
    await girar(roleta, s.itens, resultado);
    await carregar();
    mostrarLista();
    // Atualiza a janela se ela continuar aberta, sem perder a roleta parada no resultado
    setTimeout(() => { if (janela.open) abrirSorteio(s.id); }, 1400);
  });

  // Rever: gira de novo até o último resultado (não sorteia nada)
  $("rever")?.addEventListener("click", async (e) => {
    if (girando) return;
    girando = true;
    const botao = e.currentTarget;
    botao.disabled = true;
    await girar(roleta, s.itens, historico[0].item);
    botao.disabled = false;
    girando = false;
  });

  $("limpar")?.addEventListener("click", async () => {
    if (!(await confirmar("Apagar todo o histórico deste sorteio? Os itens voltam a poder sair.", "Limpar"))) return;
    const { error } = await sb.from("sorteio_resultados").delete().eq("sorteio_id", s.id);
    if (error) return avisarJanela("Não foi possível limpar: " + error.message);
    await carregar(); mostrarLista(); abrirSorteio(s.id);
  });

  $("apagar")?.addEventListener("click", async () => {
    if (!(await confirmar("Apagar este sorteio?", "Apagar"))) return;
    const { error } = await sb.from("sorteios").delete().eq("id", s.id);
    if (error) return avisarJanela("Não foi possível apagar: " + error.message);
    await apagarArquivo(s.foto_path);
    janela.close();
    await carregar(); mostrarLista();
  });
}

// Fechar a janela: botão "Fechar", clique fora dela ou Esc
janela.addEventListener("click", (e) => {
  if (e.target.closest("[data-fechar]") || e.target === janela) janela.close();
});
janela.addEventListener("close", () => history.replaceState(null, "", location.pathname));

$("sorteios").addEventListener("click", (e) => {
  const card = e.target.closest("[data-abrir]");
  if (card) abrirSorteio(Number(card.dataset.abrir));
});

// ---------- Formulário ----------
$("itens").addEventListener("input", () => {
  const n = lerItens($("itens").value).length;
  $("contador-itens").textContent = `${n} ${n === 1 ? "item" : "itens"}`;
});
$("abrir-form").addEventListener("click", () => {
  form.hidden = false;
  $("abrir-form").hidden = true;
  $("titulo").focus();
});
function fecharForm() {
  form.reset();
  form.hidden = true;
  $("abrir-form").hidden = false;
  $("progresso").textContent = "";
  $("contador-itens").textContent = "0 itens";
}
$("cancelar").addEventListener("click", fecharForm);

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const itens = lerItens($("itens").value);
  if (itens.length < 2) return $("progresso").textContent = "Coloque pelo menos 2 itens (um por linha).";
  if (itens.length > 200) return $("progresso").textContent = "No máximo 200 itens.";
  if (itens.some(i => i.length > 100)) return $("progresso").textContent = "Cada item pode ter no máximo 100 letras.";

  $("salvar").disabled = true;
  $("progresso").textContent = "Criando...";
  try {
    let foto_path = null;
    const arquivo = $("foto").files[0];
    if (arquivo) {
      $("progresso").textContent = "Enviando imagem...";
      foto_path = await enviarArquivo("sorteios", await reduzirImagem(arquivo));
    }
    const { data, error } = await sb.from("sorteios").insert({
      titulo: $("titulo").value.trim(),
      foto_path,
      itens,
      sem_repetir: $("sem-repetir").checked,
      visivel_visitantes: $("visivel").checked,
    }).select("id").single();
    if (error) throw error;

    fecharForm();
    await carregar();
    mostrarLista();
    abrirSorteio(data.id); // já abre o sorteio novo, pronto para sortear
  } catch (erro) {
    $("progresso").textContent = "Não foi possível criar: " + erro.message;
  } finally {
    $("salvar").disabled = false;
  }
});

// ---------- Começo ----------
if (await carregar()) {
  mostrarLista();
  // Link direto para um sorteio (sorteios.html#12)
  const idDoLink = Number(location.hash.slice(1));
  if (idDoLink) abrirSorteio(idDoLink);
}
