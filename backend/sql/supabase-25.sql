-- =====================================================================
-- supabase-25.sql — atualização: NOTIFICAÇÕES AUTOMÁTICAS + correção das fotos de Pagamentos.
--
--   1) Corrige "new row violates row-level security policy" ao criar conta em
--      Pagamentos: a pasta de fotos "pagamentos" não estava liberada no Storage.
--   2) Notificações automáticas (leis, enquetes, eventos, avisos, aniversários,
--      sorteios, pagamentos, Magnata, tags, novos membros e lembretes).
--      Cada membro escolhe no Perfil o que quer receber.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase-24.sql já executado. Pode rodar mais de uma vez.
-- Depois disso, siga o backend/funcoes/enviar-notificacao/LEIA-ME.md
-- (atualizar o código da função e desligar o "Verify JWT" dela).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Fotos de Pagamentos: libera a pasta "pagamentos" para katequistas
-- ---------------------------------------------------------------------
create or replace function public.pode_enviar_arquivo(caminho text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(caminho, '/', 2) = auth.uid()::text and (
       (eh_aprovado()   and split_part(caminho, '/', 1) = 'perfis')
    or (eh_katequista() and split_part(caminho, '/', 1) in ('perfis', 'eventos', 'midias', 'enquetes', 'sorteios', 'pagamentos'))
    or (eh_admin()      and split_part(caminho, '/', 1) in ('semana', 'politica', 'loja'))
  );
$$;


-- ---------------------------------------------------------------------
-- 2) Extensões que enviam e agendam (se já estiverem ligadas, nada muda)
-- ---------------------------------------------------------------------
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'Não consegui ligar o pg_net. Ligue em Database > Extensions e rode este arquivo de novo.';
end $$;
do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'Não consegui ligar o pg_cron. Ligue em Database > Extensions e rode este arquivo de novo.';
end $$;


-- ---------------------------------------------------------------------
-- 3) Preferências: o que cada pessoa NÃO quer receber (linha = desligado)
-- ---------------------------------------------------------------------
create table if not exists public.push_preferencias (
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  categoria  text not null check (categoria in
             ('leis', 'enquetes', 'eventos', 'avisos', 'aniversarios', 'sorteios', 'pagamentos', 'economia', 'conta')),
  primary key (perfil_id, categoria)
);
alter table public.push_preferencias enable row level security;
drop policy if exists "ver minhas preferencias push" on public.push_preferencias;
create policy "ver minhas preferencias push" on public.push_preferencias
  for select using (perfil_id = auth.uid());

create or replace function public.definir_preferencia_push(p_categoria text, p_ligado boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eh_aprovado() then raise exception 'Só membros aprovados.'; end if;
  if p_ligado then
    delete from public.push_preferencias where perfil_id = auth.uid() and categoria = p_categoria;
  else
    insert into public.push_preferencias (perfil_id, categoria) values (auth.uid(), p_categoria)
    on conflict do nothing;
  end if;
end $$;
revoke execute on function public.definir_preferencia_push(text, boolean) from public, anon;
grant execute on function public.definir_preferencia_push(text, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 4) Fila de notificações (uma linha por pessoa) e registro do que já foi avisado
-- ---------------------------------------------------------------------
create table if not exists public.fila_push (
  id          bigint generated always as identity primary key,
  perfil_id   uuid not null references public.perfis(id) on delete cascade,
  titulo      text not null,
  texto       text not null,
  url         text not null default '/paginas/index.html',
  criada_em   timestamptz not null default now(),
  enviada_em  timestamptz
);
create index if not exists fila_push_pendentes on public.fila_push (id) where enviada_em is null;
alter table public.fila_push enable row level security;   -- sem regras: só o banco e a função mexem

create table if not exists public.avisos_enviados (
  chave      text primary key,
  criado_em  timestamptz not null default now()
);
alter table public.avisos_enviados enable row level security;

create or replace function public.primeira_vez(p_chave text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into public.avisos_enviados (chave) values (p_chave) on conflict do nothing;
  return found;
end $$;


-- ---------------------------------------------------------------------
-- 5) Quem recebe: listas de destinatários (uso interno)
-- ---------------------------------------------------------------------
create or replace function public.ids_aprovados() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from perfis where status = 'aprovado';
$$;

create or replace function public.ids_katequistas() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id), '{}') from perfis p
   where p.status = 'aprovado'
     and (p.admin or exists (select 1 from perfil_tags pt join tags t on t.id = pt.tag_id
                              where pt.perfil_id = p.id and t.sistema and t.nome = 'Katequista'));
