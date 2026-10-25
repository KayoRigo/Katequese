-- =====================================================================
-- supabase-6.sql — atualização: aba POLÍTICA.
--
--   - Presidente atual e 4 vagas de deputado (com nome e foto).
--   - Datas da eleição (abre / fecha). As eleições acontecem a cada 6 meses.
--   - O LINK do site de votação fica numa tabela separada que SÓ
--     KATEQUISTAS conseguem ler. Visitantes nem recebem o link do banco.
--   - Só o admin altera tudo isso (pela página Admin → Política).
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa dos arquivos supabase.sql até o -5 já executados. Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) TABELAS (cada uma tem uma linha só, com id = 1)
-- ---------------------------------------------------------------------
create table if not exists public.politica (
  id               int primary key default 1 check (id = 1),
  presidente_nome  text not null default '' check (char_length(presidente_nome) <= 60),
  presidente_foto  text,                                 -- caminho no balde "arquivos"
  mandato_desde    date,                                 -- desde quando está no cargo
  -- Lista com até 4 deputados: [{ "nome": "...", "foto": "caminho ou null" }, ...]
  deputados        jsonb not null default '[]'::jsonb check (jsonb_typeof(deputados) = 'array' and jsonb_array_length(deputados) <= 4),
  eleicao_abre     timestamptz,
  eleicao_fecha    timestamptz,
  check (eleicao_abre is null or eleicao_fecha is null or eleicao_fecha > eleicao_abre)
);

create table if not exists public.politica_link (
  id    int primary key default 1 check (id = 1),
  link  text not null default '' check (link = '' or link ~* '^https?://')  -- só aceita endereço de site
);


-- ---------------------------------------------------------------------
-- 2) REGRAS DE ACESSO
-- ---------------------------------------------------------------------
alter table public.politica enable row level security;
alter table public.politica_link enable row level security;

-- Presidente, deputados e datas: qualquer pessoa aprovada vê (visitantes também)
drop policy if exists "aprovados veem politica" on public.politica;
create policy "aprovados veem politica" on public.politica
  for select to authenticated using (public.eh_aprovado());

drop policy if exists "admin altera politica" on public.politica;
create policy "admin altera politica" on public.politica
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- O link da votação: SÓ katequistas veem
drop policy if exists "katequistas veem link" on public.politica_link;
create policy "katequistas veem link" on public.politica_link
  for select to authenticated using (public.eh_katequista());

drop policy if exists "admin altera link" on public.politica_link;
create policy "admin altera link" on public.politica_link
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());


-- ---------------------------------------------------------------------
-- 3) DADOS INICIAIS
-- "on conflict do nothing": se já existir, não apaga o que o admin mudou.
-- Votação: abre sábado 24/10/2026 e fecha domingo 25/10/2026 às 17:00 (horário de Brasília).
-- ---------------------------------------------------------------------
insert into public.politica (id, presidente_nome, eleicao_abre, eleicao_fecha)
values (1, 'Pedro Henrique Galli', '2026-10-24 00:00:00-03', '2026-10-25 17:00:00-03')
on conflict (id) do nothing;

insert into public.politica_link (id, link) values (1, '')
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 4) FOTOS: as fotos da pasta "politica/" aparecem para todos os aprovados
-- (mesma função do supabase-5.sql, com uma linha a mais)
-- ---------------------------------------------------------------------
create or replace function public.pode_ver_arquivo(caminho text) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_katequista() or (eh_aprovado() and (
       caminho like 'perfis/%'
    or caminho like 'semana/%'
    or caminho like 'politica/%'
    or exists (select 1 from midias   where path      = caminho and visivel_visitantes)
    or exists (select 1 from eventos  where foto_path = caminho and visivel_visitantes)
    or exists (select 1 from enquetes where foto_path = caminho and visivel_visitantes)
  ));
$$;
