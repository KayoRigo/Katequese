-- =====================================================================
-- supabase-15.sql — atualização: ECONOMIA 2 (profissões com equipamentos
-- e minijogos).
--
--   - Todas as profissões ficam liberadas desde o nível 1.
--   - Cada profissão tem uma linha de equipamentos na loja (ex: entregador:
--     bicicleta → moto → carro, bag térmica, celular com GPS). Os
--     equipamentos aumentam o pagamento, diminuem a espera, aumentam a
--     chance do "extra" (gorjeta, cachê extra...) e facilitam o minijogo.
--   - Equipamentos pedem um nível NA PROFISSÃO e, às vezes, o anterior da
--     mesma linha (para comprar a moto, precisa ter a bicicleta).
--   - Trabalhar agora tem um minijogo. Funciona em 2 passos:
--       1) comecar_trabalho(id)  → confere a espera e já marca o turno
--          (fechar o jogo no meio perde o turno);
--       2) trabalhar(id, desempenho) → paga conforme o desempenho (0 a 100).
--
-- SEGURANÇA: o desempenho vem do navegador, então ele só muda o
-- pagamento dentro de um limite (40% a 100%), o turno precisa ter começado
-- antes (comecar_trabalho) e ter durado alguns segundos. O resto continua
-- sorteado e conferido aqui no banco.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) PROFISSÕES: todas liberadas + colunas novas
-- ---------------------------------------------------------------------
alter table public.trabalhos add column if not exists xp_geral     int     not null default 12;     -- XP geral por turno
alter table public.trabalhos add column if not exists nome_extra   text    not null default 'Gorjeta'; -- nome do bônus de sorte
alter table public.trabalhos add column if not exists chance_extra numeric not null default 0.10;  -- chance base do bônus (0.10 = 10%)

-- Quando o turno começou (para o minijogo). Vazio = ninguém jogando.
alter table public.trabalho_niveis add column if not exists jogando_desde timestamptz;

update public.trabalhos t set
  nivel_minimo = 1,
  xp_geral     = v.xp,
  nome_extra   = v.extra,
  descricao    = v.descr
from (values
  ('entregador',    12, 'Gorjeta',          'Entregar pedidos pela cidade.'),
  ('churrasqueiro', 16, 'Gorjeta',          'Cuidar da grelha no churrasco dos outros.'),
  ('dj',            20, 'Cachê extra',      'Tocar a noite inteira numa festa.'),
  ('programador',   26, 'Bônus do cliente', 'Fazer um site para um cliente (tipo este aqui).'),
  ('empresario',    34, 'Investidor',       'Fechar negócios e organizar eventos grandes.')
) as v(id, xp, extra, descr)
where t.id = v.id;


-- ---------------------------------------------------------------------
-- 2) EQUIPAMENTOS
-- ---------------------------------------------------------------------
-- "linha": itens da mesma linha são versões melhores uns dos outros
-- (bicicleta, moto, carro). Só vale o melhor de cada linha que a pessoa tem.
-- Efeitos (somam entre linhas diferentes):
--   pagamento: +0.15 = paga 15% a mais
--   espera:     0.30 = espera 30% menor (o total é limitado a 60%)
--   extra:     +0.15 = 15 pontos a mais de chance do bônus de sorte
--   ajuda:      cada ponto deixa o minijogo um pouco mais fácil
create table if not exists public.equipamentos (
  id           text primary key,
  trabalho_id  text not null references public.trabalhos(id) on delete cascade,
  linha        text not null,
  nome         text not null check (char_length(nome) between 1 and 60),
  descricao    text not null default '' check (char_length(descricao) <= 300),
  preco        bigint not null check (preco > 0),
  nivel_min    int not null default 1,                  -- nível NA PROFISSÃO
  requer       text references public.equipamentos(id) on delete set null,
  pagamento    numeric not null default 0,
  espera       numeric not null default 0,
  extra        numeric not null default 0,
  ajuda        int not null default 0,
  ordem        int not null default 1                   -- posição na linha (1, 2, 3...)
);

