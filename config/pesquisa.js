// ============================================================================
// config/pesquisa.js
//
// Configuração declarativa da pesquisa eleitoral. Nada relacionado a
// candidatos, perguntas ou textos deve ser escrito diretamente na lógica do
// aplicativo (js/*.js) — tudo vem deste arquivo. Trocar de município
// (Gurupi, Palmas) ou atualizar candidatos significa editar este arquivo,
// nunca reescrever o motor.
// ============================================================================

const PESQUISA_CONFIG = {
  pesquisa: {
    nome: "Pesquisa Eleitoral Araguaína 2026",
    municipio: "Araguaína",
  },

  // Nome do prefeito atual, usado na pergunta Q12 via {{prefeito}}.
  prefeitoAtual: "Wagner Rodrigues",

  // ID sentinela usado em toda pergunta estimulada para representar
  // "Não sabe / Não opinou". Mantido fora das listas de candidatos abaixo
  // para que o motor sempre o adicione por último, sem randomizar.
  NSNO_ID: "nsno",
  NSNO_TEXTO: "Não sabe / Não opinou",

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
      { id: "apostolo_flavio_braga", texto: "Apóstolo Flávio Braga" },
      { id: "fabio_ribeiro", texto: "Fábio Ribeiro" },
      { id: "helio_rodrigues", texto: "Hélio Rodrigues" },
      { id: "nilton_santos", texto: "Nilton Santos" },
      { id: "osvani_luz", texto: "Osvani Luz" },
      { id: "professor_osvaldo", texto: "Professor Osvaldo" },
    ],
    deputadoFederal: [
      { id: "tiago_dimas", texto: "Tiago Dimas" },
      { id: "janad_valcari", texto: "Janad Valcari" },
      { id: "jair_farias", texto: "Jair Farias" },
      { id: "lucas_campelo", texto: "Lucas Campelo" },
      { id: "alfredo_junior", texto: "Alfredo Júnior" },
      { id: "sandoval_cardoso", texto: "Sandoval Cardoso" },
      { id: "irata_abreu", texto: "Iratã Abreu" },
      { id: "celio_moura", texto: "Célio Moura" },
      { id: "jorge_carneiro", texto: "Jorge Carneiro" },
      { id: "divina_betania", texto: "Divina Betânia" },
      { id: "delegada_sara", texto: "Delegada Sara" },
      { id: "samira_bezerra", texto: "Samira Bezerra" },
    ],
    deputadoEstadual: [
      { id: "jorge_frederico", texto: "Jorge Frederico" },
      { id: "valderez", texto: "Valderez" },
      { id: "marcus_marcelo", texto: "Marcus Marcelo" },
      { id: "eduardo_madruga", texto: "Eduardo Madruga" },
      { id: "elenil_da_penha", texto: "Elenil da Penha" },
      { id: "gipao", texto: "Gipão" },
      { id: "issan_saado", texto: "Issan Saado" },
      { id: "dra_angela", texto: "Dra. Ângela" },
      { id: "cezar_halum", texto: "Cézar Halum" },
      { id: "olynto_neto", texto: "Olynto Neto" },
      { id: "raul_cayres", texto: "Raul Cayres" },
      { id: "wilson_carvalho", texto: "Wilson Carvalho" },
      { id: "marcos_duarte", texto: "Marcos Duarte" },
      { id: "joao_rigo", texto: "João Rigo" },
      { id: "teciliano_gomes", texto: "Teciliano Gomes" },
      { id: "junior_diamantino", texto: "Júnior Diamantino" },
      { id: "kasarin", texto: "Kasarin" },
    ],
  },

  // --------------------------------------------------------------------
  // Questionário — array único e ordenado. O motor (js/questionario.js)
  // apenas itera esta lista; tipos suportados: single_choice, open_text,
  // two_votes.
  // --------------------------------------------------------------------
  perguntas: [
    {
      id: "q1",
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
      tipo: "single_choice",
      texto: "Se a eleição para Presidente fosse hoje, em qual destes candidatos você votaria?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "presidente",
    },
    {
      id: "q3",
      tipo: "single_choice",
      texto:
        "Pensando no segundo turno para Presidente, se a disputa fosse entre Lula e Flávio Bolsonaro, em quem você votaria?",
      obrigatoria: true,
      randomize: false,
      opcoesRef: "presidente2Turno",
    },
    {
      id: "q4",
      tipo: "open_text",
      texto: "Se a eleição fosse hoje, em quem você votaria para Governador(a) do Estado do Tocantins?",
      obrigatoria: true,
      maxLength: 120,
      atalhos: ["Não sabe", "Não opinou", "Nenhum", "Outro"],
    },
    {
      id: "q5",
      tipo: "single_choice",
      texto:
        "Em qual destes candidatos a Governador(a) do Estado do Tocantins você votaria?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "governador",
    },
    {
      id: "q6",
      tipo: "single_choice",
      texto:
        "Pensando no segundo turno para Governador do Estado do Tocantins, se a disputa fosse entre Professora Dorinha e Vicentinho Júnior, em quem você votaria?",
      obrigatoria: true,
      randomize: false,
      opcoesRef: "governador2Turno",
    },
    {
      id: "q7",
      tipo: "two_votes",
      texto:
        "Considerando que neste ano você terá a opção de escolher dois candidatos para o Senado Federal, qual seria seu primeiro e segundo voto se a eleição ocorresse hoje?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "senado",
      // O mesmo candidato REAL não pode ser 1º e 2º voto; NS/NO pode ser
      // escolhido em cada voto de forma independente.
      regraVotoDuplicado: "proibirMesmoCandidatoRealNosDoisVotos",
    },
    {
      id: "q8",
      tipo: "open_text",
      texto: "Se a eleição fosse hoje, em quem você votaria para Deputado Federal do Estado do Tocantins?",
      obrigatoria: true,
      maxLength: 120,
      atalhos: ["Não sabe", "Não opinou", "Nenhum", "Outro"],
    },
    {
      id: "q9",
      tipo: "single_choice",
      texto: "Em qual destes candidatos a Deputado Federal do Estado do Tocantins você votaria?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "deputadoFederal",
    },
    {
      id: "q10",
      tipo: "open_text",
      texto: "Se a eleição fosse hoje, em quem você votaria para Deputado Estadual do Tocantins?",
      obrigatoria: true,
      maxLength: 120,
      atalhos: ["Não sabe", "Não opinou", "Nenhum", "Outro"],
    },
    {
      id: "q11",
      tipo: "single_choice",
      texto: "Em qual destes candidatos a Deputado Estadual do Estado do Tocantins você votaria?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "deputadoEstadual",
    },
    {
      id: "q12",
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
