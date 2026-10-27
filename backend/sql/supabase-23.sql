-- =====================================================================
-- supabase-23.sql — atualização: NOTIFICAÇÕES NO CELULAR + reforços.
--
--   - Notificações (push): cada membro ativa no próprio Perfil. Só admin e
--     Presidente enviam, escolhendo quem recebe. O envio é feito pela função
--     "enviar-notificacao" do Supabase (veja backend/funcoes/).
--   - Reforços de segurança nas funções das atualizações 21 e 22:
--     só usuários logados chamam, e a conta de pagamento tem limite de tamanho.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase-22.sql já executado. Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Quem pode enviar notificações: admin ou Presidente
-- ---------------------------------------------------------------------
create or replace function public.pode_notificar() returns boolean
language sql stable security definer set search_path = public as $$
  select eh_katequista() and (eh_admin() or tem_tag('Presidente'));
$$;


-- ---------------------------------------------------------------------
-- 2) Aparelhos que aceitaram receber notificações
-- ---------------------------------------------------------------------
create table if not exists public.push_inscricoes (
  id            bigint generated always as identity primary key,
  perfil_id     uuid not null references public.perfis(id) on delete cascade,
  endpoint      text not null unique check (char_length(endpoint) between 10 and 1000),
  chave_p256dh  text not null check (char_length(chave_p256dh) between 10 and 200),
  chave_auth    text not null check (char_length(chave_auth) between 5 and 100),
  agente        text not null default '' check (char_length(agente) <= 200),
  criado_em     timestamptz not null default now()
);
create index if not exists push_inscricoes_perfil on public.push_inscricoes (perfil_id);
alter table public.push_inscricoes enable row level security;

-- Cada um só enxerga os próprios aparelhos. Gravar e apagar só pelas funções abaixo.
drop policy if exists "ver minhas inscricoes push" on public.push_inscricoes;
create policy "ver minhas inscricoes push" on public.push_inscricoes
  for select using (perfil_id = auth.uid());

-- Ativar neste aparelho (se o aparelho era de outra conta, passa a ser desta)
create or replace function public.salvar_inscricao_push(p_endpoint text, p_p256dh text, p_auth text, p_agente text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_aprovado() then raise exception 'Só membros aprovados ativam notificações.'; end if;
  insert into public.push_inscricoes (perfil_id, endpoint, chave_p256dh, chave_auth, agente)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_agente, ''), 200))
  on conflict (endpoint) do update
    set perfil_id = auth.uid(), chave_p256dh = excluded.chave_p256dh,
        chave_auth = excluded.chave_auth, agente = excluded.agente;
end $$;

-- Desativar neste aparelho
create or replace function public.remover_inscricao_push(p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_inscricoes where endpoint = p_endpoint and perfil_id = auth.uid();
end $$;

-- Quais membros têm pelo menos um aparelho ativo (para a tela de envio; não mostra os endereços)
create or replace function public.quem_recebe_notificacoes() returns setof uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not pode_notificar() then raise exception 'Só admin ou Presidente.'; end if;
  return query select distinct perfil_id from public.push_inscricoes;
end $$;


-- ---------------------------------------------------------------------
-- 3) Histórico do que foi enviado (quem enviou grava pela função do Supabase)
-- ---------------------------------------------------------------------
create table if not exists public.notificacoes (
  id           bigint generated always as identity primary key,
  titulo       text not null check (char_length(titulo) between 1 and 60),
  texto        text not null check (char_length(texto) between 1 and 200),
  enviado_por  uuid references public.perfis(id) on delete set null,
  escolhidos   int not null default 0,   -- quantos membros foram escolhidos
  entregues    int not null default 0,   -- quantos aparelhos receberam
  criado_em    timestamptz not null default now()
);
alter table public.notificacoes enable row level security;
drop policy if exists "ver notificacoes enviadas" on public.notificacoes;
create policy "ver notificacoes enviadas" on public.notificacoes
  for select using (pode_notificar());


-- ---------------------------------------------------------------------
-- 4) Reforços das atualizações 21 e 22
-- ---------------------------------------------------------------------
-- Só o banco chama estas (por gatilho); ninguém precisa chamar direto pelo site
revoke execute on function public.atualizar_magnata() from public, anon, authenticated;
revoke execute on function public.gatilho_magnata() from public, anon, authenticated;

-- Funções de Pagamentos: só usuários logados
revoke execute on function public.criar_pagamento(text, text, text, jsonb, jsonb) from public, anon;
revoke execute on function public.excluir_pagamento(bigint) from public, anon;
revoke execute on function public.marcar_pago(bigint, boolean) from public, anon;
grant execute on function public.criar_pagamento(text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.excluir_pagamento(bigint) to authenticated;
grant execute on function public.marcar_pago(bigint, boolean) to authenticated;

-- Funções novas desta atualização: só usuários logados
revoke execute on function public.salvar_inscricao_push(text, text, text, text) from public, anon;
revoke execute on function public.remover_inscricao_push(text) from public, anon;
revoke execute on function public.quem_recebe_notificacoes() from public, anon;
grant execute on function public.salvar_inscricao_push(text, text, text, text) to authenticated;
grant execute on function public.remover_inscricao_push(text) to authenticated;
grant execute on function public.quem_recebe_notificacoes() to authenticated;

-- Conta de pagamento com limite de tamanho (evita abuso)
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
  if jsonb_typeof(coalesce(p_pessoas, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' then
    raise exception 'Dados da conta inválidos.';
  end if;
  if jsonb_array_length(coalesce(p_pessoas, '[]'::jsonb)) = 0 then raise exception 'Coloque pelo menos uma pessoa.'; end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then raise exception 'Adicione pelo menos um item.'; end if;
  if jsonb_array_length(p_pessoas) > 60 then raise exception 'No máximo 60 pessoas por conta.'; end if;
  if jsonb_array_length(p_itens) > 30 then raise exception 'No máximo 30 itens por conta.'; end if;
  -- a foto, se houver, precisa estar na pasta de pagamentos de quem está criando
  if nullif(p_foto, '') is not null and p_foto not like 'pagamentos/' || auth.uid()::text || '/%' then
    raise exception 'Foto inválida.';
  end if;

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




-- ---------------------------------------------------------------------
-- 5) Registra as mudanças na aba Atualizações (sem duplicar se rodar de novo)
-- ---------------------------------------------------------------------
insert into public.atualizacoes (tipo, titulo, descricao, autor_nome, origem)
select 'nova', 'Notificações no celular',
       'Cada membro ativa no Perfil. Admin e Presidente enviam notificações escolhendo quem recebe.',
       'Kayo', 'site'
 where not exists (select 1 from public.atualizacoes where titulo = 'Notificações no celular');
insert into public.atualizacoes (tipo, titulo, descricao, autor_nome, origem)
select 'nova', 'Site como aplicativo',
       'O site pode ser instalado no celular e no computador, sem precisar abrir o navegador. Quando sai versão nova, aparece um aviso para atualizar.',
       'Kayo', 'site'
 where not exists (select 1 from public.atualizacoes where titulo = 'Site como aplicativo');
insert into public.atualizacoes (tipo, titulo, descricao, autor_nome, origem)
select 'banco', 'Reforços de segurança nas funções novas',
       'Funções de Pagamentos e Magnata só aceitam usuários logados; conta de pagamento tem limite de pessoas e itens.',
       'Kayo', 'site'
 where not exists (select 1 from public.atualizacoes where titulo = 'Reforços de segurança nas funções novas');
