-- ============================================================================
-- supabase-views.sql
-- Views de leitura para dashboard/relatório/admin.
-- ============================================================================

-- Join respostas + entrevistas já filtrado para status completo — base
-- padrão para os gráficos de intenção de voto e para o relatório.
create or replace view public.vw_respostas_dashboard as
select
  r.id as resposta_id,
  r.questao,
  r.valor,
  r.valor_num,
  r.ordem_exibicao,
  e.id as entrevista_id,
  e.pesquisa_id,
  e.municipio,
  e.status,
  e.coletado_em,
  e.pesquisador
from public.respostas r
join public.entrevistas e on e.id = r.entrevista_id
where e.status = 'completo';

-- Contagens operacionais (gestão de campo, não "resultado da pesquisa") —
-- usada só pelo admin.html.
create or replace view public.vw_coleta_resumo as
select
  pesquisador,
  count(*) filter (where status = 'completo') as realizadas,
  count(*) filter (where status = 'completo' and coletado_em::date = current_date) as hoje,
  max(coletado_em) filter (where status = 'completo') as ultima_coleta
from public.entrevistas
group by pesquisador;

alter view public.vw_respostas_dashboard set (security_invoker = true);
alter view public.vw_coleta_resumo set (security_invoker = true);

grant select on public.vw_respostas_dashboard to authenticated;
grant select on public.vw_coleta_resumo to authenticated;
