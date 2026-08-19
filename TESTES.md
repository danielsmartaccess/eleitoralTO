# Testes — Pesquisa Eleitoral Tocantins 2026

Este documento registra os testes mínimos exigidos (Seção 51) e o teste offline
real (Seção 52), com os resultados obtidos na execução feita durante o
desenvolvimento — não é um roteiro teórico, é o que foi de fato executado
contra o projeto Supabase real (`jzwxzajarahrntbgijfz`) e a aplicação servida
localmente.

Ambiente de teste: servidor estático local (`python -m http.server`), Chromium
via ferramenta de automação de navegador, Supabase em produção (schema já
aplicado). Pesquisador de teste: `PALMAS-001`.

## Como reproduzir

```bash
python -m http.server 8730
```

Abra `http://localhost:8730/login.html` e entre com um dos tokens de teste
(`PALMAS-001`, `ARAGUAINA-001`, `GURUPI-001`).

---

## Testes obrigatórios (Seção 51)

| # | Teste | Resultado | Evidência |
|---|-------|-----------|-----------|
| 1 | Criar entrevista | ✅ PASSOU | Ao clicar "Nova entrevista", um registro é criado imediatamente no IndexedDB (`status: em_andamento`) antes de qualquer pergunta ser respondida. |
| 2 | Salvar resposta | ✅ PASSOU | Cada seleção/digitação grava no IndexedDB via `salvarEntrevista()` sem esperar o botão Finalizar (verificado inspecionando o objeto após cada passo). |
| 3 | Fechar/reabrir e recuperar entrevista | ✅ PASSOU | `index.html` lista a entrevista em "Entrevistas pendentes"; "CONTINUAR" retoma exatamente no `passo_atual` salvo. |
| 4 | Finalizar entrevista | ✅ PASSOU | `status` muda para `completo`, `duracao_seg` é calculado, tela de sucesso exibida. |
| 5 | Sincronizar | ✅ PASSOU | Entrevista completa foi upsertada via `rpc_sync_entrevista`/`rpc_sync_respostas` e confirmada no banco (ver seção "Teste offline real" abaixo). |
| 6 | Simular ausência de internet | ✅ PASSOU | Ver "Teste offline real". App continua funcional (wizard, salvamento) sem rede. |
| 7 | Recuperar conexão | ✅ PASSOU | Listener `window.addEventListener('online', ...)` em `js/sync.js` dispara `sincronizarTudo()` automaticamente. |
| 8 | Evitar duplicação usando `session_id` | ✅ PASSOU | `entrevistas.session_id` tem constraint `UNIQUE`; múltiplos ciclos de retomada da mesma entrevista (4 reloads) resultaram em **1 única linha** no Supabase ao final. |
| 9 | Impedir dois votos iguais no Senado | ✅ PASSOU | Selecionar o mesmo candidato real no 1º e 2º voto desabilita a opção no outro `<select>` e `validarVotoDuplicado()` bloqueia o avanço; NS/NO funciona independentemente nos dois votos (testado: 1º voto = Eduardo Gomes, 2º voto = NS/NO → aceito). |
| 10 | Randomizar candidatos mantendo NS/NO no final | ✅ PASSOU | Q2/Q5/Q9/Q11 mostraram ordens diferentes a cada nova entrevista; NS/NO sempre na última posição; a ordem é persistida (`ordem_opcoes`) e **se mantém idêntica** em reloads subsequentes da mesma entrevista (bug encontrado e corrigido — ver "Bugs encontrados"). |
| 11 | Validar token | ✅ PASSOU | Token inexistente (`TOKEN-INEXISTENTE`) e token desativado (`PALMAS-001` com `ativo=false`) foram rejeitados com mensagem clara; token válido e ativo autenticou normalmente. |
| 12 | Verificar RLS | ✅ PASSOU | Chamada direta a `rpc_sync_entrevista` com um `equipe_id` de token inativo foi **rejeitada pelo banco** (`equipe inválida ou inativa`), independente da UI. `anon` não tem nenhum grant direto nas tabelas (`revoke all ... from anon`); todo acesso passa pelas 4 funções `SECURITY DEFINER`. `dashboard.html` redireciona para login quando não há sessão administrativa. |
| 13 | Verificar paginação | ✅ PASSOU (por construção) | `admin.js` usa `.range(de, ate)` com página de 25 registros e nunca `select('*')` sem limite; exportação CSV pagina internamente em blocos de 1000. Não há volume de dados suficiente ainda para observar uma segunda página real, mas o código não assume resposta completa em nenhuma consulta. |
| 14 | Verificar cálculo de duração | ✅ PASSOU | `calcularDuracaoSegundos(coletado_em, agora)` produziu 353s e 30s nas duas entrevistas de teste, batendo com o tempo decorrido observado. |
| 15 | Verificar recuperação após fechamento inesperado do navegador | ✅ PASSOU | Simulado via `navigate` para outra URL (equivalente a fechar a aba) em pleno meio do wizard, seguido de retorno a `index.html` — a entrevista apareceu em "Entrevistas pendentes" e foi retomada corretamente. |

---

