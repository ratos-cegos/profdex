# Tarefa 5 — Modelos 3D dos próximos professores (NDE) e imagens da ProfDex

**Prioridade:** média
**Perfil:** trilha de arte/3D + um passo pequeno de código e banco
**Conversa com:** tarefa 2 (os sprites 2D podem sair renderizados destes modelos)

---

## Contexto do projeto

ProfDex é um app web mobile-first estilo Pokédex da Semana Tecnológica da UNIFIL.
O aluno captura professores por QR, vê o professor em 3D/realidade aumentada e
batalha por turnos.

- **Front:** `profdex-front/` — Vue 3 + Vite. O 3D usa
  `@google/model-viewer` (`src/components/ARViewer.vue`,
  `src/composables/useModelViewer.js`) e, na arena AR ancorada, three.js + WebXR
  (`src/composables/useArenaAR.js`).
- **Modelos:** `profdex-front/public/models/modelo-<slug>.glb`, registrados em
  `src/data/professorModels.js`.
- **Imagens 2D da ficha:** `profdex-front/public/professors/<slug>-cartoon.png`
  (e `-face.png`, `-marker.png`), usadas em `src/views/ProfessorView.vue`,
  `src/views/ScanView.vue` e nas barras de HP da batalha.
- **Back:** NestJS + Prisma. Professores vivem na tabela `professors`, semeados
  em `profdex-back/prisma/seed.ts`.

---

## Situação atual

Três modelos: `modelo-eron.glb`, `modelo-gustavo.glb`, `modelo-mario.glb`.

**Eles são grandes demais: 27 MB, 74 MB e 27 MB.** Isso já causou um bug real —
a batalha carregava dois `.glb` ao mesmo tempo e o Safari descartava a aba no meio
da partida (documentado em `docs/BUG-BATALHA-TRAVANDO.md`); a solução foi trocar o
3D da batalha por sprites 2D. Os modelos hoje só aparecem na tela de RA, um por
vez. **Modelo novo que repita esse peso volta a criar o problema.**

`src/data/professorModels.js` mapeia slug → arquivo, com fallback para o Gustavo.
O campo `modelUrl` do professor no banco, quando preenchido, tem precedência — dá
para trocar o arquivo sem redeploy do front.

---

## 5.1 — Modelar os professores do NDE

### Escopo

> **A PREENCHER:** lista dos professores do NDE (nome completo e slug). O slug
> precisa bater com as chaves já usadas em `src/data/professorTypes.js` e
> `profdex-back/src/battle/engine/professor-types.ts` (ex.: `ricardo-petri`,
> `t-camis`, `serginho`).

### Requisitos do modelo

| Item | Alvo | Porquê |
|---|---|---|
| Tamanho do `.glb` | **≤ 5 MB** (ideal 2–3 MB) | Ver o bug acima. Rede de evento é ruim. |
| Triângulos | ≤ 30 k | Roda em celular intermediário dentro do WebXR. |
| Texturas | ≤ 1024×1024, KTX2/WebP | Textura 4K é o que infla `.glb`. |
| Compressão | Draco ou meshopt | Reduz a geometria em ~10×. |
| Pose | **Natural** (contrapposto, braços relaxados, leve peso numa perna) | Pedido explícito: nada de T-pose. |
| Escala | ~1,7 m de altura real, pés em `y = 0`, virado para `+Z` | `useArenaAR.js` normaliza para 1,6 m e assenta os pés, mas partir certo evita surpresa. |
| Eixo | Y-up, unidade em metros | Padrão glTF. |
| Nome | `modelo-<slug>.glb` | Convenção do `professorModels.js`. |

### Fluxo recomendado

```
foto do professor  →  estilização 2D  →  imagem→3D (IA)  →  limpeza no Blender
                   →  rig + pose no Mixamo  →  otimização  →  .glb no repo
```

1. **Foto** — 1 a 3 fotos do professor, frontal, luz uniforme, fundo simples.
   **Peça autorização de uso de imagem por escrito** — são pessoas reais e o
   modelo vai para um app público.
2. **Estilização** — passe a foto por uma edição que aproxime do estilo dos
   modelos atuais (cartoon estilizado, não realista). Ferramentas: **Gemini
   (edição de imagem)**, **ChatGPT-imagem**, **Krea**, **Leonardo.ai**. Use
   sempre o **mesmo prompt-template e a mesma referência** para os 16 saírem
   coerentes.
3. **Imagem → 3D** — como o Meshy fechou o download no plano gratuito, as opções
   que ainda entregam `.glb` baixável sem pagar:

   | Ferramenta | Como acessar | Observação |
   |---|---|---|
   | **Hunyuan3D (Tencent)** | Modelo aberto; roda em Space do Hugging Face ou local com GPU | Hoje é o melhor custo-benefício em imagem→3D aberto. Exporta GLB. |
   | **TRELLIS (Microsoft)** | Modelo aberto, Space do Hugging Face | Excelente qualidade de malha; exporta GLB. |
   | **Stable Fast 3D (Stability)** | Space do Hugging Face | Muito rápido, malha mais simples — bom para figurantes. |
   | **Tripo3D / TripoSG** | Site com créditos gratuitos | Confira se o download GLB está liberado no plano do dia. |
   | **Rodin (Hyper3D)** | Créditos gratuitos | Boa topologia; verifique a licença de uso. |
   | **Luma Genie** | Gratuito | Texto/imagem → 3D, exporta GLB. |

   Regra prática: **confirme que dá para baixar o `.glb` antes de investir horas**.
   Esses planos mudam toda hora.

4. **Limpeza no Blender** (gratuito) — remover ilhas soltas, fechar buracos,
   decimar para o orçamento de triângulos, reprojetar textura se necessário.
