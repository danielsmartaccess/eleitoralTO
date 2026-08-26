-- ============================================================================
-- supabase-views.sql
-- Views de leitura para dashboard/relatório/admin.
--
-- dashboard.html e relatorio.html agora são páginas PÚBLICAS (sem login —
-- é o link que vai para o cliente ver o resultado). Só admin.html continua
-- atrás do Supabase Auth. Por isso vw_respostas_dashboard é liberada para o
-- role `anon`: ela só expõe respostas de entrevistas completas (sem nome,
-- telefone ou qualquer dado do entrevistado — o questionário nunca coleta
-- isso), então não há problema em deixá-la pública. vw_coleta_resumo é dado
-- operacional de gestão de campo (produtividade por pesquisador) e continua
-- restrita a `authenticated`, junto com as tabelas base (entrevistas,
-- respostas, pesquisas — ver supabase-policies.sql).
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

-- security_invoker = false (padrão): a view roda com o privilégio de quem a
-- criou, não de quem consulta — é isso que permite liberar SELECT ao `anon`
-- na view sem precisar dar ao `anon` nenhum grant nas tabelas base
-- (entrevistas/respostas seguem revogadas de `anon` em supabase-policies.sql).
alter view public.vw_respostas_dashboard set (security_invoker = false);
alter view public.vw_coleta_resumo set (security_invoker = true);

grant select on public.vw_respostas_dashboard to anon, authenticated;
grant select on public.vw_coleta_resumo to authenticated;
