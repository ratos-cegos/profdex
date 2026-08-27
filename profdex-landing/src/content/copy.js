/* Todo o texto da landing, num arquivo só.
 *
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║ GUARDAS FACTUAIS — o que esta página NÃO pode afirmar                  ║
 * ║ (fonte: LANDING-PAGE.md §8, "Verificação factual")                     ║
 * ╠═══════════════════════════════════════════════════════════════════════╣
 * ║ · NÃO expor estado interno do projeto. Esta é uma página pública de    ║
 * ║   divulgação de evento: nada de quantos professores já têm arte, o que ║
 * ║   está cadastrado, o que falta fazer, nem nome de tecnologia. As       ║
 * ║   silhuetas da Pokédex significam "você ainda não desbloqueou".        ║
 * ║ · NÃO prometer um número de professores jogáveis. Se um dia for        ║
 * ║   preciso citar quantidade, ela sai de data/professors.js — nunca      ║
 * ║   digitada no texto.                                                   ║
 * ║ · NÃO existe cadastro por formulário. Só Google institucional —        ║
 * ║   POST /auth/register responde 404 de propósito.                       ║
 * ║ · NÃO existe app nativo (iOS/Android). É web, no navegador do celular. ║
 * ║ · A batalha contra a IA NÃO ranqueia — só o PvP.                       ║
 * ║ · AR existe, mas na tela "Ver Prof.", NÃO na arena de batalha (a arena ║
 * ║   usa sprites 2D desde a correção do bug de memória).                  ║
 * ║ · NÃO prometer "batalhas ininterruptas": deploy/restart anula batalhas ║
 * ║   ativas, e a sessão de 15 min limita o reconnect após F5.             ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 *
 * Tom: português do Brasil, direto, humor leve. O público é aluno de
 * computação — os detalhes técnicos honestos (servidor autoritativo, gabarito
 * que não sai do servidor, roda derivada em runtime) vendem melhor que
 * adjetivo de marketing.
 */

export const hero = {
  wordmarkStart: 'PROF',
  wordmarkEnd: 'DEX',
  subtitle: 'Colecione seus professores!',
  context: 'Semana Tecnológica · UniFil',
  lede: 'Uma Pokédex de professores. Responda o quiz, capture o QR e batalhe contra outros alunos — em turnos, como manda a tradição.',
  cta: 'COMEÇAR',
  ctaHint: 'Entra com a conta institucional. Abre no navegador do celular.',
}

/* Barra fixa do topo. Enxuta de propósito: dois destinos só — os créditos e o
 * app. Um menu com as sete seções da página caberia no desktop e viraria
 * hambúrguer no celular, que é o aparelho do público; e a página inteira já se
 * lê rolando. */
export const nav = {
  brandStart: 'PROF',
  brandEnd: 'DEX',
  // Nome acessível do logo. Contém o texto visível ("PROFDEX"), como exige a
  // WCAG 2.5.3 — quem usa comando de voz fala o que vê.
  brandLabel: 'ProfDex — voltar ao topo',
  credits: 'Quem somos',
  cta: 'COMEÇAR',
}

export const howItWorks = {
  kicker: 'Como funciona',
  title: 'Do estande à coleção',
  // Fluxo oficial. Tudo começa no estande do ProfDex, e o professor que vem no
  // QR é SORTEADO — não é escolhido pelo tema da pergunta.
  steps: [
    {
      title: 'Encontre o estande ProfDex',
      desc: 'Mesa com os integrantes do time ProfDex no evento.',
    },
    {
      title: 'Rode o quiz com perguntas sobre o curso',
      desc: 'Responda uma pergunta corretamente.',
    },
    {
      title: 'Receba o QR',
      desc: 'Acertou? O professor apresenta o QR de captura protegido. Se ganhar, será sorteado um QR code da pilha, podendo conter qualquer professor, com tipos diferentes.',
    },
    {
      title: 'Capture!',
      desc: 'Leia o QR no scanner e conclua sua captura no estande.',
    },
  ],
}

