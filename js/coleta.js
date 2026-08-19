// ============================================================================
// js/coleta.js — wizard de entrevista (coleta.html). Uma pergunta por tela
// (Seção 42), salvamento progressivo a cada resposta (Seção 26), suporte a
// retomada (Seção 3.3/26) e finalização com fila de sincronização (Seção 27).
// ============================================================================

import { exigirLoginPesquisador } from "./auth.js";
import { salvarEntrevista, obterEntrevista } from "./db.js";
import { getPassos, obterOpcoesOrdenadas, validarResposta, validarVotoDuplicado } from "./questionario.js";
import { registrarEvento, EVENTOS, calcularDuracaoSegundos, avaliarSuspeitaDuracao } from "./auditoria.js";
import { sincronizarTudo } from "./sync.js";
import { iniciarIndicadorConexao, iniciarControleFonte, registrarServiceWorker } from "./app.js";
import { gerarSessionId, escapeHtml, coletarDeviceInfo, codigoCurto, estaOnline, debounce } from "./utils.js";

const config = window.PESQUISA_CONFIG;

let sessao = null;
let entrevista = null;
let passos = [];
let indiceAtual = 0;
let finalizando = false;

const areaPasso = document.getElementById("area-passo");
const btnVoltar = document.getElementById("btn-voltar");
const btnProxima = document.getElementById("btn-proxima");

// ---------------------------------------------------------------------------
// Inicialização / retomada
// ---------------------------------------------------------------------------

function novaEntrevista() {
  const agora = new Date().toISOString();
  return {
    session_id: gerarSessionId(),
    pesquisa_id: sessao.pesquisa_id,
    rodada_id: sessao.rodada_id,
    equipe_id: sessao.equipe_id,
    pesquisador: sessao.nome,
    status: "em_andamento",
    municipio: sessao.municipio,
    regiao: "",
    zona_eleitoral: "",
    sexo: null,
    faixa_etaria: null,
    escolaridade: null,
    local_coleta: null,
    consentimento: false,
    coletado_em: agora,
    duracao_seg: null,
    geo_lat: null,
    geo_lng: null,
    geo_accuracy: null,
    geo_status: "pendente",
    device_info: coletarDeviceInfo(),
    suspeita_duracao: false,
    respostas: {},
    ordem_opcoes: {},
    passo_atual: 0,
    sync_status: "local",
  };
}

function capturarGeolocalizacao() {
  if (!config.geolocalizacao?.habilitado || !("geolocation" in navigator)) return;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      entrevista.geo_lat = pos.coords.latitude;
      entrevista.geo_lng = pos.coords.longitude;
      entrevista.geo_accuracy = pos.coords.accuracy;
      entrevista.geo_status = "ok";
      await salvarEntrevista(entrevista);
    },
    async (err) => {
      entrevista.geo_status = err.code === err.PERMISSION_DENIED ? "negado" : "indisponivel";
      await salvarEntrevista(entrevista);
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
  );
}

async function inicializar() {
  sessao = await exigirLoginPesquisador();
  if (!sessao) return;

  registrarServiceWorker();
  iniciarIndicadorConexao();
  iniciarControleFonte();

  passos = getPassos(config, sessao);

  const params = new URLSearchParams(window.location.search);
  const sessionIdRetomada = params.get("session");

  if (sessionIdRetomada) {
    const existente = await obterEntrevista(sessionIdRetomada);
    if (existente && existente.status === "em_andamento") {
      entrevista = existente;
      indiceAtual = Math.min(entrevista.passo_atual || 0, passos.length - 1);
      await registrarEvento(EVENTOS.RETOMADA_ENTREVISTA, {
        entrevistaSessionId: entrevista.session_id,
        equipeId: sessao.equipe_id,
      });
    }
  }

  if (!entrevista) {
    entrevista = novaEntrevista();
    indiceAtual = 0;
    await salvarEntrevista(entrevista);
    await registrarEvento(EVENTOS.INICIO_ENTREVISTA, {
      entrevistaSessionId: entrevista.session_id,
      equipeId: sessao.equipe_id,
    });
    capturarGeolocalizacao();
  }

  renderizarPasso();
}

// ---------------------------------------------------------------------------
// Leitura/escrita do valor de cada passo no objeto `entrevista`
// ---------------------------------------------------------------------------

const CAMPOS_SOCIO_DIRETOS = {
  municipio: "municipio",
  regiao: "regiao",
  zona_eleitoral: "zona_eleitoral",
  sexo: "sexo",
  faixa_etaria: "faixa_etaria",
  escolaridade: "escolaridade",
  local_coleta: "local_coleta",
};

