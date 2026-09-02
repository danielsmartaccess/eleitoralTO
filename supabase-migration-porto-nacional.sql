-- ============================================================================
-- supabase-migration-porto-nacional.sql
-- Adiciona a Pesquisa Eleitoral Porto Nacional 2026 a um banco já em produção
-- (Araguaína, Palmas e Gurupi já coletando em campo) SEM apagar nenhuma
-- tabela ou dado existente — ao contrário de supabase-schema.sql, que faz
-- reset completo.
--
-- O modelo é EAV (pesquisas -> entrevistas -> respostas), então Porto Nacional
-- não exige nenhuma alteração estrutural: basta uma nova linha em `pesquisas`.
-- rpc_sync_entrevista já resolve pesquisa_id pelo município no momento do
-- envio (ver supabase-policies.sql), então nenhuma outra função/view precisa
-- mudar.
--
-- Seguro rodar mais de uma vez: só insere se ainda não existir uma pesquisa
-- ativa para o município "Porto Nacional".
-- ============================================================================

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Eleitoral Porto Nacional 2026', 'Porto Nacional', true
where not exists (
  select 1 from public.pesquisas where municipio = 'Porto Nacional'
);
