-- =====================================================================
-- supabase-16.sql — atualização: ECONOMIA 3 + CADASTRO SEM VISITANTES
--
--   - Trabalhos com espera bem menor (5 a 20 min) e pagamento proporcional.
--   - Itens da loja com ATRIBUTOS que mexem na economia (o admin escolhe):
--       pagamento, espera, chance de extra e ajuda no minijogo (em todas
--       as profissões ou só numa), XP, bônus diário fixo, rendimento do
--       saldo, prêmio e cashback no cassino, desconto na loja, imagem,
--       limite por pessoa, revenda e itens de uso (efeito por X horas).
--   - Novas ações: usar_item (consumíveis) e vender_item.
--   - Transferir dinheiro só a partir do nível 3 (evita contas extras).
--   - Visitantes podem ver o ranking da economia (e mais nada).
--   - Config "visitantesAtivos": desligada no Admin, quem se cadastra já
--     entra como Katequista.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase-15.sql já executado. Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) TRABALHOS: esperas menores e pagamento proporcional
--    (dá ~130 a 145 K$ por hora jogando bem em qualquer profissão)
-- ---------------------------------------------------------------------
update public.trabalhos t set
  espera_min    = v.espera,
  pagamento_min = v.pmin,
  pagamento_max = v.pmax,
  xp_geral      = v.xp
from (values
  ('entregador',     5,  8, 16, 3),
  ('churrasqueiro',  8, 14, 24, 4),
  ('dj',            12, 20, 36, 5),
  ('programador',   15, 25, 45, 6),
  ('empresario',    20, 30, 56, 8)
) as v(id, espera, pmin, pmax, xp)
where t.id = v.id;


-- ---------------------------------------------------------------------
-- 2) ATRIBUTOS DOS ITENS DA LOJA
-- ---------------------------------------------------------------------
-- Percentuais em fração: 0.10 = 10%.
alter table public.itens_loja add column if not exists foto_path      text;
alter table public.itens_loja add column if not exists trabalho_alvo  text references public.trabalhos(id) on delete set null; -- vazio = todas as profissões
alter table public.itens_loja add column if not exists pagamento      numeric not null default 0;  -- +% no pagamento dos trabalhos
alter table public.itens_loja add column if not exists espera         numeric not null default 0;  -- −% na espera dos trabalhos
alter table public.itens_loja add column if not exists extra          numeric not null default 0;  -- + chance de gorjeta/extra
alter table public.itens_loja add column if not exists ajuda          int     not null default 0;  -- minijogo mais fácil
alter table public.itens_loja add column if not exists xp             numeric not null default 0;  -- +% de XP geral nos trabalhos
alter table public.itens_loja add column if not exists diario         bigint  not null default 0;  -- + K$ fixos no bônus diário
alter table public.itens_loja add column if not exists rendimento     numeric not null default 0;  -- % do saldo que rende no bônus diário
alter table public.itens_loja add column if not exists cassino_premio numeric not null default 0;  -- +% nos prêmios do cassino
alter table public.itens_loja add column if not exists cassino_volta  numeric not null default 0;  -- % da aposta perdida que volta
alter table public.itens_loja add column if not exists desconto       numeric not null default 0;  -- −% no preço da loja e dos equipamentos
alter table public.itens_loja add column if not exists duracao_horas  numeric;                     -- vazio = efeito permanente; com valor = item de usar
alter table public.itens_loja add column if not exists limite         int;                         -- máximo por pessoa (vazio = sem limite)
alter table public.itens_loja add column if not exists revenda        numeric not null default 0;  -- % do preço devolvido ao vender (0 = não vende)

-- Efeitos de itens "de usar" que estão valendo agora
create table if not exists public.efeitos_ativos (
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  item_id    bigint not null references public.itens_loja(id) on delete cascade,
  ate        timestamptz not null,
  primary key (perfil_id, item_id)
);
alter table public.efeitos_ativos enable row level security;
drop policy if exists "ver efeitos ativos" on public.efeitos_ativos;
create policy "ver efeitos ativos" on public.efeitos_ativos for select using (eh_katequista());

