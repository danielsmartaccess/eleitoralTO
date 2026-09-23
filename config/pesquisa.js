// ============================================================================
// config/pesquisa.js
//
// Configuração declarativa da pesquisa eleitoral. Nada relacionado a
// candidatos, perguntas ou textos deve ser escrito diretamente na lógica do
// aplicativo (js/*.js) — tudo vem deste arquivo. Trocar de município
// (Araguaína, Palmas, ...) ou atualizar candidatos significa editar este
// arquivo, nunca reescrever o motor.
//
// O app cobre mais de um município na mesma instância: cada rodada vira uma
// entrada em PESQUISAS_CONFIG (por id) e o pesquisador escolhe qual delas usar
// na tela inicial (js/inicio.js). A escolha fica salva no aparelho
// (localStorage) e define window.PESQUISA_CONFIG, que é o que todo o resto do
// app (coleta/dashboard/relatório) consome.
// ============================================================================

// ID sentinela usado em toda pergunta estimulada para representar
// "Não sabe / Não opinou". Mantido fora das listas de candidatos para que o
// motor sempre o adicione por último, sem randomizar. Igual em toda pesquisa.
const NSNO_ID = "nsno";
const NSNO_TEXTO = "Não sabe / Não opinou";

// --------------------------------------------------------------------
// Disputas estaduais/nacionais — Presidente, Governador e Senado não mudam
// de um município para outro dentro do Tocantins, então as listas de
// candidatos são compartilhadas entre todas as pesquisas municipais.
// --------------------------------------------------------------------
const CANDIDATOS_ESTADUAIS_TOCANTINS = {
  presidente: [
    { id: "lula", texto: "Lula" },
    { id: "flavio_bolsonaro", texto: "Flávio Bolsonaro" },
    { id: "ronaldo_caiado", texto: "Ronaldo Caiado" },
    { id: "romeu_zema", texto: "Romeu Zema" },
    { id: "renan_santos", texto: "Renan Santos" },
    { id: "augusto_cury", texto: "Augusto Cury" },
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
};

// --------------------------------------------------------------------
// Questionário — array único e ordenado, igual em toda pesquisa municipal.
// O motor (js/questionario.js) apenas itera esta lista; tipos suportados:
// single_choice, open_text, two_votes. Uma função (não uma constante
// compartilhada) para que cada pesquisa tenha seu próprio array — nada aqui
// muda por município, mas evita qualquer risco de mutação cruzada.
// --------------------------------------------------------------------
function criarPerguntasPadrao() {
  return [
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
      atalhos: ["Não sabe", "Não opinou", "Nenhum"],
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
      atalhos: ["Não sabe", "Não opinou", "Nenhum"],
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
      atalhos: ["Não sabe", "Não opinou", "Nenhum"],
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
      texto: "Como você avalia a administração do(a) atual prefeito(a) {{prefeito}}?",
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
  ];
}

// --------------------------------------------------------------------
// Mapa semântico do questionário padrão (Tocantins) — usado pelo
// dashboard/relatório para saber qual id de pergunta representa cada
// disputa, em vez de assumir "q2 é sempre Presidente" etc. Necessário
// porque o questionário do Maranhão (ver PERGUNTAS_SEMANTICAS_MARANHAO)
// usa uma ordem diferente de perguntas para as mesmas disputas.
// --------------------------------------------------------------------
const PERGUNTAS_SEMANTICAS_PADRAO = {
  avaliacaoEstadual: "q1",
  presidente1Turno: "q2",
  presidente2Turno: "q3",
  governadorAberta: "q4",
  governadorEstimulada: "q5",
  governador2Turno: "q6",
  senado: "q7",
  depFederalAberta: "q8",
  depFederalEstimulada: "q9",
  depEstadualAberta: "q10",
  depEstadualEstimulada: "q11",
  avaliacaoPrefeito: "q12",
};

// --------------------------------------------------------------------
// Pesquisa: Araguaína 2026
// --------------------------------------------------------------------
const PESQUISA_ARAGUAINA = {
  id: "araguaina",
  pesquisa: {
    nome: "Pesquisa Eleitoral Araguaína 2026",
    municipio: "Araguaína",
  },
  // Coleta já encerrada neste município — some da tela de escolha de pesquisa
  // (js/inicio.js), mas segue disponível em dashboard/relatório para
  // consultar os dados já coletados (ver listarPesquisasParaColeta abaixo).
  ativoParaColeta: false,
  prefeitoAtual: "Wagner Rodrigues",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_TOCANTINS,
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
  perguntas: criarPerguntasPadrao(),
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_PADRAO,
};

// --------------------------------------------------------------------
// Pesquisa: Palmas 2026
// --------------------------------------------------------------------
const PESQUISA_PALMAS = {
  id: "palmas",
  pesquisa: {
    nome: "Pesquisa Eleitoral Palmas 2026",
    municipio: "Palmas",
  },
  ativoParaColeta: false,
  prefeitoAtual: "Eduardo Siqueira",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_TOCANTINS,
    deputadoFederal: [
      { id: "janad_valcari", texto: "Janad Valcari" },
      { id: "ricardo_ayres", texto: "Ricardo Ayres" },
      { id: "lucas_campelo", texto: "Lucas Campelo" },
      { id: "alfredo_junior", texto: "Alfredo Júnior" },
      { id: "jair_farias", texto: "Jair Farias" },
      { id: "sandoval_cardoso", texto: "Sandoval Cardoso" },
      { id: "felipe_martins", texto: "Felipe Martins" },
      { id: "irata_abreu", texto: "Iratã Abreu" },
      { id: "tiago_dimas", texto: "Tiago Dimas" },
      { id: "mauricio_buffon", texto: "Maurício Buffon" },
      { id: "celio_moura", texto: "Célio Moura" },
    ],
    deputadoEstadual: [
      { id: "carlos_amastha", texto: "Carlos Amastha" },
      { id: "moisemar_marinho", texto: "Moisemar Marinho" },
      { id: "eduardo_fortes", texto: "Eduardo Fortes" },
      { id: "professor_junior_geo", texto: "Professor Júnior Geo" },
      { id: "leo_barbosa", texto: "Léo Barbosa" },
      { id: "vanda_monteiro", texto: "Vanda Monteiro" },
      { id: "claudia_lelis", texto: "Cláudia Lelis" },
      { id: "eduardo_mantoan", texto: "Eduardo Mantoan" },
      { id: "valdemar_junior", texto: "Valdemar Júnior" },
      { id: "rubens_uchoa", texto: "Rubens Uchôa" },
      { id: "dulce_miranda", texto: "Dulce Miranda" },
      { id: "cleiton_cardoso", texto: "Cleiton Cardoso" },
      { id: "ivory_de_lira", texto: "Ivory de Lira" },
      { id: "toinho_andrade", texto: "Toinho Andrade" },
      { id: "marcos_junior", texto: "Marcos Júnior" },
      { id: "dr_vinicius_pires", texto: "Dr. Vinicius Pires" },
      { id: "marycats", texto: "MaryCats" },
      { id: "thiago_borges", texto: "Thiago Borges" },
      { id: "dian_carlos", texto: "Dian Carlos" },
      { id: "walter_viana", texto: "Walter Viana" },
      { id: "pastor_nelcivan", texto: "Pastor Nelcivan" },
    ],
  },
  perguntas: criarPerguntasPadrao(),
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_PADRAO,
};

