# Katequese — anotações do projeto

Site privado de um grupo de amigos ("a Katequese"). Dono e admin: **Kayo** (usuário `@kayo`),
estudante no início da faculdade de Ciência da Computação. Fale em **português**, explique as coisas
de forma simples e mantenha comentários em português no código (o Kayo aprende lendo).

## Como trabalhar (o Kayo quer economizar tokens)

- **Leia só o necessário:** este arquivo + os arquivos que o pedido envolve. Não releia o projeto inteiro.
- **Edite direto na pasta** do Mac (Documentos/Katequese). Não copie arquivos de um lado para o outro sem precisar.
- **SQL novo:** crie o arquivo `supabase-N.sql` na pasta e só **diga o nome do arquivo** para o Kayo abrir,
  copiar e rodar no SQL Editor. **NÃO cole o SQL inteiro na conversa**, a menos que ele peça.
- **Teste o SQL antes** no PostgreSQL local, se houver (ver seção Economia), em vez de pedir para o Kayo testar.
- **Evite capturas de tela.** Para conferir, prefira ler o texto da página ou checar pelo código; tire foto só
  quando o visual for o ponto do pedido. Não amplie/repita fotos à toa.
- **Respostas curtas:** diga o que mudou e o que ele precisa fazer (ex: rodar um SQL). Sem listar tudo de novo.
- **Testes que criam dados** (recado, evento, sorteio de teste): apague logo depois.
- **Registre cada mudança em Atualizações** (ver a REGRA mais abaixo).
- O site roda no Mac do Kayo com `cd ~/Documents/Katequese && python3 -m http.server 5173`; o navegador do
  app abre `http://localhost:5173`. Ao trocar arquivos, recarregue sem cache.

## Como o site funciona

- **Site estático** (HTML, CSS e JavaScript puros, sem framework e sem build) + **Supabase**
  (banco de dados, login e armazenamento de fotos).
- Para rodar no computador: `python3 -m http.server 5173` dentro desta pasta e abrir
  `http://localhost:5173`. (No Windows: `python -m http.server 5173`.)
- Ainda **não foi publicado** na internet. Plano: GitHub Pages ou Netlify (grátis).

### Arquivos

| Arquivo | O que é |
|---|---|
| `config.js` | URL do Supabase, chave pública (publishable) e `EMAIL_BASE` |
| `banco.js` | conexão com o Supabase, `iniciarPagina()` (protege as páginas), envio/links de arquivos, eventos, tags |
| `dados.js` | funções de ajuda: `esc()`, datas, `htmlEvento`, `htmlAvatar`, `htmlTag`, `confirmar()`/`avisarJanela()` |
| `leis.js` | Leis/Câmara (sub-abas da Política) |
| `menu.js` | menu de cima: `ABAS_FIXAS` (sempre na barra) + `GRUPOS_MENU` (painel do botão "Mais"; no celular, "Menu" com tudo) |
| `tema.js` | paletas de cada pessoa + **tema global** (Halloween) com todas as decorações em SVG |
| `style.css` | todo o visual; paletas no topo; tema de Halloween no fim |
| `index.html` | início: nome gigante, faixa, acesso rápido, próximo encontro, membro da semana, números, frase do dia |
| `eventos.html`, `midias.html`, `membros.html`, `enquetes.html`, `sorteios.html`, `economia.html` (+ `economia.js` e `minijogos.js`), `mural.html`, `atualizacoes.html`, `politica.html`, `perfil.html`, `admin.html`, `login.html` | as páginas |
| `supabase.sql` até `supabase-18.sql` | estrutura do banco (rodados em ordem no SQL Editor do Supabase) |
| `testes/` | testes automatizados separados por assunto (`node --test testes/*.test.js` e `5-banco-seguranca.sql`) |

Menu: barra com Início · Eventos · Mídias · Política · Economia + botão "Mais" com grupos:
Grupo (Membros, Mural) · Atividades (Enquetes, Sorteios) · Conta (Perfil, Atualizações [só katequistas], Admin). Página nova = entra num grupo.
Pedidos dos amigos, a fazer por partes (Sorteios e Mural já feitos): voltar Regras, integrar a rede social
(estilo Twitter) do amigo e um sistema de votação da Câmara dentro da Política.

### Login

