-- =====================================================================
-- supabase-19.sql — atualização: CASSINO KATEQUISTA + DONO DO CASSINO.
--
--   1) DONO DO CASSINO (concessão por 30 dias):
--      - Qualquer Katequista pode comprar o Cassino quando estiver sem dono
--        (ou quando os 30 dias do dono anterior acabarem).
--      - Enquanto for dono, recebe automaticamente 25% de todas as perdas
--        líquidas dos OUTROS jogadores em qualquer jogo do cassino.
--      - Preço ajustável pelo Admin em Economia → Admin (padrão K$ 25.000).
--
--   2) NOVOS JOGOS (protegidos contra trapaça no banco):
--      - Revoada da Katequese (estilo Aviator): o avião sobe e o multiplicador
--        cresce; o ponto de crash fica escondido no banco até o voo acabar.
--      - Campo Minado do Churrasco (estilo Mines 5x5): o jogador escolhe
--        quantas bombas esconder e abre casa por casa; as bombas ficam
--        escondidas no banco até estourar ou sacar.
--      - Tigrinho da Katequese (Slot 3x3 com 5 linhas + Coringa + Tela Cheia 10x).
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase-18.sql já executado. Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) TABELAS E CONFIGURAÇÃO DO CASSINO
-- ---------------------------------------------------------------------
create table if not exists public.cassino_dono (
  id              int primary key default 1 check (id = 1),
  dono_id         uuid references public.perfis(id) on delete set null,
  comprado_em     timestamptz,
  ate             timestamptz,
  preco_pago      bigint not null default 0,
  lucro_acumulado bigint not null default 0
);
insert into public.cassino_dono (id) values (1) on conflict (id) do nothing;

alter table public.cassino_dono enable row level security;
drop policy if exists "ver dono do cassino" on public.cassino_dono;
create policy "ver dono do cassino" on public.cassino_dono for select using (eh_aprovado());

-- Partidas em andamento (Aviator e Campo Minado).
-- SEM política de SELECT: ninguém consegue ler "bombas" ou "ponto_crash" pelo F12.
create table if not exists public.partidas_cassino (
  perfil_id    uuid not null references public.perfis(id) on delete cascade,
  jogo         text not null check (jogo in ('aviator', 'bomba')),
  aposta       bigint not null check (aposta >= 10),
  qtd_bombas   int,
  bombas       int[],
  abertas      int[] not null default '{}',
  ponto_crash  numeric,
  iniciado_em  timestamptz not null default clock_timestamp(),
  primary key (perfil_id, jogo)
);
alter table public.partidas_cassino enable row level security;

-- Extrato aceita "cassino_dono"
alter table public.transacoes drop constraint if exists transacoes_tipo_check;
alter table public.transacoes add constraint transacoes_tipo_check
  check (tipo in ('inicial', 'trabalho', 'diario', 'enviada', 'recebida', 'compra', 'venda', 'aposta', 'premio', 'cassino_dono', 'admin'));

-- Preço padrão para comprar o cassino por 30 dias (K$ 25.000) e espera dos jogos novos
update public.config
   set dados = jsonb_set(
     case when dados ? 'cassinoPreco' then dados else dados || '{"cassinoPreco": 25000}'::jsonb end,
     '{cassinoEspera}',
     coalesce(dados->'cassinoEspera', '{}'::jsonb) || '{"tigrinho": 3, "aviator": 3, "bomba": 2}'::jsonb
   )
 where id = 1;