function lerValorAtual(passo) {
  if (passo.id === "consentimento") return entrevista.consentimento === true ? true : undefined;
  if (CAMPOS_SOCIO_DIRETOS[passo.id]) return entrevista[CAMPOS_SOCIO_DIRETOS[passo.id]] || undefined;
  // two_votes guarda o estado de seleção (ids, não texto) num namespace à
  // parte de `respostas` — `respostas` só pode conter o formato serializável
  // para o EAV (Seção 24), senão montarRespostasParaSync() geraria uma linha
  // espúria "q7" sem valor.
  if (passo.tipo === "two_votes" || passo.tipo === "multiple_choice") return (entrevista.estado_ui || {})[passo.id];
  const resp = entrevista.respostas[passo.id];
  if (!resp) return undefined;
  return resp.valorId ?? resp.valor;
}

function gravarValor(passo, valor, extra = {}) {
  if (passo.id === "consentimento") {
    entrevista.consentimento = valor === true;
    return;
  }
  if (CAMPOS_SOCIO_DIRETOS[passo.id]) {
    // Campos sociodemográficos viram colunas próprias em `entrevistas`
    // (Seção 23) e são usados em joins/filtros (cotas, dashboard) contra os
    // ids canônicos do config — por isso gravamos o id da opção (ex.:
    // "feminino"), nunca o rótulo exibido (ex.: "Feminino").
    entrevista[CAMPOS_SOCIO_DIRETOS[passo.id]] = extra.valorId ?? valor;
    return;
  }
  entrevista.respostas[passo.id] = { valor, ...extra };
}

const salvarComDebounce = debounce(() => salvarEntrevista(entrevista), 400);

// ---------------------------------------------------------------------------
// Renderização por tipo de passo
// ---------------------------------------------------------------------------

function renderizarPasso() {
  const passo = passos[indiceAtual];
  document.getElementById("titulo-passo").textContent =
    passo.grupo === "eleitoral" ? "Entrevista" : passo.grupo === "consentimento" ? "Consentimento" : "Perfil do entrevistado";
  document.getElementById("contador-passo").textContent = `${indiceAtual + 1} / ${passos.length}`;
  document.getElementById("barra-progresso").style.width = `${((indiceAtual + 1) / passos.length) * 100}%`;

  btnVoltar.disabled = indiceAtual === 0;
  btnProxima.textContent = indiceAtual === passos.length - 1 ? "FINALIZAR" : "PRÓXIMA";

  const valorAtual = lerValorAtual(passo);
  areaPasso.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "cartao";

  switch (passo.tipo) {
    case "consentimento":
      wrap.innerHTML = `
        <p class="pergunta-texto">Antes de começar</p>
        <div class="bloco-consentimento">${escapeHtml(passo.texto)}</div>
        <div class="grupo-botoes">
          <button class="btn btn-primario" id="btn-consentir">CONCORDO E CONTINUAR</button>
        </div>
        <button class="btn-texto mt-1" id="btn-nao-consentir">A pessoa não deseja participar</button>
      `;
      areaPasso.appendChild(wrap);
      document.getElementById("btn-consentir").addEventListener("click", async () => {
        gravarValor(passo, true);
        await salvarEntrevista(entrevista);
        avancar();
      });
      document.getElementById("btn-nao-consentir").addEventListener("click", () => {
        alert("Entrevista não iniciada — a pessoa optou por não participar. Volte ao início para uma nova abordagem.");
        window.location.href = "index.html";
      });
      break;

    case "info_municipio":
      wrap.innerHTML = `
        <p class="pergunta-texto">${escapeHtml(passo.texto)}</p>
        <div class="info-municipio-box">${escapeHtml(valorAtual || passo.valorPadrao || "-")}</div>
        <p class="pergunta-ajuda">Município definido pelo cadastro do pesquisador.</p>
      `;
      areaPasso.appendChild(wrap);
      if (!entrevista.municipio) gravarValor(passo, passo.valorPadrao);
      break;

    case "open_text_curto":
      wrap.innerHTML = `
        <p class="pergunta-texto">${escapeHtml(passo.texto)}</p>
        <div class="campo">
          <input type="text" id="input-texto-curto" maxlength="${passo.maxLength || 100}"
                 value="${escapeHtml(valorAtual || "")}" />
        </div>
      `;
      areaPasso.appendChild(wrap);
      document.getElementById("input-texto-curto").addEventListener("input", (e) => {
        gravarValor(passo, e.target.value);
        salvarComDebounce();
      });
      break;

    case "single_choice":
      renderizarSingleChoice(wrap, passo, valorAtual);
      areaPasso.appendChild(wrap);
      break;

    case "open_text":
      renderizarOpenText(wrap, passo, valorAtual);
      areaPasso.appendChild(wrap);
      break;

    case "two_votes":
      renderizarTwoVotes(wrap, passo, valorAtual);
      areaPasso.appendChild(wrap);
      break;

    case "multiple_choice":
      renderizarMultipleChoice(wrap, passo, valorAtual);
      areaPasso.appendChild(wrap);
      break;

    default:
      wrap.innerHTML = `<p class="pergunta-texto">${escapeHtml(passo.texto)}</p><p class="texto-suave">Tipo de pergunta não implementado.</p>`;
      areaPasso.appendChild(wrap);
  }
}

