-- =====================================================================
-- supabase-2.sql — atualização: eventos e mídias dos membros, fotos,
-- tags e membro da semana.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase.sql já executado antes. Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) FOTO DE PERFIL: guarda o caminho do arquivo no armazenamento
-- ---------------------------------------------------------------------
alter table public.perfis add column if not exists foto_path text;


-- ---------------------------------------------------------------------
-- 2) EVENTOS: agora qualquer membro aprovado pode criar
-- ---------------------------------------------------------------------
create table if not exists public.eventos (
  id         bigint generated always as identity primary key,
  autor_id   uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  titulo     text not null check (char_length(titulo) between 1 and 80),
  descricao  text not null default '' check (char_length(descricao) <= 500),
  local      text not null default '' check (char_length(local) <= 120),
  data       date not null,
  hora       time,
  foto_path  text,
  criado_em  timestamptz not null default now()
);

alter table public.eventos enable row level security;

drop policy if exists "membros veem eventos" on public.eventos;
create policy "membros veem eventos" on public.eventos
  for select using (eh_aprovado());

drop policy if exists "membros criam eventos" on public.eventos;
create policy "membros criam eventos" on public.eventos
  for insert with check (eh_aprovado() and autor_id = auth.uid());

drop policy if exists "autor ou admin edita evento" on public.eventos;
create policy "autor ou admin edita evento" on public.eventos
  for update using (eh_aprovado() and (autor_id = auth.uid() or eh_admin()));

drop policy if exists "autor ou admin apaga evento" on public.eventos;
create policy "autor ou admin apaga evento" on public.eventos
  for delete using (eh_aprovado() and (autor_id = auth.uid() or eh_admin()));


-- ---------------------------------------------------------------------
-- 3) MÍDIAS: fotos e vídeos enviados pelos membros
-- ---------------------------------------------------------------------
create table if not exists public.midias (
  id         bigint generated always as identity primary key,
  autor_id   uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  path       text not null,
  tipo       text not null check (tipo in ('foto', 'video')),
  titulo     text not null default '' check (char_length(titulo) <= 80),
  descricao  text not null default '' check (char_length(descricao) <= 300),
  criado_em  timestamptz not null default now()
);

alter table public.midias enable row level security;

drop policy if exists "membros veem midias" on public.midias;
create policy "membros veem midias" on public.midias
  for select using (eh_aprovado());

drop policy if exists "membros enviam midias" on public.midias;
create policy "membros enviam midias" on public.midias
  for insert with check (eh_aprovado() and autor_id = auth.uid());

drop policy if exists "autor ou admin apaga midia" on public.midias;
create policy "autor ou admin apaga midia" on public.midias
  for delete using (eh_aprovado() and (autor_id = auth.uid() or eh_admin()));


-- ---------------------------------------------------------------------
-- 4) TAGS (como os cargos do Discord): só admin cria e distribui
-- ---------------------------------------------------------------------
create table if not exists public.tags (
  id         bigint generated always as identity primary key,
  nome       text unique not null check (char_length(nome) between 1 and 30),
  cor        text not null check (cor ~ '^#[0-9a-fA-F]{6}$'),   -- ex: #f26b3a
  criado_em  timestamptz not null default now()
);

-- Qual membro tem qual tag (uma linha para cada par membro + tag)
create table if not exists public.perfil_tags (
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  tag_id     bigint not null references public.tags(id) on delete cascade,
  primary key (perfil_id, tag_id)
);

alter table public.tags enable row level security;
alter table public.perfil_tags enable row level security;

drop policy if exists "membros veem tags" on public.tags;
create policy "membros veem tags" on public.tags
  for select using (eh_aprovado());

drop policy if exists "admin gerencia tags" on public.tags;
create policy "admin gerencia tags" on public.tags
  for all using (eh_admin()) with check (eh_admin());

drop policy if exists "membros veem tags dos perfis" on public.perfil_tags;
create policy "membros veem tags dos perfis" on public.perfil_tags
  for select using (eh_aprovado());

drop policy if exists "admin distribui tags" on public.perfil_tags;
create policy "admin distribui tags" on public.perfil_tags
  for all using (eh_admin()) with check (eh_admin());


-- ---------------------------------------------------------------------
-- 5) ARMAZENAMENTO DE ARQUIVOS (fotos e vídeos)
-- O "balde" (bucket) é PRIVADO: só membros aprovados conseguem ver os
-- arquivos, e cada link gerado pelo site expira depois de 1 hora.
-- Limite de 50 MB por arquivo (o máximo do plano grátis).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('arquivos', 'arquivos', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "katequese: membros veem arquivos" on storage.objects;
create policy "katequese: membros veem arquivos" on storage.objects
  for select to authenticated
  using (bucket_id = 'arquivos' and public.eh_aprovado());

drop policy if exists "katequese: membros enviam arquivos" on storage.objects;
create policy "katequese: membros enviam arquivos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'arquivos' and public.eh_aprovado());

drop policy if exists "katequese: dono ou admin apaga arquivo" on storage.objects;
create policy "katequese: dono ou admin apaga arquivo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'arquivos' and public.eh_aprovado()
         and (owner_id = auth.uid()::text or public.eh_admin()));


-- ---------------------------------------------------------------------
-- 6) LIMPEZA: o "dias sem ninguém cair" e os eventos antigos da config
-- não são mais usados.
-- ---------------------------------------------------------------------
drop function if exists public.registrar_queda();
update public.config set dados = dados - 'eventos' - 'ultimaQueda' where id = 1;