-- ---------------------------------------------------------------------
-- 2) COMISSÃO DE 25% DO DONO E COMPRA DO CASSINO
-- ---------------------------------------------------------------------
create or replace function public.pagar_comissao_dono(apostador uuid, perda_liquida bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  cd       cassino_dono%rowtype;
  comissao bigint;
  nome_ap  text;
begin
  if perda_liquida is null or perda_liquida <= 0 then return; end if;
  select * into cd from cassino_dono where id = 1 for update;
  if cd.dono_id is null or cd.ate is null or cd.ate <= now() then return; end if;
  -- Trava anti-exploit: o dono nunca recebe comissão da própria derrota
  if cd.dono_id = apostador then return; end if;

  comissao := floor(perda_liquida * 0.25);
  if comissao <= 0 then return; end if;

  insert into carteiras (perfil_id) values (cd.dono_id) on conflict do nothing;
  select coalesce(nullif(apelido, ''), nome) into nome_ap from perfis where id = apostador;
  perform mexer_saldo(cd.dono_id, comissao, 'cassino_dono', 'Comissão do Cassino (25%): jogada de ' || coalesce(nome_ap, 'membro'), apostador);
  update cassino_dono set lucro_acumulado = lucro_acumulado + comissao where id = 1;
end;
$$;
revoke execute on function public.pagar_comissao_dono(uuid, bigint) from public, anon, authenticated;

-- Devolve quem é o dono atual (limpa se já venceu os 30 dias), o preço e se há jogo de bomba aberto
create or replace function public.estado_cassino() returns json
language plpgsql security definer set search_path = public as $$
declare
  cd    cassino_dono%rowtype;
  dono  record;
  preco bigint;
  bomba record;
begin
  if not eh_katequista() then return null; end if;
  update cassino_dono set dono_id = null where id = 1 and ate is not null and ate <= now();
  select * into cd from cassino_dono where id = 1;
  preco := coalesce((select (dados->>'cassinoPreco')::bigint from config where id = 1), 25000);

  if cd.dono_id is not null then
    select id, nome, apelido, usuario, foto_path into dono from perfis where id = cd.dono_id;
  end if;

  select aposta, qtd_bombas, abertas into bomba
    from partidas_cassino where perfil_id = auth.uid() and jogo = 'bomba';

  return json_build_object(
    'preco', greatest(1000, preco),
    'dono_id', cd.dono_id,
    'dono_nome', case when cd.dono_id is not null then coalesce(nullif(dono.apelido, ''), dono.nome) else null end,
    'dono_usuario', case when cd.dono_id is not null then dono.usuario else null end,
    'dono_foto', case when cd.dono_id is not null then dono.foto_path else null end,
    'comprado_em', cd.comprado_em,
    'ate', cd.ate,
    'lucro_acumulado', cd.lucro_acumulado,
    'bomba_ativa', case when bomba.aposta is not null then json_build_object(
      'aposta', bomba.aposta,
      'qtd_bombas', bomba.qtd_bombas,
      'abertas', bomba.abertas,
      'multiplicador', multiplicador_bomba(bomba.qtd_bombas, cardinality(bomba.abertas))
    ) else null end
  );
end;
$$;

-- Compra a concessão do cassino por 30 dias
create or replace function public.comprar_cassino() returns json
language plpgsql security definer set search_path = public as $$
declare
  c     carteiras%rowtype;
  cd    cassino_dono%rowtype;
  preco bigint;
  novo  bigint;
begin
  c := minha_carteira_travada();
  select * into cd from cassino_dono where id = 1 for update;
  if cd.dono_id is not null and cd.ate is not null and cd.ate > now() then
    raise exception 'O cassino já tem dono até %.', to_char(cd.ate at time zone 'America/Sao_Paulo', 'DD/MM às HH24:MI');
  end if;

  preco := greatest(1000, coalesce((select (dados->>'cassinoPreco')::bigint from config where id = 1), 25000));
  if c.saldo < preco then raise exception 'Saldo insuficiente. O cassino custa K$ %.', preco; end if;

  novo := mexer_saldo(auth.uid(), -preco, 'compra', 'Comprou o Cassino da Katequese (30 dias)');
  update cassino_dono set
    dono_id = auth.uid(),
    comprado_em = now(),
    ate = now() + interval '30 days',
    preco_pago = preco,
    lucro_acumulado = 0
  where id = 1;

  update carteiras set xp = xp + 25 where perfil_id = auth.uid();
  return json_build_object('saldo', novo, 'estado', estado_cassino());
end;
$$;


-- ---------------------------------------------------------------------
-- 3) CAMPO MINADO DO CHURRASCO (BOMBA 5x5)
-- ---------------------------------------------------------------------
create or replace function public.multiplicador_bomba(qtd_bombas int, acertos int) returns numeric
language plpgsql immutable as $$
declare
  mult numeric := 1.0;
  k    int;
