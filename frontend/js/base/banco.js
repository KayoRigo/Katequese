// =====================================================================
// banco.js — conexão com o Supabase (banco de dados, login e arquivos).
// Toda página protegida chama "await iniciarPagina()" antes de mostrar algo.
// =====================================================================

const configurado = !SUPABASE_URL.startsWith("COLE_AQUI") && !EMAIL_BASE.startsWith("COLE_AQUI");
const sb = configurado ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// O perfil de quem está logado (preenchido pelo iniciarPagina)
let perfilAtual = null;

// ---------------- Login ----------------

function normalizarUsuario(texto) {
  return texto.trim().toLowerCase();
}

// "joao" + "grupo@gmail.com" → "grupo+joao@gmail.com" (veja a explicação no config.js)
function emailDe(usuario) {
  const [nome, dominio] = EMAIL_BASE.split("@");
  return `${nome}+${normalizarUsuario(usuario)}@${dominio}`;
}

// O Supabase exige senha com pelo menos 6 caracteres. Para aceitar senhas
// curtas, completamos a senha com um sufixo fixo antes de enviar.
// ATENÇÃO: isso NÃO deixa a senha mais forte. Senha curta continua fácil de adivinhar.
function senhaReal(senha) {
  return senha + "@kq";
}

async function sair() {
  await sb.auth.signOut();
  location.replace("login.html");
}

// ---------------- Proteção das páginas ----------------

// Uma Promise que nunca termina: usada para "parar" a página depois de redirecionar
const parar = () => new Promise(() => {});

function irPara(pagina) {
  location.replace(pagina);
  return parar();
}

function mostrarErroFatal(mensagem) {
  document.documentElement.classList.remove("carregando");
  document.body.innerHTML = `
    <main><div class="caixa aviso-central">
      <h2>Erro</h2>
      <p>${mensagem}</p>
    </div></main>`;
  return parar();
}

// Confere se a pessoa está logada E aprovada. Se não estiver, manda para o login.
// Use { soAdmin: true } nas páginas que só administradores podem ver.
async function iniciarPagina({ soAdmin = false } = {}) {
  if (!configurado) {
    return mostrarErroFatal("O banco de dados ainda não foi configurado. Preencha o arquivo <b>config.js</b>.");
  }

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return irPara("login.html");

  // Busca perfil, permissão de katequista, config do site e cargos ao mesmo tempo (abre mais rápido)
  const [
    { data: perfil },
    { data: ehKatequista, error: erroKatequista },
    { data: config, error },
  ] = await Promise.all([
    sb.from("perfis").select("*").eq("id", session.user.id).maybeSingle(),
    sb.rpc("eh_katequista"),
    sb.from("config").select("dados").eq("id", 1).maybeSingle(),
    carregarCargos(),
  ]);

  if (!perfil || perfil.status !== "aprovado") return irPara("login.html");
  if (soAdmin && !perfil.admin) return irPara("index.html");

  perfil.katequista = erroKatequista ? true : !!ehKatequista;
  perfilAtual = perfil;

  if (error || !config) {
    return mostrarErroFatal("Não consegui carregar os dados do site. Confira se o <b>supabase.sql</b> foi executado.");
  }
  usarDados(config.dados);

  // Tema global ligado pelo admin (ex: Halloween): passa por cima da paleta de cada um
  aplicarTemaGlobal(config.dados.temaGlobal || null);

  montarMenu(perfil);
  document.documentElement.classList.remove("carregando"); // agora sim, mostra a página
  if (typeof iniciarPushAutomatico === "function") iniciarPushAutomatico(perfil); // notificações ligadas por padrão
  return perfil;
}

// ---------------- Arquivos (só imagens) ----------------
// Ficam no "balde" privado "arquivos" do Supabase Storage. Para mostrar,
// pedimos um link temporário (vale 1 hora) — assim só membros conseguem ver.

const BALDE = "arquivos";
const LIMITE_ARQUIVO = 10 * 1024 * 1024; // 10 MB (o banco também recusa acima disso)

