-- ============================================================================
-- supabase-migration-darcinopolis.sql
-- Adiciona a Pesquisa Eleitoral Darcinópolis (TO) 2026 — 2º turno a um
-- banco já em produção, SEM apagar nenhuma tabela ou dado existente.
--
-- O modelo é EAV (pesquisas -> entrevistas -> respostas), então Darcinópolis
-- não exige nenhuma alteração estrutural: basta uma nova linha em
-- `pesquisas`. O instrumento tem 6 perguntas (Carrasco Bonito e Aguiarnópolis
-- têm 7) e isso também não muda nada no banco — cada resposta é uma linha
-- (entrevista_id, questao), sem número fixo de perguntas.
-- rpc_sync_entrevista já resolve pesquisa_id pelo município no momento do
-- envio (ver supabase-policies.sql). O texto abaixo precisa bater exatamente
-- com `pesquisa.municipio` em config/pesquisa.js ("Darcinópolis").
--
-- Seguro rodar mais de uma vez: só insere se ainda não existir uma pesquisa
-- para o município "Darcinópolis".
-- ============================================================================

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Eleitoral Darcinópolis (TO) 2026 — 2º turno', 'Darcinópolis', true
where not exists (
  select 1 from public.pesquisas where municipio = 'Darcinópolis'
);