// --------------------------------------------------------------------
// Pesquisa: Gurupi 2026
// --------------------------------------------------------------------
const PESQUISA_GURUPI = {
  id: "gurupi",
  pesquisa: {
    nome: "Pesquisa Eleitoral Gurupi 2026",
    municipio: "Gurupi",
  },
  ativoParaColeta: false,
  prefeitoAtual: "Josi Nunes",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_TOCANTINS,
    deputadoFederal: [
      { id: "luana_nunes", texto: "Luana Nunes" },
      { id: "fabio_vaz", texto: "Fabio Vaz" },
      { id: "felipe_martins", texto: "Felipe Martins" },
      { id: "sandoval_cardoso", texto: "Sandoval Cardoso" },
      { id: "irata", texto: "Iratã" },
      { id: "ricardo_ayres", texto: "Ricardo Ayres" },
      { id: "janad_valcari", texto: "Janad Valcari" },
      { id: "alfredo_junior", texto: "Alfredo Júnior" },
      { id: "jair_farias", texto: "Jair Farias" },
    ],
    deputadoEstadual: [
      { id: "eduardo_fortes", texto: "Eduardo Fortes" },
      { id: "gutierres", texto: "Gutierres" },
      { id: "eduardo_do_dertins", texto: "Eduardo do Dertins" },
      { id: "gleydson_nato", texto: "Gleydson Nato" },
      { id: "ivanilson", texto: "Ivanilson" },
      { id: "toinho_andrade", texto: "Toinho Andrade" },
      { id: "leo_barbosa", texto: "Léo Barbosa" },
      { id: "prof_junior_geo", texto: "Prof. Júnior Geo" },
      { id: "carlos_amastha", texto: "Carlos Amastha" },
      { id: "vanda_monteiro", texto: "Vanda Monteiro" },
      { id: "ivory_de_lira", texto: "Ivory de Lira" },
      { id: "claudia_lelis", texto: "Cláudia Lelis" },
      { id: "dulce_miranda", texto: "Dulce Miranda" },
      { id: "valdemar_junior", texto: "Valdemar Júnior" },
    ],
  },
  perguntas: criarPerguntasPadrao(),
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_PADRAO,
};

// --------------------------------------------------------------------
// Pesquisa: Porto Nacional 2026
// --------------------------------------------------------------------
const PESQUISA_PORTO_NACIONAL = {
  id: "porto_nacional",
  pesquisa: {
    nome: "Pesquisa Eleitoral Porto Nacional 2026",
    municipio: "Porto Nacional",
  },
  ativoParaColeta: false,
  prefeitoAtual: "Ronivon Maciel",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_TOCANTINS,
    deputadoFederal: [
      { id: "janad_valcari", texto: "Janad Valcari" },
      { id: "ricardo_ayres", texto: "Ricardo Ayres" },
      { id: "lucas_campelo", texto: "Lucas Campelo" },
      { id: "alfredo_junior", texto: "Alfredo Júnior" },
      { id: "jair_farias", texto: "Jair Farias" },
      { id: "sandoval_cardoso", texto: "Sandoval Cardoso" },
      { id: "felipe_martins", texto: "Felipe Martins" },
      { id: "irata_abreu", texto: "Iratã Abreu" },
      { id: "tiago_dimas", texto: "Tiago Dimas" },
      { id: "mauricio_buffon", texto: "Maurício Buffon" },
      { id: "celio_moura", texto: "Célio Moura" },
    ],
    deputadoEstadual: [
      { id: "valdemar_junior", texto: "Valdemar Júnior" },
      { id: "toinho_andrade", texto: "Toinho Andrade" },
      { id: "silvaney_rabelo", texto: "Silvaney Rabelo" },
      { id: "otoniel", texto: "Otoniel" },
      { id: "carlos_amastha", texto: "Carlos Amastha" },
      { id: "moisemar_marinho", texto: "Moisemar Marinho" },
      { id: "eduardo_fortes", texto: "Eduardo Fortes" },
      { id: "professor_junior_geo", texto: "Professor Júnior Geo" },
      { id: "leo_barbosa", texto: "Léo Barbosa" },
      { id: "vanda_monteiro", texto: "Vanda Monteiro" },
      { id: "claudia_lelis", texto: "Cláudia Lelis" },
      { id: "eduardo_mantoan", texto: "Eduardo Mantoan" },
      { id: "rubens_uchoa", texto: "Rubens Uchôa" },
      { id: "dulce_miranda", texto: "Dulce Miranda" },
      { id: "cleiton_cardoso", texto: "Cleiton Cardoso" },
      { id: "ivory_de_lira", texto: "Ivory de Lira" },
    ],
  },
  perguntas: criarPerguntasPadrao(),
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_PADRAO,
};

