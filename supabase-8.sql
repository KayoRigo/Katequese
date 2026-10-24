-- =====================================================================
-- supabase-8.sql — atualização: PARTIDO do presidente atual.
-- (O partido de cada deputado fica junto com o nome dele, na lista "deputados".)
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase-6.sql já executado. Pode rodar mais de uma vez.
-- =====================================================================

alter table public.politica
  add column if not exists presidente_partido text not null default ''
  check (char_length(presidente_partido) <= 60);

-- O presidente atual é do PC (só preenche se ainda estiver vazio)
update public.politica
   set presidente_partido = 'PC · Partido Cuiudo'
 where id = 1 and presidente_partido = '';
