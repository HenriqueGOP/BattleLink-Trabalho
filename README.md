# Pokemon Battle IPC

Projeto academico de Sistemas Operacionais sobre comunicacao entre processos, sockets TCP, concorrencia e sincronizacao de estado.

Jogo de batalha Pokémon singles: dois jogadores, seis Pokémon por equipe e escolhas simultâneas privadas. As regras Gen 9 são executadas por `@pkmn/sim@0.10.11` exclusivamente no servidor. O catálogo, sprites, fontes e cries são locais; partidas não consultam PokéAPI ou CDNs. Nível 50, IVs 31, EVs 0 e natureza neutra; somente Adaptability tem efeito quando a espécie permite. Sem itens, Terastalização, clima/terreno de combate, hazards ou formas alternativas.

**Reformulação implementada até a fase 7:** motor, protocolo `pokemon-battle/3`, terminal, React, apresentação sincronizada, menus acessíveis, seis arenas originais e 24 efeitos de combate em spritesheets locais. A medição de 60 FPS em celular real continua pendente. Consulte os relatórios de [menus](docs/FASE_5_MENUS.md), [arenas](docs/FASE_6_ARENAS.md), [animações](docs/FASE_7_ANIMACOES.md), [validação conjunta](docs/FASES_5_6_7_VALIDACAO.md) e o [ADR](docs/adr/battle-overhaul.md).

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

> Os testes rodam **offline**, incluindo integração TCP/WebSocket/HTTP, privacidade, recursos locais e matemática contra uma calculadora independente. Os testes históricos do cache usam respostas em memória.

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

Nos dois clientes, monte a equipe e lute. O cliente mostra equipes, HP, solicitações privadas e golpes com PP. Comandos:

| Comando | Efeito |
| --- | --- |
| `choose <id>` | adiciona um Pokemon a equipe (sao necessarios 6) |
| `moves <pokemon> <g1,g2,g3,g4>` | define ate 4 golpes equipados |
| `ready` | confirma a equipe e trava os golpes; o combate começa após os dois confirmarem |
| `attack <id>` | envia a escolha privada de um golpe disponível |
| `switch <pokemon>` | troca o Pokemon em campo (obrigatorio apos um nocaute) |
| `random [quantidade]` | sorteia no servidor os espaços restantes, ou a quantidade indicada |
| `retry` | reenvia a ação pendente com o mesmo identificador |
| `reset` | refaz a equipe (so antes da batalha comecar) |
| `state` | reimprime o estado atual |
| `help` / `quit` | ajuda / sair |

Use IDs canônicos: `charizard`, `icebeam`, `willowisp`. Os golpes escolhidos precisam pertencer ao learnset da espécie e estar disponíveis no formato. O servidor imprime conexões, locks e desconexões.

> Cada rodada aguarda as escolhas dos jogadores necessários. Prioridade, velocidade e RNG determinam a ordem de resolução; ordem de chegada na rede não dá vantagem.

## Front-end React

O front-end fica em `client/` (React 19 + Vite + TypeScript + React Router + GSAP + Howler). O navegador usa WebSocket em `127.0.0.1:3002`, porque browsers nao abrem sockets TCP brutos; a ponte fica no mesmo processo do servidor. O catálogo é empacotado no frontend. A API HTTP local em `127.0.0.1:3003` permanece disponível para consultar IDs, nomes e números.

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

Abra `http://localhost:5173`. Para jogar no navegador, abra duas abas e informe nomes diferentes. Cada aba entra na fila, monta a equipe de seis, ajusta os golpes e confirma a equipe. O servidor libera a batalha após a confirmação das equipes e a preparação dos dois clientes (preload local com limite de três segundos). A partir daí, os golpes ficam travados e os snapshots oficiais conduzem as animações, sons e HUD.

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
| `PREPARATION_TIMEOUT_MS` | server | `8000` | Prazo para os clientes confirmarem recursos prontos |
| `VITE_WS_URL` | client | `ws://127.0.0.1:3002` | Endereco do WebSocket |

Copie os exemplos antes de rodar: `Copy-Item server/.env.example server/.env` e `Copy-Item client/.env.example client/.env`.

O servidor carrega `server/.env` automaticamente, preservando variáveis já exportadas pelo shell. Clientes e servidor devem usar o protocolo `pokemon-battle/3`. No terminal, confirme a equipe com `ready`.

Para acesso pela rede, configure uma chave de 32 a 256 caracteres e uma lista explícita de origens. Origens externas usam HTTPS e a ponte deve ser publicada por um proxy TLS (`wss://`). O TCP permanece local. A chave não é gravada no navegador nem enviada em URLs, snapshots ou logs.

Os limites por IP devem ser ajustados quando vários jogadores acessarem pelo mesmo proxy/NAT. Recursos locais ausentes usam fallback local; o pacote completo deve acompanhar `client/dist`. A origem e os avisos de direitos estão em [créditos dos recursos](client/public/pokemon/CREDITS.md).

## Estrutura da entrega

- `server/dist`: versao compilada do servidor e do cliente CLI, gerada por `npm run build --prefix server`;
- `client/dist`: versao de producao do front-end, gerada por `npm run build --prefix client`;
- `client/src`: front-end organizado em `pages/`, `components/`, `hooks/`, `services/`, `lib/`, `types/` e `styles/` (detalhes em [client/README.md](client/README.md));
- `server/src/game`: dominio, estado oficial, fila e mutex;
- `server/src/contracts`: protocolo, decoder, catálogo e textos de eventos compartilhados;
- `server/src/game/engine`: fachada isolada do simulador;
- `server/src/data`: catálogo gerado da versão fixada;
- `client/public/pokemon`: 5.125 recursos locais (19,01 MB), manifesto e licenças;
- `data/moves.json` e o importador antigo permanecem apenas para regressões históricas; não atendem partidas;
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
npm run dev --prefix client
```
