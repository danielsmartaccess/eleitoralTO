# Pesquisa Eleitoral 2026 — App de Coleta

PWA offline-first de coleta de campo para pesquisa eleitoral, desenvolvido para
a **Foccus Pesquisas**. HTML/CSS/JS puro (sem bundler, sem framework),
IndexedDB, Supabase e GitHub Pages — no espírito do projeto Coleta Canaã.

Cobre mais de um município/estado na mesma instância do app, cada um como uma
pesquisa própria em `config/pesquisa.js` (candidatos e prefeito atual
diferentes; questionário e disputas estaduais/nacionais compartilhados dentro
do mesmo estado). Coleta em campo atualmente aberta no **Tocantins**
(**Araguatins** e **Xambioá**) e no **Maranhão** (**Campestre do Maranhão** —
povoados Cabeceira Grande e Vila Nova; a sede e o povoado Cachimbeiro já foram
encerrados); os
demais municípios já coletados do Maranhão (**João Lisboa**, **São Bernardo**,
**Magalhães de Almeida**, **Araioses**, **Tutóia**,
**Santa Quitéria do Maranhão**, **Água Doce do Maranhão**, **Chapadinha**,
**Brejo**, **Mata Roma**, **Vargem Grande**, **Itapecuru Mirim** e
**Itinga do Maranhão** — sede, Paulistão e Cajuapará) e do Tocantins
(**Araguaína**, **Palmas**, **Gurupi**, **Porto Nacional**,
**Paraíso do Tocantins** e **Piraquê**) seguem só para consulta em
dashboard/relatório/admin (`ativoParaColeta: false` em `config/pesquisa.js`).
O pesquisador
escolhe qual pesquisa vai coletar na tela inicial, e a escolha fica salva
no aparelho.

## Arquitetura

```
index.html    → app de campo (pesquisador): escolha da pesquisa/município,
                 identificação por nome (sem login), nova entrevista,
                 retomar entrevistas pendentes
coleta.html    → wizard da entrevista, uma pergunta por tela, 100% offline-first
dashboard.html/relatorio.html → resultado da pesquisa em percentual — RESTRITOS
                 (login Supabase Auth, como o admin), com seletor de
                 município/pesquisa para separar os resultados
desempenho.html → "Pesquisa × Urna": auditoria pública das pesquisas do
                 1º turno 2026 contra o resultado oficial do TSE
admin.html      → gestão de campo (Supabase Auth): produtividade por
                 pesquisador, entrevistas paginadas, export CSV
supabase-*.sql → schema, RLS/RPC e views
config/pesquisa.js → registro de pesquisas (por município), questionário e
                 candidatos — sem tocar em código
```

```
/
├── index.html          → tela inicial do pesquisador (identificação/retomar/nova)
├── login.html          → login do admin (só `admin.html` exige)
├── coleta.html          → wizard da entrevista
├── dashboard.html        → resultado em % — gráficos por pergunta + cruzamentos analíticos (login)
├── relatorio.html       → resultado em % — tabelas por pergunta (login)
├── desempenho.html      → Pesquisa × Urna: pesquisas do 1º turno × resultado oficial do TSE (público)
├── admin.html           → gestão de campo: produtividade, entrevistas paginadas, export CSV (Supabase Auth)
├── css/                  → um arquivo por área + app.css com os tokens de design
├── js/                   → um módulo por responsabilidade
├── config/pesquisa.js    → TODA a configuração do questionário/candidatos
├── config/supabase.js    → URL + anon key (público por natureza, protegido por RLS)
├── data/urna-2026.json   → resultado oficial do TSE (1º turno 2026) dos municípios pesquisados — gerado
├── scripts/              → gerar-urna-2026.js (baixa o TSE e casa nomes com o questionário)
├── tests/                → testes das métricas Pesquisa × Urna (`node --test "tests/*.test.js"`)
├── sw.js / manifest.json → PWA
└── supabase-*.sql        → schema, políticas/RPCs, views
```

