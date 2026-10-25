// =====================================================================
// 6-armazenamento-e-sorteio.test.js — testa a limpeza de fotos antigas
// no armazenamento (quando troca ou apaga imagem) para não lotar 1 GB.
// =====================================================================

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { carregarSite } = require("./ajuda.js");

describe("Armazenamento: limparFotosAntigas()", () => {
  test("apaga apenas as fotos antigas que deixaram de ser usadas e ignora vazios/iguais", async () => {
    const site = carregarSite(["banco.js"]);

    // "semana/1.jpg" foi trocada por "semana/2.jpg"; "loja/fixa.jpg" continuou igual
    await site.limparFotosAntigas(
      ["semana/1.jpg", "loja/fixa.jpg", null, ""],
      ["semana/2.jpg", "loja/fixa.jpg"]
    );

    assert.deepEqual([...site.arquivosRemovidos], ["semana/1.jpg"]);
  });

  test("apaga a foto quando o item ou membro da semana é removido (atuais vazio)", async () => {
    const site = carregarSite(["banco.js"]);

    await site.limparFotosAntigas(["loja/antiga.jpg"], []);
    assert.deepEqual([...site.arquivosRemovidos], ["loja/antiga.jpg"]);
  });
});