create table if not exists public.meus_equipamentos (
  perfil_id       uuid not null references public.perfis(id) on delete cascade,
  equipamento_id  text not null references public.equipamentos(id) on delete cascade,
  comprado_em     timestamptz not null default now(),
  primary key (perfil_id, equipamento_id)
);

alter table public.equipamentos      enable row level security;
alter table public.meus_equipamentos enable row level security;

drop policy if exists "ver equipamentos" on public.equipamentos;
create policy "ver equipamentos" on public.equipamentos for select using (eh_katequista());
drop policy if exists "admin cuida dos equipamentos" on public.equipamentos;
create policy "admin cuida dos equipamentos" on public.equipamentos for all using (eh_admin()) with check (eh_admin());

drop policy if exists "ver equipamentos comprados" on public.meus_equipamentos;
create policy "ver equipamentos comprados" on public.meus_equipamentos for select using (eh_katequista());

-- Equipamentos iniciais (só entram se ainda não existirem; para mudar valores,
-- use o Table Editor, tabela "equipamentos")
insert into public.equipamentos (id, trabalho_id, linha, nome, descricao, preco, nivel_min, requer, pagamento, espera, extra, ajuda, ordem) values
  -- Entregador
  ('bicicleta',      'entregador', 'veiculo', 'Bicicleta',       'Bem mais rápido que a pé.',                        300, 1, null,          0,    0.15, 0,    1, 1),
  ('moto',           'entregador', 'veiculo', 'Moto',            'Mais entregas por hora e corridas mais longas.',  2500, 3, 'bicicleta',   0.15, 0.30, 0,    2, 2),
  ('carro',          'entregador', 'veiculo', 'Carro',           'Pedidos grandes e qualquer distância.',          12000, 5, 'moto',        0.35, 0.40, 0,    3, 3),
  ('bag_termica',    'entregador', 'bag',     'Bag térmica',     'A comida chega quente: mais chance de gorjeta.',   600, 2, null,          0,    0,    0.15, 0, 1),
  ('celular_gps',    'entregador', 'celular', 'Celular com GPS', 'Rotas melhores e mais pedidos aceitos.',          1200, 4, null,          0.10, 0,    0,    1, 1),
  -- Churrasqueiro
  ('faca_pegador',   'churrasqueiro', 'ferramentas',   'Faca e pegador',          'Corte certo e menos carne perdida.',          400, 1, null,                   0.05, 0,    0,    1, 1),
  ('churrasq_tijolo','churrasqueiro', 'churrasqueira', 'Churrasqueira de tijolo', 'Cabe mais carne de uma vez.',                2000, 3, null,                   0.20, 0,    0,    0, 1),
  ('parrilla',       'churrasqueiro', 'churrasqueira', 'Parrilla argentina',      'Controle total do fogo.',                    9000, 5, 'churrasq_tijolo',      0.40, 0.20, 0,    1, 2),
  ('avental',        'churrasqueiro', 'visual',        'Avental de mestre',       'Ninguém reclama do mestre do churrasco.',     800, 2, null,                   0,    0,    0.15, 0, 1),
  -- DJ
  ('fone_retorno',   'dj', 'fone',        'Fone de retorno',      'Ouvir a próxima música antes de soltar.',        500, 1, null,            0,    0,    0,    1, 1),
  ('controladora',   'dj', 'equipamento', 'Controladora',         'Mixar sem depender só do notebook.',            3000, 3, null,            0.20, 0,    0,    0, 1),
  ('cdj',            'dj', 'equipamento', 'Kit CDJ profissional', 'O equipamento das festas grandes.',            15000, 5, 'controladora',  0.45, 0.15, 0,    1, 2),
  ('luzes',          'dj', 'show',        'Luzes e fumaça',       'A pista anima e o contratante paga a mais.',    2000, 2, null,            0,    0,    0.20, 0, 1),
  -- Programador
  ('monitor_extra',  'programador', 'setup',      'Segundo monitor',  'Código de um lado, site do outro.',           800, 1, null,           0,    0.15, 0,    1, 1),
  ('notebook_bom',   'programador', 'computador', 'Notebook potente', 'Compila rápido e não trava.',                4000, 3, null,           0.20, 0,    0,    0, 1),
  ('pc_completo',    'programador', 'computador', 'Setup completo',   'Clientes grandes, projetos grandes.',       18000, 5, 'notebook_bom', 0.40, 0.20, 0,    1, 2),
  ('cafeteira',      'programador', 'cafe',       'Cafeteira',        'Entrega antes do prazo, cliente dá bônus.',  1000, 2, null,           0,    0,    0.15, 0, 1),
  -- Empresário
  ('terno',          'empresario', 'roupa',      'Terno',           'Primeira impressão nas reuniões.',            1500, 1, null,             0,    0,    0.15, 0, 1),
  ('sala_comercial', 'empresario', 'escritorio', 'Sala comercial',  'Endereço sério, clientes sérios.',            8000, 3, null,             0.20, 0,    0,    0, 1),
  ('predio',         'empresario', 'escritorio', 'Prédio próprio',  'Sem aluguel e com eventos maiores.',         40000, 5, 'sala_comercial', 0.45, 0.25, 0,    1, 2),
  ('assistente',     'empresario', 'equipe',     'Assistente',      'Cuida da agenda e das negociações chatas.',  5000, 2, null,             0,    0.20, 0,    1, 1)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 3) FUNÇÕES
