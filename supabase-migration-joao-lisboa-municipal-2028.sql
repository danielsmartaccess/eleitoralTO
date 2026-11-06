-- ============================================================================
-- supabase-migration-joao-lisboa-municipal-2028.sql
-- 1) Abre a coleta "João Lisboa - Municipal 2028" (MA): pesquisa municipal /
--    cenário 2028, instrumento próprio, SEPARADA da "João Lisboa" (intenção de
--    voto 2026, encerrada, 177 entrevistas). `municipio` é a chave única, por
--    isso o nome é distinto de 'João Lisboa'.
-- 2) Encerra as coletas do 2º turno ainda abertas no Tocantins: Carrasco Bonito
--    e Darcinópolis (encerrada_em = now(): rpc_sync_entrevista passa a recusar
--    entrevista nova, mas aceita backlog offline anterior à marca).
--
-- Idempotente: o insert só ocorre se a pesquisa ainda não existir; o update só
-- toca pesquisas ainda abertas.
-- ============================================================================

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Municipal João Lisboa (MA) — Cenário 2028', 'João Lisboa - Municipal 2028', true
where not exists (
  select 1 from public.pesquisas where municipio = 'João Lisboa - Municipal 2028'
);

update public.pesquisas
   set ativa = false, encerrada_em = now()
 where municipio in ('Carrasco Bonito', 'Darcinópolis')
   and encerrada_em is null;
