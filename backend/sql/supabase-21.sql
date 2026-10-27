-- =====================================================================
-- supabase-21.sql — atualização: TAG MAGNATA (automática).
--
--   - Magnata: tag de sistema, entre Deputado e Katequista (ordem 600).
--     Vai para o membro com o maior saldo da carteira (só carteira, sem bens).
--   - Empate: a tag fica com quem já tinha. Se a pessoa cai do topo, a tag
--     vai para quem chegou ao topo primeiro (movimentação mais antiga).
--   - Atualiza sozinha: quando um saldo muda ou um membro é aprovado/bloqueado.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase-20.sql já executado. Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) A tag Magnata (tag de sistema: não some nem muda de nome)
-- ---------------------------------------------------------------------
insert into public.tags (nome, cor, sistema, ordem)
values ('Magnata', '#f2c94c', true, 600)
on conflict (nome) do update set cor = excluded.cor, sistema = true, ordem = 600;


-- ---------------------------------------------------------------------
-- 2) Guarda quem é o magnata agora e desde quando
-- ---------------------------------------------------------------------
create table if not exists public.magnata_atual (
  id         int primary key default 1 check (id = 1),
  perfil_id  uuid references public.perfis(id) on delete set null,
  desde      timestamptz
);
insert into public.magnata_atual (id) values (1) on conflict (id) do nothing;
alter table public.magnata_atual enable row level security;  -- sem políticas: ninguém lê direto


-- ---------------------------------------------------------------------
-- 3) Decide quem é o magnata e entrega (ou tira) a tag
-- ---------------------------------------------------------------------
create or replace function public.atualizar_magnata() returns void
language plpgsql security definer set search_path = public as $$
declare
  id_tag bigint;
  topo bigint;
  atual uuid;
  novo uuid;
begin
  select t.id into id_tag from public.tags t where t.nome = 'Magnata' and t.sistema;
  if id_tag is null then return; end if;

  select max(c.saldo) into topo
    from public.carteiras c join public.perfis p on p.id = c.perfil_id
   where p.status = 'aprovado';

  select m.perfil_id into atual from public.magnata_atual m where m.id = 1;

  if topo is null then
    novo := null;
  elsif atual is not null and exists (
       select 1 from public.carteiras c join public.perfis p on p.id = c.perfil_id
        where c.perfil_id = atual and p.status = 'aprovado' and c.saldo = topo) then
    novo := atual;   -- ainda está no topo (ou empatado): continua
  else
    -- chegou ao topo primeiro: a movimentação mais antiga que levou ao saldo atual
    select c.perfil_id into novo
      from public.carteiras c join public.perfis p on p.id = c.perfil_id
     where p.status = 'aprovado' and c.saldo = topo
     order by (select max(t.criado_em) from public.transacoes t where t.perfil_id = c.perfil_id) asc nulls last
     limit 1;
  end if;

  if novo is distinct from atual then
    update public.magnata_atual set perfil_id = novo, desde = now() where id = 1;
  end if;

  delete from public.perfil_tags where tag_id = id_tag and perfil_id is distinct from novo;
  if novo is not null then
    insert into public.perfil_tags (perfil_id, tag_id) values (novo, id_tag) on conflict do nothing;
  end if;
end $$;

-- Gatilho: roda sempre que um saldo muda ou um membro é aprovado/bloqueado
create or replace function public.gatilho_magnata() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.atualizar_magnata();
  return null;
end $$;

drop trigger if exists magnata_saldo on public.carteiras;
create trigger magnata_saldo after insert or update of saldo on public.carteiras
  for each statement execute function public.gatilho_magnata();

drop trigger if exists magnata_status on public.perfis;
create trigger magnata_status after update of status on public.perfis
  for each statement execute function public.gatilho_magnata();

-- Calcula agora, com os saldos que já existem
select public.atualizar_magnata();


-- ---------------------------------------------------------------------
-- 4) Registra as mudanças na aba Atualizações
-- ---------------------------------------------------------------------
insert into public.atualizacoes (tipo, titulo, descricao, autor_nome, origem) values
  ('nova', 'Tag Magnata',
   'Quem tem o maior saldo na carteira ganha a tag Magnata, automaticamente. Empate: fica com quem já tinha.',
   'Kayo', 'site'),
  ('melhoria', 'Mostrar todas as tags',
   'Novo botão em Admin → Tags: mostra todas as tags do membro nos nomes (Katequista e Visitante só aparecem se for a única).',
   'Kayo', 'site'),
  ('correcao', 'Animações de clique com "reduzir movimento"',
   'Abóboras, velas, doces e outros itens de cenário voltaram a animar ao clicar, mesmo com "reduzir movimento" ligado no aparelho.',
   'Kayo', 'site'),
  ('correcao', 'Título KATEQUESE no Natal',
   'Removido o risco branco que cortava as letras do título no tema de Natal.',
   'Kayo', 'site');
