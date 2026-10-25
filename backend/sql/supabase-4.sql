-- =====================================================================
-- supabase-4.sql — atualização: Katequistas e Visitantes.
--
--   Katequista = membro oficial: vê tudo, cria eventos e posta fotos.
--   Visitante  = cadastro aprovado, mas só VÊ o que os katequistas
--                marcaram como "visível para visitantes". Não cria nada.
--
-- Quem decide é a TAG: só quem tem a tag "Katequista" (dada por um admin)
-- tem o acesso completo. Administradores sempre têm o acesso completo.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa dos arquivos supabase.sql, -2 e -3 já executados. Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) TAGS DO SISTEMA: "Katequista" e "Visitante" não podem ser apagadas
-- nem renomeadas (o site depende delas). A cor pode mudar à vontade.
-- ---------------------------------------------------------------------
alter table public.tags add column if not exists sistema boolean not null default false;

insert into public.tags (nome, cor, sistema) values ('Katequista', '#f26b3a', true)
on conflict (nome) do update set sistema = true;
insert into public.tags (nome, cor, sistema) values ('Visitante', '#9a9ca3', true)
on conflict (nome) do update set sistema = true;

create or replace function public.proteger_tag_sistema() returns trigger
language plpgsql as $$
begin
  if old.sistema and (new.nome <> old.nome or not new.sistema) then
    raise exception 'A tag "%" é do sistema e não pode ser renomeada.', old.nome;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_tag on public.tags;
create trigger proteger_tag before update on public.tags
  for each row execute function public.proteger_tag_sistema();

drop policy if exists "admin gerencia tags" on public.tags;
drop policy if exists "admin cria tags" on public.tags;
create policy "admin cria tags" on public.tags
  for insert with check (eh_admin() and not sistema);
drop policy if exists "admin edita tags" on public.tags;
create policy "admin edita tags" on public.tags
  for update using (eh_admin());
drop policy if exists "admin apaga tags" on public.tags;
create policy "admin apaga tags" on public.tags
  for delete using (eh_admin() and not sistema);


-- ---------------------------------------------------------------------
-- 2) QUEM É KATEQUISTA: aprovado E (tem a tag "Katequista" OU é admin)
-- ---------------------------------------------------------------------
create or replace function public.eh_katequista() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfis p
     where p.id = auth.uid()
       and p.status = 'aprovado'
       and (p.admin or exists (
             select 1 from perfil_tags pt join tags t on t.id = pt.tag_id
              where pt.perfil_id = p.id and t.nome = 'Katequista' and t.sistema))
  );
$$;


-- ---------------------------------------------------------------------
-- 3) "Katequista" e "Visitante" andam juntas, automaticamente:
--    - ganhou Katequista  → perde Visitante
--    - perdeu Katequista  → volta a ser Visitante
--    - foi aprovado sem Katequista → vira Visitante
-- ---------------------------------------------------------------------
create or replace function public.id_tag(nome_tag text) returns bigint
language sql stable security definer set search_path = public as $$
  select id from tags where nome = nome_tag and sistema;
$$;

-- Antes de inserir: não deixa dar "Visitante" para quem já é Katequista
create or replace function public.antes_de_dar_tag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tag_id = id_tag('Visitante') and exists (
       select 1 from perfil_tags where perfil_id = new.perfil_id and tag_id = id_tag('Katequista')) then
    return null; -- simplesmente ignora
  end if;
  return new;
end;
$$;

create or replace function public.depois_de_dar_tag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tag_id = id_tag('Katequista') then
    delete from perfil_tags where perfil_id = new.perfil_id and tag_id = id_tag('Visitante');
  end if;
  return null;
end;
$$;

create or replace function public.depois_de_tirar_tag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.tag_id = id_tag('Katequista')
     and exists (select 1 from perfis where id = old.perfil_id and status = 'aprovado') then
    insert into perfil_tags (perfil_id, tag_id) values (old.perfil_id, id_tag('Visitante'))
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists antes_de_dar on public.perfil_tags;
create trigger antes_de_dar before insert on public.perfil_tags
  for each row execute function public.antes_de_dar_tag();
drop trigger if exists depois_de_dar on public.perfil_tags;
create trigger depois_de_dar after insert on public.perfil_tags
  for each row execute function public.depois_de_dar_tag();
