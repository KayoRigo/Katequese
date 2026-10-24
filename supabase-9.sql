-- =====================================================================
-- supabase-9.sql — atualização: CONFIRMAR PRESENÇA nos eventos.
--
--   - Cada pessoa responde "Vou", "Talvez" ou "Não vou" em cada evento.
--   - Quem pode VER as respostas: quem pode ver o evento
--     (visitantes só nos eventos liberados para visitantes).
--   - Quem pode RESPONDER: só Katequistas, e só a própria resposta,
--     e só enquanto o evento não passou.
--
-- (Os aniversários não precisam de nada novo: a coluna "aniversario"
--  já existe na tabela perfis desde o supabase.sql.)
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Pode rodar mais de uma vez.
-- =====================================================================

create table if not exists public.presencas (
  evento_id      bigint not null references public.eventos(id) on delete cascade,
  perfil_id      uuid   not null default auth.uid() references public.perfis(id) on delete cascade,
  resposta       text   not null check (resposta in ('vou', 'talvez', 'nao')),
  atualizado_em  timestamptz not null default now(),
  primary key (evento_id, perfil_id)   -- uma resposta por pessoa em cada evento
);

alter table public.presencas enable row level security;

-- O evento ainda não passou? (usa o dia de hoje no horário de Brasília)
create or replace function public.evento_aberto(id_evento bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from eventos
     where id = id_evento
       and data >= (now() at time zone 'America/Sao_Paulo')::date
  );
$$;

-- Ver: só as respostas de eventos que a pessoa consegue ver.
-- (A consulta em "eventos" já respeita as regras dos eventos, então
--  visitantes só enxergam as respostas dos eventos liberados para eles.)
drop policy if exists "ver presencas" on public.presencas;
create policy "ver presencas" on public.presencas
  for select to authenticated
  using (exists (select 1 from public.eventos e where e.id = evento_id));

-- Responder, mudar ou tirar a resposta: só a própria, só katequista, só evento que não passou
drop policy if exists "responder presenca" on public.presencas;
create policy "responder presenca" on public.presencas
  for insert to authenticated
  with check (perfil_id = auth.uid() and public.eh_katequista() and public.evento_aberto(evento_id));

drop policy if exists "mudar presenca" on public.presencas;
create policy "mudar presenca" on public.presencas
  for update to authenticated
  using (perfil_id = auth.uid() and public.eh_katequista() and public.evento_aberto(evento_id))
  with check (perfil_id = auth.uid());

drop policy if exists "tirar presenca" on public.presencas;
create policy "tirar presenca" on public.presencas
  for delete to authenticated
  using (perfil_id = auth.uid() and public.evento_aberto(evento_id));
