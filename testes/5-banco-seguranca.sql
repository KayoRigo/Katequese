-- =====================================================================
-- testes/5-banco-seguranca.sql — testes das regras de segurança do banco.
--
-- COMO USAR: cole no SQL Editor do Supabase e clique em "Run".
-- Ele roda dentro de BEGIN ... ROLLBACK: se alguma regra falhar, ele dá
-- um ERRO dizendo qual teste quebrou; se tudo passar, termina com
-- "Success" e DESFAZ todas as alterações de teste (não suja o banco).
-- =====================================================================

begin;

do $$
declare
  id_teste uuid := '00000000-0000-0000-0000-000000000099';
  id_anuncio bigint;
  titulo_depois text;
begin
  -- 1) Limites de tamanho em perfis: bio maior que 140 letras deve ser recusada
  begin
    insert into public.perfis (id, usuario, nome, bio, status)
    values (id_teste, 'teste_limite', 'Teste', repeat('a', 141), 'aprovado');
    raise exception 'FALHOU: o banco aceitou uma bio com mais de 140 letras.';
  exception
    when check_violation then null; -- passou!
    when foreign_key_violation then null;
  end;

  -- 2) Proteção de anúncios: atualizar um anúncio quando logado NÃO pode mudar o título nem o texto
  if exists (select 1 from public.anuncios) then
    select id into id_anuncio from public.anuncios limit 1;
    perform set_config('request.jwt.claim.sub', coalesce((select id::text from public.perfis where admin limit 1), id_teste::text), true);
    update public.anuncios set titulo = 'TÍTULO ADULTERADO', prioridade = not prioridade where id = id_anuncio;
    select titulo into titulo_depois from public.anuncios where id = id_anuncio;
    if titulo_depois = 'TÍTULO ADULTERADO' then
      raise exception 'FALHOU: proteger_anuncio deixou alterar o título do anúncio.';
    end if;
  end if;

  -- 3) Função interna mexer_saldo: usuários comuns (authenticated/anon) NÃO podem ter permissão de chamar direto
  if has_function_privilege('anon', 'public.mexer_saldo(uuid, bigint, text, text, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.mexer_saldo(uuid, bigint, text, text, uuid)', 'EXECUTE') then
    raise exception 'FALHOU: mexer_saldo está liberada para chamada direta pelo navegador.';
  end if;

  -- 4) Funções internas de leis (aplicar_proposta / apurar_proposta) também devem estar bloqueadas
  if has_function_privilege('authenticated', 'public.aplicar_proposta(bigint)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.apurar_proposta(bigint)', 'EXECUTE') then
    raise exception 'FALHOU: aplicar_proposta ou apurar_proposta está liberada para chamada direta.';
  end if;

  -- 5) Propostas de lei aceitam o status 'sugestao' sem prazo de Câmara (ideia de Deputado enviada ao Presidente)
  begin
    insert into public.propostas_lei (tipo, titulo, texto, status)
    values ('criar', 'Teste de Ideia', 'Texto de teste', 'sugestao');
  exception
    when check_violation or not_null_violation then
      raise exception 'FALHOU: propostas_lei recusou o status sugestao sem fim_camara (rode o supabase-20.sql).';
  end;
end;
$$;

rollback;