// Diminui fotos grandes antes de enviar (economiza espaço e deixa o site rápido).
// Se o navegador não conseguir ler a imagem (ex: HEIC do iPhone), envia a original.
async function reduzirImagem(arquivo, ladoMaximo = 1600) {
  if (!arquivo.type.startsWith("image/") || arquivo.type === "image/gif") return arquivo;
  try {
    const imagem = await createImageBitmap(arquivo);
    const escala = Math.min(1, ladoMaximo / Math.max(imagem.width, imagem.height));
    const tela = document.createElement("canvas");
    tela.width = Math.round(imagem.width * escala);
    tela.height = Math.round(imagem.height * escala);
    tela.getContext("2d").drawImage(imagem, 0, 0, tela.width, tela.height);
    const blob = await new Promise(ok => tela.toBlob(ok, "image/jpeg", 0.85));
    return new File([blob], "foto.jpg", { type: "image/jpeg" });
  } catch (e) {
    return arquivo;
  }
}

// Envia um arquivo e devolve o "caminho" dele no armazenamento (é isso que vai pro banco)
async function enviarArquivo(pasta, arquivo) {
  if (!arquivo.type.startsWith("image/")) throw new Error("Só é possível enviar imagens.");
  if (arquivo.size > LIMITE_ARQUIVO) throw new Error("A imagem passa de 10 MB.");
  const extensao = (arquivo.name.split(".").pop() || "bin").toLowerCase();
  const caminho = `${pasta}/${perfilAtual.id}/${Date.now()}.${extensao}`;
  const { error } = await sb.storage.from(BALDE).upload(caminho, arquivo, { contentType: arquivo.type });
  if (error) throw error;
  return caminho;
}

async function apagarArquivo(caminho) {
  if (caminho) await sb.storage.from(BALDE).remove([caminho]);
}

// Apaga do armazenamento todas as fotos de "antigas" que não estão mais em "atuais"
async function limparFotosAntigas(antigas = [], atuais = []) {
  const usadas = new Set(atuais.filter(Boolean));
  for (const cam of new Set(antigas.filter(Boolean))) {
    if (!usadas.has(cam)) await apagarArquivo(cam);
  }
}

// Recebe uma lista de caminhos e devolve { caminho: link } para usar em <img src>
async function linksDosArquivos(caminhos) {
  const unicos = [...new Set(caminhos.filter(Boolean))];
  if (!unicos.length) return {};
  const { data } = await sb.storage.from(BALDE).createSignedUrls(unicos, 3600);
  const links = {};
  (data || []).forEach(item => { if (item.signedUrl) links[item.path] = item.signedUrl; });
  return links;
}

// ---------------- Eventos ----------------

// Todos os eventos, com o nome de quem criou, do mais próximo para o mais distante
async function buscarEventos() {
  const { data, error } = await sb
    .from("eventos")
    // "perfis!autor_id" = o perfil de QUEM CRIOU o evento. Precisa dizer isso porque
    // eventos e perfis também se ligam pela tabela de presenças.
    .select("*, perfis!autor_id(nome, apelido)")
    .order("data")
    .order("hora", { nullsFirst: true });
  return error ? [] : data;
}

// ---------------- Tags ----------------

// Devolve { id_do_perfil: [tags...] } para mostrar as tags de cada membro
async function buscarTagsDosPerfis() {
  const { data } = await sb.from("perfil_tags").select("perfil_id, tags(id, nome, cor, sistema)");
  const porPerfil = {};
  (data || []).forEach(item => {
    if (!item.tags) return;
    (porPerfil[item.perfil_id] ||= []).push(item.tags);
  });
  Object.values(porPerfil).forEach(lista => lista.sort((a, b) => a.nome.localeCompare(b.nome)));
  return porPerfil;
}

// Katequista = admin OU tem a tag do sistema "Katequista" (mesma regra do banco).
// Os outros aprovados são visitantes.
function ehKatequistaPerfil(pessoa, tagsDaPessoa = []) {
  return pessoa.admin || tagsDaPessoa.some(t => t.sistema && t.nome === "Katequista");
}

// ---------------- Presença nos eventos ----------------

// Devolve { id_do_evento: [ { resposta, perfil_id, perfis: {...} }, ... ] }
// (o banco só entrega as respostas dos eventos que a pessoa pode ver)
async function buscarPresencas(idsEventos) {
  if (!idsEventos.length) return {};
  const { data } = await sb
    .from("presencas")
    .select("evento_id, perfil_id, resposta, perfis(nome, apelido, usuario, foto_path)")
    .in("evento_id", idsEventos)
    .order("atualizado_em");
  const porEvento = {};
  (data || []).forEach(p => (porEvento[p.evento_id] ||= []).push(p));
  return porEvento;
}

