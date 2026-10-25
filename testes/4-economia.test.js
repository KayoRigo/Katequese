// =====================================================================
// 4-economia.test.js — testa as fórmulas de nível/XP, soma de equipamentos
// por linha, descontos na loja e a trava contra dinheiro infinito na revenda.
// =====================================================================

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { carregarSite } = require("./ajuda.js");

const site = carregarSite(["dados.js", "banco.js", "economia.js"]);

describe("Fórmulas de Nível e XP (iguais às do banco)", () => {
  test("nível geral: começa no 1, sobe no 50 XP (nível 2) e 200 XP (nível 3)", () => {
    assert.equal(site.nivelGeral(0).nivel, 1);
    assert.equal(site.nivelGeral(49).nivel, 1);
    assert.equal(site.nivelGeral(50).nivel, 2);
    assert.equal(site.nivelGeral(199).nivel, 2);
    assert.equal(site.nivelGeral(200).nivel, 3);
  });

  test("nível na profissão: sobe no 3 XP (nível 2) e 12 XP (nível 3)", () => {
    assert.equal(site.nivelNoTrabalho(0).nivel, 1);
    assert.equal(site.nivelNoTrabalho(2).nivel, 1);
    assert.equal(site.nivelNoTrabalho(3).nivel, 2);
    assert.equal(site.nivelNoTrabalho(12).nivel, 3);
  });

  test("XP negativo nunca quebra a fórmula (fica no nível 1)", () => {
    assert.equal(site.nivelGeral(-50).nivel, 1);
  });
});

describe("Equipamentos de trabalho: efeitosDe()", () => {
  const listaEquips = [
    // Mesma linha ("veiculo"): só deve valer o de maior ordem que a pessoa tem
    { id: "bicicleta", trabalho_id: "entregador", linha: "veiculo", ordem: 1, pagamento: 0, espera: 0.15, extra: 0, ajuda: 1 },
    { id: "moto",      trabalho_id: "entregador", linha: "veiculo", ordem: 2, pagamento: 0.15, espera: 0.30, extra: 0, ajuda: 2 },
    { id: "carro",     trabalho_id: "entregador", linha: "veiculo", ordem: 3, pagamento: 0.35, espera: 0.40, extra: 0, ajuda: 3 },
    // Outra linha ("bag"): soma com a linha "veiculo"
    { id: "bag",       trabalho_id: "entregador", linha: "bag",     ordem: 1, pagamento: 0, espera: 0.35, extra: 0.15, ajuda: 0 },
  ];

  test("na mesma linha vale só o melhor equipamento (moto substitui bicicleta)", () => {
    const eq = { equips: listaEquips, meus: new Set(["bicicleta", "moto"]) };
    const ef = site.efeitosDe("entregador", eq);
    assert.equal(ef.itens.length, 1);
    assert.equal(ef.itens[0].id, "moto");
    assert.equal(ef.pagamento, 0.15);
    assert.equal(ef.espera, 0.30);
    assert.equal(ef.ajuda, 2);
  });

  test("soma linhas diferentes, mas trava a redução de espera em no máximo 60% (0.6)", () => {
    // carro (40% espera) + bag (35% espera) = 75% → deve travar em 60% (0.6)
    const eq = { equips: listaEquips, meus: new Set(["bicicleta", "moto", "carro", "bag"]) };
    const ef = site.efeitosDe("entregador", eq);
    assert.equal(ef.itens.length, 2);
    assert.equal(ef.espera, 0.6);
    assert.equal(ef.extra, 0.15);
  });
});

describe("Loja: descontos e trava anti-exploit na revenda", () => {
  test("comDesconto reduz o preço arredondando para cima (igual ao ceil do banco)", () => {
    site.definir("bonusItens", { desconto: 0.25 });
    assert.equal(site.comDesconto(1000), 750);
    assert.equal(site.comDesconto(150), 113); // 150 * 0.75 = 112.5 → 113
  });

  test("valor de revenda NUNCA passa do valor pago com desconto (impede dinheiro infinito)", () => {
    // Mesmo com desconto máximo (50%) e revenda alta (80%, ex: Mascote de K$ 800)
    site.definir("bonusItens", { desconto: 0.5 });
    const item = { preco: 800, revenda: 0.8 };
    const pagoNaCompra = site.comDesconto(item.preco); // K$ 400
    const recebidoNaVenda = site.valorRevenda(item);   // K$ 320
    assert.ok(recebidoNaVenda <= pagoNaCompra, "Revenda não pode pagar mais do que custou para comprar");
    assert.equal(pagoNaCompra, 400);
    assert.equal(recebidoNaVenda, 320);
  });
});
