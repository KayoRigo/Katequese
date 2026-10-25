// =====================================================================
// 7-paginacao.test.js — testa os cálculos de intervalo (inicio/fim para
// o .range do Supabase) e a barra de paginação (htmlPaginacao).
// =====================================================================

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { carregarSite } = require("./ajuda.js");

const site = carregarSite(["dados.js"]);

describe("Paginação: calcularPaginacao()", () => {
  test("calcula inicio, fim e totalPaginas certinho para cada página (ex: 30 itens, 12 por página)", () => {
    const p1 = site.calcularPaginacao(1, 30, 12);
    assert.equal(p1.pagina, 1);
    assert.equal(p1.totalPaginas, 3);
    assert.equal(p1.inicio, 0);
    assert.equal(p1.fim, 11);
    assert.equal(p1.temAnterior, false);
    assert.equal(p1.temProxima, true);

    const p2 = site.calcularPaginacao(2, 30, 12);
    assert.equal(p2.pagina, 2);
    assert.equal(p2.inicio, 12);
    assert.equal(p2.fim, 23);
    assert.equal(p2.temAnterior, true);
    assert.equal(p2.temProxima, true);

    const p3 = site.calcularPaginacao(3, 30, 12);
    assert.equal(p3.pagina, 3);
    assert.equal(p3.inicio, 24);
    assert.equal(p3.fim, 35);
    assert.equal(p3.temAnterior, true);
    assert.equal(p3.temProxima, false);
  });

  test("trava páginas fora do limite (menor que 1 ou maior que o total de páginas) e aceita lista vazia", () => {
    assert.equal(site.calcularPaginacao(-3, 25, 10).pagina, 1);
    assert.equal(site.calcularPaginacao(99, 25, 10).pagina, 3);
    const vazio = site.calcularPaginacao(1, 0, 10);
    assert.equal(vazio.pagina, 1);
    assert.equal(vazio.totalPaginas, 1);
    assert.equal(vazio.temAnterior, false);
    assert.equal(vazio.temProxima, false);
  });
});

describe("Paginação: htmlPaginacao()", () => {
  test("devolve vazio quando tudo cabe numa página só (não polui a tela)", () => {
    assert.equal(site.htmlPaginacao({ pagina: 1, total: 0, porPagina: 12 }), "");
    assert.equal(site.htmlPaginacao({ pagina: 1, total: 12, porPagina: 12 }), "");
  });

  test("desabilita 'Anterior' na página 1 e 'Próxima' na última página", () => {
    const html1 = site.htmlPaginacao({ pagina: 1, total: 25, porPagina: 10 });
    assert.ok(html1.includes("Página <b>1</b> de <b>3</b>"));
    assert.ok(/data-pagina="0"[^>]*disabled/.test(html1), "Botão Anterior deve estar disabled na página 1");
    assert.ok(!/data-pagina="2"[^>]*disabled/.test(html1), "Botão Próxima deve estar liberado na página 1");

    const html3 = site.htmlPaginacao({ pagina: 3, total: 25, porPagina: 10 });
    assert.ok(html3.includes("Página <b>3</b> de <b>3</b>"));
    assert.ok(!/data-pagina="2"[^>]*disabled/.test(html3), "Botão Anterior deve estar liberado na página 3");
    assert.ok(/data-pagina="4"[^>]*disabled/.test(html3), "Botão Próxima deve estar disabled na última página");
  });
});
