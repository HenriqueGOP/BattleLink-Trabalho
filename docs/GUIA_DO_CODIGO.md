# Guia do código — fase 3

O cliente solicita; o servidor decide. Este mapa descreve a implementação ativa em `pokemon-battle/3`.

## Arquivos principais

| Área | Arquivos | Responsabilidade |
|---|---|---|
| Inicialização | server/src/index.ts, config.ts | Configuração, portas e encerramento |
| Transporte | server/src/application.ts, security.ts | TCP/WebSocket/HTTP, autenticação, origem, limites, FIFO, preparação |
| Contrato | server/src/contracts/protocol.ts, decode.ts | Tipos compartilhados e validação de mensagens do servidor |
| Entrada | server/src/protocol.ts | Validação de mensagens do cliente |
| Fila | server/src/game/manager.ts | Pareamento, índice e destruição de salas |
| Sala | server/src/game/room.ts, mutex.ts | Equipes, confirmação, preparação, snapshots por perspectiva |
| Motor | server/src/game/engine | Regras, RNG, matemática, adapter, capacidades e eventos |
| Catálogo | server/src/contracts/catalog.ts, server/src/data | Dados locais e sugestões de golpes compatíveis |
| Terminal | server/src/client.ts | Mesmas solicitações e escolhas do navegador via TCP |
| Conexão React | BattleProvider.tsx, services/socketService.ts | Decoder, snapshot, envio idempotente e ressincronização |
| Modelo visual | client/src/lib/battleView.ts, catalog.ts | IDs → textos, PP, HP e recursos locais |
| Recursos | client/src/lib/assets.ts, preloadBattle.ts | Whitelist, fallback, cancelamento e prazo de preload |
| Eventos visuais | client/src/lib/eventEngine.ts, hooks/useBattleEvents.ts | Adaptação temporária para a fila visual existente |
| Telas | client/src/pages | Lobby, seleção, golpes e batalha |
| Áudio | client/src/lib/audio | Preferências persistidas, cries locais, música/SFX procedurais |

## Como alterar o protocolo

Atualize os tipos compartilhados, parser do servidor, decoder de resposta e todos os clientes no mesmo conjunto de alterações. Cubra payload válido/inválido, privacidade e repetição. Não adicione URLs, callbacks, dados internos do simulador ou escolhas adversárias a snapshots.

## Como alterar regras

Use a fachada do motor. Mecânicas nativas ficam no simulador, a política de exclusões no manifesto/adapter. Golpes simples adicionais podem ser definidos por dados confiáveis no servidor; nunca por payload de rede. A calculadora recebe entradas imutáveis e roll explícito e não toca na partida. Preserve os testes cruzados e os replays determinísticos.

Após atualizar a versão fixada, regenere dados com `node scripts/generate-battle-catalog.cjs` depois do build do servidor. Atualize a versão do catálogo quando houver mudança semântica, revise capacidades e repita a validação. `python scripts/vendor-battle-assets.py` é uma ferramenta de desenvolvimento: usa revisões registradas, valida assinaturas/tamanhos e gera manifesto com hashes. O jogo usa os arquivos já versionados.

## Estado e privacidade

A equipe selecionada é privada. O motor publica apenas o que foi revelado por eventos, reservando PP, atributos e solicitação para o dono. Room exige seis membros; BattleSession aceita equipes menores para fixtures e consultas isoladas. Pedidos de troca e revival usam IDs estáveis, inclusive quando o Pokémon tem HP zero.

Eventos públicos possuem sequência e rodada. O cliente ignora duplicatas e snapshots antigos; uma lacuna além da janela exige usar o snapshot integral. Não derive regras lendo texto humano do log.

## Testes

`npm test` preserva o runner anterior e acrescenta typecheck dos testes e validação dos recursos. Há grupos de domínio, eventos, regressões da auditoria, protocolo, segurança, ciclo do socket, integração HTTP/TCP/WebSocket, arquivos locais e motor. A suíte não depende de internet.

Os arquivos `pokeapi.ts`, `json-cache.ts`, `showdown-moves.ts`, fixtures e `data/moves.json` permanecem para cobertura histórica do importador/cache. Não são importados pelo caminho ativo de partidas. As justificativas para migração de fixtures antigas estão no relatório da fase 3.

## Limites atuais

A apresentação ainda confirma HP/ativo assim que chega o snapshot e usa durações estimadas na fila antiga. A fase 4 substituirá isso por AnimationDirector e commits visuais ao fim dos eventos. Menus, acessibilidade completa e novas arenas são fases seguintes; não confundir contrato preparado com acabamento visual concluído.
