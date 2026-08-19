-- ============================================================================
-- supabase-schema.sql
-- Pesquisa Eleitoral Tocantins 2026 — Foccus Pesquisas
--
-- Reconstrói, com o modelo completo do briefing, as tabelas prototípicas que
-- já existiam no projeto (equipes/entrevistas/respostas, sem RLS efetiva e
-- sem o encadeamento pesquisa -> rodada -> equipe -> entrevista -> resposta).
-- Como as tabelas antigas tinham 0 linhas em entrevistas/respostas e apenas
-- 3 tokens de teste em equipes, foram recriadas do zero em vez de alteradas
-- incrementalmente — os 3 tokens de teste são reinseridos ao final.
--
-- Modelo: pesquisas -> rodadas -> equipes -> entrevistas -> respostas (EAV),
-- mais cotas e auditoria. Ver README.md para o racional de cada decisão.
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
  descricao text,
  estado text default 'TO',
  ativa boolean not null default true,
  metodologia text,
  responsavel_tecnico text,
  data_inicio date,
  data_fim date,
  amostra_planejada integer,
  margem_erro_percentual numeric,
  nivel_confianca_percentual numeric,
  observacoes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
create table public.rodadas (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references public.pesquisas(id) on delete cascade,
  nome text not null,
  codigo text not null unique,
  status text not null default 'ativa' check (status in ('planejada', 'ativa', 'encerrada')),
  inicio date,
  fim date,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
create table public.equipes (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  nome text not null,
  municipio text not null,
  perfil text not null default 'PESQUISADOR' check (perfil in ('PESQUISADOR', 'SUPERVISOR', 'ADMIN')),
  rodada_id uuid references public.rodadas(id) on delete set null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  ultimo_acesso timestamptz
);

-- ---------------------------------------------------------------------------
create table public.entrevistas (
  id uuid primary key default gen_random_uuid(),
  -- Chave de idempotência gerada no cliente (crypto.randomUUID()) no início
  -- da entrevista. Reenviar a mesma entrevista nunca cria duplicata porque
  -- a sincronização faz upsert por session_id (Seção 3.4 do briefing).
  session_id text not null unique,
  pesquisa_id uuid references public.pesquisas(id) on delete set null,
  rodada_id uuid references public.rodadas(id) on delete set null,
  equipe_id uuid references public.equipes(id) on delete set null,
  pesquisador text,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'completo')),
  municipio text,
  regiao text,
  zona text,
  sexo text,
  faixa_etaria text,
  escolaridade text,
  local_coleta text,
  consentimento boolean not null default false,
  coletado_em timestamptz default now(),
  duracao_seg integer,
  geo_lat double precision,
  geo_lng double precision,
  geo_accuracy double precision,
  geo_status text default 'pendente' check (geo_status in ('ok', 'negado', 'indisponivel', 'pendente')),
  device_info text,
  -- Sinalização de auditoria (Seção 32) — nunca invalida a entrevista sozinha.
  suspeita_duracao boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- EAV (Seção 24): perguntas/candidatos podem mudar de rodada para rodada sem
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
create table public.cotas (
  id uuid primary key default gen_random_uuid(),
  rodada_id uuid not null references public.rodadas(id) on delete cascade,
  municipio text not null,
  regiao text,
  sexo text,
  faixa_etaria text,
  escolaridade text,
  alvo integer not null check (alvo >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
create table public.auditoria (
  id bigint generated always as identity primary key,
  -- Referência por session_id (não por uuid interno): eventos de auditoria
  -- podem ocorrer offline, antes de a entrevista ter sido sincronizada e
  -- ganho o `id` definitivo do servidor.
  entrevista_session_id text,
  equipe_id uuid references public.equipes(id) on delete set null,
  evento text not null,
  metadata jsonb not null default '{}'::jsonb,
  "timestamp" timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Índices (Seção 45)
create index idx_entrevistas_session_id on public.entrevistas (session_id);
create index idx_entrevistas_rodada on public.entrevistas (rodada_id);
create index idx_entrevistas_pesquisa on public.entrevistas (pesquisa_id);
create index idx_entrevistas_pesquisador on public.entrevistas (pesquisador);
create index idx_entrevistas_municipio on public.entrevistas (municipio);
create index idx_entrevistas_regiao on public.entrevistas (regiao);
create index idx_entrevistas_coletado_em on public.entrevistas (coletado_em);
create index idx_entrevistas_status on public.entrevistas (status);
create index idx_respostas_entrevista on public.respostas (entrevista_id);
create index idx_respostas_questao on public.respostas (questao);
create index idx_equipes_token on public.equipes (token);
create index idx_auditoria_entrevista_session on public.auditoria (entrevista_session_id);
create index idx_cotas_rodada on public.cotas (rodada_id);

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
-- Seed inicial: pesquisa, Rodada 01 e os 3 tokens de campo já em uso.
-- Parâmetros metodológicos ficam null/TODO propositalmente — não inventamos
-- amostra planejada, margem de erro ou responsável técnico (Seção 49).
with p as (
  insert into public.pesquisas (nome, descricao, estado, ativa, observacoes)
  values (
    'Pesquisa Eleitoral Tocantins 2026',
    'Pesquisa de intenção de voto e avaliação de governo — Estado do Tocantins',
    'TO',
    true,
    'TODO_CONFIGURAR: metodologia, amostra planejada, margem de erro e responsável técnico pendentes de definição pela equipe metodológica da Foccus.'
  )
  returning id
),
r as (
  insert into public.rodadas (pesquisa_id, nome, codigo, status, inicio)
  select id, 'Rodada 01', 'RODADA_01', 'ativa', current_date from p
  returning id
)
insert into public.equipes (token, nome, municipio, perfil, rodada_id, ativo)
select x.token, x.nome, x.municipio, 'PESQUISADOR', r.id, true
from r,
(values
  ('PALMAS-001', 'Pesquisador Teste Palmas', 'Palmas'),
  ('ARAGUAINA-001', 'Pesquisador Teste Araguaína', 'Araguaína'),
  ('GURUPI-001', 'Pesquisador Teste Gurupi', 'Gurupi')
) as x(token, nome, municipio);

-- Cotas de exemplo, só para o dashboard/admin terem o que exibir em teste.
-- TODO_CONFIGURAR: cotas reais devem vir do plano amostral da Foccus.
insert into public.cotas (rodada_id, municipio, sexo, faixa_etaria, alvo)
select r.id, x.municipio, x.sexo, x.faixa_etaria, x.alvo
from public.rodadas r,
(values
  ('Palmas', 'feminino', '25-34', 30),
  ('Palmas', 'masculino', '25-34', 30),
  ('Araguaína', 'feminino', '35-44', 20),
  ('Araguaína', 'masculino', '35-44', 20),
  ('Gurupi', 'feminino', '45-54', 15),
  ('Gurupi', 'masculino', '45-54', 15)
) as x(municipio, sexo, faixa_etaria, alvo)
where r.codigo = 'RODADA_01';