- O Supabase exige e-mail, então o usuário vira `kayorigo0+USUARIO@gmail.com` (truque do "+" no Gmail).
- Senhas curtas: o site acrescenta `@kq` antes de enviar (`senhaReal()`), porque o Supabase exige 6 caracteres.
- "Confirm email" está **desligado** no Supabase.
- O primeiro cadastro `kayo` virou admin automaticamente (regra no `supabase.sql`).

### Quem pode o quê (garantido pelo banco, com RLS)

- **Não existe mais aprovação** (supabase-10.sql): quem se cadastra já entra como **Visitante**.
  Admin → Cadastro desliga isso (config `visitantesAtivos` = false): aí o cadastro já entra como **Katequista** (supabase-16).
- **Bloqueado** (status `recusado`, botão "Bloquear" no Admin): não vê nada. (`pendente` não é mais usado.)
- **Visitante** (sem a tag Katequista): só vê eventos, fotos e enquetes marcados como
  "visitantes podem ver"; só vota em enquete com "visitantes também podem votar"; pode trocar a
  própria foto de perfil; não cria nada.
- **Katequista** (tag do sistema dada por um admin): acesso completo, cria eventos, fotos e enquetes.
- **Admin:** sempre katequista; bloqueia/desbloqueia, dá/tira Katequista e admin, cria tags, membro da
  semana, frases, tema global e vê o uso do espaço.
- Tags do sistema: "Katequista", "Visitante", "Presidente" e "Deputado" (o admin dá Presidente/Deputado em Admin → Tags).
- Tags do sistema não apagam nem renomeiam. "Katequista" e "Visitante" se trocam sozinhas.

### Banco (Supabase)

- Tabelas: `perfis`, `config` (uma linha com JSON: frases, membro da semana, `temaGlobal`),
  `eventos`, `midias` (só fotos), `tags`, `perfil_tags`, `enquetes`, `enquete_opcoes`, `enquete_votos`,
  `politica` (presidente, 4 deputados, datas da eleição; todo aprovado lê) `politica_link` (link da votação; SÓ katequistas leem)
  e `politica_eleicao` (JSON com chapas/candidatos/propostas; SÓ katequistas leem),
  `presencas` (Vou/Talvez/Não vou por evento; vê quem vê o evento; só katequista responde, até o dia do evento),
  `sorteios` (título, foto, itens text[], sem_repetir, visivel_visitantes) e `sorteio_resultados` (histórico),
  `recados` (mural; texto até 1000, fixado, visivel_visitantes), `anuncios` (título, texto, prioridade, visivel_visitantes)
  e `atualizacoes` (registro de mudanças do site; katequistas leem, admin escreve).
  Economia: `carteiras`, `trabalhos`, `trabalho_niveis`, `transacoes` (extrato), `itens_loja`, `inventario`,
  `equipamentos`, `meus_equipamentos` e `efeitos_ativos` (itens de usar ligados).
- Balde privado `arquivos` (só imagens, até 10 MB); links temporários de 1 hora.
- Funções: `eh_aprovado`, `eh_admin`, `eh_katequista`, `pode_ver_arquivo`, `uso_do_espaco`,
  `criar_enquete`, `votar`, `resultados_enquetes`, `evento_aberto`, `sortear` (o banco escolhe o item; só autor ou admin),
  `tem_tag(nome)`, `pode_anunciar()` (admin/Presidente/Deputado), `pode_priorizar()` (admin/Presidente).
- **Mudança na estrutura do banco = novo arquivo `supabase-N.sql`** (o próximo é o 19), feito para
  poder rodar mais de uma vez, e o Kayo roda no SQL Editor. Mudança só de conteúdo vai pelo Admin.
- Plano grátis: 500 MB de banco, 1 GB de arquivos, 5 GB de tráfego por mês.

## Preferências do Kayo (importante)

- **Nada com "cara de IA"**: nada de degradês e brilhos à toa, roxo + verde-água, emoji em todo
  título, frases engraçadinhas na interface. Textos da interface diretos e neutros.
- O humor (palavrões liberados) fica só no conteúdo que o admin controla (frases) e nos segredos.
- **Não citar nomes dos membros** em lugar nenhum, a não ser onde ele pedir.
- Fonte do nome "Katequese": **Coustard Black**. Textos: **Archivo**.
- Segredos da página inicial (não deixar óbvio na tela): clicar nas letras do nome; digitar "katequese" solta confete.
- Tema global **Halloween** está LIGADO (desligar em Admin → Tema do site → Nenhum).
- Tema global **Natal** (tema.js `decorarNatal`, CSS "TEMA GLOBAL: NATAL" no fim do style.css; prefixo `nt-`):
  neve caindo, pisca-pisca (clique muda o modo), sinos nos cantos (tocam), trenó que passa (solta presentes),
  árvore, presentes, bengala, boneco de neve ("Brrr!"), estrela-guia na capa (nevasca) e GUERRA DE BOLA DE NEVE:
  clicar num montinho pega uma bola, o próximo clique arremessa (captura o clique, não aciona links; Esc solta).
  Acertar boneco/trenó/sino/árvore faz cada um reagir. `DECORAR_TEMA` liga cada tema à sua função.
