// =====================================================================
// modulos/membros/membros.js — listagem de Katequistas e Visitantes
// com busca por nome/@usuário e filtro por cargo/tag.
// =====================================================================

await iniciarPagina();

// Busca no banco todo mundo que já foi aprovado, em ordem alfabética
const { data: pessoas } = await sb
  .from("perfis")
  .select("id, nome, apelido, usuario, admin, foto_path, aniversario")
  .eq("status", "aprovado")
  .order("nome");

// Busca fotos, tags e carteiras de todos de uma vez
const [links, tags, { data: carteiras }] = await Promise.all([
  linksDosArquivos((pessoas || []).map(p => p.foto_path)),
  buscarTagsDosPerfis(),
  sb.from("carteiras").select("perfil_id, saldo, xp"),
]);

// Nível e saldo na economia de cada um
const nivelDe = {};
const saldoDe = {};
(carteiras || []).forEach(c => {
  nivelDe[c.perfil_id] = Math.floor(Math.sqrt(c.xp / 50)) + 1;
  saldoDe[c.perfil_id] = Number(c.saldo || 0);
});

// Preenche o seletor de tags disponíveis
const selectTag = document.getElementById("filtro-tag-membro");
const inputBusca = document.getElementById("busca-membro");
if (selectTag) {
  const mapaTags = new Map();
  Object.values(tags).flat().forEach(t => { if (t) mapaTags.set(String(t.id), t.nome); });
  selectTag.innerHTML = `<option value="">Todas as tags/cargos</option>` +
    [...mapaTags.entries()].map(([id, nome]) => `<option value="${esc(id)}">${esc(nome)}</option>`).join("");
}

// Separa em dois grupos
const katequistas = (pessoas || []).filter(p => ehKatequistaPerfil(p, tags[p.id]));
const visitantes = (pessoas || []).filter(p => !ehKatequistaPerfil(p, tags[p.id]));

// Cartão de uma pessoa
const cartao = (p) => `
  <div class="membro">
    ${htmlAvatar(p, links[p.foto_path])}
    <strong>${esc(p.nome)}${htmlCargos(p.id)}</strong>
    <small>@${esc(p.usuario)}${p.apelido ? " · " + esc(p.apelido) : ""}</small>
    ${nivelDe[p.id] ? `<small class="nivel-membro">Nível ${nivelDe[p.id]}${saldoDe[p.id] !== undefined ? ` · K$ ${saldoDe[p.id].toLocaleString("pt-BR")}` : ""}</small>` : ""}
    ${p.aniversario ? `<small class="aniversario-membro">Aniversário: ${esc(diaDoAniversario(p.aniversario))}${diasAteAniversario(p.aniversario) === 0 ? " · hoje" : ""}</small>` : ""}
    <div class="tags centro">${(tags[p.id] || []).map(t => htmlTag(t)).join("")}</div>
  </div>`;

const grupos = {
  katequistas: { lista: katequistas, texto: "Integrantes oficiais do grupo.", vazio: "Nenhum katequista ainda." },
  visitantes:  { lista: visitantes,  texto: "Pessoas aprovadas que ainda não são Katequistas. Só veem o que for liberado para visitantes.", vazio: "Nenhum visitante por enquanto." },
};

let abaAtual = location.hash === "#visitantes" ? "visitantes" : "katequistas";

function mostrarAba(nome = abaAtual) {
  if (!grupos[nome]) nome = "katequistas";
  abaAtual = nome;
  const g = grupos[nome];
  const filtrados = filtrarMembros(g.lista, tags, inputBusca?.value || "", selectTag?.value || "");

  document.querySelectorAll(".abas-membros .aba").forEach(a => a.classList.toggle("ativa", a.dataset.aba === nome));
  document.getElementById("subtitulo-membros").textContent = g.texto;
  const caixa = document.getElementById("membros");
  caixa.classList.toggle("sem-ninguem", !filtrados.length);
  caixa.innerHTML = filtrados.length
    ? filtrados.map(cartao).join("")
    : `<p class="vazio">${g.lista.length ? "Nenhum membro encontrado para esse filtro." : g.vazio}</p>`;
  history.replaceState(null, "", nome === "visitantes" ? "#visitantes" : location.pathname);
}

// Número de cada grupo no nome da aba
document.querySelectorAll(".abas-membros .aba").forEach(aba => {
  aba.textContent += ` (${grupos[aba.dataset.aba].lista.length})`;
  aba.addEventListener("click", () => mostrarAba(aba.dataset.aba));
});
inputBusca?.addEventListener("input", () => mostrarAba(abaAtual));
selectTag?.addEventListener("change", () => mostrarAba(abaAtual));
window.addEventListener("hashchange", () => mostrarAba(location.hash === "#visitantes" ? "visitantes" : "katequistas"));
mostrarAba(abaAtual);