-- ---------------------------------------------------------------------

-- Soma dos efeitos dos equipamentos de alguém numa profissão
-- (vale só o melhor item de cada linha)
create or replace function public.efeitos_trabalho(quem uuid, id_trabalho text,
  out p_pagamento numeric, out p_espera numeric, out p_extra numeric, out p_ajuda int)
language sql stable security definer set search_path = public as $$
  with melhores as (
    select distinct on (e.linha) e.*
      from meus_equipamentos me
      join equipamentos e on e.id = me.equipamento_id
     where me.perfil_id = quem and e.trabalho_id = id_trabalho
     order by e.linha, e.ordem desc
  )
  select coalesce(sum(pagamento), 0),
         least(coalesce(sum(espera), 0), 0.6),
         coalesce(sum(extra), 0),
         coalesce(sum(ajuda), 0)::int
    from melhores;
$$;

-- Comprar um equipamento
create or replace function public.comprar_equipamento(id_equip text) returns json
language plpgsql security definer set search_path = public as $$
declare
  c   carteiras%rowtype;
  e   equipamentos%rowtype;
  xpt int;
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
  if c.saldo < e.preco then raise exception 'Saldo insuficiente.'; end if;

  insert into meus_equipamentos (perfil_id, equipamento_id) values (auth.uid(), e.id);
  update carteiras set xp = xp + 3 where perfil_id = auth.uid();
  return json_build_object('saldo', mexer_saldo(auth.uid(), -e.preco, 'compra', 'Comprou ' || e.nome));
end;
$$;

-- Começar um turno: confere a espera, marca o turno e devolve a "ajuda" do minijogo
create or replace function public.comecar_trabalho(id_trabalho text) returns json
language plpgsql security definer set search_path = public as $$
declare
  c  carteiras%rowtype;
  t  trabalhos%rowtype;
  tn trabalho_niveis%rowtype;
  ef record;
begin
  c := minha_carteira_travada();
  select * into t from trabalhos where id = id_trabalho;
  if not found then raise exception 'Trabalho não encontrado.'; end if;

  insert into trabalho_niveis (perfil_id, trabalho_id) values (auth.uid(), t.id) on conflict do nothing;
  select * into tn from trabalho_niveis where perfil_id = auth.uid() and trabalho_id = t.id for update;
  select * into ef from efeitos_trabalho(auth.uid(), t.id);

  if tn.ultimo_em is not null
     and tn.ultimo_em + make_interval(secs => t.espera_min * 60 * (1 - ef.p_espera)) > now() then
    raise exception 'Ainda não dá para trabalhar de novo como %.', t.nome;
  end if;

  -- A espera conta a partir de agora (fechar o jogo no meio perde o turno)
  update trabalho_niveis set ultimo_em = now(), jogando_desde = now()
   where perfil_id = auth.uid() and trabalho_id = t.id;

  return json_build_object('ajuda', ef.p_ajuda);
end;
$$;