// --------------------------------------------------------------------
// Pesquisa: Paraíso do Tocantins 2026
// --------------------------------------------------------------------
const PESQUISA_PARAISO = {
  id: "paraiso",
  pesquisa: {
    nome: "Pesquisa Eleitoral Paraíso do Tocantins 2026",
    municipio: "Paraíso do Tocantins",
  },
  ativoParaColeta: false,
  prefeitoAtual: "Celso Morais",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_TOCANTINS,
    deputadoFederal: [
      { id: "janad_valcari", texto: "Janad Valcari" },
      { id: "fabio_vaz", texto: "Fábio Vaz" },
      { id: "osires_damaso", texto: "Osires Damaso" },
      { id: "sandoval_cardoso", texto: "Sandoval Cardoso" },
      { id: "ricardo_ayres", texto: "Ricardo Ayres" },
      { id: "lucas_campelo", texto: "Lucas Campelo" },
      { id: "alfredo_junior", texto: "Alfredo Júnior" },
      { id: "jair_farias", texto: "Jair Farias" },
      { id: "felipe_martins", texto: "Felipe Martins" },
      { id: "irata_abreu", texto: "Iratã Abreu" },
      { id: "tiago_dimas", texto: "Tiago Dimas" },
      { id: "mauricio_buffon", texto: "Maurício Buffon" },
      { id: "celio_moura", texto: "Célio Moura" },
    ],
    deputadoEstadual: [
      { id: "prof_deley", texto: "Prof. Deley" },
      { id: "nilton_franco", texto: "Nilton Franco" },
      { id: "carlos_amastha", texto: "Carlos Amastha" },
      { id: "valdemar_junior", texto: "Valdemar Júnior" },
      { id: "leo_barbosa", texto: "Léo Barbosa" },
      { id: "prof_junior_geo", texto: "Prof. Júnior Geo" },
      { id: "toinho_andrade", texto: "Toinho Andrade" },
      { id: "silvaney_rabelo", texto: "Silvaney Rabelo" },
      { id: "moisemar_marinho", texto: "Moisemar Marinho" },
      { id: "eduardo_fortes", texto: "Eduardo Fortes" },
      { id: "vanda_monteiro", texto: "Vanda Monteiro" },
      { id: "claudia_lelis", texto: "Cláudia Lelis" },
      { id: "eduardo_mantoan", texto: "Eduardo Mantoan" },
      { id: "rubens_uchoa", texto: "Rubens Uchôa" },
      { id: "dulce_miranda", texto: "Dulce Miranda" },
      { id: "cleiton_cardoso", texto: "Cleiton Cardoso" },
      { id: "ivory_de_lira", texto: "Ivory de Lira" },
    ],
  },
  perguntas: criarPerguntasPadrao(),
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_PADRAO,
};

// --------------------------------------------------------------------
// Disputas estaduais/nacionais — Maranhão. Compartilhadas entre todas as
// pesquisas municipais do MA, igual ao padrão do Tocantins acima.
// --------------------------------------------------------------------
const CANDIDATOS_ESTADUAIS_MARANHAO = {
  presidente: [
    { id: "lula", texto: "Lula" },
    { id: "flavio_bolsonaro", texto: "Flávio Bolsonaro" },
    { id: "ronaldo_caiado", texto: "Ronaldo Caiado" },
    { id: "romeu_zema", texto: "Romeu Zema" },
    { id: "augusto_cury", texto: "Augusto Cury" },
    { id: "renan_santos", texto: "Renan Santos" },
  ],
  presidente2Turno: [
    { id: "lula", texto: "Lula" },
    { id: "flavio_bolsonaro", texto: "Flávio Bolsonaro" },
  ],
  governador: [
    { id: "orleans_brandao", texto: "Orleans Brandão" },
    { id: "eduardo_braide", texto: "Eduardo Braide" },
    { id: "roberto_rocha", texto: "Roberto Rocha" },
    { id: "felipe_camarao", texto: "Felipe Camarão" },
  ],
  // Lista recebida em 2026-09-13; usuário sinalizou que ainda pode ajustar
  // esta relação (ver conversa) — conferir antes de abrir a coleta em campo.
  senado: [
    { id: "lahesio_bonfim", texto: "Lahésio Bonfim" },
    { id: "roseana_sarney", texto: "Roseana Sarney" },
    { id: "weverton_rocha", texto: "Weverton Rocha" },
    { id: "andre_fufuca", texto: "André Fufuca" },
    { id: "eliziane_gama", texto: "Eliziane Gama" },
    { id: "dr_hilton_goncalo", texto: "Dr. Hilton Gonçalo" },
    { id: "cidonio_goncalves", texto: "Cidônio Gonçalves" },
  ],
};

