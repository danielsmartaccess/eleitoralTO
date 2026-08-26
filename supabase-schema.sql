-- ============================================================================
-- supabase-schema.sql
-- Pesquisa Eleitoral Araguaína 2026 — Foccus Pesquisas
--
-- Reset completo: o app de campo deixou de ter autenticação por token
-- (equipes), cotas por sexo/faixa etária, auditoria de duração/dispositivo e
-- GPS. O modelo agora é o mínimo necessário para coletar e reportar a
-- pesquisa: pesquisas -> entrevistas -> respostas (EAV). Gurupi e Palmas
-- entram depois como novas linhas em `pesquisas`, reaproveitando o mesmo
-- schema.
-- ============================================================================

create extension if not exists pgcrypto;

drop table if exists public.auditoria cascade;
drop table if exists public.respostas cascade;
drop table if exists public.cotas cascade;
drop table if exists public.entrevistas cascade;
drop table if exists public.equipes cascade;
drop table if exists public.rodadas cascade;
drop table if exists public.pesquisas cascade;

-- ---------------------------------------------------------------------------
create table public.pesquisas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  municipio text not null,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
create table public.entrevistas (
  id uuid primary key default gen_random_uuid(),
  -- Chave de idempotência gerada no cliente (crypto.randomUUID()) no início
  -- da entrevista. Reenviar a mesma entrevista nunca cria duplicata porque a
  -- sincronização faz upsert por session_id.
  session_id text not null unique,
  pesquisa_id uuid references public.pesquisas(id) on delete set null,
  pesquisador text not null,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'completo')),
  municipio text,
  coletado_em timestamptz default now(),
  duracao_seg integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- EAV: perguntas podem mudar de pesquisa para pesquisa (Gurupi/Palmas) sem
-- exigir migração de schema — cada resposta é uma linha (questao, valor).
create table public.respostas (
  id bigint generated always as identity primary key,
  entrevista_id uuid not null references public.entrevistas(id) on delete cascade,
  questao text not null,
  valor text,
  valor_num integer,
  ordem_exibicao integer,
  respondido_em timestamptz not null default now(),
  unique (entrevista_id, questao)
);

-- ---------------------------------------------------------------------------
-- Índices
create index idx_entrevistas_session_id on public.entrevistas (session_id);
create index idx_entrevistas_pesquisa on public.entrevistas (pesquisa_id);
create index idx_entrevistas_pesquisador on public.entrevistas (pesquisador);
create index idx_entrevistas_municipio on public.entrevistas (municipio);
create index idx_entrevistas_coletado_em on public.entrevistas (coletado_em);
create index idx_entrevistas_status on public.entrevistas (status);
create index idx_respostas_entrevista on public.respostas (entrevista_id);
create index idx_respostas_questao on public.respostas (questao);

-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_entrevistas_updated_at
before update on public.entrevistas
for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed inicial: pesquisas de Araguaína e Palmas.
insert into public.pesquisas (nome, municipio, ativa)
values
  ('Pesquisa Eleitoral Araguaína 2026', 'Araguaína', true),
  ('Pesquisa Eleitoral Palmas 2026', 'Palmas', true);
