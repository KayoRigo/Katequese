-- =====================================================================
-- supabase-18.sql — atualização: CORREÇÕES DE SEGURANÇA.
--
--   - Perfis: limite de tamanho nos campos (nome, apelido, bio, usuário)
--     e conferência do formato do nome de usuário direto no banco.
--   - Anúncios e recados: ao mudar prioridade/fixado, o banco trava o
--     autor e o texto originais (ninguém consegue adulterar o texto ou
--     o autor de um anúncio/recado pelo console).
--   - Loja (vender_item): a revenda agora é calculada sobre o preço com
--     desconto e devolve os 3 XP ganhos na compra (fecha a brecha de
--     comprar com desconto e vender mais caro ou ganhar XP infinito).
--   - Sorteios: trava o sorteio durante o giro (for update) para dois
--     cliques ao mesmo tempo não repetirem o mesmo item.
--   - Arquivos (Storage): cada membro só envia arquivos dentro da própria
--     pasta, e as pastas do Admin (semana, politica, loja) só aceitam
--     envios de administradores.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase-17.sql já executado. Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) PERFIS E CADASTRO: limites de tamanho e validação no banco
-- ---------------------------------------------------------------------
update public.perfis set
  usuario = left(usuario, 20),
  nome    = left(nome, 40),
  apelido = left(apelido, 30),
  bio     = left(bio, 140)
where char_length(usuario) > 20 or char_length(nome) > 40
   or char_length(apelido) > 30 or char_length(bio) > 140;

alter table public.perfis drop constraint if exists perfis_limites_check;
alter table public.perfis add constraint perfis_limites_check check (
  char_length(usuario) between 1 and 20
  and char_length(nome)    <= 40
  and char_length(apelido) <= 30
  and char_length(bio)     <= 140
);

create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u text := lower(trim(coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email, '@', 1))));
  primeiro_admin boolean := u = 'kayo' and not exists (select 1 from perfis where admin);
  com_visitantes boolean := coalesce((select (dados->>'visitantesAtivos')::boolean from config where id = 1), true);
begin
  if u !~ '^[a-z0-9._-]{3,20}$' then
    raise exception 'Nome de usuário inválido.';
  end if;

  insert into perfis (id, usuario, nome, status, admin)
  values (
    new.id,
    u,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'nome'), ''), u), 40),
    'aprovado',
    primeiro_admin
  );

  insert into perfil_tags (perfil_id, tag_id)
  values (new.id, id_tag(case when primeiro_admin or not com_visitantes then 'Katequista' else 'Visitante' end))
  on conflict do nothing;

  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 2) ANÚNCIOS E RECADOS: ninguém muda o autor nem o texto depois de postar
-- (o update no site serve só para mudar "prioridade" ou "fixado")
-- ---------------------------------------------------------------------
create or replace function public.proteger_anuncio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.autor_id           := old.autor_id;
    new.titulo             := old.titulo;
    new.texto              := old.texto;
    new.visivel_visitantes := old.visivel_visitantes;
    new.criado_em          := old.criado_em;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_anuncio on public.anuncios;
create trigger proteger_anuncio
  before update on public.anuncios
  for each row execute function public.proteger_anuncio();

create or replace function public.proteger_recado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.autor_id           := old.autor_id;
    new.texto              := old.texto;
    new.visivel_visitantes := old.visivel_visitantes;
    new.criado_em          := old.criado_em;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_recado on public.recados;
create trigger proteger_recado
  before update on public.recados
  for each row execute function public.proteger_recado();


-- ---------------------------------------------------------------------
-- 3) LOJA: revenda calcula sobre o preço com desconto e devolve os 3 XP
-- ---------------------------------------------------------------------
create or replace function public.vender_item(id_item bigint) returns json
language plpgsql security definer set search_path = public as $$
declare
  c          carteiras%rowtype;
  i          itens_loja%rowtype;
  bi         record;
  preco_base bigint;
  valor      bigint;