$$;

create or replace function public.ids_com_tag(p_nome text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id), '{}') from perfis p
   where p.status = 'aprovado'
     and exists (select 1 from perfil_tags pt join tags t on t.id = pt.tag_id
                  where pt.perfil_id = p.id and t.sistema and t.nome = p_nome);
$$;

create or replace function public.ids_admins() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from perfis where status = 'aprovado' and admin;
$$;

-- Conteúdo que pode ser aberto aos visitantes: todos os aprovados; senão, só katequistas
create or replace function public.ids_publico(p_visitantes boolean) returns uuid[]
language sql stable security definer set search_path = public as $$
  select case when p_visitantes then ids_aprovados() else ids_katequistas() end;
$$;

create or replace function public.nome_curto(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(apelido, ''), nome, 'Alguém') from perfis where id = p_id;
$$;


-- ---------------------------------------------------------------------
-- 6) Enfileirar e disparar
-- ---------------------------------------------------------------------
-- Chama a função do Supabase que entrega as notificações da fila.
-- Se algo falhar, a fila continua guardada e o agendador (abaixo) tenta de novo.
create or replace function public.disparar_fila() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from fila_push where enviada_em is null) then
    perform net.http_post(
      url     := 'https://vfdnwvrinxdtnbyljibk.supabase.co/functions/v1/smart-processor',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := '{"processar": true}'::jsonb
    );
  end if;
exception when others then
  null;  -- nunca atrapalha quem está usando o site
end $$;

