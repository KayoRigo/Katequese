// =====================================================================
// 7-guardrails-arquitetura.test.js — "Guardrails" (travas de proteção)
// para manter o projeto organizado, seguro e fácil de manter pelos 3
// desenvolvedores (Gregory, Bruno e Kayo) ao longo de +5 anos.
// =====================================================================

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");
const FRONTEND = path.join(RAIZ, "frontend");
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const existe = (rel) => fs.existsSync(path.join(RAIZ, rel));

describe("Guardrail 1: Organização de pastas (raiz 100% limpa)", () => {
  const itensRaiz = fs.readdirSync(RAIZ);

  test("nenhum arquivo de código (.html, .js, .css, .sql) fica solto na raiz", () => {
    const permitidosNaRaiz = new Set([
      ".git",
      ".github",
      ".gitignore",
      ".gitattributes",
      "README.md",
      "CLAUDE.md",
      "backend",
      "frontend",
      "docs",
      "testes",
    ]);
    const foraDoLugar = itensRaiz.filter(nome => !permitidosNaRaiz.has(nome));
    assert.deepEqual(
      foraDoLugar,
      [],
      `Arquivos fora de pasta na raiz: ${foraDoLugar.join(", ")}. Coloque em frontend/, backend/, docs/ ou testes/.`
    );
  });

  test("estrutura do backend, frontend (css, js/base, js/paginas), docs e testes existe", () => {
    assert.ok(existe("backend/sql/supabase.sql"), "Falta backend/sql/supabase.sql");
    assert.ok(existe("backend/sql/supabase-18.sql"), "Falta backend/sql/supabase-18.sql");
    assert.ok(existe("frontend/index.html"), "Falta frontend/index.html");
    assert.ok(existe("frontend/css/style.css"), "Falta frontend/css/style.css");
    assert.ok(existe("frontend/js/base/banco.js"), "Falta frontend/js/base/banco.js");
    assert.ok(existe("frontend/js/paginas/economia.js"), "Falta frontend/js/paginas/economia.js");
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

describe("Guardrail 3: Segurança e integridade de todas as páginas HTML em frontend/", () => {
  test("todos os arquivos CSS e JS chamados nas páginas HTML existem dentro de frontend/", () => {
    const htmls = fs.readdirSync(FRONTEND).filter(f => f.endsWith(".html"));
    assert.ok(htmls.length >= 12, "As páginas .html devem ficar dentro de frontend/");

    for (const pagina of htmls) {
      const conteudo = fs.readFileSync(path.join(FRONTEND, pagina), "utf8");
      const refs = [
        ...[...conteudo.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]),
        ...[...conteudo.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(m => m[1]),
      ].filter(ref => !ref.startsWith("http"));

      for (const ref of refs) {
        assert.ok(
          fs.existsSync(path.join(FRONTEND, ref)),
          `A página frontend/${pagina} aponta para "${ref}", que não existe em frontend/.`
        );
      }
    }
  });

  test("todas as páginas internas começam invisíveis (.carregando) e exigem login (iniciarPagina)", () => {
    const htmls = fs.readdirSync(FRONTEND).filter(f => f.endsWith(".html"));
    const publicasOuRedirecionamento = new Set(["login.html", "leis.html"]);
    for (const pagina of htmls) {
      if (publicasOuRedirecionamento.has(pagina)) continue;
      const conteudo = fs.readFileSync(path.join(FRONTEND, pagina), "utf8");
      assert.ok(
        conteudo.includes('class="carregando"'),
        `A página ${pagina} precisa ter class="carregando" no <html> para não piscar conteúdo sem login.`
      );
      assert.ok(
        conteudo.includes("iniciarPagina("),
        `A página ${pagina} precisa chamar await iniciarPagina() para bloquear quem não está logado.`
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
});
