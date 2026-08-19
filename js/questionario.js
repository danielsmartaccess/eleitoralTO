// ============================================================================
// js/questionario.js — motor do questionário.
//
// Interpreta a configuração declarativa (config/pesquisa.js) e produz uma
// lista ordenada de "passos" (wizard, uma pergunta por tela — Seção 42),
// resolve candidatos/randomização, valida respostas e serializa o resultado
// no formato EAV usado pela tabela `respostas` (Seção 24).
//
// Tipos suportados hoje: consentimento, info_municipio, open_text_curto
// (campos sociodemográficos livres), single_choice, open_text, two_votes,
// multiple_choice, ranking. Novos tipos (likert, numeric, date, conditional)
// devem ser adicionados aqui como mais um `case`, sem tocar em coleta.js.
// ============================================================================

import { montarOpcoesComNSNO } from "./utils.js";

const TIPOS_ELEITORAL_COM_NSNO = new Set(["single_choice", "two_votes"]);

function resolverOpcoesReais(pergunta, config) {
  if (pergunta.opcoesRef) return config.candidatos[pergunta.opcoesRef] || [];
  if (pergunta.opcoes) return pergunta.opcoes;
  return [];
}

function interpolarTexto(texto, config) {
  return texto.replace(/\{\{\s*prefeito\s*\}\}/g, config.prefeitoAtual || "XXXXXX");
}

/** Monta a lista completa e ordenada de passos do wizard para uma entrevista. */
export function getPassos(config, sessao) {
  const passos = [];

  if (config.consentimento?.obrigatorio) {
    passos.push({
      id: "consentimento",
      grupo: "consentimento",
      tipo: "consentimento",
      texto: config.consentimento.texto,
      obrigatoria: true,
    });
  }

  const socio = config.sociodemografico;
  passos.push({
    id: "municipio",
    grupo: "socio",
    tipo: "info_municipio",
    texto: "Município da entrevista",
    obrigatoria: true,
    travado: !socio.municipioEditavelPeloPesquisador,
    valorPadrao: sessao?.municipio || "",
  });
  passos.push({
    id: "regiao",
    grupo: "socio",
    tipo: "open_text_curto",
    texto: "Região / bairro da entrevista",
    obrigatoria: !!socio.regiaoObrigatoria,
    maxLength: 80,
  });
  passos.push({
    id: "zona_eleitoral",
    grupo: "socio",
    tipo: "open_text_curto",
    texto: "Zona eleitoral (opcional)",
    obrigatoria: !!socio.zonaEleitoralObrigatoria,
    maxLength: 20,
  });
  passos.push({
    id: "sexo",
    grupo: "socio",
    tipo: "single_choice",
    texto: "Sexo do entrevistado",
    obrigatoria: !!socio.sexo.obrigatoria,
    opcoesReais: socio.sexo.opcoes,
    semNSNO: true,
  });
  passos.push({
    id: "faixa_etaria",
    grupo: "socio",
    tipo: "single_choice",
    texto: "Faixa etária do entrevistado",
    obrigatoria: !!socio.faixaEtaria.obrigatoria,
    opcoesReais: socio.faixaEtaria.opcoes,
    semNSNO: true,
  });
  passos.push({
    id: "escolaridade",
    grupo: "socio",
    tipo: "single_choice",
    texto: "Escolaridade do entrevistado",
    obrigatoria: !!socio.escolaridade.obrigatoria,
    opcoesReais: socio.escolaridade.opcoes,
    semNSNO: true,
  });
  passos.push({
    id: "local_coleta",
    grupo: "socio",
    tipo: "single_choice",
    texto: "Local da entrevista",
    obrigatoria: !!socio.localColeta.obrigatoria,
    opcoesReais: socio.localColeta.opcoes,
    semNSNO: true,
  });

  for (const pergunta of config.perguntas) {
    const passo = { ...pergunta, grupo: "eleitoral" };
    passo.texto = interpolarTexto(pergunta.texto, config);
    if (pergunta.tipo !== "open_text") {
      passo.opcoesReais = resolverOpcoesReais(pergunta, config);
    }
    passos.push(passo);
  }

  return passos;
}

/**
 * Retorna a lista de opções já ordenada para exibição (com NSNO por último
 * quando aplicável), calculando-a uma única vez por entrevista e reutilizando
 * em telas seguintes/retomadas. Muta `entrevista.ordem_opcoes` e devolve o
 * array pronto para renderizar — quem chama é responsável por persistir a
 * entrevista depois (mesma disciplina do salvamento progressivo).
 */
