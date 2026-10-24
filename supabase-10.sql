-- =====================================================================
-- supabase-10.sql — atualização: SEM APROVAÇÃO para entrar.
--
--   - Quem se cadastra já entra no site como VISITANTE (acesso limitado).
--   - Só quem o admin der a tag KATEQUISTA tem acesso completo.
--   - "Bloquear" no Admin continua existindo: quem for bloqueado não vê nada.
--   - Quem estava "pendente" vira visitante agora.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase-4.sql já executado. Pode rodar mais de uma vez.
-- =====================================================================

-- Novo cadastro: já nasce aprovado (visitante). O primeiro "kayo" continua virando admin.
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u text := lower(coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email, '@', 1)));
  primeiro_admin boolean := u = 'kayo' and not exists (select 1 from perfis where admin);
begin
  insert into perfis (id, usuario, nome, status, admin)
  values (
    new.id,
    u,
    coalesce(nullif(new.raw_user_meta_data->>'nome', ''), u),
    'aprovado',
    primeiro_admin
  );

  -- Tag automática: admin vira Katequista; o resto, Visitante
  insert into perfil_tags (perfil_id, tag_id)
  values (new.id, id_tag(case when primeiro_admin then 'Katequista' else 'Visitante' end))
  on conflict do nothing;

  return new;
end;
$$;

-- Quem estava esperando aprovação entra agora como visitante
-- (o gatilho "ao_aprovar" do supabase-4.sql dá a tag Visitante sozinho)
update public.perfis set status = 'aprovado' where status = 'pendente';