export const quiz = {
  kicker: 'Quiz de bancada',
  title: 'Uma pergunta, 60 segundos',
  desc: 'No estande do evento tem um tablet. Você informa a matrícula, escolhe um tema e responde uma pergunta em 60 segundos, com alguém do time ao lado.',
  facts: [
    // O prêmio é um QR SORTEADO da pilha — o tema da pergunta não decide qual
    // professor vem. Ver os passos em `howItWorks`.
    { label: 'Acertou', value: 'Sorteia um QR da pilha e sai para capturar' },
    { label: 'Errou ou estourou o tempo', value: 'Volta em 10 minutos' },
    { label: 'Banco de questões', value: '10 por tema (4 fáceis · 3 médias · 3 difíceis)' },
    { label: 'Alternativas', value: 'Embaralhadas a cada aplicação' },
  ],
}

export const typeWheel = {
  kicker: 'Roda de tipos',
  title: '9 tipos, e a roda gira',
  desc: 'Cada tipo é super-eficaz (2×) contra os dois seguintes no sentido horário, e fraco (0,5×) contra os dois anteriores. Professores têm até dois tipos, então os multiplicadores combinam: 4× · 2× · 1× · 0,5× · 0,25×.',
  // Antes esta nota dizia que o tema da pergunta definia o professor a capturar.
  // Não define: o QR é sorteado da pilha, e pode vir qualquer professor.
  note: 'Os nove temas do quiz são estes mesmos nove tipos. Como o QR é sorteado, dá para terminar o evento com uma equipe de tipos bem variados.',
  legendStrong: 'Forte contra',
  legendWeak: 'Fraco contra',
  hint: 'Toque em um tipo para ver as vantagens dele — ou segure a roda para girar e soltar: ela trava no tipo que parar no topo.',
}

export const battle = {
  kicker: 'Batalha',
  title: 'Turnos, tipos e 72 golpes',
  desc: 'Cada professor capturado é um combatente com até dois tipos e um moveset de quatro golpes, montado a partir do movepool do seu tipo.',
  stats: [
    { label: 'Ataque', hint: 'Quanto o golpe machuca' },
    { label: 'Defesa', hint: 'Quanto você aguenta' },
    { label: 'Velocidade', hint: 'Quem age primeiro no turno' },
  ],
  moveCategories: ['ataque', 'defesa', 'buff', 'debuff', 'status', 'cura'],
  effects: [
    'paralisia',
    'confusão',
    'dano contínuo',
    'recuo',
    'multi-golpe',
    'ignorar defesa',
    'poder crescente',
    'escudos: bloquear, reduzir, refletir, esquivar',
    'imunidade a debuff',
    'desfazer dano',
    'repetir o último golpe',
  ],
  effectsNote: 'Todos funcionam de verdade na batalha.',
  training: 'Contra a IA existe como modo treino. Não ranqueia.',
}

/* Vídeo vertical da batalha — o arquivo ainda não existe. Esta seção é o
 * encaixe: o player fica pronto (poster, botão de play, controles, badge de
 * status), só falta a URL entrar em config/links.js quando o vídeo for
 * gravado. Ver a nota de integração em BattleVideoSection.vue. */
export const battleVideo = {
  kicker: 'Veja em ação',
  title: 'A batalha, em vídeo',
  desc: 'Um vídeo vertical mostrando o fluxo básico — do quiz à captura — e como a batalha funciona por dentro.',
  badge: 'Em breve',
  playLabel: 'Reproduzir vídeo',
  placeholder: 'O vídeo entra aqui assim que estiver pronto — gravado no formato de story, vertical.',
}

