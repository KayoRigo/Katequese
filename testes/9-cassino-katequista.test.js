// =====================================================================
// 9-cassino-katequista.test.js — testa as fórmulas e travas dos novos
// jogos do Cassino Katequista (Revoada/Aviator, Campo Minado/Bomba,
// Tigrinho 3x3 e comissão de 25% do Dono do Cassino).
// =====================================================================

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { carregarSite } = require("./ajuda.js");

const site = carregarSite(["dados.js", "banco.js", "economia.js", "cassino.js"]);

describe("Campo Minado do Churrasco (Bomba 5x5): multiplicadorBomba()", () => {
  test("começa em 1.00x com 0 acertos e sobe a cada casa segura aberta", () => {
    assert.equal(site.multiplicadorBomba(3, 0), 1);
    const m1 = site.multiplicadorBomba(3, 1);
    const m2 = site.multiplicadorBomba(3, 2);
    const m5 = site.multiplicadorBomba(3, 5);
    assert.equal(m1, 1.1); // floor(0.97 * 25/22 * 100) / 100 = 1.10
    assert.ok(m2 > m1);
    assert.ok(m5 > m2);
  });

  test("mais bombas no tabuleiro pagam um multiplicador maior para a mesma quantidade de acertos", () => {
    const com3 = site.multiplicadorBomba(3, 4);
    const com10 = site.multiplicadorBomba(10, 4);
    assert.ok(com10 > com3, `10 bombas (${com10}x) deve pagar mais que 3 bombas (${com3}x)`);
  });
});

describe("Revoada da Katequese (Aviator): multiplicadorVoo()", () => {
  test("começa em 1.00x no segundo 0 e cresce exponencialmente igual ao banco", () => {
    assert.equal(site.multiplicadorVoo(0), 1);
    assert.equal(site.multiplicadorVoo(5), 1.82);
    assert.equal(site.multiplicadorVoo(10), 3.32);
  });
});

describe("Tigrinho da Katequese (3x3): 5 linhas de pagamento", () => {
  test("LINHAS_TIGRINHO tem as 3 horizontais e as 2 diagonais da grade 3x3 (0 a 8)", () => {
    const linhas = JSON.parse(JSON.stringify(site.LINHAS_TIGRINHO));
    assert.deepEqual(linhas, [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 4, 8],
      [2, 4, 6],
    ]);
  });
});

describe("Dono do Cassino: calcularComissaoDono() (25% das perdas dos outros)", () => {
  test("paga 25% da perda líquida quando outro jogador perde no cassino", () => {
    // Apostou 1000, ganhou 0, cashback 0 -> perda 1000 -> dono recebe 250
    assert.equal(site.calcularComissaoDono("jogador1", "dono1", 1000, 0, 0), 250);
    // Apostou 1000, perdeu mas teve 100 de cashback -> perda líquida 900 -> dono recebe 225
    assert.equal(site.calcularComissaoDono("jogador1", "dono1", 1000, 0, 100), 225);
  });

  test("TRAVA ANTI-EXPLOIT: se o próprio dono jogar e perder, recebe 0 de comissão", () => {
    assert.equal(site.calcularComissaoDono("dono1", "dono1", 1000, 0, 0), 0);
  });

  test("se o jogador ganhou ou empatou (ou não há dono), a comissão é 0", () => {
    assert.equal(site.calcularComissaoDono("jogador1", "dono1", 500, 1000, 0), 0);
    assert.equal(site.calcularComissaoDono("jogador1", "dono1", 500, 500, 0), 0);
    assert.equal(site.calcularComissaoDono("jogador1", null, 500, 0, 0), 0);
  });
});
