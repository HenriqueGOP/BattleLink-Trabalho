# Pokemon Battle IPC

Projeto academico de Sistemas Operacionais sobre comunicacao entre processos, sockets TCP, concorrencia e sincronizacao de estado.

Jogo local de batalha por turnos para demonstrar comunicacao entre processos em Sistemas Operacionais.
O funcionamento basico usa TCP, JSON e dados locais; nenhuma API externa e necessaria. O React e opcional: o jogo completo tambem funciona em terminais.

## Requisitos

- Node.js 20 ou superior;
- npm;
- Windows, Linux ou macOS.

## Instalar e validar

Na raiz do repositorio:

```powershell
npm run install:all
npm run build
npm test
npm run lint
```

## Executar a demonstracao

Em tres terminais PowerShell, execute:

```powershell
cd server
npm install
npm run build
npm start
```

```powershell
cd server
npm run client -- Alice
```

```powershell
cd server
npm run client -- Bob
```

Nos dois clientes, use `choose charizard` (ou `blastoise`/`venusaur`). Depois, no jogador cujo turno aparece em `state.turn`, use `attack flamethrower`, `defend` ou `special`. O cliente `invalid` demonstra uma mensagem rejeitada. O servidor imprime conexoes, locks, validacoes, mudancas de turno e desconexoes.

## Requisitos demonstrados

- `node:net` fornece sockets TCP cliente/servidor.
- O servidor mantem o estado oficial e transmite snapshots aos dois clientes.
- Mensagens sao JSON delimitadas por newline e seguem `pokemon-battle/1`.
- Cada sala possui um `AsyncMutex`: a alteracao do estado e a regiao critica.
- A fila de espera conecta exatamente dois jogadores por partida.
- O cliente mantem apenas uma copia para exibicao; dano, turno e vencedor sao calculados no servidor.

Consulte [docs/protocolo.md](docs/protocolo.md), [docs/arquitetura.md](docs/arquitetura.md) e o [guia explicado do codigo](docs/GUIA_DO_CODIGO.md).

## Front-end React

O front-end fica em `client/`. O navegador usa WebSocket em `127.0.0.1:3002`, porque browsers nao abrem sockets TCP brutos. A ponte WebSocket fica no mesmo processo do servidor e encaminha as mesmas mensagens do protocolo para o estado central.

Em um terminal, inicie o servidor:

```powershell
cd server
npm install
npm run build
npm start
```

Em outro terminal, inicie o React:

```powershell
cd client
npm install
npm run dev
```

Abra `http://localhost:5173`. Para jogar no navegador, abra duas abas e informe nomes diferentes. Cada aba entra na fila, escolhe um Pokemon e recebe os snapshots sincronizados pelo servidor.

Para gerar o front-end executavel:

```powershell
cd client
npm run build
npm run preview
```

Portas usadas:

- `3001`: clientes de terminal via TCP.
- `3002`: front-end React via WebSocket.
- `5173`: servidor de desenvolvimento Vite.

Se outra porta for necessaria, use `PORT` e `WEB_PORT` no servidor ou `VITE_WS_URL` no cliente.

## Estrutura da entrega

- `server/dist`: versao compilada do servidor e do cliente CLI, gerada por `npm run build --prefix server`;
- `client/dist`: versao de producao do front-end, gerada por `npm run build --prefix client`;
- `server/src/game`: dominio, estado oficial, fila e mutex;
- `docs`: protocolo, arquitetura e explicacao didatica dos arquivos.

## Troubleshooting

Se aparecer `EADDRINUSE`, ja existe um processo usando `3001` ou `3002`. Encerre a outra instancia do servidor ou configure portas alternativas:

```powershell
$env:PORT=3101
$env:WEB_PORT=3102
npm start --prefix server
```

Nesse caso, configure tambem o front-end antes de iniciar o Vite:

```powershell
$env:VITE_WS_URL="ws://127.0.0.1:3102"
npm run dev --prefix client
```