- Não usar `confirm()`/`alert()` do navegador (o painel do app bloqueia): usar `confirmar()`/`avisarJanela()`.

## REGRA: registrar toda mudança em Atualizações

Toda vez que mudar algo no site (página, visual, banco), registre uma linha na tabela `atualizacoes`
com quem pediu/fez (`autor_nome`, e `autor_id` se tiver conta), título curto, detalhes, tipo
(`nova` | `melhoria` | `correcao` | `banco`) e a data/hora. Jeitos de registrar: pelo formulário
"Registrar mudança" na página Atualizações (admin), por JavaScript no navegador logado como admin, ou num
`insert` no SQL Editor. O histórico de 23/10 09:44 até 24/10 10:24 já está lá (veio no supabase-13.sql).
Futuro: quando o site estiver no GitHub, uma GitHub Action pode registrar cada commit sozinha (`origem = 'github'`).

## Membros e contadores

- Membros tem duas abas: Katequistas e Visitantes (`ehKatequistaPerfil` no banco.js, mesma regra do banco).
- Página inicial: "membros" conta katequistas e "visitantes" conta os outros aprovados.

## Eventos e aniversários

- Presença: cada cartão de evento tem "Vou / Talvez / Não vou" (clicar de novo tira a resposta), fotinhas
  de quem vai e a lista de nomes. A página inicial mostra quantos confirmaram no próximo encontro.
- Aniversários: coluna `perfis.aniversario` (preenchida no Perfil). A página inicial mostra quem faz
  aniversário hoje e os próximos; Membros mostra o dia e o mês. O ano não aparece em lugar nenhum.

## Mural

- `mural.html` com abas Anúncios oficiais (primeira, abre por padrão) e Recados (`#recados` abre direto nos recados).
- Recados: só katequistas escrevem (até 1000 letras) e escolhem se visitantes veem; visitantes só leem
  os liberados. Admin fixa no topo; autor ou admin apaga.
- Anúncios: só Presidente, Deputado ou admin publicam; "Prioridade" (topo, destaque e página inicial) só
  Presidente ou admin.
- Página inicial (abaixo de Próximo encontro/Membro da semana, acima de Aniversários): anúncio com prioridade
  mais recente + 3 últimos recados. SEM campo de escrever (o Kayo não quer a página inicial poluída).

## Cargos ao lado do nome

- `carregarCargos()` (banco.js, roda no `iniciarPagina`) monta `cargosPorPerfil`: Presidente e Deputado (tags
  do sistema, cor da tag) e Admin (perfil, vermelho `#e5484d`).
- `htmlNome(pessoa, id)` / `htmlCargos(id)` (dados.js): nome + cargos com destaque de marca-texto (`.cargo`).
- Usado em: anúncios, recados, eventos (criado por / presença), enquetes, mídias, sorteios e Membros.

## Economia (moeda K$)

- Só katequistas. Todo mundo começa com K$ 500. Sub-abas: Carteira (bônus diário + extrato), Trabalhos,
  Transferir, Loja (+ inventário), Cassino (Cara ou Coroa, Roleta, Caça-níquel), Ranking e Admin.
- TODO dinheiro passa por funções do banco (security definer): `abrir_carteira`, `bonus_diario`, `comecar_trabalho`,
  `trabalhar(id, desempenho)`, `transferir`, `comprar`, `comprar_equipamento`, `apostar(jogo, valor, escolha)`,
  `admin_ajustar_saldo`. A função interna `mexer_saldo` não pode ser chamada pelo site (revoke). Ninguém dá update direto nas tabelas.
- Níveis: geral = floor(sqrt(xp/50))+1; por trabalho = floor(sqrt(xp/3))+1 (cada nível paga +10%).
  XP geral por turno = `trabalhos.xp_geral` (12/16/20/26/34); na profissão +1 (ou +2 com desempenho ≥ 70).
  Bônus diário 5, aposta 2, compra 3.