-- Extrato aceita o tipo "venda"
alter table public.transacoes drop constraint if exists transacoes_tipo_check;
alter table public.transacoes add constraint transacoes_tipo_check
  check (tipo in ('inicial', 'trabalho', 'diario', 'enviada', 'recebida', 'compra', 'venda', 'aposta', 'premio', 'admin'));

-- Visitantes veem o ranking (só leitura; continuam sem poder fazer nada)
drop policy if exists "ver carteiras" on public.carteiras;
create policy "ver carteiras" on public.carteiras for select using (eh_aprovado());


-- ---------------------------------------------------------------------
-- 3) SOMA DOS EFEITOS DOS ITENS
-- ---------------------------------------------------------------------
-- Vale: item permanente que a pessoa tem (1 ou mais) + item de usar com efeito ativo.
-- Cada item conta UMA vez (ter 3 iguais não triplica o efeito).
-- Efeitos de trabalho (pagamento, espera, extra, ajuda, xp) respeitam a profissão alvo.
create or replace function public.bonus_itens(quem uuid, id_trabalho text default null,
  out p_pagamento numeric, out p_espera numeric, out p_extra numeric, out p_ajuda int, out p_xp numeric,
  out p_diario bigint, out p_rendimento numeric, out p_cassino_premio numeric, out p_cassino_volta numeric,
  out p_desconto numeric)
language sql stable security definer set search_path = public as $$
  with valendo as (
    select i.*, (i.trabalho_alvo is null or i.trabalho_alvo = id_trabalho) as vale_trabalho
      from itens_loja i
     where (i.duracao_horas is null and exists (
              select 1 from inventario v where v.perfil_id = quem and v.item_id = i.id and v.quantidade > 0))
        or exists (select 1 from efeitos_ativos a where a.perfil_id = quem and a.item_id = i.id and a.ate > now())
  )
  select
    coalesce(sum(pagamento) filter (where vale_trabalho), 0),
    coalesce(sum(espera)    filter (where vale_trabalho), 0),
    coalesce(sum(extra)     filter (where vale_trabalho), 0),
    coalesce(sum(ajuda)     filter (where vale_trabalho), 0)::int,
    coalesce(sum(xp)        filter (where vale_trabalho), 0),
    coalesce(sum(diario), 0)::bigint,
    least(coalesce(sum(rendimento), 0), 0.05),        -- no máximo 5% do saldo por dia
    coalesce(sum(cassino_premio), 0),
    least(coalesce(sum(cassino_volta), 0), 0.5),      -- no máximo metade de volta
    least(coalesce(sum(desconto), 0), 0.5)            -- no máximo 50% de desconto
  from valendo;
$$;

-- Para o site mostrar os bônus: os gerais e os de cada profissão
create or replace function public.meus_bonus_itens() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  g  record;
  b  record;
  t  record;
  pt jsonb := '{}';
begin
  if not eh_katequista() then return null; end if;
  select * into g from bonus_itens(auth.uid(), null);
  for t in select id from trabalhos loop
    select * into b from bonus_itens(auth.uid(), t.id);
    pt := pt || jsonb_build_object(t.id, jsonb_build_object(
      'pagamento', b.p_pagamento, 'espera', b.p_espera, 'extra', b.p_extra, 'ajuda', b.p_ajuda, 'xp', b.p_xp));
  end loop;
  return json_build_object(
    'diario', g.p_diario, 'rendimento', g.p_rendimento, 'cassino_premio', g.p_cassino_premio,
    'cassino_volta', g.p_cassino_volta, 'desconto', g.p_desconto, 'por_trabalho', pt);
end;
$$;


-- ---------------------------------------------------------------------
-- 4) TRABALHAR (agora somando equipamentos + itens)
-- ---------------------------------------------------------------------
create or replace function public.comecar_trabalho(id_trabalho text) returns json
language plpgsql security definer set search_path = public as $$
declare
  c   carteiras%rowtype;
  t   trabalhos%rowtype;
  tn  trabalho_niveis%rowtype;
  ef  record;
  bi  record;
  esp numeric;
