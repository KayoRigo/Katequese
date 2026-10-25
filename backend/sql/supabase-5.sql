-- =====================================================================
-- supabase-5.sql — atualização: ENQUETES.
--
--   - Katequistas criam e votam.
--   - Quem cria escolhe: duração, título, descrição, imagem, se aceita
--     várias opções, se os votos são anônimos, se visitantes podem ver
--     e (se puderem ver) se visitantes podem votar.
--   - Dá para mudar o voto até a enquete terminar.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Precisa dos arquivos supabase.sql até o -4 já executados. Pode rodar mais de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) TABELAS
-- ---------------------------------------------------------------------
create table if not exists public.enquetes (
  id                 bigint generated always as identity primary key,
  autor_id           uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  titulo             text not null check (char_length(titulo) between 1 and 120),
  descricao          text not null default '' check (char_length(descricao) <= 500),
  foto_path          text,
  termina_em         timestamptz not null,
  multipla           boolean not null default false,   -- pode votar em mais de uma opção?
  anonima            boolean not null default false,   -- esconde quem votou em quê?
  visivel_visitantes boolean not null default false,
  visitantes_votam   boolean not null default false,
  criado_em          timestamptz not null default now(),
  check (visivel_visitantes or not visitantes_votam)    -- só vota quem pode ver
);

create table if not exists public.enquete_opcoes (
  id          bigint generated always as identity primary key,
  enquete_id  bigint not null references public.enquetes(id) on delete cascade,
  texto       text not null check (char_length(texto) between 1 and 100),
  ordem       int not null default 0
);

create table if not exists public.enquete_votos (
  enquete_id  bigint not null references public.enquetes(id) on delete cascade,
  opcao_id    bigint not null references public.enquete_opcoes(id) on delete cascade,
  perfil_id   uuid not null references public.perfis(id) on delete cascade,
  criado_em   timestamptz not null default now(),
  primary key (opcao_id, perfil_id)
);


-- ---------------------------------------------------------------------
-- 2) QUEM PODE VER E QUEM PODE VOTAR
-- ---------------------------------------------------------------------
create or replace function public.pode_ver_enquete(id_enquete bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enquetes e
     where e.id = id_enquete
       and (eh_katequista() or (eh_aprovado() and e.visivel_visitantes))
  );
$$;

create or replace function public.pode_votar_enquete(id_enquete bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enquetes e
     where e.id = id_enquete
       and e.termina_em > now()
       and (eh_katequista() or (eh_aprovado() and e.visivel_visitantes and e.visitantes_votam))
  );
$$;


-- ---------------------------------------------------------------------
-- 3) REGRAS DE ACESSO
-- Criar e votar só acontecem pelas funções criar_enquete() e votar(),
-- que conferem tudo. Por isso não existe permissão de "insert" direto.
-- ---------------------------------------------------------------------
alter table public.enquetes enable row level security;
alter table public.enquete_opcoes enable row level security;
alter table public.enquete_votos enable row level security;

drop policy if exists "ver enquetes" on public.enquetes;
create policy "ver enquetes" on public.enquetes
  for select using (pode_ver_enquete(id));

drop policy if exists "autor ou admin apaga enquete" on public.enquetes;
create policy "autor ou admin apaga enquete" on public.enquetes
  for delete using (eh_katequista() and (autor_id = auth.uid() or eh_admin()));

drop policy if exists "ver opcoes" on public.enquete_opcoes;
create policy "ver opcoes" on public.enquete_opcoes
  for select using (pode_ver_enquete(enquete_id));

-- Cada um só enxerga os PRÓPRIOS votos (os totais vêm da função resultados_enquetes)
drop policy if exists "ver os proprios votos" on public.enquete_votos;
create policy "ver os proprios votos" on public.enquete_votos
  for select using (perfil_id = auth.uid());


