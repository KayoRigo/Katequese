// =====================================================================
// dados.js — funções de ajuda usadas por várias páginas.
//
// O conteúdo editável pelo admin (frases e membro da semana)
// fica no banco de dados. O banco.js busca e chama usarDados()
// para preencher as variáveis abaixo.
// =====================================================================

let dados, lemas, gritos, sabedorias, membroSemana;

function usarDados(d) {
  dados = d;
  lemas = d.lemas?.length ? d.lemas : ["Katequese"];
  gritos = d.gritos?.length ? d.gritos : ["Katequese"];
  sabedorias = d.sabedorias?.length ? d.sabedorias : [""];
  membroSemana = d.membroSemana || null;
}

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

// Protege contra código malicioso: transforma < > & " em texto comum.
// Sempre use isso antes de colocar texto digitado por alguém dentro de innerHTML.
function esc(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML.replace(/"/g, "&quot;");
}

// Transforma "2026-11-07" em um objeto Date (meia-noite, no horário local)
function lerData(texto) {
  return new Date(texto + "T00:00:00");
}

// Data e hora exatas em que o evento começa ("20:00:00" vem do banco com segundos)
function inicioEvento(ev) {
  return new Date(`${ev.data}T${(ev.hora || "00:00").slice(0, 5)}:00`);
}

// Nome que aparece para os outros: o apelido, se tiver; senão, o nome
function nomeDe(pessoa) {
  return pessoa ? (pessoa.apelido || pessoa.nome) : "Ex-membro";
}

// Foto de perfil, ou a primeira letra do nome quando não tem foto
function htmlAvatar(pessoa, link, classe = "") {
  if (link) return `<img class="iniciais ${classe}" src="${esc(link)}" alt="">`;
  const letra = (pessoa.nome || pessoa.usuario || "?")[0].toUpperCase();
  return `<div class="iniciais ${classe}">${esc(letra)}</div>`;
}

// Uma tag no estilo Discord (a cor já foi conferida pelo banco: sempre "#rrggbb")
function htmlTag(tag, botaoRemover = "") {
  return `<span class="tag" style="--cor-tag: ${esc(tag.cor)}">${esc(tag.nome)}${botaoRemover}</span>`;
}

// Cartão de um evento. "mostrarVisibilidade" avisa (só para katequistas) se visitantes veem o evento.
// "extra" é um pedaço de HTML que entra antes do rodapé (ex: a confirmação de presença).
function htmlEvento(ev, linkFoto, passou, podeApagar, mostrarVisibilidade, extra = "") {
  const d = lerData(ev.data);
  const dia = String(d.getDate()).padStart(2, "0");
  const info = [ev.hora ? ev.hora.slice(0, 5) : "", ev.local].filter(Boolean).join(" · ");
  return `
    <article class="evento-card ${passou ? "passou" : ""}" data-evento="${ev.id}">
      ${linkFoto ? `<img src="${esc(linkFoto)}" alt="">` : ""}
      <div class="evento-corpo">
        <div class="evento-topo">
          <div class="data">${dia}<small>${MESES[d.getMonth()]}</small></div>
          <div>
            <h3>${esc(ev.titulo)}</h3>
            ${info ? `<p class="evento-info">${esc(info)}</p>` : ""}
          </div>
        </div>
        ${ev.descricao ? `<p class="evento-desc">${esc(ev.descricao)}</p>` : ""}
        ${extra}
        <div class="evento-rodape">
          <span>Criado por ${htmlNome(ev.perfis, ev.autor_id)}${mostrarVisibilidade ? " · " + htmlVisibilidade(ev) : ""}</span>
          ${podeApagar ? `<button class="botao-pequeno perigo" data-apagar="${ev.id}">Apagar</button>` : ""}
        </div>
      </div>
    </article>`;
}

// ---------------- Presença nos eventos ----------------
const RESPOSTAS = { vou: "Vou", talvez: "Talvez", nao: "Não vou" };

// Bloco de presença dentro do cartão do evento.
// respostas: lista do buscarPresencas; links: fotos de perfil; podeResponder: katequista e evento não passou.
function htmlPresenca(ev, respostas, links, podeResponder, passou) {
  const minha = respostas.find(r => r.perfil_id === perfilAtual.id)?.resposta || null;
  const grupo = (tipo) => respostas.filter(r => r.resposta === tipo);
  const vao = grupo("vou"), talvez = grupo("talvez"), naoVao = grupo("nao");

  // Fileira de fotinhas de quem vai (até 8; o resto vira "+N")
  const fotos = vao.slice(0, 8).map(r => htmlAvatar(r.perfis || {}, links[r.perfis?.foto_path], "mini")).join("");
  const sobra = vao.length > 8 ? `<span class="mais-gente">+${vao.length - 8}</span>` : "";

  const resumo = passou
    ? (vao.length ? `${vao.length} ${vao.length === 1 ? "foi" : "foram"}` : "Ninguém confirmou presença")
    : [vao.length && `${vao.length} ${vao.length === 1 ? "vai" : "vão"}`,
       talvez.length && `${talvez.length} talvez`,
       naoVao.length && `${naoVao.length} não ${naoVao.length === 1 ? "vai" : "vão"}`].filter(Boolean).join(" · ")
      || "Ninguém respondeu ainda";

  // Lista completa com os nomes, aberta num clique
  const nomes = (lista) => lista.map(r => htmlNome(r.perfis, r.perfil_id)).join(", ");
  const lista = respostas.length ? `
    <details class="presenca-lista">
      <summary>Ver quem respondeu</summary>
      ${vao.length ? `<p><b>Vão:</b> ${nomes(vao)}</p>` : ""}
      ${talvez.length ? `<p><b>Talvez:</b> ${nomes(talvez)}</p>` : ""}
      ${naoVao.length ? `<p><b>Não vão:</b> ${nomes(naoVao)}</p>` : ""}
    </details>` : "";

  const botoes = podeResponder ? `
    <div class="presenca-botoes">
      ${Object.entries(RESPOSTAS).map(([chave, texto]) => `
        <button class="botao-presenca ${chave} ${minha === chave ? "marcado" : ""}"
                data-presenca="${chave}" data-atual="${minha || ""}" aria-pressed="${minha === chave}">${texto}</button>`).join("")}
    </div>` : "";

  return `
    <div class="presenca">
      ${botoes}
      <div class="presenca-resumo">
        ${fotos || sobra ? `<div class="presenca-fotos">${fotos}${sobra}</div>` : ""}
        <span>${resumo}</span>
      </div>
      ${lista}
    </div>`;
}

// ---------------- Aniversários ----------------

// Quantos dias faltam para o próximo aniversário (0 = hoje). Ignora o ano de nascimento.
function diasAteAniversario(texto) {
  const nasc = lerData(texto);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  let proximo = new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate());
  // Quem nasceu em 29/02 comemora em 01/03 nos anos que não são bissextos
  if (nasc.getMonth() === 1 && nasc.getDate() === 29 && proximo.getMonth() !== 1) proximo = new Date(hoje.getFullYear(), 2, 1);
  if (proximo < hoje) proximo = new Date(hoje.getFullYear() + 1, nasc.getMonth(), nasc.getDate());
  return Math.round((proximo - hoje) / 86400000);
}

