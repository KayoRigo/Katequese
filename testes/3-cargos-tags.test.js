// =====================================================================
// 3-cargos-tags.test.js — testa quem é Katequista ou Visitante e como
// a hierarquia de cargos aparece ao lado do nome.
// =====================================================================

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { carregarSite } = require("./ajuda.js");

const site = carregarSite(["dados.js", "banco.js"]);

describe("Permissão: ehKatequistaPerfil()", () => {
  test("admin é sempre Katequista, mesmo sem a tag", () => {
    assert.equal(site.ehKatequistaPerfil({ admin: true }, []), true);
  });

  test("quem tem a tag do sistema 'Katequista' é Katequista", () => {
    const tags = [{ nome: "Katequista", sistema: true }];
    assert.equal(site.ehKatequistaPerfil({ admin: false }, tags), true);
  });

  test("tag comum falsificada com nome 'Katequista' (sistema = false) NÃO dá acesso", () => {
    const tags = [{ nome: "Katequista", sistema: false }];
    assert.equal(site.ehKatequistaPerfil({ admin: false }, tags), false);
  });

  test("quem só tem 'Visitante' não é Katequista", () => {
    const tags = [{ nome: "Visitante", sistema: true }];
    assert.equal(site.ehKatequistaPerfil({ admin: false }, tags), false);
  });
});

describe("Hierarquia de cargos: cargosVisiveis() e temCargo()", () => {
  test("admin que também é Presidente mostra ['Admin', 'Presidente'] (sem Katequista)", () => {
    site.definir("cargosPorPerfil", {
      u1: [
        { nome: "Admin", cor: "#e5484d", sistema: true, ordem: -1 },
        { nome: "Presidente", cor: "#d4a72c", sistema: true, ordem: 10 },
        { nome: "Katequista", cor: "#f26b3a", sistema: true, ordem: 900 },
      ],
    });
    const visiveis = site.cargosVisiveis("u1").map(c => c.nome);
    assert.deepEqual([...visiveis], ["Admin", "Presidente"]);
    assert.equal(site.temCargo("u1", "Presidente"), true);
    assert.equal(site.temCargo("u1", "Deputado"), false);
  });

  test("admin sem cargo político mostra só ['Admin'] (esconde Katequista/Visitante)", () => {
    site.definir("cargosPorPerfil", {
      u2: [
        { nome: "Admin", cor: "#e5484d", sistema: true, ordem: -1 },
        { nome: "Katequista", cor: "#f26b3a", sistema: true, ordem: 900 },
      ],
    });
    const visiveis = site.cargosVisiveis("u2").map(c => c.nome);
    assert.deepEqual([...visiveis], ["Admin"]);
  });

  test("membro com Presidente e Deputado mostra só o mais alto ('Presidente')", () => {
    site.definir("cargosPorPerfil", {
      u3: [
        { nome: "Presidente", cor: "#d4a72c", sistema: true, ordem: 10 },
        { nome: "Deputado", cor: "#4a8fd4", sistema: true, ordem: 20 },
        { nome: "Katequista", cor: "#f26b3a", sistema: true, ordem: 900 },
      ],
    });
    const visiveis = site.cargosVisiveis("u3").map(c => c.nome);
    assert.deepEqual([...visiveis], ["Presidente"]);
  });
});
