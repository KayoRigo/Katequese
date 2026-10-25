-- =====================================================================
-- supabase-17.sql — atualização: LEIS + CÂMARA, HIERARQUIA DAS TAGS e
-- ESPERA ENTRE APOSTAS no cassino.
--
--   LEIS
--   - O Presidente (ou um admin) propõe: criar, alterar ou revogar uma lei.
--   - A proposta vai para a Câmara: só quem tem a tag Deputado vota (sim/não),
--     o voto é secreto e só a contagem aparece depois de encerrar.
--   - A votação acaba no prazo escolhido OU quando todos os deputados votarem.
--   - Mais "sim": aprovada e já vale. Mais "não": rejeitada.
--     Empate: o Presidente (ou admin) pode levar ao VOTO POPULAR
--     (todos os Katequistas votam até um prazo) ou arquivar.
--   - Como não há "relógio" no banco, as votações vencidas são apuradas
--     quando alguém abre a página ou vota (função propostas_situacao).
--
--   TAGS: coluna "ordem" (hierarquia). Começa assim:
--     Presidente, Deputado, outras tags, Katequista, Visitante.
--     (Admin não é tag: fica sempre no topo.)
--
--   CASSINO: espera em segundos entre apostas, por jogo (config "cassinoEspera").
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase-16.sql já executado. Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) HIERARQUIA DAS TAGS
-- ---------------------------------------------------------------------
alter table public.tags add column if not exists ordem int;

-- Primeira vez: monta a ordem pedida (depois, quem manda é o admin)
update public.tags t set ordem = case
    when t.sistema and t.nome = 'Presidente' then 10
    when t.sistema and t.nome = 'Deputado'   then 20
    when t.sistema and t.nome = 'Katequista' then 900
    when t.sistema and t.nome = 'Visitante'  then 950
    else 100 + (select count(*) from public.tags x where x.nome < t.nome) end
 where t.ordem is null;
alter table public.tags alter column ordem set default 500;   -- tag nova entra antes de Katequista

