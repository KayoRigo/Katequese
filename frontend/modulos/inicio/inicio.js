// =====================================================================
// modulos/inicio/inicio.js — lógica da página inicial (index.html).
// =====================================================================

// Confere o login e baixa os dados. Se não estiver aprovado, sai daqui.
const eu = await iniciarPagina();

// ================= NOME DO GRUPO =================
const nomeGrupo = document.getElementById("nome-grupo");

// Separa "Katequese" em uma <span> por letra. Cada uma entra com um
// pequeno atraso em relação à anterior, criando o efeito de "cascata"
nomeGrupo.innerHTML = nomeGrupo.textContent
  .split("")
  .map((letra, i) => `<span class="chegando" style="animation-delay:${i * 0.05}s">${letra}</span>`)
  .join("");

const letras = nomeGrupo.querySelectorAll("span");
letras.forEach(letra => {
  // Quando a animação de entrada termina, tira a classe (senão ela repetiria)
  letra.addEventListener("animationend", () => {
    letra.classList.remove("chegando");
    letra.style.animationDelay = "";
  }, { once: true });
});

// ================= MÁQUINA DE ESCREVER =================
const lema = document.getElementById("lema");
let iLema = 0;        // qual frase está sendo escrita
let iLetra = 0;       // quantas letras dela já apareceram
let apagando = false;
let pausadoAte = 0;   // quando alguém clica numa letra, a máquina pausa um pouco

function escrever() {
  if (Date.now() < pausadoAte) return setTimeout(escrever, 200);

  const frase = lemas[iLema];
  iLetra += apagando ? -1 : 1;
  lema.textContent = frase.slice(0, iLetra);

  let espera = apagando ? 25 : 60;
  if (!apagando && iLetra === frase.length) {
    apagando = true;            // terminou de escrever: espera e começa a apagar
    espera = 2500;
  } else if (apagando && iLetra === 0) {
    apagando = false;           // apagou tudo: passa para a próxima frase
    iLema = (iLema + 1) % lemas.length;
    espera = 400;
  }
  setTimeout(escrever, espera);
}
setTimeout(escrever, 1000); // começa depois que as letras terminam de entrar

// ================= SEGREDO 1: CLICAR NAS LETRAS =================
let cliques = 0;
letras.forEach(letra => {
  letra.addEventListener("click", () => {
    cliques++;

    letra.classList.remove("pulando");
    void letra.offsetWidth;
    letra.classList.add("pulando");

    if (cliques === 10) lema.textContent = "Já são 10 cliques. Vai estudar, desgraça.";
    else if (cliques === 25) lema.textContent = "25 cliques. Você não tem vida não, porra?";
    else lema.textContent = sortear(gritos);

    pausadoAte = Date.now() + 3500;
    iLetra = 0;
    apagando = false;
    iLema = (iLema + 1) % lemas.length;
  });
});

// ================= SEGREDO 2: DIGITAR "katequese" =================
let digitado = "";
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  digitado = (digitado + e.key.toLowerCase()).slice(-9);
  if (digitado === "katequese") {
    confete();
    lema.textContent = "Você achou o segredo, porra.";
    pausadoAte = Date.now() + 4000;
    iLetra = 0;
    apagando = false;
  }
});

function confete() {
  const cores = ["var(--destaque)", "var(--texto)", "var(--texto-suave)"];
  for (let i = 0; i < 140; i++) {
    const pedaco = document.createElement("div");
    pedaco.className = "confete";
    pedaco.style.left = Math.random() * 100 + "vw";
    pedaco.style.background = sortear(cores);
    pedaco.style.animationDuration = 2 + Math.random() * 2 + "s";
    pedaco.style.animationDelay = Math.random() * 0.5 + "s";
    document.body.appendChild(pedaco);
    setTimeout(() => pedaco.remove(), 5000);
  }
}

// Coloca um aviso discreto à direita de um botão do Acesso Rápido
function infoAtalho(href, texto) {
  if (!texto) return;
  const link = document.querySelector(`.atalhos a[href="${href}"]`);
  if (!link) return;
  link.querySelector(".atalho-info")?.remove();
  link.insertAdjacentHTML("beforeend", `<small class="atalho-info">${esc(texto)}</small>`);
}

