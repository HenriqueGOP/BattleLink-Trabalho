# Pokemon Battle IPC

Projeto academico de Sistemas Operacionais sobre comunicacao entre processos, sockets TCP, concorrencia e sincronizacao de estado.

Jogo local de batalha por turnos (estilo competitivo simplificado, com Terastalizacao e clima) para demonstrar comunicacao entre processos em Sistemas Operacionais. Golpes vêm do dataset local; catálogo e detalhes de Pokémon são consultados na PokéAPI na primeira utilização e persistidos em `data/pokeapi-cache/`. Os dados já armazenados funcionam sem internet, inclusive após reiniciar o servidor. Espécies ainda não armazenadas exigem uma primeira consulta online. O React é opcional: o jogo completo também funciona em terminais.

## Requisitos

- Node.js 20.19 ou superior;
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

> Os testes rodam **offline**: `server/src/game/pokeapi.fixture.ts` serve os dados da PokeAPI de memoria, entao a suite nao depende de internet nem do rate limit da API.

## Executar a demonstracao (terminais)

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

Nos dois clientes, monte a equipe e lute. O cliente desenha o estado (barras de HP, pokebolas da equipe, golpes com PP) em vez de despejar o JSON cru. Comandos:

| Comando | Efeito |
| --- | --- |
| `choose <pokemon>` | adiciona um Pokemon a equipe (sao necessarios 6) |
| `moves <pokemon> <g1,g2,g3,g4>` | define ate 4 golpes equipados |
| `ready` | confirma a equipe e trava os golpes; o combate começa após os dois confirmarem |
| `attack <golpe>` | usa um golpe equipado no seu turno |
| `switch <pokemon>` | troca o Pokemon em campo (obrigatorio apos um nocaute) |
| `tera` | terastaliza (uma vez por partida) |
| `reset` | refaz a equipe (so antes da batalha comecar) |
| `state` | reimprime o estado atual |
| `help` / `quit` | ajuda / sair |

O servidor imprime conexoes, locks, validacoes, mudancas de turno e desconexoes.

> As acoes `defend` e `special` foram removidas das regras: o servidor responde com erro orientando a usar golpes equipados (os ataques consomem PP).

## Front-end React

O front-end fica em `client/` (React 19 + Vite + TypeScript + React Router + GSAP + Howler). O navegador usa WebSocket em `127.0.0.1:3002`, porque browsers nao abrem sockets TCP brutos; a ponte fica no mesmo processo do servidor. O catalogo de Pokemon vem da API HTTP em `127.0.0.1:3003`.

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

Abra `http://localhost:5173`. Para jogar no navegador, abra duas abas e informe nomes diferentes. Cada aba entra na fila, monta a equipe de seis, ajusta os golpes e confirma a equipe. O servidor só libera a batalha quando os dois confirmam. A partir daí, os golpes ficam travados e os snapshots oficiais conduzem as animações, sons e HUD.

Para gerar o front-end executavel:

```powershell
cd client
npm run build
npm run preview
```

### Portas usadas

| Porta | Servico |
| --- | --- |
| `3001` | Clientes de terminal via TCP |
| `3002` | Front-end React via WebSocket |
| `3003` | API REST do catalogo (`GET /api/pokemon`) |
| `5173` | Servidor de desenvolvimento Vite |

### Variaveis de ambiente

| Variavel | Onde | Padrao | Funcao |
| --- | --- | --- | --- |
| `PORT` | server | `3001` | TCP dos clientes CLI |
| `WEB_PORT` | server | `3002` | WebSocket do front-end |
| `HTTP_PORT` | server | `3003` | API REST do catalogo |
| `HOST` | server | `127.0.0.1` | Interface de escuta HTTP/WebSocket |
| `TCP_HOST` | server | `127.0.0.1` | Interface TCP, restrita a loopback |
| `ALLOWED_ORIGINS` | server | localhost/127.0.0.1 nas portas 5173 e 4173 | Origens exatas permitidas no HTTP/WebSocket |
| `BATTLE_ACCESS_TOKEN` | server | vazio no modo local | Chave obrigatória para acesso fora de loopback; informada no lobby |
| `MAX_CONNECTIONS` / `MAX_CONNECTIONS_PER_IP` | server | `128` / `16` | Limites compartilhados entre TCP e WebSocket |
| `MAX_MESSAGES_PER_SECOND` / `MAX_PENDING_MESSAGES` | server | `30` / `16` | Limites por conexão |
| `JOIN_TIMEOUT_MS` | server | `10000` | Prazo para entrar na fila após conectar |
| `POKEAPI_CACHE_DIR` | server | `data/pokeapi-cache` | Cache persistente, ignorado pelo Git |
| `VITE_WS_URL` | client | `ws://127.0.0.1:3002` | Endereco do WebSocket |
| `VITE_API_URL` | client | `http://127.0.0.1:3003` | Endereco da API do catalogo |

Copie os exemplos antes de rodar: `Copy-Item server/.env.example server/.env` e `Copy-Item client/.env.example client/.env`.

O servidor carrega `server/.env` automaticamente, preservando variáveis já exportadas pelo shell. Clientes e servidor devem usar o protocolo `pokemon-battle/2`. No terminal, confirme a equipe com `ready`.

Para acesso pela rede, configure uma chave de 32 a 256 caracteres e uma lista explícita de origens. Origens externas usam HTTPS e a ponte deve ser publicada por um proxy TLS (`wss://`). O TCP permanece local. A chave não é gravada no navegador nem enviada em URLs, snapshots ou logs.

Os limites por IP devem ser ajustados quando vários jogadores acessarem pelo mesmo proxy/NAT. O cache guarda os dados já consultados; sprites e sons remotos ainda podem depender de internet, com os fallbacks visuais existentes.

## Estrutura da entrega

- `server/dist`: versao compilada do servidor e do cliente CLI, gerada por `npm run build --prefix server`;
- `client/dist`: versao de producao do front-end, gerada por `npm run build --prefix client`;
- `client/src`: front-end organizado em `pages/`, `components/`, `hooks/`, `services/`, `lib/`, `types/` e `styles/` (detalhes em [client/README.md](client/README.md));
- `server/src/game`: dominio, estado oficial, fila e mutex;
- `data/moves.json`: dataset publico de golpes do Pokemon Showdown, resolvido a partir do proprio modulo (o servidor sobe de qualquer diretorio);
- `docs`: protocolo, arquitetura e [guia explicado do codigo](docs/GUIA_DO_CODIGO.md).

## Troubleshooting

Se aparecer `EADDRINUSE`, ja existe um processo usando `3001`, `3002` ou `3003`. Encerre a outra instancia do servidor ou configure portas alternativas:

```powershell
$env:PORT=3101
$env:WEB_PORT=3102
$env:HTTP_PORT=3103
npm start --prefix server
```

O servidor pode ser iniciado de qualquer diretorio (`npm start --prefix server` na raiz ou `npm start` dentro de `server/`).

Nesse caso, configure tambem o front-end antes de iniciar o Vite:

```powershell
$env:VITE_WS_URL="ws://127.0.0.1:3102"
$env:VITE_API_URL="http://127.0.0.1:3103"
npm run dev --prefix client
```
