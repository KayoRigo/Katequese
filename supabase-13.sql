-- =====================================================================
-- supabase-13.sql — atualização: ABA ATUALIZAÇÕES (registro de mudanças do site).
--
--   - Cada mudança no site vira uma linha: quem fez, o que mudou, tipo e quando.
--   - Katequistas leem. Só admins escrevem, editam e apagam.
--   - "autor_nome" guarda o nome mesmo de quem ainda não tem conta (ex: um amigo
--     que mexeu no código); "autor_id" liga à conta, quando tiver.
--   - "origem": 'site' (escrito no site) ou 'github' (automático, no futuro).
--   - Já vem com o histórico de tudo o que foi feito até agora.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Pode rodar mais de uma vez (o histórico só é inserido se a tabela estiver vazia).
-- =====================================================================

create table if not exists public.atualizacoes (
  id          bigint generated always as identity primary key,
  autor_id    uuid references public.perfis(id) on delete set null,
  autor_nome  text not null check (char_length(autor_nome) between 1 and 60),
  titulo      text not null check (char_length(titulo) between 1 and 120),
  descricao   text not null default '' check (char_length(descricao) <= 2000),
  tipo        text not null default 'melhoria' check (tipo in ('nova', 'melhoria', 'correcao', 'banco')),
  origem      text not null default 'site' check (origem in ('site', 'github')),
  criado_em   timestamptz not null default now()
);

alter table public.atualizacoes enable row level security;

drop policy if exists "katequistas leem atualizacoes" on public.atualizacoes;
create policy "katequistas leem atualizacoes" on public.atualizacoes
  for select using (eh_katequista());

drop policy if exists "admin escreve atualizacoes" on public.atualizacoes;
create policy "admin escreve atualizacoes" on public.atualizacoes
  for all using (eh_admin()) with check (eh_admin());

