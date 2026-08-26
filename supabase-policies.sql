-- ============================================================================
-- supabase-policies.sql
-- RLS + funções de acesso — Pesquisa Eleitoral Araguaína 2026
--
-- Mesma filosofia do projeto anterior: o app de coleta roda com a anon key
-- (estático, publicado no GitHub Pages — não há como escondê-la, e não é
-- para isso que ela serve). Nenhuma tabela dá grant direto de
-- INSERT/UPDATE/SELECT ao role `anon`: toda escrita do app de campo passa
-- por duas funções SECURITY DEFINER (rpc_sync_entrevista, rpc_sync_respostas).
-- Sem autenticação de pesquisador (token removido), essas funções não
-- validam mais um `equipe_id` — validam apenas que os dados obrigatórios
-- (session_id, pesquisador) estão presentes.
--
-- Admin usa Supabase Auth real (e-mail/senha, criadas pela Foccus no
-- Studio) — RLS libera SELECT nas tabelas base (entrevistas, respostas,
-- pesquisas) e em vw_coleta_resumo apenas para o role `authenticated`.
-- Dashboard/Relatório são páginas públicas (o link que vai para o cliente,
-- sem login): leem só a view vw_respostas_dashboard, liberada também para
-- `anon` — ver supabase-views.sql.
-- ============================================================================

alter table public.pesquisas enable row level security;
alter table public.entrevistas enable row level security;
alter table public.respostas enable row level security;

revoke all on public.pesquisas from anon;
revoke all on public.entrevistas from anon;
revoke all on public.respostas from anon;

-- ---------------------------------------------------------------------------
-- Políticas para o role `authenticated` (dashboard / relatório / admin)
-- ---------------------------------------------------------------------------
create policy "pesquisas_select_authenticated" on public.pesquisas
  for select to authenticated using (true);

create policy "entrevistas_select_authenticated" on public.entrevistas
  for select to authenticated using (true);

create policy "respostas_select_authenticated" on public.respostas
  for select to authenticated using (true);

grant select on public.pesquisas, public.entrevistas, public.respostas to authenticated;

-- ---------------------------------------------------------------------------
-- rpc_sync_entrevista — upsert idempotente por session_id.
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
begin
  if p_payload ->> 'session_id' is null then
    raise exception 'session_id é obrigatório';
  end if;

  if coalesce(trim(p_payload ->> 'pesquisador'), '') = '' then
    raise exception 'pesquisador é obrigatório';
  end if;

  -- O app de campo não conhece o uuid da pesquisa (não há mais login que o
  -- entregue) — resolve pelo município quando pesquisa_id não vier no
  -- payload.
  v_pesquisa_id := (p_payload ->> 'pesquisa_id')::uuid;
  if v_pesquisa_id is null then
    select id into v_pesquisa_id
    from public.pesquisas
    where municipio = p_payload ->> 'municipio' and ativa = true
    order by created_at desc
    limit 1;
  end if;

  insert into public.entrevistas (
    session_id, pesquisa_id, pesquisador, status, municipio, coletado_em, duracao_seg
  )
  values (
    p_payload ->> 'session_id',
    v_pesquisa_id,
    p_payload ->> 'pesquisador',
    coalesce(p_payload ->> 'status', 'em_andamento'),
    p_payload ->> 'municipio',
    coalesce((p_payload ->> 'coletado_em')::timestamptz, now()),
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
-- rpc_sync_respostas — upsert em lote no EAV, só aceito se a entrevista
-- existir de fato.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_sync_respostas(p_entrevista_id uuid, p_respostas jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if not exists (select 1 from public.entrevistas where id = p_entrevista_id) then
    raise exception 'entrevista inválida para gravação de respostas';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_respostas, '[]'::jsonb))
  loop
    insert into public.respostas (entrevista_id, questao, valor, valor_num, ordem_exibicao)
    values (
      p_entrevista_id,
      v_item ->> 'questao',
      v_item ->> 'valor',
      (v_item ->> 'valor_num')::integer,
      (v_item ->> 'ordem_exibicao')::integer
    )
    on conflict (entrevista_id, questao) do update set
      valor = excluded.valor,
      valor_num = excluded.valor_num,
      ordem_exibicao = excluded.ordem_exibicao,
      respondido_em = now();
  end loop;
end;
$$;

revoke all on function public.rpc_sync_respostas(uuid, jsonb) from public;
grant execute on function public.rpc_sync_respostas(uuid, jsonb) to anon, authenticated;