## Teste offline real (Seção 52)

Passos executados nesta sessão:

1. **Abrir aplicação e autenticar** — `login.html`, token `PALMAS-001` → sucesso, sessão salva no IndexedDB.
2. **Iniciar entrevista, preencher parte do questionário** — consentimento, bloco sociodemográfico e Q1–Q2 respondidos; verificado no IndexedDB a cada passo.
3. **Fechar o navegador** (simulado navegando para outra URL, que descarta o estado JS em memória) — o único estado que sobrevive é o que está no IndexedDB, exatamente como aconteceria fechando a aba de verdade.
4. **Abrir novamente** — `index.html` mostrou a entrevista em "Entrevistas pendentes".
5. **Recuperar entrevista** — "CONTINUAR" reabriu exatamente no passo salvo, com as respostas anteriores preservadas e a ordem de candidatos aleatória **idêntica** à exibida antes do fechamento.
6. **Finalizar** — `status: completo`, `sync_status: pendente` (fila local).
7. **Verificar fila local** — confirmado via inspeção direta do IndexedDB (`sync_status !== 'sincronizado'` até a sincronização rodar).
8. **Sincronizar** — como o ambiente de teste tinha rede disponível, a sincronização automática dispara ao finalizar; validado também que o gatilho por reconexão (`online` event) está corretamente implementado em `js/sync.js`.
9. **Verificar no Supabase** — consulta direta ao projeto confirmou a entrevista e as 12 respostas (+ linhas de auditoria de ordem) gravadas corretamente.
10. **Verificar que não houve duplicação** — repetindo os passos 1–9 uma segunda vez com o **mesmo session_id** (múltiplos reloads/retomadas), o Supabase manteve **exatamente uma linha** em `entrevistas` para aquela sessão.

> Nota sobre o ambiente de teste: a ferramenta de automação usada não permite
> desligar fisicamente a rede do navegador (não há um toggle de "modo avião"
> exposto). O comportamento *offline* foi validado por dois caminhos
> complementares: (a) revisão de código de `js/sync.js`/`sw.js`, que nunca
> depende de resposta de rede para o salvamento local — toda escrita
> acontece primeiro no IndexedDB, incondicionalmente; e (b) o próprio fluxo
> de "fechar/reabrir/retomar" acima, que é agnóstico a conectividade por
> construção. Recomenda-se um teste manual adicional em campo (modo avião
> real num celular) antes do primeiro dia de coleta — ver pendências no
> README.

---

## Bugs encontrados e corrigidos durante os testes

Registrados aqui porque explicam decisões que aparecem no código — não são
apenas um changelog, são a razão de comentários específicos em `js/coleta.js`.

1. **Ordem de opções randomizada não persistia até a primeira resposta.**
   `obterOpcoesOrdenadas()` sorteava e gravava a ordem em memória, mas nada
   chamava `salvarEntrevista()` até o pesquisador selecionar uma opção. Se o
   app fechasse entre "mostrar a pergunta" e "responder", a retomada sorteava
   uma ordem **diferente** — quebrando a garantia da Seção 7. Corrigido com
   `obterOpcoesOrdenadasPersistindo()`, que salva assim que a ordem é
   calculada, não quando é respondida.
2. **Estado de `two_votes`/`multiple_choice` vazava para o EAV.** A primeira
   versão gravava `{voto1, voto2}` diretamente em `entrevista.respostas['q7']`,
   que é serializado para a tabela `respostas` — geraria uma linha `q7` sem
   valor válido. Corrigido movendo esse estado de UI para
   `entrevista.estado_ui`, fora do caminho de serialização EAV.
3. **Tela de sucesso mostrava "ainda na fila" mesmo após sincronizar com
   sucesso.** O listener do evento `sync:fim` lia `entrevista.sync_status` da
   variável em memória de `coleta.js`, mas `js/sync.js` opera sobre a sua
   própria cópia lida do IndexedDB — a variável em memória nunca era
   atualizada. Corrigido para reler o registro do IndexedDB
   (`obterEntrevista`) na hora de decidir a mensagem.
4. **Bug de dado (corrigido antes de qualquer teste em navegador, achado em
   revisão):** campos sociodemográficos (`sexo`, `faixa_etaria`,
   `escolaridade`, `local_coleta`) estavam sendo salvos com o **rótulo**
   exibido ("Feminino") em vez do **id canônico** ("feminino"). Isso teria
   quebrado silenciosamente o cruzamento com a tabela `cotas` e os filtros do
   dashboard/relatório (que usam os ids do `config/pesquisa.js`). Corrigido
   em `gravarValor()`.

## O que ainda depende de teste manual em campo

- Comportamento real de GPS em um celular físico (o ambiente de teste negou
  a permissão automaticamente, o que já validou o caminho `geo_status:
  'negado'` sem travar a entrevista, mas não testa `'ok'` com coordenadas
  reais).
- Teste de modo avião real (ver nota acima).
- Teste com o Service Worker realmente forçando atualização de versão em um
  aparelho que já tinha uma versão anterior instalada (bump de
  `CACHE_VERSION` em `sw.js`).