begin
  if acertos <= 0 then return 1.0; end if;
  for k in 0..(acertos - 1) loop
    mult := mult * (25.0 - k) / (25.0 - qtd_bombas - k);
  end loop;
  return greatest(1.01, trunc(mult * 0.97, 2));
end;
$$;

create or replace function public.iniciar_bomba(valor bigint, qtd_bombas int default 3) returns json
language plpgsql security definer set search_path = public as $$
declare
  c        carteiras%rowtype;
  espera_s numeric;
  ultima   timestamptz;
  sorteadas int[];
  saldo_n  bigint;
begin
  c := minha_carteira_travada();
  if exists (select 1 from partidas_cassino where perfil_id = auth.uid() and jogo = 'bomba') then
    raise exception 'Você já tem um Campo Minado em andamento.';
  end if;
  if valor is null or valor < 10 then raise exception 'A aposta mínima é K$ 10.'; end if;
  if valor > 50000 then raise exception 'A aposta máxima é K$ 50.000.'; end if;
  if qtd_bombas is null or qtd_bombas < 1 or qtd_bombas > 24 then raise exception 'Escolha entre 1 e 24 bombas.'; end if;
  if c.saldo < valor then raise exception 'Saldo insuficiente.'; end if;

  espera_s := coalesce((select (dados->'cassinoEspera'->>'bomba')::numeric from config where id = 1), 2);
  select em into ultima from ultimas_apostas where perfil_id = auth.uid() and jogo = 'bomba';
  if ultima is not null and ultima + make_interval(secs => espera_s) > now() then
    raise exception 'Espere % s para jogar de novo.', ceil(extract(epoch from (ultima + make_interval(secs => espera_s) - now())));
  end if;
  insert into ultimas_apostas (perfil_id, jogo, em) values (auth.uid(), 'bomba', now())
  on conflict on constraint ultimas_apostas_pkey do update set em = now();

  select array_agg(n) into sorteadas from (
    select n from generate_series(1, 25) n order by random() limit qtd_bombas
  ) s;

  saldo_n := mexer_saldo(auth.uid(), -valor, 'aposta', 'Aposta: Campo Minado');
  update carteiras set xp = xp + 2 where perfil_id = auth.uid();

  insert into partidas_cassino (perfil_id, jogo, aposta, qtd_bombas, bombas, abertas)
  values (auth.uid(), 'bomba', valor, qtd_bombas, sorteadas, '{}');

  return json_build_object('saldo', saldo_n, 'aposta', valor, 'qtd_bombas', qtd_bombas, 'espera', espera_s);
end;
$$;

create or replace function public.abrir_casa_bomba(casa int) returns json
language plpgsql security definer set search_path = public as $$
declare
  p        partidas_cassino%rowtype;
  bi       record;
  volta    bigint := 0;
  mult     numeric;
  premio   bigint;
  restam   int;
  saldo_n  bigint;
