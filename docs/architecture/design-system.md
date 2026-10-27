# Design system — Identidade Visual ONE v1.0

Fonte: *ONE — Identidade Visual v1.0* (manual de 32 páginas, edição de consolidação de 27/10/2026).
Aplicado incrementalmente à base existente (manual, p. 29: "o manual define o design, não uma nova stack").

## Onde está
| Camada | Arquivo |
|---|---|
| Tokens (primitivos e semânticos por tema) | `src/app/globals.css` |
| Primitivas (botões, campos, cartões, badges, alertas, tabela, cabeçalho) | `src/components/ui/index.tsx` |
| Shell (sidebar carvão, navegação, tema) | `src/components/layout/app-shell.tsx`, `theme-switcher.tsx`, `brand.tsx` |
| Gráficos | `src/components/charts/index.tsx` |
| Catálogo local (dados ilustrativos; indisponível em produção) | `/design-system?tema=light|dark` |
| Testes da identidade | `tests/e2e/identity.spec.ts` |

## Paleta
Primitivos: **carvão `#0B0B0F`**, **marfim `#F6F4EF`**, **azul elétrico `#0066FF`**, **ardósia `#6B7280`**.

| Papel | Claro | Escuro |
|---|---|---|
| Fundo | `#F6F4EF` | `#0B0B0F` |
| Superfície (cartões) | `#FFFFFF` | `#17191F` |
| Texto | `#0B0B0F` (17,87:1) | `#F6F4EF` (15,98:1 na superfície) |
| Texto secundário | `#535B66` (6,25:1) | `#A3A9B4` (7,44:1) |
| Limite de campo (essencial) | `#6B7280` (4,4:1) | `#70778A` (3,93:1) |
| Ação / texto na ação | `#0066FF` / `#FFFFFF` (4,83:1) | `#80ADFF` / `#0B0B0F` (8,74:1) |
| Link | `#0052CC` | `#80ADFF` (7,81:1) |
| Informação | `#0052CC` / `#EDF3FF` | `#80ADFF` / `#142340` |
| Confirmação | `#166534` / `#ECFDF3` | `#6CE9A6` / `#0F2A1C` |
| Atenção | `#92400E` / `#FFFBEB` | `#FDD26E` / `#2E2310` |
| Erro ou bloqueio | `#B42318` / `#FEF3F2` | `#FDA29B` / `#3A1714` |
| Sidebar | carvão nos dois temas, item ativo `#1F222B` com barra `#80ADFF` | idem |

Pares claros e os pares escuros de ação/link vêm do manual (p. 6–7, 28). Os pares escuros de
estado, superfícies e texto secundário foram **derivados** nesta implementação (o manual mostra o
tema escuro na p. 18 sem HEX) e conferidos: todos ≥ 4,5:1 para texto e ≥ 3:1 para limites.
Tema escuro não é inversão: cada papel tem par próprio.

Gráficos (validados com o validador de paleta categórica): claro `#0066FF` + `#D95926`, escuro
`#3987E5` + `#D95926`. Cores de estado nunca viram série.

## Tipografia
Space Grotesk (títulos, 400–700, tracking levemente negativo) · Inter (leitura e operação, base 16/24) ·
Roboto Mono (rótulos editoriais "SEÇÃO / CONTEXTO", eixos). Servidas localmente via Fontsource
(sem requisição a terceiros; compatível com a CSP).

Escala usada: microdado 12/16 · legenda 14/20 · corpo 16/24 · título de seção 18–24 · título de página
28/32 (celular) e 40/44 (≥ 640 px).

## Forma, espaço e movimento
Raios 4 (detalhe) · 8 (controle) · 12 (cartão) · 16 (diálogo). Base de 4 px. Margens 20/24/32 px por faixa;
conteúdo máximo 1280 px; sidebar 240 px. Sombra só em camadas sobrepostas (drawer, menus).
Foco 3 px com afastamento 3 px. Toque ≥ 44 px. Motion 120/180/260 ms, `cubic-bezier(.2,0,0,1)`,
desligado com `prefers-reduced-motion`. Camadas: fixo 10 · menu 20 · sobreposição 30 · diálogo 40 · aviso 50.

## Componentes
- Botão: **primário** (um por área de decisão), **secundário** (borda ardósia), **destrutivo** (fundo de erro + borda).
- Campo: rótulo permanente, ajuda abaixo, erro em texto ligado por `aria-describedby`; borda de erro mais espessa.
- Badge/alerta: o texto nomeia o estado; a cor é o segundo sinal.
- Tabela: cabeçalho em frase, linha forte sob o cabeçalho; no celular vira cartões rotulados.
- Estados vazio/carregando/erro orientam a continuidade.

## Tema
Segue o sistema por padrão; o usuário pode fixar Claro/Escuro na sidebar (cookie `one-theme`,
lido no servidor — sem script inline, compatível com a CSP).

## Marca
O manual (p. 3–4) registra que o **arquivo mestre do logo ainda não foi incorporado** e proíbe
redesenhar/vetorizar a marca ou criar símbolo alternativo. Por isso "ONE" aparece como texto
identificador em Space Grotesk 700 (`BrandMark`) e nos ícones do PWA (`scripts/generate-icons.mjs`).
O símbolo provisório anterior (círculo com traço) foi removido. Quando o master chegar: substituir o
conteúdo de `src/components/layout/brand.tsx` e regenerar os ícones a partir do SVG original.
