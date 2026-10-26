-- =====================================================================
-- supabase-20.sql — atualização: IDEIAS DE LEIS DOS DEPUTADOS, AVAL DO
-- PRESIDENTE, HIERARQUIA DE LEIS (CONSTITUIÇÃO, STK, GERAL, DECRETO),
-- TRANSPARÊNCIA DA CÂMARA E SINCRONIZAÇÃO DE CARGOS.
--
--   FLUXO LEGISLATIVO E HIERARQUIA
--   - 4 Escalões de Leis (coluna 'categoria'):
--       1º 'constitucional' — Constituição Katequista (Carta Magna)
--       2º 'stk'            — Superior Tribunal Katequista (STK)
--       3º 'geral'          — Leis Gerais do Grupo (padrão)
--       4º 'decreto'        — Decretos & Economia (K$)
--   - Deputados criam IDEIAS DE LEI ('sugestao' — "Na mesa do Presidente").
--   - O Presidente avalia em Gestão (avaliar_sugestao): aprova para ir à
--     Câmara ('camara') ou recusa.
--   - Na Câmara, os 4 Deputados votam (secreto enquanto aberta; após
--     encerrar, os votos nominais dos deputados ficam visíveis).
--   - Empate na Câmara (2 a 2): o Presidente escolhe entre arquivar ou
--     levar ao VOTO POPULAR dos Katequistas.
--   - Admin → Política: sincroniza automaticamente as tags 'Presidente'
--     e 'Deputado' quando os membros são vinculados às vagas.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa do supabase-19.sql já executado. Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) EVOLUÇÃO DAS TABELAS (politica, leis e propostas_lei)
-- ---------------------------------------------------------------------
alter table public.politica
  add column if not exists presidente_id uuid references public.perfis(id) on delete set null;

alter table public.leis
  add column if not exists categoria text not null default 'geral',
  add column if not exists autor_id uuid references public.perfis(id) on delete set null,
  add column if not exists aprovado_por uuid references public.perfis(id) on delete set null,
  add column if not exists autor_nome text,
  add column if not exists aprovado_por_nome text;

alter table public.leis drop constraint if exists leis_categoria_check;
alter table public.leis add constraint leis_categoria_check
  check (categoria in ('constitucional', 'stk', 'geral', 'decreto'));

alter table public.propostas_lei
  add column if not exists categoria text not null default 'geral',
  add column if not exists aprovado_por uuid references public.perfis(id) on delete set null,
  add column if not exists titulo_anterior text,
  add column if not exists texto_anterior text;

alter table public.propostas_lei drop constraint if exists propostas_lei_categoria_check;
alter table public.propostas_lei add constraint propostas_lei_categoria_check
  check (categoria in ('constitucional', 'stk', 'geral', 'decreto'));

-- Ideias de deputados ('sugestao') ainda não têm prazo de Câmara até o Presidente aprovar
alter table public.propostas_lei
  alter column fim_camara drop not null;

alter table public.propostas_lei drop constraint if exists propostas_lei_status_check;
alter table public.propostas_lei add constraint propostas_lei_status_check
  check (status in ('sugestao', 'camara', 'empate', 'popular', 'aprovada', 'rejeitada', 'cancelada'));