// "12 de março" (sem o ano)
function diaDoAniversario(texto) {
  return lerData(texto).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
}

// "hoje", "amanhã", "em 5 dias"
function quandoAniversario(dias) {
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

// ---------------- Cargos ao lado do nome ----------------
// Destaque de marca-texto na cor do cargo (Presidente, Deputado, Admin)
function htmlCargos(idPerfil) {
  return cargosDe(idPerfil).map(c =>
    `<span class="cargo" style="--cor-cargo: ${esc(c.cor)}">${esc(c.nome)}</span>`).join("");
}

// "Nome" + os cargos dele. Use no lugar de esc(nomeDe(pessoa)) quando souber o id.
function htmlNome(pessoa, idPerfil) {
  return `${esc(nomeDe(pessoa))}${htmlCargos(idPerfil)}`;
}

// ---------------- Mural ----------------

// "agora", "há 5 min", "há 3 h", "ontem", "12/10"
function tempoAtras(texto) {
  const ms = Date.now() - new Date(texto).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas} h`;
  if (horas < 48) return "ontem";
  return new Date(texto).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Um recado. "acoes" = HTML dos botões (fixar/apagar), montado por quem chama.
function htmlRecado(r, linkFoto, acoes = "", mostrarVisibilidade = false) {
  return `
    <article class="recado ${r.fixado ? "fixado" : ""}" data-recado="${r.id}">
      ${htmlAvatar(r.perfis || {}, linkFoto, "pequena")}
      <div class="recado-corpo">
        <div class="recado-topo">
          <strong>${htmlNome(r.perfis, r.autor_id)}</strong>
          <small>${tempoAtras(r.criado_em)}${r.fixado ? " · fixado" : ""}${mostrarVisibilidade ? " · " + htmlVisibilidade(r) : ""}</small>
        </div>
        <p>${esc(r.texto)}</p>
        ${acoes ? `<div class="recado-acoes">${acoes}</div>` : ""}
      </div>
    </article>`;
}

// Um anúncio oficial (mostra quem publicou, com o cargo destacado)
function htmlAnuncio(a, acoes = "", mostrarVisibilidade = false) {
  const data = new Date(a.criado_em).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  return `
    <article class="anuncio ${a.prioridade ? "prioridade" : ""}" data-anuncio="${a.id}">
      <div class="anuncio-topo">
        ${a.prioridade ? '<span class="selo-prioridade">Prioridade</span>' : ""}
        <span class="anuncio-cargo">${htmlNome(a.perfis, a.autor_id)}</span>
      </div>
      <h3>${esc(a.titulo)}</h3>
      <p>${esc(a.texto)}</p>
      <div class="anuncio-rodape">
        <small>${data}${mostrarVisibilidade ? " · " + htmlVisibilidade(a) : ""}</small>
        ${acoes ? `<div class="recado-acoes">${acoes}</div>` : ""}
      </div>
    </article>`;
}

// Avisinho de quem pode ver um evento ou foto
function htmlVisibilidade(item) {
  return item.visivel_visitantes
    ? '<span class="visibilidade publica">Visitantes podem ver</span>'
    : '<span class="visibilidade">Só katequistas</span>';
}

// ---------------- Janelas de confirmação e aviso ----------------
// Feitas pelo próprio site, no lugar do confirm() e alert() do navegador,
// que alguns navegadores bloqueiam sem avisar.
// Uso: if (!(await confirmar("Apagar isso?", "Apagar"))) return;

function confirmar(mensagem, textoBotao = "Confirmar") {
  return abrirJanelaAviso(mensagem, textoBotao, true);
}

function avisarJanela(mensagem) {
  return abrirJanelaAviso(mensagem, "OK", false);
}

function abrirJanelaAviso(mensagem, textoBotao, comCancelar) {
  return new Promise(responder => {
    const janela = document.createElement("dialog");
    janela.className = "janela janela-aviso";
    janela.innerHTML = `
      <p>${esc(mensagem)}</p>
      <div class="acoes">
        ${comCancelar ? '<button class="botao-pequeno" value="nao">Cancelar</button>' : ""}
        <button class="botao" value="sim">${esc(textoBotao)}</button>
      </div>`;
    document.body.appendChild(janela);
    // O botão clicado fecha a janela e diz qual foi a resposta
    janela.addEventListener("click", (e) => {
      const botao = e.target.closest("button");
      if (botao) janela.close(botao.value);
    });
    // Fechar com Esc conta como "Cancelar"
    janela.addEventListener("close", () => {
      responder(janela.returnValue === "sim");
      janela.remove();
    });
    janela.showModal();
  });
}

// Sorteia um item qualquer de uma lista
function sortear(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}
