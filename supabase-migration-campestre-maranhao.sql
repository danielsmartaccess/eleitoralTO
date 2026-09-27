-- ============================================================================
-- supabase-migration-campestre-maranhao.sql
-- Adiciona a Pesquisa Eleitoral Campestre do Maranhão (MA) 2026 a um banco já
-- em produção, SEM apagar nenhuma tabela ou dado existente.
--
-- Campestre do Maranhão tem 3 povoados (Cabeceira Grande, Cachimbeiro e Vila
-- Nova) que usam o MESMO instrumento de coleta (mesmas perguntas e
-- candidatos em config/pesquisa.js), mas cada um é uma COLETA separada: 4
-- linhas em `pesquisas`, uma por município/localidade (sede, "Campestre do
-- Maranhão - Povoado Cabeceira Grande", "Campestre do Maranhão - Povoado
-- Cachimbeiro" e "Campestre do Maranhão - Povoado Vila Nova").
-- rpc_sync_entrevista resolve pesquisa_id pelo texto de `municipio`, então
-- os 4 textos precisam bater exatamente com `pesquisa.municipio` de cada
-- entrada em config/pesquisa.js — é isso que mantém dashboard/relatório/
-- admin com os 4 separados em vez de misturar os dados.
--
-- Seguro rodar mais de uma vez: só insere as linhas que ainda não existem.
-- ============================================================================

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Eleitoral Campestre do Maranhão (MA) 2026', 'Campestre do Maranhão', true
where not exists (
  select 1 from public.pesquisas where municipio = 'Campestre do Maranhão'
);

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Eleitoral Campestre do Maranhão - Povoado Cabeceira Grande (MA) 2026', 'Campestre do Maranhão - Povoado Cabeceira Grande', true
where not exists (
  select 1 from public.pesquisas where municipio = 'Campestre do Maranhão - Povoado Cabeceira Grande'
);

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Eleitoral Campestre do Maranhão - Povoado Cachimbeiro (MA) 2026', 'Campestre do Maranhão - Povoado Cachimbeiro', true
where not exists (
  select 1 from public.pesquisas where municipio = 'Campestre do Maranhão - Povoado Cachimbeiro'
);

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Eleitoral Campestre do Maranhão - Povoado Vila Nova (MA) 2026', 'Campestre do Maranhão - Povoado Vila Nova', true
where not exists (
  select 1 from public.pesquisas where municipio = 'Campestre do Maranhão - Povoado Vila Nova'
);