drop trigger if exists depois_de_tirar on public.perfil_tags;
create trigger depois_de_tirar after delete on public.perfil_tags
  for each row execute function public.depois_de_tirar_tag();

-- Quando alguém é aprovado e ainda não é Katequista, vira Visitante.
-- Quando alguém vira admin, ganha a tag Katequista (admin sempre tem acesso completo).
create or replace function public.ao_aprovar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    insert into perfil_tags (perfil_id, tag_id) values (new.id, id_tag('Visitante'))
    on conflict do nothing;  -- o "antes_de_dar" ignora se ele já for Katequista
  end if;
  if new.admin and not old.admin then
    insert into perfil_tags (perfil_id, tag_id) values (new.id, id_tag('Katequista'))
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists ao_aprovar on public.perfis;
create trigger ao_aprovar after update on public.perfis
  for each row execute function public.ao_aprovar();


-- ---------------------------------------------------------------------
-- 4) QUEM JÁ ESTÁ NO SITE: admins viram Katequista; o resto, Visitante
-- ---------------------------------------------------------------------
insert into perfil_tags (perfil_id, tag_id)
  select id, id_tag('Katequista') from perfis where status = 'aprovado' and admin
on conflict do nothing;
insert into perfil_tags (perfil_id, tag_id)
  select id, id_tag('Visitante') from perfis where status = 'aprovado' and not admin
on conflict do nothing;


-- ---------------------------------------------------------------------
-- 5) EVENTOS E FOTOS: cada um escolhe se visitantes podem ver
-- ---------------------------------------------------------------------
alter table public.eventos add column if not exists visivel_visitantes boolean not null default false;
alter table public.midias  add column if not exists visivel_visitantes boolean not null default false;

-- Eventos
drop policy if exists "membros veem eventos" on public.eventos;
create policy "membros veem eventos" on public.eventos
  for select using (eh_katequista() or (eh_aprovado() and visivel_visitantes));

drop policy if exists "membros criam eventos" on public.eventos;
create policy "membros criam eventos" on public.eventos
  for insert with check (eh_katequista() and autor_id = auth.uid());

drop policy if exists "autor ou admin edita evento" on public.eventos;
create policy "autor ou admin edita evento" on public.eventos
  for update using (eh_katequista() and (autor_id = auth.uid() or eh_admin()));

drop policy if exists "autor ou admin apaga evento" on public.eventos;
create policy "autor ou admin apaga evento" on public.eventos
  for delete using (eh_katequista() and (autor_id = auth.uid() or eh_admin()));

-- Fotos
drop policy if exists "membros veem midias" on public.midias;
create policy "membros veem midias" on public.midias
  for select using (eh_katequista() or (eh_aprovado() and visivel_visitantes));

drop policy if exists "membros enviam midias" on public.midias;
create policy "membros enviam midias" on public.midias
  for insert with check (eh_katequista() and autor_id = auth.uid());

drop policy if exists "autor ou admin apaga midia" on public.midias;
create policy "autor ou admin apaga midia" on public.midias
  for delete using (eh_katequista() and (autor_id = auth.uid() or eh_admin()));


-- ---------------------------------------------------------------------
-- 6) ARQUIVOS: visitante só abre a imagem se ela estiver liberada
-- (fotos de perfil e do membro da semana todo aprovado pode ver)
-- ---------------------------------------------------------------------
create or replace function public.pode_ver_arquivo(caminho text) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_katequista() or (eh_aprovado() and (
       caminho like 'perfis/%'
    or caminho like 'semana/%'
    or exists (select 1 from midias  where path      = caminho and visivel_visitantes)
    or exists (select 1 from eventos where foto_path = caminho and visivel_visitantes)
  ));
$$;

drop policy if exists "katequese: membros veem arquivos" on storage.objects;
create policy "katequese: membros veem arquivos" on storage.objects
  for select to authenticated
  using (bucket_id = 'arquivos' and public.pode_ver_arquivo(name));

-- Katequistas enviam qualquer arquivo. Visitantes só podem enviar a PRÓPRIA
-- foto de perfil (na pasta perfis/<id-dele>/), nada mais.
drop policy if exists "katequese: membros enviam arquivos" on storage.objects;
create policy "katequese: membros enviam arquivos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'arquivos' and (
    public.eh_katequista()
    or (public.eh_aprovado() and name like 'perfis/' || auth.uid()::text || '/%')
  ));
