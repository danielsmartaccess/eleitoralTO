-- ============================================================================
-- supabase-migration-encerramento-coleta.sql
-- Faz o banco reconhecer o encerramento da coleta, que até aqui só existia em
-- config/pesquisa.js (ativoParaColeta). Três problemas são corrigidos:
--
-- 1. `pesquisas.ativa` estava true nos 13 municípios, inclusive nos 11 já
--    concluídos. O banco não sabia quais coletas haviam terminado, então
--    qualquer cliente novo (ou uma policy de RLS baseada em `ativa`) aceitaria
--    gravação em município encerrado.
--
-- 2. rpc_sync_entrevista resolvia pesquisa_id com `select into` e, quando não
--    encontrava pesquisa ativa para o município, seguia em frente e inseria a
--    entrevista com pesquisa_id NULL. Não era rejeição: era órfã silenciosa.
--    As views do dashboard não fazem join com `pesquisas` (agregam por
--    `entrevistas.municipio`), então a entrevista continuava sendo contada,
--    só que desligada da pesquisa. Erro invisível, que é o pior tipo.
--
-- 3. entrevistas.pesquisa_id era nullable com `on delete set null`: apagar uma
--    pesquisa desligava silenciosamente todas as entrevistas dela em vez de
--    barrar a operação.
--
-- Por que o encerramento é datado (`encerrada_em`) e não um booleano puro:
-- a coleta é offline-first (ver js/sync.js e js/db.js). Um aparelho em campo
-- pode sincronizar horas ou dias depois de a coleta ser encerrada. Bloquear
-- só por `ativa` descartaria esse backlog legítimo — entrevista real, feita
-- dentro do prazo, perdida por causa do relógio de sincronização. A regra
-- passa a ser por data do fato, não por data do envio:
--
--   coletado_em <  encerrada_em  -> entra normalmente (backlog legítimo)
--   coletado_em >= encerrada_em  -> rejeitada com erro explícito
--
-- Seguro rodar mais de uma vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Marca de encerramento por pesquisa. NULL = coleta aberta.
-- ---------------------------------------------------------------------------
alter table public.pesquisas
  add column if not exists encerrada_em timestamptz;

comment on column public.pesquisas.encerrada_em is
  'Momento em que a coleta foi encerrada. NULL = aberta. Entrevistas com '
  'coletado_em anterior a esta marca ainda são aceitas (backlog offline); '
  'posteriores são rejeitadas por rpc_sync_entrevista.';

comment on column public.pesquisas.ativa is
  'Coleta aberta para novas entrevistas. Espelha config/pesquisa.js '
  '(ativoParaColeta). Não filtra relatórios: as views do dashboard agregam '
  'todo o histórico, encerrado ou não.';

-- ---------------------------------------------------------------------------
-- 2. Encerra os 11 municípios já concluídos, listados um a um de propósito:
--    um `not in (abertos)` fecharia por engano qualquer município novo caso
--    esta migration fosse reaplicada depois. `encerrada_em is null` no where
--    garante que reaplicar não empurre a data de encerramento para frente.
--
--    encerrada_em = now() no momento da migration: tudo o que já foi coletado
--    está no passado e continua sincronizável; só entrevista nova é barrada.
-- ---------------------------------------------------------------------------
update public.pesquisas
set ativa = false,
    encerrada_em = now()
where encerrada_em is null
  and municipio in (
    'Água Doce do Maranhão',
    'Araguaína',
    'Araioses',
    'Gurupi',
    'Magalhães de Almeida',
    'Palmas',
    'Paraíso do Tocantins',
    'Porto Nacional',
    'Santa Quitéria do Maranhão',
    'São Bernardo',
    'Tutóia'
  );

