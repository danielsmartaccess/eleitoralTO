-- ============================================================================
-- supabase-migration-carrasco-bonito.sql
-- Adiciona a Pesquisa Eleitoral Carrasco Bonito (TO) 2026 — 2º turno a um
-- banco já em produção, SEM apagar nenhuma tabela ou dado existente.
--
-- O modelo é EAV (pesquisas -> entrevistas -> respostas), então Carrasco
-- Bonito não exige nenhuma alteração estrutural: basta uma nova linha em
-- `pesquisas`. rpc_sync_entrevista já resolve pesquisa_id pelo município no
-- momento do envio (ver supabase-policies.sql), então nenhuma outra
-- função/view precisa mudar. O texto abaixo precisa bater exatamente com
-- `pesquisa.municipio` em config/pesquisa.js ("Carrasco Bonito").
--
-- Seguro rodar mais de uma vez: só insere se ainda não existir uma pesquisa
-- para o município "Carrasco Bonito".
-- ============================================================================

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Eleitoral Carrasco Bonito (TO) 2026 — 2º turno', 'Carrasco Bonito', true
where not exists (
  select 1 from public.pesquisas where municipio = 'Carrasco Bonito'
);
