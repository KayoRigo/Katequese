// =====================================================================
// guardrails/1-arquitetura-e-pastas.test.js — "Guardrails" (travas de
// proteção) para manter o projeto organizado, modularizado e seguro
// para os 3 desenvolvedores (Gregory, Bruno e Kayo) ao longo de +5 anos.
// =====================================================================

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");
const FRONTEND = path.join(RAIZ, "frontend");
const PAGINAS = path.join(FRONTEND, "paginas");
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const existe = (rel) => fs.existsSync(path.join(RAIZ, rel));

const LISTA_MODULOS = [
  "admin",
  "atualizacoes",
  "economia",
  "enquetes",
  "eventos",
  "inicio",
  "login",
  "membros",
  "midias",
  "mural",
  "perfil",
  "politica",
  "sorteios",
];

describe("Guardrail 1: Organização de pastas (raiz e frontend sem arquivos soltos)", () => {
  test("nenhum arquivo de código (.html, .js, .css, .sql) fica solto na raiz", () => {
    const itensRaiz = fs.readdirSync(RAIZ);
    const permitidosNaRaiz = new Set([
      ".git",
      ".github",
      ".gitignore",
      ".gitattributes",
      "netlify.toml",
      "README.md",
      "CLAUDE.md",
      "backend",
      "frontend",
      "docs",
      "testes",
      "guardrails",
    ]);
    const foraDoLugar = itensRaiz.filter(nome => !permitidosNaRaiz.has(nome));
    assert.deepEqual(
      foraDoLugar,
      [],
      `Arquivos fora de pasta na raiz: ${foraDoLugar.join(", ")}.`
    );
  });

  test("nenhum arquivo .html, .js ou .css fica solto dentro de frontend/ (tudo fica em paginas/, modulos/, js/ ou css/)", () => {
    const itensFrontend = fs.readdirSync(FRONTEND);
    const pastasPermitidas = new Set(["css", "js", "modulos", "paginas"]);
    const soltosEmFrontend = itensFrontend.filter(nome => !pastasPermitidas.has(nome));
    assert.deepEqual(
      soltosEmFrontend,
      [],
      `Arquivos soltos em frontend/: ${soltosEmFrontend.join(", ")}. Páginas .html devem ficar em frontend/paginas/.`
    );
  });

  test("cada seção do site é um módulo próprio dentro de frontend/modulos/<secao>/ (.js e .css)", () => {
    for (const mod of LISTA_MODULOS) {
      assert.ok(
        existe(`frontend/modulos/${mod}/${mod}.js`),
        `Falta o script do módulo: frontend/modulos/${mod}/${mod}.js`
      );
      assert.ok(
        existe(`frontend/modulos/${mod}/${mod}.css`),
        `Falta o estilo do módulo: frontend/modulos/${mod}/${mod}.css`
      );
    }
  });
});

describe("Guardrail 2: Documentação dividida (sem acumular num arquivo gigante)", () => {
  test("CLAUDE.md na raiz funciona como índice curto (máximo de 120 linhas)", () => {
    const linhas = ler("CLAUDE.md").split(/\r?\n/).length;
    assert.ok(
      linhas <= 120,
      `CLAUDE.md está com ${linhas} linhas (máximo 120). Coloque os detalhes nos arquivos da pasta docs/.`
    );
  });

  test("documentação detalhada existe separada por assunto na pasta docs/", () => {
    const obrigatorios = [
      "docs/arquitetura.md",
      "docs/backend-banco.md",
      "docs/funcionalidades.md",
      "docs/economia.md",
      "docs/seguranca-e-guardrails.md",
    ];
    for (const doc of obrigatorios) {
      assert.ok(existe(doc), `Falta o documento obrigatório: ${doc}`);
    }
  });
});