| Módulo | Responsabilidade |
|---|---|
| `js/db.js` | única camada que toca o IndexedDB (entrevistas + nome do pesquisador) |
| `js/auth.js` | login administrativo (Supabase Auth) |
| `js/questionario.js` | motor do questionário: passos, randomização, validação, serialização EAV |
| `js/coleta.js` | wizard (uma pergunta por tela), salvamento progressivo, finalização |
| `js/sync.js` | fila de sincronização, idempotente, nunca apaga local antes de confirmar servidor |
| `js/utils.js` | funções puras (uuid, embaralhar, formatação, escape, `distribuirPercentuais`, casamento de resposta espontânea com candidato) |
| `js/dashboard.js` | gráficos de resultado + cruzamentos analíticos (voto × voto, transferência de turno, espontânea × estimulada) — sempre em %, lê a view pública |
| `js/relatorio.js` | mesmo resultado em formato de tabela, por pergunta — restrito (login) |
| `js/acuracia.js` | métricas puras Pesquisa × Urna (votos válidos, erro médio, vencedor, erro na margem, viés) — sem DOM, testadas em `tests/` |
| `js/desempenho.js` | página Pesquisa × Urna: lê `data/urna-2026.json` + a view pública e renderiza placar, leitura executiva, gráficos e régua de mercado |
| `js/admin.js` | gestão de campo atrás de Supabase Auth (produtividade, entrevistas, export CSV) |

## Sem autenticação no app de campo

O app de coleta **não tem login**. O pesquisador só digita o próprio nome na
primeira vez que abre o app (`index.html`) — o nome fica salvo no aparelho
(IndexedDB) e é reaproveitado em todas as entrevistas seguintes, com opção de
"Trocar pesquisador". Não há perguntas de caracterização da amostra (sexo,
faixa etária, escolaridade etc.) nem captura de GPS.

**Desde 05/10/2026, `dashboard.html`, `relatorio.html` e `admin.html` exigem
login** real via **Supabase Auth** (e-mail/senha, criado pela Foccus no
Supabase Studio; este app não cadastra administradores sozinho). Sem sessão,
`exigirLoginAdmin()` (`js/auth.js`) manda para `login.html?voltar=<página>`
e, depois do login, devolve o usuário à página pedida (só páginas da lista
`PAGINAS_RESTRITAS` — sem open redirect). Para um cliente acompanhar o
resultado, crie uma conta para ele no Supabase Auth.

A única página de resultado **pública** é `desempenho.html` (Pesquisa × Urna).
Ela lê a view `vw_respostas_dashboard`, que por isso continua com `select`
para `anon`: o bloqueio das outras páginas tira os resultados do ar para o
público, mas não fecha a view — os dados seguem consultáveis pela API com a
anon key. A view expõe apenas respostas de entrevistas completas, sem nenhum
dado do entrevistado (o questionário nunca coleta nome, telefone ou perfil),
e nenhuma tela mostra número absoluto nem o N da amostra.

## Modelo de dados

```
pesquisas → entrevistas → respostas (EAV)
```

- **EAV em `respostas`** (`entrevista_id, questao, valor, valor_num,
  ordem_exibicao`): cada município (Araguaína, Palmas, ...) é uma nova linha
  em `pesquisas` e nunca exige migração de schema.
- **`entrevistas.session_id`** é a chave de idempotência: gerada no cliente
  (`crypto.randomUUID()`), `UNIQUE` no banco, usada em todo upsert. Reenviar a
  mesma entrevista nunca duplica.
- Ver `supabase-schema.sql` para DDL completo.

## Segurança e RLS

Como o app de coleta é estático e usa a anon key (não há como escondê-la),
**nenhuma tabela dá grant direto de INSERT/UPDATE/SELECT ao role `anon`**.
Toda escrita do app de campo passa por duas funções `SECURITY DEFINER`:

- `rpc_sync_entrevista(payload)` — upsert por `session_id`; resolve
  `pesquisa_id` pelo município quando não informado.
- `rpc_sync_respostas(entrevista_id, respostas)` — upsert em lote no EAV,
  só aceito se a entrevista existir.

Leitura de resultado: `vw_respostas_dashboard` tem `grant select` para `anon`
(é `security_invoker = false`, roda com o privilégio de quem a criou, então
o `anon` não precisa de nenhum grant nas tabelas base) — só ela. As tabelas
`entrevistas`/`respostas` e as views operacionais (`vw_coleta_resumo`,
`vw_resumo_municipio`, usadas só pelo `admin.html`) seguem restritas a
`authenticated`. `admin.html` usa **Supabase Auth real**.

Nunca há `service_role key`, senha ou token administrativo no frontend —
apenas `SUPABASE_URL` e a `anon key` (`config/supabase.js`), públicas por
design no ecossistema Supabase.

## Offline-first

```
IndexedDB (js/db.js)
   entrevista em andamento  → status: em_andamento, salva a cada resposta
   entrevista completa      → status: completo, sync_status: pendente
   ↓ (quando online)
fila de sincronização (js/sync.js) → rpc_sync_entrevista/rpc_sync_respostas → Supabase
```

