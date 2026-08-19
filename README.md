# Pesquisa Eleitoral Tocantins 2026 — App de Coleta

PWA offline-first de coleta de campo para pesquisa eleitoral, desenvolvido para
a **Foccus Pesquisas**. Arquitetura inspirada no projeto Coleta Canaã (PWA +
IndexedDB + Supabase + GitHub Pages), adaptada para os requisitos de uma
operação profissional de pesquisa eleitoral: autenticação por token,
RLS restritiva, cotas de amostragem, auditoria e múltiplas rodadas.

## Sumário

1. [Arquitetura](#arquitetura)
2. [Modelo de dados](#modelo-de-dados)
3. [Segurança e RLS](#segurança-e-rls)
4. [Offline-first](#offline-first)
5. [Questionário](#questionário)
6. [Instalação e configuração](#instalação-e-configuração)
7. [Execução local](#execução-local)
8. [Testes](#testes)
9. [Deploy no GitHub Pages](#deploy-no-github-pages)
10. [Atualização do Service Worker](#atualização-do-service-worker)
11. [Operação de campo](#operação-de-campo)
12. [Recuperação de entrevistas offline](#recuperação-de-entrevistas-offline)
13. [Troubleshooting](#troubleshooting)
14. [Pendências e decisões que dependem da Foccus](#pendências-e-decisões-que-dependem-da-foccus)

---

## Arquitetura

Quatro superfícies, um único banco:

```
coleta.html   → app de campo (pesquisador), 100% offline-first
dashboard.html/relatorio.html/admin.html/auditoria.html → supervisão (Supabase Auth)
supabase-*.sql → schema, RLS/RPC e views
config/pesquisa.js → questionário, candidatos, cotas — sem tocar em código
```

Stack: HTML5 + CSS3 + JavaScript com ES Modules (sem framework), IndexedDB,
Service Worker, Supabase (PostgreSQL + PostgREST + Auth), Chart.js via CDN,
GitHub Pages. Nenhum bundler, nenhum backend Node — o mesmo princípio do
Canaã: frontend estático, resiliente, fácil de auditar.

```
/
├── index.html          → tela inicial do pesquisador (retomar/nova entrevista/cotas)
├── login.html          → login de pesquisador (token) e admin (e-mail/senha)
├── coleta.html          → wizard da entrevista
├── dashboard.html        → indicadores + gráficos de intenção de voto
├── relatorio.html       → resumo executivo, perfil da amostra, cruzamentos
├── admin.html           → pesquisadores, cotas, entrevistas paginadas, export CSV
├── auditoria.html       → entrevistas sinalizadas, volume por dispositivo, falhas de sync
├── css/                  → um arquivo por área + app.css com os tokens de design
├── js/                   → um módulo por responsabilidade (ver tabela abaixo)
├── config/pesquisa.js    → TODA a configuração do questionário/candidatos/cotas
├── config/supabase.js    → URL + anon key (público por natureza, protegido por RLS)
├── sw.js / manifest.json → PWA
└── supabase-*.sql        → schema, políticas/RPCs, views
```

| Módulo | Responsabilidade |
|---|---|
| `js/db.js` | única camada que toca o IndexedDB |
| `js/auth.js` | login de pesquisador (RPC) e de admin (Supabase Auth) |
| `js/questionario.js` | motor do questionário: passos, randomização, validação, serialização EAV |
| `js/coleta.js` | wizard (uma pergunta por tela), salvamento progressivo, finalização |
| `js/sync.js` | fila de sincronização, idempotente, nunca apaga local antes de confirmar servidor |
| `js/cotas.js` | leitura de cotas via view agregada |
| `js/auditoria.js` | registro de eventos de auditoria (local + fila de sync) |
| `js/utils.js` | funções puras (uuid, embaralhar, formatação, escape) |

## Modelo de dados

```
pesquisas → rodadas → equipes (pesquisadores) → entrevistas → respostas (EAV)
                                                     ↘ cotas
                                                     ↘ auditoria
```

- **EAV em `respostas`** (`entrevista_id, questao, valor, valor_num,
  ordem_exibicao`): trocar o questionário de uma rodada para outra nunca
  exige migração de schema.
- **`entrevistas.session_id`** é a chave de idempotência: gerada no cliente
  (`crypto.randomUUID()`) no início da entrevista, `UNIQUE` no banco, usada
  em todo upsert. Reenviar a mesma entrevista nunca duplica.
- Ver `supabase-schema.sql` para DDL completo, índices e seed inicial.

## Segurança e RLS

Decisão central (documentada em detalhe nos comentários de
`supabase-policies.sql`): como o app de coleta é estático e usa a anon key
(não há como escondê-la — nem é essa a função dela), **nenhuma tabela dá
grant direto de INSERT/UPDATE/SELECT ao role `anon`**. Todo o caminho de
escrita do app de campo passa por quatro funções `SECURITY DEFINER`:

- `rpc_login(token)` — único ponto de leitura de `equipes` acessível ao
  anon; nunca devolve a tabela inteira, só os dados do próprio pesquisador
  se o token existir e estiver ativo (evita enumeração de tokens).
- `rpc_sync_entrevista(payload)` — upsert por `session_id`, valida
  server-side que `equipe_id` corresponde a um token ativo antes de gravar.
- `rpc_sync_respostas(entrevista_id, equipe_id, respostas)` — idem, e
  confirma que a entrevista pertence de fato àquele `equipe_id`.
- `rpc_registrar_auditoria(...)` — único caminho de escrita em `auditoria`.

Isso é estritamente mais restrito que "INSERT público irrestrito": mesmo que
alguém extraia a anon key do bundle JS, não consegue ler entrevistas de
outros pesquisadores nem escrever fora do formato validado.

Dashboard/Relatório/Admin/Auditoria usam **Supabase Auth real** (e-mail e
senha, criados pela Foccus no Supabase Studio) — RLS libera `SELECT` (e, em
`equipes`/`cotas`, escrita) só para o role `authenticated`.

**Limitação conhecida e documentada:** sem um mecanismo de JWT por
pesquisador (exigiria uma Edge Function assinando tokens com o JWT secret do
projeto), a anon key não prova criptograficamente "eu sou o pesquisador X" —
a validação de `equipe_id` ativo é uma barreira forte, mas não substitui uma
sessão autenticada de verdade. Ver [Pendências](#pendências-e-decisões-que-dependem-da-foccus).

Nunca há `service_role key`, senha ou token administrativo no frontend —
apenas `SUPABASE_URL` e a `anon key` (`config/supabase.js`), que são públicas
por design no ecossistema Supabase.

## Offline-first

```
IndexedDB (js/db.js)
   entrevista em andamento  → status: em_andamento, salva a cada resposta
   entrevista completa      → status: completo, sync_status: pendente
   ↓ (quando online)
fila de sincronização (js/sync.js) → rpc_sync_entrevista/rpc_sync_respostas → Supabase
```

Regras aplicadas (ver `js/coleta.js`/`js/sync.js`):

- Cada resposta grava imediatamente no IndexedDB (`salvarEntrevista`), nunca
  espera o botão "Finalizar".
- A ordem de exibição de perguntas randomizadas é sorteada **uma vez** e
  persistida assim que é calculada (não só quando respondida) — garante que
  uma retomada mostre a mesma ordem já vista pelo entrevistado.
- Sincronização só ocorre para entrevistas com `status: completo`; nunca
  apaga o registro local antes de o servidor confirmar (`marcarSincronizada`
  só roda depois do upsert bem-sucedido).
- Gatilhos de sincronização: ao finalizar (se online), ao reconectar
  (`window.addEventListener('online', ...)`), e a cada 30s enquanto online.
- Service Worker (`sw.js`) faz cache-first do app shell (HTML/CSS/JS/config)
  e cache runtime do CDN do supabase-js — **nunca** intercepta chamadas a
  `*.supabase.co`, para que a fila de sincronização seja sempre quem decide
  o que fazer com falha de rede, não o cache do navegador.

## Questionário

Tudo em `config/pesquisa.js` — candidatos, opções, randomização, textos.
`js/questionario.js` interpreta essa configuração; nenhuma pergunta ou nome
de candidato está hardcoded no motor.

- Tipos suportados: `single_choice`, `open_text`, `two_votes` (usados pelas
  12 perguntas atuais), mais `multiple_choice` e `ranking` (motor pronto,
  ainda não usados pelo questionário atual). Adicionar `likert`, `numeric`,
  `date` no futuro significa um novo `case` em `questionario.js`/`coleta.js`,
  não uma reescrita.
- **NS/NO** é sempre acrescentado pelo motor como última opção em perguntas
  estimuladas (`single_choice`/`two_votes` do bloco eleitoral) — não está
  escrito nas listas de candidatos do config, para nunca correr risco de ser
  randomizado por engano.
- **Randomização**: `randomize: true` por pergunta; a ordem sorteada fica
  salva em `entrevista.ordem_opcoes` e é replicada para auditoria como uma
  linha `"{questao}__ordem"` na tabela `respostas` (Seção 7 do briefing).
- **Regra do Senado (Q7)**: o mesmo candidato **real** não pode ser 1º e 2º
  voto; "Não sabe/Não opinou" pode ser escolhido nos dois votos de forma
  independente (decisão explícita, documentada em `js/questionario.js` —
  o briefing deixava essa regra em aberto).
- **Q9/Q11 (Deputado Federal/Estadual)** usam placeholders
  (`"Candidato 1"`..`"Candidato 7"`) marcados `TODO_CONFIGURAR` — substituir
  a lista em `config.candidatos.deputadoFederal`/`deputadoEstadual`.
- **Q12** usa `config.prefeitoAtual` (hoje `"XXXXXX"`, TODO_CONFIGURAR).

## Instalação e configuração

### Supabase

Projeto já provisionado e com o schema aplicado: `jzwxzajarahrntbgijfz`
(`https://jzwxzajarahrntbgijfz.supabase.co`). Para recriar em outro projeto,
execute nesta ordem via SQL Editor (ou `apply_migration` do Supabase MCP):

```bash
# 1. supabase-schema.sql   → tabelas, índices, seed (pesquisa/rodada/3 tokens de teste)
# 2. supabase-policies.sql → RLS + as 4 funções SECURITY DEFINER
# 3. supabase-views.sql    → views de dashboard/cotas/auditoria
```

Depois, crie ao menos um usuário em **Authentication → Users → Add user**
no Supabase Studio para acessar dashboard/relatório/admin/auditoria — o app
não cadastra administradores sozinho.

Atualize `config/supabase.js` se trocar de projeto (`url` e `anonKey` —
ambos públicos, protegidos por RLS, nunca a `service_role`).

### Pesquisadores

Cadastre/gerencie em `equipes` (via SQL ou `admin.html`, que já permite
ativar/desativar). Tokens de teste já seedados: `PALMAS-001`,
`ARAGUAINA-001`, `GURUPI-001`.

```sql
insert into equipes (token, nome, municipio, perfil, rodada_id, ativo)
values ('NOVOTOKEN-001', 'Nome do Pesquisador', 'Município', 'PESQUISADOR',
        (select id from rodadas where codigo = 'RODADA_01'), true);
```

### Cotas

```sql
insert into cotas (rodada_id, municipio, sexo, faixa_etaria, alvo)
values ((select id from rodadas where codigo = 'RODADA_01'), 'Palmas', 'feminino', '25-34', 50);
```

`config.cotas.bloquearAoAtingirCota` (em `config/pesquisa.js`) controla se a
coleta é bloqueada ao atingir a cota — hoje `false` por decisão explícita do
briefing ("nunca bloquear automaticamente sem uma regra explícita").

### Configuração da pesquisa

Tudo em `config/pesquisa.js`: nome da pesquisa, textos de consentimento,
metadados metodológicos (amostra planejada, margem de erro — propositalmente
`null`/`TODO_CONFIGURAR` até a Foccus fornecer), listas de candidatos,
faixas etárias, escolaridade, etc.

## Execução local

Requer apenas um servidor estático (Service Worker exige `http(s)://`, não
funciona em `file://`):

```bash
python -m http.server 8730
# ou
npx --yes serve -l 8730
```

Abra `http://localhost:8730/login.html`.

## Testes

Ver [TESTES.md](TESTES.md) — os 15 testes mínimos exigidos, resultados reais
obtidos nesta implementação, teste offline ponta a ponta e os bugs
encontrados/corrigidos durante a execução (não é um roteiro teórico).

## Deploy no GitHub Pages

```bash
git add -A
git commit -m "Deploy inicial"
git push origin main
```

No repositório GitHub: **Settings → Pages → Source: Deploy from a branch →
branch `main`, pasta `/ (root)`**. Não há build step — é HTML/CSS/JS puro.

Depois do primeiro deploy, confira `manifest.json` (`start_url`/`scope`) se o
projeto for publicado numa subpasta (`usuario.github.io/repositorio/`) — hoje
está configurado para raiz relativa (`./`), que funciona em subpastas também
desde que os links internos continuem relativos (já estão).

## Atualização do Service Worker

Sempre que alterar qualquer arquivo do app shell, incremente
`CACHE_VERSION` em `sw.js`:

```js
const CACHE_VERSION = "eleitoral-to-v1.0.1"; // era v1.0.0
```

Isso força a criação de um novo cache e a limpeza automática do antigo no
evento `activate` — sem isso, aparelhos em campo continuariam servindo a
versão antiga do JS/HTML mesmo depois de um novo deploy (foi observado
exatamente esse comportamento durante os testes desta implementação, ver
TESTES.md).

## Operação de campo

1. Pesquisador abre o app (idealmente instalado como PWA — "Adicionar à tela
   inicial"), entra com o token fornecido pela supervisão.
2. Clica **+ Nova entrevista**, aplica o consentimento, preenche o bloco
   sociodemográfico e as 12 perguntas, uma por tela.
3. Ao finalizar, o app tenta sincronizar imediatamente se houver internet;
   caso contrário, fica na fila local e sincroniza sozinho quando a conexão
   voltar — não é necessário nenhuma ação manual do pesquisador.
4. A tela inicial mostra a cota da área do pesquisador (se habilitado em
   `config.cotas.exibirParaPesquisador`) e qualquer entrevista iniciada e não
   finalizada, pronta para retomar.

## Recuperação de entrevistas offline

Se o app fechar (bateria, troca de aplicativo, crash) no meio de uma
entrevista: ao reabrir, `index.html` lista automaticamente a entrevista em
"Entrevistas pendentes", com o horário de início e a opção de **CONTINUAR**
(retoma exatamente na pergunta em que parou, com a mesma ordem de candidatos
já mostrada) ou **DESCARTAR** (remove definitivamente, com confirmação).

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| App mostra tela/dado antigo depois de um deploy | Service Worker com cache antigo | Incrementar `CACHE_VERSION` em `sw.js` e reimplantar |
| Login trava em "Entrando..." | Sem internet no primeiro login | Primeiro login exige rede (para validar o token); depois disso o app funciona offline |
| Entrevista não sincroniza | Sem rede, ou `equipe` foi desativada depois do login | Verificar `equipes.ativo`; a fila tenta de novo sozinha ao reconectar |
| Cota não aparece para o pesquisador | Nenhuma linha em `cotas` para o município dele | Cadastrar cotas (ver acima) — tela não quebra, só mostra "nenhuma cota configurada" |
| Dashboard/Admin pedem login de novo | Sessão do Supabase Auth expirou ou não existe | Criar/usar uma conta em Authentication → Users no Supabase Studio |
| Erro 414 (URL grande) em alguma consulta nova | Filtro construído com lista de UUIDs na query string | Usar embed relacional do PostgREST (`tabela!inner(...)`) ou uma view, nunca `in.(uuid1,uuid2,...)` gigante — bug real documentado no projeto Canaã, tratado como regra arquitetural aqui (Seção 46) |

## Pendências e decisões que dependem da Foccus

**Metodológicas (não inventadas — ver `config.metodologia` em
`config/pesquisa.js`):**
- Amostra planejada, margem de erro, nível de confiança, metodologia de
  seleção/ponderação, lista completa de municípios pesquisados.
- Cotas reais (hoje há 6 linhas de exemplo, claramente identificadas como
  tal no seed SQL).
- Nome do prefeito atual (Q12) e listas reais de candidatos a Deputado
  Federal/Estadual (Q9/Q11) — hoje placeholders `"Candidato 1"`.."7"`.

**Jurídicas:**
- Texto de consentimento (`config.consentimento.texto`) é um modelo
  provisório, marcado `REVISÃO JURÍDICA NECESSÁRIA` no próprio texto exibido
  ao entrevistado.

**Técnicas / de segurança:**
- Autenticação do pesquisador por token (sem JWT por sessão) é uma decisão
  deliberada de custo/prazo — funcional e com defesa em profundidade real
  (RLS + RPC + validação de `ativo`), mas não é uma sessão criptograficamente
  vinculada por pesquisador. Upgrade natural: Edge Function que troca o
  token por um JWT de curta duração assinado com o JWT secret do projeto.
- RLS de `equipes.perfil` (`SUPERVISOR` só vê a própria equipe, por exemplo)
  ainda não é aplicada no banco — hoje qualquer conta `authenticated` vê
  tudo. Se a Foccus precisar de segregação por supervisor, é a próxima peça
  a desenhar.
- GPS testado apenas com permissão negada (ambiente de teste automatizado);
  recomenda-se validar em um celular real antes do primeiro dia de campo.