// --------------------------------------------------------------------
// Questionário padrão Maranhão — mesma lógica de criarPerguntasPadrao()
// acima, mas segue a ordem/formato do questionário aplicado no MA: inclui
// avaliação separada do governo Lula (q1) e do governo estadual (q2), e a
// pergunta sobre o(a) prefeito(a) é binária (aprova/desaprova), não em
// escala de 5 pontos.
// --------------------------------------------------------------------
function criarPerguntasPadraoMaranhao() {
  return [
    {
      id: "q1",
      tipo: "single_choice",
      texto: "Como você avalia o governo do Presidente Lula?",
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
      texto: "Como você avalia o governo do Maranhão na gestão Carlos Brandão?",
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
      id: "q3",
      tipo: "single_choice",
      texto: "Em qual destes candidatos a Presidente da República você votaria?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "presidente",
    },
    {
      id: "q4",
      tipo: "single_choice",
      texto:
        "Pensando no segundo turno, entre Lula e Flávio Bolsonaro, em quem você votaria?",
      obrigatoria: true,
      randomize: false,
      opcoesRef: "presidente2Turno",
    },
    {
      id: "q5",
      tipo: "open_text",
      texto: "Se a eleição fosse hoje, em quem você votaria para Governador do Estado do Maranhão?",
      obrigatoria: true,
      maxLength: 120,
      atalhos: ["Não sabe", "Não opinou", "Nenhum"],
    },
    {
      id: "q6",
      tipo: "single_choice",
      texto: "Em qual destes candidatos a Governador você votaria?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "governador",
    },
    {
      id: "q7",
      tipo: "two_votes",
      texto:
        "Considerando que neste ano você terá a opção de escolher dois candidatos para o Senado Federal, qual seria seu primeiro e segundo voto se a eleição ocorresse hoje?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "senado",
      regraVotoDuplicado: "proibirMesmoCandidatoRealNosDoisVotos",
    },
    {
      id: "q8",
      tipo: "open_text",
      texto: "Se a eleição fosse hoje, em quem você votaria para Deputado Federal do Estado do Maranhão?",
      obrigatoria: true,
      maxLength: 120,
      atalhos: ["Não sabe", "Não opinou", "Nenhum"],
    },
    {
      id: "q9",
      tipo: "single_choice",
      texto: "Em qual destes candidatos você votaria para Deputado Federal do Estado do Maranhão?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "deputadoFederal",
    },
    {
      id: "q10",
      tipo: "open_text",
      texto: "Se a eleição fosse hoje, em quem você votaria para Deputado(a) Estadual do Estado do Maranhão?",
      obrigatoria: true,
      maxLength: 120,
      atalhos: ["Não sabe", "Não opinou", "Nenhum"],
    },
    {
      id: "q11",
      tipo: "single_choice",
      texto: "Em qual destes candidatos você votaria para Deputado(a) Estadual do Estado do Maranhão?",
      obrigatoria: true,
      randomize: true,
      opcoesRef: "deputadoEstadual",
    },
    {
      id: "q12",
      tipo: "single_choice",
      // {{prefeito}} é substituído em tempo de execução por config.prefeitoAtual
      texto: "Você aprova ou desaprova a atual administração do(a) prefeito(a) {{prefeito}}?",
      obrigatoria: true,
      randomize: false,
      opcoes: [
        { id: "aprova", texto: "Aprova" },
        { id: "desaprova", texto: "Desaprova" },
      ],
    },
  ];
}

// --------------------------------------------------------------------
// Mapa semântico do questionário padrão do Maranhão — mesma finalidade de
// PERGUNTAS_SEMANTICAS_PADRAO, mas seguindo a ordem própria do MA: inclui
// "avaliacaoPresidente" (exclusiva do MA) e não tem "governador2Turno"
// (o MA não pergunta 2º turno para Governador).
// --------------------------------------------------------------------
const PERGUNTAS_SEMANTICAS_MARANHAO = {
  avaliacaoPresidente: "q1",
  avaliacaoEstadual: "q2",
  presidente1Turno: "q3",
  presidente2Turno: "q4",
  governadorAberta: "q5",
  governadorEstimulada: "q6",
  senado: "q7",
  depFederalAberta: "q8",
  depFederalEstimulada: "q9",
  depEstadualAberta: "q10",
  depEstadualEstimulada: "q11",
  avaliacaoPrefeito: "q12",
};

// --------------------------------------------------------------------
// Pesquisa: São Bernardo (MA) 2026
// --------------------------------------------------------------------
const PESQUISA_SAO_BERNARDO_MA = {
  id: "sao_bernardo_ma",
  pesquisa: {
    nome: "Pesquisa Eleitoral São Bernardo (MA) 2026",
    municipio: "São Bernardo",
  },
  // Coleta já encerrada neste município — some da tela de escolha de pesquisa
  // (js/inicio.js), mas segue disponível em dashboard/relatório para
  // consultar os dados já coletados (ver listarPesquisasParaColeta abaixo).
  ativoParaColeta: false,
  prefeitoAtual: "Chico Carvalho",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_MARANHAO,
    deputadoFederal: [
      { id: "hildo_rocha", texto: "Hildo Rocha" },
      { id: "erlanio_xavier", texto: "Erlânio Xavier" },
      { id: "aldir_junior", texto: "Aldir Júnior" },
      { id: "ze_carlos_da_caixa", texto: "Zé Carlos da Caixa" },
      { id: "fernando_braide", texto: "Fernando Braide" },
    ],
    deputadoEstadual: [
      { id: "joao_igor", texto: "João Igor" },
      { id: "aluisio_santos", texto: "Aluísio Santos" },
      { id: "leandro_belo", texto: "Leandro Belo" },
      { id: "marcos_caldas", texto: "Marcos Caldas" },
      { id: "gilvan_do_pt", texto: "Gilvan do PT" },
    ],
  },
  perguntas: criarPerguntasPadraoMaranhao(),
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_MARANHAO,
};

// --------------------------------------------------------------------
// Pesquisa: Magalhães de Almeida (MA) 2026
// --------------------------------------------------------------------
const PESQUISA_MAGALHAES_ALMEIDA_MA = {
  id: "magalhaes_almeida_ma",
  pesquisa: {
    nome: "Pesquisa Eleitoral Magalhães de Almeida (MA) 2026",
    municipio: "Magalhães de Almeida",
  },
  // Coleta já encerrada neste município — some da tela de escolha de pesquisa
  // (js/inicio.js), mas segue disponível em dashboard/relatório para
  // consultar os dados já coletados (ver listarPesquisasParaColeta abaixo).
  ativoParaColeta: false,
  prefeitoAtual: "Nonato Carvalho",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_MARANHAO,
    deputadoFederal: [
      { id: "hildo_rocha", texto: "Hildo Rocha" },
      { id: "aldir_junior", texto: "Aldir Júnior" },
      { id: "otelino_neto", texto: "Otelino Neto" },
      { id: "iracema_vale", texto: "Iracema Vale" },
      { id: "dr_yglesio", texto: "Dr. Yglésio" },
      { id: "erlanio_xavier", texto: "Erlânio Xavier" },
    ],
    deputadoEstadual: [
      { id: "joao_igor", texto: "João Igor" },
      { id: "ivo_resende", texto: "Ivo Resende" },
      { id: "marcos_caldas", texto: "Marcos Caldas" },
      { id: "tulio_resende", texto: "Túlio Resende" },
      { id: "ana_do_gas", texto: "Ana do Gás" },
      { id: "aluisio_santos", texto: "Aluísio Santos" },
    ],
  },
  // q13 é exclusiva de Magalhães de Almeida (não faz parte do questionário
  // padrão do Maranhão, então não aparece em São Bernardo).
  perguntas: [
    ...criarPerguntasPadraoMaranhao(),
    {
      id: "q13",
      tipo: "open_text",
      texto:
        "Em relação às eleições municipais de 2028, quem você acha que seria um bom nome para ser o(a) próximo(a) prefeito(a) de Magalhães de Almeida?",
      obrigatoria: true,
      maxLength: 120,
      atalhos: ["Não sabe", "Não opinou", "Nenhum"],
    },
  ],
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_MARANHAO,
};

