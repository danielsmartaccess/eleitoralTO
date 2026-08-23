# Pesquisa Eleitoral Araguaína 2026 — App de Coleta

PWA offline-first de coleta de campo para pesquisa eleitoral, desenvolvido para
a **Foccus Pesquisas**. HTML/CSS/JS puro (sem bundler, sem framework),
IndexedDB, Supabase e GitHub Pages — no espírito do projeto Coleta Canaã.

## Arquitetura

```
index.html    → app de campo (pesquisador): identificação por nome (sem
                 login), nova entrevista, retomar entrevistas pendentes
coleta.html    → wizard da entrevista, uma pergunta por tela, 100% offline-first
dashboard.html/relatorio.html/admin.html → supervisão (Supabase Auth)
supabase-*.sql → schema, RLS/RPC e views
config/pesquisa.js → questionário e candidatos — sem tocar em código
```

```
/
├── index.html          → tela inicial do pesquisador (identificação/retomar/nova)
├── login.html          → login administrativo (dashboard/relatório/admin)
├── coleta.html          → wizard da entrevista
├── dashboard.html        → resultados em percentual, por pergunta
├── relatorio.html       → resumo + resultados em percentual
├── admin.html           → pesquisadores em campo, entrevistas paginadas, export CSV
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
| `js/utils.js` | funções puras (uuid, embaralhar, formatação, escape) |

## Sem autenticação no app de campo

O app de coleta **não tem login**. O pesquisador só digita o próprio nome na
primeira vez que abre o app (`index.html`) — o nome fica salvo no aparelho
(IndexedDB) e é reaproveitado em todas as entrevistas seguintes, com opção de
"Trocar pesquisador". Não há perguntas de caracterização da amostra (sexo,
faixa etária, escolaridade etc.) nem captura de GPS.

Dashboard, relatório e administração continuam exigindo login real via
**Supabase Auth** (e-mail/senha, criado pela Foccus no Supabase Studio —
este app não cadastra administradores sozinho).

## Modelo de dados

```
pesquisas → entrevistas → respostas (EAV)
```

- **EAV em `respostas`** (`entrevista_id, questao, valor, valor_num,
  ordem_exibicao`): trocar o questionário (Araguaína → Gurupi/Palmas, cada um
  como uma nova linha em `pesquisas`) nunca exige migração de schema.
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

Dashboard/Relatório/Admin usam **Supabase Auth real** — RLS libera `SELECT`
só para o role `authenticated`.

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

## Questionário (Araguaína)

12 perguntas em `config/pesquisa.js`, motor genérico em
`js/questionario.js` — tipos suportados: `single_choice`, `open_text`,
`two_votes`.

- **NS/NO** é sempre acrescentado pelo motor como última opção nas perguntas
  estimuladas.
- **Randomização**: `randomize: true` por pergunta; a ordem sorteada é
  persistida em `entrevista.ordem_opcoes` e replicada como linha
  `"{questao}__ordem"` em `respostas`.
- **Regra do Senado (Q7)**: o mesmo candidato real não pode ser 1º e 2º voto;
  NS/NO pode ser escolhido nos dois votos de forma independente.
- **Q12** usa `config.prefeitoAtual` (`"Wagner Rodrigues"`).

Para agregar Gurupi/Palmas depois: nova linha em `pesquisas` (município) e,
se o questionário mudar, um `config/pesquisa.js` próprio por rodada.

## Relatórios — só percentual

`dashboard.html` e `relatorio.html` nunca mostram números absolutos nem o
total de entrevistados — só percentuais por pergunta. Contagens
operacionais (quantas entrevistas cada pesquisador coletou) aparecem apenas
em `admin.html`, para gestão de campo.

## Instalação e configuração

### Supabase

Projeto: `jzwxzajarahrntbgijfz` (`https://jzwxzajarahrntbgijfz.supabase.co`).
Para recriar em outro projeto, execute nesta ordem via SQL Editor (ou
`apply_migration` do Supabase MCP):

```bash
# 1. supabase-schema.sql   → tabelas, índices, seed (pesquisa de Araguaína)
# 2. supabase-policies.sql → RLS + as 2 funções SECURITY DEFINER
# 3. supabase-views.sql    → views de dashboard/admin
```

Depois, crie ao menos um usuário em **Authentication → Users → Add user**
no Supabase Studio para acessar dashboard/relatório/admin.

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

1. Pesquisador abre o app (idealmente instalado como PWA), digita o próprio
   nome na primeira vez.
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
| Dashboard/Relatório/Admin pedem login de novo | Sessão do Supabase Auth expirou ou não existe | Criar/usar uma conta em Authentication → Users no Supabase Studio |