- Cada resposta grava imediatamente no IndexedDB, nunca espera o botão
  "Finalizar".
- A ordem de exibição de perguntas randomizadas é sorteada uma vez e
  persistida assim que é calculada — uma retomada mostra a mesma ordem já
  vista pelo entrevistado.
- Sincronização só ocorre para entrevistas com `status: completo`; nunca
  apaga o registro local antes de o servidor confirmar.
- Gatilhos de sincronização: ao finalizar (se online), ao reconectar, e a
  cada 30s enquanto online.

## Questionário

12 perguntas por pesquisa, definidas uma única vez em `criarPerguntasPadrao()`
(`config/pesquisa.js`) e reaproveitadas por todo município — motor genérico
em `js/questionario.js`, tipos suportados: `single_choice`, `open_text`,
`two_votes`.

- **NS/NO** é sempre acrescentado pelo motor como última opção nas perguntas
  estimuladas.
- **Randomização**: `randomize: true` por pergunta; a ordem sorteada é
  persistida em `entrevista.ordem_opcoes` e replicada como linha
  `"{questao}__ordem"` em `respostas`.
- **Regra do Senado (Q7)**: o mesmo candidato real não pode ser 1º e 2º voto;
  NS/NO pode ser escolhido nos dois votos de forma independente.
- **Q12** usa `config.prefeitoAtual` — `"Wagner Rodrigues"` em Araguaína,
  `"Eduardo Siqueira"` em Palmas.
- Presidente, Governador e Senado usam as mesmas listas de candidatos em
  todo município (`CANDIDATOS_ESTADUAIS_TOCANTINS`), por serem disputas
  estaduais/nacionais. Deputado Federal, Deputado Estadual e prefeito são
  específicos de cada `PESQUISA_*` em `config/pesquisa.js`.

### Múltiplas pesquisas (municípios)

`PESQUISAS_CONFIG` em `config/pesquisa.js` registra uma pesquisa por
município (hoje `araguaina`, `palmas`, `gurupi`, `porto_nacional`, `paraiso`
e `piraque_to`, além dos municípios do Maranhão). Para adicionar uma nova:

1. Criar um novo objeto `PESQUISA_*` (candidatos de Deputado
   Federal/Estadual, `prefeitoAtual`, `pesquisa.nome`/`pesquisa.municipio`) e
   registrá-lo em `PESQUISAS_CONFIG`.
2. Rodar `supabase-migration-palmas.sql` como modelo — um `insert` análogo em
   `pesquisas` para o novo município, sem apagar dados existentes.

Na tela inicial (`index.html`), o pesquisador escolhe a pesquisa antes de se
identificar; a escolha fica salva no aparelho (`localStorage`) com opção de
"Trocar pesquisa". Ao retomar uma entrevista pendente, o app usa o
questionário do município gravado na própria entrevista — não o da seleção
atual do aparelho. Dashboard e Relatório têm um seletor de
município/pesquisa próprio, para não misturar os resultados das diferentes
cidades.

## Relatórios — só percentual

`dashboard.html` e `relatorio.html` nunca mostram números absolutos nem o
total de entrevistados — só percentuais. Contagens operacionais (quantas
entrevistas cada pesquisador coletou) aparecem apenas em `admin.html`, para
gestão de campo.

Percentuais são fechados com `distribuirPercentuais()` (`js/utils.js`) —
método dos maiores restos (Hamilton), que garante soma exata de 100% sem
distorcer a ordem relativa. Arredondar item a item deixaria o total em
99,9% / 100,1%.

### Dashboard — o que cada bloco mostra

Ordem em `dashboard.html`, todos com o mesmo seletor de município e os
filtros de pesquisador/período:

1. **KPIs** — aprovação/reprovação de governo e de prefeito, líder de
   Presidente e de Governador.
2. **Resultado por pergunta** (Q1–Q12) — intenção de voto e avaliação, uma
   barra horizontal por pergunta. Respostas espontâneas (Q4/Q8/Q10) são
   agregadas por menção, com grafias diferentes do mesmo candidato agrupadas
   sob o nome oficial (`agregarTextoLivre` + `casarComCandidato`).
3. **Cruzamentos analíticos** (heatmap tabular) — cada linha soma 100% e é a
   distribuição do voto daquele grupo na outra disputa:
   - Deputado Federal × Governador e Deputado Estadual × Governador — efeito
     de arrastamento / palanque;
   - Presidente × Governador — nacionalização do voto;
   - Avaliação do Governo × Governador — conversão de aprovação em voto;
   - Senado 1º voto × 2º voto — voto casado.