create or replace function public.enfileirar_push(p_categoria text, p_titulo text, p_texto text,
                                                  p_url text, p_destinos uuid[], p_excluir uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare qtd int;
begin
  insert into fila_push (perfil_id, titulo, texto, url)
  select distinct i.perfil_id, left(p_titulo, 60), left(p_texto, 200), p_url
    from push_inscricoes i
   where i.perfil_id = any (p_destinos)
     and i.perfil_id is distinct from p_excluir
     and not exists (select 1 from push_preferencias pf
                      where pf.perfil_id = i.perfil_id and pf.categoria = p_categoria);
  get diagnostics qtd = row_count;
  if qtd > 0 then perform disparar_fila(); end if;
  return qtd;
end $$;

-- A função do Supabase pega o que está pendente (e marca como enviado) com uma única chamada
create or replace function public.reivindicar_fila(p_limite int default 200)
returns table (fila_id bigint, titulo text, texto text, url text, insc_id bigint, endpoint text, chave_p256dh text, chave_auth text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with pegas as (
    update fila_push f set enviada_em = now()
     where f.id in (select x.id from fila_push x where x.enviada_em is null order by x.id limit p_limite for update skip locked)
    returning f.id, f.perfil_id, f.titulo, f.texto, f.url
  )
  select p.id, p.titulo, p.texto, p.url, i.id, i.endpoint, i.chave_p256dh, i.chave_auth
    from pegas p join push_inscricoes i on i.perfil_id = p.perfil_id;
end $$;


-- ---------------------------------------------------------------------
-- 7) Gatilhos: avisam na hora quando algo acontece
--    (qualquer erro aqui é ignorado, para nunca impedir a ação da pessoa)
-- ---------------------------------------------------------------------
create or replace function public.aviso_proposta_nova() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'sugestao' then
    perform enfileirar_push('leis', 'Nova ideia de lei', left(new.titulo, 120) || ' espera a avaliação do Presidente.',
                            '/paginas/politica.html', ids_com_tag('Presidente'), new.autor_id);
  elsif new.status = 'camara' then
    perform enfileirar_push('leis', 'Nova proposta de lei', left(new.titulo, 120) || ' já pode ser votada na Câmara.',
                            '/paginas/politica.html', ids_com_tag('Deputado') || ids_com_tag('Presidente'), new.autor_id);
  end if;
  return new;
exception when others then
  return new;
end $$;

create or replace function public.aviso_proposta_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'camara' then
    perform enfileirar_push('leis', 'Proposta na Câmara', left(new.titulo, 120) || ' já pode ser votada.',
                            '/paginas/politica.html', ids_com_tag('Deputado') || ids_com_tag('Presidente'));
  elsif new.status = 'popular' then
    perform enfileirar_push('leis', 'Votação popular aberta', left(new.titulo, 120) || ': dê o seu voto.',
                            '/paginas/politica.html', ids_katequistas());
  elsif new.status = 'empate' then
    perform enfileirar_push('leis', 'Empate na Câmara', left(new.titulo, 120) || ': o Presidente precisa decidir.',
                            '/paginas/politica.html', ids_com_tag('Presidente'));
  elsif new.status = 'aprovada' then
    perform enfileirar_push('leis', 'Lei aprovada', left(new.titulo, 120), '/paginas/politica.html', ids_katequistas());
  elsif new.status = 'rejeitada' then
    perform enfileirar_push('leis', 'Proposta rejeitada', left(new.titulo, 120), '/paginas/politica.html', ids_katequistas());
  end if;
  return new;
exception when others then
  return new;
end $$;

create or replace function public.aviso_enquete_nova() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform enfileirar_push('enquetes', 'Nova enquete',
          left(new.titulo, 120) || ' — vote até ' || to_char(new.termina_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
          '/paginas/enquetes.html', ids_publico(new.visivel_visitantes and new.visitantes_votam), new.autor_id);
  return new;
exception when others then
  return new;
end $$;

create or replace function public.aviso_evento_novo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform enfileirar_push('eventos', 'Novo evento',
          left(new.titulo, 80) || ' — ' || to_char(new.data, 'DD/MM') || coalesce(' às ' || to_char(new.hora, 'HH24:MI'), ''),
          '/paginas/eventos.html', ids_publico(new.visivel_visitantes), new.autor_id);
  return new;
exception when others then
  return new;
end $$;

create or replace function public.aviso_anuncio_novo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform enfileirar_push('avisos', case when new.prioridade then 'Aviso importante' else 'Novo aviso' end,
          left(new.titulo, 100), '/paginas/index.html', ids_publico(new.visivel_visitantes), new.autor_id);
  return new;
exception when others then
  return new;
end $$;

create or replace function public.aviso_sorteio_novo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform enfileirar_push('sorteios', 'Novo sorteio', left(new.titulo, 100), '/paginas/sorteios.html',
                          ids_publico(new.visivel_visitantes), new.autor_id);
  return new;
exception when others then
  return new;
end $$;

create or replace function public.aviso_pagamento_pessoa() returns trigger
language plpgsql security definer set search_path = public as $$
declare conta record;
begin
  if new.perfil_id is null then return new; end if;
  select titulo, criado_por into conta from pagamentos where id = new.pagamento_id;
  perform enfileirar_push('pagamentos', 'Conta dividida com você', left(coalesce(conta.titulo, 'Nova conta'), 100),
                          '/paginas/pagamentos.html#conta-' || new.pagamento_id, array[new.perfil_id], conta.criado_por);
  return new;
exception when others then
  return new;
end $$;

create or replace function public.aviso_magnata() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.perfil_id is not null and (tg_op = 'INSERT' or old.perfil_id is distinct from new.perfil_id) then
    perform enfileirar_push('economia', 'Novo Magnata', nome_curto(new.perfil_id) || ' agora é o mais rico do grupo.',
                            '/paginas/economia.html', ids_katequistas());
  end if;
  return new;
exception when others then
  return new;
end $$;

create or replace function public.aviso_tag_nova() returns trigger
language plpgsql security definer set search_path = public as $$
declare nome_tag text;
begin
  select nome into nome_tag from tags where id = new.tag_id;
  if nome_tag is null or nome_tag = 'Visitante' then return new; end if;
  perform enfileirar_push('conta', 'Você recebeu uma tag', 'Agora você tem a tag ' || nome_tag || '.',
                          '/paginas/perfil.html', array[new.perfil_id]);
  return new;
exception when others then
  return new;
end $$;

create or replace function public.aviso_membro_novo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform enfileirar_push('conta', 'Novo membro', coalesce(nullif(new.apelido, ''), new.nome, 'Alguém') || ' entrou no site.',
                          '/paginas/admin.html', ids_admins(), new.id);
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists aviso_proposta_nova on public.propostas_lei;
create trigger aviso_proposta_nova after insert on public.propostas_lei
  for each row execute function public.aviso_proposta_nova();
drop trigger if exists aviso_proposta_status on public.propostas_lei;
create trigger aviso_proposta_status after update of status on public.propostas_lei
  for each row execute function public.aviso_proposta_status();
drop trigger if exists aviso_enquete_nova on public.enquetes;
create trigger aviso_enquete_nova after insert on public.enquetes
  for each row execute function public.aviso_enquete_nova();
drop trigger if exists aviso_evento_novo on public.eventos;
create trigger aviso_evento_novo after insert on public.eventos
  for each row execute function public.aviso_evento_novo();
drop trigger if exists aviso_anuncio_novo on public.anuncios;
create trigger aviso_anuncio_novo after insert on public.anuncios
  for each row execute function public.aviso_anuncio_novo();
drop trigger if exists aviso_sorteio_novo on public.sorteios;
create trigger aviso_sorteio_novo after insert on public.sorteios
  for each row execute function public.aviso_sorteio_novo();
drop trigger if exists aviso_pagamento_pessoa on public.pagamento_pessoas;
create trigger aviso_pagamento_pessoa after insert on public.pagamento_pessoas
  for each row execute function public.aviso_pagamento_pessoa();
drop trigger if exists aviso_magnata on public.magnata_atual;
create trigger aviso_magnata after insert or update of perfil_id on public.magnata_atual
  for each row execute function public.aviso_magnata();
drop trigger if exists aviso_tag_nova on public.perfil_tags;
create trigger aviso_tag_nova after insert on public.perfil_tags
  for each row execute function public.aviso_tag_nova();
drop trigger if exists aviso_membro_novo on public.perfis;
create trigger aviso_membro_novo after insert on public.perfis
  for each row execute function public.aviso_membro_novo();


-- ---------------------------------------------------------------------
-- 8) Avisos por horário (rodam a cada 30 minutos, no fuso de Brasília):
--    aniversários, lembretes de evento e votações/enquetes terminando
-- ---------------------------------------------------------------------
create or replace function public.avisos_agendados() returns void
language plpgsql security definer set search_path = public as $$
declare
  agora  timestamp := now() at time zone 'America/Sao_Paulo';
  hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  p      record;
  e      record;
  q      record;
  bissexto boolean := extract(doy from make_date(extract(year from hoje)::int, 12, 31)) = 366;
  nao_vao uuid[];
  ja_votou uuid[];
begin
  -- Aniversários (a partir das 8h; quem nasceu em 29/02 comemora em 01/03 nos anos sem 29/02)
  if agora::time >= time '08:00' then
    for p in
      select id, coalesce(nullif(apelido, ''), nome, 'Alguém') as nome_p from perfis
       where status = 'aprovado' and aniversario is not null and (
             (extract(month from aniversario) = extract(month from hoje) and extract(day from aniversario) = extract(day from hoje))
          or (not bissexto and extract(month from aniversario) = 2 and extract(day from aniversario) = 29
              and extract(month from hoje) = 3 and extract(day from hoje) = 1))
    loop
      if primeira_vez('aniv-' || p.id || '-' || hoje) then
        perform enfileirar_push('aniversarios', 'Feliz aniversário, ' || p.nome_p || '!',
                                'Todo o grupo deseja um ótimo dia para você.', '/paginas/index.html', array[p.id]);
        perform enfileirar_push('aniversarios', 'Aniversário hoje', 'Hoje é aniversário de ' || p.nome_p || '. Dê os parabéns!',
                                '/paginas/index.html', ids_aprovados(), p.id);
      end if;
    end loop;
  end if;

  -- Lembretes de evento
  for e in select * from eventos where data between hoje and hoje + 1 loop
    select coalesce(array_agg(perfil_id), '{}') into nao_vao from presencas where evento_id = e.id and resposta = 'nao';
    declare
      inicio timestamp := e.data + coalesce(e.hora, time '00:00');
      destinos uuid[];
    begin
      select coalesce(array_agg(x), '{}') into destinos
        from unnest(ids_publico(e.visivel_visitantes)) x where x <> all (nao_vao);

      if e.data = hoje + 1 and agora::time >= time '18:00' and primeira_vez('ev-vespera-' || e.id) then
        perform enfileirar_push('eventos', 'Amanhã tem evento',
                e.titulo || coalesce(' às ' || to_char(e.hora, 'HH24:MI'), ''), '/paginas/eventos.html', destinos);
      end if;
      if e.data = hoje and agora::time >= time '08:00' and (e.hora is null or e.hora >= time '10:00')
         and (e.hora is null or agora < inicio) and primeira_vez('ev-hoje-' || e.id) then
        perform enfileirar_push('eventos', 'Hoje tem evento',
                e.titulo || coalesce(' às ' || to_char(e.hora, 'HH24:MI'), ''), '/paginas/eventos.html', destinos);
      end if;
      if e.hora is not null and agora >= inicio - interval '1 hour' and agora < inicio
         and primeira_vez('ev-1h-' || e.id) then
        perform enfileirar_push('eventos', 'Começa em breve', e.titulo || ' começa às ' || to_char(e.hora, 'HH24:MI') || '.',
                '/paginas/eventos.html', destinos);
      end if;
    end;
  end loop;

  -- Enquetes terminando em até 24h: avisa só quem ainda não votou
  for q in select * from enquetes where termina_em > now() and termina_em <= now() + interval '24 hours' loop
    if primeira_vez('enq-fim-' || q.id) then
      select coalesce(array_agg(distinct perfil_id), '{}') into ja_votou from enquete_votos where enquete_id = q.id;
      perform enfileirar_push('enquetes', 'Enquete terminando', q.titulo || ' termina em breve. Ainda dá tempo de votar.',
              '/paginas/enquetes.html',
              (select coalesce(array_agg(x), '{}') from unnest(ids_publico(q.visivel_visitantes and q.visitantes_votam)) x where x <> all (ja_votou)));
    end if;
  end loop;

  -- Votação da Câmara terminando em até 12h: avisa deputados que ainda não votaram
  for q in select * from propostas_lei where status = 'camara' and fim_camara > now() and fim_camara <= now() + interval '12 hours' loop
    if primeira_vez('camara-fim-' || q.id) then
      select coalesce(array_agg(perfil_id), '{}') into ja_votou from votos_camara where proposta_id = q.id;
      perform enfileirar_push('leis', 'Votação da Câmara terminando', left(q.titulo, 120) || ': falta o seu voto.',
              '/paginas/politica.html',
              (select coalesce(array_agg(x), '{}') from unnest(ids_com_tag('Deputado')) x where x <> all (ja_votou)));
    end if;
  end loop;

  -- Voto popular terminando em até 12h
  for q in select * from propostas_lei where status = 'popular' and fim_popular > now() and fim_popular <= now() + interval '12 hours' loop
    if primeira_vez('popular-fim-' || q.id) then
      select coalesce(array_agg(perfil_id), '{}') into ja_votou from votos_populares where proposta_id = q.id;
      perform enfileirar_push('leis', 'Votação popular terminando', left(q.titulo, 120) || ': ainda dá tempo de votar.',
              '/paginas/politica.html',
              (select coalesce(array_agg(x), '{}') from unnest(ids_katequistas()) x where x <> all (ja_votou)));
    end if;
  end loop;

  -- Limpeza do que é antigo
  delete from avisos_enviados where criado_em < now() - interval '120 days';
  delete from fila_push where enviada_em is not null and enviada_em < now() - interval '7 days';
  perform disparar_fila();
end $$;


-- ---------------------------------------------------------------------
-- 9) Agenda: a cada 30 min os avisos por horário; a cada 10 min reenvia a fila pendente
-- ---------------------------------------------------------------------
do $$ begin
  perform cron.schedule('katequese-avisos', '*/30 * * * *', 'select public.avisos_agendados()');
  perform cron.schedule('katequese-fila', '*/10 * * * *', 'select public.disparar_fila()');