// Responde (ou tira a resposta, se clicar de novo na mesma opção)
async function responderPresenca(idEvento, resposta, respostaAtual) {
  if (resposta === respostaAtual) {
    return sb.from("presencas").delete().eq("evento_id", idEvento).eq("perfil_id", perfilAtual.id);
  }
  // "upsert" = insere, ou atualiza se a pessoa já tinha respondido
  return sb.from("presencas").upsert({
    evento_id: idEvento,
    perfil_id: perfilAtual.id,
    resposta,
    atualizado_em: new Date().toISOString(),
  });
}

// ---------------- Aniversários ----------------

// Todos os membros aprovados que preencheram o aniversário, do mais próximo para o mais distante
async function buscarAniversarios() {
  const { data } = await sb
    .from("perfis")
    .select("id, nome, apelido, usuario, foto_path, aniversario")
    .eq("status", "aprovado")
    .not("aniversario", "is", null);
  return (data || [])
    .map(p => ({ ...p, faltam: diasAteAniversario(p.aniversario) }))
    .sort((a, b) => a.faltam - b.faltam);
}

// ---------------- Mural: recados e anúncios ----------------

// ---------------- Cargos (aparecem ao lado do nome, com destaque de marca-texto) ----------------
// Presidente e Deputado vêm das tags do sistema (com a cor da tag); Admin vem do perfil (vermelho).
const COR_ADMIN = "#e5484d";
let cargosPorPerfil = {}; // { id_do_perfil: [ { nome, cor }, ... ] }

async function carregarCargos() {
  // Todas as tags de todo mundo, com a ordem da hierarquia (tags.ordem, supabase-17)
  let [{ data: comTags, error }, { data: admins }] = await Promise.all([
    sb.from("perfil_tags").select("perfil_id, tags!inner(nome, cor, sistema, ordem)"),
    sb.from("perfis").select("id").eq("admin", true).eq("status", "aprovado"),
  ]);
  if (error) { // banco ainda sem a coluna "ordem": usa a ordem antiga
    ({ data: comTags } = await sb.from("perfil_tags").select("perfil_id, tags!inner(nome, cor, sistema)"));
  }
  const ordemAntiga = { Presidente: 10, Deputado: 20, Katequista: 900, Visitante: 950 };
  cargosPorPerfil = {};
  (comTags || []).forEach(({ perfil_id, tags }) => {
    if (!tags) return;
    const ordemFixa = tags.sistema && tags.nome === "Katequista" ? 900
      : tags.sistema && tags.nome === "Visitante" ? 950
      : (tags.ordem ?? ordemAntiga[tags.nome] ?? 500);
    (cargosPorPerfil[perfil_id] ||= []).push({
      nome: tags.nome, cor: tags.cor, sistema: tags.sistema,
      ordem: ordemFixa,
    });
  });
  // Admin não é tag, mas fica sempre no topo da hierarquia
  (admins || []).forEach(({ id }) => (cargosPorPerfil[id] ||= []).push({ nome: "Admin", cor: COR_ADMIN, sistema: true, ordem: -1 }));
  Object.values(cargosPorPerfil).forEach(lista => lista.sort((a, b) => a.ordem - b.ordem));
}

// Lista de cargos de uma pessoa (vazia se ela não tiver nenhum)
function cargosDe(idPerfil) {
  return cargosPorPerfil[idPerfil] || [];
}

// Pode publicar anúncio / dar prioridade? (a mesma regra do banco, só para mostrar ou esconder botões)
const temCargo = (idPerfil, nome) => cargosDe(idPerfil).some(c => c.sistema && c.nome === nome);

// Recados: fixados primeiro, depois os mais novos
async function buscarRecados(limite = 200) {
  const { data, error } = await sb
    .from("recados")
    .select("*, perfis(nome, apelido, usuario, foto_path, admin)")
    .order("fixado", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(limite);
  return error ? null : data; // null = a tabela ainda não está pronta (falta o supabase-12.sql)
}

// Anúncios: os de prioridade primeiro, depois os mais novos
async function buscarAnuncios(limite = 100) {
  const { data, error } = await sb
    .from("anuncios")
    .select("*, perfis(nome, apelido, usuario, foto_path, admin)")
    .order("prioridade", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(limite);
  return error ? null : data;
}
