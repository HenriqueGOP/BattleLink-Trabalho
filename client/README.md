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
  services/     socket.ts (WebSocket tipado) e api.ts (REST)
  lib/          eventEngine (diff de snapshots), anim/ (GSAP), audio/ (AudioManager)
  types/        protocolo, batalha, jogador, pokemon e eventos
  styles/       tokens.css + global.css
```

## Reacao aos eventos do servidor

O servidor envia snapshots completos; `lib/eventEngine.ts` deriva eventos por diff (HP, status, trocas, nocaute, Tera, clima, terreno, turno, vitoria) e cruza com as novas linhas do log. Cada evento dispara uma animacao GSAP e um som, em fila sequencial:

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

Para testar com duas pessoas: abra duas abas com nomes diferentes — o servidor emparelha aos pares.