exception when others then
  raise notice 'Não consegui agendar (pg_cron). Ligue o pg_cron em Database > Extensions e rode este arquivo de novo.';
end $$;


-- ---------------------------------------------------------------------
-- 10) Permissões: o que é interno só roda pelo banco (ou pela função do Supabase)
-- ---------------------------------------------------------------------
revoke execute on function public.primeira_vez(text), public.ids_aprovados(), public.ids_katequistas(),
  public.ids_com_tag(text), public.ids_admins(), public.ids_publico(boolean), public.nome_curto(uuid),
  public.disparar_fila(), public.enfileirar_push(text, text, text, text, uuid[], uuid),
  public.avisos_agendados() from public, anon, authenticated;
revoke execute on function public.reivindicar_fila(int) from public, anon, authenticated;
grant execute on function public.reivindicar_fila(int) to service_role;


-- ---------------------------------------------------------------------
-- 11) Aba Atualizações
-- ---------------------------------------------------------------------
insert into public.atualizacoes (tipo, titulo, descricao, autor_nome, origem)
select 'nova', 'Notificações automáticas',
       'Avisos sozinhos para novas propostas, enquetes, eventos, aniversários, lembretes e mais. Cada um escolhe o que receber no Perfil.',
       'Kayo', 'site'
 where not exists (select 1 from public.atualizacoes where titulo = 'Notificações automáticas');
insert into public.atualizacoes (tipo, titulo, descricao, autor_nome, origem)
select 'banco', 'Fotos de Pagamentos liberadas',
       'Corrigido o erro ao criar contas de Pagamentos com foto.',
       'Kayo', 'site'
 where not exists (select 1 from public.atualizacoes where titulo = 'Fotos de Pagamentos liberadas');
