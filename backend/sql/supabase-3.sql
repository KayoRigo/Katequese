-- =====================================================================
-- supabase-3.sql — atualização: medidor de uso no Admin e site só com fotos.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase.sql e do supabase-2.sql já executados antes.
-- Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) USO DO ESPAÇO: quanto o banco e os arquivos estão ocupando.
-- Só administradores recebem a resposta (para os outros, volta vazio).
-- ---------------------------------------------------------------------
create or replace function public.uso_do_espaco() returns json
language sql stable security definer set search_path = public, storage as $$
  select case when eh_admin() then json_build_object(
    'banco',        pg_database_size(current_database()),
    'arquivos',     coalesce((select sum((metadata->>'size')::bigint)
                              from storage.objects where bucket_id = 'arquivos'), 0),
    'qtd_arquivos', (select count(*) from storage.objects where bucket_id = 'arquivos')
  ) end;
$$;


-- ---------------------------------------------------------------------
-- 2) SÓ IMAGENS: o próprio Supabase passa a recusar qualquer arquivo que
-- não seja imagem, e cada imagem pode ter no máximo 10 MB.
-- (O site já diminui as fotos antes de enviar, então elas ficam bem menores.)
-- ---------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['image/*'],
       file_size_limit = 10485760
 where id = 'arquivos';

alter table public.midias drop constraint if exists midias_so_fotos;
alter table public.midias add constraint midias_so_fotos check (tipo = 'foto');