// --------------------------------------------------------------------
// Pesquisa: Araioses (MA) 2026
// --------------------------------------------------------------------
const PESQUISA_ARAIOSES_MA = {
  id: "araioses_ma",
  pesquisa: {
    nome: "Pesquisa Eleitoral Araioses (MA) 2026",
    municipio: "Araioses",
  },
  // Coleta já encerrada neste município — some da tela de escolha de pesquisa
  // (js/inicio.js), mas segue disponível em dashboard/relatório para
  // consultar os dados já coletados (ver listarPesquisasParaColeta abaixo).
  ativoParaColeta: false,
  prefeitoAtual: "Neto Carvalho",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_MARANHAO,
    deputadoFederal: [
      { id: "pedro_lucas_fernandes", texto: "Pedro Lucas Fernandes" },
      { id: "hildo_rocha", texto: "Hildo Rocha" },
      { id: "erlanio_xavier", texto: "Erlânio Xavier" },
      { id: "aldir_junior", texto: "Aldir Júnior" },
    ],
    deputadoEstadual: [
      { id: "joao_igor", texto: "João Igor" },
      { id: "paulo_case", texto: "Paulo Casé" },
      { id: "abigail_cunha", texto: "Abigail Cunha" },
      { id: "claudio_cunha", texto: "Cláudio Cunha" },
      { id: "adelson_soares", texto: "Adelson Soares" },
    ],
  },
  perguntas: criarPerguntasPadraoMaranhao(),
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_MARANHAO,
};

// --------------------------------------------------------------------
// Pesquisa: Tutóia (MA) 2026
// --------------------------------------------------------------------
const PESQUISA_TUTOIA_MA = {
  id: "tutoia_ma",
  pesquisa: {
    nome: "Pesquisa Eleitoral Tutóia (MA) 2026",
    municipio: "Tutóia",
  },
  // Coleta já encerrada neste município — some da tela de escolha de pesquisa
  // (js/inicio.js), mas segue disponível em dashboard/relatório para
  // consultar os dados já coletados (ver listarPesquisasParaColeta abaixo).
  ativoParaColeta: false,
  prefeitoAtual: "Viriato Cardoso",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_MARANHAO,
    deputadoFederal: [
      { id: "hildo_rocha", texto: "Hildo Rocha" },
      { id: "aldir_junior", texto: "Aldir Júnior" },
      { id: "vinicius_ferro", texto: "Vinícius Ferro" },
      { id: "cleber_verde", texto: "Cléber Verde" },
      { id: "erlanio_xavier", texto: "Erlânio Xavier" },
      { id: "iracema_vale", texto: "Iracema Vale" },
      { id: "larissa_dp", texto: "Larissa DP" },
      { id: "junior_lourenco", texto: "Júnior Lourenço" },
    ],
    deputadoEstadual: [
      { id: "joao_igor", texto: "João Igor" },
      { id: "aluisio_santos", texto: "Aluísio Santos" },
      { id: "ze_farias", texto: "Zé Farias" },
      { id: "paula_prata", texto: "Paula Prata" },
      { id: "claudia_coutinho", texto: "Cláudia Coutinho" },
    ],
  },
  perguntas: criarPerguntasPadraoMaranhao(),
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_MARANHAO,
};

// --------------------------------------------------------------------
// Pesquisa: Santa Quitéria do Maranhão (MA) 2026
// --------------------------------------------------------------------
const PESQUISA_SANTA_QUITERIA_MA = {
  id: "santa_quiteria_ma",
  pesquisa: {
    nome: "Pesquisa Eleitoral Santa Quitéria do Maranhão (MA) 2026",
    municipio: "Santa Quitéria do Maranhão",
  },
  // Coleta já encerrada neste município — some da tela de escolha de pesquisa
  // (js/inicio.js), mas segue disponível em dashboard/relatório para
  // consultar os dados já coletados (ver listarPesquisasParaColeta abaixo).
  ativoParaColeta: false,
  prefeitoAtual: "Sâmia Moreira",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_MARANHAO,
    deputadoFederal: [
      { id: "hildo_rocha", texto: "Hildo Rocha" },
      { id: "erlanio_xavier", texto: "Erlânio Xavier" },
      { id: "dr_joel", texto: "Dr. Joel" },
    ],
    deputadoEstadual: [
      { id: "joao_igor", texto: "João Igor" },
      { id: "ze_farias", texto: "Zé Farias" },
      { id: "junior_viana", texto: "Júnior Viana" },
      { id: "dino_aldenora_belo", texto: "Dino Aldenora Belo" },
    ],
  },
  // q13 é exclusiva de Santa Quitéria do Maranhão (não faz parte do
  // questionário padrão do Maranhão).
  perguntas: [
    ...criarPerguntasPadraoMaranhao(),
    {
      id: "q13",
      tipo: "open_text",
      texto:
        "Em relação às eleições municipais de 2028, quem você acha que seria um bom nome para ser o(a) próximo(a) prefeito(a) de Santa Quitéria do Maranhão?",
      obrigatoria: true,
      maxLength: 120,
      atalhos: ["Não sabe", "Não opinou", "Nenhum"],
    },
  ],
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_MARANHAO,
};