// ================= BUSCA PARALELA DE TODAS AS SEÇÕES DA CAPA =================
const [
  todosEventos,
  anuncios,
  recados,
  aniversarios,
  { data: aprovados },
  tagsDosPerfis,
  { count: totalFotos },
  { data: carteiraCapa },
  { count: enquetesAbertas },
  { count: propostasAbertas },
] = await Promise.all([
  buscarEventos(),
  buscarAnuncios(1),
  buscarRecados(3),
  buscarAniversarios(),
  sb.from("perfis").select("id, admin").eq("status", "aprovado"),
  buscarTagsDosPerfis(),
  sb.from("midias").select("id", { count: "exact", head: true }),
  eu.katequista ? sb.from("carteiras").select("saldo").eq("perfil_id", eu.id).maybeSingle() : Promise.resolve({ data: null }),
  sb.from("enquetes").select("id", { count: "exact", head: true }).gt("termina_em", new Date().toISOString()),
  eu.katequista
    ? sb.from("propostas_lei").select("id", { count: "exact", head: true }).in("status", ["sugestao", "camara", "empate", "popular"])
    : Promise.resolve({ count: 0 }),
]);

// Gera numa única viagem os links das fotos de recados, aniversários e membro da semana
const linksCapa = await linksDosArquivos([
  ...(recados || []).map(r => r.perfis?.foto_path),
  ...(aniversarios || []).map(p => p.foto_path),
  membroSemana?.foto,
]);

// ================= PRÓXIMO ENCONTRO =================
const agora = new Date();
const proximo = todosEventos.find(ev => inicioEvento(ev) > agora);
document.getElementById("sem-evento").hidden = !!proximo;
document.getElementById("com-evento").hidden = !proximo;

const doisDigitos = n => String(n).padStart(2, "0");

if (proximo) {
  const dProx = lerData(proximo.data);
  infoAtalho("eventos.html", `${String(dProx.getDate()).padStart(2, "0")}/${MESES[dProx.getMonth()]}`);

  document.getElementById("proximo-titulo").textContent = proximo.titulo;
  const quando = dProx.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  document.getElementById("proximo-detalhe").textContent =
    [quando, proximo.hora?.slice(0, 5), proximo.local].filter(Boolean).join(" · ");

  function atualizarContagem() {
    if (document.hidden) return;
    const resta = Math.max(0, inicioEvento(proximo) - Date.now());
    const s = Math.floor(resta / 1000);
    document.getElementById("cd-dias").textContent = doisDigitos(Math.floor(s / 86400));
    document.getElementById("cd-horas").textContent = doisDigitos(Math.floor(s / 3600) % 24);
    document.getElementById("cd-min").textContent = doisDigitos(Math.floor(s / 60) % 60);
    document.getElementById("cd-seg").textContent = doisDigitos(s % 60);
  }
  atualizarContagem();
  setInterval(atualizarContagem, 1000);

  // Botões Vou / Talvez / Não vou + avatares de quem vai direto na capa
  const caixaPresenca = document.getElementById("proximo-presenca");
  async function mostrarPresencaProximo() {
    const respostas = (await buscarPresencas([proximo.id]))[proximo.id] || [];
    const fotos = await linksDosArquivos(respostas.map(r => r.perfis?.foto_path));
    caixaPresenca.innerHTML = htmlPresenca(proximo, respostas, fotos, eu.katequista, false);
  }
  await mostrarPresencaProximo();

  caixaPresenca.addEventListener("click", async (e) => {
    const botao = e.target.closest("[data-presenca]");
    if (!botao) return;
    caixaPresenca.querySelectorAll("[data-presenca]").forEach(b => b.disabled = true);
    const { error } = await responderPresenca(proximo.id, botao.dataset.presenca, botao.dataset.atual || null);
    if (error) await avisarJanela("Não foi possível responder: " + error.message);
    await mostrarPresencaProximo();
  });
}

// ================= ANÚNCIO COM PRIORIDADE E MURAL =================
if (anuncios !== null && recados !== null) {
  document.getElementById("secao-mural").hidden = false;

  const destaque = anuncios.find(a => a.prioridade);
  if (destaque) {
    document.getElementById("secao-anuncio").hidden = false;
    document.getElementById("anuncio-destaque").innerHTML =
      `<a class="anuncio-link" href="mural.html">${htmlAnuncio(destaque)}</a>`;
  }

  document.getElementById("ultimos-recados").innerHTML = recados.length
    ? `<div class="lista-recados compacta">${recados.map(r => htmlRecado(r, linksCapa[r.perfis?.foto_path])).join("")}</div>`
    : '<p class="detalhe">Nenhum recado ainda.</p>';
}