4. **Transferência de votos 1º → 2º turno** (barras 100% empilhadas) —
   Governador (Q5→Q6) e Presidente (Q2→Q3): retenção dos finalistas e
   destino do voto dos eliminados.
5. **Indicadores complementares** — indecisão (NS/NO) comparada entre todas
   as disputas; lembrança espontânea × voto estimulado por candidato
   (o *gap* é força de marca / *top of mind*).

### Regras dos cruzamentos

- Feitos no cliente: `js/dashboard.js` carrega `entrevista_id,valor` de cada
  questão da view em `Map<entrevista_id, valor>` e cruza em memória. Não há
  view/RPC de crosstab no banco.
- **Normalização por linha** — cada linha soma 100%; entram no denominador só
  entrevistas com resposta válida (rótulo canônico do `config`) nas duas
  perguntas.
- **Base mínima** — linhas com menos de `LIMIAR_BASE_CRUZAMENTO` (30; 20 no
  Senado e nas simulações de 2º turno) são **omitidas**, com nota ao pé
  listando quais. Nunca se exibe o N — só se suprime a linha instável.
- `valor` de pergunta `single_choice` guarda o **texto** da opção (ex.:
  `"Professora Dorinha"`), não o id; `two_votes` (Senado) serializa como
  `q7_1voto` / `q7_2voto`.

### Pesquisa × Urna (`desempenho.html`)

Auditoria pública de desempenho: cada pesquisa municipal (sede) feita antes
do 1º turno de 04/10/2026 comparada com o resultado oficial do TSE no mesmo
município, com a régua que imprensa e agregadores usaram para avaliar os
institutos em 2026.

- **Dados oficiais:** `data/urna-2026.json`, gerado por
  `node scripts/gerar-urna-2026.js` (Node 18+, internet) a partir de
  `resultados.tse.jus.br` (eleição 6257 = Presidente; 6259 = Governador,
  Senado e Deputados). O script casa o nome de urna com o rótulo do
  questionário (`config/pesquisa.js`); rode com `--revisar` para listar os
  casamentos não exatos e fixe exceções em `CASAMENTOS_MANUAIS`. O arquivo
  só tem dado público do TSE — o lado "pesquisa" é lido ao vivo da view,
  como no dashboard (nenhum resultado de pesquisa entra no repositório).
- **Base da comparação:** só entrevistas completas feitas até 03/10;
  povoados (recortes territoriais) e bases abaixo de 30 ficam fora, listados
  na nota metodológica.
- **Métricas** (`js/acuracia.js`): votos válidos (exclui NS/NO e
  renormaliza entre os candidatos de fato apresentados no disco — lidos do
  log de randomização `q*__ordem`); vencedor no município; erro médio
  absoluto dos candidatos com ≥ 2% ou top-4 na urna; erro na margem 1º–2º;
  Senado = menções do 1º + 2º voto; deputados = comparação restrita aos
  nomes testados. **Empate na pesquisa nunca conta como acerto** (inclusive
  na fronteira do top-2 do Senado e do top-3 de deputados).
- **Régua de mercado:** últimas pesquisas de Quaest, Datafolha e
  AtlasIntel (com fonte), avaliadas com a mesma métrica —
  `REFERENCIAS_MERCADO` no script gerador.
- **Visão pública × analítica:** até o 2º turno (25/10), a visão pública
  (padrão) não mostra percentual por candidato nem erro na margem das
  disputas que seguem em 2º turno (Presidente; Governador no TO) —
  divulgar intenção de voto de candidato em disputa aberta exige registro no
  PesqEle (Lei 9.504/97, art. 33; Res. TSE 23.600/2019). `?visao=analitica`
  mostra tudo, para apresentação reservada. A restrição expira sozinha
  depois de 25/10.