begin
  c := minha_carteira_travada();
  select * into t from trabalhos where id = id_trabalho;
  if not found then raise exception 'Trabalho não encontrado.'; end if;

  insert into trabalho_niveis (perfil_id, trabalho_id) values (auth.uid(), t.id) on conflict do nothing;
  select * into tn from trabalho_niveis where perfil_id = auth.uid() and trabalho_id = t.id for update;
  select * into ef from efeitos_trabalho(auth.uid(), t.id);
  select * into bi from bonus_itens(auth.uid(), t.id);
  esp := least(0.6, ef.p_espera + bi.p_espera);

  if tn.ultimo_em is not null
     and tn.ultimo_em + make_interval(secs => t.espera_min * 60 * (1 - esp)) > now() then
    raise exception 'Ainda não dá para trabalhar de novo como %.', t.nome;
  end if;

  update trabalho_niveis set ultimo_em = now(), jogando_desde = now()
   where perfil_id = auth.uid() and trabalho_id = t.id;

  return json_build_object('ajuda', ef.p_ajuda + bi.p_ajuda);
end;
$$;

create or replace function public.trabalhar(id_trabalho text, desempenho int default 0) returns json
language plpgsql security definer set search_path = public as $$
declare
  c             carteiras%rowtype;
  t             trabalhos%rowtype;
  tn            trabalho_niveis%rowtype;
  ef            record;
  bi            record;
  d             numeric;
  nivel_t_antes int;
  nivel_t       int;
  nivel_antes   int;
  ganho         bigint;
  extra         bigint := 0;
  chance        numeric;
  xp_t          int;
  xp_g          int;
  saldo_novo    bigint;
begin
  c := minha_carteira_travada();
  select * into t from trabalhos where id = id_trabalho;
  if not found then raise exception 'Trabalho não encontrado.'; end if;

  select * into tn from trabalho_niveis where perfil_id = auth.uid() and trabalho_id = t.id for update;
  if not found or tn.jogando_desde is null then
    raise exception 'Esse turno não foi começado.';
  end if;
  if now() - tn.jogando_desde < interval '4 seconds' then
    raise exception 'Rápido demais.';
  end if;
  if now() - tn.jogando_desde > interval '5 minutes' then
    update trabalho_niveis set jogando_desde = null where perfil_id = auth.uid() and trabalho_id = t.id;
    raise exception 'O turno expirou.';
  end if;

  select * into ef from efeitos_trabalho(auth.uid(), t.id);
  select * into bi from bonus_itens(auth.uid(), t.id);
  d := least(100, greatest(0, coalesce(desempenho, 0)));
  nivel_t_antes := nivel_trabalho(tn.xp);
  nivel_antes   := nivel_de(c.xp);

  ganho := greatest(1, floor(
      (t.pagamento_min + random() * (t.pagamento_max - t.pagamento_min))
    * (1 + 0.1 * (nivel_t_antes - 1))
    * (1 + ef.p_pagamento + bi.p_pagamento)
    * (0.4 + 0.6 * d / 100)));

  chance := t.chance_extra + ef.p_extra + bi.p_extra + 0.15 * d / 100;
  if random() < chance then
    extra := greatest(1, floor(ganho * (0.25 + random() * 0.35)));
  end if;

  xp_t := case when d >= 70 then 2 else 1 end;
  xp_g := round(t.xp_geral * (1 + bi.p_xp));
  update trabalho_niveis set xp = xp + xp_t, vezes = vezes + 1, jogando_desde = null
   where perfil_id = auth.uid() and trabalho_id = t.id;
  update carteiras set xp = xp + xp_g where perfil_id = auth.uid();
  nivel_t := nivel_trabalho(tn.xp + xp_t);

  saldo_novo := mexer_saldo(auth.uid(), ganho, 'trabalho', 'Trabalhou como ' || t.nome);
  if extra > 0 then
    saldo_novo := mexer_saldo(auth.uid(), extra, 'trabalho', t.nome_extra || ' (' || t.nome || ')');
  end if;

  return json_build_object(
    'ganho', ganho, 'extra', extra, 'nome_extra', t.nome_extra, 'desempenho', d,
    'saldo', saldo_novo, 'xp_ganho', xp_g,
    'nivel_trabalho', nivel_t, 'subiu_trabalho', nivel_t > nivel_t_antes,
    'nivel', nivel_de(c.xp + xp_g), 'subiu_nivel', nivel_de(c.xp + xp_g) > nivel_antes
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 5) BÔNUS DIÁRIO: 50 + 10 por nível + itens (fixo + rendimento do saldo, até K$ 2.000)
-- ---------------------------------------------------------------------
create or replace function public.bonus_diario() returns json
language plpgsql security definer set search_path = public as $$
declare
  c     carteiras%rowtype;
  bi    record;
  hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  base  bigint;
  rende bigint;
