-- ============================================================================
-- supabase-views.sql
-- Views de leitura para dashboard/relatório/admin/cotas.
--
-- Todas as views são criadas pelo role de migração (postgres), que tem
-- BYPASSRLS — por isso `vw_cotas_progresso` consegue agregar contagens de
-- `entrevistas` (tabela fechada para anon) e ainda assim ser exposta ao
-- pesquisador em campo: ele só enxerga números agregados (alvo/realizado),
-- nunca uma linha de entrevista individual.
--
-- Seção 46 (cuidado com PostgREST): estas views existem justamente para o
-- dashboard/relatório filtrarem por rodada/município/sexo/etc. usando
-- filtros relacionais normais do PostgREST, em vez de montar URLs com listas
-- gigantes de UUIDs (o bug de HTTP 414 documentado no projeto Canaã).
-- ============================================================================

create or replace view public.vw_coleta_resumo as
select
  r.id as rodada_id,
  r.codigo as rodada_codigo,
  r.pesquisa_id,
  count(*) filter (where e.status = 'completo') as realizadas,
  count(*) filter (where e.status = 'em_andamento') as em_andamento,
  count(*) filter (where e.status = 'completo' and e.coletado_em::date = current_date) as hoje,
  count(distinct e.equipe_id) filter (where e.status = 'completo') as pesquisadores_com_coleta
from public.rodadas r
left join public.entrevistas e on e.rodada_id = r.id
group by r.id, r.codigo, r.pesquisa_id;

create or replace view public.vw_cotas_progresso as
select
  c.id as cota_id,
  c.rodada_id,
  c.municipio,
  c.regiao,
  c.sexo,
  c.faixa_etaria,
  c.escolaridade,
  c.alvo,
  count(e.id) filter (where e.status = 'completo') as realizado
from public.cotas c
left join public.entrevistas e
  on e.rodada_id = c.rodada_id
  and e.municipio = c.municipio
  and (c.regiao is null or e.regiao = c.regiao)
  and (c.sexo is null or e.sexo = c.sexo)
  and (c.faixa_etaria is null or e.faixa_etaria = c.faixa_etaria)
  and (c.escolaridade is null or e.escolaridade = c.escolaridade)
group by c.id, c.rodada_id, c.municipio, c.regiao, c.sexo, c.faixa_etaria, c.escolaridade, c.alvo;

-- Join respostas + entrevistas já filtrado para status completo — base
-- padrão para os gráficos de intenção de voto e para os cruzamentos do
-- relatório.
create or replace view public.vw_respostas_dashboard as
select
  r.id as resposta_id,
  r.questao,
  r.valor,
  r.valor_num,
  r.ordem_exibicao,
  e.id as entrevista_id,
  e.rodada_id,
  e.pesquisa_id,
  e.municipio,
  e.regiao,
  e.sexo,
  e.faixa_etaria,
  e.escolaridade,
  e.status,
  e.coletado_em,
  e.pesquisador
from public.respostas r
join public.entrevistas e on e.id = r.entrevista_id
where e.status = 'completo';

-- Entrevistas sinalizadas para revisão da supervisão (Seção 32/58) — nunca
-- marca como inválida sozinha, só reúne os indícios num só lugar.
create or replace view public.vw_auditoria_suspeitas as
select
  e.id,
  e.session_id,
  e.pesquisador,
  e.equipe_id,
  e.municipio,
  e.duracao_seg,
  e.suspeita_duracao,
  e.geo_status,
  (e.geo_status <> 'ok') as sem_gps,
  e.coletado_em
from public.entrevistas e
where e.status = 'completo'
  and (e.suspeita_duracao = true or e.geo_status <> 'ok');

-- Volume de coleta por dispositivo — apoia o indicador "muitas entrevistas
-- pelo mesmo dispositivo" (Seção 32), sem apagar/invalidar nada sozinho.
create or replace view public.vw_auditoria_volume_dispositivo as
select
  device_info,
  equipe_id,
  count(*) as total_entrevistas,
  min(coletado_em) as primeira,
  max(coletado_em) as ultima
from public.entrevistas
where status = 'completo' and device_info is not null
group by device_info, equipe_id;

-- vw_cotas_progresso é a única exceção deliberada: continua rodando com o
-- privilégio do dono (padrão de view no Postgres) para poder agregar
-- `entrevistas` mesmo para o role anon, que não tem SELECT direto na tabela.
-- As demais não precisam disso — authenticated já enxerga entrevistas e
-- respostas via RLS direta — então rodam como invoker (menor privilégio).
alter view public.vw_coleta_resumo set (security_invoker = true);
alter view public.vw_respostas_dashboard set (security_invoker = true);
alter view public.vw_auditoria_suspeitas set (security_invoker = true);
alter view public.vw_auditoria_volume_dispositivo set (security_invoker = true);

grant select on public.vw_cotas_progresso to anon, authenticated;
grant select on public.vw_coleta_resumo to authenticated;
grant select on public.vw_respostas_dashboard to authenticated;
grant select on public.vw_auditoria_suspeitas to authenticated;
grant select on public.vw_auditoria_volume_dispositivo to authenticated;
