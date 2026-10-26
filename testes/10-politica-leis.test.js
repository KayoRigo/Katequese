// =====================================================================
// 10-politica-leis.test.js — testes automatizados do sistema de Política,
// Ideias de Leis dos Deputados, Aval do Presidente, Câmara, Voto Popular,
// transparência pós-votação, leis revogadas e sincronização de cargos.
// =====================================================================

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { carregarSite } = require("./ajuda.js");

const RAIZ = path.join(__dirname, "..");
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const site = carregarSite(["dados.js", "banco.js", "leis.js"]);

describe("Política 1: Permissões de Presidente, Deputados e Katequistas (permissoesPolitica)", () => {
  test("Deputado pode acessar a aba Gestão para sugerir leis, mas NÃO pode aprovar sugestão nem desempatar", () => {
    site.definir("cargosPorPerfil", {
      dep1: [
        { nome: "Deputado", cor: "#4a8fd4", sistema: true, ordem: 20 },
        { nome: "Katequista", cor: "#f26b3a", sistema: true, ordem: 900 },
      ],
    });
    const perm = site.permissoesPolitica({ id: "dep1", katequista: true, admin: false });
    assert.equal(perm.souDeputado, true);
    assert.equal(perm.souPresidente, false);
    assert.equal(perm.podeGerir, true, "Deputado deve ver a aba Gestão para enviar ideias ao Presidente");
    assert.equal(perm.podeAprovarSugestao, false, "Deputado não pode aprovar a própria ideia para a Câmara");
  });

  test("Presidente pode acessar Gestão, propor direto e aprovar ideias de Deputados para a Câmara", () => {
    site.definir("cargosPorPerfil", {
      pres1: [
        { nome: "Presidente", cor: "#d4a72c", sistema: true, ordem: 10 },
        { nome: "Katequista", cor: "#f26b3a", sistema: true, ordem: 900 },
      ],
    });
    const perm = site.permissoesPolitica({ id: "pres1", katequista: true, admin: false });
    assert.equal(perm.souPresidente, true);
    assert.equal(perm.podeGerir, true);
    assert.equal(perm.podeAprovarSugestao, true);
  });

  test("Katequista sem cargo político não acessa Gestão nem aprova sugestões", () => {
    site.definir("cargosPorPerfil", {
      kat1: [{ nome: "Katequista", cor: "#f26b3a", sistema: true, ordem: 900 }],
    });
    const perm = site.permissoesPolitica({ id: "kat1", katequista: true, admin: false });
    assert.equal(perm.souPresidente, false);
    assert.equal(perm.souDeputado, false);
    assert.equal(perm.podeGerir, false);
    assert.equal(perm.podeAprovarSugestao, false);
  });

  test("Admin que também é Deputado atua APENAS como Deputado nas abas políticas (poderes de Admin ficam separados na aba Admin)", () => {
    site.definir("cargosPorPerfil", {
      greg1: [
        { nome: "Admin", cor: "#e5484d", sistema: true, ordem: -1 },
        { nome: "Deputado", cor: "#4a8fd4", sistema: true, ordem: 20 },
        { nome: "Katequista", cor: "#f26b3a", sistema: true, ordem: 900 },
      ],
    });
    const perm = site.permissoesPolitica({ id: "greg1", katequista: true, admin: true });
    assert.equal(perm.souDeputado, true, "Deve reconhecer que o cargo político é Deputado");
    assert.equal(perm.souPresidente, false, "Admin+Deputado NÃO deve virar Presidente nas abas normais");
    assert.equal(perm.podeGerir, true, "Deve acessar a aba do Deputado para enviar ideias ao Presidente");
    assert.equal(perm.podeAprovarSugestao, false, "Na aba normal, Deputado (mesmo Admin) não aprova ideias como Presidente");
    assert.equal(perm.souAdmin, true, "Deve habilitar a aba separada 'Admin' para funções administrativas");

    const htmlPol = ler("frontend/paginas/politica.html");
    assert.ok(htmlPol.includes('data-aba="admin"'), "politica.html deve ter uma sub-aba 'Admin' separada");
  });
});