begin
  c := minha_carteira_travada();
  if c.ultimo_diario = hoje then raise exception 'Você já pegou o bônus de hoje. Volte amanhã.'; end if;
  select * into bi from bonus_itens(auth.uid(), null);
  base  := 50 + 10 * nivel_de(c.xp) + bi.p_diario;
  rende := least(2000, floor(c.saldo * bi.p_rendimento));
  update carteiras set ultimo_diario = hoje, xp = xp + 5 where perfil_id = auth.uid();
  perform mexer_saldo(auth.uid(), base, 'diario', 'Bônus diário');
  if rende > 0 then perform mexer_saldo(auth.uid(), rende, 'diario', 'Rendimento do saldo'); end if;
  return json_build_object('ganho', base + rende, 'rendimento', rende,
    'saldo', (select saldo from carteiras where perfil_id = auth.uid()));
end;
$$;


-- ---------------------------------------------------------------------
-- 6) LOJA: comprar (com desconto e limite), usar, vender; equipamentos com desconto
-- ---------------------------------------------------------------------
create or replace function public.comprar(id_item bigint) returns json
language plpgsql security definer set search_path = public as $$
declare
  c     carteiras%rowtype;
  i     itens_loja%rowtype;
  bi    record;
  preco bigint;
  tenho int;
begin
  c := minha_carteira_travada();
  select * into i from itens_loja where id = id_item and ativo for update;
  if not found then raise exception 'Item não disponível.'; end if;
  if nivel_de(c.xp) < i.nivel_minimo then raise exception 'Esse item libera no nível %.', i.nivel_minimo; end if;
  if i.estoque is not null and i.estoque < 1 then raise exception 'Esgotado.'; end if;
  select coalesce(max(quantidade), 0) into tenho from inventario where perfil_id = auth.uid() and item_id = i.id;
  if i.limite is not null and tenho >= i.limite then
    raise exception 'Você já tem o máximo desse item (%).', i.limite;
  end if;
  select * into bi from bonus_itens(auth.uid(), null);
  preco := ceil(i.preco * (1 - bi.p_desconto));
  if c.saldo < preco then raise exception 'Saldo insuficiente.'; end if;

  if i.estoque is not null then update itens_loja set estoque = estoque - 1 where id = i.id; end if;
  insert into inventario (perfil_id, item_id, quantidade) values (auth.uid(), i.id, 1)
  on conflict (perfil_id, item_id) do update set quantidade = inventario.quantidade + 1;
  update carteiras set xp = xp + 3 where perfil_id = auth.uid();
  return json_build_object('pago', preco, 'saldo', mexer_saldo(auth.uid(), -preco, 'compra', 'Comprou ' || i.nome));
end;
$$;

create or replace function public.comprar_equipamento(id_equip text) returns json
language plpgsql security definer set search_path = public as $$
declare
  c     carteiras%rowtype;
  e     equipamentos%rowtype;
  bi    record;
  xpt   int;
  preco bigint;