-- Terminar o turno: paga conforme o desempenho do minijogo (0 a 100)
--   pagamento = sorteio entre mín e máx
--             × (1 + 10% por nível na profissão)
--             × (1 + bônus dos equipamentos)
--             × (40% a 100%, conforme o desempenho)
--   extra (gorjeta etc.): chance = base + equipamentos + até 15% pelo desempenho;
--                         vale de 25% a 60% do pagamento
drop function if exists public.trabalhar(text);
create or replace function public.trabalhar(id_trabalho text, desempenho int default 0) returns json
language plpgsql security definer set search_path = public as $$
declare
  c             carteiras%rowtype;
  t             trabalhos%rowtype;
  tn            trabalho_niveis%rowtype;
  ef            record;
  d             numeric;
  nivel_t_antes int;
  nivel_t       int;
  nivel_antes   int;
  ganho         bigint;
  extra         bigint := 0;
  chance        numeric;
  xp_t          int;
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
  d := least(100, greatest(0, coalesce(desempenho, 0)));
  nivel_t_antes := nivel_trabalho(tn.xp);
  nivel_antes   := nivel_de(c.xp);

  ganho := greatest(1, floor(
      (t.pagamento_min + random() * (t.pagamento_max - t.pagamento_min))
    * (1 + 0.1 * (nivel_t_antes - 1))
    * (1 + ef.p_pagamento)
    * (0.4 + 0.6 * d / 100)));

  chance := t.chance_extra + ef.p_extra + 0.15 * d / 100;
  if random() < chance then
    extra := greatest(1, floor(ganho * (0.25 + random() * 0.35)));
  end if;

  xp_t := case when d >= 70 then 2 else 1 end;   -- jogou bem: sobe mais rápido na profissão
  update trabalho_niveis set xp = xp + xp_t, vezes = vezes + 1, jogando_desde = null
   where perfil_id = auth.uid() and trabalho_id = t.id;
  update carteiras set xp = xp + t.xp_geral where perfil_id = auth.uid();
  nivel_t := nivel_trabalho(tn.xp + xp_t);

  saldo_novo := mexer_saldo(auth.uid(), ganho, 'trabalho', 'Trabalhou como ' || t.nome);
  if extra > 0 then
    saldo_novo := mexer_saldo(auth.uid(), extra, 'trabalho', t.nome_extra || ' (' || t.nome || ')');
  end if;

  return json_build_object(
    'ganho', ganho,
    'extra', extra,
    'nome_extra', t.nome_extra,
    'desempenho', d,
    'saldo', saldo_novo,
    'xp_ganho', t.xp_geral,
    'nivel_trabalho', nivel_t,
    'subiu_trabalho', nivel_t > nivel_t_antes,
    'nivel', nivel_de(c.xp + t.xp_geral),
    'subiu_nivel', nivel_de(c.xp + t.xp_geral) > nivel_antes
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
    ('2026-10-24 11:06-03', 'nova', 'Economia: minijogos nas profissões',
     'Todas as profissões liberadas desde o nível 1. Cada turno agora é um minijogo de cliques (Rota de entregas, Ponto da carne, Sequência, Caça aos bugs e Negociação); o desempenho muda o pagamento e a chance de gorjeta/extra.'),
    ('2026-10-24 11:06-03', 'nova', 'Economia: equipamentos por profissão na Loja',
     'Linhas de progressão por profissão (ex: bicicleta → moto → carro). Os equipamentos pedem nível na profissão e aumentam pagamento, diminuem espera, aumentam a chance de extra e facilitam o minijogo.'),
    ('2026-10-24 11:06-03', 'melhoria', 'Cassino com animações novas',
     'Moeda arremessada em 3D, roleta de verdade com a bola caindo no número, caça-níquel com alavanca e rolos borrados, saldo contando e moedas caindo nos prêmios.'),
    ('2026-10-24 11:06-03', 'banco', 'supabase-15.sql',
     'Tabelas equipamentos e meus_equipamentos; funções comecar_trabalho, trabalhar(id, desempenho), comprar_equipamento e efeitos_trabalho.')
  ) as v(criado_em, tipo, titulo, descricao)
 where not exists (select 1 from public.atualizacoes a where a.titulo = v.titulo);