describe("Política 2: Proteção contra arquivamento indevido (podeArquivarProposta)", () => {
  test("Presidente NÃO pode arquivar ideia de Deputado enquanto a Câmara está votando, mas pode no empate ou na sugestão", () => {
    site.definir("cargosPorPerfil", {
      pres1: [{ nome: "Presidente", cor: "#d4a72c", sistema: true, ordem: 10 }],
      dep1: [{ nome: "Deputado", cor: "#4a8fd4", sistema: true, ordem: 20 }],
    });
    const euPres = { id: "pres1", katequista: true, admin: false };
    const euDep = { id: "dep1", katequista: true, admin: false };

    const emSugestao = { aberta: true, status: "sugestao", autor_id: "dep1" };
    const emCamaraDeDeputado = { aberta: true, status: "camara", autor_id: "dep1" };
    const emCamaraDoPresidente = { aberta: true, status: "camara", autor_id: "pres1" };
    const emEmpate = { aberta: true, status: "empate", autor_id: "dep1" };

    assert.equal(site.podeArquivarProposta(emSugestao, euPres), true, "Presidente pode recusar sugestão na mesa");
    assert.equal(site.podeArquivarProposta(emSugestao, euDep), true, "Deputado autor pode retirar sua sugestão antes de ir à Câmara");
    assert.equal(site.podeArquivarProposta(emCamaraDeDeputado, euPres), false, "Presidente não pode cancelar votação em andamento de projeto de Deputado");
    assert.equal(site.podeArquivarProposta(emCamaraDoPresidente, euPres), true, "Presidente pode cancelar proposta que ele mesmo criou");
    assert.equal(site.podeArquivarProposta(emEmpate, euPres), true, "No empate 2x2, Presidente decide entre arquivar ou levar ao voto popular");
  });
});

describe("Política 3: Créditos de autoria, transparência pós-votação e Leis Revogadas", () => {
  test("creditosProposta() destaca tanto o Deputado que criou a ideia quanto o Presidente que enviou à Câmara", () => {
    const pDeputado = { status: "camara", autor: "Bruno", aprovado_por: "Pedro" };
    const texto = site.creditosProposta(pDeputado);
    assert.ok(texto.includes("Ideia de Bruno"), "Deve mostrar quem teve a ideia");
    assert.ok(texto.includes("Enviada à Câmara por Pedro"), "Deve mostrar qual Presidente aprovou a ida à Câmara");

    const pSugestao = { status: "sugestao", autor: "Gregory", aprovado_por: null };
    assert.equal(site.creditosProposta(pSugestao), "Ideia de Gregory");
  });

  test("htmlVotosNominais() mantém voto secreto durante a votação na Câmara e revela os votos após encerrar", () => {
    const votos = [
      { nome: "Bruno", voto: true },
      { nome: "Gregory", voto: false },
    ];
    assert.equal(
      site.htmlVotosNominais({ status: "camara", votos_nominais: votos }),
      "",
      "Enquanto está em votação na Câmara, ninguém pode ver quem votou em quê"
    );

    const htmlEncerrada = site.htmlVotosNominais({ status: "aprovada", votos_nominais: votos });
    assert.ok(htmlEncerrada.includes("Bruno"), "Após encerrar, deve mostrar o nome do deputado");
    assert.ok(htmlEncerrada.includes("Sim") && htmlEncerrada.includes("Não"), "Após encerrar, deve mostrar Sim/Não de cada deputado");
  });

  test("htmlLeiRevogada() exibe o texto completo da lei revogada (e não apenas o título)", () => {
    const html = site.htmlLeiRevogada(
      { numero: 4, titulo: "Lei do Churrasco", texto: "Todo sábado tem carne.", revogada_em: "2026-10-25T15:00:00Z" },
      () => "25/10/2026"
    );
    assert.ok(html.includes("Lei nº 4"), "Deve mostrar o número da lei");
    assert.ok(html.includes("Lei do Churrasco"), "Deve mostrar o título da lei");
    assert.ok(html.includes("Todo sábado tem carne."), "Deve mostrar o texto completo da lei revogada");
  });
});

describe("Política 4: Paginação na Câmara, Indicador na Capa, Sincronização no Admin e SQL 20", () => {
  test("leis.js usa htmlPaginacao() no histórico da Câmara e inicio.js mostra aviso no atalho de Política", () => {
    const leisJs = ler("frontend/modulos/politica/leis.js");
    assert.ok(leisJs.includes("htmlPaginacao("), "O histórico da Câmara em leis.js deve usar htmlPaginacao()");

    const inicioJs = ler("frontend/modulos/inicio/inicio.js");
    assert.ok(
      inicioJs.includes('infoAtalho("politica.html"'),
      "inicio.js deve mostrar indicador de votações abertas no atalho de Política"
    );
  });

  test("admin.js vincula Presidente e Deputados aos perfis aprovados e chama sincronizar_cargos_politica", () => {
    const adminJs = ler("frontend/modulos/admin/admin.js");
    assert.ok(
      adminJs.includes("sincronizar_cargos_politica"),
      "admin.js deve sincronizar automaticamente as tags Presidente e Deputado ao salvar Política"
    );
  });

  test("backend/sql/supabase-20.sql existe, é idempotente e define avaliar_sugestao e sincronizar_cargos_politica", () => {
    const caminhoSql = path.join(RAIZ, "backend", "sql", "supabase-20.sql");
    assert.ok(fs.existsSync(caminhoSql), "Falta criar o arquivo backend/sql/supabase-20.sql");
    const sql = fs.readFileSync(caminhoSql, "utf8");
    assert.ok(sql.includes("avaliar_sugestao"), "supabase-20.sql deve criar a função avaliar_sugestao");
    assert.ok(sql.includes("sincronizar_cargos_politica"), "supabase-20.sql deve criar a função sincronizar_cargos_politica");
    assert.ok(sql.includes("'sugestao'"), "supabase-20.sql deve incluir o status 'sugestao' em propostas_lei");
  });
});