export function obterOpcoesOrdenadas(passo, entrevista, config) {
  if (!passo.opcoesReais) return [];

  entrevista.ordem_opcoes = entrevista.ordem_opcoes || {};

  if (entrevista.ordem_opcoes[passo.id]) {
    const idsSalvos = entrevista.ordem_opcoes[passo.id];
    const todas = passo.semNSNO
      ? passo.opcoesReais
      : [...passo.opcoesReais, { id: config.NSNO_ID, texto: config.NSNO_TEXTO }];
    const porId = new Map(todas.map((o) => [o.id, o]));
    return idsSalvos.map((id) => porId.get(id)).filter(Boolean);
  }

  const ordenadas = passo.semNSNO
    ? (passo.randomize ? [...passo.opcoesReais] : passo.opcoesReais)
    : montarOpcoesComNSNO(passo.opcoesReais, config.NSNO_ID, config.NSNO_TEXTO, !!passo.randomize);

  entrevista.ordem_opcoes[passo.id] = ordenadas.map((o) => o.id);
  return ordenadas;
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

export function validarResposta(passo, valor) {
  if (passo.tipo === "consentimento") {
    return valor === true
      ? { valido: true }
      : { valido: false, mensagem: "É necessário registrar o consentimento para continuar." };
  }

  if (!passo.obrigatoria) return { valido: true };

  switch (passo.tipo) {
    case "info_municipio":
      return valor ? { valido: true } : { valido: false, mensagem: "Município é obrigatório." };

    case "open_text_curto":
    case "open_text":
      return valor && valor.trim().length > 0
        ? { valido: true }
        : { valido: false, mensagem: "Este campo é obrigatório." };

    case "single_choice":
      return valor ? { valido: true } : { valido: false, mensagem: "Selecione uma opção para continuar." };

    case "multiple_choice":
      return Array.isArray(valor) && valor.length > 0
        ? { valido: true }
        : { valido: false, mensagem: "Selecione ao menos uma opção." };

    case "ranking":
      return Array.isArray(valor) && valor.length > 0
        ? { valido: true }
        : { valido: false, mensagem: "Ordene as opções para continuar." };

    case "two_votes": {
      if (!valor || !valor.voto1 || !valor.voto2) {
        return { valido: false, mensagem: "Selecione o 1º e o 2º voto para continuar." };
      }
      return validarVotoDuplicado(valor, "nsno");
    }

    default:
      return { valido: true };
  }
}

/**
 * Regra do Senado (Seção 12): o mesmo candidato REAL não pode ser 1º e 2º
 * voto simultaneamente. "Não sabe/Não opinou" é a exceção explícita — pode
 * ser escolhido nos dois votos de forma independente, porque não representa
 * um candidato disputando a própria vaga contra si mesmo.
 */
export function validarVotoDuplicado(valorDoisVotos, nsnoId) {
  const { voto1, voto2 } = valorDoisVotos;
  if (voto1 && voto2 && voto1 === voto2 && voto1 !== nsnoId) {
    return { valido: false, mensagem: "O mesmo candidato não pode ser escolhido como 1º e 2º voto." };
  }
  return { valido: true };
}

// ---------------------------------------------------------------------------
// Serialização para o formato EAV (tabela `respostas`)
// ---------------------------------------------------------------------------

/**
 * Converte as respostas do bloco eleitoral (armazenadas em
 * `entrevista.respostas`, um dicionário por id de passo) na lista plana que
 * será enviada ao Supabase. Os campos sociodemográficos NÃO entram aqui —
 * eles já viraram colunas próprias em `entrevistas` (Seção 23), então
 * ficariam duplicados e sem sentido no EAV.
 */
export function montarRespostasParaSync(entrevista) {
  const linhas = [];
  const respostas = entrevista.respostas || {};

  for (const [questao, dado] of Object.entries(respostas)) {
    linhas.push({
      questao,
      valor: dado.valor ?? null,
      valor_num: dado.valorNum ?? null,
      ordem_exibicao: dado.ordemExibicao ?? null,
    });
  }

  // Auditoria de randomização: a ordem completa exibida ao entrevistado em
  // cada pergunta estimulada, para permitir checar viés de posição depois.
  for (const [passoId, ordemIds] of Object.entries(entrevista.ordem_opcoes || {})) {
    linhas.push({
      questao: `${passoId}__ordem`,
      valor: ordemIds.join(","),
      valor_num: null,
      ordem_exibicao: null,
    });
  }

  return linhas;
}
