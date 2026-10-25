-- =====================================================================
-- supabase.sql — cria o banco de dados do Katequese.
--
-- COMO USAR: no Supabase, abra "SQL Editor", cole TUDO isto e clique em "Run".
-- Pode rodar mais de uma vez sem problema.
--
-- A ideia principal: ninguém vê NADA do site (frases, eventos, regras,
-- recados, membros) até um administrador aprovar o cadastro. Quem garante
-- isso é o próprio banco, com as regras de "Row Level Security" (RLS) —
-- então nem mexendo no código do site dá para burlar.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) PERFIS: uma linha para cada pessoa cadastrada
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  usuario     text unique not null,              -- nome de login, ex: "kayo"
  nome        text not null default '',
  apelido     text not null default '',
  aniversario date,
  bio         text not null default '',
  status      text not null default 'pendente'
              check (status in ('pendente', 'aprovado', 'recusado')),
  admin       boolean not null default false,
  criado_em   timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 2) FUNÇÕES DE AJUDA usadas pelas regras de acesso
-- "security definer" = a função roda com permissão total, para conseguir
-- consultar a tabela perfis sem cair nas próprias regras (senão daria loop).
-- ---------------------------------------------------------------------
create or replace function public.eh_aprovado() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and status = 'aprovado');
$$;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and status = 'aprovado' and admin);
$$;


-- ---------------------------------------------------------------------
-- 3) CADASTRO AUTOMÁTICO DO PERFIL
-- Toda vez que alguém se cadastra, cria o perfil como "pendente".
-- Exceção: o usuário "kayo" já nasce aprovado e administrador, MAS só
-- enquanto ainda não existir nenhum administrador (para ninguém usar
-- o nome "kayo" depois para virar admin).
-- ---------------------------------------------------------------------
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u text := lower(coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email, '@', 1)));
  primeiro_admin boolean := u = 'kayo' and not exists (select 1 from perfis where admin);
begin
  insert into perfis (id, usuario, nome, status, admin)
  values (
    new.id,
    u,
    coalesce(nullif(new.raw_user_meta_data->>'nome', ''), u),
    case when primeiro_admin then 'aprovado' else 'pendente' end,
    primeiro_admin
  );
  return new;
end;
$$;

drop trigger if exists ao_cadastrar on auth.users;
create trigger ao_cadastrar
  after insert on auth.users
  for each row execute function public.novo_usuario();


-- ---------------------------------------------------------------------
-- 4) PROTEÇÃO: só admin muda status, admin e nome de usuário.
-- Sem isso, alguém poderia editar o próprio perfil e se "auto-aprovar".
-- ---------------------------------------------------------------------
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() vazio = alteração feita direto pelo painel do Supabase (dono do projeto): liberado
  if auth.uid() is not null and not eh_admin() then
    new.status  := old.status;
    new.admin   := old.admin;
    new.usuario := old.usuario;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger on public.perfis;
create trigger proteger
  before update on public.perfis
  for each row execute function public.proteger_perfil();


-- ---------------------------------------------------------------------
-- 5) REGRAS DE ACESSO DOS PERFIS
-- ---------------------------------------------------------------------
alter table public.perfis enable row level security;

drop policy if exists "ver perfis" on public.perfis;
create policy "ver perfis" on public.perfis
  for select using (id = auth.uid() or eh_aprovado());   -- pendente só vê o próprio

drop policy if exists "editar o proprio perfil" on public.perfis;
create policy "editar o proprio perfil" on public.perfis
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "admin edita perfis" on public.perfis;
create policy "admin edita perfis" on public.perfis
  for update using (eh_admin());


-- ---------------------------------------------------------------------
-- 6) CONFIG: frases, números, eventos e regras do site (o que o admin edita)
-- É uma tabela com uma linha só, guardando tudo num campo JSON.
-- ---------------------------------------------------------------------
create table if not exists public.config (
  id    int primary key default 1 check (id = 1),   -- garante que só existe a linha 1
  dados jsonb not null
);

alter table public.config enable row level security;

drop policy if exists "membros leem config" on public.config;
create policy "membros leem config" on public.config
  for select using (eh_aprovado());

drop policy if exists "admin altera config" on public.config;
create policy "admin altera config" on public.config
  for update using (eh_admin());

-- Conteúdo inicial (só é inserido se ainda não existir)
insert into public.config (id, dados) values (1, $json$
{
  "numeros": { "membros": 19, "cervejas": 1347, "furados": 58, "noHorario": 0 },
  "lemas": [
    "Fundado na bagunça, mantido na cachaça.",
    "Patrimônio cultural da vergonha alheia.",
    "Nenhum rolê começa no horário. Nenhum.",
    "O grupo que a sua mãe mandou você evitar.",
    "Desde sempre fazendo merda em conjunto."
  ],
  "gritos": [
    "KATEQUESE, PORRA! 🔥",
    "Respeita o Katequese, caralho.",
    "Aqui ninguém presta, mas todo mundo aparece.",
    "Katequese: porque nenhum outro grupo aceitou a gente.",
    "Ninguém sabe quem fundou essa merda, mas agora é tarde.",
    "Se deu errado, provavelmente foi o Katequese.",
    "Para de clicar e vai marcar um rolê, desgraça.",
    "Isso aqui não é botão, mas tudo bem, continua."
  ],
  "sabedorias": [
    "Se ninguém filmou, não aconteceu.",
    "Todo 'só uma' é mentira.",
    "A ressaca passa. A vergonha é eterna.",
    "Rolê marcado num grupo de 19 pessoas é ficção científica.",
    "O churrasco só começa quando o último chega. Ou seja, nunca.",
    "Quem bebe pra esquecer, paga antes de beber.",
    "Plano bom é plano que ninguém lembra no dia seguinte.",
    "Amigo de verdade segura teu cabelo e depois posta o vídeo."
  ],
  "eventos": [],
  "regras": []
}
$json$::jsonb)
on conflict (id) do nothing;


-- O botão "Alguém caiu" pode ser apertado por qualquer membro aprovado,
-- mas ele só mexe na data da última queda (não deixa mexer no resto da config).
create or replace function public.registrar_queda() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eh_aprovado() then
    raise exception 'Sem permissão';
  end if;
  update config
     set dados = jsonb_set(dados, '{ultimaQueda}',
                           to_jsonb(to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')))
   where id = 1;
end;
$$;


-- ---------------------------------------------------------------------
-- 7) RECADOS do mural
-- ---------------------------------------------------------------------
create table if not exists public.recados (
  id        bigint generated always as identity primary key,
  autor_id  uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  texto     text not null check (char_length(texto) between 1 and 280),
  fixado    boolean not null default false,
  criado_em timestamptz not null default now()
);

alter table public.recados enable row level security;

drop policy if exists "membros leem recados" on public.recados;
create policy "membros leem recados" on public.recados
  for select using (eh_aprovado());

drop policy if exists "membros postam recados" on public.recados;
create policy "membros postam recados" on public.recados
  for insert with check (eh_aprovado() and autor_id = auth.uid() and fixado = false);

drop policy if exists "admin fixa recados" on public.recados;
create policy "admin fixa recados" on public.recados
  for update using (eh_admin());

drop policy if exists "apagar o proprio recado ou admin" on public.recados;
create policy "apagar o proprio recado ou admin" on public.recados
  for delete using (eh_aprovado() and (autor_id = auth.uid() or eh_admin()));