begin
  if casa is null or casa < 1 or casa > 25 then raise exception 'Casa inválida.'; end if;
  select * into p from partidas_cassino where perfil_id = auth.uid() and jogo = 'bomba' for update;
  if not found then raise exception 'Nenhuma partida de Campo Minado aberta.'; end if;
  if casa = any(p.abertas) then raise exception 'Essa casa já foi aberta.'; end if;

  select * into bi from bonus_itens(auth.uid(), null);

  -- Clicou numa bomba: fim de jogo!
  if casa = any(p.bombas) then
    delete from partidas_cassino where perfil_id = auth.uid() and jogo = 'bomba';
    if bi.p_cassino_volta > 0 then
      volta := floor(p.aposta * bi.p_cassino_volta);
      if volta > 0 then perform mexer_saldo(auth.uid(), volta, 'premio', 'Cashback: Campo Minado'); end if;
    end if;
    perform pagar_comissao_dono(auth.uid(), p.aposta - volta);
    select saldo into saldo_n from carteiras where perfil_id = auth.uid();
    return json_build_object(
      'explodiu', true,
      'casa', casa,
      'bombas', p.bombas,
      'cashback', volta,
      'saldo', saldo_n
    );
  end if;

  p.abertas := p.abertas || casa;
  mult := multiplicador_bomba(p.qtd_bombas, cardinality(p.abertas));
  restam := 25 - p.qtd_bombas - cardinality(p.abertas);

  -- Se abriu todas as casas seguras, já paga o prêmio máximo na hora!
  if restam <= 0 then
    delete from partidas_cassino where perfil_id = auth.uid() and jogo = 'bomba';
    premio := floor(p.aposta * mult);
    if premio > p.aposta then premio := premio + floor((premio - p.aposta) * bi.p_cassino_premio); end if;
    saldo_n := mexer_saldo(auth.uid(), premio, 'premio', 'Prêmio: Campo Minado');
    return json_build_object(
      'explodiu', false,
      'finalizou', true,
      'abertas', p.abertas,
      'bombas', p.bombas,
      'multiplicador', mult,
      'premio', premio,
      'lucro', premio - p.aposta,
      'saldo', saldo_n
    );
  end if;

  update partidas_cassino set abertas = p.abertas where perfil_id = auth.uid() and jogo = 'bomba';
  premio := floor(p.aposta * mult);
  if premio > p.aposta then premio := premio + floor((premio - p.aposta) * bi.p_cassino_premio); end if;

  return json_build_object(
    'explodiu', false,
    'finalizou', false,
    'abertas', p.abertas,
    'multiplicador', mult,
    'premio_atual', premio
  );
end;
$$;

create or replace function public.sacar_bomba() returns json
language plpgsql security definer set search_path = public as $$
declare
  p       partidas_cassino%rowtype;
  bi      record;
  mult    numeric;
  premio  bigint;
  saldo_n bigint;
begin
  select * into p from partidas_cassino where perfil_id = auth.uid() and jogo = 'bomba' for update;
  if not found then raise exception 'Nenhuma partida aberta.'; end if;
  if cardinality(p.abertas) < 1 then raise exception 'Abra pelo menos 1 casa antes de retirar.'; end if;

  delete from partidas_cassino where perfil_id = auth.uid() and jogo = 'bomba';
  select * into bi from bonus_itens(auth.uid(), null);
  mult := multiplicador_bomba(p.qtd_bombas, cardinality(p.abertas));
  premio := floor(p.aposta * mult);
  if premio > p.aposta then premio := premio + floor((premio - p.aposta) * bi.p_cassino_premio); end if;

  saldo_n := mexer_saldo(auth.uid(), premio, 'premio', 'Prêmio: Campo Minado');
  return json_build_object(
    'ganhou', true,
    'multiplicador', mult,
    'premio', premio,
    'lucro', premio - p.aposta,
    'bombas', p.bombas,
    'saldo', saldo_n
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 4) REVOADA DA KATEQUESE (AVIATOR)
-- ---------------------------------------------------------------------
create or replace function public.iniciar_aviator(valor bigint) returns json
language plpgsql security definer set search_path = public as $$
declare
  c        carteiras%rowtype;
  bi       record;
  espera_s numeric;
  ultima   timestamptz;
  crash    numeric;
  volta    bigint := 0;
  saldo_n  bigint;
