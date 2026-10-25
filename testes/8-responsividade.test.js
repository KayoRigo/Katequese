// =====================================================================
// 8-responsividade.test.js — testes e guardrails de responsividade para
// garantir que todas as telas funcionem perfeitamente em celulares
// pequenos (320px), médios (375px–414px), tablets (768px) e PCs.
// =====================================================================

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");
const FRONTEND = path.join(RAIZ, "frontend");
const lerCss = () => fs.readFileSync(path.join(FRONTEND, "css", "style.css"), "utf8");
const lerTema = () => fs.readFileSync(path.join(FRONTEND, "js", "base", "tema.js"), "utf8");

describe("Responsividade 1: Meta viewport obrigatória em todas as páginas", () => {
  test("todas as páginas .html em frontend/ possuem <meta name=\"viewport\"> configurado", () => {
    const htmls = fs.readdirSync(FRONTEND).filter(f => f.endsWith(".html"));
    for (const pagina of htmls) {
      const conteudo = fs.readFileSync(path.join(FRONTEND, pagina), "utf8");
      assert.ok(
        /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1\.0"/i.test(conteudo),
        `A página ${pagina} está sem <meta name="viewport" content="width=device-width, initial-scale=1.0">.`
      );
    }
  });
});

describe("Responsividade 2: Grids intrínsecos sem estourar telas de 320px", () => {
  test("nenhum grid usa minmax(Npx, 1fr) rígido com N >= 250px sem min(Npx, 100%)", () => {
    const css = lerCss().replace(/\/\*[\s\S]*?\*\//g, "");
    // Procura minmax(280px, 1fr) ou minmax(300px, 1fr) sem min(...)
    const rigidos = [...css.matchAll(/minmax\(\s*(\d+)px\s*,/g)]
      .filter(m => Number(m[1]) >= 250)
      .map(m => m[0]);

    assert.deepEqual(
      rigidos,
      [],
      `Grids rígidos encontrados (${rigidos.join(", ")}). Use minmax(min(Npx, 100%), 1fr) para não estourar celulares de 320px.`
    );
  });

  test("nenhum elemento tem width ou min-width fixo em pixels maior que 320px", () => {
    const css = lerCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const largos = [...css.matchAll(/(?<![-\w])(?:width|min-width)\s*:\s*(\d+)px/g)]
      .filter(m => Number(m[1]) > 320)
      .map(m => m[0]);

    assert.deepEqual(
      largos,
      [],
      `Largura fixa maior que 320px encontrada (${largos.join(", ")}). Use max-width ou min(Npx, 94vw).`
    );
  });
});

describe("Responsividade 3: Proteções de tela móvel (overflow, 100dvh, iOS zoom e título)", () => {
  test("style.css usa variáveis fluidas de espaçamento (--pad-tela e --pad-caixa) e overflow-x: clip", () => {
    const css = lerCss();
    assert.ok(css.includes("--pad-tela:"), "Falta a variável fluida --pad-tela no :root.");
    assert.ok(css.includes("--pad-caixa:"), "Falta a variável fluida --pad-caixa no :root.");
    assert.ok(css.includes("overflow-x: clip"), "Falta overflow-x: clip para impedir rolagem horizontal acidental.");
  });

  test("style.css usa 100dvh nas telas de altura inteira (.capa, .tela-login, .painel-menu)", () => {
    const css = lerCss();
    assert.ok(css.includes("100dvh"), "Use 100dvh para descontar a barra de endereço do navegador no celular.");
  });

  test("nome do grupo na capa (.nome-grupo) reduz até <= 2.4rem para caber em telas de 320px sem cortar", () => {
    const css = lerCss();
    const match = css.match(/\.nome-grupo\s*\{[^}]*font-size:\s*clamp\(\s*([\d.]+)rem/);
    assert.ok(match, "Regra clamp() do .nome-grupo não encontrada.");
    assert.ok(
      Number(match[1]) <= 2.4,
      `O tamanho mínimo de .nome-grupo (${match[1]}rem) estoura telas de 320px. Use no máximo 2.4rem.`
    );
  });

  test("campos de formulário têm pelo menos 16px no celular (evita zoom automático no iPhone/iOS)", () => {
    const css = lerCss();
    assert.ok(
      /input,\s*textarea,\s*select\s*\{[^}]*font-size:\s*max\(16px/i.test(css) ||
      /@media\s*\(max-width:\s*760px\)[\s\S]*?input,\s*textarea,\s*select\s*\{\s*font-size:\s*16px/i.test(css),
      "Campos input/textarea/select precisam ter pelo menos 16px no celular para o iOS não dar zoom sozinho ao digitar."
    );
  });

  test("tema.js recalcula a largura do varal/pisca-pisca quando a tela gira ou muda de tamanho (resize)", () => {
    const tema = lerTema();
    assert.ok(
      tema.includes('"resize"') || tema.includes("'resize'"),
      "Falta ouvinte de 'resize' no tema.js para ajustar o varal/pisca-pisca ao girar o celular."
    );
  });
});
