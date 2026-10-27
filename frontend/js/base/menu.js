// =====================================================================
// menu.js — o menu de cima, escrito uma vez só para todas as páginas.
//
// Como funciona:
//   - FIXAS: as abas que aparecem sempre na barra (no computador).
//   - GRUPOS: o resto fica no painel do botão "Mais", separado por assunto.
//   - No celular, tudo (fixas + grupos) fica no painel do botão "Menu".
//
// Para criar uma aba nova, é só colocar ["arquivo.html", "Nome"] no grupo certo.
// Regras opcionais: "soAdmin" (só administradores), "soKatequista" (visitantes não veem)
// e "soNotificar" (admin ou Presidente, quem pode enviar notificações).
// =====================================================================

const ABAS_FIXAS = [
  ["index.html", "Início"],
  ["eventos.html", "Eventos"],
  ["midias.html", "Mídias"],
  ["politica.html", "Política"],
  ["economia.html", "Economia"],
];

const GRUPOS_MENU = [
  { titulo: "Grupo", abas: [
    ["membros.html", "Membros"],
    ["mural.html", "Mural"],
  ]},
  { titulo: "Atividades", abas: [
    ["enquetes.html", "Enquetes"],
    ["sorteios.html", "Sorteios"],
    ["pagamentos.html", "Pagamentos"],
  ]},
  { titulo: "Conta", abas: [
    ["perfil.html", "Perfil"],
    ["atualizacoes.html", "Atualizações", "soKatequista"],
    ["notificacoes.html", "Notificações", "soNotificar"],
    ["admin.html", "Admin", "soAdmin"],
  ]},
];

// Chamado pelo banco.js depois de confirmar quem está logado
function montarMenu(perfil) {
  const paginaAtual = location.pathname.split("/").pop() || "index.html";
  // Com um tema global ligado pelo admin, a escolha de paleta some (o tema manda)
  const temaGlobalLigado = !!document.documentElement.dataset.temaGlobal;

  // Tira do menu o que a pessoa não pode ver (Admin para quem não é admin, etc.)
  const grupos = GRUPOS_MENU
    .map(g => ({ ...g, abas: g.abas.filter(([, , regra]) =>
      (regra !== "soAdmin" || perfil.admin) && (regra !== "soKatequista" || perfil.katequista) &&
      (regra !== "soNotificar" || perfil.admin || (perfil.katequista && temCargo(perfil.id, "Presidente")))) }))
    .filter(g => g.abas.length);

  const link = ([arquivo, nome]) =>
    `<a href="${arquivo}" ${arquivo === paginaAtual ? 'class="ativo" aria-current="page"' : ""}>${nome}</a>`;

  // A página atual está escondida dentro do "Mais"? Então o botão fica marcado e mostra o nome dela
  const abaDoPainel = grupos.flatMap(g => g.abas).find(([arquivo]) => arquivo === paginaAtual);

  document.getElementById("menu").innerHTML = `
    <a class="logo fonte-nome" href="index.html">Katequese</a>
    <nav class="abas-fixas">${ABAS_FIXAS.map(link).join("")}</nav>
    <div class="menu-mais">
      <button class="botao-mais ${abaDoPainel ? "ativo" : ""}" id="botao-mais" aria-expanded="false" aria-controls="painel-menu">
        <span class="so-computador">${abaDoPainel ? abaDoPainel[1] : "Mais"}</span>
        <span class="so-celular">Menu</span>
        <svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="painel-menu" id="painel-menu" hidden>
        <div class="grupo-menu so-celular">
          <p>Principal</p>
          ${ABAS_FIXAS.map(link).join("")}
        </div>
        ${grupos.map(g => `
          <div class="grupo-menu">
            <p>${g.titulo}</p>
            ${g.abas.map(link).join("")}
          </div>`).join("")}
        <button class="botao-sair so-celular" data-sair>Sair</button>
      </div>
    </div>
    ${temaGlobalLigado ? "" : htmlSeletorPaleta()}
    <button class="botao-sair so-computador" data-sair>Sair</button>`;

  // Abrir e fechar o painel (clicar fora ou apertar Esc também fecha)
  const botao = document.getElementById("botao-mais");
  const painel = document.getElementById("painel-menu");
  const abrir = (sim) => { painel.hidden = !sim; botao.setAttribute("aria-expanded", sim); };
  botao.addEventListener("click", (e) => { e.stopPropagation(); abrir(painel.hidden); });
  document.addEventListener("click", (e) => { if (!painel.contains(e.target)) abrir(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") abrir(false); });

  document.querySelectorAll("[data-sair]").forEach(b => b.addEventListener("click", sair));
  if (!temaGlobalLigado) ligarSeletorPaleta();

  // Para admins: bolinha com quantos cadastros estão "pendentes" (normalmente zero desde o supabase-10.sql)
  if (perfil.admin) {
    sb.from("perfis").select("id", { count: "exact", head: true }).eq("status", "pendente")
      .then(({ count }) => {
        if (!count) return;
        const bolinha = `<span class="bolinha">${count}</span>`;
        document.querySelector('#menu a[href="admin.html"]')?.insertAdjacentHTML("beforeend", bolinha);
        botao.insertAdjacentHTML("beforeend", bolinha);
      });
  }
}

// ---------------- App instalável (PWA) ----------------
// Registra o service worker e avisa quando há versão nova do site
if ("serviceWorker" in navigator) {
  // Na primeira visita o site ainda não tinha controlador: aí não precisa recarregar a página
  const tinhaControlador = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    const avisar = () => {
      if (document.getElementById("aviso-atualizacao")) return;
      const barra = document.createElement("div");
      barra.id = "aviso-atualizacao";
      barra.className = "aviso-atualizacao";
      barra.innerHTML = '<span>Nova versão do site disponível.</span><button type="button" class="botao-pequeno">Atualizar</button>';
      barra.querySelector("button").addEventListener("click", () => reg.waiting?.postMessage("pular-espera"));
      document.body.appendChild(barra);
    };
    if (reg.waiting && navigator.serviceWorker.controller) avisar();
    reg.addEventListener("updatefound", () => {
      const novo = reg.installing;
      novo.addEventListener("statechange", () => {
        if (novo.state === "installed" && navigator.serviceWorker.controller) avisar();
      });
    });
  }).catch(() => {});

  let recarregou = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (tinhaControlador && !recarregou) { recarregou = true; location.reload(); }
  });
}

