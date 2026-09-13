-- ============================================================================
-- supabase-migration-magalhaes-almeida.sql
-- Adiciona a Pesquisa Eleitoral Magalhães de Almeida (MA) 2026 a um banco já
-- em produção, SEM apagar nenhuma tabela ou dado existente — ao contrário de
-- supabase-schema.sql, que faz reset completo.
--
-- O modelo é EAV (pesquisas -> entrevistas -> respostas), então Magalhães de
-- Almeida não exige nenhuma alteração estrutural: basta uma nova linha em
-- `pesquisas`. rpc_sync_entrevista já resolve pesquisa_id pelo município no
-- momento do envio (ver supabase-policies.sql), então nenhuma outra
-- função/view precisa mudar.
--
-- Seguro rodar mais de uma vez: só insere se ainda não existir uma pesquisa
-- para o município "Magalhães de Almeida".
-- ============================================================================

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Eleitoral Magalhães de Almeida (MA) 2026', 'Magalhães de Almeida', true
where not exists (
  select 1 from public.pesquisas where municipio = 'Magalhães de Almeida'
);
