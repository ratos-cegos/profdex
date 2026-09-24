/**
 * Banco de questões do Quiz TREINO.
 *
 * Semeado por `npm run db:seed-quiz-treino` na tabela `training_questions`,
 * que é separada de `quiz_questions` de propósito — ver docs/QUIZ.md.
 *
 * Estas questões NÃO valem captura. É isso que permite o gabarito ir para o
 * cliente e a revisão ser por amostragem; o banco oficial continua sendo
 * escrito e revisado questão por questão, porque lá um erro custa um QR
 * indevido.
 *
 * Para ampliar ou regenerar um tema:
 *   ANTHROPIC_API_KEY=... npm run gen:quiz-treino -- --tema=algoritmos
 * O script valida o formato, recusa duplicatas e descarta a questão cuja
 * resposta certa seja a alternativa mais longa por folga — o vício que fazia o
 * banco ser gabaritado no olho (ver `src/quiz/option-balance.ts`). Revise por
 * amostragem antes de semear.
 */
import type { QuizSeedQuestion } from './quiz-questions';

export interface TrainingSeedQuestion extends QuizSeedQuestion {
  /** Uma frase explicando a resposta, mostrada no feedback imediato. */
  explanation: string;
}

export const TRAINING_QUESTIONS: TrainingSeedQuestion[] = [
  // ── Humanas ───────────────────────────────────────────────────────────────────
  // Humanas aqui é humanas APLICADA à computação: ética, LGPD, impacto social e
  // método científico — o mesmo recorte do banco oficial.
  {
    theme: 'humanas',
    difficulty: 'facil',
    prompt: 'O que significa a sigla LGPD?',
    options: [
      'Lei Geral de Publicidade Digital',
      'Lei Geral de Proteção de Dados',
      'Lei de Governança de Processos Digitais',
      'Lei Geral de Privacidade Documental',
    ],
    answer: 1,
    explanation:
      'É a Lei Geral de Proteção de Dados (13.709/2018), que regula o tratamento de dados pessoais no Brasil.',
  },
  {
    theme: 'humanas',
    difficulty: 'facil',
    prompt: 'O e-mail pessoal de alguém é considerado dado pessoal?',
    options: [
      'Sim, porque permite identificar a pessoa',
      'Não, porque endereços de e-mail são públicos',
      'Só quando aparece junto do CPF do titular',
      'Só quando é um e-mail corporativo da empresa',
    ],
    answer: 0,
    explanation:
      'Dado pessoal é toda informação que identifica ou torna identificável uma pessoa — o e-mail se encaixa.',
  },
  {
    theme: 'humanas',
    difficulty: 'facil',
    prompt:
      'Copiar um trecho da internet no trabalho sem citar a fonte é o quê?',
    options: ['Paráfrase', 'Resenha', 'Plágio', 'Citação direta'],
    answer: 2,
    explanation:
      'Usar a produção de outra pessoa sem atribuir a autoria é plágio, mesmo que o trecho seja curto.',
  },
  {
    theme: 'humanas',
    difficulty: 'facil',
    prompt:
      'Fazer um site funcionar bem com leitor de tela atende a qual objetivo?',
    options: [
      'Acessibilidade',
      'Escalabilidade',
      'Portabilidade',
      'Confidencialidade',
    ],
    answer: 0,
    explanation:
      'Acessibilidade é garantir que pessoas com deficiência consigam perceber, navegar e usar o sistema.',
  },
  {
    theme: 'humanas',
    difficulty: 'facil',
    prompt:
      'Quem pode pedir a exclusão dos seus dados guardados por uma empresa?',
    options: [
      'Somente um juiz',
      'Qualquer funcionário da empresa',
      'O próprio titular dos dados',
      'Apenas o órgão regulador',
    ],
    answer: 2,
    explanation:
      'A LGPD dá ao titular o direito de solicitar eliminação dos dados tratados com base no seu consentimento.',
  },
  {
    theme: 'humanas',
    difficulty: 'facil',
    prompt: 'Para que serve a licença de um projeto de código aberto?',
    options: [
      'Garantir que o código nunca será alterado',
      'Definir o que outros podem fazer com o código',
      'Registrar a autoria do projeto em cartório',
      'Impedir que o repositório seja copiado por outros',
    ],
    answer: 1,
    explanation:
      'A licença estabelece os direitos de uso, modificação e redistribuição; sem ela, o padrão é "todos os direitos reservados".',
  },
  {
    theme: 'humanas',
    difficulty: 'media',
    prompt:
      'Um chatbot treinado só com textos de um único grupo social tende a fazer o quê?',
    options: [
      'Responder com mais velocidade às perguntas',
      'Reproduzir o ponto de vista daquele grupo',
      'Consumir menos memória durante a execução',
      'Recusar perguntas longas demais para tratar',
    ],
    answer: 1,
    explanation:
      'O modelo aprende o que está nos dados: base pouco diversa gera respostas enviesadas em favor do grupo representado.',
  },
  {
    theme: 'humanas',
    difficulty: 'media',
    prompt: 'Quais destes a LGPD classifica como dados pessoais SENSÍVEIS?',
    options: [
      'Nome completo, endereço e data de nascimento',
      'Número de telefone, e-mail e nº de matrícula',
      'Origem racial, religião, saúde e biometria',
      'Histórico de compras feitas numa loja virtual',
    ],
    answer: 2,
    explanation:
      'Dados sensíveis recebem proteção reforçada porque seu uso indevido facilita discriminação.',
  },
  {
    theme: 'humanas',
    difficulty: 'media',
    prompt:
      'Um termo de uso longo e cheio de jargão compromete principalmente qual princípio da LGPD?',
    options: ['Transparência', 'Segurança', 'Portabilidade', 'Prevenção'],
    answer: 0,
    explanation:
      'A lei exige informação clara e acessível sobre o tratamento; texto incompreensível esvazia esse direito.',
  },
  {
    theme: 'humanas',
    difficulty: 'media',
    prompt: 'O que um comitê de ética em pesquisa avalia num projeto?',
    options: [
      'A qualidade da escrita do artigo',
      'O orçamento solicitado à agência de fomento',
      'A originalidade do tema escolhido',
      'Os riscos e a proteção dos participantes',
    ],
    answer: 3,
    explanation:
      'O comitê existe para proteger quem participa da pesquisa, analisando riscos, consentimento e privacidade.',
  },
  {
    theme: 'humanas',
    difficulty: 'media',
    prompt:
      'A automação que elimina postos de trabalho inteiros levanta qual discussão?',
    options: [
      'Impacto social da tecnologia',
      'Complexidade algorítmica',
      'Portabilidade de sistemas',
      'Normalização de banco de dados',
    ],
    answer: 0,
    explanation:
      'É um debate clássico de humanas aplicadas: quem ganha e quem perde com a adoção de uma tecnologia.',
  },
  {
    theme: 'humanas',
    difficulty: 'dificil',
    prompt: 'Qual é a diferença entre pseudonimização e anonimização?',
    options: [
      'São dois termos equivalentes dentro da LGPD',
      'A pseudonimização pode ser revertida com uma chave',
      'A anonimização só vale para dados sensíveis',
      'A pseudonimização exige autorização judicial',
    ],
    answer: 1,
    explanation:
      'Dado pseudonimizado continua sendo dado pessoal, porque existe uma chave capaz de reidentificar o titular.',
  },
  {
    theme: 'humanas',
    difficulty: 'dificil',
    prompt: 'O que a base legal do "legítimo interesse" exige do controlador?',
    options: [
      'Consentimento por escrito do titular dos dados',
      'Autorização prévia da autoridade nacional',
      'Balancear o interesse com os direitos do titular',
      'Anonimizar todos os dados antes de qualquer uso',
    ],
    answer: 2,
    explanation:
      'O legítimo interesse dispensa consentimento, mas obriga a um teste de balanceamento documentado.',
  },
  {
    theme: 'humanas',
    difficulty: 'dificil',
    prompt: 'No método científico, o que é uma hipótese?',
    options: [
      'A conclusão final apresentada na pesquisa',
      'Uma explicação provisória que pode ser testada',
      'O resumo dos trabalhos já publicados na área',
      'O conjunto de dados coletados no experimento',
    ],
    answer: 1,
    explanation:
      'A hipótese é uma resposta candidata formulada de modo a poder ser confirmada ou refutada por evidência.',
  },
  {
    theme: 'humanas',
    difficulty: 'dificil',
    prompt:
      'Modelos de IA que funcionam como "caixa-preta" agravam qual problema ético?',
    options: [
      'O consumo de energia durante o treinamento',
      'A velocidade de resposta oferecida ao usuário',
      'O custo de armazenamento dos dados de treino',
      'A dificuldade de explicar e responsabilizar',
    ],
    answer: 3,
    explanation:
      'Sem explicabilidade, quem foi prejudicado não consegue contestar a decisão nem identificar o responsável.',
  },

    // Ampliação do tema.
  {
    theme: "humanas",
    difficulty: "facil",
    prompt: 'Uma foto do seu rosto é considerada dado pessoal?',
    options: [
      'Sim, porque permite identificar você',
      'Não, porque imagem não é informação',
      'Só quando está junto do seu nome',
      'Só quando foi tirada em local público',
    ],
    answer: 0,
    explanation:
      'Imagem que identifica alguém é dado pessoal; biometria facial é dado sensível.',
  },
  {
    theme: "humanas",
    difficulty: "facil",
    prompt: 'O que significa dizer que um projeto é de código aberto?',
    options: [
      'Que ninguém detém direitos sobre ele',
      'Que o código-fonte fica disponível para ver',
      'Que ele foi escrito por voluntários',
      'Que ele não pode ser vendido a ninguém',
    ],
    answer: 1,
    explanation:
      'Código aberto é sobre acesso ao fonte e à licença de uso, não sobre preço ou autoria.',
  },
  {
    theme: "humanas",
    difficulty: "facil",
    prompt: 'Numa loja on-line, quem é o titular dos dados?',
    options: [
      'A loja que guarda o cadastro',
      'A empresa que hospeda o site',
      'O cliente a quem os dados se referem',
      'O funcionário que fez o cadastro',
    ],
    answer: 2,
    explanation:
      'Titular é sempre a pessoa natural a quem a informação se refere.',
  },
  {
    theme: "humanas",
    difficulty: "facil",
    prompt: 'O que caracteriza o assédio virtual (cyberbullying)?',
    options: [
      'Qualquer crítica publicada na internet',
      'A cópia de conteúdo sem citar a fonte',
      'O envio de propaganda não solicitada',
      'Agressão repetida por meios digitais',
    ],
    answer: 3,
    explanation:
      'O que define é a agressão intencional e repetida contra a mesma pessoa.',
  },
  {
    theme: "humanas",
    difficulty: "facil",
    prompt: 'Para que serve citar a fonte num trabalho acadêmico?',
    options: [
      'Dar crédito a quem produziu a ideia',
      'Deixar o texto com mais páginas',
      'Comprovar que o texto é original',
      'Substituir a revisão do orientador',
    ],
    answer: 0,
    explanation:
      'A citação separa o que é seu do que é de outro autor — é o que evita o plágio.',
  },
  {
    theme: "humanas",
    difficulty: "facil",
    prompt: 'O que a sigla ANPD representa?',
    options: [
      'Agência Nacional de Pesquisa Digital',
      'Autoridade Nacional de Proteção de Dados',
      'Associação Nacional de Privacidade Digital',
      'Auditoria Nacional de Provedores de Dados',
    ],
    answer: 1,
    explanation:
      'A ANPD é o órgão federal que fiscaliza e regulamenta a aplicação da LGPD.',
  },
  {
    theme: "humanas",
    difficulty: "media",
    prompt: 'Por que pedir mais dados do que o necessário é um problema?',
    options: [
      'Porque deixa o formulário mais lento',
      'Porque exige mais espaço em disco',
      'Porque fere o princípio da necessidade',
      'Porque atrasa a resposta do servidor',
    ],
    answer: 2,
    explanation:
      'A LGPD limita a coleta ao mínimo necessário para a finalidade informada.',
  },
  {
    theme: "humanas",
    difficulty: "media",
    prompt: 'Como o consentimento precisa ser, segundo a LGPD?',
    options: [
      'Verbal e registrado em ata interna',
      'Dado uma vez e válido para sempre',
      'Assinado na presença de testemunhas',
      'Livre, informado e para fim definido',
    ],
    answer: 3,
    explanation:
      'Consentimento genérico ou obtido sob pressão não é válido, e pode ser revogado.',
  },
  {
    theme: "humanas",
    difficulty: "media",
    prompt: 'Uma pesquisa com pouquíssimos participantes tem qual limitação?',
    options: [
      'Os resultados dificilmente se generalizam',
      'Os dados não podem ser analisados',
      'A pesquisa perde o valor científico',
      'O comitê de ética não a aprova',
    ],
    answer: 0,
    explanation:
      'Amostra pequena aumenta a incerteza: o achado pode não valer para a população.',
  },
  {
    theme: "humanas",
    difficulty: "media",
    prompt: 'O que a acessibilidade exige de um vídeo publicado?',
    options: [
      'Resolução alta e som em estéreo',
      'Legenda e descrição do que é falado',
      'Duração menor que cinco minutos',
      'Publicação em mais de uma rede',
    ],
    answer: 1,
    explanation:
      'Legenda atende quem não ouve; audiodescrição atende quem não enxerga.',
  },
  {
    theme: "humanas",
    difficulty: "media",
    prompt: 'Por que software proprietário não é sinônimo de software pago?',
    options: [
      'Porque todo proprietário é gratuito',
      'Porque o preço define a licença usada',
      'Porque o que define é a restrição de uso',
      'Porque software livre é sempre pago',
    ],
    answer: 2,
    explanation:
      'Existe proprietário gratuito e livre vendido: o critério é a liberdade concedida.',
  },
  {
    theme: "humanas",
    difficulty: "dificil",
    prompt: 'O que um relatório de impacto à proteção de dados descreve?',
    options: [
      'O custo do sistema para a empresa',
      'O desempenho esperado do servidor',
      'A lista de usuários já cadastrados',
      'Os riscos do tratamento e as salvaguardas',
    ],
    answer: 3,
    explanation:
      'É o documento que mostra como a operação foi avaliada e mitigada antes de rodar.',
  },
  {
    theme: "humanas",
    difficulty: "dificil",
    prompt:
      'Qual é o problema de treinar uma IA com dados coletados sem base legal?',
    options: [
      'O tratamento é irregular desde a origem',
      'O modelo fica mais lento para treinar',
      'A acurácia do modelo cai pela metade',
      'O modelo passa a exigir mais memória',
    ],
    answer: 0,
    explanation:
      'Sem base legal, toda a cadeia de uso herda a irregularidade da coleta.',
  },
  {
    theme: "humanas",
    difficulty: "dificil",
    prompt: 'O que caracteriza um viés de seleção numa pesquisa?',
    options: [
      'A amostra ser maior que o necessário',
      'A amostra ser escolhida sem representar',
      'O pesquisador errar no cálculo da média',
      'O questionário ter perguntas demais',
    ],
    answer: 1,
    explanation:
      'O problema está em como a amostra foi formada, não no tamanho dela.',
  },
  {
    theme: "humanas",
    difficulty: "dificil",
    prompt: 'Por que a replicabilidade importa num experimento científico?',
    options: [
      'Porque reduz o custo do laboratório',
      'Porque acelera a publicação do artigo',
      'Porque outro grupo precisa chegar ao mesmo',
      'Porque garante que a hipótese é correta',
    ],
    answer: 2,
    explanation:
      'Resultado que ninguém consegue reproduzir não sustenta conclusão científica.',
  },

// ── Matemática ────────────────────────────────────────────────────────────────
  {
    theme: 'matematica',
    difficulty: 'facil',
    prompt: 'Qual é a derivada de f(x) = x³?',
    options: ['3x', '3x²', 'x²', 'x⁴/4'],
    answer: 1,
    explanation: 'Pela regra do expoente, a derivada de xⁿ é n·xⁿ⁻¹.',
  },
  {
    theme: 'matematica',
    difficulty: 'facil',
    prompt: 'A derivada de uma função constante é:',
    options: ['A própria constante', 'Zero', 'Um', 'Indefinida'],
    answer: 1,
    explanation: 'Uma constante não varia, então sua taxa de variação é zero.',
  },
  {
    theme: 'matematica',
    difficulty: 'facil',
    prompt: 'Geometricamente, a derivada num ponto representa:',
    options: [
      'A área sob a curva',
      'A inclinação da reta tangente',
      'O valor máximo da função',
      'A distância até a origem',
    ],
    answer: 1,
    explanation:
      'A derivada é o coeficiente angular da tangente naquele ponto.',
  },
  {
    theme: 'matematica',
    difficulty: 'facil',
    prompt:
      'A integral definida de uma função positiva num intervalo representa:',
    options: [
      'A inclinação média no intervalo',
      'A área entre a curva e o eixo x',
      'O ponto de máximo da função',
      'A derivada acumulada no trecho',
    ],
    answer: 1,
    explanation: 'A integral definida acumula a área sob a curva no intervalo.',
  },
  {
    theme: 'matematica',
    difficulty: 'facil',
    prompt: 'Quanto vale o limite de f(x) = 3x quando x tende a 2?',
    options: ['3', '5', '6', 'Não existe'],
    answer: 2,
    explanation: 'A função é contínua, então basta substituir: 3 × 2 = 6.',
  },
  {
    theme: 'matematica',
    difficulty: 'facil',
    prompt: 'Qual é a derivada de f(x) = 5x + 7?',
    options: ['5', '7', '5x', '12'],
    answer: 0,
    explanation:
      'A derivada do termo linear é o coeficiente e a da constante é zero.',
  },
  {
    theme: 'matematica',
    difficulty: 'media',
    prompt: 'Se f é derivável e tem máximo local interno em x=c, o que vale?',
    options: ["f'(c) > 0", "f'(c) < 0", "f'(c) = 0", "f'(c) não existe"],
    answer: 2,
    explanation:
      'Em extremo interno de função derivável a tangente é horizontal.',
  },
  {
    theme: 'matematica',
    difficulty: 'media',
    prompt: 'Pela regra da cadeia, a derivada de f(g(x)) é:',
    options: ["f'(x) · g'(x)", "f'(g(x)) · g'(x)", "f(g'(x))", "f'(g'(x))"],
    answer: 1,
    explanation:
      'Deriva-se a função de fora aplicada na de dentro e multiplica pela derivada de dentro.',
  },
  {
    theme: 'matematica',
    difficulty: 'media',
    prompt: 'Uma função com derivada segunda positiva num intervalo é:',
    options: [
      'Decrescente',
      'Côncava para cima',
      'Côncava para baixo',
      'Constante',
    ],
    answer: 1,
    explanation:
      'A derivada segunda positiva indica concavidade voltada para cima.',
  },
  {
    theme: 'matematica',
    difficulty: 'media',
    prompt: 'Na notação assintótica, por que log(n) cresce mais devagar que n?',
    options: [
      'Porque log(n) assume valores negativos',
      'Porque a razão log(n)/n tende a zero',
      'Porque log(n) é constante a partir de n',
      'Porque n é sempre um número inteiro',
    ],
    answer: 1,
    explanation:
      'O limite da razão tender a zero é a definição de crescimento estritamente menor.',
  },
  {
    theme: 'matematica',
    difficulty: 'media',
    prompt: 'A derivada de f(x) = eˣ é:',
    options: ['x·eˣ⁻¹', 'eˣ', '1/x', 'ln(x)'],
    answer: 1,
    explanation:
      'A exponencial natural é a função que coincide com a própria derivada.',
  },
  {
    theme: 'matematica',
    difficulty: 'dificil',
    prompt: 'O Teorema Fundamental do Cálculo relaciona quais duas operações?',
    options: [
      'Limite e continuidade',
      'Derivação e integração',
      'Soma e produto',
      'Máximo e mínimo',
    ],
    answer: 1,
    explanation:
      'Ele mostra que integração e derivação são operações inversas uma da outra.',
  },
  {
    theme: 'matematica',
    difficulty: 'dificil',
    prompt:
      'No gradiente descendente, por que se anda no sentido oposto ao gradiente?',
    options: [
      'Porque o gradiente aponta o maior crescimento',
      'Porque o gradiente é sempre negativo na perda',
      'Para acelerar a convergência do treinamento',
      'Porque a função de perda é sempre convexa',
    ],
    answer: 0,
    explanation:
      'O gradiente aponta na direção de maior aumento, então descer exige inverter o sinal.',
  },
  {
    theme: 'matematica',
    difficulty: 'dificil',
    prompt:
      'Uma função contínua num intervalo fechado e limitado garante o quê?',
    options: [
      'Que ela é derivável em todo o intervalo',
      'Que atinge máximo e mínimo no intervalo',
      'Que ela é crescente em todo o intervalo',
      'Que ela tem uma única raiz no intervalo',
    ],
    answer: 1,
    explanation:
      'É o Teorema de Weierstrass: continuidade em compacto garante extremos atingidos.',
  },
  {
    theme: 'matematica',
    difficulty: 'dificil',
    prompt:
      'Derivada parcial de f(x,y) em relação a x significa derivar tratando y como:',
    options: ['Zero', 'Constante', 'Igual a x', 'Variável livre'],
    answer: 1,
    explanation:
      'Na derivada parcial só uma variável varia; as demais ficam congeladas.',
  },

  // Estatística — entrou em Matemática quando o tema passou a cobri-la.
  {
    theme: 'matematica',
    difficulty: 'facil',
    prompt: 'Qual é a média aritmética entre 10 e 20?',
    options: ['10', '15', '20', '30'],
    answer: 1,
    explanation:
      'A média é a soma dividida pela quantidade: (10 + 20) / 2 = 15.',
  },
  {
    theme: 'matematica',
    difficulty: 'facil',
    prompt: 'O que a moda indica num conjunto de dados?',
    options: [
      'O valor mais frequente',
      'O valor do meio',
      'A média dos extremos',
      'A soma de todos os valores',
    ],
    answer: 0,
    explanation:
      'Moda é o valor que aparece mais vezes; um conjunto pode ter mais de uma, ou nenhuma.',
  },
  {
    theme: 'matematica',
    difficulty: 'facil',
    prompt:
      'Num gráfico de barras de frequência, a barra mais alta corresponde a quê?',
    options: ['À média', 'À mediana', 'À moda', 'Ao desvio padrão'],
    answer: 2,
    explanation:
      'A altura da barra é a frequência, então a mais alta é o valor que mais se repete — a moda.',
  },
  {
    theme: 'matematica',
    difficulty: 'media',
    prompt: 'O que a variância calcula?',
    options: [
      'A diferença entre o maior e o menor valor',
      'A média dos quadrados dos desvios à média',
      'O valor central dos dados já ordenados',
      'A raiz quadrada da média dos valores',
    ],
    answer: 1,
    explanation:
      'Elevar os desvios ao quadrado evita que os positivos e negativos se cancelem; o desvio padrão é a raiz dela.',
  },
  {
    theme: 'matematica',
    difficulty: 'media',
    prompt:
      'Se todos os valores de um conjunto são iguais, quanto vale o desvio padrão?',
    options: ['Zero', 'Um', 'A média do conjunto', 'Não é possível calcular'],
    answer: 0,
    explanation:
      'Sem variação não há desvio: todos os valores coincidem com a média e a dispersão é nula.',
  },
  {
    theme: 'matematica',
    difficulty: 'media',
    prompt: 'O que é uma amostra enviesada?',
    options: [
      'Uma amostra com poucos elementos coletados',
      'Uma amostra com muitos valores repetidos',
      'Uma amostra que não representa a população',
      'Uma amostra escolhida por sorteio simples',
    ],
    answer: 2,
    explanation:
      'O viés vem de como a amostra foi escolhida: mesmo grande, ela pode super-representar um grupo.',
  },
  {
    theme: 'matematica',
    difficulty: 'dificil',
    prompt: 'Por que a mediana costuma ser preferida à média em salários?',
    options: [
      'Porque é mais rápida de calcular',
      'Porque é menos afetada por valores extremos',
      'Porque sempre coincide com a moda',
      'Porque usa todos os valores do conjunto',
    ],
    answer: 1,
    explanation:
      'Alguns salários muito altos puxam a média para cima; a mediana só depende da posição central.',
  },
  {
    theme: 'matematica',
    difficulty: 'dificil',
    prompt: 'O que significa um intervalo de confiança de 95%?',
    options: [
      'Que 95% dos dados caem dentro do intervalo',
      'Que há 95% de chance de o próximo valor cair ali',
      'Que o erro da medição feita é de apenas 5%',
      'Que o método captura o parâmetro em 95% das amostras',
    ],
    answer: 3,
    explanation:
      'A confiança é uma propriedade do procedimento repetido, não da probabilidade de um intervalo específico.',
  },

    // Ampliação do tema.
  {
    theme: "matematica",
    difficulty: "facil",
    prompt: 'Qual é a derivada de f(x) = 4x²?',
    options: ['8x', '4x', '2x', '8x²'],
    answer: 0,
    explanation: 'Pela regra do expoente com constante: 4 · 2x = 8x.',
  },
  {
    theme: "matematica",
    difficulty: "facil",
    prompt: 'Quanto vale 10% de 250?',
    options: ['2,5', '25', '20', '30'],
    answer: 1,
    explanation: 'Dez por cento é dividir por dez: 250 / 10 = 25.',
  },
  {
    theme: "matematica",
    difficulty: "facil",
    prompt: 'Qual é a integral indefinida de 5 dx?',
    options: ['5 + C', 'x + C', '5x + C', 'x²/2 + C'],
    answer: 2,
    explanation:
      'A integral de uma constante k é k·x mais a constante de integração.',
  },
  {
    theme: "matematica",
    difficulty: "facil",
    prompt: 'Qual é a média aritmética de 4, 6 e 11?',
    options: ['6', '8', '9', '7'],
    answer: 3,
    explanation: 'A soma é 21 e são três valores: 21 / 3 = 7.',
  },
  {
    theme: "matematica",
    difficulty: "facil",
    prompt: 'Qual é a moda do conjunto 1, 2, 2 e 8?',
    options: ['1', '2', '5', '8'],
    answer: 1,
    explanation: 'Moda é o valor mais frequente, e o 2 aparece duas vezes.',
  },
  {
    theme: "matematica",
    difficulty: "facil",
    prompt: 'Quanto vale o limite de f(x) = 5 quando x tende a 3?',
    options: ['0', '3', '5', 'Não existe'],
    answer: 2,
    explanation:
      'A função constante vale 5 em qualquer ponto, então o limite também é 5.',
  },
  {
    theme: "matematica",
    difficulty: "facil",
    prompt: 'Qual é a probabilidade de tirar um ás de um baralho de 52 cartas?',
    options: ['1/13', '1/4', '1/52', '4/13'],
    answer: 0,
    explanation: 'São 4 ases em 52 cartas: 4/52 se simplifica para 1/13.',
  },
  {
    theme: "matematica",
    difficulty: "facil",
    prompt: 'A derivada de f num ponto informa o quê?',
    options: [
      'A área sob a curva até ali',
      'A taxa de variação naquele ponto',
      'O maior valor que a função atinge',
      'A distância entre dois pontos dela',
    ],
    answer: 1,
    explanation:
      'Derivada é taxa de variação instantânea — a inclinação da tangente no ponto.',
  },
  {
    theme: "matematica",
    difficulty: "facil",
    prompt: 'A fração 1/4 corresponde a quantos por cento?',
    options: ['14%', '40%', '25%', '50%'],
    answer: 2,
    explanation: 'Um quarto é 0,25, ou seja, 25 por cento.',
  },
  {
    theme: "matematica",
    difficulty: "facil",
    prompt: 'Qual é a derivada de f(x) = 3x + 2?',
    options: ['2', '3x', '5', '3'],
    answer: 3,
    explanation:
      'A derivada do termo linear é o coeficiente; a da constante é zero.',
  },
  {
    theme: "matematica",
    difficulty: "media",
    prompt: 'Qual é a derivada de f(x) = sen(2x)?',
    options: ['2·cos(2x)', 'cos(2x)', '-2·cos(2x)', '2·sen(2x)'],
    answer: 0,
    explanation:
      'Pela regra da cadeia: derivada de sen é cos, vezes a derivada de 2x, que é 2.',
  },
  {
    theme: "matematica",
    difficulty: "media",
    prompt: 'Quanto vale a integral de x dx no intervalo de 0 a 2?',
    options: ['1', '2', '4', '0,5'],
    answer: 1,
    explanation: 'A primitiva é x²/2; aplicada de 0 a 2 dá 4/2 = 2.',
  },
  {
    theme: "matematica",
    difficulty: "media",
    prompt:
      'Numa amostra de 100 pessoas, 40 responderam sim. Qual é a proporção?',
    options: ['4', '40', '0,4', '0,04'],
    answer: 2,
    explanation:
      'Proporção é a parte dividida pelo total: 40/100 = 0,4 (ou 40%).',
  },
  {
    theme: "matematica",
    difficulty: "media",
    prompt: 'A mediana resiste melhor que a média a quê?',
    options: [
      'A amostras de tamanho pequeno',
      'A erros de digitação dos dados',
      'A conjuntos com muitos empates',
      'A valores extremos (outliers)',
    ],
    answer: 3,
    explanation:
      'A mediana depende da posição central, então um valor absurdo quase não a move.',
  },
  {
    theme: "matematica",
    difficulty: "media",
    prompt: 'Quantos subconjuntos tem um conjunto de 4 elementos?',
    options: ['16', '8', '12', '24'],
    answer: 0,
    explanation:
      'São 2⁴ = 16 subconjuntos, contando o vazio e o próprio conjunto.',
  },
  {
    theme: "matematica",
    difficulty: "media",
    prompt: 'O que a regra da soma permite ao derivar f(x) + g(x)?',
    options: [
      'Multiplicar as duas derivadas',
      'Derivar cada termo separadamente',
      'Derivar só o termo de maior grau',
      'Somar as funções antes de derivar',
    ],
    answer: 1,
    explanation:
      'A derivada é linear: a derivada da soma é a soma das derivadas.',
  },
  {
    theme: "matematica",
    difficulty: "media",
    prompt: 'Numa equação do segundo grau, o que o discriminante indica?',
    options: [
      'O valor do vértice da parábola',
      'A inclinação da reta tangente',
      'Quantas raízes reais ela tem',
      'A área abaixo da parábola',
    ],
    answer: 2,
    explanation:
      'Delta positivo dá duas raízes reais; zero dá uma; negativo, nenhuma real.',
  },
  {
    theme: "matematica",
    difficulty: "dificil",
    prompt: 'Qual é a derivada de f(x) = eˣ·sen(x)?',
    options: [
      'eˣ·cos(x)',
      'eˣ·sen(x)',
      'eˣ·(sen x - cos x)',
      'eˣ·(sen x + cos x)',
    ],
    answer: 3,
    explanation:
      'Pela regra do produto: eˣ·sen(x) + eˣ·cos(x), que se fatora como eˣ(sen x + cos x).',
  },
  {
    theme: "matematica",
    difficulty: "dificil",
    prompt: 'Quanto vale o limite de (1 + 1/n)ⁿ quando n tende ao infinito?',
    options: ['e', '1', '0', 'Infinito'],
    answer: 0,
    explanation:
      'É a definição clássica do número de Euler, aproximadamente 2,718.',
  },
  {
    theme: "matematica",
    difficulty: "dificil",
    prompt: 'Para que serve a regra de L Hôpital?',
    options: [
      'Para derivar funções compostas',
      'Para resolver limites indeterminados',
      'Para calcular áreas sob a curva',
      'Para achar máximos e mínimos',
    ],
    answer: 1,
    explanation:
      'Em formas como 0/0 ou ∞/∞, ela troca o limite pelo das derivadas.',
  },
  {
    theme: "matematica",
    difficulty: "dificil",
    prompt: 'Numa cadeia de Markov, o próximo estado depende de quê?',
    options: [
      'De todo o histórico percorrido',
      'Do estado inicial da cadeia',
      'Apenas do estado atual',
      'Da média dos estados anteriores',
    ],
    answer: 2,
    explanation:
      'É a propriedade de Markov: o passado só importa através do estado presente.',
  },
  {
    theme: "matematica",
    difficulty: "dificil",
    prompt: 'O que o p-valor indica num teste de hipótese?',
    options: [
      'A chance de a hipótese nula ser verdadeira',
      'O tamanho do efeito medido no estudo',
      'A proporção de acertos do modelo usado',
      'A chance do dado sob a hipótese nula',
    ],
    answer: 3,
    explanation:
      'É a probabilidade de observar um resultado tão extremo se a hipótese nula valesse.',
  },
  {
    theme: "matematica",
    difficulty: "dificil",
    prompt: 'O que significa uma matriz quadrada ter determinante zero?',
    options: [
      'Que ela não admite matriz inversa',
      'Que todos os elementos dela são nulos',
      'Que ela é igual à matriz identidade',
      'Que ela tem uma única linha não nula',
    ],
    answer: 0,
    explanation:
      'Determinante nulo indica linhas dependentes: o sistema não tem solução única.',
  },
  {
    theme: "matematica",
    difficulty: "dificil",
    prompt: 'Por que a soma 1 + 1/2 + 1/4 + 1/8 + ... converge?',
    options: [
      'Porque tem um número finito de termos',
      'Porque é geométrica com razão menor que 1',
      'Porque cada termo é maior que o anterior',
      'Porque a soma dos numeradores é finita',
    ],
    answer: 1,
    explanation:
      'Série geométrica com |razão| < 1 converge; aqui a soma vale exatamente 2.',
  },

// ── IA ────────────────────────────────────────────────────────────────────────
  {
    theme: 'ia',
    difficulty: 'facil',
    prompt: 'No aprendizado supervisionado, os dados de treino têm o quê?',
    options: [
      'Apenas as entradas dos exemplos',
      'Entradas e as respostas esperadas',
      'Apenas as respostas esperadas',
      'Nenhum rótulo, só os atributos',
    ],
    answer: 1,
    explanation:
      'Supervisão significa que cada exemplo vem acompanhado da resposta correta.',
  },
  {
    theme: 'ia',
    difficulty: 'facil',
    prompt: 'Agrupar clientes sem rótulos prévios é um problema típico de:',
    options: [
      'Classificação',
      'Regressão',
      'Aprendizado não supervisionado',
      'Aprendizado por reforço',
    ],
    answer: 2,
    explanation:
      'Sem rótulos, o algoritmo busca estrutura nos dados — é clusterização.',
  },
  {
    theme: 'ia',
    difficulty: 'facil',
    prompt:
      'Prever o preço de um imóvel (um número contínuo) é um problema de:',
    options: [
      'Classificação',
      'Regressão',
      'Clusterização',
      'Redução de dimensionalidade',
    ],
    answer: 1,
    explanation:
      'Saída numérica contínua caracteriza regressão; classes discretas seriam classificação.',
  },
  {
    theme: 'ia',
    difficulty: 'facil',
    prompt: 'Para que serve separar um conjunto de teste?',
    options: [
      'Para o modelo treinar em menos tempo',
      'Para medir o desempenho em dados novos',
      'Para aumentar o número de exemplos',
      'Para reduzir o número de atributos',
    ],
    answer: 1,
    explanation:
      'Avaliar em dados não usados no treino é o que estima a generalização real.',
  },
  {
    theme: 'ia',
    difficulty: 'facil',
    prompt: 'O que é uma época (epoch) no treinamento de uma rede neural?',
    options: [
      'Uma passagem completa pelo conjunto de treino',
      'Um único exemplo processado pela rede neural',
      'Uma das camadas ocultas que formam a rede',
      'Um ajuste aplicado à taxa de aprendizado',
    ],
    answer: 0,
    explanation:
      'Uma época é uma varredura completa do conjunto de treinamento.',
  },
  {
    theme: 'ia',
    difficulty: 'facil',
    prompt: 'Numa rede neural, a função de ativação serve principalmente para:',
    options: [
      'Introduzir não linearidade',
      'Reduzir o número de camadas',
      'Ordenar os dados',
      'Substituir a função de perda',
    ],
    answer: 0,
    explanation:
      'Sem não linearidade, empilhar camadas equivaleria a uma única transformação linear.',
  },
  {
    theme: 'ia',
    difficulty: 'media',
    prompt:
      'Um modelo com erro baixo no treino e alto no teste está sofrendo de:',
    options: [
      'Underfitting',
      'Overfitting',
      'Falta de dados de teste',
      'Vazamento de rótulo',
    ],
    answer: 1,
    explanation:
      'Overfitting é decorar o treino sem generalizar para dados novos.',
  },
  {
    theme: 'ia',
    difficulty: 'media',
    prompt: 'Numa base com 99% de exemplos negativos, por que acurácia engana?',
    options: [
      'Porque a acurácia não é calculável',
      'Porque prever sempre "negativo" já dá 99%',
      'Porque a acurácia ignora os negativos',
      'Porque exige dados balanceados para rodar',
    ],
    answer: 1,
    explanation:
      'Em base desbalanceada, um modelo trivial atinge acurácia alta sem acertar a classe rara.',
  },
  {
    theme: 'ia',
    difficulty: 'media',
    prompt:
      'A precisão (precision) de um classificador responde a qual pergunta?',
    options: [
      'Dos positivos reais, quantos o modelo achou?',
      'Dos apontados como positivos, quantos acertei?',
      'Quantos exemplos foram classificados ao todo?',
      'Qual o erro médio quadrático das previsões?',
    ],
    answer: 1,
    explanation:
      'Precisão mede a taxa de acerto entre os itens que o modelo apontou como positivos.',
  },
  {
    theme: 'ia',
    difficulty: 'media',
    prompt: 'Para que serve a validação cruzada (cross-validation)?',
    options: [
      'Aumentar o tamanho do conjunto de dados',
      'Estimar o desempenho em várias divisões',
      'Eliminar atributos irrelevantes da base',
      'Acelerar a convergência durante o treino',
    ],
    answer: 1,
    explanation:
      'Rodar em várias partições reduz a dependência de uma divisão de sorte.',
  },
  {
    theme: 'ia',
    difficulty: 'media',
    prompt:
      'Taxa de aprendizado muito alta no gradiente descendente tende a causar:',
    options: [
      'Convergência mais precisa',
      'Oscilação ou divergência da perda',
      'Overfitting garantido',
      'Redução do número de parâmetros',
    ],
    answer: 1,
    explanation:
      'Passos grandes demais ultrapassam o mínimo e a perda deixa de cair de forma estável.',
  },
  {
    theme: 'ia',
    difficulty: 'dificil',
    prompt: 'O trade-off viés-variância descreve a tensão entre:',
    options: [
      'Velocidade de treino e uso de memória',
      'Simplicidade demais e sensibilidade a ruído',
      'Tempo de treino e tempo de inferência',
      'Dados rotulados e dados não rotulados',
    ],
    answer: 1,
    explanation:
      'Viés alto simplifica demais; variância alta ajusta ruído. Reduzir um tende a aumentar o outro.',
  },
  {
    theme: 'ia',
    difficulty: 'dificil',
    prompt: 'Regularização L2 age sobre o modelo de que forma?',
    options: [
      'Zera completamente pesos irrelevantes',
      'Penaliza pesos grandes, encolhendo-os',
      'Aumenta o número de camadas',
      'Remove exemplos ruidosos do treino',
    ],
    answer: 1,
    explanation:
      'L2 adiciona à perda o quadrado dos pesos, empurrando-os para valores menores.',
  },
  {
    theme: 'ia',
    difficulty: 'dificil',
    prompt: 'O que caracteriza o vazamento de dados (data leakage)?',
    options: [
      'Perda de exemplos durante o carregamento',
      'Informação do teste influenciando o treino',
      'Uso de dados públicos no conjunto de treino',
      'Excesso de atributos categóricos na base',
    ],
    answer: 1,
    explanation:
      'Quando o modelo enxerga informação que não teria em produção, a avaliação fica otimista demais.',
  },
  {
    theme: 'ia',
    difficulty: 'dificil',
    prompt: 'No aprendizado por reforço, o agente aprende a partir de:',
    options: [
      'Rótulos corretos fornecidos para cada ação',
      'Recompensas obtidas ao agir no ambiente',
      'Agrupamentos de estados parecidos entre si',
      'Uma base de exemplos fixa e imutável',
    ],
    answer: 1,
    explanation:
      'O sinal de aprendizado é a recompensa acumulada, não a resposta correta por ação.',
  },

    // Ampliação do tema.
  {
    theme: "ia",
    difficulty: "facil",
    prompt: 'O que o treinamento de um modelo ajusta?',
    options: [
      'Os pesos internos do modelo',
      'O tamanho do conjunto de teste',
      'A linguagem usada no código',
      'A quantidade de atributos da base',
    ],
    answer: 0,
    explanation:
      'Treinar é buscar os pesos que reduzem a função de perda nos dados de treino.',
  },
  {
    theme: "ia",
    difficulty: "facil",
    prompt: 'O que é um token num modelo de linguagem?',
    options: [
      'Uma chave de acesso à API do modelo',
      'Um pedaço de texto processado por vez',
      'Uma camada interna da rede neural',
      'Um exemplo rotulado do conjunto',
    ],
    answer: 1,
    explanation:
      'O texto é quebrado em tokens (palavras ou pedaços delas) antes de entrar no modelo.',
  },
  {
    theme: "ia",
    difficulty: "facil",
    prompt: 'Qual destes é um algoritmo de classificação?',
    options: [
      'Agrupamento K-means',
      'Componentes principais',
      'Árvore de decisão',
      'Regras de associação',
    ],
    answer: 2,
    explanation:
      'A árvore de decisão aprende regras a partir de exemplos rotulados; os demais não usam rótulo.',
  },
  {
    theme: "ia",
    difficulty: "facil",
    prompt: 'O que uma matriz de confusão apresenta?',
    options: [
      'A correlação entre os atributos',
      'A evolução da perda por época',
      'Os pesos aprendidos em cada camada',
      'Os acertos e erros por classe',
    ],
    answer: 3,
    explanation:
      'Ela cruza a classe real com a prevista, revelando onde o modelo confunde.',
  },
  {
    theme: "ia",
    difficulty: "facil",
    prompt:
      'O que costuma acontecer quando o conjunto de treino é pequeno demais?',
    options: [
      'O modelo generaliza mal para dados novos',
      'O treino nunca chega ao fim',
      'A base precisa ser reescrita do zero',
      'O modelo passa a exigir mais memória',
    ],
    answer: 0,
    explanation:
      'Com poucos exemplos, o modelo decora o que viu e erra fora da amostra.',
  },
  {
    theme: "ia",
    difficulty: "facil",
    prompt: 'O que é um hiperparâmetro?',
    options: [
      'Um peso aprendido durante o treino',
      'Um ajuste definido antes do treino',
      'Um atributo extra criado nos dados',
      'Uma métrica calculada no teste',
    ],
    answer: 1,
    explanation:
      'Taxa de aprendizado e número de camadas são escolhas do projetista, não aprendidas.',
  },
  {
    theme: "ia",
    difficulty: "media",
    prompt: 'Por que embaralhar os dados antes de dividir treino e teste?',
    options: [
      'Para reduzir o tamanho da base usada',
      'Para acelerar o cálculo do gradiente',
      'Para evitar que a ordem crie viés',
      'Para equilibrar o número de atributos',
    ],
    answer: 2,
    explanation:
      'Se os dados vierem agrupados por classe ou data, a divisão sai enviesada.',
  },
  {
    theme: "ia",
    difficulty: "media",
    prompt: 'O que o algoritmo K-means precisa receber de antemão?',
    options: [
      'Os rótulos de cada exemplo da base',
      'A função de perda que será usada',
      'A taxa de aprendizado do modelo',
      'O número de grupos a formar',
    ],
    answer: 3,
    explanation:
      'O k é escolhido pelo usuário; o algoritmo só encontra os centros dos grupos.',
  },
  {
    theme: "ia",
    difficulty: "media",
    prompt: 'O que a revocação (recall) prioriza?',
    options: [
      'Não deixar um positivo real escapar',
      'Não classificar nada como positivo',
      'Reduzir o tempo gasto na inferência',
      'Equilibrar o tamanho das classes',
    ],
    answer: 0,
    explanation:
      'Recall alto importa quando deixar de detectar custa caro, como num exame médico.',
  },
  {
    theme: "ia",
    difficulty: "media",
    prompt: 'Por que testar uma baseline simples antes de um modelo complexo?',
    options: [
      'Porque o modelo simples treina em paralelo',
      'Para ter referência do ganho real obtido',
      'Porque a baseline dispensa dados de teste',
      'Para reduzir o número de atributos usados',
    ],
    answer: 1,
    explanation:
      'Sem referência, não dá para saber se a rede profunda acrescentou alguma coisa.',
  },
  {
    theme: "ia",
    difficulty: "media",
    prompt: 'O que o early stopping faz durante o treino?',
    options: [
      'Reduz a taxa de aprendizado pela metade',
      'Descarta os exemplos mais difíceis',
      'Encerra o treino quando a validação piora',
      'Aumenta o número de épocas planejadas',
    ],
    answer: 2,
    explanation:
      'Parar no ponto em que a validação começa a piorar evita o overfitting.',
  },
  {
    theme: "ia",
    difficulty: "dificil",
    prompt:
      'Por que a normalização em lote (batch normalization) ajuda no treino?',
    options: [
      'Porque elimina a função de ativação',
      'Porque dispensa o uso de gradiente',
      'Porque reduz o número de parâmetros',
      'Porque estabiliza a escala entre camadas',
    ],
    answer: 3,
    explanation:
      'Mantendo as ativações em escala parecida, o gradiente flui melhor e o treino acelera.',
  },
  {
    theme: "ia",
    difficulty: "dificil",
    prompt: 'O que o ajuste fino (fine-tuning) faz com um modelo pré-treinado?',
    options: [
      'Continua o treino numa tarefa específica',
      'Reinicia todos os pesos do zero',
      'Remove as camadas ocultas do modelo',
      'Converte o modelo para outra linguagem',
    ],
    answer: 0,
    explanation:
      'Parte-se do que o modelo já sabe e ajusta-se com dados da tarefa alvo.',
  },
  {
    theme: "ia",
    difficulty: "dificil",
    prompt: 'Por que uma métrica só não basta para escolher um modelo?',
    options: [
      'Porque toda métrica precisa de rótulos',
      'Porque cada métrica ignora um tipo de erro',
      'Porque métricas mudam a cada execução',
      'Porque só a acurácia é comparável',
    ],
    answer: 1,
    explanation:
      'Precisão e recall se contrapõem: olhar uma só esconde o erro que a outra mede.',
  },
  {
    theme: "ia",
    difficulty: "dificil",
    prompt: 'O que a técnica de RAG acrescenta a um modelo de linguagem?',
    options: [
      'Mais camadas na rede neural usada',
      'Um segundo modelo para revisar a saída',
      'Documentos buscados e postos no contexto',
      'Um conjunto de teste maior para avaliar',
    ],
    answer: 2,
    explanation:
      'Em vez de confiar só no que foi treinado, o modelo recebe a fonte junto da pergunta.',
  },

// ── Robótica ──────────────────────────────────────────────────────────────────
  {
    theme: 'robotica',
    difficulty: 'facil',
    prompt: 'Qual componente converte energia elétrica em movimento num robô?',
    options: ['Sensor', 'Atuador', 'Microcontrolador', 'Barramento'],
    answer: 1,
    explanation:
      'Atuadores, como motores e servos, produzem o movimento do robô.',
  },
  {
    theme: 'robotica',
    difficulty: 'facil',
    prompt: 'Um sensor ultrassônico é tipicamente usado para medir:',
    options: [
      'Temperatura do ambiente',
      'Distância até um obstáculo',
      'Corrente elétrica do motor',
      'Cor da superfície à frente',
    ],
    answer: 1,
    explanation:
      'Ele mede o tempo de eco do som refletido para estimar a distância.',
  },
  {
    theme: 'robotica',
    difficulty: 'facil',
    prompt: 'O que é um sistema embarcado?',
    options: [
      'Um computador de uso geral e programável',
      'Um sistema dedicado dentro de um equipamento',
      'Um servidor hospedado em uma nuvem pública',
      'Um protocolo de rede sem fio de curto alcance',
    ],
    answer: 1,
    explanation:
      'Embarcado é o computador dedicado a uma função específica dentro de um produto.',
  },
  {
    theme: 'robotica',
    difficulty: 'facil',
    prompt: 'Quantos graus de liberdade tem um robô que só translada em X e Y?',
    options: ['1', '2', '3', '6'],
    answer: 1,
    explanation:
      'Cada eixo independente de movimento conta como um grau de liberdade.',
  },
  {
    theme: 'robotica',
    difficulty: 'facil',
    prompt: 'Num servomotor comum, o sinal de controle define principalmente:',
    options: [
      'A posição angular desejada',
      'A tensão da bateria',
      'O protocolo de rede',
      'A temperatura do motor',
    ],
    answer: 0,
    explanation:
      'O servo interpreta a largura de pulso como o ângulo que deve manter.',
  },
  {
    theme: 'robotica',
    difficulty: 'facil',
    prompt: 'O que um encoder acoplado a uma roda normalmente mede?',
    options: [
      'Rotação e deslocamento',
      'Temperatura do eixo',
      'Umidade do ar',
      'Intensidade luminosa',
    ],
    answer: 0,
    explanation:
      'O encoder conta pulsos de rotação, permitindo estimar a distância percorrida.',
  },
  {
    theme: 'robotica',
    difficulty: 'media',
    prompt: 'Num controlador PID, o termo integral serve para corrigir:',
    options: [
      'Ruído de alta frequência do sensor',
      'Erro acumulado em regime permanente',
      'A taxa de variação do erro medido',
      'A saturação do atuador na partida',
    ],
    answer: 1,
    explanation:
      'A parcela integral acumula o erro ao longo do tempo e elimina o desvio residual.',
  },
  {
    theme: 'robotica',
    difficulty: 'media',
    prompt: 'Cinemática direta de um manipulador calcula:',
    options: [
      'Os ângulos das juntas a partir da posição da garra',
      'A posição da garra a partir dos ângulos das juntas',
      'A força necessária em cada junta',
      'O consumo de energia do robô',
    ],
    answer: 1,
    explanation:
      'A direta parte das juntas para a pose; o caminho inverso é a cinemática inversa.',
  },
  {
    theme: 'robotica',
    difficulty: 'media',
    prompt: 'Por que PWM é usado para controlar a velocidade de um motor DC?',
    options: [
      'Porque altera a frequência da rede elétrica',
      'Porque varia a tensão média ligando e desligando',
      'Porque converte sinal digital em analógico puro',
      'Porque isola eletricamente o motor do circuito',
    ],
    answer: 1,
    explanation:
      'Variando a razão entre ligado e desligado, o PWM entrega uma tensão média ajustável.',
  },
  {
    theme: 'robotica',
    difficulty: 'media',
    prompt:
      'Num sistema de tempo real duro (hard real-time), perder um prazo significa:',
    options: [
      'Apenas degradação de desempenho',
      'Falha do sistema',
      'Reinício automático',
      'Aumento do consumo de energia',
    ],
    answer: 1,
    explanation:
      'Em tempo real duro, o prazo faz parte da corretude: perdê-lo é falhar.',
  },
  {
    theme: 'robotica',
    difficulty: 'media',
    prompt:
      'Fundir leituras de vários sensores para estimar melhor um estado chama-se:',
    options: ['Amostragem', 'Fusão sensorial', 'Calibração', 'Atuação'],
    answer: 1,
    explanation:
      'A fusão sensorial combina fontes ruidosas para produzir uma estimativa mais confiável.',
  },
  {
    theme: 'robotica',
    difficulty: 'dificil',
    prompt: 'O problema de SLAM em robótica móvel consiste em:',
    options: [
      'Planejar a rota mais curta com mapa conhecido',
      'Mapear o ambiente e se localizar nele simultaneamente',
      'Calibrar sensores antes da operação',
      'Controlar a força de preensão da garra',
    ],
    answer: 1,
    explanation:
      'SLAM resolve mapa e localização ao mesmo tempo, sem conhecer nenhum dos dois de início.',
  },
  {
    theme: 'robotica',
    difficulty: 'dificil',
    prompt:
      'Pelo teorema da amostragem, para reconstruir um sinal a taxa deve ser:',
    options: [
      'Igual à maior frequência do sinal',
      'Maior que o dobro da maior frequência',
      'Metade da maior frequência',
      'Independente da frequência',
    ],
    answer: 1,
    explanation:
      'É o critério de Nyquist: amostrar abaixo do dobro causa aliasing irreversível.',
  },
  {
    theme: 'robotica',
    difficulty: 'dificil',
    prompt: 'Numa junta com folga mecânica, o efeito típico no controle é:',
    options: [
      'Aumento da precisão',
      'Zona morta na resposta ao comando',
      'Redução do consumo elétrico',
      'Eliminação de ruído no sensor',
    ],
    answer: 1,
    explanation:
      'A folga cria um intervalo em que o comando não produz movimento — a zona morta.',
  },
  {
    theme: 'robotica',
    difficulty: 'dificil',
    prompt:
      'Por que uma interrupção é preferível a polling em sistemas embarcados?',
    options: [
      'Porque consome mais CPU e por isso é mais rápida',
      'Porque libera a CPU até o evento realmente ocorrer',
      'Porque dispensa tratamento de concorrência',
      'Porque aumenta a latência de resposta',
    ],
    answer: 1,
    explanation:
      'A interrupção evita a espera ativa, deixando a CPU livre até o evento acontecer.',
  },

    // Ampliação do tema.
  {
    theme: "robotica",
    difficulty: "facil",
    prompt: 'O que um giroscópio mede num robô?',
    options: [
      'A velocidade angular do corpo',
      'A distância até o obstáculo',
      'A temperatura interna da placa',
      'A corrente consumida pelo motor',
    ],
    answer: 0,
    explanation:
      'O giroscópio mede rotação; junto do acelerômetro forma a unidade inercial.',
  },
  {
    theme: "robotica",
    difficulty: "facil",
    prompt: 'Para que serve um driver de motor numa placa embarcada?',
    options: [
      'Medir a rotação exata do eixo',
      'Entregar a corrente que a placa não dá',
      'Converter o sinal digital em som',
      'Guardar o programa do robô',
    ],
    answer: 1,
    explanation:
      'O pino do microcontrolador não sustenta a corrente do motor; o driver faz essa ponte.',
  },
  {
    theme: "robotica",
    difficulty: "facil",
    prompt: 'O que um sensor LDR mede?',
    options: [
      'A umidade relativa do ar',
      'A distância até a parede',
      'A luminosidade do ambiente',
      'A inclinação da superfície',
    ],
    answer: 2,
    explanation:
      'O LDR muda de resistência conforme a luz que incide sobre ele.',
  },
  {
    theme: "robotica",
    difficulty: "facil",
    prompt: 'O que é o efetuador final de um braço robótico?',
    options: [
      'O motor que gira a base do braço',
      'O sensor que mede o ângulo da junta',
      'A placa que executa o programa',
      'A ferramenta presa na ponta do braço',
    ],
    answer: 3,
    explanation:
      'É a garra, a ventosa ou a ferramenta que de fato interage com o objeto.',
  },
  {
    theme: "robotica",
    difficulty: "facil",
    prompt: 'O que caracteriza um robô de estrutura cartesiana?',
    options: [
      'Move-se em eixos perpendiculares entre si',
      'Gira em torno de um único eixo central',
      'Anda sobre esteiras em terreno irregular',
      'Usa juntas esféricas em toda a estrutura',
    ],
    answer: 0,
    explanation:
      'Os eixos X, Y e Z independentes tornam o posicionamento simples de calcular.',
  },
  {
    theme: "robotica",
    difficulty: "facil",
    prompt: 'Por que um robô precisa de alimentação estabilizada?',
    options: [
      'Para o programa ocupar menos memória',
      'Para a tensão não oscilar com a carga',
      'Para o encoder contar mais rápido',
      'Para reduzir o peso total do robô',
    ],
    answer: 1,
    explanation:
      'Queda de tensão quando o motor puxa corrente pode reiniciar o microcontrolador.',
  },
  {
    theme: "robotica",
    difficulty: "media",
    prompt: 'O que o barramento SPI oferece em relação ao I2C?',
    options: [
      'Menos fios para a mesma taxa',
      'Endereçamento automático dos módulos',
      'Taxa maior, ao custo de mais fios',
      'Alcance maior entre os dispositivos',
    ],
    answer: 2,
    explanation:
      'O SPI é mais rápido, mas exige uma linha de seleção por dispositivo.',
  },
  {
    theme: "robotica",
    difficulty: "media",
    prompt: 'O que é o tempo de assentamento de um sistema de controle?',
    options: [
      'O atraso entre o comando e a reação',
      'O tempo total de execução do programa',
      'O intervalo entre duas amostragens',
      'O tempo até estabilizar perto do alvo',
    ],
    answer: 3,
    explanation:
      'Mede quanto o sistema demora para parar de oscilar dentro de uma faixa aceita.',
  },
  {
    theme: "robotica",
    difficulty: "media",
    prompt: 'Para que serve um filtro passa-baixa na leitura de um sensor?',
    options: [
      'Atenuar o ruído de alta frequência',
      'Aumentar a resolução da medida',
      'Converter a leitura em digital',
      'Corrigir o erro de calibração',
    ],
    answer: 0,
    explanation:
      'O sinal útil costuma variar devagar; o ruído, rápido — o filtro separa os dois.',
  },
  {
    theme: "robotica",
    difficulty: "media",
    prompt: 'O que a resolução de um encoder determina?',
    options: [
      'A velocidade máxima do motor',
      'O menor deslocamento que ele distingue',
      'O torque aplicado ao eixo girado',
      'A tensão de alimentação exigida',
    ],
    answer: 1,
    explanation:
      'Mais pulsos por volta significam leitura de posição mais fina.',
  },
  {
    theme: "robotica",
    difficulty: "media",
    prompt: 'Por que usar uma ponte H em vez de ligar o motor direto ao pino?',
    options: [
      'Porque reduz o consumo total do circuito',
      'Porque mede a posição exata do eixo',
      'Porque permite inverter o sentido de giro',
      'Porque converte a corrente em tensão',
    ],
    answer: 2,
    explanation:
      'A ponte H chaveia a polaridade e isola a potência do circuito de comando.',
  },
  {
    theme: "robotica",
    difficulty: "dificil",
    prompt: 'O que o overshoot indica na resposta de um controlador?',
    options: [
      'O sistema nunca alcançou o alvo',
      'O sensor parou de enviar leitura',
      'O atuador ficou preso no limite',
      'A saída passou do valor desejado',
    ],
    answer: 3,
    explanation:
      'Ganho alto demais faz o sistema ultrapassar o alvo antes de voltar e estabilizar.',
  },
  {
    theme: "robotica",
    difficulty: "dificil",
    prompt: 'O que um planejador de trajetória do tipo RRT faz?',
    options: [
      'Explora o espaço livre por amostragem',
      'Testa todas as rotas possíveis do mapa',
      'Segue sempre a parede mais próxima',
      'Repete a trajetória gravada na fábrica',
    ],
    answer: 0,
    explanation:
      'A árvore cresce por pontos sorteados, o que funciona bem em espaços de muitas dimensões.',
  },
  {
    theme: "robotica",
    difficulty: "dificil",
    prompt: 'Por que a odometria acumula erro ao longo do tempo?',
    options: [
      'Porque o encoder para de contar pulsos',
      'Porque cada estimativa soma o erro anterior',
      'Porque as rodas mudam de diâmetro',
      'Porque o robô perde a conexão com o mapa',
    ],
    answer: 1,
    explanation:
      'Escorregamento e arredondamento entram em cada passo e a soma não se corrige sozinha.',
  },
  {
    theme: "robotica",
    difficulty: "dificil",
    prompt: 'O que a norma de segurança exige de um robô colaborativo?',
    options: [
      'Operar sempre dentro de uma gaiola',
      'Trabalhar apenas fora do horário útil',
      'Limitar força e velocidade perto de gente',
      'Ser desligado quando houver operador',
    ],
    answer: 2,
    explanation:
      'O cobô divide o espaço com pessoas, então o limite de energia é o que protege.',
  },

// ── Arquitetura ───────────────────────────────────────────────────────────────
  {
    theme: 'arquitetura',
    difficulty: 'facil',
    prompt: 'Qual memória é mais rápida e fica mais próxima do processador?',
    options: ['Disco SSD', 'Memória RAM', 'Cache', 'Fita magnética'],
    answer: 2,
    explanation:
      'A cache fica entre o processador e a RAM justamente por ser mais rápida.',
  },
  {
    theme: 'arquitetura',
    difficulty: 'facil',
    prompt: 'Quantos bytes há em 1 KiB (kibibyte)?',
    options: ['1000', '1024', '512', '2048'],
    answer: 1,
    explanation: 'O prefixo binário Ki vale 2¹⁰, ou seja, 1024 bytes.',
  },
  {
    theme: 'arquitetura',
    difficulty: 'facil',
    prompt:
      'Qual componente é responsável por executar as instruções de um programa?',
    options: [
      'A CPU',
      'O disco rígido',
      'A fonte de alimentação',
      'A placa de rede',
    ],
    answer: 0,
    explanation:
      'A unidade central de processamento busca, decodifica e executa as instruções.',
  },
  {
    theme: 'arquitetura',
    difficulty: 'facil',
    prompt: 'Na arquitetura de von Neumann, dados e instruções ficam:',
    options: [
      'Em memórias fisicamente separadas',
      'Na mesma memória',
      'Somente em registradores',
      'Apenas em disco',
    ],
    answer: 1,
    explanation:
      'Compartilhar a memória é o que distingue von Neumann da arquitetura Harvard.',
  },
  {
    theme: 'arquitetura',
    difficulty: 'facil',
    prompt: 'O que o sistema operacional faz no escalonamento de processos?',
    options: [
      'Decide qual processo usa a CPU e quando',
      'Compila o código-fonte de cada programa',
      'Formata o disco antes de gravar dados',
      'Traduz nomes em endereços IP na rede',
    ],
    answer: 0,
    explanation:
      'O escalonador reparte o tempo de CPU entre os processos prontos para executar.',
  },
  {
    theme: 'arquitetura',
    difficulty: 'facil',
    prompt:
      'Quantos valores distintos um registrador de 8 bits pode armazenar?',
    options: ['8', '64', '128', '256'],
    answer: 3,
    explanation: 'São 2⁸ = 256 combinações possíveis de bits.',
  },
  {
    theme: 'arquitetura',
    difficulty: 'media',
    prompt: 'Qual a principal diferença entre processo e thread?',
    options: [
      'Threads do mesmo processo dividem a memória',
      'Processos são sempre mais rápidos que threads',
      'Threads nunca conseguem executar em paralelo',
      'Processos não possuem identificador próprio',
    ],
    answer: 0,
    explanation:
      'Threads dividem memória do processo; processos têm espaços de endereçamento isolados.',
  },
  {
    theme: 'arquitetura',
    difficulty: 'media',
    prompt: 'O pipeline de instruções melhora o desempenho porque:',
    options: [
      'Reduz o número de instruções do programa',
      'Sobrepõe etapas de instruções diferentes',
      'Elimina acessos à memória',
      'Aumenta o tamanho da cache',
    ],
    answer: 1,
    explanation:
      'Enquanto uma instrução é decodificada, outra já é buscada — aumenta a vazão.',
  },
  {
    theme: 'arquitetura',
    difficulty: 'media',
    prompt: 'Para que serve a memória virtual?',
    options: [
      'Aumentar a frequência de clock do processador',
      'Dar a cada processo um espaço isolado e maior',
      'Substituir a memória cache dos processadores',
      'Acelerar o processamento da placa de vídeo',
    ],
    answer: 1,
    explanation:
      'A memória virtual isola processos e permite endereçar mais do que a RAM física.',
  },
  {
    theme: 'arquitetura',
    difficulty: 'media',
    prompt: 'Um cache miss ocorre quando:',
    options: [
      'O dado buscado não está na cache',
      'A cache está vazia por definição',
      'O processador está ocioso',
      'O disco falha na leitura',
    ],
    answer: 0,
    explanation:
      'No miss é preciso buscar o dado num nível mais lento da hierarquia de memória.',
  },
  {
    theme: 'arquitetura',
    difficulty: 'media',
    prompt: 'Uma condição de corrida (race condition) acontece quando:',
    options: [
      'Um processo consome tempo de CPU demais',
      'O resultado depende da ordem entre threads',
      'A memória do processo ficou fragmentada',
      'O disco do servidor está completamente cheio',
    ],
    answer: 1,
    explanation:
      'Sem sincronização, a ordem de acesso concorrente muda o resultado final.',
  },
  {
    theme: 'arquitetura',
    difficulty: 'dificil',
    prompt:
      'Pela Lei de Amdahl, o ganho com paralelismo é limitado principalmente por:',
    options: [
      'A quantidade de memória disponível',
      'A fração sequencial do programa',
      'A velocidade do disco',
      'O número de threads criadas',
    ],
    answer: 1,
    explanation:
      'A parte que não paraleliza vira o teto do speedup, por mais núcleos que se acrescente.',
  },
  {
    theme: 'arquitetura',
    difficulty: 'dificil',
    prompt: 'Qual condição NÃO é necessária para ocorrer deadlock?',
    options: [
      'Exclusão mútua',
      'Espera circular',
      'Preempção dos recursos',
      'Posse e espera',
    ],
    answer: 2,
    explanation:
      'Deadlock exige justamente a AUSÊNCIA de preempção; as outras três são necessárias.',
  },
  {
    theme: 'arquitetura',
    difficulty: 'dificil',
    prompt:
      'Numa chamada de sistema, por que há troca de modo usuário para kernel?',
    options: [
      'Para liberar mais memória ao processo atual',
      'Porque operações privilegiadas exigem proteção',
      'Para acelerar o pipeline de instruções da CPU',
      'Porque o compilador da linguagem assim exige',
    ],
    answer: 1,
    explanation:
      'O modo kernel dá acesso a instruções privilegiadas que o modo usuário não pode executar.',
  },
  {
    theme: 'arquitetura',
    difficulty: 'dificil',
    prompt: 'Qual princípio explica por que caches funcionam bem na prática?',
    options: [
      'Localidade temporal e espacial dos acessos',
      'A distribuição uniforme dos endereços',
      'A ausência de laços nos programas',
      'A aleatoriedade das instruções',
    ],
    answer: 0,
    explanation:
      'Programas reencostam nos mesmos dados e em vizinhos próximos, o que a cache explora.',
  },

    // Ampliação do tema.
  {
    theme: "arquitetura",
    difficulty: "facil",
    prompt: 'O que a sigla CPU significa?',
    options: [
      'Unidade central de processamento',
      'Unidade de controle de periféricos',
      'Circuito principal de uso geral',
      'Componente primário de upload',
    ],
    answer: 0,
    explanation: 'A CPU busca, decodifica e executa as instruções do programa.',
  },
  {
    theme: "arquitetura",
    difficulty: "facil",
    prompt: 'Quantos valores distintos um bit pode assumir?',
    options: ['Um', 'Dois', 'Oito', 'Dezesseis'],
    answer: 1,
    explanation: 'O bit é a menor unidade de informação: assume 0 ou 1.',
  },
  {
    theme: "arquitetura",
    difficulty: "facil",
    prompt: 'O que um sistema operacional gerencia?',
    options: [
      'Apenas os arquivos gravados em disco',
      'Somente a conexão com a internet',
      'Os recursos de hardware da máquina',
      'Apenas os programas de escritório',
    ],
    answer: 2,
    explanation:
      'CPU, memória, disco e dispositivos são repartidos entre os processos pelo SO.',
  },
  {
    theme: "arquitetura",
    difficulty: "facil",
    prompt: 'Onde um programa em execução fica carregado?',
    options: [
      'No disco rígido da máquina',
      'Na memória de apenas leitura',
      'No cache do navegador web',
      'Na memória RAM do computador',
    ],
    answer: 3,
    explanation:
      'O executável sai do disco e é carregado na RAM para o processador acessá-lo.',
  },
  {
    theme: "arquitetura",
    difficulty: "facil",
    prompt: 'O que é o kernel de um sistema operacional?',
    options: [
      'O núcleo que controla o hardware',
      'A interface gráfica do usuário',
      'O programa que instala o sistema',
      'O driver de uma placa específica',
    ],
    answer: 0,
    explanation:
      'O kernel roda em modo privilegiado e media todo acesso ao hardware.',
  },
  {
    theme: "arquitetura",
    difficulty: "facil",
    prompt: 'Qual é a função do barramento num computador?',
    options: [
      'Armazenar os dados de forma permanente',
      'Ligar os componentes para trocar dados',
      'Converter a energia da tomada em 12 V',
      'Executar as operações aritméticas',
    ],
    answer: 1,
    explanation:
      'O barramento é o caminho compartilhado por onde dados, endereços e controle passam.',
  },
  {
    theme: "arquitetura",
    difficulty: "media",
    prompt: 'O que um semáforo resolve na programação concorrente?',
    options: [
      'A falta de memória para os processos',
      'A lentidão do acesso ao disco rígido',
      'O acesso concorrente a um recurso',
      'A ordem de chegada das requisições',
    ],
    answer: 2,
    explanation:
      'Ele limita quantos fluxos entram na seção crítica ao mesmo tempo.',
  },
  {
    theme: "arquitetura",
    difficulty: "media",
    prompt: 'O que é a fragmentação externa da memória?',
    options: [
      'Espaço perdido dentro de cada bloco',
      'Dados gravados em setores errados',
      'Excesso de processos na fila de espera',
      'Espaço livre espalhado e inutilizável',
    ],
    answer: 3,
    explanation:
      'Sobra memória no total, mas nenhum trecho contíguo grande o bastante.',
  },
  {
    theme: "arquitetura",
    difficulty: "media",
    prompt: 'O que o swap faz quando a memória RAM acaba?',
    options: [
      'Move páginas pouco usadas para o disco',
      'Encerra o processo mais recente',
      'Compacta os dados dentro da RAM',
      'Desliga parte dos núcleos da CPU',
    ],
    answer: 0,
    explanation:
      'O disco vira extensão da RAM — funciona, mas é ordens de grandeza mais lento.',
  },
  {
    theme: "arquitetura",
    difficulty: "media",
    prompt: 'Por que os registradores são mais rápidos que a memória RAM?',
    options: [
      'Porque guardam menos bits por posição',
      'Porque ficam dentro do processador',
      'Porque não perdem dados sem energia',
      'Porque são acessados em paralelo',
    ],
    answer: 1,
    explanation:
      'Distância física e tecnologia: o registrador é acessado no mesmo ciclo de clock.',
  },
  {
    theme: "arquitetura",
    difficulty: "media",
    prompt: 'O que caracteriza um escalonamento preemptivo?',
    options: [
      'O processo roda até terminar sozinho',
      'A ordem segue apenas a chegada na fila',
      'O sistema pode tirar a CPU do processo',
      'Cada processo escolhe o próprio tempo',
    ],
    answer: 2,
    explanation:
      'Sem preempção, um processo em laço infinito travaria a máquina inteira.',
  },
  {
    theme: "arquitetura",
    difficulty: "dificil",
    prompt: 'Por que o ritmo previsto pela Lei de Moore desacelerou?',
    options: [
      'Porque faltou demanda por processadores',
      'Porque o software parou de evoluir',
      'Porque a memória virou o único gargalo',
      'Porque limites físicos e térmicos apertaram',
    ],
    answer: 3,
    explanation:
      'Dissipação de calor e dimensões atômicas limitam a miniaturização.',
  },
  {
    theme: "arquitetura",
    difficulty: "dificil",
    prompt: 'O que um pipeline de cinco estágios melhora, no caso ideal?',
    options: [
      'A vazão, não a latência de uma instrução',
      'A latência de cada instrução isolada',
      'O consumo de energia do processador',
      'O tamanho do programa em memória',
    ],
    answer: 0,
    explanation:
      'Cada instrução leva o mesmo tempo (ou mais); o ganho é terminar uma por ciclo.',
  },
  {
    theme: "arquitetura",
    difficulty: "dificil",
    prompt: 'O que a exclusão mútua garante numa seção crítica?',
    options: [
      'Que a seção execute o mais rápido possível',
      'Que só um fluxo execute ali por vez',
      'Que nenhum processo fique esperando',
      'Que o resultado seja sempre o mesmo',
    ],
    answer: 1,
    explanation:
      'É a condição que impede duas threads de corromperem o mesmo dado.',
  },
  {
    theme: "arquitetura",
    difficulty: "dificil",
    prompt: 'Por que a cache trabalha com linhas, e não com bytes isolados?',
    options: [
      'Porque a RAM só entrega blocos grandes',
      'Porque reduz o custo de fabricação',
      'Porque explora a localidade espacial',
      'Porque o barramento exige esse formato',
    ],
    answer: 2,
    explanation:
      'Trazer os vizinhos junto aproveita que eles tendem a ser acessados em seguida.',
  },

// ── Engenharia de Software ────────────────────────────────────────────────────
  {
    theme: 'engenharia-software',
    difficulty: 'facil',
    prompt:
      'Como se chama o documento que descreve o que o sistema deve fazer?',
    options: [
      'Manual do usuário',
      'Especificação de requisitos',
      'Plano de testes',
      'Relatório de entrega',
    ],
    answer: 1,
    explanation:
      'A especificação de requisitos registra o que foi acordado e vira a referência para desenvolver e testar.',
  },
  {
    theme: 'engenharia-software',
    difficulty: 'facil',
    prompt: 'No Scrum, quem prioriza os itens do backlog do produto?',
    options: [
      'O Scrum Master',
      'Qualquer pessoa do time',
      'O Product Owner',
      'O cliente final, diretamente',
    ],
    answer: 2,
    explanation:
      'O Product Owner responde pelo valor entregue e por isso decide a ordem dos itens.',
  },
  {
    theme: 'engenharia-software',
    difficulty: 'facil',
    prompt: 'O que um caso de teste precisa descrever?',
    options: [
      'Só o resultado obtido na execução',
      'Apenas o nome do desenvolvedor responsável',
      'Somente o módulo afetado',
      'Entrada, passos e resultado esperado',
    ],
    answer: 3,
    explanation:
      'Sem resultado esperado não há como dizer se o teste passou: ele vira apenas uma execução.',
  },
  {
    theme: 'engenharia-software',
    difficulty: 'facil',
    prompt: 'O que significa refatorar um código?',
    options: [
      'Melhorar a estrutura sem mudar o comportamento',
      'Reescrever o sistema inteiro em outra linguagem',
      'Adicionar uma funcionalidade nova ao sistema',
      'Corrigir um defeito reportado pelo cliente',
    ],
    answer: 0,
    explanation:
      'Refatoração muda como o código está escrito, não o que ele faz — por isso depende de testes.',
  },
  {
    theme: 'engenharia-software',
    difficulty: 'facil',
    prompt:
      'Num diagrama de classes da UML, a seta de herança aponta para quê?',
    options: [
      'Para a subclasse',
      'Para a superclasse',
      'Para a classe que instancia',
      'Para o pacote que contém a classe',
    ],
    answer: 1,
    explanation:
      'A generalização aponta do específico para o geral: a subclasse aponta para a superclasse.',
  },
  {
    theme: 'engenharia-software',
    difficulty: 'facil',
    prompt: 'O que é code review?',
    options: [
      'A execução automática dos testes na integração',
      'A revisão do código por outra pessoa antes de integrar',
      'A medição de desempenho do sistema',
      'A documentação gerada a partir dos comentários',
    ],
    answer: 1,
    explanation:
      'É uma inspeção humana: pega problemas de projeto e legibilidade que o teste automatizado não vê.',
  },
  {
    theme: 'engenharia-software',
    difficulty: 'media',
    prompt: 'Em BPMN, o que um círculo de borda fina representa?',
    options: [
      'Um evento de início',
      'Um evento de fim',
      'Uma tarefa manual',
      'Um subprocesso',
    ],
    answer: 0,
    explanation:
      'O início tem borda fina e o fim tem borda grossa — é assim que se lê a direção do fluxo.',
  },
  {
    theme: 'engenharia-software',
    difficulty: 'media',
    prompt: 'Para que serve um protótipo de baixa fidelidade?',
    options: [
      'Substituir a documentação do sistema',
      'Testar o desempenho sob carga',
      'Validar a ideia cedo e com pouco custo',
      'Entregar o produto final ao cliente',
    ],
    answer: 2,
    explanation:
      'Um rascunho barato permite descobrir que a ideia está errada antes de investir em código.',
  },
  {
    theme: 'engenharia-software',
    difficulty: 'media',
    prompt: 'O que um teste de integração verifica?',
    options: [
      'Uma função isolada do sistema',
      'A interação entre módulos que já funcionam separados',
      'A aparência da interface em vários navegadores',
      'A ortografia das mensagens exibidas',
    ],
    answer: 1,
    explanation:
      'Muitos defeitos aparecem só na fronteira entre componentes, que o teste unitário não exercita.',
  },
  {
    theme: 'engenharia-software',
    difficulty: 'media',
    prompt: 'Por que "o sistema deve ser rápido" é um requisito ruim?',
    options: [
      'Porque é um requisito não funcional',
      'Porque não pode ser verificado objetivamente',
      'Porque não menciona a tecnologia usada',
      'Porque deveria estar no manual do usuário',
    ],
    answer: 1,
    explanation:
      'Sem um número não há como testar: "rápido" muda de significado conforme quem lê.',
  },
  {
    theme: 'engenharia-software',
    difficulty: 'media',
    prompt: 'O que é manutenção corretiva?',
    options: [
      'Adaptar o sistema a um novo sistema operacional',
      'Acrescentar funcionalidades pedidas depois da entrega',
      'Melhorar o desempenho de uma consulta lenta',
      'Corrigir um defeito encontrado depois da entrega',
    ],
    answer: 3,
    explanation:
      'Corretiva conserta defeito; adaptativa acompanha mudanças de ambiente; evolutiva acrescenta recurso.',
  },
  {
    theme: 'engenharia-software',
    difficulty: 'dificil',
    prompt: 'Qual combinação de acoplamento e coesão é desejável num projeto?',
    options: [
      'Alto acoplamento e alta coesão',
      'Baixo acoplamento e alta coesão',
      'Baixo acoplamento e baixa coesão',
      'Alto acoplamento e baixa coesão',
    ],
    answer: 1,
    explanation:
      'Módulos com responsabilidade clara (coesos) e pouca dependência entre si são fáceis de mudar isoladamente.',
  },
  {
    theme: 'engenharia-software',
    difficulty: 'dificil',
    prompt:
      'Num diagrama de casos de uso, o que o relacionamento «include» indica?',
    options: [
      'Um comportamento opcional, ativado por condição',
      'Uma relação de herança entre os dois atores',
      'Um comportamento obrigatório reaproveitado',
      'A ordem em que os casos de uso são executados',
    ],
    answer: 2,
    explanation:
      'O «include» sempre ocorre; o opcional é o «extend», que depende de um ponto de extensão.',
  },
  {
    theme: 'engenharia-software',
    difficulty: 'dificil',
    prompt: 'O que caracteriza a prática de integração contínua?',
    options: [
      'Publicar uma versão em produção toda semana',
      'Manter uma branch por desenvolvedor até o fim do projeto',
      'Revisar o código só antes da entrega final',
      'Integrar e testar o código com frequência, em build automatizado',
    ],
    answer: 3,
    explanation:
      'Integrar em pequenos passos torna cada conflito pequeno e revela a quebra no mesmo dia em que ela aparece.',
  },
  {
    theme: 'engenharia-software',
    difficulty: 'dificil',
    prompt: 'O que diferencia um modelo incremental do modelo cascata?',
    options: [
      'O incremental entrega partes utilizáveis a cada ciclo',
      'O incremental dispensa levantamento de requisitos',
      'O cascata não prevê fase de testes',
      'O cascata exige equipes maiores',
    ],
    answer: 0,
    explanation:
      'Entregar em fatias permite corrigir o rumo com feedback real, em vez de descobrir o erro só no fim.',
  },

    // Ampliação do tema.
  {
    theme: "engenharia-software",
    difficulty: "facil",
    prompt: 'O que um requisito não funcional descreve?',
    options: [
      'Uma qualidade esperada do sistema',
      'Uma função que o sistema executa',
      'Um ator que interage com o sistema',
      'Uma tabela do banco de dados',
    ],
    answer: 0,
    explanation:
      'Desempenho, segurança e usabilidade são qualidades, não funções do sistema.',
  },
  {
    theme: "engenharia-software",
    difficulty: "facil",
    prompt: 'O que o Scrum Master faz no time?',
    options: [
      'Prioriza os itens do backlog',
      'Remove impedimentos e cuida do processo',
      'Aprova o orçamento com o cliente',
      'Escreve todo o código da sprint',
    ],
    answer: 1,
    explanation: 'Ele facilita o processo; priorizar é papel do Product Owner.',
  },
  {
    theme: "engenharia-software",
    difficulty: "facil",
    prompt: 'Para que serve um sistema de controle de versão num time?',
    options: [
      'Hospedar a aplicação em produção',
      'Medir a produtividade de cada um',
      'Guardar o histórico e desfazer mudanças',
      'Compilar o projeto automaticamente',
    ],
    answer: 2,
    explanation:
      'O histórico permite descobrir o que mudou, quando e por quê — e desfazer.',
  },
  {
    theme: "engenharia-software",
    difficulty: "facil",
    prompt: 'O que é um merge no Git?',
    options: [
      'A cópia inicial do repositório remoto',
      'O envio das alterações ao servidor',
      'O registro de uma alteração no histórico',
      'A junção de duas linhas de trabalho',
    ],
    answer: 3,
    explanation:
      'O merge traz o que foi feito num branch para outro, resolvendo conflitos se houver.',
  },
  {
    theme: "engenharia-software",
    difficulty: "facil",
    prompt: 'Qual é a vantagem do teste automatizado sobre o manual?',
    options: [
      'Pode ser repetido a cada mudança',
      'Dispensa escrever o resultado esperado',
      'Encontra qualquer defeito do sistema',
      'Elimina a necessidade de revisão',
    ],
    answer: 0,
    explanation:
      'O custo de rodar de novo é quase zero, o que sustenta a rede de segurança.',
  },
  {
    theme: "engenharia-software",
    difficulty: "facil",
    prompt: 'O que a fase de análise de requisitos produz?',
    options: [
      'O código-fonte da primeira versão',
      'O entendimento do que o sistema fará',
      'O plano de implantação nos servidores',
      'O manual de operação do produto',
    ],
    answer: 1,
    explanation:
      'É onde a necessidade do cliente vira descrição verificável do que construir.',
  },
  {
    theme: "engenharia-software",
    difficulty: "media",
    prompt: 'Em BPMN, o que uma seta tracejada (fluxo de mensagem) liga?',
    options: [
      'Duas tarefas da mesma raia',
      'Um evento inicial ao seu gateway',
      'Participantes diferentes do processo',
      'Um subprocesso ao seu detalhamento',
    ],
    answer: 2,
    explanation:
      'Dentro da mesma piscina o fluxo é sequencial; entre piscinas, é mensagem.',
  },
  {
    theme: "engenharia-software",
    difficulty: "media",
    prompt: 'O que um diagrama de estados da UML mostra?',
    options: [
      'A ordem das mensagens entre objetos',
      'A estrutura estática de cada classe',
      'A distribuição física dos componentes',
      'As situações pelas quais um objeto passa',
    ],
    answer: 3,
    explanation: 'Ele descreve estados e as transições disparadas por eventos.',
  },
  {
    theme: "engenharia-software",
    difficulty: "media",
    prompt: 'Por que registrar um bug com os passos de reprodução?',
    options: [
      'Porque sem reproduzir não dá para corrigir',
      'Porque o relatório precisa ser extenso',
      'Porque o cliente exige esse formato',
      'Porque agiliza o cálculo da cobertura',
    ],
    answer: 0,
    explanation:
      'Um defeito que ninguém consegue repetir também não pode ser verificado como resolvido.',
  },
  {
    theme: "engenharia-software",
    difficulty: "media",
    prompt: 'O que uma revisão de código costuma pegar e o teste não?',
    options: [
      'Erros de cálculo em casos extremos',
      'Problemas de projeto e legibilidade',
      'Falhas de integração entre módulos',
      'Lentidão do sistema sob carga alta',
    ],
    answer: 1,
    explanation:
      'O teste diz se funciona; a revisão diz se dá para manter aquilo daqui a um ano.',
  },
  {
    theme: "engenharia-software",
    difficulty: "media",
    prompt: 'O que caracteriza o modelo espiral de desenvolvimento?',
    options: [
      'Entrega tudo de uma vez, no fim',
      'Dispensa o levantamento de requisitos',
      'Repete ciclos guiados por análise de risco',
      'Exige equipes de no mínimo dez pessoas',
    ],
    answer: 2,
    explanation:
      'A cada volta, avalia-se o risco antes de decidir o que construir em seguida.',
  },
  {
    theme: "engenharia-software",
    difficulty: "dificil",
    prompt: 'O que o princípio aberto/fechado (OCP) propõe?',
    options: [
      'Manter todo atributo de classe privado',
      'Escrever o teste antes do código novo',
      'Limitar cada classe a um único método',
      'Ser aberto a extensão e fechado a mudança',
    ],
    answer: 3,
    explanation:
      'Acrescentar comportamento sem editar o que já funciona reduz o risco de regressão.',
  },
  {
    theme: "engenharia-software",
    difficulty: "dificil",
    prompt: 'Por que testes unitários devem ser independentes entre si?',
    options: [
      'Porque um não pode depender do outro',
      'Porque assim rodam em menos memória',
      'Porque o framework não aceita ordem fixa',
      'Porque reduzem a cobertura de código',
    ],
    answer: 0,
    explanation:
      'Dependência de ordem gera falha fantasma e esconde o teste que realmente quebrou.',
  },
  {
    theme: "engenharia-software",
    difficulty: "dificil",
    prompt: 'O que a entrega contínua acrescenta à integração contínua?',
    options: [
      'Executa os testes a cada commit feito',
      'Deixa toda versão pronta para publicar',
      'Substitui a revisão de código do time',
      'Elimina a necessidade de ambiente de teste',
    ],
    answer: 1,
    explanation:
      'A integração garante que compila e passa; a entrega garante que dá para publicar.',
  },
  {
    theme: "engenharia-software",
    difficulty: "dificil",
    prompt: 'Por que 100% de cobertura não garante ausência de bugs?',
    options: [
      'Porque a cobertura é sempre estimada',
      'Porque alguns testes rodam em paralelo',
      'Porque executar o código não é verificá-lo',
      'Porque a métrica ignora os testes lentos',
    ],
    answer: 2,
    explanation:
      'Um teste sem asserção executa a linha e não checa nada: a linha conta como coberta.',
  },

// ── Redes ─────────────────────────────────────────────────────────────────────
  {
    theme: 'redes',
    difficulty: 'facil',
    prompt: 'Qual protocolo garante entrega ordenada e confiável dos dados?',
    options: ['UDP', 'TCP', 'ICMP', 'ARP'],
    answer: 1,
    explanation:
      'O TCP confirma recebimento, retransmite perdas e reordena segmentos.',
  },
  {
    theme: 'redes',
    difficulty: 'facil',
    prompt: 'Para que serve o DNS?',
    options: [
      'Atribuir endereços IP automaticamente',
      'Traduzir nomes de domínio em endereços IP',
      'Criptografar o tráfego',
      'Rotear pacotes entre redes',
    ],
    answer: 1,
    explanation:
      'O DNS resolve nomes legíveis para os endereços numéricos usados no roteamento.',
  },
  {
    theme: 'redes',
    difficulty: 'facil',
    prompt: 'Qual porta é usada por padrão pelo HTTPS?',
    options: ['21', '80', '443', '8080'],
    answer: 2,
    explanation: 'HTTPS usa a porta 443; a 80 é do HTTP sem criptografia.',
  },
  {
    theme: 'redes',
    difficulty: 'facil',
    prompt: 'Quantos bits tem um endereço IPv4?',
    options: ['16', '32', '64', '128'],
    answer: 1,
    explanation: 'IPv4 usa 32 bits, escritos como quatro octetos decimais.',
  },
  {
    theme: 'redes',
    difficulty: 'facil',
    prompt:
      'Qual serviço distribui endereços IP automaticamente numa rede local?',
    options: ['DNS', 'DHCP', 'NAT', 'FTP'],
    answer: 1,
    explanation:
      'O DHCP concede endereços e parâmetros de rede aos dispositivos que se conectam.',
  },
  {
    theme: 'redes',
    difficulty: 'facil',
    prompt: 'Um código de status HTTP 404 indica:',
    options: [
      'Erro interno do servidor',
      'Recurso não encontrado',
      'Requisição bem-sucedida',
      'Acesso não autorizado',
    ],
    answer: 1,
    explanation:
      'A família 4xx indica erro do cliente; 404 é especificamente recurso inexistente.',
  },
  {
    theme: 'redes',
    difficulty: 'media',
    prompt: 'Qual a principal diferença entre TCP e UDP?',
    options: [
      'UDP é mais lento que TCP na mesma rede',
      'TCP garante entrega e ordem; UDP não',
      'UDP criptografa os dados transmitidos',
      'TCP não usa portas, apenas endereços',
    ],
    answer: 1,
    explanation: 'UDP troca as garantias por menor latência e menos overhead.',
  },
  {
    theme: 'redes',
    difficulty: 'media',
    prompt: 'Em qual camada do modelo OSI atua um switch tradicional?',
    options: ['Física', 'Enlace', 'Rede', 'Aplicação'],
    answer: 1,
    explanation:
      'O switch comuta quadros usando endereços MAC, que pertencem à camada de enlace.',
  },
  {
    theme: 'redes',
    difficulty: 'media',
    prompt: 'O que o NAT faz numa rede doméstica?',
    options: [
      'Traduz endereços privados em um público',
      'Resolve nomes de domínio em endereços',
      'Criptografa o tráfego de saída da rede',
      'Distribui endereços IP aos dispositivos',
    ],
    answer: 0,
    explanation:
      'O NAT permite vários dispositivos internos compartilharem um único IP público.',
  },
  {
    theme: 'redes',
    difficulty: 'media',
    prompt: 'Numa máscara /24, quantos endereços de host utilizáveis existem?',
    options: ['254', '256', '128', '512'],
    answer: 0,
    explanation:
      'São 256 endereços, menos o de rede e o de broadcast, restando 254 utilizáveis.',
  },
  {
    theme: 'redes',
    difficulty: 'media',
    prompt: 'O que caracteriza o HTTP como protocolo sem estado (stateless)?',
    options: [
      'Não utiliza o TCP como transporte',
      'Cada requisição independe das anteriores',
      'Não permite autenticação do usuário',
      'Não aceita cabeçalhos na requisição',
    ],
    answer: 1,
    explanation:
      'O servidor não guarda contexto entre requisições; daí a necessidade de cookies ou tokens.',
  },
  {
    theme: 'redes',
    difficulty: 'dificil',
    prompt: 'Qual é o propósito do handshake de três vias do TCP?',
    options: [
      'Criptografar a conexão entre as pontas',
      'Sincronizar números de sequência iniciais',
      'Comprimir os dados antes de enviá-los',
      'Escolher a rota que os pacotes seguirão',
    ],
    answer: 1,
    explanation:
      'SYN, SYN-ACK e ACK acertam os números de sequência iniciais dos dois lados.',
  },
  {
    theme: 'redes',
    difficulty: 'dificil',
    prompt: 'O que o TTL de um pacote IP evita?',
    options: [
      'Perda de pacotes por congestionamento',
      'Que pacotes circulem para sempre em loops',
      'Fragmentação excessiva ao longo do caminho',
      'Ataques de negação de serviço distribuídos',
    ],
    answer: 1,
    explanation:
      'Cada salto decrementa o TTL; ao zerar, o pacote é descartado e o loop se encerra.',
  },
  {
    theme: 'redes',
    difficulty: 'dificil',
    prompt: 'No TLS, para que serve o certificado apresentado pelo servidor?',
    options: [
      'Comprimir o tráfego trocado na conexão',
      'Ligar a identidade do servidor a uma chave',
      'Acelerar o handshake da conexão segura',
      'Substituir a consulta ao servidor DNS',
    ],
    answer: 1,
    explanation:
      'O certificado prova que aquela chave pública pertence àquele domínio, segundo uma autoridade.',
  },
  {
    theme: 'redes',
    difficulty: 'dificil',
    prompt:
      'Por que WebSocket é preferível a polling para atualizações em tempo real?',
    options: [
      'Porque usa o UDP no lugar do TCP e é mais leve',
      'Porque mantém a conexão aberta nos dois sentidos',
      'Porque dispensa a autenticação do cliente',
      'Porque comprime os dados automaticamente',
    ],
    answer: 1,
    explanation:
      'A conexão persistente elimina o custo de abrir requisições repetidas para perguntar por novidades.',
  },

    // Ampliação do tema.
  {
    theme: "redes",
    difficulty: "facil",
    prompt: 'O que uma URL identifica?',
    options: [
      'O endereço de um recurso na web',
      'O número de série do servidor',
      'A velocidade da conexão usada',
      'A porta física do cabo de rede',
    ],
    answer: 0,
    explanation: 'A URL diz o protocolo, o host e o caminho até o recurso.',
  },
  {
    theme: "redes",
    difficulty: "facil",
    prompt: 'Qual código de status HTTP indica sucesso?',
    options: ['301', '200', '404', '500'],
    answer: 1,
    explanation:
      'A família 2xx indica sucesso; 200 é a resposta padrão de uma requisição atendida.',
  },
  {
    theme: "redes",
    difficulty: "facil",
    prompt: 'O que um roteador doméstico faz?',
    options: [
      'Amplia o alcance do cabo de rede',
      'Traduz nomes de domínio em endereços',
      'Liga a rede local à internet',
      'Guarda os arquivos compartilhados',
    ],
    answer: 2,
    explanation:
      'Ele encaminha pacotes entre a rede de casa e a rede do provedor.',
  },
  {
    theme: "redes",
    difficulty: "facil",
    prompt: 'O que significa a sigla LAN?',
    options: ['Rede ampla', 'Rede lógica', 'Rede aberta', 'Rede local'],
    answer: 3,
    explanation:
      'Local Area Network: a rede de um ambiente restrito, como casa ou escritório.',
  },
  {
    theme: "redes",
    difficulty: "facil",
    prompt: 'Qual protocolo transfere as páginas da web?',
    options: ['HTTP', 'SMTP', 'FTP', 'DNS'],
    answer: 0,
    explanation:
      'O HTTP é o protocolo de aplicação usado entre o navegador e o servidor web.',
  },
  {
    theme: "redes",
    difficulty: "facil",
    prompt: 'O que a latência de uma conexão mede?',
    options: [
      'Quantos dados passam por segundo',
      'Quanto tempo o pacote leva até chegar',
      'Quantos dispositivos estão conectados',
      'Qual o alcance máximo do sinal',
    ],
    answer: 1,
    explanation:
      'Latência é atraso; banda é volume por tempo. Uma conexão larga pode ser lenta.',
  },
  {
    theme: "redes",
    difficulty: "media",
    prompt: 'O que o código de status HTTP 500 indica?',
    options: [
      'O recurso pedido não foi encontrado',
      'O cliente não tem autorização de acesso',
      'O servidor falhou ao processar o pedido',
      'A página foi movida em definitivo',
    ],
    answer: 2,
    explanation:
      'A família 5xx aponta erro do lado do servidor, não da requisição feita.',
  },
  {
    theme: "redes",
    difficulty: "media",
    prompt: 'Por que o HTTPS é preferível ao HTTP?',
    options: [
      'Porque usa menos banda na transmissão',
      'Porque dispensa o uso de servidor DNS',
      'Porque funciona mesmo sem conexão',
      'Porque cifra e autentica o que trafega',
    ],
    answer: 3,
    explanation:
      'Sem TLS, qualquer ponto do caminho lê e pode alterar o conteúdo.',
  },
  {
    theme: "redes",
    difficulty: "media",
    prompt: 'O que um cookie de sessão guarda?',
    options: [
      'Um identificador da sessão do usuário',
      'A senha do usuário em texto puro',
      'A página inteira para uso off-line',
      'O endereço IP do servidor de origem',
    ],
    answer: 0,
    explanation:
      'Como o HTTP não guarda estado, o cookie devolve a identidade a cada requisição.',
  },
  {
    theme: "redes",
    difficulty: "media",
    prompt: 'O que a porta identifica numa conexão de rede?',
    options: [
      'O caminho físico até o destino',
      'Qual aplicação vai receber os dados',
      'A velocidade máxima do enlace',
      'O endereço do roteador de saída',
    ],
    answer: 1,
    explanation:
      'O IP leva ao host; a porta diz a qual processo entregar o pacote.',
  },
  {
    theme: "redes",
    difficulty: "media",
    prompt: 'O que diferencia uma rede ponto a ponto de cliente-servidor?',
    options: [
      'Ela dispensa o uso de endereços IP',
      'Ela funciona apenas em rede local',
      'Todos os nós servem e consomem dados',
      'Ela não precisa de protocolo definido',
    ],
    answer: 2,
    explanation:
      'No modelo P2P não há papel fixo: cada nó oferece e consome recursos.',
  },
  {
    theme: "redes",
    difficulty: "dificil",
    prompt:
      'Por que um ataque de negação de serviço distribuído é difícil de barrar?',
    options: [
      'Porque usa portas que não podem ser fechadas',
      'Porque explora uma falha do protocolo TCP',
      'Porque o tráfego vem sempre criptografado',
      'Porque o tráfego vem de muitas origens',
    ],
    answer: 3,
    explanation:
      'Bloquear um IP não resolve quando milhares de máquinas legítimas enviam o tráfego.',
  },
  {
    theme: "redes",
    difficulty: "dificil",
    prompt: 'O que o handshake do TLS negocia antes dos dados?',
    options: [
      'As chaves e o algoritmo de cifra',
      'A rota que os pacotes vão seguir',
      'A largura de banda da conexão',
      'O tempo de vida dos pacotes IP',
    ],
    answer: 0,
    explanation:
      'As duas pontas combinam a suíte criptográfica e derivam a chave da sessão.',
  },
  {
    theme: "redes",
    difficulty: "dificil",
    prompt: 'Para que serve o cabeçalho Host numa requisição HTTP?',
    options: [
      'Informar o navegador usado no acesso',
      'Permitir vários sites no mesmo IP',
      'Definir a codificação do conteúdo',
      'Autenticar o usuário no servidor',
    ],
    answer: 1,
    explanation:
      'Sem ele, o servidor não saberia qual dos domínios hospedados deve responder.',
  },
  {
    theme: "redes",
    difficulty: "dificil",
    prompt: 'Por que o IPv6 dispensa o NAT na maioria dos casos?',
    options: [
      'Porque o NAT não funciona com IPv6',
      'Porque o IPv6 cifra todo o tráfego',
      'Porque há endereços de sobra para todos',
      'Porque o IPv6 não usa roteadores',
    ],
    answer: 2,
    explanation:
      'O NAT nasceu da escassez de IPv4; com 128 bits, cada dispositivo pode ter o seu.',
  },

// ── Banco de Dados ────────────────────────────────────────────────────────────
  {
    theme: 'banco',
    difficulty: 'facil',
    prompt: 'Qual comando SQL recupera dados de uma tabela?',
    options: ['INSERT', 'SELECT', 'UPDATE', 'DELETE'],
    answer: 1,
    explanation:
      'SELECT é o comando de consulta; os outros modificam os dados.',
  },
  {
    theme: 'banco',
    difficulty: 'facil',
    prompt: 'O que é uma chave primária?',
    options: [
      'Um campo que identifica unicamente cada linha',
      'Um campo que aponta para outra tabela',
      'Um índice opcional para acelerar buscas',
      'Um campo sempre numérico',
    ],
    answer: 0,
    explanation: 'A chave primária garante unicidade e não aceita valor nulo.',
  },
  {
    theme: 'banco',
    difficulty: 'facil',
    prompt: 'Qual cláusula SQL filtra linhas antes do agrupamento?',
    options: ['HAVING', 'WHERE', 'ORDER BY', 'GROUP BY'],
    answer: 1,
    explanation:
      'WHERE filtra linhas individuais; HAVING filtra grupos já formados.',
  },
  {
    theme: 'banco',
    difficulty: 'facil',
    prompt: 'O que uma chave estrangeira representa?',
    options: [
      'Uma referência a uma chave de outra tabela',
      'Um campo criptografado pelo banco de dados',
      'Um índice que garante valores sempre únicos',
      'Um campo calculado a partir de outras colunas',
    ],
    answer: 0,
    explanation:
      'A chave estrangeira liga tabelas e mantém a integridade referencial.',
  },
  {
    theme: 'banco',
    difficulty: 'facil',
    prompt: 'Qual função SQL conta o número de linhas de um resultado?',
    options: ['SUM()', 'COUNT()', 'AVG()', 'MAX()'],
    answer: 1,
    explanation:
      'COUNT() retorna a quantidade de linhas que satisfazem a consulta.',
  },
  {
    theme: 'banco',
    difficulty: 'facil',
    prompt: 'Num banco relacional, uma tabela é composta por:',
    options: [
      'Linhas e colunas',
      'Nós e arestas',
      'Chaves e valores',
      'Documentos aninhados',
    ],
    answer: 0,
    explanation:
      'O modelo relacional organiza dados em relações — tabelas de linhas e colunas.',
  },
  {
    theme: 'banco',
    difficulty: 'media',
    prompt: 'Qual a diferença entre INNER JOIN e LEFT JOIN?',
    options: [
      'LEFT JOIN mantém as linhas da esquerda sem par',
      'INNER JOIN é sempre mais lento que o LEFT JOIN',
      'LEFT JOIN só funciona sobre a chave primária',
      'Não existe diferença prática entre os dois',
    ],
    answer: 0,
    explanation:
      'O LEFT JOIN preserva as linhas da esquerda, preenchendo com nulo o que não casa.',
  },
  {
    theme: 'banco',
    difficulty: 'media',
    prompt: 'No acrônimo ACID, o "A" de atomicidade significa que a transação:',
    options: [
      'Executa em paralelo com outras',
      'Ocorre inteira ou não ocorre',
      'Persiste após falha de energia',
      'Mantém as regras de integridade',
    ],
    answer: 1,
    explanation:
      'Atomicidade impede estados intermediários: ou tudo é aplicado, ou nada é.',
  },
  {
    theme: 'banco',
    difficulty: 'media',
    prompt: 'Para que serve um índice numa tabela?',
    options: [
      'Reduzir o espaço que a tabela ocupa em disco',
      'Acelerar buscas ao custo de escritas caras',
      'Garantir a unicidade dos valores da coluna',
      'Substituir a chave primária definida na tabela',
    ],
    answer: 1,
    explanation:
      'O índice troca espaço e custo de escrita por leitura mais rápida.',
  },
  {
    theme: 'banco',
    difficulty: 'media',
    prompt: 'A primeira forma normal (1FN) exige que:',
    options: [
      'Não existam dependências transitivas',
      'Os valores dos atributos sejam atômicos',
      'Toda tabela tenha índice',
      'Não haja chaves estrangeiras',
    ],
    answer: 1,
    explanation:
      'A 1FN elimina grupos repetitivos, exigindo um único valor por célula.',
  },
  {
    theme: 'banco',
    difficulty: 'media',
    prompt: 'Em SQL, comparar um campo com NULL usando "= NULL" retorna:',
    options: [
      'Verdadeiro quando o campo é nulo',
      'Falso em qualquer situação possível',
      'Desconhecido: nunca é verdadeiro',
      'Erro de sintaxe ao executar a consulta',
    ],
    answer: 2,
    explanation:
      'NULL é ausência de valor; a comparação exige IS NULL em vez do operador de igualdade.',
  },
  {
    theme: 'banco',
    difficulty: 'dificil',
    prompt: 'O que caracteriza uma leitura suja (dirty read)?',
    options: [
      'Ler dados de transação não confirmada',
      'Ler dados de uma tabela sem índice',
      'Ler a mesma linha duas vezes seguidas',
      'Ler dados gravados de forma criptografada',
    ],
    answer: 0,
    explanation:
      'A leitura suja expõe alterações que podem sofrer rollback e nunca existir de fato.',
  },
  {
    theme: 'banco',
    difficulty: 'dificil',
    prompt:
      'Pelo teorema CAP, num sistema distribuído sob partição de rede escolhe-se entre:',
    options: [
      'Consistência e disponibilidade',
      'Velocidade e custo',
      'Segurança e desempenho',
      'Escrita e leitura',
    ],
    answer: 0,
    explanation:
      'Havendo partição, é preciso sacrificar consistência forte ou disponibilidade.',
  },
  {
    theme: 'banco',
    difficulty: 'dificil',
    prompt: 'O que é o problema N+1 em consultas?',
    options: [
      'Uma consulta que retorna uma linha a mais',
      'Uma consulta por resultado dentro de um laço',
      'Índice com uma coluna a mais que o preciso',
      'Transação com um commit a mais que o devido',
    ],
    answer: 1,
    explanation:
      'Buscar relacionados um a um multiplica idas ao banco; a saída é carregar em lote com join.',
  },
  {
    theme: 'banco',
    difficulty: 'dificil',
    prompt: 'Por que consultas parametrizadas previnem injeção de SQL?',
    options: [
      'Porque criptografam o texto da consulta',
      'Porque separam o comando SQL dos dados',
      'Porque limitam o tamanho do texto de entrada',
      'Porque removem as aspas automaticamente',
    ],
    answer: 1,
    explanation:
      'O plano da consulta é fixado antes dos valores chegarem, então o dado não vira comando.',
  },

    // Ampliação do tema.
  {
    theme: "banco",
    difficulty: "facil",
    prompt: 'Qual comando SQL apaga linhas de uma tabela?',
    options: ['DELETE', 'DROP', 'REMOVE', 'ERASE'],
    answer: 0,
    explanation:
      'DELETE remove linhas; DROP apaga a tabela inteira, com estrutura e tudo.',
  },
  {
    theme: "banco",
    difficulty: "facil",
    prompt: 'O que a cláusula ORDER BY faz numa consulta?',
    options: [
      'Agrupa as linhas por um campo',
      'Ordena as linhas do resultado',
      'Filtra as linhas por condição',
      'Limita quantas linhas retornam',
    ],
    answer: 1,
    explanation:
      'Sem ORDER BY, a ordem das linhas devolvidas não é garantida pelo banco.',
  },
  {
    theme: "banco",
    difficulty: "facil",
    prompt: 'O que é uma coluna numa tabela relacional?',
    options: [
      'Um conjunto de tabelas relacionadas',
      'Uma linha com os dados de um registro',
      'Um campo com o mesmo tipo em toda linha',
      'Um índice criado sobre a chave primária',
    ],
    answer: 2,
    explanation: 'A coluna define um atributo e o tipo de dado que ele aceita.',
  },
  {
    theme: "banco",
    difficulty: "facil",
    prompt: 'O que a função MAX() devolve?',
    options: [
      'A soma dos valores da coluna',
      'A média dos valores encontrados',
      'O total de linhas do resultado',
      'O maior valor daquela coluna',
    ],
    answer: 3,
    explanation:
      'MAX() é uma função de agregação: percorre o grupo e devolve o maior valor.',
  },
  {
    theme: "banco",
    difficulty: "facil",
    prompt: 'O que uma chave primária composta usa?',
    options: [
      'Mais de uma coluna como identificador',
      'Uma coluna com valores criptografados',
      'Um índice separado para cada linha',
      'Uma coluna de outra tabela do banco',
    ],
    answer: 0,
    explanation:
      'Quando nenhuma coluna sozinha identifica a linha, combinam-se duas ou mais.',
  },
  {
    theme: "banco",
    difficulty: "facil",
    prompt: 'O que são comandos DDL em SQL?',
    options: [
      'Os que consultam os dados gravados',
      'Os que definem a estrutura do banco',
      'Os que controlam as permissões de acesso',
      'Os que confirmam ou desfazem transações',
    ],
    answer: 1,
    explanation:
      'CREATE, ALTER e DROP mexem na estrutura; INSERT e SELECT mexem nos dados.',
  },
  {
    theme: "banco",
    difficulty: "media",
    prompt: 'O que um COMMIT faz numa transação?',
    options: [
      'Desfaz tudo o que foi alterado',
      'Abre uma nova transação no banco',
      'Confirma em definitivo as alterações',
      'Bloqueia a tabela para outros usuários',
    ],
    answer: 2,
    explanation:
      'Depois do commit, as mudanças ficam visíveis e sobrevivem a uma queda do servidor.',
  },
  {
    theme: "banco",
    difficulty: "media",
    prompt: 'Por que escolher o tipo de dado adequado para cada coluna?',
    options: [
      'Porque o banco exige tipos numéricos',
      'Porque acelera a criação de índices',
      'Porque reduz o número de tabelas',
      'Porque economiza espaço e evita erro',
    ],
    answer: 3,
    explanation:
      'Guardar data como texto, por exemplo, quebra ordenação, comparação e validação.',
  },
  {
    theme: "banco",
    difficulty: "media",
    prompt: 'O que a integridade referencial impede?',
    options: [
      'Referência a uma linha que não existe',
      'Duas linhas com a mesma chave primária',
      'Colunas com valores nulos na tabela',
      'Consultas sem a cláusula WHERE',
    ],
    answer: 0,
    explanation:
      'A chave estrangeira recusa apontar para um registro que não está na outra tabela.',
  },
  {
    theme: "banco",
    difficulty: "media",
    prompt: 'O que o resultado de um FULL OUTER JOIN contém?',
    options: [
      'Somente as linhas que casam nas duas',
      'As linhas das duas tabelas, com nulos',
      'Apenas as linhas da tabela da esquerda',
      'Apenas as linhas sem correspondência',
    ],
    answer: 1,
    explanation:
      'Ele preserva os dois lados, preenchendo com nulo onde não houve correspondência.',
  },
  {
    theme: "banco",
    difficulty: "media",
    prompt: 'Para que serve GROUP BY junto de COUNT()?',
    options: [
      'Ordenar o resultado por quantidade',
      'Filtrar as linhas antes de agrupar',
      'Contar as linhas dentro de cada grupo',
      'Remover as linhas duplicadas do total',
    ],
    answer: 2,
    explanation:
      'Sem o GROUP BY, o COUNT() devolveria um único número para a consulta inteira.',
  },
  {
    theme: "banco",
    difficulty: "dificil",
    prompt: 'O que caracteriza uma leitura fantasma (phantom read)?',
    options: [
      'Ler um valor que sofreu rollback depois',
      'Ler a mesma linha com valores diferentes',
      'Ler uma tabela que foi apagada no meio',
      'Novas linhas surgirem na mesma transação',
    ],
    answer: 3,
    explanation:
      'A mesma consulta, repetida, passa a incluir linhas inseridas por outra transação.',
  },
  {
    theme: "banco",
    difficulty: "dificil",
    prompt: 'Por que um índice numa coluna de baixa cardinalidade ajuda pouco?',
    options: [
      'Porque ele filtra poucas linhas do total',
      'Porque o banco recusa criar esse índice',
      'Porque a coluna não pode ser ordenada',
      'Porque índices só valem para texto',
    ],
    answer: 0,
    explanation:
      'Se a coluna só tem dois valores, metade da tabela ainda precisa ser lida.',
  },
  {
    theme: "banco",
    difficulty: "dificil",
    prompt: 'O que o plano de execução de uma consulta mostra?',
    options: [
      'O tempo exato que ela vai levar',
      'Como o banco pretende buscar os dados',
      'Quantos usuários estão conectados',
      'Quais permissões o usuário possui',
    ],
    answer: 1,
    explanation:
      'É onde se descobre se um índice foi usado ou se houve varredura completa da tabela.',
  },
  {
    theme: "banco",
    difficulty: "dificil",
    prompt: 'O que a desnormalização troca por desempenho de leitura?',
    options: [
      'A segurança de acesso aos dados',
      'A capacidade de criar novos índices',
      'A ausência de redundância nos dados',
      'O suporte a transações no banco',
    ],
    answer: 2,
    explanation:
      'Repetir dado acelera a consulta e cria o risco de as cópias divergirem na escrita.',
  },

// ── Algoritmos ────────────────────────────────────────────────────────────────
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt:
      'Qual estrutura de dados segue a política "último a entrar, primeiro a sair"?',
    options: ['Fila', 'Pilha', 'Lista ligada', 'Árvore'],
    answer: 1,
    explanation:
      'A pilha (LIFO) remove sempre o elemento inserido mais recentemente.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt:
      'Qual estrutura segue a política "primeiro a entrar, primeiro a sair"?',
    options: ['Pilha', 'Fila', 'Heap', 'Grafo'],
    answer: 1,
    explanation: 'A fila (FIFO) atende na ordem de chegada.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt:
      'Qual é a complexidade de acessar um elemento por índice num vetor?',
    options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
    answer: 0,
    explanation:
      'O endereço é calculado diretamente a partir do índice, em tempo constante.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt: 'Uma busca binária exige que o vetor esteja:',
    options: [
      'Ordenado',
      'Sem repetições',
      'Com tamanho par',
      'Preenchido com inteiros',
    ],
    answer: 0,
    explanation:
      'A cada passo a busca descarta metade do intervalo, o que só vale se houver ordem.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt: 'Toda função recursiva precisa ter obrigatoriamente:',
    options: [
      'Um caso base',
      'Dois parâmetros',
      'Um laço interno',
      'Retorno numérico',
    ],
    answer: 0,
    explanation: 'Sem caso base a recursão não termina e estoura a pilha.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt:
      'Qual a complexidade de percorrer todos os elementos de uma lista de n itens?',
    options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'],
    answer: 2,
    explanation:
      'Visitar cada elemento uma vez custa tempo proporcional ao tamanho da lista.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'media',
    prompt: 'Qual é a complexidade média do quicksort?',
    options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'],
    answer: 1,
    explanation:
      'Em média as partições são equilibradas; o pior caso O(n²) ocorre com pivô ruim.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'media',
    prompt: 'Numa tabela hash, o que é uma colisão?',
    options: [
      'Duas chaves mapeadas para a mesma posição',
      'Uma chave que ficou sem valor associado',
      'Uma tabela que já ocupou todo o espaço',
      'Uma busca que terminou sem encontrar nada',
    ],
    answer: 0,
    explanation:
      'Como o espaço de saída é menor que o de chaves, colisões são inevitáveis e precisam de tratamento.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'media',
    prompt: 'A busca em largura (BFS) num grafo usa qual estrutura auxiliar?',
    options: ['Pilha', 'Fila', 'Heap', 'Tabela hash'],
    answer: 1,
    explanation:
      'A fila garante visitar os vértices em ordem crescente de distância da origem.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'media',
    prompt: 'Numa árvore binária de busca balanceada, a busca custa:',
    options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
    answer: 1,
    explanation:
      'A cada nível descarta-se metade da árvore, e a altura balanceada é logarítmica.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'media',
    prompt: 'O que caracteriza um algoritmo guloso (greedy)?',
    options: [
      'Testa todas as combinações antes de decidir',
      'Escolhe o melhor local e não revisa a escolha',
      'Divide o problema ao meio a cada chamada',
      'Memoriza todos os subproblemas resolvidos',
    ],
    answer: 1,
    explanation:
      'O guloso decide localmente e nunca volta atrás — nem sempre chega ao ótimo global.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'dificil',
    prompt: 'O que a programação dinâmica explora para ser eficiente?',
    options: [
      'A aleatoriedade presente nos dados de entrada',
      'Subproblemas sobrepostos e subestrutura ótima',
      'A ordenação prévia de todos os dados de entrada',
      'O paralelismo disponível nos vários núcleos',
    ],
    answer: 1,
    explanation:
      'Resolver cada subproblema uma vez e reutilizar o resultado é o que corta o custo exponencial.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'dificil',
    prompt: 'Um algoritmo de ordenação estável garante que:',
    options: [
      'O tempo de execução nunca varia entre entradas',
      'Chaves iguais preservam a ordem original',
      'O algoritmo não usa nenhuma memória extra',
      'O algoritmo funciona apenas com inteiros',
    ],
    answer: 1,
    explanation:
      'Estabilidade importa ao ordenar por múltiplos critérios em sequência.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'dificil',
    prompt:
      'Por que o algoritmo de Dijkstra não funciona com arestas de peso negativo?',
    options: [
      'Porque não representa números negativos',
      'Porque dá vértice finalizado como definitivo',
      'Porque exige que o grafo não seja direcionado',
      'Porque a fila de prioridade rejeita negativos',
    ],
    answer: 1,
    explanation:
      'Uma aresta negativa poderia melhorar um caminho já dado como definitivo.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'dificil',
    prompt: 'O que significa dizer que um problema está em NP?',
    options: [
      'Que o problema não tem nenhuma solução conhecida',
      'Que uma solução dada se verifica em tempo polinomial',
      'Que o problema exige tempo exponencial obrigatório',
      'Que o problema só pode ser resolvido por aproximação',
    ],
    answer: 1,
    explanation:
      'NP é definido pela verificação eficiente de um certificado, não pela dificuldade de achá-lo.',
  },

  // Vindas do tema Lógica, que saiu da roda: dedução, tabela-verdade e
  // raciocínio formal passaram a contar como Algoritmos. O tema fica com o
  // dobro das outras — pool maior não muda nada para o aluno, que sorteia uma
  // questão por vez.
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt: 'Se p é verdadeiro e q é falso, qual o valor de "p E q"?',
    options: ['Verdadeiro', 'Falso', 'Indefinido', 'Depende de p'],
    answer: 1,
    explanation:
      'A conjunção só é verdadeira quando as duas partes são verdadeiras.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt:
      'Quantas linhas tem a tabela-verdade de uma fórmula com 3 variáveis?',
    options: ['3', '6', '8', '9'],
    answer: 2,
    explanation: 'São 2³ = 8 combinações possíveis de verdadeiro e falso.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt:
      'Qual operador lógico resulta em verdadeiro quando pelo menos uma das partes é verdadeira?',
    options: ['E (conjunção)', 'OU (disjunção)', 'NÃO (negação)', 'SE-ENTÃO'],
    answer: 1,
    explanation: 'A disjunção só é falsa quando ambas as partes são falsas.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt: 'A negação de "x > 10" é:',
    options: ['x < 10', 'x <= 10', 'x >= 10', 'x != 10'],
    answer: 1,
    explanation:
      'Negar "maior que" inclui o caso de igualdade, virando "menor ou igual".',
  },
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt:
      'Numa estrutura "se... senão", quantos dos dois blocos executam numa passagem?',
    options: ['Sempre os dois', 'Exatamente um', 'Nenhum', 'Depende do laço'],
    answer: 1,
    explanation:
      'A condição escolhe um dos caminhos; o outro é ignorado naquela passagem.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt: 'O que a negação dupla "NÃO (NÃO p)" equivale?',
    options: ['p', 'NÃO p', 'Sempre verdadeiro', 'Sempre falso'],
    answer: 0,
    explanation: 'Negar duas vezes devolve o valor original da proposição.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'media',
    prompt: 'Pela lei de De Morgan, "NÃO (p E q)" é equivalente a:',
    options: ['NÃO p E NÃO q', 'NÃO p OU NÃO q', 'p OU q', 'NÃO p SE-ENTÃO q'],
    answer: 1,
    explanation: 'De Morgan troca a conjunção por disjunção e nega cada parte.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'media',
    prompt: 'A implicação "p → q" é falsa em qual único caso?',
    options: [
      'p falso e q falso',
      'p falso e q verdadeiro',
      'p verdadeiro e q falso',
      'p verdadeiro e q verdadeiro',
    ],
    answer: 2,
    explanation:
      'Uma promessa só é quebrada quando a hipótese vale e a conclusão falha.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'media',
    prompt: 'Qual é a contrapositiva de "se chove, então a rua molha"?',
    options: [
      'Se a rua molha, então chove',
      'Se não chove, então a rua não molha',
      'Se a rua não molha, então não chove',
      'Se chove, então a rua não molha',
    ],
    answer: 2,
    explanation:
      'A contrapositiva inverte e nega os dois lados, e é sempre equivalente.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'media',
    prompt:
      'Uma fórmula que é verdadeira para toda atribuição de valores chama-se:',
    options: ['Contradição', 'Tautologia', 'Contingência', 'Falácia'],
    answer: 1,
    explanation:
      'Tautologia é a fórmula verdadeira em todas as linhas da tabela-verdade.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'media',
    prompt:
      'Em "curto-circuito", por que `a != null && a.b` não quebra quando a é nulo?',
    options: [
      'A linguagem ignora qualquer erro de nulo',
      'A segunda parte só roda se a primeira valer',
      'O operador && converte o nulo em falso',
      'A ordem das partes não importa na avaliação',
    ],
    answer: 1,
    explanation:
      'A avaliação em curto-circuito para assim que o resultado já está decidido.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'dificil',
    prompt:
      'Qual conjunto de operadores é suficiente para expressar qualquer função booleana?',
    options: ['Apenas E', 'Apenas OU', 'E junto com NÃO', 'Apenas SE-ENTÃO'],
    answer: 2,
    explanation:
      'Conjunção com negação é funcionalmente completo; por De Morgan gera a disjunção.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'dificil',
    prompt: 'A negação de "existe x tal que P(x)" é:',
    options: [
      'Existe x tal que não P(x)',
      'Para todo x, não P(x)',
      'Não existe x tal que não P(x)',
      'Para todo x, P(x)',
    ],
    answer: 1,
    explanation:
      'Negar um existencial troca o quantificador para universal e nega o predicado.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'dificil',
    prompt: 'O operador XOR entre p e q é verdadeiro quando:',
    options: [
      'Os dois são verdadeiros',
      'Os dois são falsos',
      'Os valores são diferentes entre si',
      'Pelo menos um é verdadeiro',
    ],
    answer: 2,
    explanation:
      'O ou-exclusivo indica divergência: verdadeiro apenas quando os valores diferem.',
  },
  {
    theme: 'algoritmos',
    difficulty: 'dificil',
    prompt:
      'Um argumento válido com premissas verdadeiras garante o quê sobre a conclusão?',
    options: [
      'Que ela é verdadeira',
      'Que ela é falsa',
      'Nada, validade é só sobre a forma',
      'Que ela é provável',
    ],
    answer: 0,
    explanation:
      'Validade preserva verdade: premissas verdadeiras em forma válida forçam conclusão verdadeira.',
  },
  // Ampliação do tema — estruturas, complexidade e grafos.
  {
    theme: "algoritmos",
    difficulty: "facil",
    prompt: 'O que a operação pop faz numa pilha?',
    options: [
      'Remove o elemento que está no topo',
      'Insere um elemento no topo da pilha',
      'Devolve o elemento mais antigo dela',
      'Ordena os elementos já empilhados',
    ],
    answer: 0,
    explanation: 'A pilha é LIFO: sai sempre o último que entrou.',
  },
  {
    theme: "algoritmos",
    difficulty: "facil",
    prompt: 'Qual é a complexidade da busca linear no pior caso?',
    options: ['O(1)', 'O(n)', 'O(log n)', 'O(n²)'],
    answer: 1,
    explanation:
      'No pior caso o elemento está no fim (ou não está), e todos são comparados.',
  },
  {
    theme: "algoritmos",
    difficulty: "facil",
    prompt: 'O que uma estrutura condicional if faz num programa?',
    options: [
      'Repete um bloco várias vezes',
      'Interrompe a execução do programa',
      'Escolhe o caminho conforme um teste',
      'Guarda um valor para uso posterior',
    ],
    answer: 2,
    explanation: 'A condição decide qual bloco roda naquela passagem.',
  },
  {
    theme: "algoritmos",
    difficulty: "facil",
    prompt: 'O que costuma acontecer ao acessar um índice fora do vetor?',
    options: [
      'O vetor cresce automaticamente',
      'O valor devolvido é sempre zero',
      'A posição é criada em memória',
      'O programa lança erro ou lê lixo',
    ],
    answer: 3,
    explanation:
      'Dependendo da linguagem, dá exceção ou lê memória que não pertence ao vetor.',
  },
  {
    theme: "algoritmos",
    difficulty: "facil",
    prompt: 'O que é uma estrutura de dados?',
    options: [
      'Uma forma de organizar dados na memória',
      'Um trecho de código que se repete',
      'Um arquivo gravado no disco rígido',
      'Uma linguagem de programação típica',
    ],
    answer: 0,
    explanation:
      'Cada estrutura favorece certas operações — e cobra caro nas outras.',
  },
  {
    theme: "algoritmos",
    difficulty: "facil",
    prompt: 'Qual estrutura é natural para implementar o "desfazer" (undo)?',
    options: ['A fila', 'A pilha', 'A árvore', 'O grafo'],
    answer: 1,
    explanation:
      'Desfazer inverte a última ação feita — exatamente a ordem da pilha.',
  },
  {
    theme: "algoritmos",
    difficulty: "media",
    prompt: 'Qual é a complexidade do selection sort?',
    options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'],
    answer: 2,
    explanation:
      'Ele percorre o restante do vetor a cada posição, em qualquer caso.',
  },
  {
    theme: "algoritmos",
    difficulty: "media",
    prompt: 'O que o fator de carga de uma tabela hash indica?',
    options: [
      'O tamanho médio de cada chave usada',
      'O número de funções hash aplicadas',
      'A memória total ocupada pela tabela',
      'A razão entre elementos e posições',
    ],
    answer: 3,
    explanation: 'Fator de carga alto aumenta as colisões e degrada a busca.',
  },
  {
    theme: "algoritmos",
    difficulty: "media",
    prompt:
      'Qual estrutura a busca em profundidade usa, mesmo quando recursiva?',
    options: [
      'A pilha de chamadas do programa',
      'Uma fila de vértices visitados',
      'Uma tabela hash de distâncias',
      'Uma lista ordenada por peso',
    ],
    answer: 0,
    explanation:
      'A recursão usa a pilha do sistema; a versão iterativa usa uma pilha explícita.',
  },
  {
    theme: "algoritmos",
    difficulty: "media",
    prompt: 'O que uma árvore binária de busca garante sobre a ordem dos nós?',
    options: [
      'Todos os valores ficam nas folhas',
      'Menores à esquerda, maiores à direita',
      'Os nós ficam sempre balanceados',
      'A raiz guarda o maior valor da árvore',
    ],
    answer: 1,
    explanation:
      'É essa invariante que permite descartar metade da árvore a cada comparação.',
  },
  {
    theme: "algoritmos",
    difficulty: "media",
    prompt: 'Por que às vezes vale trocar recursão por iteração?',
    options: [
      'Porque a iteração é sempre mais legível',
      'Porque a recursão não aceita parâmetros',
      'Porque evita estourar a pilha de chamadas',
      'Porque reduz a complexidade assintótica',
    ],
    answer: 2,
    explanation:
      'Profundidade grande de recursão esgota a pilha; o laço usa espaço constante.',
  },
  {
    theme: "algoritmos",
    difficulty: "dificil",
    prompt: 'Qual é a complexidade da ordenação por contagem (counting sort)?',
    options: ['O(n log n)', 'O(n²)', 'O(log n)', 'O(n + k)'],
    answer: 3,
    explanation:
      'Ela não compara elementos: conta ocorrências, com k sendo a faixa de valores.',
  },
  {
    theme: "algoritmos",
    difficulty: "dificil",
    prompt: 'Por que nenhuma ordenação por comparação supera O(n log n)?',
    options: [
      'Porque há um limite teórico de comparações',
      'Porque a memória disponível é limitada',
      'Porque os dados chegam desordenados',
      'Porque o processador executa em série',
    ],
    answer: 0,
    explanation:
      'A árvore de decisão das comparações tem altura mínima da ordem de log(n!).',
  },
  {
    theme: "algoritmos",
    difficulty: "dificil",
    prompt: 'O que a memoização faz numa função recursiva?',
    options: [
      'Reduz o número de parâmetros usados',
      'Guarda resultados já calculados antes',
      'Converte a recursão em um laço simples',
      'Aumenta a profundidade máxima da pilha',
    ],
    answer: 1,
    explanation:
      'É o que transforma a Fibonacci exponencial numa versão linear.',
  },
  {
    theme: "algoritmos",
    difficulty: "dificil",
    prompt: 'O que a ordenação topológica exige do grafo?',
    options: [
      'Que ele tenha pesos positivos apenas',
      'Que ele seja completo e não dirigido',
      'Que ele seja dirigido e sem ciclos',
      'Que ele tenha um único componente',
    ],
    answer: 2,
    explanation:
      'Com um ciclo, não existe ordem em que todo pré-requisito venha antes.',
  },

  // Ampliação do bloco de lógica, que também conta como Algoritmos.
  {
    theme: "algoritmos",
    difficulty: "facil",
    prompt: 'Qual é o valor de "falso E verdadeiro"?',
    options: ['Falso', 'Verdadeiro', 'Indefinido', 'Depende da ordem'],
    answer: 0,
    explanation: 'Basta uma parte falsa para a conjunção inteira ser falsa.',
  },
  {
    theme: "algoritmos",
    difficulty: "facil",
    prompt: 'O que o operador NÃO faz com um valor lógico?',
    options: [
      'Mantém o valor original',
      'Inverte o valor recebido',
      'Torna o valor sempre falso',
      'Torna o valor sempre verdadeiro',
    ],
    answer: 1,
    explanation: 'A negação troca verdadeiro por falso e vice-versa.',
  },
  {
    theme: "algoritmos",
    difficulty: "facil",
    prompt: 'Quantas linhas tem a tabela-verdade de uma proposição simples?',
    options: ['1', '4', '2', '8'],
    answer: 2,
    explanation: 'Uma variável assume dois valores, então são 2¹ = 2 linhas.',
  },
  {
    theme: "algoritmos",
    difficulty: "facil",
    prompt: 'Qual é a negação de "x ≥ 10"?',
    options: ['x > 10', 'x ≤ 10', 'x = 10', 'x < 10'],
    answer: 3,
    explanation:
      'Negar "maior ou igual" deixa apenas o caso estritamente menor.',
  },
  {
    theme: "algoritmos",
    difficulty: "facil",
    prompt: 'Em "se A, então B", como se chama o A?',
    options: [
      'O antecedente',
      'O consequente',
      'A recíproca',
      'A contrapositiva',
    ],
    answer: 0,
    explanation:
      'O antecedente é a hipótese; o consequente é o que se conclui dela.',
  },
  {
    theme: "algoritmos",
    difficulty: "facil",
    prompt: 'Qual é o valor de "p E p"?',
    options: [
      'Sempre verdadeiro',
      'O mesmo valor de p',
      'Sempre falso',
      'O contrário de p',
    ],
    answer: 1,
    explanation:
      'É a lei da idempotência: repetir a mesma proposição não muda nada.',
  },
  {
    theme: "algoritmos",
    difficulty: "media",
    prompt: 'A que equivale "não (p → q)"?',
    options: ['não p E q', 'não p OU q', 'p E não q', 'p OU não q'],
    answer: 2,
    explanation:
      'A condicional só falha quando a hipótese vale e a conclusão não.',
  },
  {
    theme: "algoritmos",
    difficulty: "media",
    prompt: 'O que uma tabela-verdade completa apresenta?',
    options: [
      'Somente as linhas verdadeiras da fórmula',
      'Apenas o valor final da última coluna',
      'As variáveis em ordem alfabética',
      'O valor da fórmula em cada combinação',
    ],
    answer: 3,
    explanation:
      'Ela percorre todas as atribuições possíveis das variáveis envolvidas.',
  },
  {
    theme: "algoritmos",
    difficulty: "media",
    prompt: 'Por que "todo A é B" não permite concluir "todo B é A"?',
    options: [
      'Porque a recíproca não é equivalente',
      'Porque a negação inverte os termos',
      'Porque A e B são sempre disjuntos',
      'Porque falta a contrapositiva da frase',
    ],
    answer: 0,
    explanation:
      'Todo cão é mamífero, mas nem todo mamífero é cão — a recíproca pode falhar.',
  },
  {
    theme: "algoritmos",
    difficulty: "media",
    prompt: 'Qual é a forma do modus tollens?',
    options: [
      'De "p → q" e de p, conclui-se q',
      'De "p → q" e não q, conclui-se não p',
      'De "p → q" e de q, conclui-se p',
      'De "p → q" e não p, conclui-se não q',
    ],
    answer: 1,
    explanation:
      'Se a conclusão falhou, a hipótese não podia valer — é a contrapositiva em ação.',
  },
  {
    theme: "algoritmos",
    difficulty: "media",
    prompt: 'Numa disjunção exclusiva (XOR), quando o resultado é falso?',
    options: [
      'Quando pelo menos um valor é falso',
      'Quando os dois valores são verdadeiros',
      'Quando os dois valores são iguais',
      'Quando os dois valores são falsos',
    ],
    answer: 2,
    explanation:
      'O XOR indica divergência: valores iguais, verdadeiros ou falsos, dão falso.',
  },
  {
    theme: "algoritmos",
    difficulty: "dificil",
    prompt: 'O que significa duas fórmulas serem logicamente equivalentes?',
    options: [
      'Terem o mesmo número de variáveis',
      'Serem verdadeiras em alguma linha',
      'Usarem os mesmos conectivos lógicos',
      'Terem o mesmo valor em toda linha',
    ],
    answer: 3,
    explanation:
      'A equivalência é verificada comparando as tabelas-verdade inteiras.',
  },
  {
    theme: "algoritmos",
    difficulty: "dificil",
    prompt: 'O que é uma fórmula na forma normal conjuntiva (FNC)?',
    options: [
      'Uma conjunção de disjunções',
      'Uma disjunção de conjunções',
      'Uma cadeia de implicações',
      'Uma negação de bicondicionais',
    ],
    answer: 0,
    explanation:
      'É o formato de cláusulas ligadas por E, usado por resolvedores SAT.',
  },
  {
    theme: "algoritmos",
    difficulty: "dificil",
    prompt: 'Por que a prova por contradição funciona?',
    options: [
      'Porque toda tese tem uma recíproca',
      'Porque negar a tese leva ao absurdo',
      'Porque premissas falsas provam tudo',
      'Porque a tabela-verdade é finita',
    ],
    answer: 1,
    explanation:
      'Se a negação da tese produz uma contradição, a tese tem de ser verdadeira.',
  },
  {
    theme: "algoritmos",
    difficulty: "dificil",
    prompt: 'Qual é a negação de "existe x tal que P(x) e Q(x)"?',
    options: [
      'Existe x com não P(x) e não Q(x)',
      'Para todo x, P(x) e não Q(x)',
      'Para todo x, não P(x) ou não Q(x)',
      'Não existe x com P(x) ou Q(x)',
    ],
    answer: 2,
    explanation:
      'Negar o existencial vira universal, e De Morgan troca o E por OU negado.',
  },

];
