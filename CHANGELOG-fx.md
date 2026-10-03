# Changelog — Game feel + fundos aleatórios (19/09/2026)

## O que foi adicionado nesta rodada

### 1. Novo módulo de efeitos: `client/src/lib/anim/fx.ts` (Web Animations API nativa, 0 dependências)
Técnicas da comunidade aplicadas:
- **Screen shake por "trauma" decrescente** (DaveTech/FEEL pattern): acumulável, curva quadrática, com micro-rotação — alimentado por variáveis CSS (`--fx-shake-x/y/r`) no palco (`data-fx-stage`), sem brigar com os transforms GSAP dos sprites.
- **Hit-stop seletivo** (70 ms normal / 120 ms crítico): pausa só as Web Animations do palco — substitui o `gsap.globalTimeline.timeScale(0.18)` que congelava o cenário inteiro.
- **Lunge com antecipação + squash & stretch** (princípios Disney): 5 keyframes — agacha (anticipação) → salta (stretch) → impacto (squash) → retorno.
- **Esquiva com telegrafia**: alvo agacha e dá dash no timing do golpe (usada no evento `miss`).
- **Flash de impacto** com `mix-blend-mode: screen` (substitui o `filter: brightness(3.2)` que forçava repaint).
- **Partículas de impacto** com cor por severidade (normal = quente; crítico = fogo) e **números de dano flutuantes** grandes.

### 2. `BattleEffects.tsx` reorganizado
- `damage/special/confusion_hit`: lunge novo + pacote de impacto (flash/tremor/partículas/número) + hit-stop + trauma.
- `miss`: telegrafia de esquiva + "ESQUIVOU!" flutuante.
- `effective/resisted`: "SUPER EFETIVO!"/"POUCO EFETIVO…" flutuante sobre o alvo.
- `residual`: tremor + partículas + número.
- `faint`: ganhou trauma de cena (queda com impacto).
- CSS de suporte em `styles/effects.css` (classes `fx-impact-*`, `fx-float-damage`).

### 3. Fundos de batalha com imagem real + sorteio aleatório por partida
- **6 cenários** com imagem baixada da CDN do Pokémon Showdown para `client/public/backgrounds/<id>/bg.jpg`:
  | id | origem | peso |
  |---|---|---|
  | meadow | gen6bgs/bg-meadow.jpg | 23 KB |
  | forest | gen6bgs/bg-forest.jpg | 24 KB |
  | cave | gen6bgs/bg-earthycave.jpg | 20 KB |
  | night | gen6bgs/bg-darkmeadow.jpg | 16 KB |
  | beach | gen6bgs/bg-orassea.jpg | 29 KB |
  | city | gen6bgs/bg-city.jpg | 37 KB |
- **Servidor sorteia 1 de 6** (`room.ts`: `BATTLE_BACKGROUNDS` agora com 6 ids) e envia no `state.field.background` — os dois clientes recebem o MESMO cenário (igual antes, fonte de verdade no servidor).
- Cliente registra os novos ids (`battleBackgrounds.ts` + tipo `BackgroundId`).
- Fallback mantido: sem imagem, o cenário CSS por camadas continua funcionando.
- Créditos/licença documentados em `client/public/backgrounds/CREDITS.md` (arte da franquia via repositório MIT do Showdown — uso pessoal/fan-game).

### 4. Correção do sprite no protótipo (entregável anterior)
- `DELIVERY/prototipo-battle-fx.html`: o "ally" usava o back sprite do **Squirtle** (#7) com o HUD dizendo Blastoise — trocado para `back/9.png` (Blastoise), espelhado (`scaleX(-1)`) para encarar o oponente à direita.

## Como testar
1. `npm run dev:server` + `npm run dev:client`.
2. Jogue 3–6 partidas: o cenário deve variar (6 possibilidades; verifique o log do servidor `[partida]`).
3. Ataque um oponente fraco: repare na antecipação do golpe, flash, tremor da tela (cenário treme junto), número de dano e hit-stop.
4. Tome um crítico: hit-stop mais longo + flash quente + número grande laranja.
5. Erre um golpe (ou seja alvo de "miss"): o alvo agacha e esquiva com dash.
6. Deixe um Pokémon desmaiar e troque: queda + trauma na cena, e o substituto entra sem herdar animação.

## Como reverter
- `git checkout` de: `server/src/game/room.ts`, `client/src/config/battleBackgrounds.ts`, `client/src/types/battle.ts`, `client/src/pages/BattlePage/BattlePage.tsx`, `client/src/pages/BattlePage/BattlePage.module.css`, `client/src/pages/BattlePage/components/BattleEffects/BattleEffects.tsx`, `client/src/styles/effects.css`.
- Deletar `client/src/lib/anim/fx.ts` e `client/public/backgrounds/<id>/bg.jpg` (opcional — sem eles o jogo volta ao cenário CSS).

## Verificação executada
- `npm test --prefix server`: Domain + Event + Protocol tests passed (exit 0).
- `npm run build --prefix client` (tsc -b + vite): ✓ built, exit 0.
- 6 imagens validadas por assinatura de arquivo (JPEG correto, renomeadas de .png para .jpg).
