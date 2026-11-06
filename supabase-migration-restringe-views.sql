-- ============================================================================
-- supabase-migration-restringe-views.sql
-- Restringe a leitura das views a usuários autenticados (aplicada em 04/11/2026
-- como migration "restringe_views_a_authenticated").
--
-- Antes: vw_respostas_dashboard tinha SELECT para `anon` (liberada em
-- 26/08/2026 pela migration liberar_leitura_publica_vw_respostas_dashboard).
-- Como a anon key é pública, qualquer pessoa podia ler todas as respostas pela
-- API. Agora só `authenticated` lê as views; `anon` não tem mais nenhum grant
-- nelas. A coleta em campo NÃO muda: continua usando rpc_sync_entrevista e
-- rpc_sync_respostas (SECURITY DEFINER, executáveis por `anon`).
--
-- Efeito: a página pública desempenho.html (js/desempenho.js lê a view como
-- `anon`) deixa de receber dados. Para reabri-la, crie uma view agregada
-- separada (só percentuais) e libere apenas essa para `anon`.
--
-- Seguro de rodar mais de uma vez.
-- ============================================================================

revoke all on public.vw_respostas_dashboard from anon;
revoke all on public.vw_coleta_resumo from anon;
revoke all on public.vw_resumo_municipio from anon;

revoke insert, update, delete, truncate, references, trigger on public.vw_respostas_dashboard from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.vw_coleta_resumo from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.vw_resumo_municipio from authenticated;

grant select on public.vw_respostas_dashboard to authenticated;
grant select on public.vw_coleta_resumo to authenticated;
grant select on public.vw_resumo_municipio to authenticated;
