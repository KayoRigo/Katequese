-- =====================================================================
-- supabase-24.sql — atualização: EDITAR uma conta de Pagamentos já criada.
--
-- Quem criou a conta (ou o admin) pode mudar título, descrição, foto,
-- pessoas e itens. Quem já estava marcado como "pagou" continua marcado
-- (a pessoa é reconhecida pelo nome). Pessoas tiradas da conta somem.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase-22.sql e do supabase-23.sql. Pode rodar mais de uma vez.
-- =====================================================================

create or replace function public.editar_pagamento(p_id bigint, p_titulo text, p_descricao text, p_foto text,
                                                    p_pessoas jsonb, p_itens jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  dono uuid;
  pessoa jsonb;
  item jsonb;
  ordem_item int := 0;
  id_item bigint;
  id_pessoa bigint;
  nome_participante text;
  nomes text[];
begin
  select criado_por into dono from public.pagamentos where id = p_id;
  if not found then raise exception 'Conta não encontrada.'; end if;
  if not eh_katequista() or not (eh_admin() or dono = auth.uid()) then
    raise exception 'Só quem criou a conta ou o admin pode editar.';
  end if;
  if char_length(trim(coalesce(p_titulo, ''))) = 0 then raise exception 'Dê um título para a conta.'; end if;
  if jsonb_typeof(coalesce(p_pessoas, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' then
    raise exception 'Dados da conta inválidos.';
  end if;
  if jsonb_array_length(coalesce(p_pessoas, '[]'::jsonb)) = 0 then raise exception 'Coloque pelo menos uma pessoa.'; end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then raise exception 'Adicione pelo menos um item.'; end if;
  if jsonb_array_length(p_pessoas) > 60 then raise exception 'No máximo 60 pessoas por conta.'; end if;
  if jsonb_array_length(p_itens) > 30 then raise exception 'No máximo 30 itens por conta.'; end if;
  -- foto: null = mantém a atual; texto vazio = tira; senão precisa estar na pasta de quem edita
  if nullif(p_foto, '') is not null and p_foto not like 'pagamentos/' || auth.uid()::text || '/%' then
    raise exception 'Foto inválida.';
  end if;

  update public.pagamentos
     set titulo = trim(p_titulo),
         descricao = left(coalesce(p_descricao, ''), 500),
         foto_path = case when p_foto is null then foto_path else nullif(p_foto, '') end
   where id = p_id;

  -- Pessoas: tira quem saiu, atualiza quem ficou, cria quem entrou
  select array_agg(trim(v->>'nome')) into nomes from jsonb_array_elements(p_pessoas) v;
  delete from public.pagamento_pessoas where pagamento_id = p_id and nome <> all (nomes);
  for pessoa in select value from jsonb_array_elements(p_pessoas) loop
    insert into public.pagamento_pessoas (pagamento_id, nome, perfil_id)
    values (p_id, trim(pessoa->>'nome'), nullif(pessoa->>'perfil_id', '')::uuid)
    on conflict (pagamento_id, nome) do update set perfil_id = excluded.perfil_id;
  end loop;

  -- Itens: recria todos (a divisão por pessoa vai junto)
  delete from public.pagamento_itens where pagamento_id = p_id;
  for item in select value from jsonb_array_elements(p_itens) loop
    ordem_item := ordem_item + 1;
    if jsonb_array_length(coalesce(item->'pessoas', '[]'::jsonb)) = 0 then
      raise exception 'O item "%" precisa de pelo menos uma pessoa.', item->>'nome';
    end if;
    insert into public.pagamento_itens (pagamento_id, nome, valor, ordem)
    values (p_id, trim(item->>'nome'), (item->>'valor')::numeric, ordem_item)
    returning id into id_item;

    for nome_participante in select jsonb_array_elements_text(item->'pessoas') loop
      select pp.id into id_pessoa from public.pagamento_pessoas pp
       where pp.pagamento_id = p_id and pp.nome = nome_participante;
      if id_pessoa is null then
        raise exception 'A pessoa "%" não está na lista da conta.', nome_participante;
      end if;
      insert into public.pagamento_item_pessoas (item_id, pessoa_id) values (id_item, id_pessoa)
      on conflict do nothing;
    end loop;
  end loop;
end $$;

revoke execute on function public.editar_pagamento(bigint, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.editar_pagamento(bigint, text, text, text, jsonb, jsonb) to authenticated;

insert into public.atualizacoes (tipo, titulo, descricao, autor_nome, origem)
select 'nova', 'Editar contas de Pagamentos',
       'Quem criou a conta (ou o admin) pode mudar título, foto, pessoas e itens. Quem já pagou continua marcado.',
       'Kayo', 'site'
 where not exists (select 1 from public.atualizacoes where titulo = 'Editar contas de Pagamentos');