// obterOpcoesOrdenadas() calcula (e, na primeira vez, embaralha) a ordem de
// exibição e a grava em `entrevista.ordem_opcoes` em memória. Persistimos
// imediatamente aqui — e não só quando o pesquisador responde — porque senão
// um fechamento inesperado do app entre "mostrar a pergunta" e "marcar a
// resposta" perderia a ordem sorteada, e a retomada mostraria uma ordem
// diferente da que o entrevistado já viu (quebra a garantia da Seção 7).
function obterOpcoesOrdenadasPersistindo(passo) {
  const chaveAntes = JSON.stringify(entrevista.ordem_opcoes?.[passo.id] || null);
  const opcoes = obterOpcoesOrdenadas(passo, entrevista, config);
  const chaveDepois = JSON.stringify(entrevista.ordem_opcoes?.[passo.id] || null);
  if (chaveAntes !== chaveDepois) salvarEntrevista(entrevista);
  return opcoes;
}

function renderizarSingleChoice(wrap, passo, valorAtual) {
  const opcoes = obterOpcoesOrdenadasPersistindo(passo);
  wrap.innerHTML = `
    <p class="pergunta-texto">${escapeHtml(passo.texto)}</p>
    <div class="lista-opcoes">
      ${opcoes
        .map(
          (op, idx) => `
        <label class="opcao-escolha ${op.id === valorAtual ? "selecionada" : ""} ${op.id === config.NSNO_ID ? "nsno" : ""}"
               data-idx="${idx}">
          <input type="radio" name="opcao" value="${escapeHtml(op.id)}" ${op.id === valorAtual ? "checked" : ""} />
          ${escapeHtml(op.texto)}
        </label>`
        )
        .join("")}
    </div>
  `;
  wrap.querySelectorAll(".opcao-escolha").forEach((label) => {
    label.addEventListener("click", async () => {
      const idx = Number(label.dataset.idx);
      const op = opcoes[idx];
      wrap.querySelectorAll(".opcao-escolha").forEach((l) => l.classList.remove("selecionada"));
      label.classList.add("selecionada");
      gravarValor(passo, op.texto, { valorId: op.id, valorNum: op.valorNum ?? null, ordemExibicao: idx + 1 });
      await salvarEntrevista(entrevista);
    });
  });
}

function renderizarOpenText(wrap, passo, valorAtual) {
  wrap.innerHTML = `
    <p class="pergunta-texto">${escapeHtml(passo.texto)}</p>
    <div class="campo">
      <textarea id="input-aberto" maxlength="${passo.maxLength || 120}"
                placeholder="Digite a resposta espontânea...">${escapeHtml(valorAtual || "")}</textarea>
    </div>
    <div class="chips">
      ${(passo.atalhos || [])
        .map((a) => `<button type="button" class="chip ${valorAtual === a ? "selecionado" : ""}" data-atalho="${escapeHtml(a)}">${escapeHtml(a)}</button>`)
        .join("")}
    </div>
  `;
  const textarea = wrap.querySelector("#input-aberto");
  const gravarTexto = async (valor) => {
    gravarValor(passo, valor);
    wrap.querySelectorAll(".chip").forEach((c) => c.classList.toggle("selecionado", c.dataset.atalho === valor));
    await salvarEntrevista(entrevista);
  };
  textarea.addEventListener("input", (e) => {
    wrap.querySelectorAll(".chip").forEach((c) => c.classList.remove("selecionado"));
    gravarValor(passo, e.target.value);
    salvarComDebounce();
  });
  wrap.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      textarea.value = chip.dataset.atalho;
      gravarTexto(chip.dataset.atalho);
    });
  });
}

