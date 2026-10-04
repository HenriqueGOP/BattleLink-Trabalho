# Guia do código — fases 5–7 e Frontend Refresh

O cliente solicita; o servidor decide. Este mapa descreve a implementação ativa em `pokemon-battle/4`, incluindo salas privadas, formatos, revanche e PvE. O histórico de evidências das fases anteriores permanece nos respectivos relatórios. [Novos modos e treinadores](MODOS_E_TREINADORES.md).

## Executar e acompanhar a entrega

Abra dois terminais: execute `npm run dev` dentro de `server/` e dentro de `client/`. Acesse **http://localhost:5173/** em uma janela normal e outra anônima, com nomes diferentes. O modo de desenvolvimento usa o código fonte sem exigir build manual. Passo a passo: [Como jogar](COMO_JOGAR.md). Evidências e limites da interface atual: [Frontend Refresh](FRONTEND_REFRESH.md).

## Arquivos principais

| Área | Arquivos | Responsabilidade |
|---|---|---|
| Inicialização | server/src/index.ts, config.ts | Configuração, portas e encerramento |
| Transporte | server/src/application.ts, security.ts | TCP/WebSocket/HTTP, autenticação, origem, limites, FIFO, preparação |
| Contrato | server/src/contracts/protocol.ts, decode.ts | Tipos compartilhados e validação de mensagens do servidor |
| Entrada | server/src/protocol.ts | Validação de mensagens do cliente |
| Fila | server/src/game/manager.ts | Pareamento, índice e destruição de salas |
| Formatos e treinadores | server/src/contracts/formats.ts, trainers.ts | Descritores públicos, tamanhos e tipos centrais |
| Bot e equipes PvE | server/src/game/bot.ts, trainers.ts | Loadouts compatíveis e decisões legais com dados públicos |
| Artes PvE | client/public/trainers, components/TrainerArt | Retratos, ilustrações, atlas locais e fallback |
| Sala | server/src/game/room.ts, mutex.ts | Equipes, confirmação, preparação, snapshots por perspectiva |
| Motor | server/src/game/engine | Regras, RNG, matemática, adapter, capacidades e eventos |
| Catálogo | server/src/contracts/catalog.ts, server/src/data | Dados locais e sugestões de golpes compatíveis |
| Terminal | server/src/client.ts | Mesmas solicitações e escolhas do navegador via TCP |
| Conexão React | BattleProvider.tsx, services/socketService.ts | Decoder, snapshot, envio idempotente e ressincronização |
| Modelo visual | client/src/lib/battleView.ts, catalog.ts, format.ts | IDs → textos, PP, HP, nomes e rótulos; busca por nome/número sem alterar IDs canônicos |
| Recursos | client/src/lib/assets.ts, preloadBattle.ts, data/animated-registry.json | Whitelist, GIFs/PNG locais, fallback, cancelamento e prazo de preload |
| Eventos visuais | client/src/lib/eventEngine.ts, hooks/useBattleEvents.ts | Mensagens, assinatura do estado apresentado e ciclo de vida |
| Fila | client/src/lib/presentation/BattleEventQueue.ts | Eventos, checkpoints, watermark, lacunas, skip e aba oculta |
| Animação | client/src/lib/presentation/AnimationDirector.ts, moveProfiles.ts, impact.ts | Conclusão real, perfis por golpe, movimento corporal, cancelamento, barras de HP, pool e flashes |
| Atlas | client/src/lib/presentation/SpriteRenderer.ts, pages/BattlePage/SpriteGallery.tsx | Renderer Canvas 2D, relógio compartilhado, clips limitados e inspeção dos efeitos locais |
| Sprites de batalha | client/src/pages/BattlePage/components/BattleSpot, StatusAura | GIF/PNG por orientação e variante disponível, movimento corporal e status sincronizados à apresentação |
| Arenas | client/src/config/battleBackgrounds.ts, pages/BattlePage/components/BattleBackground | Seis WebP locais e SVG de fallback; tema escolhido pelo servidor |
| Movimento | client/src/lib/presentation/motionPreference.ts, hooks/useMotionPreference.ts, components/MotionSettings | Sistema/Completo/Reduzido, persistência e preferência do sistema operacional |
| Laboratório | client/src/pages/BattlePage/PresentationLab.tsx, App.tsx | Cenário, galeria de clips/arenas e prévias responsivas disponíveis em DEV ou profile, excluídos do build normal |
| Medição | client/src/pages/BattlePage/components/BattleProfiler.tsx, vite.config.ts | React Profiler e React DOM profiling somente no modo profile |
| Telas | client/src/pages | Início, catálogo paginado, montagem de equipe/golpes, batalha e resultado na identidade Battle Link |
| Estilos e fontes | client/src/styles/tokens.css, global.css, main.tsx | Tokens compartilhados, CSS Modules, Oxanium e Nunito Sans locais com Latin/Latin Ext |
| Áudio | client/src/lib/audio | Preferências persistidas, cries locais, música/SFX procedurais |