5. **Rig + pose no Mixamo** (gratuito, conta Adobe) — auto-rig humanoide, aplicar
   uma animação de *idle*, parar num frame com boa silhueta e exportar. **É a
   forma mais barata de sair da T-pose** e, de brinde, dá a animação de ataque
   para os sprites da tarefa 2.3.
6. **Otimização** — obrigatória antes do commit:

   ```bash
   npx @gltf-transform/cli optimize entrada.glb modelo-<slug>.glb \
     --compress draco --texture-compress webp --texture-size 1024
   npx @gltf-transform/cli inspect modelo-<slug>.glb   # confira tamanho e tris
   ```

   Se usar Draco, confirme que o `model-viewer` carrega (ele traz o decoder) **e**
   que o `GLTFLoader` de `useArenaAR.js` também — three.js exige registrar o
   `DRACOLoader` explicitamente. Se der trabalho, use **meshopt**, ou aceite
   Draco e ajuste o loader. Teste nas duas telas: `/character-ar/:id` e a arena AR.

7. **Enquanto isso, otimize os três modelos existentes** — 74 MB do Gustavo é
   dívida ativa. Mesmo comando, sem retrabalho de arte.

### Registro no código e no banco

Para cada professor novo:

1. `profdex-front/public/models/modelo-<slug>.glb`
2. `profdex-front/src/data/professorModels.js` → entrada no `PROFESSOR_MODELS`
3. `profdex-front/src/data/professorTypes.js` → tipos em `PROFESSOR_TYPES`
4. **`profdex-back/src/battle/engine/professor-types.ts` → a MESMA entrada.**
   ⚠️ A tabela de tipos está **duplicada** entre front e back (o back é a fonte
   canônica no PvP). Esquecer um lado faz o professor ter tipos diferentes em PvE
   e PvP. Se puder, aproveite e unifique — mas, no mínimo, mexa nos dois.
5. `profdex-back/prisma/seed.ts` → array `PROFESSORS` (name, slug,
   `marker1Index`, `marker2Index` — continuar a numeração existente)
6. Rodar o seed (`npm run db:seed`) para materializar as **variantes de tipo**
   (`ensureProfessorVariants`), e depois `npm run qr:generate` para a tiragem de
   fichas de QR do professor novo.

### Critérios de aceite

- Todo `.glb` novo abaixo de 5 MB, com pose natural e pés no chão.
- `/character-ar/<slug>` carrega em menos de 5 s numa rede 4G comum.
- A arena AR (WebXR, Android) posiciona o modelo em pé, na escala certa.
- Front e back concordam sobre os tipos de cada professor novo (teste de
  paridade entre os dois mapas seria um belo extra).
- Autorização de imagem arquivada para cada professor modelado.

---

## 5.2 — Imagens da ProfDex (a arte 2D da ficha)

### Problema

Os `-cartoon.png` atuais foram feitos sem um padrão escrito. Se o estilo mudar,
**todos** mudam junto — professor com arte fora do padrão salta aos olhos numa
grade de 16 cards.

### O que fazer

1. **Definir o estilo** e escrever em `docs/ESTILO-VISUAL.md` (o mesmo arquivo da
   tarefa 2.1, seção própria). Proposta:

   | Decisão | Valor proposto |
   |---|---|
   | Enquadramento | Busto em 3/4, olhar para a câmera |
   | Formato | 512×512 PNG, fundo **transparente** |
   | Traço | Cartoon com contorno médio, sombreado em 2–3 tons (cel shading) |
   | Paleta | Mesma da tarefa 2.1, com acento na cor do **tipo** do professor |
   | Assinatura | O mesmo objeto-assinatura escolhido para o sprite |
   | Nome do arquivo | `<slug>-cartoon.png` (mantém a convenção atual) |

2. **Gerar para todos**, não só para os novos. Ferramentas com boa consistência de
   personagem: **Gemini (edição de imagem)** e **Leonardo.ai** (com *character
   reference*) são as mais previsíveis; **Ideogram** e **Krea** também servem.
   O truque é sempre o mesmo: uma imagem de referência de estilo + um template de
   prompt idêntico, mudando só a descrição da pessoa.

3. **Conferir onde as imagens aparecem** antes de trocar em massa:
   - `src/views/ProfessorView.vue` — `cartoonSrc` monta
     `/professors/${slug}-cartoon.png` e tem fallback em caso de erro;
   - `src/views/ScanView.vue` — card de captura;
   - `src/components/BattleHpBar.vue` e `src/components/ProfCard.vue`;
   - `src/data/professorSprites.js` — hoje Eron e Mário usam o **cartoon como
     sprite de batalha**. Depois da tarefa 2 isso deixa de ser verdade; até lá,
     mexer no cartoon mexe na arena.

4. Otimizar (`pngquant`/`oxipng`) — meta de ≤ 150 KB por arquivo.

### Critérios de aceite

- Todos os professores com `-cartoon.png` no mesmo estilo, tamanho e recorte.
- A grade da ProfDex parece um conjunto, não uma colagem.
- Nenhum 404 de imagem (o fallback de erro existe, mas não deve ser exercitado).
- `docs/ESTILO-VISUAL.md` com as regras e um exemplo aprovado.

---

## Checklist de entrega da tarefa 5

- [ ] Lista do NDE definida
- [ ] Autorizações de uso de imagem coletadas
- [ ] `.glb` de cada professor do NDE, ≤ 5 MB, pose natural
- [ ] Os três modelos antigos reotimizados
- [ ] `professorModels.js`, `professorTypes.js` (front) e `professor-types.ts`
      (back) atualizados
- [ ] `seed.ts` + `db:seed` + `qr:generate` rodados
- [ ] Estilo das imagens 2D escrito e aplicado a **todos** os professores
- [ ] CHANGELOG atualizado