// --------------------------------------------------------------------
// Pesquisa: Água Doce do Maranhão (MA) 2026
// --------------------------------------------------------------------
const PESQUISA_AGUA_DOCE_DO_MARANHAO_MA = {
  id: "agua_doce_do_maranhao_ma",
  pesquisa: {
    nome: "Pesquisa Eleitoral Água Doce do Maranhão (MA) 2026",
    municipio: "Água Doce do Maranhão",
  },
  // Coleta já encerrada neste município — some da tela de escolha de pesquisa
  // (js/inicio.js), mas segue disponível em dashboard/relatório para
  // consultar os dados já coletados (ver listarPesquisasParaColeta abaixo).
  ativoParaColeta: false,
  prefeitoAtual: "Eliane Dias",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_MARANHAO,
    deputadoFederal: [
      { id: "hildo_rocha", texto: "Hildo Rocha" },
      { id: "iracema_vale", texto: "Iracema Vale" },
      { id: "pedro_lucas_fernandes", texto: "Pedro Lucas Fernandes" },
      { id: "erlanio_xavier", texto: "Erlânio Xavier" },
      { id: "adriana_mascarenhas", texto: "Adriana Mascarenhas" },
      { id: "aldir_junior", texto: "Aldir Júnior" },
      { id: "adael_da_pesca", texto: "Adael da Pesca" },
      { id: "bira_do_pindare", texto: "Bira do Pindaré" },
      { id: "vinicius_ferro", texto: "Vinícius Ferro" },
    ],
    deputadoEstadual: [
      { id: "joao_igor", texto: "João Igor" },
      { id: "abigail_cunha", texto: "Abigail Cunha" },
      { id: "adelmo_soares", texto: "Adelmo Soares" },
      { id: "aluisio_santos", texto: "Aluísio Santos" },
      { id: "dr_kaio_hortegal", texto: "Dr. Kaio Hortegal" },
      { id: "adriana_mendes", texto: "Adriana Mendes" },
      { id: "claudio_cunha", texto: "Cláudio Cunha" },
      { id: "bruna_pessoa", texto: "Bruna Pessoa" },
      { id: "antonio_pereira", texto: "Antônio Pereira" },
    ],
  },
  perguntas: criarPerguntasPadraoMaranhao(),
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_MARANHAO,
};

// --------------------------------------------------------------------
// Pesquisa: Chapadinha (MA) 2026
// --------------------------------------------------------------------
const PESQUISA_CHAPADINHA_MA = {
  id: "chapadinha_ma",
  pesquisa: {
    nome: "Pesquisa Eleitoral Chapadinha (MA) 2026",
    municipio: "Chapadinha",
  },
  // Coleta já encerrada neste município — some da tela de escolha de pesquisa
  // (js/inicio.js), mas segue disponível em dashboard/relatório para
  // consultar os dados já coletados (ver listarPesquisasParaColeta abaixo).
  ativoParaColeta: false,
  prefeitoAtual: "Belezinha",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_MARANHAO,
    deputadoFederal: [
      { id: "hildo_rocha", texto: "Hildo Rocha" },
      { id: "iracema_vale", texto: "Iracema Vale" },
      { id: "fabiana_vilar", texto: "Fabiana Vilar" },
      { id: "junior_lourenco", texto: "Júnior Lourenço" },
      { id: "larissa_dp", texto: "Larissa DP" },
      { id: "cleber_verde", texto: "Cléber Verde" },
      { id: "vinicius_ferro", texto: "Vinícius Ferro" },
      { id: "dra_gisele_bezerra", texto: "Dra. Gisele Bezerra" },
      { id: "wandrian", texto: "Wandrian" },
      { id: "garreto", texto: "Garreto" },
    ],
    deputadoEstadual: [
      { id: "aluisio_santos", texto: "Aluísio Santos" },
      { id: "marcos_caldas", texto: "Marcos Caldas" },
      { id: "catule", texto: "Catulé" },
      { id: "joao_igor", texto: "João Igor" },
      { id: "kaio_hortegal", texto: "Kaio Hortegal" },
      { id: "bruna_pessoa", texto: "Bruna Pessoa" },
      { id: "claudio_cunha", texto: "Cláudio Cunha" },
    ],
  },
  // q13 é exclusiva de Chapadinha (não faz parte do questionário padrão do
  // Maranhão), no mesmo formato já usado em Magalhães de Almeida e Santa
  // Quitéria do Maranhão.
  perguntas: [
    ...criarPerguntasPadraoMaranhao(),
    {
      id: "q13",
      tipo: "open_text",
      texto:
        "Em relação às eleições municipais de 2028, quem você acha que seria um bom nome para ser o(a) próximo(a) prefeito(a) de Chapadinha?",
      obrigatoria: true,
      maxLength: 120,
      atalhos: ["Não sabe", "Não opinou", "Nenhum"],
    },
  ],
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_MARANHAO,
};

// --------------------------------------------------------------------
// Pesquisa: Brejo (MA) 2026
// --------------------------------------------------------------------
const PESQUISA_BREJO_MA = {
  id: "brejo_ma",
  pesquisa: {
    nome: "Pesquisa Eleitoral Brejo (MA) 2026",
    municipio: "Brejo",
  },
  // Coleta já encerrada neste município — some da tela de escolha de pesquisa
  // (js/inicio.js), mas segue disponível em dashboard/relatório para
  // consultar os dados já coletados (ver listarPesquisasParaColeta abaixo).
  ativoParaColeta: false,
  prefeitoAtual: "Thâmara Castro",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_MARANHAO,
    deputadoFederal: [
      { id: "rubens_junior", texto: "Rubens Júnior" },
      { id: "junior_moraes", texto: "Júnior Moraes" },
      { id: "hildo_rocha", texto: "Hildo Rocha" },
      { id: "iracema_vale", texto: "Iracema Vale" },
      { id: "junior_lourenco", texto: "Júnior Lourenço" },
      { id: "larissa_dp", texto: "Larissa DP" },
      { id: "cleber_verde", texto: "Cléber Verde" },
      { id: "vinicius_ferro", texto: "Vinícius Ferro" },
      { id: "dra_gisele_bezerra", texto: "Dra. Gisele Bezerra" },
    ],
    deputadoEstadual: [
      { id: "aluisio_santos", texto: "Aluísio Santos" },
      { id: "ze_farias", texto: "Zé Farias" },
      { id: "marcos_caldas", texto: "Marcos Caldas" },
      { id: "catule", texto: "Catulé" },
      { id: "joao_igor", texto: "João Igor" },
      { id: "kaio_hortegal", texto: "Kaio Hortegal" },
      { id: "bruna_pessoa", texto: "Bruna Pessoa" },
    ],
  },
  // Sem pergunta municipal de 2028: o instrumento de Brejo termina na q12
  // (aprovação da prefeita), como em São Bernardo, Araioses e Tutóia.
  perguntas: criarPerguntasPadraoMaranhao(),
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_MARANHAO,
};

