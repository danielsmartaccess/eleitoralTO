# Pesquisa Eleitoral Tocantins 2026 — App de Coleta

PWA offline-first de coleta de campo para pesquisa eleitoral, desenvolvido para
a **Foccus Pesquisas**. HTML/CSS/JS puro (sem bundler, sem framework),
IndexedDB, Supabase e GitHub Pages — no espírito do projeto Coleta Canaã.

Cobre mais de um município na mesma instância do app: hoje **Araguaína**,
**Palmas**, **Gurupi**, **Porto Nacional** e **Paraíso do Tocantins**, cada um como uma pesquisa própria em `config/pesquisa.js`
(candidatos e prefeito atual diferentes; questionário e disputas
estaduais/nacionais compartilhados). O pesquisador escolhe qual pesquisa vai
coletar na tela inicial, e a escolha fica salva no aparelho.

## Arquitetura

```
index.html    → app de campo (pesquisador): escolha da pesquisa/município,
                 identificação por nome (sem login), nova entrevista,
                 retomar entrevistas pendentes
coleta.html    → wizard da entrevista, uma pergunta por tela, 100% offline-first
dashboard.html/relatorio.html → resultado da pesquisa em percentual — PÚBLICOS
                 (sem login, é o link que vai ao cliente), com seletor de
                 município/pesquisa para separar os resultados
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
├── dashboard.html        → resultado em % — gráficos por pergunta + cruzamentos analíticos (público)
├── relatorio.html       → resultado em % — tabelas por pergunta (público)
├── admin.html           → gestão de campo: produtividade, entrevistas paginadas, export CSV (Supabase Auth)
├── css/                  → um arquivo por área + app.css com os tokens de design
├── js/                   → um módulo por responsabilidade
├── config/pesquisa.js    → TODA a configuração do questionário/candidatos
├── config/supabase.js    → URL + anon key (público por natureza, protegido por RLS)
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
| `js/relatorio.js` | mesmo resultado em formato de tabela, por pergunta — página pública |
| `js/admin.js` | gestão de campo atrás de Supabase Auth (produtividade, entrevistas, export CSV) |

## Sem autenticação no app de campo

O app de coleta **não tem login**. O pesquisador só digita o próprio nome na
primeira vez que abre o app (`index.html`) — o nome fica salvo no aparelho
(IndexedDB) e é reaproveitado em todas as entrevistas seguintes, com opção de
"Trocar pesquisador". Não há perguntas de caracterização da amostra (sexo,
faixa etária, escolaridade etc.) nem captura de GPS.

**`dashboard.html` e `relatorio.html` também são públicos** (sem login) — é o
link que a Foccus envia ao cliente para acompanhar o resultado. Eles só
consultam a view `vw_respostas_dashboard`, que expõe apenas respostas de
entrevistas completas, sem nenhum dado do entrevistado (o questionário nunca
coleta nome, telefone ou perfil), e a tela nunca mostra número absoluto nem
o N da amostra.

Só `admin.html` — gestão de campo, com contagens operacionais por
pesquisador e export CSV — continua exigindo login real via **Supabase Auth**
(e-mail/senha, criado pela Foccus no Supabase Studio; este app não cadastra
administradores sozinho).

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
município (hoje `araguaina`, `palmas`, `gurupi`, `porto_nacional` e
`paraiso`). Para adicionar uma nova:

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

### Ainda não coberto (depende do instrumento, não do código)

- Recortes sociodemográficos (sexo, idade, escolaridade, renda, região) — o
  questionário não coleta perfil do entrevistado.
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
