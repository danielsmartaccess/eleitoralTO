-- ============================================================================
-- supabase-migration-itinga-do-maranhao.sql
-- Adiciona a Pesquisa Eleitoral Itinga do Maranhão (MA) 2026 a um banco já em
-- produção, SEM apagar nenhuma tabela ou dado existente.
--
-- Itinga do Maranhão tem 2 povoados (Paulistão e Cajuapará) que usam o MESMO
-- instrumento de coleta (mesmas perguntas e candidatos em config/pesquisa.js),
-- mas cada um é uma COLETA separada: 3 linhas em `pesquisas`, uma por
-- município/localidade (sede, "Itinga do Maranhão - Povoado Paulistão" e
-- "Itinga do Maranhão - Povoado Cajuapará"). rpc_sync_entrevista resolve
-- pesquisa_id pelo texto de `municipio`, então os 3 textos precisam bater
-- exatamente com `pesquisa.municipio` de cada entrada em
-- config/pesquisa.js — é isso que mantém dashboard/relatório/admin com os 3
-- separados em vez de misturar os dados.
--
-- Seguro rodar mais de uma vez: só insere as linhas que ainda não existem.
-- ============================================================================

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Eleitoral Itinga do Maranhão (MA) 2026', 'Itinga do Maranhão', true
where not exists (
  select 1 from public.pesquisas where municipio = 'Itinga do Maranhão'
);

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Eleitoral Itinga do Maranhão - Povoado Paulistão (MA) 2026', 'Itinga do Maranhão - Povoado Paulistão', true
where not exists (
  select 1 from public.pesquisas where municipio = 'Itinga do Maranhão - Povoado Paulistão'
);

insert into public.pesquisas (nome, municipio, ativa)
select 'Pesquisa Eleitoral Itinga do Maranhão - Povoado Cajuapará (MA) 2026', 'Itinga do Maranhão - Povoado Cajuapará', true
where not exists (
  select 1 from public.pesquisas where municipio = 'Itinga do Maranhão - Povoado Cajuapará'
);