// --------------------------------------------------------------------
// Pesquisa: Mata Roma (MA) 2026
// --------------------------------------------------------------------
const PESQUISA_MATA_ROMA_MA = {
  id: "mata_roma_ma",
  pesquisa: {
    nome: "Pesquisa Eleitoral Mata Roma (MA) 2026",
    municipio: "Mata Roma",
  },
  // Coleta já encerrada neste município — some da tela de escolha de pesquisa
  // (js/inicio.js), mas segue disponível em dashboard/relatório para
  // consultar os dados já coletados (ver listarPesquisasParaColeta abaixo).
  ativoParaColeta: false,
  prefeitoAtual: "Besaliel",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_MARANHAO,
    deputadoFederal: [
      { id: "rubens_junior", texto: "Rubens Júnior" },
      { id: "erlanio_xavier", texto: "Erlânio Xavier" },
      { id: "hildo_rocha", texto: "Hildo Rocha" },
      { id: "iracema_vale", texto: "Iracema Vale" },
      { id: "junior_lourenco", texto: "Júnior Lourenço" },
      { id: "larissa_dp", texto: "Larissa DP" },
      { id: "cleber_verde", texto: "Cléber Verde" },
      { id: "vinicius_ferro", texto: "Vinícius Ferro" },
      { id: "dra_gisele_bezerra", texto: "Dra. Gisele Bezerra" },
    ],
    deputadoEstadual: [
      { id: "aluisio_santos", texto: "Aluísio Santos" },
      { id: "ze_farias", texto: "Zé Farias" },
      { id: "marcos_caldas", texto: "Marcos Caldas" },
      { id: "catule", texto: "Catulé" },
      { id: "joao_igor", texto: "João Igor" },
      { id: "kaio_hortegal", texto: "Kaio Hortegal" },
      { id: "bruna_pessoa", texto: "Bruna Pessoa" },
      { id: "glinoel_garreto", texto: "Glinoel Garreto" },
    ],
  },
  // q13 é exclusiva de Mata Roma (não faz parte do questionário padrão do
  // Maranhão), no mesmo formato já usado em Magalhães de Almeida, Santa
  // Quitéria do Maranhão e Chapadinha.
  perguntas: [
    ...criarPerguntasPadraoMaranhao(),
    {
      id: "q13",
      tipo: "open_text",
      texto:
        "Em relação às eleições municipais de 2028, quem você acha que seria um bom nome para ser o(a) próximo(a) prefeito(a) de Mata Roma-MA?",
      obrigatoria: true,
      maxLength: 120,
      atalhos: ["Não sabe", "Não opinou", "Nenhum"],
    },
  ],
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_MARANHAO,
};

// --------------------------------------------------------------------
// Pesquisa: Vargem Grande (MA) 2026
// --------------------------------------------------------------------
const PESQUISA_VARGEM_GRANDE_MA = {
  id: "vargem_grande_ma",
  pesquisa: {
    nome: "Pesquisa Eleitoral Vargem Grande (MA) 2026",
    municipio: "Vargem Grande",
  },
  ativoParaColeta: true,
  prefeitoAtual: "Preto",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_MARANHAO,
    deputadoFederal: [
      { id: "juliana", texto: "Juliana" },
      { id: "otelino_neto", texto: "Otelino Neto" },
      { id: "aldir_junior", texto: "Aldir Júnior" },
      { id: "fabiana_vilar", texto: "Fabiana Vilar" },
      { id: "erlanio_xavier", texto: "Erlânio Xavier" },
      { id: "hildo_rocha", texto: "Hildo Rocha" },
      { id: "iracema_vale", texto: "Iracema Vale" },
      { id: "junior_lourenco", texto: "Júnior Lourenço" },
      { id: "larissa_dp", texto: "Larissa DP" },
      { id: "cleber_verde", texto: "Cléber Verde" },
      { id: "vinicius_ferro", texto: "Vinícius Ferro" },
      { id: "dra_gisele_bezerra", texto: "Dra. Gisele Bezerra" },
    ],
    deputadoEstadual: [
      { id: "aluisio_santos", texto: "Aluísio Santos" },
      { id: "ze_farias", texto: "Zé Farias" },
      { id: "marcos_caldas", texto: "Marcos Caldas" },
      { id: "catule", texto: "Catulé" },
      { id: "antonio_pereira", texto: "Antônio Pereira" },
      { id: "joao_igor", texto: "João Igor" },
      { id: "kaio_hortegal", texto: "Kaio Hortegal" },
      { id: "bruna_pessoa", texto: "Bruna Pessoa" },
      { id: "glinoel_garreto", texto: "Glinoel Garreto" },
    ],
  },
  perguntas: criarPerguntasPadraoMaranhao(),
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_MARANHAO,
};

