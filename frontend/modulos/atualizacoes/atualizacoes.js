// =====================================================================
// modulos/atualizacoes/atualizacoes.js — histórico paginado (atualizacoes.html).
// =====================================================================

const eu = await iniciarPagina();
const $ = (id) => document.getElementById(id);
const form = $("form-atualizacao");
const POR_PAGINA = 15;

let paginaAtual = 1;
const TIPOS = { nova: "Novidade", melhoria: "Melhoria", correcao: "Correção", banco: "Banco de dados" };

// Pessoas com conta (para ligar o nome digitado à conta e mostrar o cargo)
const { data: pessoas } = await sb.from("perfis").select("id, nome, apelido, usuario").eq("status", "aprovado");

// ---------- Linha do tempo (15 por página) ----------
async function mostrar(pagina = paginaAtual) {
  const { count, error: erroContagem } = await sb.from("atualizacoes").select("id", { count: "exact", head: true });
  if (erroContagem) {
    $("linha-do-tempo").innerHTML = eu.katequista
      ? '<p class="vazio">A aba Atualizações ainda não está pronta no banco. O admin precisa rodar o <b>supabase-13.sql</b>.</p>'
      : '<p class="vazio">Só Katequistas veem as atualizações do site.</p>';
    return;
  }
  const total = count || 0;
  if (!total) {
    $("linha-do-tempo").innerHTML = eu.katequista
      ? '<p class="vazio">Nenhuma atualização registrada ainda.</p>'
      : '<p class="vazio">Só Katequistas veem as atualizações do site.</p>';
    return;
  }

  const pag = calcularPaginacao(pagina, total, POR_PAGINA);
  paginaAtual = pag.pagina;

  const { data } = await sb
    .from("atualizacoes")
    .select("*")
    .order("criado_em", { ascending: false })
    .range(pag.inicio, pag.fim);

  // Agrupa por dia: "sábado, 24 de outubro"
  const porDia = {};
  (data || []).forEach(a => {
    const dia = new Date(a.criado_em).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    (porDia[dia] ||= []).push(a);
  });

  $("linha-do-tempo").innerHTML = Object.entries(porDia).map(([dia, lista]) => `
    <section class="dia-atualizacoes">
      <h2 class="subtitulo">${dia}</h2>
      <ol class="atualizacoes">
        ${lista.map(a => `
          <li class="atualizacao tipo-${a.tipo}">
            <time>${new Date(a.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>
            <div class="atualizacao-corpo">
              <div class="atualizacao-topo">
                <span class="tipo-atualizacao">${TIPOS[a.tipo]}</span>
                <strong>${esc(a.titulo)}</strong>
              </div>
              ${a.descricao ? `<p>${esc(a.descricao)}</p>` : ""}
              <small>
                por ${esc(a.autor_nome)}${a.autor_id ? htmlCargos(a.autor_id) : ""}
                ${a.origem === "github" ? " · via GitHub" : ""}
                ${eu.admin ? ` · <button class="botao-link perigo" data-apagar="${a.id}">Apagar</button>` : ""}
              </small>
            </div>
          </li>`).join("")}
      </ol>
    </section>`).join("") + htmlPaginacao({ pagina: paginaAtual, total, porPagina: POR_PAGINA, rotulo: total === 1 ? "mudança" : "mudanças" });
}
await mostrar(1);

// ---------- Formulário (admin) ----------
if (eu.admin) {
  $("abrir-form").hidden = false;
  $("pessoas").innerHTML = (pessoas || []).map(p => `<option value="${esc(p.nome)}">@${esc(p.usuario)}</option>`).join("");
}

const agoraLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

$("abrir-form").addEventListener("click", () => {
  form.hidden = false;
  $("abrir-form").hidden = true;
  $("autor").value = eu.nome;
  $("quando").value = agoraLocal();
  $("titulo").focus();
});
function fecharForm() {
  form.reset();
  form.hidden = true;
  $("abrir-form").hidden = false;
  $("progresso").textContent = "";
}
$("cancelar").addEventListener("click", fecharForm);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = $("autor").value.trim();
  const pessoa = (pessoas || []).find(p => p.nome.toLowerCase() === nome.toLowerCase() || p.usuario === nome.replace(/^@/, "").toLowerCase());
  $("progresso").textContent = "Registrando...";
  const { error } = await sb.from("atualizacoes").insert({
    titulo: $("titulo").value.trim(),
    descricao: $("descricao").value.trim(),
    tipo: $("tipo").value,
    autor_nome: pessoa ? pessoa.nome : nome,
    autor_id: pessoa?.id || null,
    criado_em: new Date($("quando").value).toISOString(),
  });
  if (error) return $("progresso").textContent = "Não foi possível registrar: " + error.message;
  fecharForm();
  await mostrar(1);
});

$("linha-do-tempo").addEventListener("click", async (e) => {
  const pag = e.target.closest("[data-pagina]");
  if (pag && !pag.disabled) {
    await mostrar(Number(pag.dataset.pagina));
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const botao = e.target.closest("[data-apagar]");
  if (!botao || !(await confirmar("Apagar esta atualização do registro?", "Apagar"))) return;
  await sb.from("atualizacoes").delete().eq("id", botao.dataset.apagar);
  await mostrar(paginaAtual);
});