begin
  c := minha_carteira_travada();
  select * into e from equipamentos where id = id_equip;
  if not found then raise exception 'Equipamento não encontrado.'; end if;
  if exists (select 1 from meus_equipamentos where perfil_id = auth.uid() and equipamento_id = e.id) then
    raise exception 'Você já tem esse equipamento.';
  end if;
  select coalesce(max(xp), 0) into xpt from trabalho_niveis where perfil_id = auth.uid() and trabalho_id = e.trabalho_id;
  if nivel_trabalho(xpt) < e.nivel_min then
    raise exception 'Precisa do nível % nessa profissão.', e.nivel_min;
  end if;
  if e.requer is not null and not exists (
      select 1 from meus_equipamentos where perfil_id = auth.uid() and equipamento_id = e.requer) then
    raise exception 'Precisa ter % antes.', (select nome from equipamentos where id = e.requer);
  end if;
  select * into bi from bonus_itens(auth.uid(), null);
  preco := ceil(e.preco * (1 - bi.p_desconto));
  if c.saldo < preco then raise exception 'Saldo insuficiente.'; end if;

  insert into meus_equipamentos (perfil_id, equipamento_id) values (auth.uid(), e.id);
  update carteiras set xp = xp + 3 where perfil_id = auth.uid();
  return json_build_object('pago', preco, 'saldo', mexer_saldo(auth.uid(), -preco, 'compra', 'Comprou ' || e.nome));
end;
$$;

-- Usar um item "de usar": gasta 1 e liga o efeito por X horas (usar de novo soma mais tempo)
create or replace function public.usar_item(id_item bigint) returns json
language plpgsql security definer set search_path = public as $$
declare
  c   carteiras%rowtype;
  i   itens_loja%rowtype;
  fim timestamptz;
begin
  c := minha_carteira_travada();
  select * into i from itens_loja where id = id_item;
  if not found then raise exception 'Item não encontrado.'; end if;
  if i.duracao_horas is null then raise exception 'Esse item não é de usar: o efeito já vale enquanto você tiver.'; end if;
  update inventario set quantidade = quantidade - 1
   where perfil_id = auth.uid() and item_id = i.id and quantidade > 0;
  if not found then raise exception 'Você não tem esse item.'; end if;

  insert into efeitos_ativos (perfil_id, item_id, ate)
  values (auth.uid(), i.id, now() + make_interval(secs => i.duracao_horas * 3600))
  on conflict (perfil_id, item_id) do update
    set ate = greatest(efeitos_ativos.ate, now()) + make_interval(secs => i.duracao_horas * 3600)
  returning ate into fim;
  return json_build_object('ate', fim);
end;
$$;

-- Vender um item de volta (só se ele tiver revenda)
create or replace function public.vender_item(id_item bigint) returns json
language plpgsql security definer set search_path = public as $$
declare
  c     carteiras%rowtype;
  i     itens_loja%rowtype;
  valor bigint;
begin
  c := minha_carteira_travada();
  select * into i from itens_loja where id = id_item;
  if not found then raise exception 'Item não encontrado.'; end if;
  if i.revenda <= 0 then raise exception 'Esse item não pode ser vendido.'; end if;
  update inventario set quantidade = quantidade - 1
   where perfil_id = auth.uid() and item_id = i.id and quantidade > 0;
  if not found then raise exception 'Você não tem esse item.'; end if;
  valor := floor(i.preco * least(i.revenda, 1));
  if i.estoque is not null then update itens_loja set estoque = estoque + 1 where id = i.id; end if;
  return json_build_object('valor', valor, 'saldo', mexer_saldo(auth.uid(), valor, 'venda', 'Vendeu ' || i.nome));
end;
$$;


-- ---------------------------------------------------------------------
-- 7) TRANSFERIR: só a partir do nível 3 (conta nova não manda dinheiro)
-- ---------------------------------------------------------------------
create or replace function public.transferir(para uuid, valor bigint, mensagem text default '') returns json
language plpgsql security definer set search_path = public as $$
declare
  c carteiras%rowtype;
  nome_para text;
  nome_de text;
