// =====================================================================
// 8-pagina-inicial.test.js — testes automatizados das 6 melhorias da
// página inicial (index.html, inicio.js e inicio.css).
// =====================================================================

const { test, describe } = require("node:test");
const assert = require("node:test");
const strictAssert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");
const lerHtml = () => fs.readFileSync(path.join(RAIZ, "frontend", "paginas", "index.html"), "utf8");
const lerJs = () => fs.readFileSync(path.join(RAIZ, "frontend", "modulos", "inicio", "inicio.js"), "utf8");
const lerCss = () => fs.readFileSync(path.join(RAIZ, "frontend", "modulos", "inicio", "inicio.css"), "utf8");

describe("Melhoria 1: Anúncio com Prioridade no topo do conteúdo", () => {
  test("#anuncio-destaque aparece no início de #conteudo, antes da seção de Acesso rápido (.atalhos)", () => {
    const html = lerHtml();
    const posConteudo = html.indexOf('id="conteudo"');
    const posAnuncio = html.indexOf('id="anuncio-destaque"');
    const posAtalhos = html.indexOf('class="atalhos"');

    strictAssert.ok(posAnuncio > posConteudo, "#anuncio-destaque deve ficar dentro de #conteudo");
    strictAssert.ok(
      posAnuncio < posAtalhos,
      `#anuncio-destaque (pos ${posAnuncio}) deve vir ANTES de .atalhos (pos ${posAtalhos}) para avisos urgentes ficarem no topo.`
    );
  });
});

describe("Melhoria 2: Confirmar presença direto no Próximo encontro da capa", () => {
  test("inicio.js usa htmlPresenca() e responderPresenca() dentro do cartão de próximo encontro", () => {
    const js = lerJs();
    strictAssert.ok(js.includes("htmlPresenca("), "inicio.js deve usar htmlPresenca() para mostrar os botões Vou/Talvez/Não vou e avatares na capa.");
    strictAssert.ok(js.includes("responderPresenca("), "inicio.js deve chamar responderPresenca() ao clicar num botão de presença na capa.");
  });
});

describe("Melhoria 3: Grade de Acesso Rápido simétrica (sem buracos) e com indicadores vivos", () => {
  test("inicio.css alinha os 9 atalhos em 3 colunas no PC e estica o último item ímpar no celular", () => {
    const css = lerCss();
    strictAssert.ok(css.includes("repeat(3, 1fr)"), "No PC, 9 atalhos devem formar uma grade 3x3 simétrica (repeat(3, 1fr)).");
    strictAssert.ok(
      css.includes(".atalho:last-child:nth-child(odd)"),
      "No celular em 2 colunas, o último atalho ímpar deve ocupar 1 / -1 para não deixar buraco vazio."
    );
  });

  test("inicio.js preenche indicadores discretos (.atalho-info) nos atalhos (ex: saldo K$ e enquetes abertas)", () => {
    const js = lerJs();
    strictAssert.ok(js.includes("atalho-info"), "inicio.js deve mostrar resumo rápido (.atalho-info) nos botões de acesso rápido.");
  });
});

describe("Melhoria 4: Seção 'Em números' com 4 cartões (grade par 4x1 no PC e 2x2 no celular)", () => {
  test("index.html tem 4 contadores (membros, visitantes, eventos, fotos) e inicio.js calcula fotos", () => {
    const html = lerHtml();
    const chaves = [...html.matchAll(/data-chave="([^"]+)"/g)].map(m => m[1]);
    strictAssert.deepEqual(chaves, ["membros", "visitantes", "eventos", "fotos"]);
    strictAssert.ok(lerJs().includes("fotos:"), "inicio.js deve preencher o contador de fotos.");
  });
});

describe("Melhoria 5: Botão '↓' da capa (.continua) com área de toque de 44x44px e acima dos temas", () => {
  test(".continua tem pelo menos 44px de largura/altura e sobe quando há tema global ativo", () => {
    const css = lerCss();
    strictAssert.ok(
      /\.continua\s*\{[^}]*width:\s*44px/s.test(css) && /\.continua\s*\{[^}]*height:\s*44px/s.test(css),
      ".continua precisa ter 44x44px para ser fácil de tocar no celular."
    );
    strictAssert.ok(
      css.includes("[data-tema-global] .continua"),
      ".continua precisa subir quando data-tema-global está ativo para não ficar enterrado nos enfeites do chão."
    );
  });
});

describe("Melhoria 6: Carregamento paralelo (Promise.all) de todas as seções da capa", () => {
  test("inicio.js busca eventos, mural, aniversários, contadores e atalhos num único Promise.all inicial", () => {
    const js = lerJs();
    const blocoParalelo = js.match(/Promise\.all\(\[\s*([\s\S]*?)\]\)/);
    strictAssert.ok(blocoParalelo, "Falta o Promise.all inicial em inicio.js");
    const corpo = blocoParalelo[1];
    strictAssert.ok(corpo.includes("buscarEventos()"), "buscarEventos() deve rodar no Promise.all inicial");
    strictAssert.ok(corpo.includes("buscarAnuncios(1)"), "buscarAnuncios(1) deve rodar no Promise.all inicial");
    strictAssert.ok(corpo.includes("buscarRecados(3)"), "buscarRecados(3) deve rodar no Promise.all inicial");
    strictAssert.ok(corpo.includes("buscarAniversarios()"), "buscarAniversarios() deve rodar no Promise.all inicial");
  });
});





