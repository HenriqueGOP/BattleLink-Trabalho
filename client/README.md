# Pokemon Battle - front-end (React)

Interface web do jogo de batalha Pokemon por turnos. O front-end e apenas apresentacao: envia **intenções** ao servidor e exibe os **snapshots oficiais** recebidos, reagindo a cada evento com animacoes e som.

## Stack

- **React 19 + TypeScript + Vite 8**;
- **React Router 7** — rotas `/` (lobby), `/selecao` (equipe), `/equipe` (golpes) e `/batalha`;
- **GSAP** — coreografia de batalha (HP, impactos, numeros flutuantes, confete, shake);
- **Howler** — cries dos Pokemon (arquivos da PokeAPI);
- **Web Audio API** — SFX e musica procedurais (chiptune), sem assets externos;
- **CSS Modules + design tokens** (`src/styles/tokens.css`) — identidade pixel-art moderna, self-hosted com `@fontsource` (Press Start 2P + VT323);
- **ESLint + Prettier** — qualidade e formatacao.

> **Por que sem TanStack Query?** A unica chamada REST e o catalogo (`GET /api/pokemon`), endpoint estatico e cacheado pelo proprio servidor — um hook dedicado (`useCatalog`) cobre loading/erro/retry sem dependencia extra.

## Estrutura

```text
src/
  components/   UI compartilhada (1 pasta por componente, com CSS Module)
  pages/        telas: HomePage, SelectionPage, TeamSetupPage, BattlePage
  hooks/        useSocket, useBattle, useBattleEvents, useCatalog, useAudio
  services/     socket.ts + socketService.ts (WebSocket tipado) e api.ts (REST)
  lib/          eventEngine (diff de snapshots), anim/ (GSAP), audio/ (AudioManager)
  types/        protocolo, batalha, jogador, pokemon e eventos
  styles/       tokens.css + global.css
```

## Reacao aos eventos do servidor

O servidor envia snapshots na perspectiva de cada jogador, com eventos estruturados e ordenados. `lib/eventEngine.ts` usa os IDs desses eventos, traduz vitória/derrota para o jogador local e mantém o diff de snapshots/log como fallback. Cada evento dispara uma animação GSAP e um som, em fila sequencial:

| Evento | Visual | Som |
| --- | --- | --- |
| attack | lunge do atacante | por categoria |
| damage/crit | flash + shake + numero + particulas | damage/crit |
| heal | brilho verde + particulas subindo | heal |
| faint | sprite desaba | faint |
| switch_in | flash de Pokebola + entrada | switch |
| tera | erupcao de particulas + glow | tera |
| weather/terrain | camada de clima transiciona | field |
| turn_change | banner SEU TURNO / OPONENTE | turn |
| victory/defeat | confete / escurecer + overlay | jingle |

## Desenvolvimento

```powershell
npm install
npm run dev        # Vite em http://localhost:5173
npm run build      # tsc -b && vite build
npm run lint       # ESLint
npm run format     # Prettier
```

O servidor precisa estar rodando (`npm start --prefix server`). Variaveis (veja `.env.example`): `VITE_WS_URL` (padrao `ws://127.0.0.1:3002`) e `VITE_API_URL` (padrao `http://127.0.0.1:3003`).

Para testar com duas pessoas: abra duas abas com nomes diferentes. Cada jogador monta seis Pokémon, ajusta de um a quatro golpes e confirma a equipe. A batalha só começa quando ambos confirmam; o servidor trava os golpes durante o combate. O cliente exige `pokemon-battle/2`.

Se o servidor exigir uma chave, informe-a no campo de acesso do lobby. A chave permanece apenas em memória. Para um servidor remoto, configure URLs HTTPS/WSS e a origem do frontend na lista permitida do backend. O fechamento manual ou remoto da conexão desabilita as ações; a desconexão do adversário produz o resultado final, inclusive durante a preparação.
