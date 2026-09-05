# Guia do codigo

Este documento explica como o projeto funciona por dentro e serve como mapa para futuras alteracoes. A regra mais importante e: **o cliente solicita; o servidor decide**.

## 1. Mapa de pastas

```text
meu-jogo/
  client/                 React + Vite, apenas interface e copia local do estado
    src/App.tsx           conexao WebSocket e telas de lobby/batalha
    src/App.css           identidade visual e responsividade
    src/main.tsx          ponto de entrada React
  server/                 processo oficial da partida
    src/index.ts          adaptadores TCP/WebSocket e ciclo de conexao
    src/config.ts         portas, host e limites configuraveis
    src/protocol.ts       validacao das mensagens recebidas
    src/client.ts         cliente CLI para a apresentacao
    src/game/types.ts     tipos do protocolo e do dominio
    src/game/manager.ts   fila de matchmaking e indice de salas
    src/game/room.ts      regras e estado oficial da batalha
    src/game/mutex.ts     exclusao mutua por sala
    src/game/*.test.ts    testes do dominio e protocolo
  docs/                   protocolo, arquitetura e este guia
```

Arquivos de suporte importantes:

- `package.json` da raiz oferece comandos unificados para instalar, compilar, testar, validar e iniciar cada parte;
- `server/package.json` controla o processo Node e suas dependencias de runtime (`ws`);
- `client/package.json` controla Vite, React, build e Oxlint;
- `server/tsconfig.json` compila TypeScript para `server/dist`;
- `client/tsconfig*.json` separa a configuracao da aplicacao React e da configuracao do Vite;
- `client/src/main.tsx` monta o componente React no elemento `root` e ativa `StrictMode`;
- `client/src/index.css` contem o reset global minimo; o visual da arena vive em `App.css`;
- `.env.example` documenta configuracoes locais sem versionar segredos.

## 2. Inicializacao do servidor

`server/src/index.ts` abre dois transportes para o mesmo dominio:

1. `node:net` escuta TCP em `PORT` (padrao `3001`). Cada mensagem termina em newline.
2. `ws` escuta WebSocket em `WEB_PORT` (padrao `3002`). O navegador usa esta ponte porque a Web API nao permite abrir TCP bruto.

Os dois caminhos criam um `Sender`, registram o jogador e chamam a mesma funcao `handle`. Isso e intencional: terminal e React nao podem ter regras de jogo diferentes.

## 3. Entrada e validacao

`server/src/protocol.ts` e a fronteira de confianca. JSON recebido pela rede e `unknown` ate passar por `parseClientMessage`. A funcao verifica `type`, campos obrigatorios e tipos das acoes. Mensagens malformadas falham antes de tocar em `Room`.

Para adicionar uma nova mensagem:

1. Adicione o formato em `ClientMessage` ou `ServerMessage`, em `game/types.ts`.
2. Adicione a validacao correspondente em `parseClientMessage`.
3. Trate a mensagem em `handle`, no `index.ts`.
4. Cubra a entrada invalida e valida em `protocol.test.ts`.
5. Atualize `docs/protocolo.md`.

## 4. Estado oficial

`server/src/game/room.ts` e a autoridade da partida. `GameState` contem:

- `players`: identidade, Pokemon, HP e energia;
- `turn`: indice `0` ou `1` do jogador autorizado;
- `phase`: batalha ou partida finalizada;
- `log`: historico legivel para a demonstracao;
- `winner`: jogador vencedor ou `null`.

O cliente nunca envia `damage`, `hp`, `turn` ou `winner`. Ele envia uma intencao, por exemplo `action: { type: "attack" }`. `Room.applyAction` valida turno e energia, calcula dano, atualiza HP, regenera energia, troca o turno e detecta vitoria.

Para adicionar um Pokemon, inclua sua vida em `LOCAL_POKEMON`, ajuste as opcoes do React e documente o novo dado. Para adicionar uma acao, altere `ActionType`, valide seu payload, defina custo e implemente o `switch` em `Room.applyAction`.

## 5. Fila e salas

`RoomManager` mantem dois indices:

- `queue`: jogadores aguardando um oponente;
- `rooms`: `playerId` para `Room`, permitindo localizar a sala rapidamente.

Quando o segundo jogador entra, o manager cria uma sala, preserva os nomes e registra os dois IDs. Quando alguem sai, remove a sala dos dois indices e o outro processo recebe `opponent_left`.

Se o jogo crescer para varias modalidades, este e o ponto para introduzir salas publicas/privadas, codigo de convite ou matchmaking por nivel sem colocar essa logica em `Room`.

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

`server/src/client.ts` e propositalmente simples para a apresentacao. Ele conecta por TCP, envia `join` e transforma comandos em mensagens:

```text
choose charizard
attack flamethrower
defend
special
invalid
quit
```

Ele nao possui autoridade especial. E um cliente igual ao React: apenas envia solicitacoes e imprime mensagens do servidor.

## 8. Cliente React

`client/src/App.tsx` possui quatro responsabilidades aceitaveis para uma UI pequena:

1. abrir o WebSocket;
2. converter mensagens recebidas em estado React;
3. enviar eventos de interface como `choose_pokemon` e `action`;
4. renderizar lobby, jogadores, HP, energia, turno e log.

O React nao calcula dano nem troca turno. O estado recebido em `state` substitui a copia local. Para crescer a interface, extraia componentes como `PlayerCard`, `ActionPanel` e `BattleLog` para arquivos separados, mantendo o tipo do protocolo em um modulo compartilhado.

## 9. Configuracao e ambientes

`server/src/config.ts` centraliza `HOST`, `PORT`, `WEB_PORT`, versao do protocolo e limite de nome. O cliente aceita `VITE_WS_URL`. Copie os exemplos:

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
index.ts / handle
  -> RoomManager.roomOf
  -> AsyncMutex.acquire
  -> Room.applyAction
  -> broadcast(state)
  -> dois clientes atualizam suas copias
```

Esse fluxo e o melhor ponto para depurar: primeiro confirme a mensagem enviada, depois os logs de lock, depois o `state` transmitido.

## 11. Testes e evolucao

`npm test --prefix server` verifica regras basicas da sala, ordem do mutex e validacao do protocolo. Ao modificar uma regra, escreva primeiro um caso no teste de dominio. Ao modificar uma mensagem, atualize o teste do protocolo e a documentacao.

Comandos da raiz:

```powershell
npm run install:all
npm run build
npm test
npm run lint
```

O build gera `server/dist` e `client/dist`. Esses artefatos nao devem ser versionados; o codigo-fonte e suficiente para reproduzir a entrega.