begin
  c := minha_carteira_travada();
  if nivel_de(c.xp) < 3 then raise exception 'Transferências liberam no nível 3.'; end if;
  if valor is null or valor < 1 then raise exception 'Valor inválido.'; end if;
  if para = auth.uid() then raise exception 'Não dá para transferir para você mesmo.'; end if;
  if c.saldo < valor then raise exception 'Saldo insuficiente.'; end if;
  if not exists (
    select 1 from perfis p where p.id = para and p.status = 'aprovado' and (p.admin or exists (
      select 1 from perfil_tags pt join tags t on t.id = pt.tag_id
       where pt.perfil_id = p.id and t.nome = 'Katequista' and t.sistema))) then
    raise exception 'Essa pessoa não participa da economia.';
  end if;

  insert into carteiras (perfil_id) values (para) on conflict do nothing;
  if found then
    insert into transacoes (perfil_id, valor, tipo, descricao) values (para, 500, 'inicial', 'Dinheiro inicial');
  end if;
  select coalesce(nullif(apelido, ''), nome) into nome_para from perfis where id = para;
  select coalesce(nullif(apelido, ''), nome) into nome_de from perfis where id = auth.uid();
  mensagem := left(coalesce(mensagem, ''), 120);

  perform mexer_saldo(para, valor, 'recebida',
    'Recebido de ' || nome_de || case when mensagem <> '' then ': ' || mensagem else '' end, auth.uid());
  return json_build_object('saldo', mexer_saldo(auth.uid(), -valor, 'enviada',
    'Enviado para ' || nome_para || case when mensagem <> '' then ': ' || mensagem else '' end, para));
end;
$$;


-- ---------------------------------------------------------------------
-- 8) CASSINO: igual ao anterior + itens (prêmio maior e cashback ao perder)
-- ---------------------------------------------------------------------
create or replace function public.apostar(jogo text, valor bigint, escolha text default null) returns json
language plpgsql security definer set search_path = public as $$
declare
  c          carteiras%rowtype;
  bi         record;
  premio     bigint := 0;
  volta      bigint := 0;
  resultado  json;
  numero     int;
  cor        text;
  lado       text;
  simbolos   text[] := array['cereja', 'limao', 'sino', 'estrela', 'sete'];
  pesos      int[]  := array[40, 30, 15, 10, 5];
  pagamento  int[]  := array[5, 8, 15, 30, 100];
  rolos      text[] := '{}';
  sorteio    int;
  acumulado  int;
  k          int;
  r          int;
  vermelhos  int[]  := array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  nome_jogo  text;