-- ---------------------------------------------------------------------
-- 4) CRIAR ENQUETE (com as opções, tudo de uma vez)
-- ---------------------------------------------------------------------
create or replace function public.criar_enquete(
  titulo text, descricao text, foto_path text, termina_em timestamptz,
  multipla boolean, anonima boolean, visivel_visitantes boolean, visitantes_votam boolean,
  opcoes text[]
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  nova_id bigint;
  textos text[];
begin
  if not eh_katequista() then
    raise exception 'Só katequistas podem criar enquetes.';
  end if;
  if termina_em <= now() then
    raise exception 'A enquete precisa terminar no futuro.';
  end if;
  if termina_em > now() + interval '1 year' then
    raise exception 'A enquete pode durar no máximo 1 ano.';
  end if;

  -- Tira opções vazias e espaços sobrando
  select array_agg(trim(t)) into textos from unnest(opcoes) t where trim(t) <> '';
  if coalesce(array_length(textos, 1), 0) < 2 or array_length(textos, 1) > 10 then
    raise exception 'A enquete precisa ter de 2 a 10 opções.';
  end if;

  insert into enquetes (titulo, descricao, foto_path, termina_em, multipla, anonima,
                        visivel_visitantes, visitantes_votam)
  values (trim(criar_enquete.titulo), coalesce(trim(criar_enquete.descricao), ''), criar_enquete.foto_path,
          criar_enquete.termina_em, criar_enquete.multipla, criar_enquete.anonima,
          criar_enquete.visivel_visitantes, criar_enquete.visivel_visitantes and criar_enquete.visitantes_votam)
  returning id into nova_id;

  insert into enquete_opcoes (enquete_id, texto, ordem)
  select nova_id, t, n from unnest(textos) with ordinality as x(t, n);

  return nova_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 5) VOTAR (troca o voto anterior; lista vazia = retirar o voto)
-- ---------------------------------------------------------------------
create or replace function public.votar(id_enquete bigint, opcoes bigint[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  e enquetes;
begin
  select * into e from enquetes where id = id_enquete;
  if not found or not pode_votar_enquete(id_enquete) then
    raise exception 'Você não pode votar nesta enquete.';
  end if;
  if not e.multipla and coalesce(array_length(opcoes, 1), 0) > 1 then
    raise exception 'Esta enquete aceita só uma opção.';
  end if;
  if exists (select 1 from unnest(opcoes) x
              where not exists (select 1 from enquete_opcoes o where o.id = x and o.enquete_id = id_enquete)) then
    raise exception 'Opção inválida.';
  end if;

  delete from enquete_votos where enquete_id = id_enquete and perfil_id = auth.uid();
  insert into enquete_votos (enquete_id, opcao_id, perfil_id)
  select distinct id_enquete, x, auth.uid() from unnest(opcoes) x;
end;
$$;


-- ---------------------------------------------------------------------
-- 6) RESULTADOS: total de cada opção, quantas pessoas votaram e,
-- se a enquete NÃO for anônima, os nomes de quem votou.
-- ---------------------------------------------------------------------
drop function if exists public.resultados_enquetes();
create function public.resultados_enquetes()
returns table (enquete_id bigint, opcao_id bigint, total bigint, pessoas_votaram bigint, votantes text[])
language sql stable security definer set search_path = public as $$
  select o.enquete_id,
         o.id,
         count(v.perfil_id),
         (select count(distinct vv.perfil_id) from enquete_votos vv where vv.enquete_id = o.enquete_id),
         case when e.anonima then null
              else coalesce(array_agg(coalesce(nullif(p.apelido, ''), p.nome) order by p.nome)
                              filter (where v.perfil_id is not null), '{}')
         end
    from enquete_opcoes o
    join enquetes e on e.id = o.enquete_id
    left join enquete_votos v on v.opcao_id = o.id
    left join perfis p on p.id = v.perfil_id
   where pode_ver_enquete(e.id)
   group by o.enquete_id, o.id, e.anonima;
$$;


-- ---------------------------------------------------------------------
-- 7) IMAGEM DA ENQUETE: visitante só abre se a enquete for visível para ele
-- ---------------------------------------------------------------------
create or replace function public.pode_ver_arquivo(caminho text) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_katequista() or (eh_aprovado() and (
       caminho like 'perfis/%'
    or caminho like 'semana/%'
    or exists (select 1 from midias   where path      = caminho and visivel_visitantes)
    or exists (select 1 from eventos  where foto_path = caminho and visivel_visitantes)
    or exists (select 1 from enquetes where foto_path = caminho and visivel_visitantes)
  ));
$$;