- 5 profissões, TODAS liberadas desde o nível 1 (supabase-15). Valores: Table Editor, tabela `trabalhos`.
- Turno = minijogo (minijogos.js): `comecar_trabalho` marca o turno e já começa a espera (fechar no meio perde);
  `trabalhar(id, desempenho 0–100)` só aceita 4 s a 5 min depois. Pagamento × (0,4 + 0,6 × desempenho).
  Extra (gorjeta/cachê extra/bônus do cliente/investidor): chance = `chance_extra` + equipamentos + até 15% pelo desempenho;
  vale 25–60% do pagamento. Minijogos: entregador Rota de entregas, churrasqueiro Ponto da carne, DJ Sequência,
  programador Caça aos bugs, empresário Negociação. O "ajuda" dos equipamentos deixa cada um mais fácil.
- Equipamentos (Loja → Equipamentos de trabalho): por profissão, em "linhas" (vale só o melhor item de cada linha;
  ex: bicicleta → moto → carro). Pedem nível NA PROFISSÃO (`nivel_min`) e às vezes o anterior (`requer`).
  Efeitos: `pagamento` (+%), `espera` (−%, total até 60%), `extra` (+chance), `ajuda`. Editar: Table Editor, `equipamentos`.
- Tempos (supabase-16): entregador 5 min (K$ 8–16), churrasqueiro 8 (14–24), DJ 12 (20–36), programador 15 (25–45),
  empresário 20 (30–56) → ~130–145 K$/h jogando bem em qualquer uma.
- Itens da loja têm ATRIBUTOS (admin cria/edita em Economia → Admin, com modelos prontos e imagem na pasta `loja/`):
  pagamento, espera, extra, ajuda, xp (com `trabalho_alvo` opcional), diario (K$), rendimento (% do saldo no diário,
  até K$ 2.000, soma até 5%), cassino_premio (% a mais no lucro), cassino_volta (cashback, até 50%), desconto (até 50%),
  revenda, limite por pessoa e `duracao_horas` (vazio = permanente; com valor = item de usar, `usar_item`).
  Cada item conta uma vez (ter 3 não triplica). Soma em `bonus_itens()`; o site lê `meus_bonus_itens()`.
  Espera total (equipamentos + itens) até 60%. Admin também edita preço/nível de itens e equipamentos ali.
- Visitantes: na Economia só veem o Ranking. Transferir só a partir do nível geral 3 (anti-conta-extra).
- Cassino (animações): moeda 3D arremessada, roleta em SVG com ordem europeia e bola (rAF), caça-níquel com alavanca.
- Cassino: moeda 2×; roleta 0–36 (vermelho/preto 2×, verde 36×); caça-níquel com pesos 40/30/15/10/5
  (cereja, limão, sino, estrela, sete), 3 iguais pagam 5/8/15/30/100×, 2 cerejas devolvem. Aposta 10 a 50.000.
- Perfil mostra saldo e nível; Membros mostra "Nível N" (para quem é katequista).
- Dá para testar o SQL localmente: este ambiente tem PostgreSQL 16 (ver como foi feito no supabase-14:
  um banco de teste com `auth.uid()` lendo `current_setting('teste.uid')`).

## Sorteios

- Katequista cria (título, imagem opcional, itens um por linha, "não repetir", "visitantes podem ver").
- Só quem criou (ou admin) sorteia; o item é escolhido no banco (`sortear`) e vai para o histórico.
- Animação: roleta de 3 linhas que desacelera e para no resultado; "Rever animação" repete sem sortear.
- Link direto: `sorteios.html#ID` abre a janela do sorteio.

## Cargos ao lado do nome (hierarquia, supabase-17)

- `tags.ordem` = hierarquia (menor = mais alto). Padrão: Presidente 10, Deputado 20, outras ~100–500, Katequista 900,
  Visitante 950. Admin não é tag e fica sempre no topo. O admin muda a ordem em Admin → Tags (setas ↑↓, `ordenar_tags`).
- `cargosPorPerfil` guarda TODAS as tags (para `temCargo`); `cargosVisiveis` (dados.js) mostra só a mais alta;
  admin mostra "Admin" + a próxima (sem Katequista/Visitante). As outras ficam em Membros/Perfil.
- Admin (admin.html) agora tem sub-abas (`abrirSecao`); a barra Salvar só aparece em Frases.

## Leis e Câmara (dentro de Política; código em leis.js, supabase-17)