## Como alterar o protocolo

Atualize os tipos compartilhados, parser do servidor, decoder de resposta e todos os clientes no mesmo conjunto de alterações. Cubra payload válido/inválido, privacidade e repetição. Não adicione URLs, callbacks, dados internos do simulador ou escolhas adversárias a snapshots.

## Como alterar regras

Use a fachada do motor. Mecânicas nativas ficam no simulador, a política de exclusões no manifesto/adapter. Golpes simples adicionais podem ser definidos por dados confiáveis no servidor; nunca por payload de rede. A calculadora recebe entradas imutáveis e roll explícito e não toca na partida. Preserve os testes cruzados e os replays determinísticos.

Após atualizar a versão fixada, regenere dados com `node scripts/generate-battle-catalog.cjs` depois do build do servidor. Atualize a versão do catálogo quando houver mudança semântica, revise capacidades e repita a validação. `python scripts/vendor-battle-assets.py` é uma ferramenta de desenvolvimento: usa revisões registradas, valida assinaturas/tamanhos e gera manifesto com hashes. O jogo usa os arquivos já versionados.

## Como alterar apresentação e recursos

Perfis em `moveProfiles.ts` definem famílias artísticas como contato, corte, projétil, feixe, onda, área, pó e status. Eles não decidem dano, acerto ou efeitos de regra. O `AnimationDirector` coordena GSAP/WAAPI e clips Canvas, confirma o evento ao concluir e libera trabalho cancelado. Não crie uma segunda fila nem atualize estado React a cada frame.

O catálogo contém 1.025 espécies; 868 possuem 3.368 GIFs locais, com fallback estático para variantes ausentes. A importação é feita por `scripts/vendor-animated-pokemon.py`; o runtime resolve apenas o registro local. Arenas usam seis WebP e os seis SVG anteriores como fallback. Fontes Oxanium/Nunito Sans são empacotadas por `main.tsx`, incluindo os caracteres usados em português. Registros, manifestos e créditos acompanham os recursos em `client/public`.

`MotionSettings` permite escolher Sistema, Completo ou Reduzido. Sistema segue a preferência do sistema operacional; escolhas explícitas ficam salvas quando o armazenamento está disponível. A preferência afeta GIFs, movimento corporal e efeitos, mantendo os resultados oficiais. Aba oculta, skip e desmontagem continuam sujeitos ao cancelamento da fila.

Abra `/visual-check` durante `npm run dev` para inspecionar a cena e as galerias. Para registrar commits React, use o build `--mode profile`; `BattleProfiler` não instrumenta o modo DEV comum. O build normal exclui laboratório, fixture e galeria.

## Estado e privacidade

A equipe selecionada é privada. O motor publica apenas o que foi revelado por eventos, reservando PP, atributos e solicitação para o dono. Room exige seis membros; BattleSession aceita equipes menores para fixtures e consultas isoladas. Pedidos de troca e revival usam IDs estáveis, inclusive quando o Pokémon tem HP zero.

Eventos públicos possuem sequência e rodada. O cliente ignora duplicatas e snapshots antigos; uma lacuna além da janela exige usar o snapshot integral. Não derive regras lendo texto humano do log.

## Testes

`npm test` preserva o runner anterior e acrescenta typecheck dos testes e validação dos recursos. Há grupos de domínio, eventos, regressões da auditoria, protocolo, segurança, ciclo do socket, integração HTTP/TCP/WebSocket, arquivos locais, apresentação e motor. A suíte não depende de internet. `presentation.test.ts` usa o motor real para os snapshots e um DOM controlado para verificar conclusão, cancelamento, transforms e reutilização do pool.

Os arquivos `pokeapi.ts`, `json-cache.ts`, `showdown-moves.ts`, fixtures e `data/moves.json` permanecem para cobertura histórica do importador/cache. Não são importados pelo caminho ativo de partidas. As justificativas para migração de fixtures antigas estão no relatório da fase 3.

## Limites atuais

A apresentação confirma HP/nocaute nos limites dos eventos e o ativo no ponto de substituição da troca. Os efeitos finitos têm um único dono. Menus, diálogos, seis arenas e clips de combate foram entregues nas fases 5–7; Battle Link amplia essas entregas. A validação corrente fica em [Frontend Refresh](FRONTEND_REFRESH.md). FPS e memória em aparelho real continuam **[VERIFICAR]**.

Resultados anteriores do Profiler e capturas devem ser interpretados no contexto das versões observadas; não certificam o desempenho da reformulação. Evidências históricas e reprodução: [fase 4](FASE_4_APRESENTACAO.md), [menus](FASE_5_MENUS.md), [arenas](FASE_6_ARENAS.md), [animações](FASE_7_ANIMACOES.md) e [validação conjunta](FASES_5_6_7_VALIDACAO.md).
