-- =====================================================================
-- supabase-12.sql — atualização: MURAL (recados + anúncios oficiais).
--
-- RECADOS
--   - Só KATEQUISTAS escrevem recados (visitantes só leem).
--   - Katequistas veem todos. Quem escreve escolhe se visitantes podem ver.
--   - Admin pode fixar um recado no topo. Quem escreveu (ou admin) apaga.
--
-- ANÚNCIOS OFICIAIS
--   - Só quem tem a tag PRESIDENTE ou DEPUTADO, ou é admin, publica.
--   - PRIORIDADE (fica no topo, em destaque, e aparece na página inicial):
--     só o Presidente e os admins podem marcar.
--   - Quem publica escolhe se visitantes podem ver.
--
-- TAGS NOVAS DO SISTEMA: "Presidente" e "Deputado" (o admin dá em Admin → Tags).
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) TAGS "Presidente" e "Deputado" (do sistema: não apagam nem renomeiam)
-- ---------------------------------------------------------------------
insert into public.tags (nome, cor, sistema) values ('Presidente', '#d4a72c', true)
on conflict (nome) do update set sistema = true;
insert into public.tags (nome, cor, sistema) values ('Deputado', '#4a8fd4', true)
on conflict (nome) do update set sistema = true;

-- Quem está logado tem esta tag do sistema?
create or replace function public.tem_tag(nome_tag text) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_aprovado() and exists (
    select 1 from perfil_tags pt join tags t on t.id = pt.tag_id
     where pt.perfil_id = auth.uid() and t.nome = nome_tag and t.sistema);
$$;

-- Pode publicar anúncio? Admin, Presidente ou Deputado.
create or replace function public.pode_anunciar() returns boolean
language sql stable security definer set search_path = public as $$
  select eh_admin() or tem_tag('Presidente') or tem_tag('Deputado');
$$;

-- Pode marcar anúncio como prioridade? Admin ou Presidente.
create or replace function public.pode_priorizar() returns boolean
language sql stable security definer set search_path = public as $$
  select eh_admin() or tem_tag('Presidente');
$$;


-- ---------------------------------------------------------------------
-- 2) RECADOS (a tabela já existia desde o supabase.sql; aqui ela ganha
--    a opção de visitantes e textos maiores)
-- ---------------------------------------------------------------------
alter table public.recados add column if not exists visivel_visitantes boolean not null default false;
alter table public.recados drop constraint if exists recados_texto_check;
alter table public.recados add constraint recados_texto_check check (char_length(texto) between 1 and 1000);

drop policy if exists "membros leem recados" on public.recados;
create policy "membros leem recados" on public.recados
  for select using (
    eh_katequista() or (eh_aprovado() and visivel_visitantes));

drop policy if exists "membros postam recados" on public.recados;
create policy "membros postam recados" on public.recados
  for insert with check (eh_katequista() and autor_id = auth.uid() and fixado = false);

-- (as regras "admin fixa recados" e "apagar o proprio recado ou admin" do supabase.sql continuam valendo)


-- ---------------------------------------------------------------------
-- 3) ANÚNCIOS OFICIAIS
-- ---------------------------------------------------------------------
create table if not exists public.anuncios (
  id                  bigint generated always as identity primary key,
  autor_id            uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  titulo              text not null check (char_length(titulo) between 1 and 100),
  texto               text not null check (char_length(texto) between 1 and 2000),
  prioridade          boolean not null default false,
  visivel_visitantes  boolean not null default false,
  criado_em           timestamptz not null default now()
);

alter table public.anuncios enable row level security;

drop policy if exists "ver anuncios" on public.anuncios;
create policy "ver anuncios" on public.anuncios
  for select using (eh_katequista() or (eh_aprovado() and visivel_visitantes));

drop policy if exists "publicar anuncio" on public.anuncios;
create policy "publicar anuncio" on public.anuncios
  for insert with check (
    pode_anunciar() and autor_id = auth.uid()
    and (not prioridade or pode_priorizar()));   -- prioridade só Presidente/admin

-- Tirar ou pôr prioridade depois: Presidente ou admin
drop policy if exists "mudar prioridade" on public.anuncios;
create policy "mudar prioridade" on public.anuncios
  for update using (pode_priorizar()) with check (pode_priorizar());

drop policy if exists "apagar anuncio" on public.anuncios;
create policy "apagar anuncio" on public.anuncios
  for delete using (eh_aprovado() and (autor_id = auth.uid() or eh_admin()));