begin
  c := minha_carteira_travada();
  -- Se ficou um voo antigo pendurado, limpa antes
  delete from partidas_cassino where perfil_id = auth.uid() and jogo = 'aviator';

  if valor is null or valor < 10 then raise exception 'A aposta mínima é K$ 10.'; end if;
  if valor > 50000 then raise exception 'A aposta máxima é K$ 50.000.'; end if;
  if c.saldo < valor then raise exception 'Saldo insuficiente.'; end if;

  espera_s := coalesce((select (dados->'cassinoEspera'->>'aviator')::numeric from config where id = 1), 3);
  select em into ultima from ultimas_apostas where perfil_id = auth.uid() and jogo = 'aviator';
  if ultima is not null and ultima + make_interval(secs => espera_s) > now() then
    raise exception 'Espere % s para voar de novo.', ceil(extract(epoch from (ultima + make_interval(secs => espera_s) - now())));
  end if;
  insert into ultimas_apostas (perfil_id, jogo, em) values (auth.uid(), 'aviator', now())
  on conflict on constraint ultimas_apostas_pkey do update set em = now();

  saldo_n := mexer_saldo(auth.uid(), -valor, 'aposta', 'Aposta: Revoada da Katequese');
  update carteiras set xp = xp + 2 where perfil_id = auth.uid();

  -- RTP 97%: 3% de chance de crashar na largada (1.00x); senão 0.97 / (1 - r)
  if random() < 0.03 then
    crash := 1.00;
  else
    crash := least(500.00, greatest(1.02, trunc((0.97 / greatest(0.002, 1.0 - random()))::numeric, 2)));
  end if;

  if crash <= 1.00 then
    select * into bi from bonus_itens(auth.uid(), null);
    if bi.p_cassino_volta > 0 then
      volta := floor(valor * bi.p_cassino_volta);
      if volta > 0 then saldo_n := mexer_saldo(auth.uid(), volta, 'premio', 'Cashback: Revoada da Katequese'); end if;
    end if;
    perform pagar_comissao_dono(auth.uid(), valor - volta);
    return json_build_object('explodiu', true, 'ponto_crash', 1.00, 'cashback', volta, 'saldo', saldo_n, 'espera', espera_s);
  end if;

  insert into partidas_cassino (perfil_id, jogo, aposta, ponto_crash, iniciado_em)
  values (auth.uid(), 'aviator', valor, crash, clock_timestamp());

  return json_build_object('explodiu', false, 'saldo', saldo_n, 'espera', espera_s);
end;
$$;

create or replace function public.checar_aviator() returns json
language plpgsql security definer set search_path = public as $$
declare
  p       partidas_cassino%rowtype;
  bi      record;
  seg     numeric;
  mult    numeric;
  volta   bigint := 0;
  saldo_n bigint;
begin
  select * into p from partidas_cassino where perfil_id = auth.uid() and jogo = 'aviator' for update;
  if not found then return json_build_object('voando', false); end if;

  seg := greatest(0, extract(epoch from (clock_timestamp() - p.iniciado_em)));
  mult := greatest(1.00, trunc(exp(0.12 * seg)::numeric, 2));

  if mult >= p.ponto_crash then
    delete from partidas_cassino where perfil_id = auth.uid() and jogo = 'aviator';
    select * into bi from bonus_itens(auth.uid(), null);
    if bi.p_cassino_volta > 0 then
      volta := floor(p.aposta * bi.p_cassino_volta);
      if volta > 0 then perform mexer_saldo(auth.uid(), volta, 'premio', 'Cashback: Revoada da Katequese'); end if;
    end if;
    perform pagar_comissao_dono(auth.uid(), p.aposta - volta);
    select saldo into saldo_n from carteiras where perfil_id = auth.uid();
    return json_build_object('voando', false, 'explodiu', true, 'ponto_crash', p.ponto_crash, 'cashback', volta, 'saldo', saldo_n);
  end if;

  return json_build_object('voando', true, 'multiplicador', mult);
end;
$$;

create or replace function public.sacar_aviator(alvo numeric default null) returns json
language plpgsql security definer set search_path = public as $$
declare
  p       partidas_cassino%rowtype;
  bi      record;
  seg     numeric;
  mult    numeric;
  premio  bigint;
  volta   bigint := 0;
  saldo_n bigint;