begin
  c := minha_carteira_travada();
  select * into i from itens_loja where id = id_item;
  if not found then raise exception 'Item não encontrado.'; end if;
  if i.revenda <= 0 then raise exception 'Esse item não pode ser vendido.'; end if;
  update inventario set quantidade = quantidade - 1
   where perfil_id = auth.uid() and item_id = i.id and quantidade > 0;
  if not found then raise exception 'Você não tem esse item.'; end if;

  -- Calcula sobre o preço com desconto para ninguém comprar barato e revender mais caro
  select * into bi from bonus_itens(auth.uid(), null);
  preco_base := ceil(i.preco * (1 - bi.p_desconto));
  valor := floor(preco_base * least(i.revenda, 1));

  if i.estoque is not null then update itens_loja set estoque = estoque + 1 where id = i.id; end if;
  update carteiras set xp = greatest(0, xp - 3) where perfil_id = auth.uid();
  return json_build_object('valor', valor, 'saldo', mexer_saldo(auth.uid(), valor, 'venda', 'Vendeu ' || i.nome));
end;
$$;


-- ---------------------------------------------------------------------
-- 4) SORTEIOS: trava a linha durante o sorteio (evita item repetido)
-- ---------------------------------------------------------------------
create or replace function public.sortear(id_sorteio bigint) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  s         sorteios%rowtype;
  opcoes    text[];
  escolhido text;
begin
  select * into s from sorteios where id = id_sorteio for update;
  if not found then raise exception 'Sorteio não encontrado.'; end if;
  if not (eh_katequista() and (s.autor_id = auth.uid() or eh_admin())) then
    raise exception 'Só quem criou o sorteio (ou um admin) pode sortear.';
  end if;

  opcoes := s.itens;
  if s.sem_repetir then
    select coalesce(array_agg(i), '{}') into opcoes
      from unnest(s.itens) as i
     where i not in (select item from sorteio_resultados where sorteio_id = s.id);
  end if;
  if cardinality(opcoes) = 0 then
    raise exception 'Todos os itens já foram sorteados.';
  end if;

  escolhido := opcoes[1 + floor(random() * cardinality(opcoes))::int];
  insert into sorteio_resultados (sorteio_id, item, sorteado_por) values (s.id, escolhido, auth.uid());
  return escolhido;
end;
$$;


-- ---------------------------------------------------------------------
-- 5) ARQUIVOS: leitura da loja + trava de pastas por permissão no envio
-- ---------------------------------------------------------------------
create or replace function public.pode_ver_arquivo(caminho text) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_katequista() or (eh_aprovado() and (
       caminho like 'perfis/%'
    or caminho like 'semana/%'
    or caminho like 'politica/%'
    or caminho like 'loja/%'
    or exists (select 1 from midias   where path      = caminho and visivel_visitantes)
    or exists (select 1 from eventos  where foto_path = caminho and visivel_visitantes)
    or exists (select 1 from enquetes where foto_path = caminho and visivel_visitantes)
    or exists (select 1 from sorteios where foto_path = caminho and visivel_visitantes)
  ));
$$;