begin
  c := minha_carteira_travada();
  if valor is null or valor < 10 then raise exception 'A aposta mínima é K$ 10.'; end if;
  if valor > 50000 then raise exception 'A aposta máxima é K$ 50.000.'; end if;
  if c.saldo < valor then raise exception 'Saldo insuficiente.'; end if;
  select * into bi from bonus_itens(auth.uid(), null);

  nome_jogo := case jogo when 'moeda' then 'Cara ou Coroa' when 'roleta' then 'Roleta' when 'slots' then 'Caça-níquel' else jogo end;
  perform mexer_saldo(auth.uid(), -valor, 'aposta', 'Aposta: ' || nome_jogo);

  if jogo = 'moeda' then
    if escolha not in ('cara', 'coroa') then raise exception 'Escolha cara ou coroa.'; end if;
    lado := case when random() < 0.5 then 'cara' else 'coroa' end;
    if lado = escolha then premio := valor * 2; end if;
    resultado := json_build_object('lado', lado);

  elsif jogo = 'roleta' then
    if escolha not in ('vermelho', 'preto', 'verde') then raise exception 'Escolha vermelho, preto ou verde.'; end if;
    numero := floor(random() * 37)::int;
    cor := case when numero = 0 then 'verde' when numero = any(vermelhos) then 'vermelho' else 'preto' end;
    if cor = escolha then premio := valor * (case when cor = 'verde' then 36 else 2 end); end if;
    resultado := json_build_object('numero', numero, 'cor', cor);

  elsif jogo = 'slots' then
    for r in 1..3 loop
      sorteio := floor(random() * 100)::int;
      acumulado := 0;
      for k in 1..5 loop
        acumulado := acumulado + pesos[k];
        if sorteio < acumulado then rolos := rolos || simbolos[k]; exit; end if;
      end loop;
    end loop;
    if rolos[1] = rolos[2] and rolos[2] = rolos[3] then
      premio := valor * pagamento[array_position(simbolos, rolos[1])];
    elsif (select count(*) from unnest(rolos) s where s = 'cereja') = 2 then
      premio := valor;
    end if;
    resultado := json_build_object('rolos', rolos);

  else
    raise exception 'Jogo desconhecido.';
  end if;

  update carteiras set xp = xp + 2 where perfil_id = auth.uid();
  if premio > valor then
    -- Bônus dos itens só no lucro de verdade (não no "devolve" do caça-níquel)
    premio := premio + floor((premio - valor) * bi.p_cassino_premio);
  end if;
  if premio > 0 then
    perform mexer_saldo(auth.uid(), premio, 'premio', 'Prêmio: ' || nome_jogo);
  elsif bi.p_cassino_volta > 0 then
    volta := floor(valor * bi.p_cassino_volta);
    if volta > 0 then perform mexer_saldo(auth.uid(), volta, 'premio', 'Cashback: ' || nome_jogo); end if;
  end if;

  return json_build_object(
    'resultado', resultado,
    'premio', premio,
    'cashback', volta,
    'lucro', premio + volta - valor,
    'saldo', (select saldo from carteiras where perfil_id = auth.uid())
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 9) CADASTRO: com "visitantesAtivos" desligado na config, entra como Katequista
-- ---------------------------------------------------------------------
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u text := lower(coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email, '@', 1)));
  primeiro_admin boolean := u = 'kayo' and not exists (select 1 from perfis where admin);
  com_visitantes boolean := coalesce((select (dados->>'visitantesAtivos')::boolean from config where id = 1), true);
begin
  insert into perfis (id, usuario, nome, status, admin)
  values (
    new.id,
    u,
    coalesce(nullif(new.raw_user_meta_data->>'nome', ''), u),
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
-- 10) REGISTRO EM ATUALIZAÇÕES (entra só uma vez)
-- ---------------------------------------------------------------------
insert into public.atualizacoes (criado_em, tipo, titulo, descricao, autor_nome, autor_id)
select v.criado_em::timestamptz, v.tipo, v.titulo, v.descricao, 'Kayo',
       (select id from public.perfis where usuario = 'kayo')
  from (values
    ('2026-10-24 12:25-03', 'melhoria', 'Economia: trabalhos rebalanceados',
     'Esperas de 5 a 20 minutos com pagamento proporcional; empresário paga menos; Caça aos bugs mais fácil.'),
    ('2026-10-24 12:25-03', 'nova', 'Loja: itens com atributos',
     'O admin cria itens com imagem e efeitos na economia: pagamento, espera, gorjeta, minijogo, XP, bônus diário, rendimento, prêmio e cashback no cassino, desconto, limite, revenda e itens de usar. Preço e nível editáveis.'),
    ('2026-10-24 12:25-03', 'nova', 'Cadastro sem visitantes (opção no Admin)',
     'Com a opção desligada, quem se cadastra já entra como Katequista. Transferências só a partir do nível 3. Economia agora fica na barra do menu; visitantes só veem o ranking.'),
    ('2026-10-24 12:25-03', 'banco', 'supabase-16.sql',
     'Colunas de atributos em itens_loja, tabela efeitos_ativos, funções bonus_itens, meus_bonus_itens, usar_item, vender_item; trabalhar, comprar, apostar, bonus_diario, transferir e novo_usuario atualizadas.')
  ) as v(criado_em, tipo, titulo, descricao)
 where not exists (select 1 from public.atualizacoes a where a.titulo = v.titulo);
