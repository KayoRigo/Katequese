// =====================================================================
// guardrails/3-qualidade-css.test.js — trava automática de qualidade,
// modularização, tokens, animações e isolamento de temas do CSS para
// manter o padrão de excelência por +5 anos.
// =====================================================================

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");
const PASTA_CSS = path.join(RAIZ, "frontend", "css");
const PASTA_TEMAS = path.join(PASTA_CSS, "temas");
const PASTA_MODULOS = path.join(RAIZ, "frontend", "modulos");

// Lista todos os arquivos .css do projeto
function listarTodosCss() {
  const lista = [];
  function varrer(dir) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      const completo = path.join(dir, item);
      if (fs.statSync(completo).isDirectory()) varrer(completo);
      else if (item.endsWith(".css")) lista.push(completo);
    }
  }
  varrer(PASTA_CSS);
  varrer(PASTA_MODULOS);
  return lista;
}

describe("Qualidade CSS 1: Estrutura modular de frontend/css/ e temas isolados", () => {
  test("arquivos base (tokens, base, componentes, animacoes) e pasta temas/ existem", () => {
    const obrigatorios = [
      "frontend/css/style.css",
      "frontend/css/tokens.css",
      "frontend/css/base.css",
      "frontend/css/componentes.css",
      "frontend/css/animacoes.css",
      "frontend/css/temas/halloween.css",
      "frontend/css/temas/natal.css",
    ];
    for (const arq of obrigatorios) {
      assert.ok(fs.existsSync(path.join(RAIZ, arq)), `Falta o arquivo CSS estrutural: ${arq}`);
    }
  });

  test("style.css é apenas o ponto de entrada (máximo de 40 linhas) e nenhum arquivo CSS passa de 450 linhas", () => {
    const linhasStyle = fs.readFileSync(path.join(PASTA_CSS, "style.css"), "utf8").split(/\r?\n/).length;
    assert.ok(linhasStyle <= 40, `style.css tem ${linhasStyle} linhas (deve ter no máximo 40 e só importar as camadas).`);

    for (const arq of listarTodosCss()) {
      const rel = path.relative(RAIZ, arq);
      const linhas = fs.readFileSync(arq, "utf8").split(/\r?\n/).length;
      assert.ok(
        linhas <= 450,
        `O arquivo ${rel} está com ${linhas} linhas (máximo 450). Divida para manter fácil de dar manutenção.`
      );
    }
  });

  test("temas sazonais (Halloween e Natal) ficam 100% isolados em frontend/css/temas/", () => {
    for (const arq of listarTodosCss()) {
      const nome = path.basename(arq);
      if (nome === "halloween.css" || nome === "natal.css") continue;
      const conteudo = fs.readFileSync(arq, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      assert.ok(
        !conteudo.includes(".hw-") && !conteudo.includes(".nt-"),
        `O arquivo ${path.relative(RAIZ, arq)} contém seletores de tema (.hw- ou .nt-). Eles devem ficar só em frontend/css/temas/.`
      );
    }
  });
});

describe("Qualidade CSS 2: Tokens de Design, Curvas, Camadas (z-index) e Acessibilidade", () => {
  test("tokens.css define cores de status (--sucesso, --alerta, --info, --perigo), curvas (--curva-*) e camadas (--z-*)", () => {
    const tokens = fs.readFileSync(path.join(PASTA_CSS, "tokens.css"), "utf8");
    const esperados = [
      "--sucesso:",
      "--alerta:",
      "--info:",
      "--perigo:",
      "--sombra:",
      "--curva-suave:",
      "--curva-pulo:",
      "--z-decoracao:",
      "--z-topo:",
      "--z-menu:",
      "--z-efeito:",
      "--z-aviso:",
    ];
    for (const tok of esperados) {
      assert.ok(tokens.includes(tok), `Falta o token ${tok} em frontend/css/tokens.css`);
    }
  });

  test("animacoes.css respeita economia de bateria/movimento reduzido (@media (prefers-reduced-motion: reduce))", () => {
    const anim = fs.readFileSync(path.join(PASTA_CSS, "animacoes.css"), "utf8");
    assert.ok(
      anim.includes("prefers-reduced-motion: reduce"),
      "Falta suporte a @media (prefers-reduced-motion: reduce) em frontend/css/animacoes.css"
    );
  });
});

describe("Qualidade CSS 3: Validação de variáveis var(--*), z-index e zero !important nos módulos", () => {
  test("todas as variáveis chamadas com var(--nome) existem declaradas no CSS ou nos estilos inline do JS", () => {
    const todos = listarTodosCss();
    const declaradas = new Set([
      // Variáveis injetadas via style="--..." pelo JavaScript (tags, cargos, luzes, neve, faíscas)
      "--cor-tag",
      "--cor-cargo",
      "--cor",
      "--i",
      "--vento",
      "--dx",
      "--dy",
      "--giro",
    ]);

    for (const arq of todos) {
      const txt = fs.readFileSync(arq, "utf8");
      for (const m of txt.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) {
        declaradas.add(m[1]);
      }
    }

    const naoDeclaradas = [];
    for (const arq of todos) {
      const txt = fs.readFileSync(arq, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of txt.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) {
        if (!declaradas.has(m[1])) {
          naoDeclaradas.push(`${path.relative(RAIZ, arq)}: ${m[1]}`);
        }
      }
    }

    assert.deepEqual(
      naoDeclaradas,
      [],
      `Variáveis CSS usadas mas nunca declaradas: ${naoDeclaradas.join(", ")}`
    );
  });

  test("nenhum módulo em frontend/modulos/*/*.css usa !important ou z-index mágico > 10", () => {
    const modulos = fs.readdirSync(PASTA_MODULOS);
    for (const mod of modulos) {
      const arq = path.join(PASTA_MODULOS, mod, `${mod}.css`);
      if (!fs.existsSync(arq)) continue;
      const limpo = fs.readFileSync(arq, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      assert.ok(
        !limpo.includes("!important"),
        `O módulo ${mod}.css usa !important. Ajuste o seletor sem precisar de !important.`
      );
      const zMagicos = [...limpo.matchAll(/z-index\s*:\s*(\d+)/g)].filter(m => Number(m[1]) > 10);
      assert.equal(
        zMagicos.length,
        0,
        `O módulo ${mod}.css usa z-index fixo alto (${zMagicos.map(m => m[0]).join(", ")}). Use var(--z-*).`
      );
    }
  });
});
