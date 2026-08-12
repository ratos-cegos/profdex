/**
 * Banco de questões do quiz de bancada — 10 por tema da roda de tipos.
 *
 * Fonte para o seed (`npm run db:seed-quiz`); em runtime o servidor lê da
 * tabela `quiz_questions`, nunca deste arquivo. O enunciado é a chave: mudar o
 * texto cria uma questão nova, mudar as alternativas atualiza a existente.
 *
 * Cada tema tem 4 fáceis, 3 médias e 3 difíceis. A ordem das alternativas aqui
 * é só a de cadastro — o servidor embaralha a cada aplicação, senão a fila da
 * bancada decoraria a posição da resposta.
 */

export type QuizDifficulty = 'facil' | 'media' | 'dificil';

export interface QuizSeedQuestion {
  theme: string;
  difficulty: QuizDifficulty;
  prompt: string;
  options: string[];
  /** Índice da alternativa correta em `options`. */
  answer: number;
}

export const QUIZ_QUESTIONS: QuizSeedQuestion[] = [
  // ── Lógica ────────────────────────────────────────────────────────────────
  {
    theme: 'logica',
    difficulty: 'facil',
    prompt: 'Qual é a negação de "todo aluno foi aprovado"?',
    options: [
      'Nenhum aluno foi aprovado',
      'Pelo menos um aluno não foi aprovado',
      'Todo aluno foi reprovado',
      'Alguns alunos foram aprovados',
    ],
    answer: 1,
  },
  {
    theme: 'logica',
    difficulty: 'facil',
    prompt: 'Qual é o valor de "verdadeiro E falso"?',
    options: ['Verdadeiro', 'Falso', 'Indefinido', 'Depende da ordem'],
    answer: 1,
  },
  {
    theme: 'logica',
    difficulty: 'facil',
    prompt:
      '"Se chove, a rua fica molhada." Sabendo que está chovendo, o que se conclui?',
    options: [
      'A rua fica molhada',
      'A rua está seca',
      'Nada se conclui',
      'Não está chovendo',
    ],
    answer: 0,
  },
  {
    theme: 'logica',
    difficulty: 'facil',
    prompt: 'Com p falso e q verdadeiro, qual é o valor de "p OU q"?',
    options: ['Falso', 'Verdadeiro', 'Indefinido', 'Igual ao de p E q'],
    answer: 1,
  },
  {
    theme: 'logica',
    difficulty: 'media',
    prompt: 'Qual é a contrapositiva de "se p, então q"?',
    options: [
      'Se q, então p',
      'Se não p, então não q',
      'Se não q, então não p',
      'p e não q',
    ],
    answer: 2,
  },
  {
    theme: 'logica',
    difficulty: 'media',
    prompt: 'Quantas linhas tem a tabela-verdade de 4 proposições simples?',
    options: ['8', '12', '16', '32'],
    answer: 2,
  },
  {
    theme: 'logica',
    difficulty: 'media',
    prompt: 'A proposição "p → q" é equivalente a qual expressão?',
    options: ['p E q', 'não p OU q', 'p OU não q', 'não p E q'],
    answer: 1,
  },
  {
    theme: 'logica',
    difficulty: 'dificil',
    prompt: 'Pela lei de De Morgan, "não (p E q)" equivale a:',
    options: [
      'não p E não q',
      'não p OU não q',
      'p OU q',
      'não (p OU q)',
    ],
    answer: 1,
  },
  {
    theme: 'logica',
    difficulty: 'dificil',
    prompt:
      'Concluir p a partir de "se p, então q" e de q é qual erro de raciocínio?',
    options: [
      'Afirmação do consequente',
      'Negação do antecedente',
      'Modus tollens',
      'Silogismo hipotético',
    ],
    answer: 0,
  },
  {
    theme: 'logica',
    difficulty: 'dificil',
    prompt: 'Qual das proposições abaixo é uma tautologia?',
    options: ['p E não p', 'p OU não p', 'p → não p', 'não (p OU p)'],
    answer: 1,
  },

  // ── Cálculo ───────────────────────────────────────────────────────────────
  {
    theme: 'calculo',
    difficulty: 'facil',
    prompt: 'Qual é a derivada de f(x) = x²?',
    options: ['x', '2x', 'x²/2', '2'],
    answer: 1,
  },
  {
    theme: 'calculo',
    difficulty: 'facil',
    prompt: 'Quanto vale o limite de (3x + 1) quando x tende a 2?',
    options: ['5', '6', '7', '9'],
    answer: 2,
  },
  {
    theme: 'calculo',
    difficulty: 'facil',
    prompt: 'Qual é a derivada de uma função constante?',
    options: ['A própria constante', '0', '1', 'x'],
    answer: 1,
  },
  {
    theme: 'calculo',
    difficulty: 'facil',
    prompt: 'Qual é a integral indefinida de 2x dx?',
    options: ['x² + C', '2x² + C', 'x + C', '2 + C'],
    answer: 0,
  },
  {
    theme: 'calculo',
    difficulty: 'media',
    prompt: 'Qual é a derivada de sen(x)?',
    options: ['-sen(x)', 'cos(x)', '-cos(x)', 'tg(x)'],
    answer: 1,
  },
  {
    theme: 'calculo',
    difficulty: 'media',
    prompt: 'Quanto vale o limite de sen(x)/x quando x tende a 0?',
    options: ['0', '1', 'Infinito', 'Não existe'],
    answer: 1,
  },
  {
    theme: 'calculo',
    difficulty: 'media',
    prompt: 'Pela regra do produto, a derivada de f(x)·g(x) é:',
    options: [
      "f'(x)·g'(x)",
      "f'(x)·g(x) + f(x)·g'(x)",
      "f'(x)·g(x) - f(x)·g'(x)",
      "f(x)·g'(x)",
    ],
    answer: 1,
  },
  {
    theme: 'calculo',
    difficulty: 'dificil',
    prompt: 'Qual é a derivada de e^(2x)?',
    options: ['e^(2x)', '2e^(2x)', '2x·e^(2x)', 'e^(2x)/2'],
    answer: 1,
  },
  {
    theme: 'calculo',
    difficulty: 'dificil',
    prompt: 'A função f(x) = x³ - 3x tem mínimo local em qual ponto?',
    options: ['x = -1', 'x = 0', 'x = 1', 'x = 3'],
    answer: 2,
  },
  {
    theme: 'calculo',
    difficulty: 'dificil',
    prompt: 'Quanto vale a integral de x² dx no intervalo de 0 a 1?',
    options: ['1/4', '1/3', '1/2', '1'],
    answer: 1,
  },

  // ── IA / ML ───────────────────────────────────────────────────────────────
  {
    theme: 'ia-ml',
    difficulty: 'facil',
    prompt: 'Aprendizado supervisionado precisa de dados:',
    options: [
      'Rotulados',
      'Sem rótulo nenhum',
      'Sempre numéricos',
      'Gerados aleatoriamente',
    ],
    answer: 0,
  },
  {
    theme: 'ia-ml',
    difficulty: 'facil',
    prompt: 'O que caracteriza o overfitting?',
    options: [
      'O modelo vai mal no treino e no teste',
      'O modelo vai muito bem no treino e mal em dados novos',
      'O modelo treina rápido demais',
      'O modelo usa poucos dados de teste',
    ],
    answer: 1,
  },
  {
    theme: 'ia-ml',
    difficulty: 'facil',
    prompt: 'O algoritmo K-means pertence a qual categoria?',
    options: [
      'Aprendizado supervisionado',
      'Aprendizado não supervisionado',
      'Aprendizado por reforço',
      'Busca heurística',
    ],
    answer: 1,
  },
  {
    theme: 'ia-ml',
    difficulty: 'facil',
    prompt: 'Qual destes é um problema de classificação?',
    options: [
      'Prever o preço de um imóvel',
      'Prever se um e-mail é spam ou não',
      'Agrupar clientes parecidos',
      'Reduzir a dimensão dos dados',
    ],
    answer: 1,
  },
  {
    theme: 'ia-ml',
    difficulty: 'media',
    prompt: 'Para que serve separar os dados em treino e teste?',
    options: [
      'Para o treino ficar mais rápido',
      'Para estimar o desempenho em dados nunca vistos',
      'Para equilibrar as classes',
      'Para evitar dados faltantes',
    ],
    answer: 1,
  },
  {
    theme: 'ia-ml',
    difficulty: 'media',
    prompt:
      'Qual função de ativação é usada na saída para gerar uma probabilidade em classificação binária?',
    options: ['ReLU', 'Sigmoide', 'Tangente hiperbólica', 'Linear'],
    answer: 1,
  },
  {
    theme: 'ia-ml',
    difficulty: 'media',
    prompt: 'Na matriz de confusão, um falso positivo é quando o modelo:',
    options: [
      'Previu positivo e o caso era negativo',
      'Previu negativo e o caso era positivo',
      'Acertou um caso positivo',
      'Acertou um caso negativo',
    ],
    answer: 0,
  },
  {
    theme: 'ia-ml',
    difficulty: 'dificil',
    prompt:
      'Em uma base muito desbalanceada, qual métrica é mais informativa que a acurácia?',
    options: ['F1-score', 'Erro quadrático médio', 'Número de épocas', 'Perplexidade'],
    answer: 0,
  },
  {
    theme: 'ia-ml',
    difficulty: 'dificil',
    prompt: 'O que o backpropagation faz em uma rede neural?',
    options: [
      'Inicializa os pesos aleatoriamente',
      'Propaga o gradiente do erro para ajustar os pesos',
      'Normaliza os dados de entrada',
      'Escolhe a arquitetura da rede',
    ],
    answer: 1,
  },
  {
    theme: 'ia-ml',
    difficulty: 'dificil',
    prompt: 'Para que serve a regularização L2 (ridge)?',
    options: [
      'Aumentar a capacidade do modelo',
      'Penalizar pesos grandes e reduzir o overfitting',
      'Acelerar a convergência do gradiente',
      'Balancear as classes do conjunto',
    ],
    answer: 1,
  },

  // ── Robótica ──────────────────────────────────────────────────────────────
  {
    theme: 'robotica',
    difficulty: 'facil',
    prompt: 'Qual componente converte sinal elétrico em movimento?',
    options: ['Sensor', 'Atuador', 'Resistor', 'Barramento'],
    answer: 1,
  },
  {
    theme: 'robotica',
    difficulty: 'facil',
    prompt: 'Um sensor ultrassônico mede principalmente:',
    options: ['Temperatura', 'Distância', 'Luminosidade', 'Corrente elétrica'],
    answer: 1,
  },
  {
    theme: 'robotica',
    difficulty: 'facil',
    prompt: 'Para que serve um encoder acoplado a um motor?',
    options: [
      'Aumentar o torque',
      'Medir rotação e posição do eixo',
      'Filtrar ruído elétrico',
      'Converter tensão em corrente',
    ],
    answer: 1,
  },
  {
    theme: 'robotica',
    difficulty: 'facil',
    prompt: 'O que um servo motor controla diretamente?',
    options: [
      'A posição angular',
      'A temperatura do circuito',
      'A tensão da fonte',
      'A frequência do clock',
    ],
    answer: 0,
  },
  {
    theme: 'robotica',
    difficulty: 'media',
    prompt: 'Em um controlador PID, o termo integral (I) corrige:',
    options: [
      'O erro instantâneo',
      'O erro acumulado ao longo do tempo',
      'A velocidade de variação do erro',
      'O ruído do sensor',
    ],
    answer: 1,
  },
  {
    theme: 'robotica',
    difficulty: 'media',
    prompt: 'Para que serve o PWM no controle de motores?',
    options: [
      'Inverter o sentido de rotação',
      'Controlar a potência média variando a largura do pulso',
      'Medir a corrente do motor',
      'Converter sinal analógico em digital',
    ],
    answer: 1,
  },
  {
    theme: 'robotica',
    difficulty: 'media',
    prompt: 'O que são os graus de liberdade de um braço robótico?',
    options: [
      'O número de motores instalados',
      'O número de movimentos independentes possíveis',
      'O alcance máximo em metros',
      'A carga máxima suportada',
    ],
    answer: 1,
  },
  {
    theme: 'robotica',
    difficulty: 'dificil',
    prompt: 'O que a cinemática inversa calcula?',
    options: [
      'A posição da garra a partir dos ângulos das juntas',
      'Os ângulos das juntas a partir da posição desejada da garra',
      'A força necessária em cada junta',
      'A trajetória de menor consumo de energia',
    ],
    answer: 1,
  },
  {
    theme: 'robotica',
    difficulty: 'dificil',
    prompt:
      'Qual barramento é o padrão de comunicação entre módulos em veículos e automação industrial?',
    options: ['CAN', 'HDMI', 'SATA', 'VGA'],
    answer: 0,
  },
  {
    theme: 'robotica',
    difficulty: 'dificil',
    prompt: 'O termo derivativo (D) de um PID reage a quê?',
    options: [
      'Ao valor absoluto do erro',
      'À taxa de variação do erro, amortecendo oscilações',
      'À soma histórica do erro',
      'Ao valor de referência',
    ],
    answer: 1,
  },

  // ── Arquitetura ───────────────────────────────────────────────────────────
  {
    theme: 'arquitetura',
    difficulty: 'facil',
    prompt: 'Qual unidade da CPU executa as operações aritméticas e lógicas?',
    options: ['ULA', 'Cache', 'Barramento', 'Controlador de memória'],
    answer: 0,
  },
  {
    theme: 'arquitetura',
    difficulty: 'facil',
    prompt: 'Qual é a memória mais rápida e mais próxima do núcleo da CPU?',
    options: ['Registradores', 'Cache L3', 'Memória RAM', 'SSD'],
    answer: 0,
  },
  {
    theme: 'arquitetura',
    difficulty: 'facil',
    prompt: 'Quantos bits tem 1 byte?',
    options: ['4', '8', '16', '32'],
    answer: 1,
  },
  {
    theme: 'arquitetura',
    difficulty: 'facil',
    prompt: 'A memória RAM é classificada como:',
    options: [
      'Volátil (perde o conteúdo sem energia)',
      'Não volátil',
      'Somente leitura',
      'Memória secundária',
    ],
    answer: 0,
  },
  {
    theme: 'arquitetura',
    difficulty: 'media',
    prompt: 'Para que serve o pipeline de instruções?',
    options: [
      'Reduzir o consumo de energia',
      'Sobrepor as etapas de várias instruções e aumentar a vazão',
      'Aumentar o tamanho da cache',
      'Executar instruções fora de ordem',
    ],
    answer: 1,
  },
  {
    theme: 'arquitetura',
    difficulty: 'media',
    prompt: 'O que caracteriza uma arquitetura RISC frente a uma CISC?',
    options: [
      'Instruções mais numerosas e complexas',
      'Conjunto de instruções reduzido e regular',
      'Ausência de registradores',
      'Execução exclusivamente sequencial',
    ],
    answer: 1,
  },
  {
    theme: 'arquitetura',
    difficulty: 'media',
    prompt: 'O que significa um cache miss?',
    options: [
      'A cache foi corrompida',
      'O dado não estava na cache e precisou ser buscado na memória',
      'A cache está desativada',
      'A instrução foi descartada',
    ],
    answer: 1,
  },
  {
    theme: 'arquitetura',
    difficulty: 'dificil',
    prompt: 'Quando ocorre um hazard de dados no pipeline?',
    options: [
      'Quando duas instruções usam a mesma unidade funcional',
      'Quando uma instrução depende de um resultado ainda não disponível',
      'Quando um desvio é previsto incorretamente',
      'Quando a memória está cheia',
    ],
    answer: 1,
  },
  {
    theme: 'arquitetura',
    difficulty: 'dificil',
    prompt: 'O princípio da localidade temporal diz que:',
    options: [
      'Endereços vizinhos tendem a ser acessados juntos',
      'Um dado acessado tende a ser acessado de novo em breve',
      'Instruções são executadas em ordem',
      'A cache deve ser esvaziada periodicamente',
    ],
    answer: 1,
  },
  {
    theme: 'arquitetura',
    difficulty: 'dificil',
    prompt: 'A Lei de Amdahl mostra que o ganho ao paralelizar é limitado:',
    options: [
      'Pela quantidade de memória disponível',
      'Pela fração do programa que continua sequencial',
      'Pela frequência do processador',
      'Pelo número de instruções do programa',
    ],
    answer: 1,
  },

  // ── NPI ───────────────────────────────────────────────────────────────────
  {
    theme: 'npi',
    difficulty: 'facil',
    prompt: 'Qual é o objetivo principal de um code review?',
    options: [
      'Encontrar problemas e compartilhar conhecimento antes do merge',
      'Definir quem é responsável pelos erros',
      'Substituir os testes automatizados',
      'Acelerar a entrega pulando etapas',
    ],
    answer: 0,
  },
  {
    theme: 'npi',
    difficulty: 'facil',
    prompt: 'O que é um MVP em desenvolvimento de produto?',
    options: [
      'A versão final com todas as funcionalidades',
      'A menor versão que entrega valor e permite aprender com o uso',
      'Um protótipo descartável de interface',
      'O documento de requisitos aprovado',
    ],
    answer: 1,
  },
  {
    theme: 'npi',
    difficulty: 'facil',
    prompt: 'Para que serve a reunião diária de acompanhamento?',
    options: [
      'Prestar contas para a gestão',
      'Alinhar o time e destravar impedimentos',
      'Distribuir tarefas novas todo dia',
      'Revisar o código entregue',
    ],
    answer: 1,
  },
  {
    theme: 'npi',
    difficulty: 'facil',
    prompt: 'Qual é a função de um sistema de controle de versão?',
    options: [
      'Compilar o projeto automaticamente',
      'Registrar o histórico e permitir trabalho em paralelo',
      'Hospedar o site em produção',
      'Gerar a documentação do código',
    ],
    answer: 1,
  },
  {
    theme: 'npi',
    difficulty: 'media',
    prompt: 'O que é a "definição de pronto" (Definition of Done)?',
    options: [
      'O prazo combinado com o cliente',
      'O critério acordado do que precisa estar feito para a entrega contar',
      'A lista de tarefas da sprint',
      'O aceite formal do usuário final',
    ],
    answer: 1,
  },
  {
    theme: 'npi',
    difficulty: 'media',
    prompt: 'Por que pull requests pequenos são preferíveis?',
    options: [
      'Ocupam menos espaço no repositório',
      'São revisados com mais atenção e carregam menos risco',
      'Dispensam testes automatizados',
      'Permitem pular o code review',
    ],
    answer: 1,
  },
  {
    theme: 'npi',
    difficulty: 'media',
    prompt: 'O que é o backlog de um projeto?',
    options: [
      'O registro de bugs já corrigidos',
      'A lista priorizada do que ainda falta fazer',
      'O histórico de commits',
      'A documentação de arquitetura',
    ],
    answer: 1,
  },
  {
    theme: 'npi',
    difficulty: 'dificil',
    prompt: 'O que é débito técnico?',
    options: [
      'O custo de licenças de software do projeto',
      'Um atalho que acelera agora e cobra manutenção depois',
      'O tempo gasto em reuniões',
      'A diferença entre o prazo estimado e o real',
    ],
    answer: 1,
  },
  {
    theme: 'npi',
    difficulty: 'dificil',
    prompt: 'Qual é o foco de uma retrospectiva de time?',
    options: [
      'Avaliar o desempenho individual de cada pessoa',
      'Melhorar o processo de trabalho do time',
      'Replanejar o escopo do produto',
      'Apresentar resultados para o cliente',
    ],
    answer: 1,
  },
  {
    theme: 'npi',
    difficulty: 'dificil',
    prompt:
      'Qual é a diferença entre entrega contínua e implantação contínua?',
    options: [
      'Não há diferença, são sinônimos',
      'Na implantação contínua todo commit aprovado vai a produção automaticamente',
      'A entrega contínua dispensa testes',
      'A implantação contínua exige aprovação manual de cada versão',
    ],
    answer: 1,
  },

  // ── Redes ─────────────────────────────────────────────────────────────────
  {
    theme: 'redes',
    difficulty: 'facil',
    prompt: 'Qual protocolo traduz nomes de domínio em endereços IP?',
    options: ['DHCP', 'DNS', 'FTP', 'SMTP'],
    answer: 1,
  },
  {
    theme: 'redes',
    difficulty: 'facil',
    prompt: 'Qual é a porta padrão do HTTPS?',
    options: ['21', '80', '443', '8080'],
    answer: 2,
  },
  {
    theme: 'redes',
    difficulty: 'facil',
    prompt: 'O protocolo TCP é:',
    options: [
      'Orientado a conexão e confiável',
      'Sem conexão e sem garantias',
      'Exclusivo de redes sem fio',
      'Usado apenas para streaming',
    ],
    answer: 0,
  },
  {
    theme: 'redes',
    difficulty: 'facil',
    prompt: 'O que é um endereço IP?',
    options: [
      'O identificador do dispositivo na rede',
      'O número de série do equipamento',
      'A senha de acesso ao roteador',
      'O nome do domínio do site',
    ],
    answer: 0,
  },
  {
    theme: 'redes',
    difficulty: 'media',
    prompt: 'Qual é a principal diferença do UDP para o TCP?',
    options: [
      'O UDP é mais lento',
      'O UDP não garante entrega nem ordem dos pacotes',
      'O UDP só funciona em rede local',
      'O UDP criptografa os dados',
    ],
    answer: 1,
  },
  {
    theme: 'redes',
    difficulty: 'media',
    prompt: 'Em qual camada do modelo OSI atua um roteador?',
    options: ['Física (1)', 'Enlace (2)', 'Rede (3)', 'Transporte (4)'],
    answer: 2,
  },
  {
    theme: 'redes',
    difficulty: 'media',
    prompt: 'O que o NAT faz?',
    options: [
      'Criptografa o tráfego de saída',
      'Traduz endereços privados em um endereço público',
      'Distribui endereços IP na rede local',
      'Resolve nomes de domínio',
    ],
    answer: 1,
  },
  {
    theme: 'redes',
    difficulty: 'dificil',
    prompt: 'Qual é a sequência do three-way handshake do TCP?',
    options: ['SYN, ACK, FIN', 'SYN, SYN-ACK, ACK', 'ACK, SYN, ACK', 'SYN, FIN, ACK'],
    answer: 1,
  },
  {
    theme: 'redes',
    difficulty: 'dificil',
    prompt: 'Quantos endereços de host utilizáveis tem uma sub-rede /24?',
    options: ['128', '254', '255', '256'],
    answer: 1,
  },
  {
    theme: 'redes',
    difficulty: 'dificil',
    prompt: 'Para que serve o campo TTL de um pacote IP?',
    options: [
      'Definir a prioridade do pacote',
      'Impedir que pacotes circulem indefinidamente em loops',
      'Indicar o tamanho do pacote',
      'Identificar o protocolo de transporte',
    ],
    answer: 1,
  },

  // ── Banco de Dados ────────────────────────────────────────────────────────
  {
    theme: 'banco',
    difficulty: 'facil',
    prompt: 'Qual comando SQL é usado para consultar dados?',
    options: ['INSERT', 'SELECT', 'UPDATE', 'CREATE'],
    answer: 1,
  },
  {
    theme: 'banco',
    difficulty: 'facil',
    prompt: 'Para que serve uma chave primária?',
    options: [
      'Identificar unicamente cada linha da tabela',
      'Ordenar os resultados da consulta',
      'Ligar o banco à aplicação',
      'Criptografar a coluna',
    ],
    answer: 0,
  },
  {
    theme: 'banco',
    difficulty: 'facil',
    prompt: 'Qual comando remove linhas de uma tabela?',
    options: ['DROP', 'DELETE', 'REMOVE', 'TRUNCATE COLUMN'],
    answer: 1,
  },
  {
    theme: 'banco',
    difficulty: 'facil',
    prompt: 'Em um banco relacional, uma tabela é composta por:',
    options: [
      'Linhas e colunas',
      'Documentos e coleções',
      'Chaves e valores',
      'Nós e arestas',
    ],
    answer: 0,
  },
  {
    theme: 'banco',
    difficulty: 'media',
    prompt: 'O que um INNER JOIN retorna?',
    options: [
      'Todas as linhas das duas tabelas',
      'Apenas as linhas com correspondência nas duas tabelas',
      'Todas as linhas da tabela da esquerda',
      'As linhas sem correspondência',
    ],
    answer: 1,
  },
  {
    theme: 'banco',
    difficulty: 'media',
    prompt: 'Para que serve um índice em uma tabela?',
    options: [
      'Reduzir o espaço ocupado pelos dados',
      'Acelerar as buscas, ao custo de escrita e espaço',
      'Garantir que os dados não se repitam',
      'Fazer backup automático das linhas',
    ],
    answer: 1,
  },
  {
    theme: 'banco',
    difficulty: 'media',
    prompt: 'O que uma chave estrangeira garante?',
    options: [
      'A ordenação das linhas',
      'A integridade referencial entre tabelas',
      'A unicidade da coluna',
      'A criptografia do relacionamento',
    ],
    answer: 1,
  },
  {
    theme: 'banco',
    difficulty: 'dificil',
    prompt: 'Nas propriedades ACID, o que significa o "I"?',
    options: ['Integridade', 'Isolamento', 'Indexação', 'Imutabilidade'],
    answer: 1,
  },
  {
    theme: 'banco',
    difficulty: 'dificil',
    prompt: 'O que um LEFT JOIN retorna?',
    options: [
      'Só as linhas com correspondência',
      'Todas as linhas da tabela da esquerda, com NULL onde não há par',
      'Todas as linhas das duas tabelas',
      'As linhas duplicadas da direita',
    ],
    answer: 1,
  },
  {
    theme: 'banco',
    difficulty: 'dificil',
    prompt: 'A terceira forma normal (3FN) elimina:',
    options: [
      'Grupos repetitivos',
      'Dependências parciais da chave',
      'Dependências transitivas entre atributos não-chave',
      'Chaves estrangeiras redundantes',
    ],
    answer: 2,
  },

  // ── Algoritmos ────────────────────────────────────────────────────────────
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt: 'Qual é a complexidade da busca binária?',
    options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'],
    answer: 1,
  },
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt: 'Qual estrutura de dados segue a regra "último a entrar, primeiro a sair"?',
    options: ['Fila', 'Pilha', 'Lista ligada', 'Árvore'],
    answer: 1,
  },
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt: 'Qual estrutura de dados segue a regra "primeiro a entrar, primeiro a sair"?',
    options: ['Pilha', 'Fila', 'Grafo', 'Tabela hash'],
    answer: 1,
  },
  {
    theme: 'algoritmos',
    difficulty: 'facil',
    prompt: 'Na busca linear em uma lista de n elementos, quantas comparações o pior caso exige?',
    options: ['1', 'log n', 'n', 'n²'],
    answer: 2,
  },
  {
    theme: 'algoritmos',
    difficulty: 'media',
    prompt: 'Qual é a complexidade do quicksort no caso médio?',
    options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'],
    answer: 1,
  },
  {
    theme: 'algoritmos',
    difficulty: 'media',
    prompt: 'O que toda função recursiva precisa ter para terminar?',
    options: [
      'Um caso base',
      'Um laço de repetição',
      'Uma variável global',
      'Um vetor auxiliar',
    ],
    answer: 0,
  },
  {
    theme: 'algoritmos',
    difficulty: 'media',
    prompt: 'Qual é o pré-requisito para aplicar busca binária?',
    options: [
      'A lista precisa estar ordenada',
      'A lista precisa ter tamanho par',
      'Os elementos precisam ser numéricos',
      'A lista precisa caber na memória cache',
    ],
    answer: 0,
  },
  {
    theme: 'algoritmos',
    difficulty: 'dificil',
    prompt: 'Qual é a complexidade do quicksort no pior caso?',
    options: ['O(n log n)', 'O(n²)', 'O(n)', 'O(log n)'],
    answer: 1,
  },
  {
    theme: 'algoritmos',
    difficulty: 'dificil',
    prompt: 'O que a programação dinâmica evita?',
    options: [
      'O uso de recursão',
      'O recálculo de subproblemas que já foram resolvidos',
      'A alocação de memória extra',
      'O uso de estruturas ordenadas',
    ],
    answer: 1,
  },
  {
    theme: 'algoritmos',
    difficulty: 'dificil',
    prompt: 'Qual é a complexidade média de inserção em uma tabela hash?',
    options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
    answer: 0,
  },
];