begin
  select * into p from partidas_cassino where perfil_id = auth.uid() and jogo = 'aviator' for update;
  if not found then raise exception 'Nenhum voo ativo.'; end if;

  delete from partidas_cassino where perfil_id = auth.uid() and jogo = 'aviator';
  select * into bi from bonus_itens(auth.uid(), null);

  seg := greatest(0, extract(epoch from (clock_timestamp() - p.iniciado_em)));
  mult := greatest(1.01, trunc(exp(0.12 * seg)::numeric, 2));
  if alvo is not null and alvo >= 1.01 and alvo <= mult + 0.15 then
    mult := trunc(alvo, 2);
  end if;

  -- Se o avião já tinha batido no ponto de crash antes do pulo
  if mult > p.ponto_crash then
    if bi.p_cassino_volta > 0 then
      volta := floor(p.aposta * bi.p_cassino_volta);
      if volta > 0 then perform mexer_saldo(auth.uid(), volta, 'premio', 'Cashback: Revoada da Katequese'); end if;
    end if;
    perform pagar_comissao_dono(auth.uid(), p.aposta - volta);
    select saldo into saldo_n from carteiras where perfil_id = auth.uid();
    return json_build_object('ganhou', false, 'explodiu', true, 'ponto_crash', p.ponto_crash, 'cashback', volta, 'saldo', saldo_n);
  end if;

  premio := floor(p.aposta * mult);
  if premio > p.aposta then premio := premio + floor((premio - p.aposta) * bi.p_cassino_premio); end if;
  saldo_n := mexer_saldo(auth.uid(), premio, 'premio', 'Prêmio: Revoada da Katequese (' || mult || 'x)');

  return json_build_object(
    'ganhou', true,
    'multiplicador', mult,
    'ponto_crash', p.ponto_crash,
    'premio', premio,
    'lucro', premio - p.aposta,
    'saldo', saldo_n
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 5) APOSTAR (Moeda, Roleta, Caça-níquel Clássico e TIGRINHO 3x3)
--    Agora também paga 25% da perda líquida ao Dono do Cassino!
-- ---------------------------------------------------------------------
create or replace function public.apostar(jogo text, valor bigint, escolha text default null) returns json
language plpgsql security definer set search_path = public as $$
declare
  c           carteiras%rowtype;
  bi          record;
  premio      bigint := 0;
  volta       bigint := 0;
  resultado   json;
  numero      int;
  cor         text;
  lado        text;
  simbolos    text[] := array['cereja', 'limao', 'sino', 'estrela', 'sete'];
  pesos       int[]  := array[40, 30, 15, 10, 5];
  pagamento   int[]  := array[5, 8, 15, 30, 100];
  rolos       text[] := '{}';
  -- Tigrinho 3x3 (6 símbolos: o 'tigrinho' é Coringa/Wild!)
  t_simbolos  text[] := array['laranja', 'chopp', 'churrasco', 'ouro', 'trofeu', 'tigrinho'];
  t_pesos     int[]  := array[34, 25, 17, 11, 7, 6];
  t_mult      numeric[] := array[0.5, 1.2, 2.5, 5.0, 12.0, 25.0];
  grade       text[] := '{}';
  linhas_v    int[]  := '{}';
  linhas      int[][] := array[array[1,2,3], array[4,5,6], array[7,8,9], array[1,5,9], array[3,5,7]];
  s1 text; s2 text; s3 text; alvo_l text;
  mult_total  numeric := 0;
  tela_cheia  boolean := false;
  sorteio     int;
  acumulado   int;
  k           int;
  r           int;
  vermelhos   int[]  := array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  nome_jogo   text;
  espera_s    numeric;
  ultima      timestamptz;
