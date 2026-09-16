-- ============================================================================
-- supabase-migration-agua-doce-do-maranhao.sql
-- Adiciona a Pesquisa Eleitoral Água Doce do Maranhão (MA) 2026 a um banco já
-- em produção, SEM apagar nenhuma tabela ou dado existente — ao contrário de
-- supabase-schema.sql, que faz reset completo.
--
-- O modelo é EAV (pesquisas -> entrevistas -> respostas), então Água Doce do
-- Maranhão não exige nenhuma alteração estrutural: basta uma nova linha em
-- `pesquisas`. rpc_sync_entrevista já resolve pesquisa_id pelo município no
-- momento do envio (ver supabase-policies.sql), então nenhuma outra
-- função/view precisa mudar.
--
-- Seguro rodar mais de uma vez: só insere se ainda não existir uma pesquisa
-- para o município "Água Doce do Maranhão".
-- ============================================================================

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Eleitoral Água Doce do Maranhão (MA) 2026', 'Água Doce do Maranhão', true
where not exists (
  select 1 from public.pesquisas where municipio = 'Água Doce do Maranhão'
);