describe("Guardrail 3: Páginas HTML em frontend/paginas/ limpas e com links válidos", () => {
  test("todas as páginas .html ficam em frontend/paginas/ e não têm código JavaScript inline", () => {
    const htmls = fs.existsSync(PAGINAS) ? fs.readdirSync(PAGINAS).filter(f => f.endsWith(".html")) : [];
    assert.ok(htmls.length >= 14, "Todas as 14 páginas .html devem ficar em frontend/paginas/.");

    for (const pagina of htmls) {
      const conteudo = fs.readFileSync(path.join(PAGINAS, pagina), "utf8");
      const scriptsInline = [...conteudo.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
        .filter(m => m[1].trim().length > 0);
      assert.equal(
        scriptsInline.length,
        0,
        `A página frontend/paginas/${pagina} ainda tem <script> inline. Mova o código para frontend/modulos/.`
      );
    }
  });

  test("todos os arquivos CSS e JS chamados nas páginas HTML existem no disco", () => {
    const htmls = fs.existsSync(PAGINAS) ? fs.readdirSync(PAGINAS).filter(f => f.endsWith(".html")) : [];
    assert.ok(htmls.length > 0, "Nenhuma página .html encontrada em frontend/paginas/.");

    for (const pagina of htmls) {
      const conteudo = fs.readFileSync(path.join(PAGINAS, pagina), "utf8");
      const refs = [
        ...[...conteudo.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]),
        ...[...conteudo.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]),
      ].filter(ref => !ref.startsWith("http"));

      for (const ref of refs) {
        const destino = path.resolve(PAGINAS, ref);
        assert.ok(
          fs.existsSync(destino),
          `A página frontend/paginas/${pagina} aponta para "${ref}", que não existe.`
        );
      }
    }
  });

  test("todas as páginas internas começam invisíveis (.carregando) e seu módulo chama iniciarPagina()", () => {
    const htmls = fs.existsSync(PAGINAS) ? fs.readdirSync(PAGINAS).filter(f => f.endsWith(".html")) : [];
    assert.ok(htmls.length > 0, "Nenhuma página .html encontrada em frontend/paginas/.");
    const publicasOuRedirecionamento = new Set(["login.html", "leis.html"]);

    for (const pagina of htmls) {
      if (publicasOuRedirecionamento.has(pagina)) continue;
      const conteudo = fs.readFileSync(path.join(PAGINAS, pagina), "utf8");
      assert.ok(
        conteudo.includes('class="carregando"'),
        `A página ${pagina} precisa ter class="carregando" no <html> para não piscar conteúdo sem login.`
      );
      const scripts = [...conteudo.matchAll(/<script[^>]+src="([^"]*modulos\/[^"]+)"/g)].map(m => m[1]);
      assert.ok(scripts.length > 0, `A página ${pagina} precisa carregar seu módulo em ../modulos/...`);
      const codigoModulo = scripts.map(s => fs.readFileSync(path.resolve(PAGINAS, s), "utf8")).join("\n");
      assert.ok(
        codigoModulo.includes("iniciarPagina("),
        `O módulo da página ${pagina} (${scripts.join(", ")}) precisa chamar await iniciarPagina().`
      );
    }
  });
});

describe("Guardrail 4: Regras críticas de segurança no JS e no SQL", () => {
  test("config.js nunca contém chave secreta service_role", () => {
    const cfgSemComentarios = ler("frontend/js/base/config.js").replace(/\/\/.*$/gm, "");
    assert.ok(!/service_role|sb_secret_/i.test(cfgSemComentarios), "PERIGO: chave secreta encontrada em config.js!");
  });

  test("todos os arquivos SQL em backend/sql/ podem rodar mais de uma vez (idempotentes)", () => {
    const pastaSql = path.join(RAIZ, "backend", "sql");
    assert.ok(fs.existsSync(pastaSql), "Pasta backend/sql/ não existe");
    const sqls = fs.readdirSync(pastaSql).filter(f => f.endsWith(".sql"));

    for (const arq of sqls) {
      const codigo = fs.readFileSync(path.join(pastaSql, arq), "utf8");
      const limpo = codigo.replace(/--.*$/gm, "");
      const tabelasSemIfNotExists = limpo.match(/create\s+table\s+(?!if\s+not\s+exists)/gi);
      assert.equal(
        tabelasSemIfNotExists,
        null,
        `O arquivo ${arq} tem "create table" sem "if not exists".`
      );
    }
  });

  test("listas que crescem com o tempo (midias, mural, atualizacoes, economia, eventos, enquetes) usam htmlPaginacao", () => {
    const comPaginacao = ["midias", "mural", "atualizacoes", "economia", "eventos", "enquetes"];
    for (const mod of comPaginacao) {
      const codigo = ler(`frontend/modulos/${mod}/${mod}.js`);
      assert.ok(
        codigo.includes("htmlPaginacao("),
        `O módulo ${mod}.js precisa usar htmlPaginacao() para não travar quando a lista crescer.`
      );
    }
  });
});
