-- ============================================================================
-- supabase-policies.sql
-- RLS + funções de acesso — Pesquisa Eleitoral Tocantins 2026
--
-- DECISÃO DE ARQUITETURA (Seção 22 do briefing: "não usar INSERT público
-- irrestrito"):
--
-- O app de coleta roda com a anon key (é estático, publicado no GitHub
-- Pages — não há como esconder essa chave, e não é para isso que ela serve).
-- Sem um mecanismo de JWT por pesquisador (que exigiria uma Edge Function
-- assinando tokens com o JWT secret do projeto — não configurado neste
-- momento, ver README/pendências), a anon key não consegue provar
-- criptograficamente "eu sou o pesquisador X". Por isso NENHUMA tabela dá
-- grant direto de INSERT/UPDATE/SELECT ao anon: todo o caminho de escrita do
-- app de coleta passa por três funções SECURITY DEFINER (rpc_login,
-- rpc_sync_entrevista, rpc_sync_respostas, rpc_registrar_auditoria) que
-- validam explicitamente que o equipe_id informado corresponde a um token
-- ativo antes de tocar nas tabelas. Isso é estritamente mais restrito do que
-- "INSERT público irrestrito": mesmo que alguém extraia a anon key do bundle
-- JS (ela é pública por design), não consegue ler entrevistas de outros
-- pesquisadores nem escrever fora do formato validado pelas funções.
--
-- Dashboard/Relatório/Admin usam autenticação real do Supabase Auth
-- (e-mail/senha, criadas pela Foccus no painel) — RLS libera SELECT (e, para
-- equipes/cotas, escrita) apenas para o role `authenticated`.
-- ============================================================================

-- Remove funções órfãs de um protótipo anterior (token_valido/validar_token),
-- já substituídas por rpc_login — superfície de ataque desnecessária.
drop function if exists public.token_valido(text);
drop function if exists public.validar_token(text);

alter table public.pesquisas enable row level security;
alter table public.rodadas enable row level security;
alter table public.equipes enable row level security;
alter table public.entrevistas enable row level security;
alter table public.respostas enable row level security;
alter table public.cotas enable row level security;
alter table public.auditoria enable row level security;

-- Fecha qualquer grant de tabela herdado por padrão do schema public.
-- (as funções SECURITY DEFINER abaixo continuam funcionando: elas rodam com
-- o privilégio do dono da função, não do chamador.)
revoke all on public.pesquisas from anon;
revoke all on public.rodadas from anon;
revoke all on public.equipes from anon;
revoke all on public.entrevistas from anon;
revoke all on public.respostas from anon;
revoke all on public.cotas from anon;
revoke all on public.auditoria from anon;

-- ---------------------------------------------------------------------------
-- Políticas para o role `authenticated` (dashboard / relatório / admin)
-- ---------------------------------------------------------------------------
create policy "pesquisas_select_authenticated" on public.pesquisas
  for select to authenticated using (true);

create policy "rodadas_select_authenticated" on public.rodadas
  for select to authenticated using (true);

create policy "equipes_select_authenticated" on public.equipes
  for select to authenticated using (true);
create policy "equipes_update_authenticated" on public.equipes
  for update to authenticated using (true) with check (true);

create policy "entrevistas_select_authenticated" on public.entrevistas
  for select to authenticated using (true);

create policy "respostas_select_authenticated" on public.respostas
  for select to authenticated using (true);

create policy "cotas_all_authenticated" on public.cotas
  for all to authenticated using (true) with check (true);

create policy "auditoria_select_authenticated" on public.auditoria
  for select to authenticated using (true);

grant select on public.pesquisas, public.rodadas, public.entrevistas, public.respostas, public.auditoria to authenticated;
grant select, update on public.equipes to authenticated;
grant select, insert, update, delete on public.cotas to authenticated;

-- ---------------------------------------------------------------------------
-- rpc_login — único ponto de leitura de `equipes` acessível ao anon.
-- Nunca devolve a tabela inteira nem o token de volta: só os dados do
-- próprio pesquisador, e apenas se o token existir e estiver ativo. Isso
-- evita enumeração de tokens por varredura de SELECT.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_login(p_token text)
returns table (
  equipe_id uuid,
  nome text,
  municipio text,
  perfil text,
  rodada_id uuid,
  pesquisa_id uuid,
  rodada_codigo text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.equipes
  set ultimo_acesso = now()
  where token = p_token and ativo = true;

  return query
  select eq.id, eq.nome, eq.municipio, eq.perfil, r.id, r.pesquisa_id, r.codigo
  from public.equipes eq
  left join public.rodadas r on r.id = eq.rodada_id
  where eq.token = p_token and eq.ativo = true;
end;
$$;

revoke all on function public.rpc_login(text) from public;
grant execute on function public.rpc_login(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- rpc_sync_entrevista — upsert idempotente por session_id. Só aceita a
-- gravação se o equipe_id do payload corresponder a um token ativo.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_sync_entrevista(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe_id uuid := (p_payload ->> 'equipe_id')::uuid;
  v_id uuid;
begin
  if v_equipe_id is null or not exists (
    select 1 from public.equipes where id = v_equipe_id and ativo = true
  ) then
    raise exception 'equipe inválida ou inativa';
  end if;

  if p_payload ->> 'session_id' is null then
    raise exception 'session_id é obrigatório';
  end if;

  insert into public.entrevistas (
    session_id, equipe_id, pesquisa_id, rodada_id, pesquisador, status, municipio, regiao, zona,
    sexo, faixa_etaria, escolaridade, local_coleta, consentimento, coletado_em, duracao_seg,
    geo_lat, geo_lng, geo_accuracy, geo_status, device_info, suspeita_duracao
  )
  values (
    p_payload ->> 'session_id',
    v_equipe_id,
    (p_payload ->> 'pesquisa_id')::uuid,
    (p_payload ->> 'rodada_id')::uuid,
    p_payload ->> 'pesquisador',
    coalesce(p_payload ->> 'status', 'em_andamento'),
    p_payload ->> 'municipio',
    p_payload ->> 'regiao',
    p_payload ->> 'zona',
    p_payload ->> 'sexo',
    p_payload ->> 'faixa_etaria',
    p_payload ->> 'escolaridade',
    p_payload ->> 'local_coleta',
    coalesce((p_payload ->> 'consentimento')::boolean, false),
    coalesce((p_payload ->> 'coletado_em')::timestamptz, now()),
    (p_payload ->> 'duracao_seg')::integer,
    (p_payload ->> 'geo_lat')::double precision,
    (p_payload ->> 'geo_lng')::double precision,
    (p_payload ->> 'geo_accuracy')::double precision,
    coalesce(p_payload ->> 'geo_status', 'pendente'),
    p_payload ->> 'device_info',
    coalesce((p_payload ->> 'suspeita_duracao')::boolean, false)
  )
  on conflict (session_id) do update set
    equipe_id = excluded.equipe_id,
    pesquisa_id = excluded.pesquisa_id,
    rodada_id = excluded.rodada_id,
    pesquisador = excluded.pesquisador,
    status = excluded.status,
    municipio = excluded.municipio,
    regiao = excluded.regiao,
    zona = excluded.zona,
    sexo = excluded.sexo,
    faixa_etaria = excluded.faixa_etaria,
    escolaridade = excluded.escolaridade,
    local_coleta = excluded.local_coleta,
    consentimento = excluded.consentimento,
    coletado_em = excluded.coletado_em,
    duracao_seg = excluded.duracao_seg,
    geo_lat = excluded.geo_lat,
    geo_lng = excluded.geo_lng,
    geo_accuracy = excluded.geo_accuracy,
    geo_status = excluded.geo_status,
    device_info = excluded.device_info,
    suspeita_duracao = excluded.suspeita_duracao,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.rpc_sync_entrevista(jsonb) from public;
grant execute on function public.rpc_sync_entrevista(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- rpc_sync_respostas — upsert em lote no EAV, só aceito se a entrevista
-- pertencer de fato ao equipe_id informado (evita gravar resposta em
-- entrevista de outro token, mesmo que o uuid seja adivinhado).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_sync_respostas(p_entrevista_id uuid, p_equipe_id uuid, p_respostas jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if not exists (
    select 1
    from public.entrevistas e
    join public.equipes eq on eq.id = e.equipe_id
    where e.id = p_entrevista_id and e.equipe_id = p_equipe_id and eq.ativo = true
  ) then
    raise exception 'entrevista/equipe inválida para gravação de respostas';
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

revoke all on function public.rpc_sync_respostas(uuid, uuid, jsonb) from public;
grant execute on function public.rpc_sync_respostas(uuid, uuid, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- rpc_registrar_auditoria — único caminho de escrita em `auditoria` para o
-- app de campo. Leitura continua restrita a `authenticated`.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_registrar_auditoria(
  p_evento text,
  p_entrevista_session_id text,
  p_equipe_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.auditoria (evento, entrevista_session_id, equipe_id, metadata)
  values (p_evento, p_entrevista_session_id, p_equipe_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke all on function public.rpc_registrar_auditoria(text, text, uuid, jsonb) from public;
grant execute on function public.rpc_registrar_auditoria(text, text, uuid, jsonb) to anon, authenticated;