// --------------------------------------------------------------------
// Pesquisa: Itapecuru Mirim (MA) 2026
// --------------------------------------------------------------------
const PESQUISA_ITAPECURU_MIRIM_MA = {
  id: "itapecuru_mirim_ma",
  pesquisa: {
    nome: "Pesquisa Eleitoral Itapecuru Mirim (MA) 2026",
    municipio: "Itapecuru Mirim",
  },
  ativoParaColeta: true,
  prefeitoAtual: "Filipe Marreca",
  NSNO_ID,
  NSNO_TEXTO,
  candidatos: {
    ...CANDIDATOS_ESTADUAIS_MARANHAO,
    deputadoFederal: [
      { id: "hildo_rocha", texto: "Hildo Rocha" },
      { id: "marreca", texto: "Marreca" },
      { id: "coroba", texto: "Coroba" },
      { id: "junior_lourenco", texto: "Júnior Lourenço" },
      { id: "bira_do_pindare", texto: "Bira do Pindaré" },
      { id: "dra_gisele_bezerra", texto: "Dra. Gisele Bezerra" },
      { id: "iracema_vale", texto: "Iracema Vale" },
      { id: "vinicius_ferro", texto: "Vinícius Ferro" },
      { id: "cleber_verde", texto: "Cléber Verde" },
      { id: "aldir_junior", texto: "Aldir Júnior" },
      { id: "fabiana_vilar", texto: "Fabiana Vilar" },
    ],
    deputadoEstadual: [
      { id: "neto_evangelista", texto: "Neto Evangelista" },
      { id: "vanessa_marreca", texto: "Vanessa Marreca" },
      { id: "aluisio_santos", texto: "Aluísio Santos" },
      { id: "tiago_fernandes", texto: "Tiago Fernandes" },
      { id: "dino_aldenora_belo", texto: "Dino do Aldenora Belo" },
      { id: "marcos_caldas", texto: "Marcos Caldas" },
      { id: "gleydson_resende", texto: "Gleydson Resende" },
      { id: "ana_do_gas", texto: "Ana do Gás" },
      { id: "junior_viana", texto: "Júnior Viana" },
      { id: "rui_jorge", texto: "Rui Jorge" },
    ],
  },
  // q13 é exclusiva de Itapecuru Mirim (não faz parte do questionário padrão
  // do Maranhão). O instrumento enviado pelo cliente citava "Mata Roma-MA"
  // no texto da Q13 (colado do questionário anterior) — corrigido aqui para
  // o município correto; conferir com o cliente antes de liberar o campo.
  perguntas: [
    ...criarPerguntasPadraoMaranhao(),
    {
      id: "q13",
      tipo: "open_text",
      texto:
        "Em relação às eleições municipais de 2028, quem você acha que seria um bom nome para ser o(a) próximo(a) prefeito(a) de Itapecuru Mirim-MA?",
      obrigatoria: true,
      maxLength: 120,
      atalhos: ["Não sabe", "Não opinou", "Nenhum"],
    },
  ],
  perguntasSemanticas: PERGUNTAS_SEMANTICAS_MARANHAO,
};

// --------------------------------------------------------------------
// Registro de pesquisas disponíveis + seleção ativa no aparelho.
// --------------------------------------------------------------------
const PESQUISAS_CONFIG = {
  chapadinha_ma: PESQUISA_CHAPADINHA_MA,
  brejo_ma: PESQUISA_BREJO_MA,
  mata_roma_ma: PESQUISA_MATA_ROMA_MA,
  vargem_grande_ma: PESQUISA_VARGEM_GRANDE_MA,
  itapecuru_mirim_ma: PESQUISA_ITAPECURU_MIRIM_MA,
  sao_bernardo_ma: PESQUISA_SAO_BERNARDO_MA,
  magalhaes_almeida_ma: PESQUISA_MAGALHAES_ALMEIDA_MA,
  araioses_ma: PESQUISA_ARAIOSES_MA,
  tutoia_ma: PESQUISA_TUTOIA_MA,
  santa_quiteria_ma: PESQUISA_SANTA_QUITERIA_MA,
  agua_doce_do_maranhao_ma: PESQUISA_AGUA_DOCE_DO_MARANHAO_MA,
  araguaina: PESQUISA_ARAGUAINA,
  palmas: PESQUISA_PALMAS,
  gurupi: PESQUISA_GURUPI,
  porto_nacional: PESQUISA_PORTO_NACIONAL,
  paraiso: PESQUISA_PARAISO,
};

const CHAVE_PESQUISA_SELECIONADA = "eleitoral_to_pesquisa_selecionada";

function listarPesquisasDisponiveis() {
  return Object.values(PESQUISAS_CONFIG);
}

/** Só as pesquisas com coleta em campo ainda aberta — usada na tela de
 *  escolha de pesquisa (js/inicio.js). Municípios já encerrados continuam em
 *  listarPesquisasDisponiveis() para dashboard/relatório/admin. */
function listarPesquisasParaColeta() {
  return listarPesquisasDisponiveis().filter((p) => p.ativoParaColeta !== false);
}

function obterIdPesquisaSelecionada() {
  if (typeof localStorage === "undefined") return null;
  const salvo = localStorage.getItem(CHAVE_PESQUISA_SELECIONADA);
  return PESQUISAS_CONFIG[salvo] ? salvo : null;
}

/** Grava a escolha do pesquisador no aparelho e ativa a pesquisa como window.PESQUISA_CONFIG. */
function definirPesquisaSelecionada(id) {
  if (!PESQUISAS_CONFIG[id]) return null;
  localStorage.setItem(CHAVE_PESQUISA_SELECIONADA, id);
  window.PESQUISA_CONFIG = PESQUISAS_CONFIG[id];
  return PESQUISAS_CONFIG[id];
}

function limparPesquisaSelecionada() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(CHAVE_PESQUISA_SELECIONADA);
  window.PESQUISA_CONFIG = undefined;
}

/** Usado ao retomar uma entrevista: o questionário a aplicar é o do
 *  município gravado na própria entrevista, não o da seleção atual do
 *  aparelho (que pode ter mudado entre o início e a retomada). */
function encontrarPesquisaPorMunicipio(municipio) {
  return listarPesquisasDisponiveis().find((c) => c.pesquisa.municipio === municipio) || null;
}

if (typeof window !== "undefined") {
  window.PESQUISAS_CONFIG = PESQUISAS_CONFIG;
  window.listarPesquisasDisponiveis = listarPesquisasDisponiveis;
  window.listarPesquisasParaColeta = listarPesquisasParaColeta;
  window.obterIdPesquisaSelecionada = obterIdPesquisaSelecionada;
  window.definirPesquisaSelecionada = definirPesquisaSelecionada;
  window.limparPesquisaSelecionada = limparPesquisaSelecionada;
  window.encontrarPesquisaPorMunicipio = encontrarPesquisaPorMunicipio;

  const idSelecionado = obterIdPesquisaSelecionada();
  if (idSelecionado) window.PESQUISA_CONFIG = PESQUISAS_CONFIG[idSelecionado];
}

// Disponibiliza tanto como módulo ES quanto como global (window),
// para permitir uso simples via <script> comum sem bundler.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { PESQUISAS_CONFIG };
}
