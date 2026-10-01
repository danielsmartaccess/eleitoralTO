-- ============================================================================
-- supabase-migration-joao-lisboa.sql
-- Adiciona a Pesquisa Eleitoral João Lisboa (MA) 2026 a um banco já em
-- produção, SEM apagar nenhuma tabela ou dado existente.
--
-- O modelo é EAV (pesquisas -> entrevistas -> respostas), então João Lisboa
-- não exige nenhuma alteração estrutural: basta uma nova linha em
-- `pesquisas`. rpc_sync_entrevista já resolve pesquisa_id pelo município no
-- momento do envio (ver supabase-policies.sql), então nenhuma outra
-- função/view precisa mudar. O texto abaixo precisa bater exatamente com
-- `pesquisa.municipio` em config/pesquisa.js ("João Lisboa").
--
-- Seguro rodar mais de uma vez: só insere se ainda não existir uma pesquisa
-- para o município "João Lisboa".
-- ============================================================================

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Eleitoral João Lisboa (MA) 2026', 'João Lisboa', true
where not exists (
  select 1 from public.pesquisas where municipio = 'João Lisboa'
);
