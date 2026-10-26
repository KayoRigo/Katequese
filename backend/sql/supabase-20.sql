-- =====================================================================
-- supabase-20.sql — atualização: DEPUTADOS PROPÕEM LEIS.
--
--   - Antes: só o Presidente (ou admin) podia propor, alterar e revogar leis.
--   - Agora: também os Deputados. Eles criam propostas de lei, que abrem
--     a votação na Câmara.
--   - Continua só com Presidente/admin: levar ao voto popular (empate)
--     e arquivar proposta.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase-19.sql já executado. Pode rodar mais de uma vez.
-- =====================================================================

create or replace function public.pode_propor_lei() returns boolean
language sql stable security definer set search_path = public as $$
  select eh_katequista() and (eh_admin() or tem_tag('Presidente') or tem_tag('Deputado'));
$$;

-- Registra a mudança na aba Atualizações
insert into public.atualizacoes (tipo, titulo, descricao, autor_nome, origem)
values ('melhoria', 'Deputados podem propor leis',
        'Deputados agora criam propostas de lei (aba Gestão). Levar ao voto popular e arquivar continuam só com o Presidente ou admin.',
        'Kayo', 'site');
