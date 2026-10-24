-- =====================================================================
-- supabase-14.sql — atualização: ECONOMIA (moeda K$).
--
--   - Só Katequistas participam.
--   - Carteira com saldo e XP (nível geral). Todo mundo começa com K$ 500.
--   - Trabalhos com tempo de espera; cada trabalho tem nível próprio
--     (quanto maior o nível no trabalho, mais ele paga).
--   - Bônus diário, transferências, loja + inventário, cassino e extrato.
--
-- SEGURANÇA: ninguém mexe no saldo direto. Toda mudança de dinheiro passa
-- por uma função daqui (security definer), que confere as regras, sorteia
-- do lado do banco e registra no extrato. Mexer no código do site não adianta.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) TABELAS
-- ---------------------------------------------------------------------

-- Carteira de cada pessoa
create table if not exists public.carteiras (
  perfil_id      uuid primary key references public.perfis(id) on delete cascade,
  saldo          bigint not null default 500 check (saldo >= 0),
  xp             bigint not null default 0 check (xp >= 0),
  ultimo_diario  date,                       -- último dia em que pegou o bônus diário
  criado_em      timestamptz not null default now()
);

-- Os trabalhos disponíveis (o admin pode mudar valores depois no Table Editor)
create table if not exists public.trabalhos (
  id              text primary key,          -- ex: 'entregador'
  nome            text not null,
  descricao       text not null default '',
  pagamento_min   int not null check (pagamento_min > 0),
  pagamento_max   int not null check (pagamento_max >= pagamento_min),
  espera_min      int not null check (espera_min >= 1),   -- minutos até poder trabalhar de novo
  nivel_minimo    int not null default 1,                 -- nível geral para liberar
  ordem           int not null default 0
);

-- Nível de cada pessoa em cada trabalho
create table if not exists public.trabalho_niveis (
  perfil_id    uuid not null references public.perfis(id) on delete cascade,
  trabalho_id  text not null references public.trabalhos(id) on delete cascade,
  xp           int not null default 0,
  vezes        int not null default 0,
  ultimo_em    timestamptz,
  primary key (perfil_id, trabalho_id)
);

-- Extrato: toda entrada e saída de dinheiro
create table if not exists public.transacoes (
  id           bigint generated always as identity primary key,
  perfil_id    uuid not null references public.perfis(id) on delete cascade,
  valor        bigint not null,              -- positivo = entrou, negativo = saiu
  tipo         text not null check (tipo in ('inicial', 'trabalho', 'diario', 'enviada', 'recebida', 'compra', 'aposta', 'premio', 'admin')),
  descricao    text not null default '',
  outro_id     uuid references public.perfis(id) on delete set null,  -- quem enviou/recebeu
  criado_em    timestamptz not null default now()
);
create index if not exists transacoes_perfil on public.transacoes (perfil_id, criado_em desc);

-- Loja e inventário
create table if not exists public.itens_loja (
  id            bigint generated always as identity primary key,
  nome          text not null check (char_length(nome) between 1 and 60),
  descricao     text not null default '' check (char_length(descricao) <= 300),
  preco         bigint not null check (preco > 0),
  nivel_minimo  int not null default 1,
  estoque       int check (estoque is null or estoque >= 0),  -- vazio = infinito
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

create table if not exists public.inventario (
  perfil_id   uuid not null references public.perfis(id) on delete cascade,
  item_id     bigint not null references public.itens_loja(id) on delete cascade,
  quantidade  int not null default 0 check (quantidade >= 0),
  primary key (perfil_id, item_id)
);


-- ---------------------------------------------------------------------
-- 2) REGRAS DE ACESSO (só leitura; escrever, só pelas funções abaixo)
-- ---------------------------------------------------------------------
alter table public.carteiras       enable row level security;
alter table public.trabalhos       enable row level security;
alter table public.trabalho_niveis enable row level security;
alter table public.transacoes      enable row level security;
alter table public.itens_loja      enable row level security;
alter table public.inventario      enable row level security;

-- Saldo e nível de todo mundo: katequistas veem (para o ranking)
drop policy if exists "ver carteiras" on public.carteiras;
create policy "ver carteiras" on public.carteiras for select using (eh_katequista());

drop policy if exists "ver trabalhos" on public.trabalhos;
create policy "ver trabalhos" on public.trabalhos for select using (eh_katequista());

drop policy if exists "ver niveis de trabalho" on public.trabalho_niveis;
create policy "ver niveis de trabalho" on public.trabalho_niveis for select using (eh_katequista());

