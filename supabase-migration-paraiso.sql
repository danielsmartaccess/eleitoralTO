-- ============================================================================
-- supabase-migration-paraiso.sql
-- Adiciona a Pesquisa Eleitoral Paraíso do Tocantins 2026 a um banco já em
-- produção (Araguaína, Palmas, Gurupi e Porto Nacional já coletando em campo)
-- SEM apagar nenhuma tabela ou dado existente — ao contrário de
-- supabase-schema.sql, que faz reset completo.
--
-- O modelo é EAV (pesquisas -> entrevistas -> respostas), então Paraíso do
-- Tocantins não exige nenhuma alteração estrutural: basta uma nova linha em
-- `pesquisas`. rpc_sync_entrevista já resolve pesquisa_id pelo município no
-- momento do envio (ver supabase-policies.sql), então nenhuma outra
-- função/view precisa mudar.
--
-- Seguro rodar mais de uma vez: só insere se ainda não existir uma pesquisa
-- para o município "Paraíso do Tocantins".
-- ============================================================================

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Eleitoral Paraíso do Tocantins 2026', 'Paraíso do Tocantins', true
where not exists (
  select 1 from public.pesquisas where municipio = 'Paraíso do Tocantins'
);