-- ---------------------------------------------------------------------
-- 2) SINCRONIZAÇÃO AUTOMÁTICA DE CARGOS POLÍTICOS (Admin → Política)
-- ---------------------------------------------------------------------
create or replace function public.sincronizar_cargos_politica(pres_id uuid default null, dep_ids uuid[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare
  id_pres bigint := id_tag('Presidente');
  id_dep  bigint := id_tag('Deputado');
  uid     uuid;
begin
  if not eh_admin() then raise exception 'Só administradores.'; end if;

  if id_pres is not null and pres_id is not null then
    delete from perfil_tags where tag_id = id_pres and perfil_id <> pres_id;
    insert into perfil_tags (perfil_id, tag_id) values (pres_id, id_pres) on conflict do nothing;
  end if;

  if id_dep is not null and coalesce(cardinality(dep_ids), 0) > 0 then
    delete from perfil_tags where tag_id = id_dep and not (perfil_id = any(dep_ids));
    foreach uid in array dep_ids loop
      if uid is not null then
        insert into perfil_tags (perfil_id, tag_id) values (uid, id_dep) on conflict do nothing;
      end if;
    end loop;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 3) PERMISSÕES E FUNÇÕES DO FLUXO LEGISLATIVO
-- ---------------------------------------------------------------------
create or replace function public.eh_presidente_ou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select eh_katequista() and (eh_admin() or tem_tag('Presidente'));
$$;

-- Agora Presidente, Deputados e Admin podem enviar propostas/ideias
create or replace function public.pode_propor_lei() returns boolean
language sql stable security definer set search_path = public as $$
  select eh_katequista() and (eh_admin() or tem_tag('Presidente') or tem_tag('Deputado'));
$$;

-- Coloca a proposta aprovada em vigor (guardando categoria, assinatura e texto anterior)
create or replace function public.aplicar_proposta(pid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  p        propostas_lei%rowtype;
  antiga   leis%rowtype;
  nova     bigint;
  n_autor  text;
  n_aprov  text;
begin
  select * into p from propostas_lei where id = pid;
  select coalesce(nullif(apelido, ''), nome) into n_autor from perfis where id = p.autor_id;
  select coalesce(nullif(apelido, ''), nome) into n_aprov from perfis where id = p.aprovado_por;

  if p.tipo = 'criar' then
    insert into leis (numero, categoria, titulo, texto, autor_id, aprovado_por, autor_nome, aprovado_por_nome)
    values (
      (select coalesce(max(numero), 0) + 1 from leis),
      coalesce(p.categoria, 'geral'),
      p.titulo,
      p.texto,
      p.autor_id,
      p.aprovado_por,
      n_autor,
      n_aprov
    )
    returning id into nova;
    update propostas_lei set lei_id = nova where id = pid;
  elsif p.tipo = 'alterar' then
    select * into antiga from leis where id = p.lei_id;
    if found then
      update propostas_lei set titulo_anterior = antiga.titulo, texto_anterior = antiga.texto where id = pid;
    end if;
    update leis set
      categoria         = coalesce(p.categoria, categoria),
      titulo            = p.titulo,
      texto             = p.texto,
      alterada_em       = now(),
      autor_id          = coalesce(p.autor_id, autor_id),
      aprovado_por      = coalesce(p.aprovado_por, aprovado_por),
      autor_nome        = coalesce(n_autor, autor_nome),
      aprovado_por_nome = coalesce(n_aprov, aprovado_por_nome)
     where id = p.lei_id;
  else
    update leis set ativa = false, revogada_em = now() where id = p.lei_id;
  end if;
end;
$$;
revoke execute on function public.aplicar_proposta(bigint) from public, anon, authenticated;

-- Remove versões anteriores com assinatura menor para manter uma única função propor_lei
drop function if exists public.propor_lei(text, bigint, text, text, text, numeric);
drop function if exists public.propor_lei(text, bigint, text, text, text, numeric, boolean);

-- Presidente envia direto para a Câmara; Deputado (mesmo que seja admin do site)
-- envia como 'sugestao' para o Presidente avaliar, a menos que acione como_admin = true na aba Admin.
create or replace function public.propor_lei(
  tipo text,
  id_lei bigint,
  titulo text,
  texto text,
  justificativa text,
  horas numeric default 24,
  como_admin boolean default false,
  categoria text default 'geral'
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  l             leis%rowtype;
  nova          bigint;
  direto        boolean := eh_katequista() and (tem_tag('Presidente') or (eh_admin() and (como_admin or not tem_tag('Deputado'))));
  horas_validas numeric := coalesce(horas, 24);
  cat_valida    text := case when categoria in ('constitucional', 'stk', 'geral', 'decreto') then categoria else 'geral' end;
begin
  if not pode_propor_lei() then raise exception 'Só o Presidente, os Deputados ou um admin podem propor leis.'; end if;
  if tipo not in ('criar', 'alterar', 'revogar') then raise exception 'Tipo inválido.'; end if;
  if direto and (horas_validas < 0.1 or horas_validas > 168) then
    raise exception 'O prazo vai de 6 minutos a 7 dias.';
  end if;

  if tipo <> 'criar' then
    select * into l from leis where id = id_lei and ativa;
    if not found then raise exception 'Lei não encontrada.'; end if;
    if exists (select 1 from propostas_lei where lei_id = id_lei and status in ('sugestao', 'camara', 'empate', 'popular')) then
      raise exception 'Já existe uma proposta ou sugestão aberta sobre essa lei.';
    end if;
    if tipo = 'revogar' then
      titulo := l.titulo;
      texto := l.texto;
      cat_valida := coalesce(l.categoria, 'geral');
    end if;
  end if;

  insert into propostas_lei (tipo, lei_id, categoria, titulo, texto, justificativa, autor_id, aprovado_por, status, fim_camara)
  values (
    tipo,
    case when tipo = 'criar' then null else id_lei end,
    cat_valida,
    trim(titulo),
    trim(texto),
    trim(coalesce(justificativa, '')),
    auth.uid(),
    case when direto then auth.uid() else null end,
    case when direto then 'camara' else 'sugestao' end,
    case when direto then now() + make_interval(secs => horas_validas * 3600) else null end
  )
  returning id into nova;

  if direto then
    perform apurar_proposta(nova);
  end if;
  return nova;
end;
$$;

drop function if exists public.avaliar_sugestao(bigint, boolean, numeric, text, text);
drop function if exists public.avaliar_sugestao(bigint, boolean, numeric, text, text, text);

-- Presidente (ou admin) avalia uma ideia enviada por Deputado: aprova para ir à Câmara ou recusa.
create or replace function public.avaliar_sugestao(
  pid bigint,
  aprovar boolean,
  horas numeric default 24,
  novo_titulo text default null,
  novo_texto text default null,
  nova_justificativa text default null,
  nova_categoria text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  p propostas_lei%rowtype;
begin
  if not eh_presidente_ou_admin() then raise exception 'Só o Presidente (ou um admin) avalia ideias de leis.'; end if;
  select * into p from propostas_lei where id = pid for update;
  if not found or p.status <> 'sugestao' then raise exception 'Essa ideia não está mais aguardando avaliação.'; end if;

  if aprovar then
    if horas is null or horas < 0.1 or horas > 168 then raise exception 'O prazo vai de 6 minutos a 7 dias.'; end if;
    if p.tipo <> 'criar' then
      if not exists (select 1 from leis where id = p.lei_id and ativa) then
        raise exception 'A lei alvo não está mais em vigor.';
      end if;
      if exists (select 1 from propostas_lei where lei_id = p.lei_id and id <> pid and status in ('camara', 'empate', 'popular')) then
        raise exception 'Já existe uma votação aberta sobre essa lei.';
      end if;
    end if;

    update propostas_lei set
      status        = 'camara',
      aprovado_por  = auth.uid(),
      fim_camara    = now() + make_interval(secs => horas * 3600),
      categoria     = case when nova_categoria in ('constitucional', 'stk', 'geral', 'decreto') then nova_categoria else p.categoria end,
      titulo        = case when p.tipo = 'revogar' then p.titulo else coalesce(nullif(trim(novo_titulo), ''), p.titulo) end,
      texto         = case when p.tipo = 'revogar' then p.texto  else coalesce(nullif(trim(novo_texto), ''), p.texto) end,
      justificativa = coalesce(trim(nova_justificativa), p.justificativa)
     where id = pid;

    perform apurar_proposta(pid);
  else
    update propostas_lei set
      status       = 'cancelada',
      encerrada_em = now(),
      resultado    = 'Ideia recusada pelo Presidente.'
     where id = pid;
  end if;
end;
$$;

-- Empate: só o Presidente (ou admin) leva ao voto popular
create or replace function public.levar_ao_voto_popular(pid bigint, horas numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eh_presidente_ou_admin() then raise exception 'Só o Presidente (ou um admin).'; end if;
  if horas is null or horas < 0.1 or horas > 168 then raise exception 'O prazo vai de 6 minutos a 7 dias.'; end if;
  update propostas_lei set status = 'popular', fim_popular = now() + make_interval(secs => horas * 3600)
   where id = pid and status = 'empate';
  if not found then raise exception 'Só dá para levar ao voto popular uma proposta empatada.'; end if;
end;
$$;

-- Arquivar proposta:
--   - 'sugestao': Presidente/admin recusa OU o próprio Deputado autor retira a ideia.
--   - 'empate': Presidente/admin arquiva em vez de levar ao voto popular.
--   - 'camara' / 'popular': só Admin ou o próprio Presidente autor (não cancela votação de ideia de deputado em andamento).
create or replace function public.arquivar_proposta(pid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  p propostas_lei%rowtype;
begin
  select * into p from propostas_lei where id = pid for update;
  if not found or p.status not in ('sugestao', 'camara', 'empate', 'popular') then
    raise exception 'Essa proposta já foi encerrada.';
  end if;

  if p.status = 'sugestao' then
    if not (eh_presidente_ou_admin() or p.autor_id = auth.uid()) then
      raise exception 'Só o Presidente ou o autor da ideia pode arquivá-la.';
    end if;
    update propostas_lei set status = 'cancelada', encerrada_em = now(),
      resultado = case when p.autor_id = auth.uid() and not eh_presidente_ou_admin()
                       then 'Ideia retirada pelo autor.'
                       else 'Ideia recusada pelo Presidente.' end
     where id = pid;

  elsif p.status = 'empate' then
    if not eh_presidente_ou_admin() then raise exception 'Só o Presidente (ou um admin).'; end if;
    update propostas_lei set status = 'cancelada', encerrada_em = now(),
      resultado = case when resultado = '' then 'Arquivada.' else resultado || ' Arquivada.' end
     where id = pid;

  else
    if not (eh_admin() or (eh_presidente_ou_admin() and p.autor_id = auth.uid())) then
      raise exception 'Não é possível cancelar uma votação em andamento de outro autor.';
    end if;
    update propostas_lei set status = 'cancelada', encerrada_em = now(),
      resultado = case when resultado = '' then 'Arquivada.' else resultado || ' Arquivada.' end
     where id = pid;
  end if;
end;
$$;

-- Devolve todas as propostas (incluindo categoria, sugestões, créditos e votos nominais da Câmara após encerrar)
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
      select pr.id, pr.tipo, pr.lei_id, coalesce(pr.categoria, 'geral') as categoria,
             pr.titulo, pr.texto, pr.justificativa, pr.status, pr.resultado,
             pr.titulo_anterior, pr.texto_anterior,
             pr.fim_camara, pr.fim_popular, pr.criada_em, pr.encerrada_em,
             pr.autor_id, pr.aprovado_por as aprovado_por_id,
             pr.status in ('sugestao', 'camara', 'empate', 'popular') as aberta,
             (select coalesce(nullif(apelido, ''), nome) from perfis where id = pr.autor_id) as autor,
             (select coalesce(nullif(apelido, ''), nome) from perfis where id = pr.aprovado_por) as aprovado_por,
             (select numero from leis where id = pr.lei_id) as lei_numero,
             total as total_deputados,
             (select count(*) from votos_camara v where v.proposta_id = pr.id) as votaram_camara,
             case when pr.status not in ('sugestao', 'camara') then (select count(*) from votos_camara v where v.proposta_id = pr.id and v.voto) end as camara_sim,
             case when pr.status not in ('sugestao', 'camara') then (select count(*) from votos_camara v where v.proposta_id = pr.id and not v.voto) end as camara_nao,
             case when pr.status not in ('sugestao', 'camara') then coalesce((
               select json_agg(json_build_object('nome', coalesce(nullif(pf.apelido, ''), pf.nome), 'voto', vc.voto) order by vc.votado_em)
                 from votos_camara vc join perfis pf on pf.id = vc.perfil_id
                where vc.proposta_id = pr.id
             ), '[]'::json) else '[]'::json end as votos_nominais,
             (select count(*) from votos_populares v where v.proposta_id = pr.id) as votaram_popular,
             case when pr.status in ('aprovada', 'rejeitada', 'cancelada') then (select count(*) from votos_populares v where v.proposta_id = pr.id and v.voto) end as popular_sim,
             case when pr.status in ('aprovada', 'rejeitada', 'cancelada') then (select count(*) from votos_populares v where v.proposta_id = pr.id and not v.voto) end as popular_nao,
             (select voto from votos_camara v where v.proposta_id = pr.id and v.perfil_id = auth.uid()) as meu_voto_camara,
             (select voto from votos_populares v where v.proposta_id = pr.id and v.perfil_id = auth.uid()) as meu_voto_popular
        from propostas_lei pr
       order by pr.criada_em desc
       limit 200
    ) x), '[]'::json);
end;
$$;


-- ---------------------------------------------------------------------
-- 4) CASSINO MAIS DIFÍCIL DE GANHAR (Margem maior da casa em todos os 6 jogos)
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
  return greatest(1.01, trunc(mult * 0.88, 2));
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

  if not (casa = any(p.bombas)) and random() < 0.12 then
    p.bombas[1] := casa;
  end if;

  if casa = any(p.bombas) then
    delete from partidas_cassino where perfil_id = auth.uid() and jogo = 'bomba';
    if bi.p_cassino_volta > 0 then
      volta := floor(p.aposta * bi.p_cassino_volta);
      if volta > 0 then perform mexer_saldo(auth.uid(), volta, 'premio', 'Cashback: Campo Minado'); end if;
    end if;
    perform pagar_comissao_dono(auth.uid(), p.aposta - volta);
    select saldo into saldo_n from carteiras where perfil_id = auth.uid();
    return json_build_object('explodiu', true, 'casa', casa, 'bombas', p.bombas, 'cashback', volta, 'saldo', saldo_n);
  end if;

  p.abertas := p.abertas || casa;
  mult := multiplicador_bomba(p.qtd_bombas, cardinality(p.abertas));
  restam := 25 - p.qtd_bombas - cardinality(p.abertas);

  if restam <= 0 then
    delete from partidas_cassino where perfil_id = auth.uid() and jogo = 'bomba';
    premio := floor(p.aposta * mult);
    if premio > p.aposta then premio := premio + floor((premio - p.aposta) * bi.p_cassino_premio); end if;
    saldo_n := mexer_saldo(auth.uid(), premio, 'premio', 'Prêmio: Campo Minado');
    return json_build_object('explodiu', false, 'finalizou', true, 'abertas', p.abertas, 'bombas', p.bombas, 'multiplicador', mult, 'premio', premio, 'lucro', premio - p.aposta, 'saldo', saldo_n);
  end if;

  update partidas_cassino set abertas = p.abertas where perfil_id = auth.uid() and jogo = 'bomba';
  premio := floor(p.aposta * mult);
  if premio > p.aposta then premio := premio + floor((premio - p.aposta) * bi.p_cassino_premio); end if;
  return json_build_object('explodiu', false, 'finalizou', false, 'abertas', p.abertas, 'multiplicador', mult, 'premio_atual', premio);
end;
$$;

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

  if random() < 0.14 then
    crash := 1.00;
  else
    crash := least(500.00, greatest(1.02, trunc((0.76 / greatest(0.003, 1.0 - random()))::numeric, 2)));
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
  pesos       int[]  := array[28, 28, 22, 15, 7];
  pagamento   int[]  := array[4, 7, 12, 25, 80];
  rolos       text[] := '{}';
  t_simbolos  text[] := array['laranja', 'chopp', 'churrasco', 'ouro', 'trofeu', 'tigrinho'];
  t_pesos     int[]  := array[28, 25, 20, 15, 10, 2];
  t_mult      numeric[] := array[0.4, 1.0, 2.0, 4.0, 10.0, 20.0];
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
  pretos      int[]  := array[2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];
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
    if random() < 0.38 then
      lado := escolha;
      premio := valor * 2;
    else
      lado := case when escolha = 'cara' then 'coroa' else 'cara' end;
    end if;
    resultado := json_build_object('lado', lado);

  elsif jogo = 'roleta' then
    if escolha not in ('vermelho', 'preto', 'verde') then raise exception 'Escolha vermelho, preto ou verde.'; end if;
    if escolha = 'verde' then
      if random() < 0.015 then numero := 0;
      elsif random() < 0.5 then numero := vermelhos[1 + floor(random() * 18)::int];
      else numero := pretos[1 + floor(random() * 18)::int]; end if;
    else
      if random() < 0.38 then
        numero := case when escolha = 'vermelho' then vermelhos[1 + floor(random() * 18)::int] else pretos[1 + floor(random() * 18)::int] end;
      elsif random() < 0.06 then
        numero := 0;
      else
        numero := case when escolha = 'vermelho' then pretos[1 + floor(random() * 18)::int] else vermelhos[1 + floor(random() * 18)::int] end;
      end if;
    end if;
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
      premio := floor(valor * 0.5);
    end if;
    resultado := json_build_object('rolos', rolos);

  elsif jogo = 'tigrinho' then
    for r in 1..9 loop
      sorteio := floor(random() * 100)::int;
      acumulado := 0;
      for k in 1..6 loop
        acumulado := acumulado + t_pesos[k];
        if sorteio < acumulado then grade := grade || t_simbolos[k]; exit; end if;
      end loop;
    end loop;

    for r in 1..5 loop
      s1 := grade[linhas[r][1]]; s2 := grade[linhas[r][2]]; s3 := grade[linhas[r][3]];
      alvo_l := coalesce(case when s1 <> 'tigrinho' then s1 end, case when s2 <> 'tigrinho' then s2 end, case when s3 <> 'tigrinho' then s3 end, 'tigrinho');
      if (s1 = alvo_l or s1 = 'tigrinho') and (s2 = alvo_l or s2 = 'tigrinho') and (s3 = alvo_l or s3 = 'tigrinho') then
        linhas_v := linhas_v || (r - 1);
        mult_total := mult_total + t_mult[array_position(t_simbolos, alvo_l)];
      end if;
    end loop;

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
-- 5) REGISTRO EM ATUALIZAÇÕES (entra só uma vez)
-- ---------------------------------------------------------------------
insert into public.atualizacoes (criado_em, tipo, titulo, descricao, autor_nome, autor_id)
select v.criado_em::timestamptz, v.tipo, v.titulo, v.descricao, 'Kayo',
       (select id from public.perfis where usuario = 'kayo')
  from (values
    ('2026-10-26 12:00-03', 'nova', 'Ideias de leis dos Deputados, aval do Presidente e Hierarquia (STK)',
     'Deputados criam ideias de leis para o Presidente avaliar; leis têm 4 escalões (Constituição Katequista, Superior Tribunal Katequista - STK, Leis Gerais e Decretos & Economia).'),
    ('2026-10-26 12:00-03', 'melhoria', 'Transparência na Câmara, leis revogadas e vínculo de cargos',
     'Votos dos deputados aparecem nominalmente após o fim da votação; leis revogadas mostram o texto completo; Admin → Política sincroniza automaticamente as tags Presidente e Deputado.'),
    ('2026-10-26 12:00-03', 'banco', 'supabase-20.sql',
     'Coluna categoria e status sugestao em leis/propostas_lei, funções avaliar_sugestao e sincronizar_cargos_politica, histórico de texto anterior e votos nominais pós-encerramento.')
  ) as v(criado_em, tipo, titulo, descricao)
 where not exists (select 1 from public.atualizacoes a where a.titulo = v.titulo);