-- Histórico até agora (só entra se a tabela estiver vazia, para não duplicar)
insert into public.atualizacoes (criado_em, tipo, titulo, descricao, autor_nome, autor_id)
select v.criado_em::timestamptz, v.tipo, v.titulo, v.descricao, 'Kayo',
       (select id from public.perfis where usuario = 'kayo')
  from (values
  ('2026-10-23 09:44:00-03', 'nova', 'Primeira versão do site', 'Base do site com áreas de fotos, eventos, política do grupo e chat.'),
  ('2026-10-23 09:59:00-03', 'nova', 'Página inicial e abas separadas', 'Página inicial com o nome do grupo; cada aba passou a ser uma página própria.'),
  ('2026-10-23 10:15:00-03', 'melhoria', 'Nome do grupo em destaque e nova paleta', 'O nome da Katequese ficou grande no meio da primeira tela; nova paleta de cores.'),
  ('2026-10-23 10:27:00-03', 'melhoria', 'Página inicial mais completa', 'Faixa, acesso rápido, próximo encontro, frase do dia e os segredos escondidos no nome.'),
  ('2026-10-23 10:52:00-03', 'nova', 'Painel de administrador', 'Admin passa a editar frases e números sem mexer no código. A aba de chat foi removida.'),
  ('2026-10-23 11:05:00-03', 'banco', 'Banco de dados e login', 'Supabase com login; quem não for membro não vê nada do site.'),
  ('2026-10-23 11:43:00-03', 'melhoria', 'Tela de cadastro reformulada', 'Botão "Cadastrar-se" e campos mais claros (@usuario e Seu nome).'),
  ('2026-10-23 11:54:00-03', 'melhoria', 'Visual sem "cara de IA"', 'Textos neutros e diretos e um visual mais de site, sem enfeites desnecessários.'),
  ('2026-10-23 13:19:00-03', 'melhoria', 'Fonte do nome e paletas de cores', 'Nome da Katequese com a fonte Coustard Black; cada pessoa escolhe a paleta de cores do site.'),
  ('2026-10-23 14:28:00-03', 'nova', 'Uso do espaço e contadores', 'Admin mostra o uso do espaço do plano grátis; o site aceita só imagens; contadores de membros, visitantes e eventos na página inicial.'),
  ('2026-10-23 14:45:00-03', 'melhoria', 'Nova ordem das abas e permissões de admin', 'Aba Admin só para administradores e opção de tornar alguém admin.'),
  ('2026-10-23 15:13:00-03', 'nova', 'Katequistas e Visitantes', 'Sistema de tags: Katequistas têm acesso completo; Visitantes só veem o que for liberado para eles.'),
  ('2026-10-23 15:23:00-03', 'melhoria', 'Visitantes trocam a foto de perfil', ''),
  ('2026-10-23 15:30:00-03', 'correcao', 'Tags: apagar e menu reorganizado', 'O botão de apagar tag voltou a funcionar e o menu de tags ficou mais claro.'),
  ('2026-10-23 15:37:00-03', 'nova', 'Aba Enquetes', 'No lugar de Regras. Duração, imagem, várias opções, voto anônimo e opção para visitantes.'),
  ('2026-10-23 15:53:00-03', 'nova', 'Tema do site para todos', 'Admin escolhe um tema que vale para todo mundo. Primeiro tema: Halloween.'),
  ('2026-10-23 16:06:00-03', 'melhoria', 'Tema de Halloween incrementado', 'Mais velas, morcegos, doces, lua, caldeirão e título decorado.'),
  ('2026-10-23 20:37:00-03', 'melhoria', 'Título de cera e morcegos novos', 'Letras de cera derretendo com gotas corrigidas; morcegos com desenho novo e voo natural.'),
  ('2026-10-23 22:16:00-03', 'nova', 'Aba Política', 'Presidente atual, 4 vagas de deputado e cartão da eleição com contagem.'),
  ('2026-10-23 22:28:00-03', 'nova', 'Candidatos da eleição 2026', '3 chapas, 6 candidatos a deputado, propostas e link do site da votação — só para Katequistas.'),
  ('2026-10-23 22:40:00-03', 'melhoria', 'Partidos dos políticos atuais', 'Visitantes veem os políticos atuais, os partidos e o tempo até a próxima eleição.'),
  ('2026-10-23 23:26:00-03', 'nova', 'Presença nos eventos e aniversários', 'Vou / Talvez / Não vou em cada evento; aniversários na página inicial e em Membros.'),
  ('2026-10-23 23:37:00-03', 'melhoria', 'Contador de visitantes e abas em Membros', 'Membros separado em Katequistas e Visitantes.'),
  ('2026-10-23 23:40:00-03', 'melhoria', 'Cadastro sem aprovação', 'Quem se cadastra já entra como visitante; acesso completo só com a tag Katequista.'),
  ('2026-10-24 09:45:00-03', 'nova', 'Menu reorganizado e aba Sorteios', 'Botão "Mais" com as abas em grupos. Sorteios com roleta, resultado escolhido pelo banco e histórico.'),
  ('2026-10-24 10:00:00-03', 'nova', 'Aba Mural', 'Recados e anúncios oficiais. Novas tags Presidente e Deputado.'),
  ('2026-10-24 10:05:00-03', 'melhoria', 'Recados só para Katequistas', 'Visitantes leem os recados liberados, mas não publicam.'),
  ('2026-10-24 10:12:00-03', 'melhoria', 'Ajustes no Mural e cargos destacados', 'Anúncios antes dos recados; mural mais abaixo na página inicial, sem campo de escrever; cargos com destaque de marca-texto ao lado do nome.'),
  ('2026-10-24 10:19:00-03', 'melhoria', 'Destaque do cargo na palavra inteira', ''),
  ('2026-10-24 10:24:00-03', 'nova', 'Aba Atualizações', 'Registro de tudo o que muda no site: quem fez, o quê, quando.')
  ) as v(criado_em, tipo, titulo, descricao)
 where not exists (select 1 from public.atualizacoes);
