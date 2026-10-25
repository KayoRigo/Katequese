-- =====================================================================
-- supabase-7.sql — atualização: CANDIDATOS da eleição na aba Política.
--
--   - Chapas (número, partido, presidente, slogan, propostas) e os
--     candidatos a deputado de cada chapa, copiados do site da votação.
--   - SÓ KATEQUISTAS leem (as fotos vêm do site da votação, então
--     mostrar para visitantes revelaria o endereço do site).
--   - Só o admin altera.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase-6.sql já executado. Pode rodar mais de uma vez.
-- =====================================================================

create table if not exists public.politica_eleicao (
  id     int primary key default 1 check (id = 1),
  dados  jsonb not null default '{}'::jsonb   -- { turno, vagas, chapas: [...] }
);

alter table public.politica_eleicao enable row level security;

drop policy if exists "katequistas veem candidatos" on public.politica_eleicao;
create policy "katequistas veem candidatos" on public.politica_eleicao
  for select to authenticated using (public.eh_katequista());

drop policy if exists "admin altera candidatos" on public.politica_eleicao;
create policy "admin altera candidatos" on public.politica_eleicao
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- Linha vazia; os candidatos são preenchidos pelo site (Admin)
insert into public.politica_eleicao (id) values (1)
on conflict (id) do nothing;