function renderizarMultipleChoice(wrap, passo, valorAtual) {
  const selecionadas = new Set(valorAtual || []);
  const opcoes = obterOpcoesOrdenadasPersistindo(passo);
  wrap.innerHTML = `
    <p class="pergunta-texto">${escapeHtml(passo.texto)}</p>
    <div class="lista-opcoes">
      ${opcoes
        .map(
          (op) => `
        <label class="opcao-escolha ${selecionadas.has(op.id) ? "selecionada" : ""}">
          <input type="checkbox" value="${escapeHtml(op.id)}" ${selecionadas.has(op.id) ? "checked" : ""} />
          ${escapeHtml(op.texto)}
        </label>`
        )
        .join("")}
    </div>
  `;
  wrap.querySelectorAll(".opcao-escolha").forEach((label) => {
    label.addEventListener("click", async (evt) => {
      if (evt.target.tagName !== "INPUT") evt.target.closest("label").querySelector("input").click();
      return;
    });
    label.querySelector("input").addEventListener("change", async (e) => {
      if (e.target.checked) selecionadas.add(e.target.value);
      else selecionadas.delete(e.target.value);
      label.classList.toggle("selecionada", e.target.checked);

      // `respostas` só guarda o formato serializável para o EAV (texto
      // juntando os rótulos escolhidos); os ids marcados vivem em
      // `estado_ui`, igual ao two_votes, para reconstruir os checkboxes
      // numa retomada sem virar uma linha inválida em `respostas`.
      const idsSelecionados = Array.from(selecionadas);
      const textos = opcoes.filter((op) => selecionadas.has(op.id)).map((op) => op.texto);
      entrevista.estado_ui = entrevista.estado_ui || {};
      entrevista.estado_ui[passo.id] = idsSelecionados;
      gravarValor(passo, textos.join(" | "));
      await salvarEntrevista(entrevista);
    });
  });
}

function renderizarTwoVotes(wrap, passo, valorAtual) {
  const opcoes = obterOpcoesOrdenadasPersistindo(passo);
  const votoAtual = valorAtual || { voto1: null, voto2: null };

  const opcaoHtml = (sufixo, votoSelecionado, votoOposto) =>
    opcoes
      .map((op) => {
        const bloqueado = op.id !== config.NSNO_ID && op.id === votoOposto;
        return `<option value="${escapeHtml(op.id)}" ${op.id === votoSelecionado ? "selected" : ""} ${bloqueado ? "disabled" : ""}>${escapeHtml(op.texto)}</option>`;
      })
      .join("");

  wrap.innerHTML = `
    <p class="pergunta-texto">${escapeHtml(passo.texto)}</p>
    <div class="voto-grupo">
      <h3>1º voto</h3>
      <select class="campo" id="select-voto1">
        <option value="">Selecione...</option>
        ${opcaoHtml("1", votoAtual.voto1, votoAtual.voto2)}
      </select>
    </div>
    <div class="voto-grupo">
      <h3>2º voto</h3>
      <select class="campo" id="select-voto2">
        <option value="">Selecione...</option>
        ${opcaoHtml("2", votoAtual.voto2, votoAtual.voto1)}
      </select>
    </div>
    <p class="erro-campo oculto" id="erro-voto-duplicado">O mesmo candidato não pode ser escolhido nos dois votos.</p>
  `;

  const s1 = wrap.querySelector("#select-voto1");
  const s2 = wrap.querySelector("#select-voto2");
  const erroEl = wrap.querySelector("#erro-voto-duplicado");

  const atualizar = async () => {
    const voto1 = s1.value || null;
    const voto2 = s2.value || null;
    const check = validarVotoDuplicado({ voto1, voto2 }, config.NSNO_ID);
    erroEl.classList.toggle("oculto", check.valido);
    if (!check.valido) return;

    const opcaoPorId = new Map(opcoes.map((o, idx) => [o.id, { ...o, ordem: idx + 1 }]));
    if (voto1) {
      const o = opcaoPorId.get(voto1);
      entrevista.respostas[`${passo.id}_1voto`] = { valor: o.texto, ordemExibicao: o.ordem };
    } else {
      delete entrevista.respostas[`${passo.id}_1voto`];
    }
    if (voto2) {
      const o = opcaoPorId.get(voto2);
      entrevista.respostas[`${passo.id}_2voto`] = { valor: o.texto, ordemExibicao: o.ordem };
    } else {
      delete entrevista.respostas[`${passo.id}_2voto`];
    }
    entrevista.estado_ui = entrevista.estado_ui || {};
    entrevista.estado_ui[passo.id] = { voto1, voto2 };
    await salvarEntrevista(entrevista);
    renderizarOpcoesDisponiveis();
  };

  function renderizarOpcoesDisponiveis() {
    Array.from(s1.options).forEach((op) => {
      op.disabled = op.value && op.value !== config.NSNO_ID && op.value === s2.value;
    });
    Array.from(s2.options).forEach((op) => {
      op.disabled = op.value && op.value !== config.NSNO_ID && op.value === s1.value;
    });
  }

  s1.addEventListener("change", atualizar);
  s2.addEventListener("change", atualizar);
  renderizarOpcoesDisponiveis();
}