- Como no dashboard, a página nunca mostra N nem contagem de entrevistas; a
  margem de erro de cada pesquisa só é usada internamente (indicador "dentro
  da margem").

Testes das métricas: `node --test "tests/*.test.js"`.

### Ainda não coberto (depende do instrumento, não do código)

- Recortes sociodemográficos (sexo, idade, escolaridade, renda, região) — a
  maioria dos questionários não coleta perfil do entrevistado. Exceção:
  Campestre do Maranhão (sede e povoados) tem `perfil_sexo`, `perfil_bairro`
  e `perfil_faixa_etaria` no instrumento (`criarPerguntasCampestreMaranhao()`
  em `config/pesquisa.js`), gravados como qualquer outra pergunta EAV em
  `public.respostas` — coletados, mas ainda sem painel/cruzamento dedicado em
  dashboard/relatório (que só resolve perguntas por papel semântico em
  `perguntasSemanticas`).
- Rejeição explícita ("em quem não votaria de jeito nenhum").
- Série histórica entre ondas de campo.

## Instalação e configuração

### Supabase

Projeto: `jzwxzajarahrntbgijfz` (`https://jzwxzajarahrntbgijfz.supabase.co`).
Para recriar em outro projeto do zero, execute nesta ordem via SQL Editor (ou
`apply_migration` do Supabase MCP):

```bash
# 1. supabase-schema.sql   → tabelas, índices, seed (Araguaína + Palmas)
# 2. supabase-policies.sql → RLS + as 2 funções SECURITY DEFINER
# 3. supabase-views.sql    → views de dashboard/admin
```

`supabase-views.sql` já cria as três views (`vw_respostas_dashboard` pública
para `anon`; `vw_coleta_resumo` e `vw_resumo_municipio` só para
`authenticated`). Depois, crie ao menos um usuário em **Authentication →
Users → Add user** no Supabase Studio para acessar `admin.html`.

Se o projeto **já está em produção** (Araguaína já coletando em campo),
**não rode `supabase-schema.sql` de novo** — ele dropa e recria as tabelas.
Migrações não destrutivas para aplicar num banco existente (seguras de rodar
mais de uma vez):

```bash
# supabase-migration-palmas.sql          → insere a pesquisa de Palmas
# supabase-migration-gurupi.sql          → insere a pesquisa de Gurupi
# supabase-migration-porto-nacional.sql  → insere a pesquisa de Porto Nacional
# supabase-migration-paraiso.sql         → insere a pesquisa de Paraíso do Tocantins
# supabase-migration-resumo-municipio.sql → adiciona o resumo por município ao admin
# (para os cruzamentos do dashboard, reexecutar supabase-views.sql basta —
#  vw_respostas_dashboard já expõe entrevista_id e não mudou de contrato)
```

Atualize `config/supabase.js` se trocar de projeto (`url` e `anonKey`).

### Configuração da pesquisa

Tudo em `config/pesquisa.js`: nome/município da pesquisa, prefeito atual,
listas de candidatos, perguntas.

## Execução local

Requer apenas um servidor estático (Service Worker exige `http(s)://`, não
funciona em `file://`):

```bash
python -m http.server 8730
```

Abra `http://localhost:8730/index.html` (campo) ou
`http://localhost:8730/login.html` (administração).

## Deploy no GitHub Pages

```bash
git add -A
git commit -m "Deploy"
git push origin main
```

**Settings → Pages → Source: Deploy from a branch → branch `main`, pasta
`/ (root)`**. Sem build step.

## Atualização do Service Worker

Sempre que alterar qualquer arquivo do app shell, incremente
`CACHE_VERSION` em `sw.js` — força a limpeza automática do cache antigo.

## Operação de campo

1. Pesquisador abre o app (idealmente instalado como PWA), escolhe a
   pesquisa/município na primeira vez e digita o próprio nome.
2. Clica **+ Nova entrevista**, responde as 12 perguntas, uma por tela.
3. Ao finalizar, o app tenta sincronizar imediatamente se houver internet;
   caso contrário, fica na fila local e sincroniza sozinho quando a conexão
   voltar.

## Recuperação de entrevistas offline

Se o app fechar no meio de uma entrevista: ao reabrir, `index.html` lista
automaticamente a entrevista em "Entrevistas pendentes", com opção de
**CONTINUAR** (retoma na pergunta em que parou) ou **DESCARTAR**.

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| App mostra tela/dado antigo depois de um deploy | Service Worker com cache antigo | Incrementar `CACHE_VERSION` em `sw.js` e reimplantar |
| Entrevista não sincroniza | Sem rede | A fila tenta de novo sozinha ao reconectar |
| `admin.html` pede login de novo | Sessão do Supabase Auth expirou ou não existe | Criar/usar uma conta em Authentication → Users no Supabase Studio |
| Bloco "Cruzamentos analíticos" aparece vazio / "base insuficiente" | Poucas entrevistas nos filtros, ou candidato abaixo do limiar de base | Ampliar o período/remover filtro de pesquisador; linhas abaixo de 30 entrevistas (20 em 2º turno/Senado) são omitidas de propósito |
| Cruzamentos não carregam, resto do dashboard sim | Erro nas consultas extras — ver console (`Falha ao carregar análises avançadas`) | Confirmar que `supabase-views.sql` foi reexecutado e que `vw_respostas_dashboard` tem `grant select` para `anon` |