-- ---------------------------------------------------------------------------
-- 3. rpc_sync_entrevista: falha alto em vez de gravar órfã, e respeita o
--    encerramento datado. O restante do corpo é idêntico ao original em
--    supabase-policies.sql (upsert idempotente por session_id).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_sync_entrevista(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_pesquisa_id uuid;
  v_municipio text;
  v_coletado_em timestamptz;
  v_encerrada_em timestamptz;
begin
  if p_payload ->> 'session_id' is null then
    raise exception 'session_id é obrigatório';
  end if;

  if coalesce(trim(p_payload ->> 'pesquisador'), '') = '' then
    raise exception 'pesquisador é obrigatório';
  end if;

  v_municipio := p_payload ->> 'municipio';
  v_coletado_em := coalesce((p_payload ->> 'coletado_em')::timestamptz, now());
  v_pesquisa_id := (p_payload ->> 'pesquisa_id')::uuid;

  if v_pesquisa_id is null then
    -- O app de campo não conhece o uuid da pesquisa (não há mais login que o
    -- entregue) — resolve pelo município. Deliberadamente SEM filtrar por
    -- `ativa`: o aparelho pode estar enviando entrevista legítima de coleta já
    -- encerrada. Quem decide se ela entra é o filtro por data, logo abaixo.
    select id, encerrada_em
      into v_pesquisa_id, v_encerrada_em
    from public.pesquisas
    where municipio = v_municipio
    order by ativa desc, created_at desc
    limit 1;
  else
    select encerrada_em
      into v_encerrada_em
    from public.pesquisas
    where id = v_pesquisa_id;

    if not found then
      raise exception 'pesquisa_id % não existe', v_pesquisa_id;
    end if;
  end if;

  -- Antes disto aqui não existia: pesquisa_id ficava NULL e a entrevista era
  -- gravada órfã, sem ninguém perceber.
  if v_pesquisa_id is null then
    raise exception 'nenhuma pesquisa cadastrada para o municipio %',
      coalesce(v_municipio, '(nulo)');
  end if;

  if v_encerrada_em is not null and v_coletado_em >= v_encerrada_em then
    raise exception
      'coleta de % encerrada em %; entrevista coletada em % foi recusada',
      v_municipio, v_encerrada_em, v_coletado_em;
  end if;

  insert into public.entrevistas (
    session_id, pesquisa_id, pesquisador, status, municipio, coletado_em, duracao_seg
  )
  values (
    p_payload ->> 'session_id',
    v_pesquisa_id,
    p_payload ->> 'pesquisador',
    coalesce(p_payload ->> 'status', 'em_andamento'),
    v_municipio,
    v_coletado_em,
    (p_payload ->> 'duracao_seg')::integer
  )
  on conflict (session_id) do update set
    pesquisa_id = excluded.pesquisa_id,
    pesquisador = excluded.pesquisador,
    status = excluded.status,
    municipio = excluded.municipio,
    coletado_em = excluded.coletado_em,
    duracao_seg = excluded.duracao_seg,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.rpc_sync_entrevista(jsonb) from public;
grant execute on function public.rpc_sync_entrevista(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Garantia estrutural: entrevista órfã passa a ser impossível mesmo fora da
--    RPC, e apagar pesquisa com entrevistas passa a ser barrado em vez de
--    desligar as linhas em silêncio.
-- ---------------------------------------------------------------------------
do $$
declare
  v_orfas bigint;
begin
  select count(*) into v_orfas
  from public.entrevistas
  where pesquisa_id is null;

  if v_orfas > 0 then
    raise exception
      'existem % entrevistas com pesquisa_id nulo; recupere o vínculo pelo '
      'municipio antes de aplicar NOT NULL', v_orfas;
  end if;
end $$;

alter table public.entrevistas
  drop constraint if exists entrevistas_pesquisa_id_fkey;

alter table public.entrevistas
  add constraint entrevistas_pesquisa_id_fkey
  foreign key (pesquisa_id) references public.pesquisas(id) on delete restrict;

alter table public.entrevistas
  alter column pesquisa_id set not null;
