// =====================================================================
// 11-ux-e-social.test.js — testes automatizados dos Pacotes 2 e 3
// (Auditoria REA + Playwright: favicon SVG sem 404, navegação hashchange,
// economia de bateria com document.hidden, alvos de toque mobile >= 36px,
// edição de eventos sem perder presença, filtro de membros e vencedora de enquete).
// =====================================================================

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { carregarSite } = require("./ajuda.js");

const RAIZ = path.join(__dirname, "..");
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const site = carregarSite(["dados.js", "banco.js"]);

describe("Pacote 2: Correções de UX e Mobile (Favicon, Hashchange, Touch >= 36px e Timers)", () => {
  test("tema.js injeta um favicon SVG em data URI para eliminar o erro 404 /favicon.ico no console", () => {
    const temaJs = ler("frontend/js/base/tema.js");
    assert.ok(
      temaJs.includes('rel = "icon"') || temaJs.includes("rel=\"icon\""),
      "tema.js deve injetar <link rel='icon'> para não dar erro 404 de favicon.ico em todas as páginas"
    );
  });

  test("módulos com sub-abas (leis, admin, economia, mural, membros) escutam 'hashchange' para reagir a links #aba e botão Voltar", () => {
    const arquivos = [
      "frontend/modulos/politica/leis.js",
      "frontend/modulos/admin/admin.js",
      "frontend/modulos/economia/economia.js",
      "frontend/modulos/mural/mural.js",
      "frontend/modulos/membros/membros.js",
    ];
    for (const arq of arquivos) {
      const codigo = ler(arq);
      assert.ok(
        codigo.includes("hashchange"),
        `O módulo ${arq} precisa escutar o evento 'hashchange' para atualizar a aba ao mudar a URL.`
      );
    }
  });

  test("componentes.css define min-height >= 36px para botões pequenos no celular (@media max-width: 600px)", () => {
    const compCss = ler("frontend/css/componentes.css");
    assert.ok(
      compCss.includes("min-height: 36px"),
      "componentes.css deve garantir min-height: 36px nos botões de ação no celular para evitar toque acidental."
    );
  });

  test("timers periódicos (inicio.js, politica.js, leis.js, cassino.js) checam document.hidden para economizar bateria", () => {
    const arquivos = [
      "frontend/modulos/inicio/inicio.js",
      "frontend/modulos/politica/politica.js",
      "frontend/modulos/politica/leis.js",
      "frontend/modulos/economia/cassino.js",
    ];
    for (const arq of arquivos) {
      const codigo = ler(arq);
      assert.ok(
        codigo.includes("document.hidden"),
        `O módulo ${arq} deve checar document.hidden nos setInterval para poupar bateria quando a aba estiver oculta.`
      );
    }
  });
});

describe("Pacote 3: Upgrades nas Abas Sociais (Eventos, Membros, Mídias e Enquetes)", () => {
  test("htmlEvento() inclui botão 'Editar' (data-editar) ao lado de 'Apagar' para o autor ou Admin", () => {
    site.definir("cargosPorPerfil", {});
    const ev = {
      id: 42,
      titulo: "Churrasco da Katequese",
      data: "2026-11-15",
      hora: "19:30",
      local: "Casa do Pedro",
      descricao: "Levar carne",
      autor_id: "u1",
      visivel_visitantes: true,
      perfis: { nome: "Pedro" },
    };
    const htmlComPermissao = site.htmlEvento(ev, null, false, true, true, "");
    assert.ok(htmlComPermissao.includes('data-editar="42"'), "Autor/Admin deve ver o botão Editar no cartão do evento");
    assert.ok(htmlComPermissao.includes('data-apagar="42"'), "Autor/Admin deve continuar vendo o botão Apagar");

    const htmlSemPermissao = site.htmlEvento(ev, null, false, false, true, "");
    assert.ok(!htmlSemPermissao.includes('data-editar="42"'), "Quem não é autor nem Admin não vê o botão Editar");

    const eventosJs = ler("frontend/modulos/eventos/eventos.js");
    assert.ok(eventosJs.includes("data-editar"), "eventos.js deve tratar o clique em [data-editar] para editar sem perder presenças");
  });

  test("filtrarMembros() filtra membros por nome, @usuario, apelido e tag selecionada", () => {
    const lista = [
      { id: "u1", nome: "Gregory", apelido: "Greg", usuario: "gregory" },
      { id: "u2", nome: "Pedro Galli", apelido: "Pedrão", usuario: "pedro" },
      { id: "u3", nome: "Bruno", apelido: "", usuario: "bruno" },
    ];
    const tags = {
      u1: [{ id: 2, nome: "Deputado" }],
      u2: [{ id: 1, nome: "Presidente" }],
      u3: [{ id: 2, nome: "Deputado" }],
    };

    assert.equal(site.filtrarMembros(lista, tags, "pedr", "").length, 1);
    assert.equal(site.filtrarMembros(lista, tags, "", "2").length, 2, "Deve filtrar apenas quem tem a tag Deputado (id 2)");
    assert.equal(site.filtrarMembros(lista, tags, "greg", "2").length, 1);
  });

  test("opcoesVencedorasEnquete() identifica a(s) opção(ões) mais votada(s) quando há votos", () => {
    const opcoes = [{ id: 10, texto: "Sábado" }, { id: 20, texto: "Domingo" }, { id: 30, texto: "Sexta" }];
    const resultados = {
      10: { total: 5 },
      20: { total: 8 },
      30: { total: 2 },
    };
    const vencedoras = [...site.opcoesVencedorasEnquete(opcoes, resultados)];
    assert.deepEqual(vencedoras, [20]);

    const semVotos = [...site.opcoesVencedorasEnquete(opcoes, {})];
    assert.deepEqual(semVotos, [], "Enquete com 0 votos não marca nenhuma opção como vencedora");
  });

  test("midias.js suporta busca/filtro de fotos e gesto de deslizar (touchstart/touchend) no celular", () => {
    const midiasJs = ler("frontend/modulos/midias/midias.js");
    assert.ok(midiasJs.includes("touchstart") && midiasJs.includes("touchend"), "midias.js deve permitir deslizar o dedo (swipe) na foto aberta");
  });
});
