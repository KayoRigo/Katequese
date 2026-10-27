-- =====================================================================
-- supabase-22.sql — atualização: ABA PAGAMENTOS (divisão de contas) +
-- tag Magnata em verde.
--
--   - Pagamentos (Atividades): uma "conta" (ex: confraternização do dia 15)
--     com pessoas (membros ou nomes de fora), itens (ex: Comida, Bebida),
--     valor de cada item e quem participa de cada item.
--     Cada item é dividido igualmente entre quem participa dele.
--   - Qualquer katequista marca como pago/não pago. Quem criou a conta
--     (ou o admin) edita pessoas/itens e apaga a conta.
--   - Visitantes não veem nem criam.
--   - Magnata: cor passa a ser verde.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase-21.sql já executado. Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Magnata em verde
-- ---------------------------------------------------------------------
update public.tags set cor = '#3fb56b' where nome = 'Magnata' and sistema;


-- ---------------------------------------------------------------------
-- 2) Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.pagamentos (
  id          bigint generated always as identity primary key,
  titulo      text not null check (char_length(titulo) between 1 and 100),
  descricao   text not null default '' check (char_length(descricao) <= 500),
  foto_path   text,
  criado_por  uuid references public.perfis(id) on delete set null,
  criado_em   timestamptz not null default now()
);

create table if not exists public.pagamento_pessoas (
  id            bigint generated always as identity primary key,
  pagamento_id  bigint not null references public.pagamentos(id) on delete cascade,
  nome          text not null check (char_length(nome) between 1 and 60),
  perfil_id     uuid references public.perfis(id) on delete set null,   -- null = pessoa de fora
  pago          boolean not null default false,
  pago_em       timestamptz,
  unique (pagamento_id, nome)
);

create table if not exists public.pagamento_itens (
  id            bigint generated always as identity primary key,
  pagamento_id  bigint not null references public.pagamentos(id) on delete cascade,
  nome          text not null check (char_length(nome) between 1 and 60),
  valor         numeric(10,2) not null check (valor > 0 and valor < 1000000),
  ordem         int not null default 0
);

create table if not exists public.pagamento_item_pessoas (
  item_id    bigint not null references public.pagamento_itens(id) on delete cascade,
  pessoa_id  bigint not null references public.pagamento_pessoas(id) on delete cascade,
  primary key (item_id, pessoa_id)
);

create index if not exists pagamento_pessoas_conta on public.pagamento_pessoas (pagamento_id);
create index if not exists pagamento_itens_conta on public.pagamento_itens (pagamento_id);

-- Leitura: só katequistas. Escrita só por funções (abaixo).
alter table public.pagamentos             enable row level security;
alter table public.pagamento_pessoas      enable row level security;
alter table public.pagamento_itens        enable row level security;
alter table public.pagamento_item_pessoas enable row level security;

drop policy if exists "ver contas de pagamento" on public.pagamentos;
create policy "ver contas de pagamento" on public.pagamentos for select using (eh_katequista());
drop policy if exists "ver pessoas de pagamento" on public.pagamento_pessoas;
create policy "ver pessoas de pagamento" on public.pagamento_pessoas for select using (eh_katequista());
drop policy if exists "ver itens de pagamento" on public.pagamento_itens;
create policy "ver itens de pagamento" on public.pagamento_itens for select using (eh_katequista());
drop policy if exists "ver divisao de pagamento" on public.pagamento_item_pessoas;
create policy "ver divisao de pagamento" on public.pagamento_item_pessoas for select using (eh_katequista());


-- ---------------------------------------------------------------------
-- 3) Funções (todo o resto passa por aqui)
-- ---------------------------------------------------------------------

-- Cria a conta inteira de uma vez (pessoas, itens e quem divide cada item)
create or replace function public.criar_pagamento(p_titulo text, p_descricao text, p_foto text,
                                                  p_pessoas jsonb, p_itens jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  nova_conta bigint;
  pessoa jsonb;
  item jsonb;
  ordem_item int := 0;
  id_item bigint;
  id_pessoa bigint;
  nome_participante text;
begin
  if not eh_katequista() then raise exception 'Só katequistas criam contas de pagamento.'; end if;
  if char_length(trim(coalesce(p_titulo, ''))) = 0 then raise exception 'Dê um título para a conta.'; end if;
  if jsonb_array_length(coalesce(p_pessoas, '[]'::jsonb)) = 0 then raise exception 'Coloque pelo menos uma pessoa.'; end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then raise exception 'Adicione pelo menos um item.'; end if;

  insert into public.pagamentos (titulo, descricao, foto_path, criado_por)
  values (trim(p_titulo), left(coalesce(p_descricao, ''), 500), nullif(p_foto, ''), auth.uid())
  returning id into nova_conta;

  for pessoa in select value from jsonb_array_elements(p_pessoas) loop
    insert into public.pagamento_pessoas (pagamento_id, nome, perfil_id)
    values (nova_conta, trim(pessoa->>'nome'), nullif(pessoa->>'perfil_id', '')::uuid);
  end loop;

  for item in select value from jsonb_array_elements(p_itens) loop
    ordem_item := ordem_item + 1;
    if jsonb_array_length(coalesce(item->'pessoas', '[]'::jsonb)) = 0 then
      raise exception 'O item "%" precisa de pelo menos uma pessoa.', item->>'nome';
    end if;
    insert into public.pagamento_itens (pagamento_id, nome, valor, ordem)
    values (nova_conta, trim(item->>'nome'), (item->>'valor')::numeric, ordem_item)
    returning id into id_item;

    for nome_participante in select jsonb_array_elements_text(item->'pessoas') loop
      select pp.id into id_pessoa from public.pagamento_pessoas pp
       where pp.pagamento_id = nova_conta and pp.nome = nome_participante;
      if id_pessoa is null then
        raise exception 'A pessoa "%" não está na lista da conta.', nome_participante;
      end if;
      insert into public.pagamento_item_pessoas (item_id, pessoa_id) values (id_item, id_pessoa)
      on conflict do nothing;
    end loop;
  end loop;

  return nova_conta;
end $$;

-- Apaga a conta inteira (quem criou ou admin)
create or replace function public.excluir_pagamento(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (eh_admin() or exists (select 1 from public.pagamentos where id = p_id and criado_por = auth.uid())) then
    raise exception 'Só quem criou a conta (ou o admin) pode apagar.';
  end if;
  delete from public.pagamentos where id = p_id;
end $$;

-- Marca/desmarca alguém como pago (qualquer katequista)
create or replace function public.marcar_pago(p_pessoa bigint, p_pago boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eh_katequista() then raise exception 'Só katequistas marcam pagamentos.'; end if;
  update public.pagamento_pessoas
     set pago = p_pago, pago_em = case when p_pago then now() else null end
   where id = p_pessoa;
  if not found then raise exception 'Pessoa não encontrada.'; end if;
end $$;

grant execute on function public.criar_pagamento(text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.excluir_pagamento(bigint) to authenticated;
grant execute on function public.marcar_pago(bigint, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 4) Registra as mudanças na aba Atualizações
-- ---------------------------------------------------------------------
insert into public.atualizacoes (tipo, titulo, descricao, autor_nome, origem) values
  ('nova', 'Aba Pagamentos',
   'Em Atividades: divide a conta de janta ou confraternização entre as pessoas. Cada item tem o seu valor e quem participa dele. Verde = pagou, vermelho = ainda não.',
   'Kayo', 'site'),
  ('melhoria', 'Tag Magnata em verde',
   'A tag Magnata agora é verde.',
   'Kayo', 'site');