// ================= ANIVERSÁRIOS =================
const caixaAniv = document.getElementById("aniversarios");
if (!aniversarios.length) {
  caixaAniv.innerHTML = '<p class="detalhe">Ninguém colocou o aniversário no perfil ainda.</p>';
} else {
  const hojeAniv = aniversarios.filter(p => p.faltam === 0);
  const proximos = aniversarios.filter(p => p.faltam > 0).slice(0, hojeAniv.length ? 3 : 4);
  caixaAniv.innerHTML = `
    ${hojeAniv.map(p => `
      <div class="aniversario-hoje">
        ${htmlAvatar(p, linksCapa[p.foto_path], "pequena")}
        <div><strong>Hoje é aniversário de ${esc(nomeDe(p))}</strong><small>${esc(diaDoAniversario(p.aniversario))}</small></div>
      </div>`).join("")}
    <ul class="lista-aniversarios">
      ${proximos.map(p => `
        <li>
          ${htmlAvatar(p, linksCapa[p.foto_path], "pequena")}
          <span class="nome">${esc(nomeDe(p))}</span>
          <span class="aniv-data">${esc(diaDoAniversario(p.aniversario))}</span>
          <span class="quando">${quandoAniversario(p.faltam)}</span>
        </li>`).join("")}
    </ul>`;
}
if (!eu.aniversario) {
  caixaAniv.insertAdjacentHTML("beforeend", '<a class="link-mais" href="perfil.html">Colocar meu aniversário →</a>');
}

// ================= MEMBRO DA SEMANA =================
const caixaSemana = document.getElementById("membro-semana");
if (membroSemana?.nome) {
  const foto = linksCapa[membroSemana.foto]
    ? `<img class="foto-semana" src="${esc(linksCapa[membroSemana.foto])}" alt="">`
    : `<div class="foto-semana">${esc(membroSemana.nome[0].toUpperCase())}</div>`;
  caixaSemana.innerHTML = `
    <div class="membro-semana">
      ${foto}
      <div>
        <h3>${esc(membroSemana.nome)}</h3>
        ${membroSemana.descricao ? `<p>${esc(membroSemana.descricao)}</p>` : ""}
      </div>
    </div>`;
} else {
  caixaSemana.innerHTML = '<p class="detalhe">Ainda não definido.</p>';
}

// ================= FRASE DO DIA =================
const numeroDoDia = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
document.getElementById("sabedoria").textContent = sabedorias[numeroDoDia % sabedorias.length];

// ================= CONTADORES E INDICADORES DE ATALHO =================
if (carteiraCapa?.saldo !== undefined) {
  infoAtalho("economia.html", "K$ " + Number(carteiraCapa.saldo).toLocaleString("pt-BR"));
}
if (enquetesAbertas > 0) {
  infoAtalho("enquetes.html", `${enquetesAbertas} ${enquetesAbertas === 1 ? "aberta" : "abertas"}`);
}
if (propostasAbertas > 0) {
  infoAtalho("politica.html", `${propostasAbertas} na Câmara`);
}

const totalKatequistas = (aprovados || []).filter(p => ehKatequistaPerfil(p, tagsDosPerfis[p.id])).length;
const hoje = new Date();
hoje.setHours(0, 0, 0, 0);
const contadores = {
  membros: totalKatequistas,
  visitantes: (aprovados || []).length - totalKatequistas,
  eventos: todosEventos.filter(ev => lerData(ev.data) >= hoje).length,
  fotos: totalFotos || 0,
};

// ================= ANIMAÇÕES AO ROLAR A PÁGINA =================
function contarAte(el) {
  if (contadores[el.dataset.chave] === null) return;
  const alvo = contadores[el.dataset.chave];
  const inicio = performance.now();
  const duracao = 1200;
  function passo(momento) {
    const t = Math.min(1, (momento - inicio) / duracao);
    const suave = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(alvo * suave).toLocaleString("pt-BR");
    if (t < 1) requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);
}

const observador = new IntersectionObserver((entradas) => {
  entradas.forEach(entrada => {
    if (!entrada.isIntersecting) return;
    entrada.target.classList.add("visivel");
    entrada.target.querySelectorAll(".contador").forEach(contarAte);
    observador.unobserve(entrada.target);
  });
}, { threshold: 0.15 });

document.querySelectorAll(".aparecer").forEach(el => observador.observe(el));
