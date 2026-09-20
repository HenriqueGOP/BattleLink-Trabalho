# Guia do codigo

Este documento explica como o projeto funciona por dentro e serve como mapa para futuras alteracoes. A regra mais importante e: **o cliente solicita; o servidor decide**.

## 1. Mapa de pastas

```text
meu-jogo/
  client/                      React 19 + Vite + TypeScript - apenas interface
    src/main.tsx               entrada: fontes, estilos globais e BrowserRouter
    src/App.tsx                rotas (/ , /selecao, /equipe, /batalha) + provedores
    src/pages/                 HomePage, SelectionPage, TeamSetupPage, BattlePage
      BattlePage/components/   cena de batalha: BattleField (sprites, clima),
                               HUDs, MoveMenu, BattleControls, BattleLog,
                               TurnIndicator, WeatherLayer, EndOverlay
    src/components/            UI compartilhada: Button, TypeBadge, HealthBar,
                               Toast, AudioSettings, PokeballSpinner (CSS Modules)
    src/context/               BattleProvider: conexao, snapshot e acoes do protocolo
    src/hooks/                 useSocket, useBattle, useBattleEvents, useCatalog, useAudio
    src/services/              socket.ts (WebSocket tipado) e api.ts (catalogo REST)
    src/lib/                   eventEngine.ts (diff de snapshots), anim/ (GSAP),
                               audio/ (AudioManager + procedural Web Audio), moves.ts
    src/types/                 protocol.ts, battle.ts, player.ts, pokemon.ts, events.ts
    src/styles/                tokens.css (design system) e global.css (reset/base)
    src/assets/images/         arte local (hero)
  server/                      processo oficial da partida
    src/index.ts               adaptadores TCP/WebSocket/HTTP e ciclo de conexao
    src/config.ts              portas, host e limites configuraveis
    src/protocol.ts            validacao das mensagens recebidas
    src/client.ts              cliente CLI para a apresentacao
    src/game/types.ts          tipos do protocolo e do dominio
    src/game/manager.ts        fila de matchmaking e indice de salas
    src/game/room.ts           regras e estado oficial da batalha
    src/game/showdown-moves.ts integracao com o dataset de golpes (data/moves.json)
    src/game/pokeapi.ts        PokeAPI, cache, learnsets, sprites e cries
    src/game/mutex.ts          exclusao mutua por sala
    src/game/*.test.ts         testes do dominio e do protocolo
  data/                        moves.json (dataset publico do Showdown)
  docs/                        protocolo, arquitetura e este guia
```

Arquivos de suporte importantes:

- `package.json` da raiz oferece comandos unificados (`install:all`, `build`, `test`, `lint`, `format`, `dev:server`, `dev:client`);
- `server/package.json` controla o processo Node com a dependencia `ws`;
- `client/package.json` controla React, Vite, GSAP (animacoes), Howler (cries) e React Router; lint com ESLint e formatacao com Prettier;
- `client/tsconfig*.json` separa a configuracao da aplicacao React e da configuracao do Vite;
- `.env.example` documenta configuracoes locais sem versionar segredos.

## 2. Inicializacao do servidor

`server/src/index.ts` abre tres servicos para o mesmo dominio:

1. `node:net` escuta TCP em `PORT` (padrao `3001`). Cada mensagem termina em newline.
2. `ws` escuta WebSocket em `WEB_PORT` (padrao `3002`). O navegador usa esta ponte porque a Web API nao permite abrir TCP bruto.
3. `node:http` expoe a API REST do catalogo em `HTTP_PORT` (padrao `3003`) em `GET /api/pokemon`.

Os dois primeiros caminhos criam um `Sender`, registram o jogador e chamam o mesmo handler. Isso e intencional: terminal e React nao podem ter regras de jogo diferentes.

## 3. Entrada e validacao

`server/src/protocol.ts` e a fronteira de confianca. JSON recebido pela rede e tratado como `unknown` ate passar por `parseClientMessage`, que verifica `type`, campos obrigatorios e tipos das acoes. Mensagens malformadas falham antes de tocar em `Room`.

Para adicionar uma nova mensagem:

1. Adicione o formato em `ClientMessage` ou `ServerMessage`, em `game/types.ts`.
2. Adicione a validacao correspondente em `parseClientMessage`.
3. Trate a mensagem no handler do `index.ts`.
4. Cubra a entrada invalida e valida em `protocol.test.ts`.
5. Atualize `docs/protocolo.md`.

## 4. Estado oficial

`server/src/game/room.ts` e a autoridade da partida. `GameState` contem:

