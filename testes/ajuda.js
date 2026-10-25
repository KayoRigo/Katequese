// =====================================================================
// testes/ajuda.js — carrega os arquivos reais do site para rodar os
// testes no Node.js, sem precisar instalar nenhuma biblioteca.
//
// Como rodar todos os testes no terminal:
//   node --test testes/*.test.js
// =====================================================================

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Cria um ambiente limpo que imita o básico do navegador e carrega os arquivos pedidos
function carregarSite(arquivos = []) {
  const contexto = vm.createContext({
    console,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Promise,
    RegExp,
    JSON,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    // Config falsa só para o banco.js não tentar conectar de verdade nos testes
    SUPABASE_URL: "COLE_AQUI",
    SUPABASE_ANON_KEY: "chave-teste",
    EMAIL_BASE: "grupo@gmail.com",
    supabase: { createClient: () => null },
    location: { pathname: "/index.html", hash: "", replace: () => {} },
    history: { replaceState: () => {} },
    // Imita o document.createElement("div") usado pelo esc() no dados.js
    document: {
      documentElement: { classList: { remove: () => {}, add: () => {} }, dataset: {} },
      body: { innerHTML: "", appendChild: () => {} },
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => {
        let texto = "";
        return {
          set textContent(v) {
            texto = String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          },
          get innerHTML() {
            return texto;
          },
        };
      },
    },
  });

  for (const arq of arquivos) {
    const caminho = path.join(__dirname, "..", arq);
    const codigo = fs.readFileSync(caminho, "utf8");
    vm.runInContext(codigo, contexto, { filename: arq });
  }

  // Permite ler e alterar também variáveis declaradas com "let" ou "const" nos arquivos
  return new Proxy(contexto, {
    get(alvo, prop) {
      if (prop === "definir") {
        return (nome, valor) => {
          alvo.__temp = valor;
          vm.runInContext(`${nome} = __temp; delete __temp;`, alvo);
        };
      }
      if (prop in alvo) return alvo[prop];
      try {
        return vm.runInContext(String(prop), alvo);
      } catch {
        return undefined;
      }
    },
  });
}

module.exports = { carregarSite };