describe("Política 5: Hierarquia de Leis (Constituição, STK, Leis Gerais e Decretos)", () => {
  test("infoCategoriaLei() retorna os 4 escalões (constitucional, stk, geral, decreto) na ordem certa e usa 'geral' como padrão", () => {
    const c1 = site.infoCategoriaLei("constitucional");
    const c2 = site.infoCategoriaLei("stk");
    const c3 = site.infoCategoriaLei("geral");
    const c4 = site.infoCategoriaLei("decreto");
    const padrao = site.infoCategoriaLei("qualquer_coisa");

    assert.equal(c1.ordem, 1);
    assert.equal(c2.ordem, 2);
    assert.ok(c2.nome.includes("Superior Tribunal Katequista"), "Escalão 2 deve ser do Superior Tribunal Katequista (STK)");
    assert.equal(c3.ordem, 3);
    assert.equal(c4.ordem, 4);
    assert.equal(padrao.id, "geral", "Categoria desconhecida ou nula deve cair em 'geral'");
  });

  test("ordenarLeisPorHierarquia() agrupa primeiro por escalão (Constitucional → STK → Geral → Decreto) e depois por número", () => {
    const baguncadas = [
      { id: 1, numero: 1, categoria: "geral", titulo: "Lei Geral 1" },
      { id: 2, numero: 2, categoria: "decreto", titulo: "Decreto 2" },
      { id: 3, numero: 3, categoria: "stk", titulo: "Lei do STK 3" },
      { id: 4, numero: 4, categoria: "constitucional", titulo: "Carta Magna 4" },
      { id: 5, numero: 5, categoria: "stk", titulo: "Lei do STK 5" },
    ];
    const ordenadas = site.ordenarLeisPorHierarquia(baguncadas).map(l => l.numero);
    assert.deepEqual([...ordenadas], [4, 3, 5, 1, 2]);
  });

  test("htmlCartaoLei() exibe o selo do escalão (ex: STK), a classe de cor da categoria e a assinatura de quem criou/aprovou", () => {
    const html = site.htmlCartaoLei(
      {
        numero: 7,
        categoria: "stk",
        titulo: "Código Penal do Churrasco",
        texto: "Quem furar o churrasco paga multa.",
        criada_em: "2026-10-26T12:00:00Z",
        autor_nome: "Gregory",
        aprovado_por_nome: "Pedro",
      },
      () => "26/10/2026"
    );
    assert.ok(html.includes("cat-stk"), "Cartão deve ter a classe visual cat-stk");
    assert.ok(html.includes("STK") && html.includes("Superior Tribunal Katequista"), "Deve exibir o selo do STK");
    assert.ok(html.includes("Ideia de Gregory · Sancionada por Pedro"), "Deve exibir a assinatura política da lei");
  });

  test("htmlTrilhaProposta() e htmlPlacarProposta() renderizam a trilha de etapas legislativas e barra de quórum/placar", () => {
    const trilhaSug = site.htmlTrilhaProposta({ status: "sugestao" });
    assert.ok(trilhaSug.includes("trilha-etapas"), "Deve renderizar a trilha visual de etapas");
    assert.ok(trilhaSug.includes("atual"), "Deve destacar a etapa atual da proposta");

    const placarCamara = site.htmlPlacarProposta({ status: "camara", votaram_camara: 2, total_deputados: 4 });
    assert.ok(placarCamara.includes("quorum-barra"), "Durante a votação na Câmara, deve mostrar barra de quórum");

    const placarFinal = site.htmlPlacarProposta({ status: "aprovada", camara_sim: 3, camara_nao: 1 });
    assert.ok(placarFinal.includes("placar-barra"), "Após encerrar, deve mostrar barra visual de placar Sim vs Não");
  });
});