-- O caminho é sempre "<pasta>/<id-de-quem-enviou>/<arquivo>".
-- Visitante: só perfis/. Katequista: pastas normais do site. Admin: também semana/, politica/ e loja/.
create or replace function public.pode_enviar_arquivo(caminho text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(caminho, '/', 2) = auth.uid()::text and (
       (eh_aprovado()   and split_part(caminho, '/', 1) = 'perfis')
    or (eh_katequista() and split_part(caminho, '/', 1) in ('perfis', 'eventos', 'midias', 'enquetes', 'sorteios'))
    or (eh_admin()      and split_part(caminho, '/', 1) in ('semana', 'politica', 'loja'))
  );
$$;

drop policy if exists "katequese: membros enviam arquivos" on storage.objects;
create policy "katequese: membros enviam arquivos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'arquivos' and public.pode_enviar_arquivo(name));


-- ---------------------------------------------------------------------
-- 6) TAGS E CÂMARA: mantém Katequista/Visitante no fim da hierarquia e
--    não encerra proposta antes do prazo quando ainda há 0 deputados
-- ---------------------------------------------------------------------
create or replace function public.ordenar_tags(ids bigint[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'Só administradores.'; end if;
  update tags t set ordem = case
      when t.sistema and t.nome = 'Katequista' then 900
      when t.sistema and t.nome = 'Visitante'  then 950
      else k.pos * 10 end
    from unnest(ids) with ordinality as k(id, pos)
   where t.id = k.id;
end;
$$;

create or replace function public.apurar_proposta(pid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  p     propostas_lei%rowtype;
  sim   int;
  nao   int;
  total int;
begin
  select * into p from propostas_lei where id = pid for update;
  if not found then return; end if;

  if p.status = 'camara' then
    select count(*) filter (where voto), count(*) filter (where not voto)
      into sim, nao from votos_camara where proposta_id = pid;
    total := total_deputados();
    -- Se ainda não houver nenhum deputado cadastrado (total = 0), espera até o prazo acabar
    if now() < p.fim_camara and (total = 0 or sim + nao < total) then return; end if;
    if sim > nao then
      perform aplicar_proposta(pid);
      update propostas_lei set status = 'aprovada', encerrada_em = now(),
        resultado = format('Aprovada pela Câmara: %s a %s.', sim, nao) where id = pid;
    elsif nao > sim then
      update propostas_lei set status = 'rejeitada', encerrada_em = now(),
        resultado = format('Rejeitada pela Câmara: %s a %s.', nao, sim) where id = pid;
    else
      update propostas_lei set status = 'empate',
        resultado = format('Empate na Câmara: %s a %s.', sim, nao) where id = pid;
    end if;

  elsif p.status = 'popular' and now() >= p.fim_popular then
    select count(*) filter (where voto), count(*) filter (where not voto)
      into sim, nao from votos_populares where proposta_id = pid;
    if sim > nao then
      perform aplicar_proposta(pid);
      update propostas_lei set status = 'aprovada', encerrada_em = now(),
        resultado = p.resultado || format(' Aprovada no voto popular: %s a %s.', sim, nao) where id = pid;
    else
      update propostas_lei set status = 'rejeitada', encerrada_em = now(),
        resultado = p.resultado || format(' Rejeitada no voto popular: %s a %s%s.', nao, sim,
          case when sim = nao then ' (empate mantém como está)' else '' end) where id = pid;
    end if;
  end if;
end;
$$;
revoke execute on function public.apurar_proposta(bigint) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 7) REGISTRO EM ATUALIZAÇÕES (entra só uma vez)
-- ---------------------------------------------------------------------
insert into public.atualizacoes (criado_em, tipo, titulo, descricao, autor_nome, autor_id)
select v.criado_em::timestamptz, v.tipo, v.titulo, v.descricao, 'Kayo',
       (select id from public.perfis where usuario = 'kayo')
  from (values
    ('2026-10-24 18:00-03', 'correcao', 'Correções de segurança no banco e na loja',
     'Revenda de itens na loja agora respeita o desconto de compra; proteção contra edição de texto/autor em anúncios e recados; limites de tamanho nos perfis, trava de pastas no envio de imagens e proteção contra repetição em sorteios simultâneos.'),
    ('2026-10-24 18:00-03', 'banco', 'supabase-18.sql',
     'Triggers proteger_anuncio e proteger_recado, constraint perfis_limites_check, função pode_enviar_arquivo e ajustes em novo_usuario, vender_item, sortear e pode_ver_arquivo.')
  ) as v(criado_em, tipo, titulo, descricao)
 where not exists (select 1 from public.atualizacoes a where a.titulo = v.titulo);