- `players`: identidade, equipe de seis, Pokemon ativo, HP, energia, status, estagios, golpes e Tera;
- `field`: clima (`rain`/`sun`/`sandstorm`/`snow`), terreno (`electric`/`grassy`/`misty`/`psychic`) e hazards;
- `pendingSwitch`: indica quem precisa escolher um novo Pokemon apos nocaute;
- `turn`: indice `0` ou `1` do jogador autorizado;
- `phase`: batalha ou partida finalizada;
- `log`: historico legivel (as strings seguem padroes fixos, parseados pelo front);
- `winner`: jogador vencedor ou `null`.

O cliente nunca envia `damage`, `hp`, `turn` ou `winner`. Ele envia intencoes como `action: { type: "attack" }` e `switch_pokemon`. A sala valida turno e energia, calcula dano, atualiza HP, regenera energia, troca o turno e detecta vitoria quando nao ha reservas vivas.

## 5. Fila e salas

`RoomManager` mantem dois indices:

- `queue`: jogadores aguardando um oponente;
- `rooms`: `playerId` para `Room`, permitindo localizar a sala rapidamente.

Quando o segundo jogador entra, o manager cria uma sala, preserva os nomes e registra os dois IDs. Quando alguem sai, remove a sala dos dois indices e o outro processo recebe `opponent_left`.

## 6. Exclusao mutua

O recurso compartilhado e `room.state`. A regiao critica e qualquer escolha de Pokemon ou acao que modifique esse objeto. `AsyncMutex` funciona como uma fila FIFO:

```ts
const unlock = await room.mutex.acquire();
try {
  room.applyAction(playerId, action);
} finally {
  unlock();
}
```

O `finally` e essencial: mesmo uma excecao de validacao libera o bloqueio. Se dois ataques chegarem juntos, somente um entra primeiro; o segundo espera e valida o novo turno depois. Assim nao existe intercalamento de mutacoes.

## 7. Cliente CLI

`server/src/client.ts` e propositalmente simples para a apresentacao. Ele conecta por TCP, envia `join` e transforma comandos em mensagens. Ele nao possui autoridade especial: e um cliente igual ao React, apenas envia solicitacoes e imprime mensagens do servidor.

## 8. Cliente React

O front-end e organizado em camadas, com React Router nas rotas `/` (lobby), `/selecao` (equipe), `/equipe` (golpes) e `/batalha`:

- `services/socket.ts` e um singleton tipado: nenhum componente fala com o WebSocket bruto;
- `context/BattleProvider.tsx` converte mensagens do servidor em estado React e expoe as acoes do protocolo;
- `lib/eventEngine.ts` deriva eventos comparando snapshots consecutivos (HP, status, trocas, clima, turno, vitoria) e cruzando com as novas linhas do `log`;
- `hooks/useBattleEvents.ts` transforma a fila de eventos em teatro sequencial: `BattleEffects` (GSAP: lunge, flash, shake, particulas), `DamageNumbers` (numeros flutuantes), `WeatherLayer` (particulas de clima em canvas) e sons via `lib/audio`;
- `lib/audio/AudioManager.ts` separa musica e efeitos com volumes/mutes persistidos em `localStorage`; SFX e musica sao procedurais (Web Audio) e cries usam Howler com os arquivos da PokeAPI.

O React nao calcula dano nem troca turno. O estado recebido em `state` substitui a copia local; a fila de eventos apenas conduz animacoes e sons.

## 9. Configuracao e ambientes

`server/src/config.ts` centraliza `HOST`, `PORT` (TCP), `WEB_PORT` (WebSocket), versao do protocolo e limite de nome; `HTTP_PORT` e lido em `index.ts`. O cliente aceita `VITE_WS_URL` e `VITE_API_URL`. Copie os exemplos:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Em producao, troque `127.0.0.1` por um host apropriado e configure a origem permitida na ponte WebSocket antes de expor o processo.

## 10. Fluxo completo de uma acao

```text
React/CLI
  -> JSON action
transporte TCP ou WebSocket
  -> parseClientMessage
index.ts / handler
  -> RoomManager.roomOf
  -> AsyncMutex.acquire
  -> Room.applyAction
  -> broadcast(state)
  -> dois clientes atualizam suas copias (front deriva eventos do diff)
```

Esse fluxo e o melhor ponto para depurar: primeiro confirme a mensagem enviada, depois os logs de lock, depois o `state` transmitido.

## 11. Testes e evolucao

`npm test` (raiz) roda os testes do servidor: regras basicas da sala, ordem do mutex e validacao do protocolo. Ao modificar uma regra, escreva primeiro um caso no teste de dominio. Ao modificar uma mensagem, atualize o teste do protocolo e a documentacao.

Comandos da raiz:

```powershell
npm run install:all
npm run build
npm test
npm run lint
npm run format
```

O build gera `server/dist` e `client/dist`. Esses artefatos nao devem ser versionados; o codigo-fonte e suficiente para reproduzir a entrega.