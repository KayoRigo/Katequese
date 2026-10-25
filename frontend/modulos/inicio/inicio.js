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

    // Reinicia a animação do pulo (tira a classe, força o navegador
    // a "perceber" e coloca de novo)
    letra.classList.remove("pulando");
    void letra.offsetWidth;
    letra.classList.add("pulando");

    if (cliques === 10) lema.textContent = "Já são 10 cliques. Vai estudar, desgraça.";
    else if (cliques === 25) lema.textContent = "25 cliques. Você não tem vida não, porra?";
    else lema.textContent = sortear(gritos);

    // Pausa a máquina de escrever e, depois, recomeça numa frase nova
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
  digitado = (digitado + e.key.toLowerCase()).slice(-9); // guarda só as últimas 9 teclas
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
    setTimeout(() => pedaco.remove(), 5000); // limpa depois que caiu
  }
}

// ================= PRÓXIMO ENCONTRO =================
const agora = new Date();
const todosEventos = await buscarEventos();
const proximo = todosEventos.find(ev => inicioEvento(ev) > agora);
document.getElementById("sem-evento").hidden = !!proximo;
document.getElementById("com-evento").hidden = !proximo;

const doisDigitos = n => String(n).padStart(2, "0");

if (proximo) {
  document.getElementById("proximo-titulo").textContent = proximo.titulo;
  const quando = lerData(proximo.data).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  document.getElementById("proximo-detalhe").textContent =
    [quando, proximo.hora?.slice(0, 5), proximo.local].filter(Boolean).join(" · ");

  function atualizarContagem() {
    const resta = Math.max(0, inicioEvento(proximo) - Date.now()); // em milissegundos
    const s = Math.floor(resta / 1000);
    document.getElementById("cd-dias").textContent = doisDigitos(Math.floor(s / 86400));
    document.getElementById("cd-horas").textContent = doisDigitos(Math.floor(s / 3600) % 24);
    document.getElementById("cd-min").textContent = doisDigitos(Math.floor(s / 60) % 60);
    document.getElementById("cd-seg").textContent = doisDigitos(s % 60);
  }
  atualizarContagem();
  setInterval(atualizarContagem, 1000); // atualiza a cada segundo

  // Quantos confirmaram presença
  const respostas = (await buscarPresencas([proximo.id]))[proximo.id] || [];
  const vao = respostas.filter(r => r.resposta === "vou").length;
  const minha = respostas.find(r => r.perfil_id === eu.id)?.resposta;
  document.getElementById("proximo-presenca").textContent =
    (vao ? `${vao} ${vao === 1 ? "confirmou" : "confirmaram"} presença` : "Ninguém confirmou presença ainda")
    + (eu.katequista ? (minha ? ` · Sua resposta: ${RESPOSTAS[minha]}` : " · Você ainda não respondeu") : "");
}

// ================= MURAL =================
// Anúncio oficial com prioridade (o mais recente) em destaque + os 3 últimos recados
async function mostrarMural() {
  const [anuncios, recados] = await Promise.all([buscarAnuncios(1), buscarRecados(3)]);
  if (anuncios === null || recados === null) return; // supabase-12.sql ainda não rodou: não mostra nada
  document.getElementById("secao-mural").hidden = false;

  const destaque = anuncios.find(a => a.prioridade);
  if (destaque) {
    document.getElementById("anuncio-destaque").innerHTML =
      `<a class="anuncio-link" href="mural.html">${htmlAnuncio(destaque)}</a>`;
  }

  const links = await linksDosArquivos(recados.map(r => r.perfis?.foto_path));
  document.getElementById("ultimos-recados").innerHTML = recados.length
    ? `<div class="lista-recados compacta">${recados.map(r => htmlRecado(r, links[r.perfis?.foto_path])).join("")}</div>`
    : '<p class="detalhe">Nenhum recado ainda.</p>';
}
await mostrarMural();

// ================= ANIVERSÁRIOS =================
// Mostra quem faz aniversário hoje (em destaque) e os próximos.
const aniversarios = await buscarAniversarios();
const caixaAniv = document.getElementById("aniversarios");
if (!aniversarios.length) {
  caixaAniv.innerHTML = '<p class="detalhe">Ninguém colocou o aniversário no perfil ainda.</p>';
} else {
  const fotosAniv = await linksDosArquivos(aniversarios.map(p => p.foto_path));
  const hojeAniv = aniversarios.filter(p => p.faltam === 0);
  const proximos = aniversarios.filter(p => p.faltam > 0).slice(0, hojeAniv.length ? 3 : 4);
  caixaAniv.innerHTML = `
    ${hojeAniv.map(p => `
      <div class="aniversario-hoje">
        ${htmlAvatar(p, fotosAniv[p.foto_path], "pequena")}
        <div><strong>Hoje é aniversário de ${esc(nomeDe(p))}</strong><small>${esc(diaDoAniversario(p.aniversario))}</small></div>
      </div>`).join("")}
    <ul class="lista-aniversarios">
      ${proximos.map(p => `
        <li>
          ${htmlAvatar(p, fotosAniv[p.foto_path], "pequena")}
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
  const links = await linksDosArquivos([membroSemana.foto]);
  const foto = links[membroSemana.foto]
    ? `<img class="foto-semana" src="${esc(links[membroSemana.foto])}" alt="">`
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
// O número do dia (desde 1970) escolhe a frase: muda sozinha todo dia
const numeroDoDia = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
document.getElementById("sabedoria").textContent = sabedorias[numeroDoDia % sabedorias.length];

// ================= CONTADORES =================
// Membros = katequistas; visitantes = os outros aprovados. Eventos = de hoje em diante.
const [{ data: aprovados }, tagsDosPerfis] = await Promise.all([
  sb.from("perfis").select("id, admin").eq("status", "aprovado"),
  buscarTagsDosPerfis(),
]);
const totalKatequistas = (aprovados || []).filter(p => ehKatequistaPerfil(p, tagsDosPerfis[p.id])).length;
const hoje = new Date();
hoje.setHours(0, 0, 0, 0);
const contadores = {
  membros: totalKatequistas,
  visitantes: (aprovados || []).length - totalKatequistas,
  eventos: todosEventos.filter(ev => lerData(ev.data) >= hoje).length,
};

// ================= ANIMAÇÕES AO ROLAR A PÁGINA =================
function contarAte(el) {
  if (contadores[el.dataset.chave] === null) return; // sem número ainda: deixa o "—"
  const alvo = contadores[el.dataset.chave];
  const inicio = performance.now();
  const duracao = 1200;
  function passo(momento) {
    const t = Math.min(1, (momento - inicio) / duracao);
    const suave = 1 - Math.pow(1 - t, 3); // começa rápido e desacelera no fim
    el.textContent = Math.round(alvo * suave).toLocaleString("pt-BR");
    if (t < 1) requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);
}

// O IntersectionObserver avisa quando um elemento aparece na tela
const observador = new IntersectionObserver((entradas) => {
  entradas.forEach(entrada => {
    if (!entrada.isIntersecting) return;
    entrada.target.classList.add("visivel");
    entrada.target.querySelectorAll(".contador").forEach(contarAte);
    observador.unobserve(entrada.target); // anima só uma vez
  });
}, { threshold: 0.15 });

document.querySelectorAll(".aparecer").forEach(el => observador.observe(el));
