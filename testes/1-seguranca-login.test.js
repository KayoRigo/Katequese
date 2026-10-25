// =====================================================================
// 1-seguranca-login.test.js — testa proteção contra código malicioso (XSS)
// e a transformação de usuário/senha para o formato que o Supabase aceita.
// =====================================================================

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { carregarSite } = require("./ajuda.js");

const site = carregarSite(["dados.js", "banco.js"]);

describe("Segurança: esc() contra injeção de HTML (XSS)", () => {
  test("bloqueia tags <script> e HTML malicioso", () => {
    const entrada = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
    const seguro = site.esc(entrada);
    assert.ok(!seguro.includes("<script>"));
    assert.ok(!seguro.includes("<img"));
    assert.equal(
      seguro,
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;"
    );
  });

  test("escapa aspas duplas e simples (protege atributos e style url)", () => {
    const entrada = `foto" onclick="mal()" ' style='background:url(x)'`;
    const seguro = site.esc(entrada);
    assert.ok(!seguro.includes('"'));
    assert.ok(!seguro.includes("'"));
    assert.ok(seguro.includes("&quot;"));
    assert.ok(seguro.includes("&#39;"));
  });

  test("aceita null, undefined e números sem dar erro", () => {
    assert.equal(site.esc(null), "");
    assert.equal(site.esc(undefined), "");
    assert.equal(site.esc(123), "123");
  });
});

describe("Login: usuário, e-mail com '+' e senha", () => {
  test("normalizarUsuario tira espaços das pontas e deixa minúsculo", () => {
    assert.equal(site.normalizarUsuario("  KaYo  "), "kayo");
  });

  test("emailDe monta o e-mail com '+' usando o EMAIL_BASE", () => {
    assert.equal(site.emailDe("Joao"), "grupo+joao@gmail.com");
    assert.equal(site.emailDe("  pedro.123 "), "grupo+pedro.123@gmail.com");
  });

  test("senhaReal completa senhas curtas para ter pelo menos 6 caracteres", () => {
    const s = site.senhaReal("1234");
    assert.equal(s, "1234@kq");
    assert.ok(s.length >= 6);
  });
});