export const pvp = {
  kicker: 'PvP ranqueado',
  title: 'Aluno contra aluno, em tempo real',
  steps: [
    { title: 'Lobby', desc: 'Você vê quem está online agora.' },
    { title: 'Convite', desc: 'Chama alguém para a briga. O convite expira em 60 segundos.' },
    {
      title: 'Seleção às cegas',
      desc: 'Ninguém vê o professor que o outro escolheu. Sem counter-pick.',
    },
    {
      title: 'Turnos de 60s',
      desc: 'Escolha simultânea.',
    },
    { title: 'Elo', desc: 'HP zerou, o rating muda e o ranking se mexe.' },
  ],
  // Cortes conferidos na fonte de verdade: profdex-back/src/battle/elo.ts.
  // O briefing omitia os cortes de Ouro e Platina.
  tiers: [
    { name: 'Bronze', min: 1000, max: 1099, icon: '🥉' },
    { name: 'Prata', min: 1100, max: 1199, icon: '🥈' },
    { name: 'Ouro', min: 1200, max: 1299, icon: '🥇' },
    { name: 'Platina', min: 1300, max: 1399, icon: '💠' },
    { name: 'Diamante', min: 1400, max: 1499, icon: '💎' },
    { name: 'Mestre', min: 1500, max: null, icon: '👑' },
  ],
  ratingNote:
    'Todo mundo começa em 1000, e 1000 também é o piso: perder muito não te enterra no ranking.',
  antiTrade: 'Cooldown de 12 horas por dupla, para o ranking não virar acordo entre amigos.',
}

export const score = {
  kicker: 'Ranking',
  title: 'Sair da cadeira vale mais',
  desc: 'Há dois placares: o Elo do PvP e uma pontuação de engajamento, que mede participação no evento.',
  rows: [
    { action: 'Primeira sessão do dia', points: 5 },
    { action: 'Minuto ativo (teto de 60 por dia)', points: 1 },
    { action: 'Professor descoberto', points: 20 },
    { action: 'Professor capturado', points: 50, highlight: true },
    { action: 'Convite de batalha enviado', points: 5 },
    { action: 'Batalha concluída', points: 80, highlight: true },
    { action: 'Vitória', points: 30, prefix: '+' },
    { action: 'Coleção completa', points: 200 },
    { action: 'Quiz respondido na bancada', points: 10 },
    { action: 'Quiz acertado', points: 25, prefix: '+' },
  ],
  note: 'Tempo só conta com a aba visível. Deixar o app aberto a noite toda não rende nada.',
}

export const professors = {
  kicker: 'Pokédex',
  // Esta seção fala de PROGRESSO DE JOGO, nunca de progresso de produção.
  // O título e o texto anteriores contavam quantos professores já tinham arte e
  // quantos estavam cadastrados — estado interno do projeto, que não interessa
  // (e não deveria aparecer) para quem vai jogar. As silhuetas agora significam
  // "você ainda não desbloqueou", que é o que o aluno de fato vê.
  title: 'Sua coleção começa vazia',
  desc: 'Encontre os professores no evento, participe do quiz na bancada e desbloqueie personagens exclusivos. Monte sua equipe, evolua no ranking e prepare-se para batalhar com seus amigos na Semana Tecnológica!',
  unknownLabel: '???',
  unknownHint: 'Ainda não desbloqueado',
}

export const model3d = {
  kicker: 'Ver de perto',
  title: 'O professor em 3D',
  desc: 'Dentro do app, a tela "Ver Prof." abre o modelo em realidade aumentada. Aqui você escolhe um professor e gira a prévia — se quiser.',
  pickerLabel: 'Escolha o professor para ver em 3D',
  cta: 'VER EM 3D',
  ctaHint: 'Só baixa quando você tocar — nada é gasto da sua internet antes disso.',
  loading: 'Carregando modelo',
  dragHint: 'Arraste para girar · pinça para aproximar',
  close: 'FECHAR 3D',
  // Mensagens da cadeia de guardas de src/three/useLazyModel.js. Cada recusa
  // diz o motivo: um "não deu" mudo é pior que a ausência do botão.
  refusals: {
    'save-data': 'Seu navegador está no modo de economia de dados — o modelo 3D ficou de fora.',
    'slow-network': 'Sua conexão está lenta agora. Melhor não gastar megabytes com um enfeite.',
    'low-memory': 'Este aparelho tem pouca memória para 3D. Ficamos na arte 2D.',
    'no-webgl': 'Este navegador não consegue mostrar 3D. A arte 2D continua aí.',
    'no-asset': 'A prévia em 3D não está disponível agora.',
    error: 'Não foi possível carregar o modelo. A arte 2D continua aí.',
  },
}

