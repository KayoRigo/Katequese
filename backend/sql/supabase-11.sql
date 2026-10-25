-- =====================================================================
-- supabase-11.sql — atualização: SORTEIOS.
--
--   - Katequistas criam sorteios: título, imagem (opcional) e a lista de itens.
--   - Opções: "não repetir item já sorteado" e "visitantes podem ver".
--   - O SORTEIO É FEITO PELO BANCO (função sortear), não pelo navegador:
--     assim ninguém consegue "escolher" o resultado mexendo no código.
--   - Só quem criou o sorteio (ou um admin) aperta "Sortear".
--   - Todo resultado fica guardado no histórico, com quem sorteou e quando.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) TABELAS
-- ---------------------------------------------------------------------
create table if not exists public.sorteios (
  id                  bigint generated always as identity primary key,
  autor_id            uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  titulo              text not null check (char_length(titulo) between 1 and 100),
  foto_path           text,
  -- A lista de itens: de 2 a 200
  itens               text[] not null check (cardinality(itens) between 2 and 200),
  sem_repetir         boolean not null default false,   -- item sorteado não sai de novo
  visivel_visitantes  boolean not null default false,
  criado_em           timestamptz not null default now()
);

create table if not exists public.sorteio_resultados (
  id            bigint generated always as identity primary key,
  sorteio_id    bigint not null references public.sorteios(id) on delete cascade,
  item          text not null,
  sorteado_por  uuid references public.perfis(id) on delete set null,
  sorteado_em   timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 2) REGRAS DE ACESSO
-- ---------------------------------------------------------------------
alter table public.sorteios enable row level security;
alter table public.sorteio_resultados enable row level security;

drop policy if exists "ver sorteios" on public.sorteios;
create policy "ver sorteios" on public.sorteios
  for select using (eh_katequista() or (eh_aprovado() and visivel_visitantes));

drop policy if exists "criar sorteio" on public.sorteios;
create policy "criar sorteio" on public.sorteios
  for insert with check (eh_katequista() and autor_id = auth.uid());

drop policy if exists "apagar sorteio" on public.sorteios;
create policy "apagar sorteio" on public.sorteios
  for delete using (eh_katequista() and (autor_id = auth.uid() or eh_admin()));

-- Resultados: vê quem vê o sorteio. Ninguém insere direto (só pela função sortear).
drop policy if exists "ver resultados" on public.sorteio_resultados;
create policy "ver resultados" on public.sorteio_resultados
  for select using (exists (select 1 from public.sorteios s where s.id = sorteio_id));

-- Quem criou (ou admin) pode limpar o histórico para recomeçar
drop policy if exists "limpar resultados" on public.sorteio_resultados;
create policy "limpar resultados" on public.sorteio_resultados
  for delete using (exists (
    select 1 from public.sorteios s
     where s.id = sorteio_id and eh_katequista() and (s.autor_id = auth.uid() or eh_admin())));


-- ---------------------------------------------------------------------
-- 3) SORTEAR (o banco escolhe o item, guarda e devolve)
-- ---------------------------------------------------------------------
create or replace function public.sortear(id_sorteio bigint) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  s        sorteios%rowtype;
  opcoes   text[];
  escolhido text;
begin
  select * into s from sorteios where id = id_sorteio;
  if not found then raise exception 'Sorteio não encontrado.'; end if;
  if not (eh_katequista() and (s.autor_id = auth.uid() or eh_admin())) then
    raise exception 'Só quem criou o sorteio (ou um admin) pode sortear.';
  end if;

  opcoes := s.itens;
  -- "Não repetir": tira da lista os itens que já saíram
  if s.sem_repetir then
    select coalesce(array_agg(i), '{}') into opcoes
      from unnest(s.itens) as i
     where i not in (select item from sorteio_resultados where sorteio_id = s.id);
  end if;
  if cardinality(opcoes) = 0 then
    raise exception 'Todos os itens já foram sorteados.';
  end if;

  -- random() dá um número entre 0 e 1; vira uma posição de 1 até o tamanho da lista
  escolhido := opcoes[1 + floor(random() * cardinality(opcoes))::int];
  insert into sorteio_resultados (sorteio_id, item, sorteado_por) values (s.id, escolhido, auth.uid());
  return escolhido;
end;
$$;


-- ---------------------------------------------------------------------
-- 4) FOTOS: a imagem do sorteio aparece para visitantes se o sorteio for liberado
-- (mesma função do supabase-6.sql, com uma linha a mais)
-- ---------------------------------------------------------------------
create or replace function public.pode_ver_arquivo(caminho text) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_katequista() or (eh_aprovado() and (
       caminho like 'perfis/%'
    or caminho like 'semana/%'
    or caminho like 'politica/%'
    or exists (select 1 from midias   where path      = caminho and visivel_visitantes)
    or exists (select 1 from eventos  where foto_path = caminho and visivel_visitantes)
    or exists (select 1 from enquetes where foto_path = caminho and visivel_visitantes)
    or exists (select 1 from sorteios where foto_path = caminho and visivel_visitantes)
  ));
$$;
