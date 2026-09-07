# Padrão de código

## Geral

- Usar UTF-8, LF e Prettier como formato canônico.
- Executar lint sem `--fix` durante auditoria; aplicar `--fix` apenas como mudança deliberada e revisar o diff.
- Preferir `const`; usar `let` somente quando houver reatribuição.
- Remover variáveis e imports não usados.
- Evitar arquivos duplicados, comentários mortos e código comentado.
- Não misturar refatoração ampla com correção de segurança urgente.

## JavaScript e TypeScript

- Usar TypeScript para contratos de backend e considerar migração gradual do domínio crítico do frontend.
- Evitar `any`; modelar DTOs, respostas e eventos de batalha.
- Validar dados em runtime na fronteira, mesmo quando tipados.
- Usar early return para reduzir aninhamento.
- Extrair funções puras para cálculos e regras.
- Injetar dependências não determinísticas: RNG, relógio, rede e storage.
- Não acessar `window`, `document`, `navigator` ou `localStorage` dentro do domínio puro.

## Vue

- Manter `<script setup>`, template e estilo com responsabilidade clara.
- Extrair SFC acima de 400 linhas quando houver mais de uma responsabilidade.
- Não executar chamadas concorrentes duplicadas em `onMounted` e guards.
- Tratar erro e cleanup em todo composable com recurso externo.
- Derivar UI com `computed`; não duplicar estado derivável.
- Não usar `innerHTML`; desmontar recursos por API/lifecycle.
- Não guardar credencial persistente no Web Storage.
- Usar componentes acessíveis e nomes de eventos explícitos.
- Evitar lógica de autorização em route guards como controle de segurança; guard é apenas UX.

## Nest e Prisma

- Manter controller fino: validar DTO, obter principal e delegar.
- Manter service com regra de domínio e repository/adaptor com persistência.
- Usar DTO de saída/mapper com allowlist.
- Nunca retornar entidades com senha, hash, token de captura ou campo interno.
- Usar transação para operações compostas.
- Usar `ConfigService.getOrThrow` e schema de configuração.
- Implementar shutdown hooks e desconexão limpa.
- Separar seed de `OnModuleInit` em produção.
- Mapear erros Prisma para códigos HTTP/domínio previsíveis.

## Nomenclatura

- Componentes: `PascalCase.vue`.
- Composables: `useXxx`.
- Stores: entidade plural/singular consistente.
- Funções: verbo + objeto (`captureProfessor`, `validateQrProof`).
- Booleanos: `isCaptured`, `hasCamera`, `canBattle`.
- Constantes globais: `UPPER_SNAKE_CASE`.
- Eventos: verbo no passado quando fato (`professorCaptured`) e imperativo para comando (`captureProfessor`).

## Erros e logs

- Nunca usar `catch {}` sem comentário de intenção, métrica e resultado seguro.
- Mostrar mensagem amigável ao jogador e preservar causa técnica para observabilidade.
- Definir erros de domínio estáveis, sem depender do texto do banco/framework.
- Não registrar senha, JWT, QR token, secret ou payload pessoal.
- Adicionar request/correlation ID.

## Complexidade

- Complexidade recomendada por função: até 10.
- Aninhamento recomendado: até 3 níveis.
- Função recomendada: até 40 linhas.
- Módulo de domínio recomendado: até 300 linhas.
- Ao exceder, justificar com coesão e testes; não fragmentar apenas para atingir número.

## Imports e dependências

Ordem:

1. Node/browser/framework.
2. Bibliotecas externas.
3. Aliases internos.
4. Relativos.
5. Assets/estilos.

- Não carregar duas versões de Three.js.
- Não carregar CDN em runtime quando pacote já existe no bundle.
- Não adicionar dependência para função trivial.
- Fixar major/minor conforme política e manter lockfile revisado.

## CSS e acessibilidade

- Usar tokens para cor, espaço, raio, camada e motion.
- Evitar inline style e valores mágicos repetidos.
- Suportar teclado, foco, leitores de tela e reduced motion.
- Não desabilitar zoom do viewport sem requisito validado.
- Manter alvos de toque mínimos e contraste WCAG AA.

## Commits e revisão

- Um commit deve ter propósito verificável.
- Incluir teste de regressão junto à correção.
- Explicar risco e rollback para migrations, auth e progressão.
- Revisar código gerado e alterações automáticas antes de aceitar.

### `eslint --fix` não é só formatação

`profdex-back` tem erros de Prettier acumulados em arquivos antigos, e a
tentação é rodar `eslint --fix "src/**/*.ts"` de uma vez. **Não faça sem ler o
diff.** Em 07/09/2026 esse comando, além de reindentar, removeu asserções de
tipo em `engine/iv-balance.spec.ts` e deixou o import de `BattleState` órfão —
mudança semântica escondida no meio de um diff de 84 linhas que parecia
cosmético.

Corrija por arquivo, e só os que você está mexendo:

```bash
npx eslint --fix src/caminho/do/arquivo.ts && git diff -- src/caminho/do/arquivo.ts
```

Os erros restantes em arquivos alheios são dívida conhecida — limpá-los é uma
tarefa própria, com o diff revisado e os testes rodados, não um efeito colateral
de outro trabalho.