export const finalCta = {
  kicker: 'Bora',
  title: 'Entre com a conta institucional',
  desc: 'Toda conta nasce do login com Google da UniFil. Depois de criada, você também entra por matrícula e senha.',
  cta: 'COMEÇAR',
  domainsIntro: 'Domínios aceitos',
  domains: [
    { domain: '@edu.unifil.br', role: 'aluno — joga, captura e batalha' },
    { domain: '@unifil.br', role: 'organização do evento' },
  ],
  // Guarda factual: é web.
  platformNote: 'Roda no navegador do celular.',
}

export const credits = {
  kicker: 'Créditos',
  title: 'Quem fez o ProfDex',
  lede: 'Projeto desenvolvido dentro do grupo de pesquisa de Realidade Aumentada da UniFil, feito para a TechFil.',

  teamTitle: 'Time: RATOS CEGOS',
  team: [
    {
      name: 'Enzo Horçai da Silva',
      role: 'UI/UX',
      links: [
        { url: 'https://www.linkedin.com/in/enzohorcai/', label: 'Linkedin,' },
        { url: 'https://github.com/EnzoHorcai', label: 'Github' },
      ],
    },
    {
      name: 'Gregório C. Campos Lotz',
      role: 'Back-end e UI/UX',
      links: [
        { url: 'https://www.linkedin.com/in/greg%C3%B3rio-celso-campos-lotz/', label: 'Linkedin,' },
        { url: 'https://github.com/gregoriounifil', label: 'Github' },
      ],
    },
    {
      name: 'Kenzo Lima Yamamoto',
      role: 'Back-end e UI/UX',
      links: [
        { url: 'https://www.linkedin.com/in/kenzo-lima-yamamoto-ab5512359/', label: 'Linkedin,' },
        { url: 'https://github.com/KenzoLima', label: 'Github' },
      ],
    },
    {
      name: 'Maísa P. Dalla Costa',
      role: 'Artes e Pixelart',
      links: [
        { url: 'https://www.linkedin.com/in/maisapascoalotodallacosta/', label: 'Linkedin,' },
        { url: 'https://github.com/maisadallacosta', label: 'Github' },
      ],
    },
    {
      name: 'Nicole Duarte Guirardelli',
      role: 'Back-end',
      links: [
        { url: 'https://www.linkedin.com/in/nicole-guirardelli/', label: 'Linkedin,' },
        { url: 'https://github.com/NicoleGuirardelli', label: 'Github' },
      ],
    },
  ],

  advisorsTitle: 'Professores orientadores',
  advisors: [
    {
      name: 'Eron Ponce',
      role: 'Orientador',
      links: [
        { url: 'https://www.linkedin.com/in/eron-ponce-95285b213/', label: 'Linkedin,' },
        { url: 'https://github.com/Eronponce', label: 'Github' },
      ],
    },
    {
      name: 'Gustavo Queiroz',
      role: 'Orientador',
      links: [
        { url: 'https://www.linkedin.com/in/gustavo-queiroz-silveira/', label: 'Linkedin,' },
        { url: 'https://github.com/gustavo-qss', label: 'Github' },
      ],
    },
    {
      name: 'Mario Henrique Adaniya',
      role: 'Orientador',
      links: [
        { url: 'https://www.linkedin.com/in/mhadaniya/', label: 'Linkedin,' },
        { url: 'https://github.com/mhadaniya', label: 'Github' },
      ],
    },
  ],

  institutionTitle: 'Instituição',
  institutionName: 'UniFil',
  institutionDesc: 'Apoio da Universidade Filadelfia e o Grupo de Pesquisa de Realidade Aumentada.',
  institutionLink: 'unifil.br',

  projectTitle: 'Projeto',
  projectDesc: 'O ProfDex foi desenvolvido para a TechFil, antiga Semana Tecnológica da UniFil, nesse app integramos socialização, Realidade Aumentada, Revisão dos estudos e combate PvP, buscando juntar o games que tanto amos com os estudos.',
}

export const footer = {
  project: 'ProfDex',
  event: 'TechFil · UniFil',
  creditsLabel: 'Sobre',
  compLabel: 'Instagram de computação',
  siteLabel: 'unifil.br',
  colophon: 'Feito por alunos, para alunos — com uma quantidade defensável de nostalgia.',
}
