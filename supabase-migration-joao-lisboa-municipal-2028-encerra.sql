-- ============================================================================
-- supabase-migration-joao-lisboa-municipal-2028-encerra.sql
-- Encerra a coleta "João Lisboa - Municipal 2028" (201 entrevistas completas).
-- Já aplicada no banco em 09/11/2026 (21:34 UTC); versionada aqui para
-- reprodutibilidade. rpc_sync_entrevista passa a recusar entrevista nova, mas
-- aceita backlog offline com coletado_em anterior à marca.
-- Idempotente: só toca pesquisa ainda aberta.
-- ============================================================================
update public.pesquisas
   set ativa = false, encerrada_em = now()
 where municipio = 'João Lisboa - Municipal 2028'
   and encerrada_em is null;
