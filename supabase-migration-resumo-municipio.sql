-- ============================================================================
-- supabase-migration-resumo-municipio.sql
-- Adiciona a visão por município ao admin (Araguaína/Palmas) num banco que
-- já está em produção, sem apagar nada. Seguro rodar mais de uma vez —
-- é só `create or replace view` + grants.
--
-- Espelha exatamente o que supabase-views.sql já define para
-- vw_coleta_resumo e vw_resumo_municipio; rode isto no SQL Editor do
-- Supabase Studio para aplicar a mudança ao banco existente.
-- ============================================================================

create or replace view public.vw_coleta_resumo as
select
  pesquisador,
  count(*) filter (where status = 'completo') as realizadas,
  count(*) filter (where status = 'completo' and coletado_em::date = current_date) as hoje,
  max(coletado_em) filter (where status = 'completo') as ultima_coleta,
  municipio
from public.entrevistas
group by pesquisador, municipio;

create or replace view public.vw_resumo_municipio as
select
  coalesce(municipio, '(sem município)') as municipio,
  count(*) filter (where status = 'completo') as completas,
  count(*) filter (where status = 'em_andamento') as em_andamento,
  count(*) filter (where status = 'completo' and coletado_em::date = current_date) as hoje,
  count(*) as total
from public.entrevistas
group by municipio;

alter view public.vw_coleta_resumo set (security_invoker = true);
alter view public.vw_resumo_municipio set (security_invoker = true);

grant select on public.vw_coleta_resumo to authenticated;
grant select on public.vw_resumo_municipio to authenticated;
