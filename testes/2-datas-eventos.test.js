// =====================================================================
// 2-datas-eventos.test.js — testa cálculos de datas, início de eventos,
// contagem de dias até aniversários (incluindo ano bissexto) e tempo atrás.
// =====================================================================

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { carregarSite } = require("./ajuda.js");

const site = carregarSite(["dados.js"]);

describe("Datas de eventos", () => {
  test("lerData cria a data à meia-noite no horário local (sem voltar 1 dia por fuso)", () => {
    const d = site.lerData("2026-10-24");
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 9); // outubro = 9 (começa no 0)
    assert.equal(d.getDate(), 24);
    assert.equal(d.getHours(), 0);
  });

  test("inicioEvento junta a data e os 5 primeiros caracteres da hora", () => {
    const d = site.inicioEvento({ data: "2026-11-15", hora: "20:30:00" });
    assert.equal(d.getDate(), 15);
    assert.equal(d.getHours(), 20);
    assert.equal(d.getMinutes(), 30);
  });

  test("inicioEvento funciona quando o evento não tem hora definida", () => {
    const d = site.inicioEvento({ data: "2026-11-15", hora: null });
    assert.equal(d.getDate(), 15);
    assert.equal(d.getHours(), 0);
  });
});

describe("Aniversários", () => {
  test("aniversário hoje dá 0 dias (" + "hoje" + ")", () => {
    const hoje = new Date();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");
    const faltam = site.diasAteAniversario(`2000-${mes}-${dia}`);
    assert.equal(faltam, 0);
    assert.equal(site.quandoAniversario(faltam), "hoje");
  });

  test("aniversário amanhã dá 1 dia (" + "amanhã" + ")", () => {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const mes = String(amanha.getMonth() + 1).padStart(2, "0");
    const dia = String(amanha.getDate()).padStart(2, "0");
    const faltam = site.diasAteAniversario(`1999-${mes}-${dia}`);
    assert.equal(faltam, 1);
    assert.equal(site.quandoAniversario(faltam), "amanhã");
  });

  test("aniversário que já passou ontem fica para o ano que vem (~364/365 dias)", () => {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const mes = String(ontem.getMonth() + 1).padStart(2, "0");
    const dia = String(ontem.getDate()).padStart(2, "0");
    const faltam = site.diasAteAniversario(`2002-${mes}-${dia}`);
    assert.ok(faltam >= 364 && faltam <= 365);
  });

  test("quem nasceu em 29/02 não quebra em anos não bissextos", () => {
    const faltam = site.diasAteAniversario("2004-02-29");
    assert.ok(Number.isInteger(faltam));
    assert.ok(faltam >= 0 && faltam <= 366);
  });
});

describe("Mural: tempoAtras()", () => {
  test("mostra 'agora', 'há X min', 'há X h' e 'ontem'", () => {
    const agora = Date.now();
    assert.equal(site.tempoAtras(new Date(agora - 15 * 1000).toISOString()), "agora");
    assert.equal(site.tempoAtras(new Date(agora - 10 * 60 * 1000).toISOString()), "há 10 min");
    assert.equal(site.tempoAtras(new Date(agora - 3 * 3600 * 1000).toISOString()), "há 3 h");
    assert.equal(site.tempoAtras(new Date(agora - 30 * 3600 * 1000).toISOString()), "ontem");
  });
});