-- Extrato: só o próprio (e o admin vê todos)
drop policy if exists "ver o proprio extrato" on public.transacoes;
create policy "ver o proprio extrato" on public.transacoes
  for select using (eh_katequista() and (perfil_id = auth.uid() or eh_admin()));

drop policy if exists "ver loja" on public.itens_loja;
create policy "ver loja" on public.itens_loja for select using (eh_katequista());
drop policy if exists "admin cuida da loja" on public.itens_loja;
create policy "admin cuida da loja" on public.itens_loja for all using (eh_admin()) with check (eh_admin());

drop policy if exists "ver inventarios" on public.inventario;
create policy "ver inventarios" on public.inventario for select using (eh_katequista());


-- ---------------------------------------------------------------------
-- 3) TRABALHOS E ITENS INICIAIS (só entram se ainda não existirem)
-- ---------------------------------------------------------------------
insert into public.trabalhos (id, nome, descricao, pagamento_min, pagamento_max, espera_min, nivel_minimo, ordem) values
  ('entregador',    'Entregador',    'Entregar pedidos de bicicleta pela cidade.',          40,  80,  30,  1, 1),
  ('churrasqueiro', 'Churrasqueiro', 'Cuidar da grelha no churrasco dos outros.',           70, 130,  60,  3, 2),
  ('dj',            'DJ',            'Tocar a noite inteira numa festa.',                  120, 220, 120,  5, 3),
  ('programador',   'Programador',   'Fazer um site para um cliente (tipo este aqui).',    200, 350, 180,  8, 4),
  ('empresario',    'Empresário',    'Organizar um evento grande e ficar com o lucro.',    320, 600, 240, 12, 5)
on conflict (id) do nothing;

insert into public.itens_loja (nome, descricao, preco, nivel_minimo)
select * from (values
  ('Cerveja gelada', 'Para a resenha.', 50::bigint, 1),
  ('Picanha', 'A melhor parte do churrasco.', 300::bigint, 2),
  ('Ingresso VIP', 'Entrada VIP na próxima festa.', 1500::bigint, 5),
  ('Carro', 'Para dar carona para a galera.', 25000::bigint, 10)
) as v(nome, descricao, preco, nivel_minimo)
where not exists (select 1 from public.itens_loja);


-- ---------------------------------------------------------------------
-- 4) FUNÇÕES DE AJUDA
-- ---------------------------------------------------------------------

-- Nível geral a partir do XP: nível 2 com 50 XP, nível 3 com 200, nível 4 com 450...
create or replace function public.nivel_de(xp bigint) returns int
language sql immutable as $$ select floor(sqrt(greatest(xp, 0) / 50.0))::int + 1; $$;

-- Nível num trabalho: nível 2 com 3 XP, nível 3 com 12, nível 4 com 27...
create or replace function public.nivel_trabalho(xp int) returns int
language sql immutable as $$ select floor(sqrt(greatest(xp, 0) / 3.0))::int + 1; $$;

-- Garante que a pessoa tem carteira (cria com K$ 500 na primeira vez) e devolve a linha travada
-- ("for update" impede que duas operações ao mesmo tempo gastem o mesmo dinheiro)
create or replace function public.minha_carteira_travada() returns public.carteiras
language plpgsql security definer set search_path = public as $$
declare c carteiras%rowtype;
begin
  if not eh_katequista() then raise exception 'A economia é só para Katequistas.'; end if;
  insert into carteiras (perfil_id) values (auth.uid()) on conflict do nothing;
  if found then
    insert into transacoes (perfil_id, valor, tipo, descricao) values (auth.uid(), 500, 'inicial', 'Dinheiro inicial');
  end if;
  select * into c from carteiras where perfil_id = auth.uid() for update;
  return c;
end;
$$;