-- O admin manda a lista de ids na ordem nova (do mais alto para o mais baixo)
create or replace function public.ordenar_tags(ids bigint[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'Só administradores.'; end if;
  update tags t set ordem = k.pos * 10
    from unnest(ids) with ordinality as k(id, pos)
   where t.id = k.id;
end;
$$;


-- ---------------------------------------------------------------------
-- 2) LEIS E PROPOSTAS
-- ---------------------------------------------------------------------
create table if not exists public.leis (
  id           bigint generated always as identity primary key,
  numero       int not null unique,
  titulo       text not null check (char_length(titulo) between 1 and 120),
  texto        text not null check (char_length(texto) between 1 and 5000),
  ativa        boolean not null default true,
  criada_em    timestamptz not null default now(),
  alterada_em  timestamptz,
  revogada_em  timestamptz
);

create table if not exists public.propostas_lei (
  id             bigint generated always as identity primary key,
  tipo           text not null check (tipo in ('criar', 'alterar', 'revogar')),
  lei_id         bigint references public.leis(id) on delete set null,
  titulo         text not null check (char_length(titulo) between 1 and 120),
  texto          text not null check (char_length(texto) between 1 and 5000),
  justificativa  text not null default '' check (char_length(justificativa) <= 1000),
  autor_id       uuid references public.perfis(id) on delete set null,
  status         text not null default 'camara'
                 check (status in ('camara', 'empate', 'popular', 'aprovada', 'rejeitada', 'cancelada')),
  fim_camara     timestamptz not null,
  fim_popular    timestamptz,
  resultado      text not null default '',
  criada_em      timestamptz not null default now(),
  encerrada_em   timestamptz
);

-- Votos: ninguém lê direto (voto secreto). Só as funções abaixo contam.
create table if not exists public.votos_camara (
  proposta_id  bigint not null references public.propostas_lei(id) on delete cascade,
  perfil_id    uuid not null references public.perfis(id) on delete cascade,
  voto         boolean not null,                 -- true = sim, false = não
  votado_em    timestamptz not null default now(),
  primary key (proposta_id, perfil_id)
);
create table if not exists public.votos_populares (
  proposta_id  bigint not null references public.propostas_lei(id) on delete cascade,
  perfil_id    uuid not null references public.perfis(id) on delete cascade,
  voto         boolean not null,
  votado_em    timestamptz not null default now(),
  primary key (proposta_id, perfil_id)
);

alter table public.leis           enable row level security;
alter table public.propostas_lei  enable row level security;
alter table public.votos_camara   enable row level security;
alter table public.votos_populares enable row level security;

drop policy if exists "ver leis" on public.leis;
create policy "ver leis" on public.leis for select using (eh_aprovado());
drop policy if exists "ver propostas" on public.propostas_lei;
create policy "ver propostas" on public.propostas_lei for select using (eh_katequista());
-- (sem políticas nos votos: ninguém lê nem escreve direto)

-- Ajudantes
create or replace function public.pode_propor_lei() returns boolean
language sql stable security definer set search_path = public as $$
  select eh_katequista() and (eh_admin() or tem_tag('Presidente'));
$$;

create or replace function public.total_deputados() returns int
language sql stable security definer set search_path = public as $$
  select count(distinct pt.perfil_id)::int
    from perfil_tags pt
    join tags t on t.id = pt.tag_id
    join perfis p on p.id = pt.perfil_id
   where t.nome = 'Deputado' and t.sistema and p.status = 'aprovado';
$$;

-- Coloca a proposta aprovada em vigor
create or replace function public.aplicar_proposta(pid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  p propostas_lei%rowtype;
  nova bigint;
begin
  select * into p from propostas_lei where id = pid;
  if p.tipo = 'criar' then
    insert into leis (numero, titulo, texto)
    values ((select coalesce(max(numero), 0) + 1 from leis), p.titulo, p.texto)
    returning id into nova;
    update propostas_lei set lei_id = nova where id = pid;
  elsif p.tipo = 'alterar' then
    update leis set titulo = p.titulo, texto = p.texto, alterada_em = now() where id = p.lei_id;
  else
    update leis set ativa = false, revogada_em = now() where id = p.lei_id;
  end if;
end;
$$;

-- Confere se a votação já acabou e decide o resultado
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
    if now() < p.fim_camara and sim + nao < total then return; end if;   -- ainda aberta
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
revoke execute on function public.aplicar_proposta(bigint) from public, anon, authenticated;
revoke execute on function public.apurar_proposta(bigint) from public, anon, authenticated;

-- Presidente/admin propõe. tipo: 'criar' | 'alterar' | 'revogar'. horas: prazo da Câmara.
create or replace function public.propor_lei(tipo text, id_lei bigint, titulo text, texto text,
  justificativa text, horas numeric) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  l    leis%rowtype;
  nova bigint;
begin
  if not pode_propor_lei() then raise exception 'Só o Presidente (ou um admin) propõe leis.'; end if;
  if tipo not in ('criar', 'alterar', 'revogar') then raise exception 'Tipo inválido.'; end if;
  if horas is null or horas < 0.1 or horas > 168 then raise exception 'O prazo vai de 6 minutos a 7 dias.'; end if;

  if tipo <> 'criar' then
    select * into l from leis where id = id_lei and ativa;
    if not found then raise exception 'Lei não encontrada.'; end if;
    if exists (select 1 from propostas_lei where lei_id = id_lei and status in ('camara', 'empate', 'popular')) then
      raise exception 'Já existe uma votação aberta sobre essa lei.';
    end if;
    if tipo = 'revogar' then titulo := l.titulo; texto := l.texto; end if;
  end if;

  insert into propostas_lei (tipo, lei_id, titulo, texto, justificativa, autor_id, fim_camara)
  values (tipo, case when tipo = 'criar' then null else id_lei end,
          trim(titulo), trim(texto), trim(coalesce(justificativa, '')), auth.uid(),
          now() + make_interval(secs => horas * 3600))
  returning id into nova;

  perform apurar_proposta(nova);   -- sem deputados, já vai direto para empate
  return nova;
end;
$$;

-- Deputado vota (pode mudar o voto enquanto estiver aberta)
create or replace function public.votar_camara(pid bigint, voto boolean) returns void
language plpgsql security definer set search_path = public as $$
declare p propostas_lei%rowtype;
begin
  if not (eh_katequista() and tem_tag('Deputado')) then raise exception 'Só deputados votam na Câmara.'; end if;
  perform apurar_proposta(pid);
  select * into p from propostas_lei where id = pid;
  if not found or p.status <> 'camara' then raise exception 'Essa votação já foi encerrada.'; end if;
  insert into votos_camara (proposta_id, perfil_id, voto) values (pid, auth.uid(), voto)
  on conflict (proposta_id, perfil_id) do update set voto = excluded.voto, votado_em = now();
  perform apurar_proposta(pid);
end;
$$;

-- Empate: Presidente/admin leva ao voto popular
create or replace function public.levar_ao_voto_popular(pid bigint, horas numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode_propor_lei() then raise exception 'Só o Presidente (ou um admin).'; end if;
  if horas is null or horas < 0.1 or horas > 168 then raise exception 'O prazo vai de 6 minutos a 7 dias.'; end if;
  update propostas_lei set status = 'popular', fim_popular = now() + make_interval(secs => horas * 3600)
   where id = pid and status = 'empate';
  if not found then raise exception 'Só dá para levar ao voto popular uma proposta empatada.'; end if;
end;
$$;

-- Katequista vota no voto popular
create or replace function public.votar_popular(pid bigint, voto boolean) returns void
language plpgsql security definer set search_path = public as $$
declare p propostas_lei%rowtype;
begin
  if not eh_katequista() then raise exception 'Só Katequistas votam.'; end if;
  perform apurar_proposta(pid);
  select * into p from propostas_lei where id = pid;
  if not found or p.status <> 'popular' then raise exception 'Essa votação já foi encerrada.'; end if;
  insert into votos_populares (proposta_id, perfil_id, voto) values (pid, auth.uid(), voto)
  on conflict (proposta_id, perfil_id) do update set voto = excluded.voto, votado_em = now();
end;
$$;

-- Presidente/admin arquiva uma proposta aberta (ex: depois de um empate)
create or replace function public.arquivar_proposta(pid bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode_propor_lei() then raise exception 'Só o Presidente (ou um admin).'; end if;
  update propostas_lei set status = 'cancelada', encerrada_em = now(),
    resultado = case when resultado = '' then 'Arquivada.' else resultado || ' Arquivada.' end
   where id = pid and status in ('camara', 'empate', 'popular');
  if not found then raise exception 'Essa proposta já foi encerrada.'; end if;
end;
$$;

-- Tudo que a página precisa: apura as vencidas e devolve as propostas com contagens.
-- Durante a votação só aparece QUANTOS votaram; sim/não só depois de encerrar.
create or replace function public.propostas_situacao() returns json
language plpgsql security definer set search_path = public as $$
declare
  p record;
  total int;
begin
  if not eh_katequista() then return '[]'::json; end if;
  for p in select id from propostas_lei where status in ('camara', 'popular') loop
    perform apurar_proposta(p.id);
  end loop;
  total := total_deputados();
  return coalesce((
    select json_agg(x order by x.aberta desc, x.criada_em desc) from (
      select pr.id, pr.tipo, pr.lei_id, pr.titulo, pr.texto, pr.justificativa, pr.status, pr.resultado,
             pr.fim_camara, pr.fim_popular, pr.criada_em, pr.encerrada_em,
             pr.status in ('camara', 'empate', 'popular') as aberta,
             (select coalesce(nullif(apelido, ''), nome) from perfis where id = pr.autor_id) as autor,
             (select numero from leis where id = pr.lei_id) as lei_numero,
             total as total_deputados,
             (select count(*) from votos_camara v where v.proposta_id = pr.id) as votaram_camara,
             case when pr.status <> 'camara' then (select count(*) from votos_camara v where v.proposta_id = pr.id and v.voto) end as camara_sim,
             case when pr.status <> 'camara' then (select count(*) from votos_camara v where v.proposta_id = pr.id and not v.voto) end as camara_nao,
             (select count(*) from votos_populares v where v.proposta_id = pr.id) as votaram_popular,
             case when pr.status in ('aprovada', 'rejeitada', 'cancelada') then (select count(*) from votos_populares v where v.proposta_id = pr.id and v.voto) end as popular_sim,
             case when pr.status in ('aprovada', 'rejeitada', 'cancelada') then (select count(*) from votos_populares v where v.proposta_id = pr.id and not v.voto) end as popular_nao,
             (select voto from votos_camara v where v.proposta_id = pr.id and v.perfil_id = auth.uid()) as meu_voto_camara,
             (select voto from votos_populares v where v.proposta_id = pr.id and v.perfil_id = auth.uid()) as meu_voto_popular
        from propostas_lei pr
       order by pr.criada_em desc
       limit 60
    ) x), '[]'::json);
end;
$$;


-- ---------------------------------------------------------------------
-- 3) CASSINO: espera entre apostas (por jogo, em segundos)
-- ---------------------------------------------------------------------
create table if not exists public.ultimas_apostas (
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  jogo       text not null,
  em         timestamptz not null default now(),
  primary key (perfil_id, jogo)
);
alter table public.ultimas_apostas enable row level security;
drop policy if exists "ver minhas ultimas apostas" on public.ultimas_apostas;
create policy "ver minhas ultimas apostas" on public.ultimas_apostas for select using (perfil_id = auth.uid());

-- Valores iniciais (o admin muda em Economia → Admin)
update public.config set dados = dados || '{"cassinoEspera": {"moeda": 4, "roleta": 8, "slots": 4}}'::jsonb
 where id = 1 and not (dados ? 'cassinoEspera');

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
  espera_s   numeric;
  ultima     timestamptz;
begin
  c := minha_carteira_travada();
  if jogo not in ('moeda', 'roleta', 'slots') then raise exception 'Jogo desconhecido.'; end if;
  if valor is null or valor < 10 then raise exception 'A aposta mínima é K$ 10.'; end if;
  if valor > 50000 then raise exception 'A aposta máxima é K$ 50.000.'; end if;
  if c.saldo < valor then raise exception 'Saldo insuficiente.'; end if;

  -- Espera entre apostas no mesmo jogo
  espera_s := coalesce((select (dados->'cassinoEspera'->>jogo)::numeric from config where id = 1), 0);
  select em into ultima from ultimas_apostas where perfil_id = auth.uid() and ultimas_apostas.jogo = apostar.jogo;
  if ultima is not null and ultima + make_interval(secs => espera_s) > now() then
    raise exception 'Espere % s para apostar de novo nesse jogo.',
      ceil(extract(epoch from (ultima + make_interval(secs => espera_s) - now())));
  end if;
  insert into ultimas_apostas (perfil_id, jogo, em) values (auth.uid(), jogo, now())
  on conflict on constraint ultimas_apostas_pkey do update set em = now();

  select * into bi from bonus_itens(auth.uid(), null);
  nome_jogo := case jogo when 'moeda' then 'Cara ou Coroa' when 'roleta' then 'Roleta' else 'Caça-níquel' end;
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

  else
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
-- 4) REGISTRO EM ATUALIZAÇÕES (entra só uma vez)
-- ---------------------------------------------------------------------
insert into public.atualizacoes (criado_em, tipo, titulo, descricao, autor_nome, autor_id)
select v.criado_em::timestamptz, v.tipo, v.titulo, v.descricao, 'Kayo',
       (select id from public.perfis where usuario = 'kayo')
  from (values
    ('2026-10-24 16:19-03', 'nova', 'Leis e Câmara',
     'Página Leis: o Presidente propõe criar, alterar ou revogar leis; a Câmara (deputados) vota em segredo com prazo; empate pode ir para voto popular.'),
    ('2026-10-24 16:19-03', 'melhoria', 'Admin em sub-abas e hierarquia das tags',
     'O painel de admin agora tem sub-abas. Ao lado do nome aparece só a tag mais alta (admins: Admin + a próxima); a ordem é definida em Admin → Tags.'),
    ('2026-10-24 16:19-03', 'melhoria', 'Cassino: espera entre apostas',
     'Alguns segundos de espera entre apostas em cada jogo, ajustáveis em Economia → Admin.'),
    ('2026-10-24 16:19-03', 'banco', 'supabase-17.sql',
     'Tabelas leis, propostas_lei, votos_camara, votos_populares, ultimas_apostas; coluna tags.ordem; funções de leis, ordenar_tags e apostar com espera.')
  ) as v(criado_em, tipo, titulo, descricao)
 where not exists (select 1 from public.atualizacoes a where a.titulo = v.titulo);