// ---------------------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------------------

async function avancar() {
  const passo = passos[indiceAtual];
  const valor = lerValorAtual(passo);
  const check = validarResposta(passo, valor);
  if (!check.valido) {
    alert(check.mensagem);
    return;
  }

  if (indiceAtual === passos.length - 1) {
    await finalizarEntrevista();
    return;
  }

  indiceAtual++;
  entrevista.passo_atual = indiceAtual;
  await salvarEntrevista(entrevista);
  renderizarPasso();
  window.scrollTo(0, 0);
}

function voltar() {
  if (indiceAtual === 0) return;
  indiceAtual--;
  entrevista.passo_atual = indiceAtual;
  salvarEntrevista(entrevista);
  renderizarPasso();
  window.scrollTo(0, 0);
}

async function finalizarEntrevista() {
  if (finalizando) return; // evita duplo clique / duplo envio (Seção 27)
  finalizando = true;
  btnProxima.disabled = true;
  btnProxima.innerHTML = `<span class="spinner"></span> Finalizando...`;

  const agora = new Date().toISOString();
  entrevista.duracao_seg = calcularDuracaoSegundos(entrevista.coletado_em, agora);
  entrevista.suspeita_duracao = avaliarSuspeitaDuracao(entrevista.duracao_seg, config);
  entrevista.status = "completo";
  entrevista.sync_status = "pendente";
  await salvarEntrevista(entrevista);

  await registrarEvento(EVENTOS.FIM_ENTREVISTA, {
    entrevistaSessionId: entrevista.session_id,
    equipeId: sessao.equipe_id,
    metadata: { duracao_seg: entrevista.duracao_seg, suspeita_duracao: entrevista.suspeita_duracao },
  });

  mostrarTelaSucesso();

  // Sincronização é best-effort e não bloqueia a tela de sucesso — a
  // entrevista já está segura no IndexedDB independentemente do resultado.
  if (estaOnline()) sincronizarTudo();
}

function mostrarTelaSucesso() {
  document.getElementById("sucesso-codigo").textContent = "#" + codigoCurto(entrevista.session_id);
  const statusEl = document.getElementById("sucesso-status");

  if (estaOnline()) {
    document.getElementById("sucesso-titulo").textContent = "ENTREVISTA REGISTRADA";
    statusEl.innerHTML = `
      <p>✓ Salva neste dispositivo</p>
      <p id="linha-sync-status">↻ Enviando ao servidor...</p>
    `;
    window.addEventListener(
      "sync:fim",
      async () => {
        const linha = document.getElementById("linha-sync-status");
        if (!linha) return;
        // Reler do IndexedDB em vez de confiar na variável `entrevista` em
        // memória: js/sync.js opera sobre a sua própria cópia lida do banco
        // local (listarPendentesSync), então o objeto aqui nunca é mutado
        // por ele — só o registro salvo é que reflete o resultado real.
        const atual = await obterEntrevista(entrevista.session_id);
        linha.textContent =
          atual?.sync_status === "sincronizado" ? "✓ Sincronizada com o servidor" : "⚠ Ainda na fila — será reenviada automaticamente";
      },
      { once: true }
    );
  } else {
    document.getElementById("sucesso-titulo").textContent = "ENTREVISTA SALVA";
    statusEl.innerHTML = `
      <p>✓ Salva neste dispositivo</p>
      <p class="texto-suave">A entrevista está segura neste aparelho e será enviada automaticamente quando houver conexão.</p>
    `;
  }

  document.getElementById("rodape-navegacao").classList.add("oculto");
  document.getElementById("tela-sucesso").classList.remove("oculto");
}

btnVoltar.addEventListener("click", voltar);
btnProxima.addEventListener("click", avancar);
document.getElementById("btn-nova-apos-sucesso").addEventListener("click", () => {
  window.location.href = "coleta.html";
});
document.getElementById("btn-inicio-apos-sucesso").addEventListener("click", () => {
  window.location.href = "index.html";
});

inicializar();