-- Muda o saldo e registra no extrato (usada por todas as outras funções)
create or replace function public.mexer_saldo(quem uuid, valor bigint, tipo_t text, descr text, outro uuid default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare novo bigint;
begin
  update carteiras set saldo = saldo + valor where perfil_id = quem returning saldo into novo;
  if novo is null then raise exception 'Carteira não encontrada.'; end if;
  if novo < 0 then raise exception 'Saldo insuficiente.'; end if;
  insert into transacoes (perfil_id, valor, tipo, descricao, outro_id) values (quem, valor, tipo_t, descr, outro);
  return novo;
end;
$$;
-- Essa só pode ser chamada por dentro das outras funções, nunca direto pelo site
revoke execute on function public.mexer_saldo(uuid, bigint, text, text, uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5) AÇÕES DO JOGO (o site chama com sb.rpc("nome", {...}))
-- ---------------------------------------------------------------------

-- Abre a carteira (cria se não existir) e devolve saldo e nível
create or replace function public.abrir_carteira() returns json
language plpgsql security definer set search_path = public as $$
declare c carteiras%rowtype;
begin
  c := minha_carteira_travada();
  return json_build_object('saldo', c.saldo, 'xp', c.xp, 'nivel', nivel_de(c.xp),
    'diario_disponivel', c.ultimo_diario is distinct from (now() at time zone 'America/Sao_Paulo')::date);
end;
$$;

-- Bônus diário: 50 + 10 por nível, uma vez por dia (horário de Brasília)
create or replace function public.bonus_diario() returns json
language plpgsql security definer set search_path = public as $$
declare
  c carteiras%rowtype;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  valor bigint;
begin
  c := minha_carteira_travada();
  if c.ultimo_diario = hoje then raise exception 'Você já pegou o bônus de hoje. Volte amanhã.'; end if;
  valor := 50 + 10 * nivel_de(c.xp);
  update carteiras set ultimo_diario = hoje, xp = xp + 5 where perfil_id = auth.uid();
  return json_build_object('ganho', valor, 'saldo', mexer_saldo(auth.uid(), valor, 'diario', 'Bônus diário'));
end;
$$;

-- Trabalhar: confere nível e tempo de espera, paga (mais 10% por nível no trabalho) e dá XP
create or replace function public.trabalhar(id_trabalho text) returns json
language plpgsql security definer set search_path = public as $$
declare
  c         carteiras%rowtype;
  t         trabalhos%rowtype;
  tn        trabalho_niveis%rowtype;
  nivel_t   int;
  ganho     bigint;
  xp_geral  int;
  nivel_antes int;
  nivel_t_antes int;
begin
  c := minha_carteira_travada();
  select * into t from trabalhos where id = id_trabalho;
  if not found then raise exception 'Trabalho não encontrado.'; end if;
  if nivel_de(c.xp) < t.nivel_minimo then
    raise exception 'Esse trabalho libera no nível %.', t.nivel_minimo;
  end if;

  insert into trabalho_niveis (perfil_id, trabalho_id) values (auth.uid(), t.id) on conflict do nothing;
  select * into tn from trabalho_niveis where perfil_id = auth.uid() and trabalho_id = t.id for update;
  if tn.ultimo_em is not null and tn.ultimo_em + make_interval(mins => t.espera_min) > now() then
    raise exception 'Ainda não dá para trabalhar de novo como %.', t.nome;
  end if;

  nivel_t_antes := nivel_trabalho(tn.xp);
  nivel_antes   := nivel_de(c.xp);
  -- Pagamento sorteado entre o mínimo e o máximo, com bônus de 10% por nível no trabalho
  ganho := floor((t.pagamento_min + random() * (t.pagamento_max - t.pagamento_min)) * (1 + 0.1 * (nivel_t_antes - 1)));
  xp_geral := 10 + 2 * t.nivel_minimo;

  update trabalho_niveis set xp = xp + 1, vezes = vezes + 1, ultimo_em = now()
   where perfil_id = auth.uid() and trabalho_id = t.id;
  update carteiras set xp = xp + xp_geral where perfil_id = auth.uid();
  nivel_t := nivel_trabalho(tn.xp + 1);

  return json_build_object(
    'ganho', ganho,
    'saldo', mexer_saldo(auth.uid(), ganho, 'trabalho', 'Trabalhou como ' || t.nome),
    'xp_ganho', xp_geral,
    'nivel_trabalho', nivel_t,
    'subiu_trabalho', nivel_t > nivel_t_antes,
    'nivel', nivel_de(c.xp + xp_geral),
    'subiu_nivel', nivel_de(c.xp + xp_geral) > nivel_antes,
    'proximo_em', now() + make_interval(mins => t.espera_min)
  );
end;
$$;

-- Transferir dinheiro para outro katequista
create or replace function public.transferir(para uuid, valor bigint, mensagem text default '') returns json
language plpgsql security definer set search_path = public as $$
declare
  c carteiras%rowtype;
  nome_para text;
  nome_de text;
begin
  c := minha_carteira_travada();
  if valor is null or valor < 1 then raise exception 'Valor inválido.'; end if;
  if para = auth.uid() then raise exception 'Não dá para transferir para você mesmo.'; end if;
  if c.saldo < valor then raise exception 'Saldo insuficiente.'; end if;
  -- Quem recebe precisa ser katequista
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

-- Comprar um item da loja
create or replace function public.comprar(id_item bigint) returns json
language plpgsql security definer set search_path = public as $$
declare
  c carteiras%rowtype;
  i itens_loja%rowtype;
begin
  c := minha_carteira_travada();
  select * into i from itens_loja where id = id_item and ativo for update;
  if not found then raise exception 'Item não disponível.'; end if;
  if nivel_de(c.xp) < i.nivel_minimo then raise exception 'Esse item libera no nível %.', i.nivel_minimo; end if;
  if i.estoque is not null and i.estoque < 1 then raise exception 'Esgotado.'; end if;
  if c.saldo < i.preco then raise exception 'Saldo insuficiente.'; end if;

  if i.estoque is not null then update itens_loja set estoque = estoque - 1 where id = i.id; end if;
  insert into inventario (perfil_id, item_id, quantidade) values (auth.uid(), i.id, 1)
  on conflict (perfil_id, item_id) do update set quantidade = inventario.quantidade + 1;
  update carteiras set xp = xp + 3 where perfil_id = auth.uid();
  return json_build_object('saldo', mexer_saldo(auth.uid(), -i.preco, 'compra', 'Comprou ' || i.nome));
end;
$$;

-- Cassino. jogo: 'moeda' | 'roleta' | 'slots'. O banco sorteia tudo.
--   moeda:  escolha 'cara' ou 'coroa'                     → acertou: recebe 2x
--   roleta: escolha 'vermelho' ou 'preto' (2x) ou 'verde' (36x). Números 0 a 36; o 0 é verde.
--   slots:  3 rolos. 3 iguais pagam de 5x a 100x; 2 cerejas devolvem a aposta.
create or replace function public.apostar(jogo text, valor bigint, escolha text default null) returns json
language plpgsql security definer set search_path = public as $$
declare
  c          carteiras%rowtype;
  premio     bigint := 0;
  resultado  json;
  numero     int;
  cor        text;
  lado       text;
  simbolos   text[] := array['cereja', 'limao', 'sino', 'estrela', 'sete'];
  pesos      int[]  := array[40, 30, 15, 10, 5];              -- chance de cada símbolo (soma 100)
  pagamento  int[]  := array[5, 8, 15, 30, 100];              -- 3 iguais pagam isso vezes a aposta
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

  nome_jogo := case jogo when 'moeda' then 'Cara ou Coroa' when 'roleta' then 'Roleta' when 'slots' then 'Caça-níquel' else jogo end;
  perform mexer_saldo(auth.uid(), -valor, 'aposta', 'Aposta: ' || nome_jogo);

  if jogo = 'moeda' then
    if escolha not in ('cara', 'coroa') then raise exception 'Escolha cara ou coroa.'; end if;
    lado := case when random() < 0.5 then 'cara' else 'coroa' end;
    if lado = escolha then premio := valor * 2; end if;
    resultado := json_build_object('lado', lado);

  elsif jogo = 'roleta' then
    if escolha not in ('vermelho', 'preto', 'verde') then raise exception 'Escolha vermelho, preto ou verde.'; end if;
    numero := floor(random() * 37)::int;   -- 0 a 36
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
      premio := valor;   -- devolve a aposta
    end if;
    resultado := json_build_object('rolos', rolos);

  else
    raise exception 'Jogo desconhecido.';
  end if;

  update carteiras set xp = xp + 2 where perfil_id = auth.uid();
  if premio > 0 then
    perform mexer_saldo(auth.uid(), premio, 'premio', 'Prêmio: ' || nome_jogo);
  end if;

  return json_build_object(
    'resultado', resultado,
    'premio', premio,
    'lucro', premio - valor,
    'saldo', (select saldo from carteiras where perfil_id = auth.uid())
  );
end;
$$;

-- Admin: dar ou tirar dinheiro de alguém
create or replace function public.admin_ajustar_saldo(quem uuid, valor bigint, motivo text) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'Só administradores.'; end if;
  if valor = 0 then raise exception 'Valor inválido.'; end if;
  insert into carteiras (perfil_id) values (quem) on conflict do nothing;
  return json_build_object('saldo', mexer_saldo(quem, valor, 'admin', 'Ajuste do admin: ' || left(coalesce(motivo, ''), 100)));
end;
$$;
