// ============================================================================
// config/pesquisa.js
//
// Configuração declarativa da pesquisa eleitoral. Nada relacionado a
// candidatos, perguntas, cotas ou parâmetros metodológicos deve ser escrito
// diretamente na lógica do aplicativo (js/*.js) — tudo vem deste arquivo.
// Trocar de rodada, atualizar candidatos ou ajustar o questionário significa
// editar este arquivo, nunca reescrever o motor.
//
// Campos marcados com TODO_CONFIGURAR dependem de definição da equipe
// metodológica/jurídica da Foccus Pesquisas e NÃO devem ser tratados como
// valores finais.
// ============================================================================

const PESQUISA_CONFIG = {
  // --------------------------------------------------------------------
  // Identificação da pesquisa / rodada
  // --------------------------------------------------------------------
  pesquisa: {
    nome: "Pesquisa Eleitoral Tocantins 2026",
    descricao: "Pesquisa de intenção de voto e avaliação de governo — Estado do Tocantins",
    estado: "TO",
  },

  // O código da rodada precisa bater com a coluna `rodadas.codigo` no Supabase.
  // A resolução real de pesquisa_id/rodada_id acontece no login (rpc_login),
  // este valor serve apenas de referência/fallback para exibição.
  rodadaCodigo: "RODADA_01",

  // --------------------------------------------------------------------
  // Metadados de metodologia / compliance (Seção 50 do briefing)
  // Nenhum destes valores é inventado. Enquanto a Foccus não fornecer os
  // parâmetros reais, o app exibe "não configurado" em vez de um número.
  // --------------------------------------------------------------------
  metodologia: {
    metodologiaResumo: "TODO_CONFIGURAR", // ex.: "Amostragem estratificada por cotas"
    responsavelTecnico: "TODO_CONFIGURAR",
    dataInicio: "TODO_CONFIGURAR",
    dataFim: "TODO_CONFIGURAR",
    amostraPlanejada: null, // número inteiro, definido pela Foccus
    margemErroPercentual: null, // não inventar; exibir "não configurado" se null
    nivelConfiancaPercentual: null,
    ponderacao: "TODO_CONFIGURAR",
    municipiosPesquisados: ["Palmas", "Araguaína", "Gurupi"], // TODO_CONFIGURAR: lista completa
    observacoes: "TODO_CONFIGURAR",
  },

  // --------------------------------------------------------------------
  // LGPD / consentimento (Seção 48)
  // --------------------------------------------------------------------
  consentimento: {
    obrigatorio: true,
    texto:
      "Esta é uma pesquisa de opinião pública conduzida pela Foccus Pesquisas. " +
      "Sua participação é voluntária e anônima. Não coletamos nome, CPF, telefone " +
      "ou endereço. Suas respostas serão usadas apenas para fins estatísticos, " +
      "de forma agregada. Você pode interromper a qualquer momento. " +
      "REVISÃO JURÍDICA NECESSÁRIA: este texto é um modelo provisório e deve " +
      "ser validado pela equipe jurídica/metodológica antes do uso em campo.",
  },

  // --------------------------------------------------------------------
  // GPS (Seção 30)
  // --------------------------------------------------------------------
  geolocalizacao: {
    habilitado: true,
    obrigatorio: false, // nunca bloquear a entrevista só por GPS negado, salvo decisão explícita
  },

  // --------------------------------------------------------------------
  // Cotas (Seção 19)
  // --------------------------------------------------------------------
  cotas: {
    bloquearAoAtingirCota: false, // false = permite registrar mesmo com cota cheia
    exibirParaPesquisador: true,
    dimensoes: ["municipio", "sexo", "faixaEtaria"], // combinação usada nas telas de cota
    alertaPercentual: 0.8, // limiar operacional (não estatístico) para status ALERTA
  },

  // --------------------------------------------------------------------
  // Controle de qualidade / auditoria (Seção 32)
  // Limite operacional para sinalizar (não bloquear/anular) entrevistas
  // suspeitas por duração. Ajustável pela supervisão.
  // --------------------------------------------------------------------
  auditoria: {
    duracaoMinimaSegundos: 90,
    duracaoMaximaSegundosAlerta: 3600,
    maxEntrevistasPorDispositivoPorDia: 40,
  },

  // --------------------------------------------------------------------
  // Dados sociodemográficos (Seção 18) — configuráveis, não fixos no código
  // --------------------------------------------------------------------
  sociodemografico: {
    sexo: {
      obrigatoria: true,
      opcoes: [
        { id: "masculino", texto: "Masculino" },
        { id: "feminino", texto: "Feminino" },
        { id: "outro", texto: "Outro" },
        { id: "nao_respondeu", texto: "Não respondeu" },
      ],
    },
    faixaEtaria: {
      obrigatoria: true,
      opcoes: [
        { id: "16-24", texto: "16 a 24 anos" },
        { id: "25-34", texto: "25 a 34 anos" },
        { id: "35-44", texto: "35 a 44 anos" },
        { id: "45-54", texto: "45 a 54 anos" },
        { id: "55-64", texto: "55 a 64 anos" },
        { id: "65+", texto: "65 anos ou mais" },
      ],
    },
    escolaridade: {
      obrigatoria: true,
      opcoes: [
        { id: "fundamental", texto: "Ensino Fundamental" },
        { id: "medio", texto: "Ensino Médio" },
        { id: "superior", texto: "Ensino Superior" },
        { id: "pos", texto: "Pós-graduação" },
        { id: "nao_respondeu", texto: "Não respondeu" },
      ],
    },
    localColeta: {
      obrigatoria: true,
      opcoes: [
        { id: "rua", texto: "Rua" },
        { id: "residencia", texto: "Residência" },
        { id: "ponto_fluxo", texto: "Ponto de fluxo" },
        { id: "comercio", texto: "Comércio" },
        { id: "outro", texto: "Outro" },
      ],
    },
    // Município vem travado do cadastro do pesquisador (equipe.municipio) por padrão.
    municipioEditavelPeloPesquisador: false,
    regiaoObrigatoria: true, // bairro/região — texto livre por enquanto (TODO_CONFIGURAR lista por município)
    zonaEleitoralObrigatoria: false,
  },

  // --------------------------------------------------------------------
  // Candidatos — única fonte de verdade para as perguntas estimuladas.
  // Alterar nomes/listas aqui nunca exige alterar js/questionario.js.
  // --------------------------------------------------------------------
  candidatos: {
    presidente: [
      { id: "lula", texto: "Lula" },
      { id: "flavio_bolsonaro", texto: "Flávio Bolsonaro" },
      { id: "ronaldo_caiado", texto: "Ronaldo Caiado" },
      { id: "romeu_zema", texto: "Romeu Zema" },
      { id: "renan_santos", texto: "Renan Santos" },
    ],
    presidente2Turno: [
      { id: "lula", texto: "Lula" },
      { id: "flavio_bolsonaro", texto: "Flávio Bolsonaro" },
    ],
    governador: [
      { id: "dorinha", texto: "Professora Dorinha" },
      { id: "vicentinho_junior", texto: "Vicentinho Júnior" },
      { id: "ataides_oliveira", texto: "Ataídes Oliveira" },
      { id: "laurez_moreira", texto: "Laurez Moreira" },
    ],
    governador2Turno: [
      { id: "dorinha", texto: "Professora Dorinha" },
      { id: "vicentinho_junior", texto: "Vicentinho Júnior" },
    ],
    senado: [
      { id: "eduardo_gomes", texto: "Eduardo Gomes" },
      { id: "carlos_gaguim", texto: "Carlos Gaguim" },
      { id: "alexandre_guimaraes", texto: "Alexandre Guimarães" },
      { id: "vanderlei_luxemburgo", texto: "Vanderlei Luxemburgo" },
      { id: "paulo_mourao", texto: "Paulo Mourão" },
      { id: "ronaldo_dimas", texto: "Ronaldo Dimas" },
      { id: "eli_borges", texto: "Eli Borges" },
    ],
    // TODO_CONFIGURAR — placeholders até a Foccus enviar a lista real de candidatos.
    deputadoFederal: [
      { id: "df01", texto: "Candidato 1" },
      { id: "df02", texto: "Candidato 2" },
      { id: "df03", texto: "Candidato 3" },
      { id: "df04", texto: "Candidato 4" },
      { id: "df05", texto: "Candidato 5" },
      { id: "df06", texto: "Candidato 6" },
      { id: "df07", texto: "Candidato 7" },
    ],
    // TODO_CONFIGURAR — placeholders até a Foccus enviar a lista real de candidatos.
    deputadoEstadual: [
      { id: "de01", texto: "Candidato 1" },
      { id: "de02", texto: "Candidato 2" },
      { id: "de03", texto: "Candidato 3" },
      { id: "de04", texto: "Candidato 4" },
      { id: "de05", texto: "Candidato 5" },
      { id: "de06", texto: "Candidato 6" },
      { id: "de07", texto: "Candidato 7" },
    ],
  },

  // TODO_CONFIGURAR — nome do prefeito atual, usado na pergunta Q12.
  prefeitoAtual: "XXXXXX",

  // ID sentinela usado em toda pergunta estimulada para representar
  // "Não sabe / Não opinou". Mantido fora das listas de candidatos acima
  // para que o motor sempre o adicione por último, sem randomizar.
  NSNO_ID: "nsno",
  NSNO_TEXTO: "Não sabe / Não opinou",

  // --------------------------------------------------------------------
  // Questionário — array único e ordenado. O motor (js/questionario.js)
  // apenas itera esta lista; tipos suportados: single_choice, multiple_choice,
  // open_text, two_votes, ranking.
  // --------------------------------------------------------------------
  perguntas: [
    {
      id: "q1",
      bloco: "eleitoral",
      tipo: "single_choice",
      texto: "Como você avalia o governo do Tocantins na gestão Wanderlei Barbosa?",
      obrigatoria: true,
      randomize: false,
      opcoes: [
        { id: "otimo", texto: "Ótimo", valorNum: 5 },
        { id: "bom", texto: "Bom", valorNum: 4 },
        { id: "regular", texto: "Regular", valorNum: 3 },
        { id: "ruim", texto: "Ruim", valorNum: 2 },
        { id: "pessimo", texto: "Péssimo", valorNum: 1 },
      ],
    },
    {
      id: "q2",
      bloco: "eleitoral",
      tipo: "single_choice",
      texto: "Se a eleição para Presidente fosse hoje, em qual destes candidatos você votaria?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "presidente", // resolve dinamicamente contra config.candidatos
    },
    {
      id: "q3",
      bloco: "eleitoral",
      tipo: "single_choice",
      texto:
        "Pensando no segundo turno para Presidente, se a disputa fosse entre Lula e Flávio Bolsonaro, em quem você votaria?",
      obrigatoria: true,
      randomize: false,
      opcoesRef: "presidente2Turno",
    },
    {
      id: "q4",
      bloco: "eleitoral",
      tipo: "open_text",
      texto: "Se a eleição fosse hoje, em quem você votaria para Governador(a) do Estado do Tocantins?",
      obrigatoria: true,
      maxLength: 120,
      atalhos: ["Não sabe", "Não opinou", "Nenhum", "Outro"],
    },
    {
      id: "q5",
      bloco: "eleitoral",
      tipo: "single_choice",
      texto:
        "Se a eleição fosse hoje, em qual destes candidatos a Governador(a) do Estado do Tocantins você votaria?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "governador",
    },
    {
      id: "q6",
      bloco: "eleitoral",
      tipo: "single_choice",
      texto:
        "Pensando no segundo turno para Governador do Estado do Tocantins, se a disputa fosse entre Professora Dorinha e Vicentinho Júnior, em quem você votaria?",
      obrigatoria: true,
      randomize: false,
      opcoesRef: "governador2Turno",
    },
    {
      id: "q7",
      bloco: "eleitoral",
      tipo: "two_votes",
      texto:
        "Considerando que neste ano você terá a opção de escolher dois candidatos para o Senado Federal, qual seria seu primeiro e segundo voto se a eleição ocorresse hoje?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "senado",
      // Regra explícita (Seção 12): NS/NO pode ser escolhido em cada voto de
      // forma independente. Só é proibido repetir o MESMO candidato real
      // como 1º e 2º voto.
      regraVotoDuplicado: "proibirMesmoCandidatoRealNosDoisVotos",
    },
    {
      id: "q8",
      bloco: "eleitoral",
      tipo: "open_text",
      texto: "Se a eleição fosse hoje, em quem você votaria para Deputado Federal do Estado do Tocantins?",
      obrigatoria: true,
      maxLength: 120,
      atalhos: ["Não sabe", "Não opinou", "Nenhum", "Outro"],
    },
    {
      id: "q9",
      bloco: "eleitoral",
      tipo: "single_choice",
      texto:
        "Se a eleição fosse hoje, e os candidatos a Deputado Federal do Tocantins fossem estes, em quem você votaria?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "deputadoFederal",
    },
    {
      id: "q10",
      bloco: "eleitoral",
      tipo: "open_text",
      texto: "Se a eleição fosse hoje, em quem você votaria para Deputado Estadual do TO?",
      obrigatoria: true,
      maxLength: 120,
      atalhos: ["Não sabe", "Não opinou", "Nenhum", "Outro"],
    },
    {
      id: "q11",
      bloco: "eleitoral",
      tipo: "single_choice",
      texto:
        "Se a eleição fosse hoje, e os candidatos a Deputado Estadual do Tocantins fossem estes, em quem você votaria?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "deputadoEstadual",
    },
    {
      id: "q12",
      bloco: "eleitoral",
      tipo: "single_choice",
      // {{prefeito}} é substituído em tempo de execução por config.prefeitoAtual
      texto: "Como você avalia a administração do atual prefeito {{prefeito}}?",
      obrigatoria: true,
      randomize: false,
      opcoes: [
        { id: "otima", texto: "Ótima", valorNum: 5 },
        { id: "boa", texto: "Boa", valorNum: 4 },
        { id: "regular", texto: "Regular", valorNum: 3 },
        { id: "ruim", texto: "Ruim", valorNum: 2 },
        { id: "pessima", texto: "Péssima", valorNum: 1 },
      ],
    },
  ],
};

// Disponibiliza tanto como módulo ES quanto como global (window),
// para permitir uso simples via <script> comum sem bundler.
if (typeof module !== "undefined" && module.exports) {
  module.exports = PESQUISA_CONFIG;
}
if (typeof window !== "undefined") {
  window.PESQUISA_CONFIG = PESQUISA_CONFIG;
}