begin
  c := minha_carteira_travada();
  if jogo not in ('moeda', 'roleta', 'slots', 'tigrinho') then raise exception 'Jogo desconhecido.'; end if;
  if valor is null or valor < 10 then raise exception 'A aposta mínima é K$ 10.'; end if;
  if valor > 50000 then raise exception 'A aposta máxima é K$ 50.000.'; end if;
  if c.saldo < valor then raise exception 'Saldo insuficiente.'; end if;

  espera_s := coalesce((select (dados->'cassinoEspera'->>jogo)::numeric from config where id = 1), 0);
  select em into ultima from ultimas_apostas where perfil_id = auth.uid() and ultimas_apostas.jogo = apostar.jogo;
  if ultima is not null and ultima + make_interval(secs => espera_s) > now() then
    raise exception 'Espere % s para apostar de novo nesse jogo.',
      ceil(extract(epoch from (ultima + make_interval(secs => espera_s) - now())));
  end if;
  insert into ultimas_apostas (perfil_id, jogo, em) values (auth.uid(), jogo, now())
  on conflict on constraint ultimas_apostas_pkey do update set em = now();

  select * into bi from bonus_itens(auth.uid(), null);
  nome_jogo := case jogo
    when 'moeda' then 'Cara ou Coroa'
    when 'roleta' then 'Roleta'
    when 'tigrinho' then 'Tigrinho da Katequese'
    else 'Caça-níquel' end;
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

  elsif jogo = 'tigrinho' then
    -- Sorteia as 9 posições da grade 3x3
    for r in 1..9 loop
      sorteio := floor(random() * 100)::int;
      acumulado := 0;
      for k in 1..6 loop
        acumulado := acumulado + t_pesos[k];
        if sorteio < acumulado then grade := grade || t_simbolos[k]; exit; end if;
      end loop;
    end loop;

    -- Confere cada uma das 5 linhas (3 horizontais + 2 diagonais); 'tigrinho' é Coringa!
    for r in 1..5 loop
      s1 := grade[linhas[r][1]];
      s2 := grade[linhas[r][2]];
      s3 := grade[linhas[r][3]];
      alvo_l := coalesce(
        case when s1 <> 'tigrinho' then s1 end,
        case when s2 <> 'tigrinho' then s2 end,
        case when s3 <> 'tigrinho' then s3 end,
        'tigrinho'
      );
      if (s1 = alvo_l or s1 = 'tigrinho')
         and (s2 = alvo_l or s2 = 'tigrinho')
         and (s3 = alvo_l or s3 = 'tigrinho') then
        linhas_v := linhas_v || (r - 1);
        mult_total := mult_total + t_mult[array_position(t_simbolos, alvo_l)];
      end if;
    end loop;

    -- Bônus Tela Cheia 10x: todas as 5 linhas fecharam!
    if cardinality(linhas_v) = 5 then
      tela_cheia := true;
      mult_total := mult_total * 10;
    end if;
    premio := floor(valor * mult_total);
    resultado := json_build_object('grade', grade, 'linhas', linhas_v, 'multiplicador', mult_total, 'tela_cheia', tela_cheia);
  end if;

  update carteiras set xp = xp + 2 where perfil_id = auth.uid();
  if premio > valor then
    premio := premio + floor((premio - valor) * bi.p_cassino_premio);
  end if;
  if premio > 0 then
    perform mexer_saldo(auth.uid(), premio, 'premio', 'Prêmio: ' || nome_jogo);
  elsif bi.p_cassino_volta > 0 then
    volta := floor(valor * bi.p_cassino_volta);
    if volta > 0 then perform mexer_saldo(auth.uid(), volta, 'premio', 'Cashback: ' || nome_jogo); end if;
  end if;

  -- Se o jogador perdeu dinheiro líquido, paga 25% da perda ao Dono do Cassino!
  if premio + volta < valor then
    perform pagar_comissao_dono(auth.uid(), valor - premio - volta);
  end if;

  return json_build_object(
    'resultado', resultado,
    'premio', premio,
    'cashback', volta,
    'lucro', premio + volta - valor,
    'espera', espera_s,
    'saldo', (select saldo from carteiras where perfil_id = auth.uid())
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 6) REGISTRO EM ATUALIZAÇÕES (entra só uma vez)
-- ---------------------------------------------------------------------
insert into public.atualizacoes (criado_em, tipo, titulo, descricao, autor_nome, autor_id)
select v.criado_em::timestamptz, v.tipo, v.titulo, v.descricao, 'Gregory',
       (select id from public.perfis where usuario = 'kayo')
  from (values
    ('2026-10-25 14:00-03', 'nova', 'Cassino Katequista: Dono do Cassino, Revoada, Campo Minado e Tigrinho',
     'Concessão mensal do Cassino (dono ganha 25% das perdas dos outros por 30 dias) e 3 jogos novos: Revoada da Katequese (Aviator), Campo Minado do Churrasco (5x5) e Tigrinho da Katequese (3x3 com 5 linhas e bônus 10x).'),
    ('2026-10-25 14:00-03', 'banco', 'supabase-19.sql',
     'Tabelas cassino_dono e partidas_cassino; funções estado_cassino, comprar_cassino, pagar_comissao_dono, iniciar/abrir/sacar_bomba, iniciar/checar/sacar_aviator e tigrinho 3x3 em apostar.')
  ) as v(criado_em, tipo, titulo, descricao)
 where not exists (select 1 from public.atualizacoes a where a.titulo = v.titulo);