- politica.html tem sub-abas: Governo (presidente, deputados e a eleição no fim; candidatos só aparecem
  enquanto a eleição não terminou), Leis em vigor (todos), Câmara (katequistas), Gestão (Presidente ou admin).
  leis.js exporta `iniciarLeis(eu)`. leis.html só redireciona para politica.html#vigor.
- Presidente/admin `propor_lei(tipo criar|alterar|revogar, id_lei, titulo, texto, justificativa, horas)`.
- Só deputados votam (`votar_camara`, voto secreto; contagem só depois de encerrar). Encerra no prazo ou quando
  todos os deputados votarem. Sim > não aprova (já vale), não > sim rejeita, empate → Presidente/admin pode
  `levar_ao_voto_popular(pid, horas)` (katequistas votam, `votar_popular`; empate no popular = rejeitada) ou `arquivar_proposta`.
- Sem cron: `propostas_situacao()` apura as vencidas sempre que a página abre ou alguém vota.
- Cassino: espera entre apostas por jogo em `config.cassinoEspera` (segundos; padrão 4/8/4), editável em Economia → Admin;
  última aposta em `ultimas_apostas`.

## Política

- Eleições do grupo (estilo presidencial), a cada 6 meses, num site de votação feito por um amigo.
- Aba Política: cartão da eleição (em breve / aberta / encerrada, com contagem), presidente com foto
  e 4 vagas de deputado. O botão para o site da votação só aparece para Katequistas.
- Eleição 2026 (24/10): presidente eleito Bruno Capoani (PNK · Partido Nacional da Katequese), mandato desde 24/10/2026.
  Deputados: Kayo (PRA), Anderson (PC), João Pedro (PNK) e Tiago (PC). Fotos ainda não enviadas (Admin → Política).
  As tags Presidente/Deputado o Kayo dá quando cada um se cadastrar (Admin → Tags).
- Visitantes veem: políticos atuais, partidos e o tempo até a próxima eleição. Candidatos, propostas e link: só Katequistas.
- O admin edita tudo em Admin → Política (nomes, fotos na pasta `politica/`, datas e link).
- Site da votação (do amigo): https://votacoes-katequese.netlify.app/ — "JEK, Justiça Eleitoral Katequista".
  Tem um endereço com os dados em JSON: `/.netlify/functions/public` (config com datas, comparecimento,
  presidentes, deputados). Ele NÃO libera CORS, então o site da Katequese não consegue ler isso direto
  do navegador; os candidatos foram copiados para `politica_eleicao`. As fotos dos candidatos são
  carregadas do site da votação (algumas são uma imagem com várias pessoas lado a lado, por isso
  `tamanho`/`posicao`), e por isso os candidatos só aparecem para Katequistas (não vazar o endereço).
- Eleição 2026 (1º turno): abre sáb 24/10 15:00, fecha dom 25/10 17:00. Chapas: 10 PRA (Pietro Spielmann),
  38 PC (Pedro Galli, presidente atual, tenta reeleição), 45 PNK (Bruno Capoani). 6 candidatos a deputado,
  4 eleitos. Pode ter 2º turno para presidente.

## O que ficou para depois

- Sistema de **visitantes** foi feito com tags; o Kayo ainda vai apresentar ideias de contagem de visitantes
  (hoje o contador "visitantes" da página inicial conta os aprovados sem a tag Katequista).
- **Publicar o site** (GitHub Pages/Netlify) e talvez virar **PWA** (app instalável no celular).
- Testar a visão de visitante com uma conta real quando o primeiro amigo se cadastrar.

## Para continuar num chat novo

- Anexe este CLAUDE.md (ou conecte a pasta Documentos/Katequese) e diga o que quer mudar.
- Fluxo de publicar: editar na pasta → testar com `python3 -m http.server 5173` (abrir `http://localhost:5173`,
  com http, e Cmd+Shift+R para fugir do cache) → GitHub Desktop: Commit → Push → Netlify publica sozinho.
  Netlify grátis: 300 créditos/mês, cada publicação gasta 15 → juntar mudanças antes do Push.
- SQL novo: rodar no SQL Editor do Supabase ANTES ou junto do Push. Já rodados: até supabase-17.sql (falta rodar o `supabase-18.sql`).
- Repositório GitHub privado "Katequese" (GitHub Desktop). Amigos podem virar colaboradores (Settings → Collaborators).
- Ideia em aberto: juntar o site de votação e a rede social do amigo neste site (base: este repositório,
  mantendo Supabase e login).
