# Protocolo pokemon-battle/4

A definição compartilhada está em `server/src/contracts/protocol.ts`; `parseClientMessage` valida entradas e `decodeServerMessage` valida respostas nos dois clientes. IDs canônicos são minúsculos e sem separadores: `pikachu`, `icebeam`. Servidor e clientes devem ser atualizados juntos; não há compatibilidade de rede com v2/v3. Tipos opcionais de `matchId` existem apenas para fixtures internas; no transporte o campo é obrigatório.

## Transportes e confiança

- TCP local, porta 3001: JSON delimitado por newline, UTF-8 incremental.
- WebSocket, porta 3002: JSON textual; origem exata e limites compartilhados com TCP.
- HTTP, porta 3003: `GET /api/pokemon` devolve versão e lista local `{id,num,name}`. O React usa o catálogo empacotado, sem chamada REST.
- `GET /api/game` publica descritores de formatos e treinadores. O React importa o mesmo contrato compartilhado. Equipes internas do bot e seeds não são publicadas por essa API.
- O cliente envia intenções. HP, dano, RNG, lado, resultados e legalidade pertencem ao servidor. Nenhuma mensagem contém URLs de recursos, seed ou objetos mutáveis do simulador.

## Ciclo de sala

`join → lobby → fila/convite/PvE → setup → preparing → battle → finished`. `join` autentica e registra nome sem entrar na fila. Desconexão também pode encerrar `setup` ou `preparing`.

Em setup cada jogador seleciona três ou seis espécies distintas e de um a quatro golpes compatíveis por membro. O formato define o tamanho; Monotipo exige o tipo central em todas as espécies. `accept_team` trava a própria equipe, inclusive contra remoção, reordenação e reset. As duas confirmações criam o motor e a preparação. No PvE o bot já está confirmado. O navegador carrega recursos locais por até três segundos, com até seis tarefas concorrentes; erros usam fallback. O terminal confirma imediatamente. Ambos devem enviar `battle_ready` com o identificador recebido e `matchId` atual.

Após oito segundos (configurável em `PREPARATION_TIMEOUT_MS`), uma preparação incompleta termina: quem confirmou vence; se nenhum confirmou, não há vencedor. Sair cancela o timer. A confirmação repetida da mesma preparação é inofensiva depois do início.

## Cliente → servidor

| Tipo | Campos além de type | Regra |
|---|---|---|
| join | name, protocol, catalogVersion, token opcional | Nome de 1–24 caracteres; versão exata; chave exigida conforme configuração. |
| queue_join | format, commandId | Entra na fila isolada pelo formato e tipo. |
| queue_cancel | — | Cancela a busca mantendo a conexão. |
| private_create | format, commandId | Cria convite de oito caracteres e registra o criador. |
| private_join | code, commandId | Entra na vaga única; formato é definido pelo criador. |
| room_leave | — | Sai da sala e volta ao lobby sem fechar a conexão. |
| pve_start | trainerId, difficulty, format, commandId | IDs conhecidos; dificuldade easy/normal/hard; Monotipo usa o tipo central do treinador. |
| rematch | matchId, accept, keepTeam | Voto individual em até 30 segundos; recusa encerra a oferta. |
| choose_pokemon | pokemon | ID de espécie conhecida, com golpes compatíveis, sem duplicar a equipe. |
| remove_pokemon | pokemon | Remove uma espécie da equipe própria não confirmada. |
| reorder_team | pokemon | Array de IDs: permutação completa dos integrantes atuais, sem duplicatas; equipe própria não confirmada. |
| random_team | count | Inteiro de 1–6, limitado aos espaços livres; RNG exclusivo de equipe, no servidor. |
| set_moves | pokemon, moves | De 1–4 IDs distintos, aprendíveis e compatíveis; apenas equipe própria não confirmada. |
| reset_team | — | Limpa a equipe não confirmada durante setup. |
| accept_team | — | Exige o número de membros válidos do formato. |
| battle_ready | preparationId | Confirma preparo da solicitação atual. |
| action | requestId, actionId, choice | Escolha privada da solicitação atual. |
| resync | — | Snapshot completo na perspectiva do remetente. |
| leave | — | Encerra conexão e, se necessário, a partida. |

**Todos os comandos de montagem, action, battle_ready e resync exigem `matchId`.** Uma revanche mantém `roomId` e cria outro `matchId`; mensagens de uma partida antiga são rejeitadas antes de editar estado ou consumir PP. Os IDs de solicitação são locais à instância nova do motor.

`format` é `{id:"classic"}`, `{id:"quick"}` ou `{id:"monotype",type:"water"}` (qualquer um dos 18 tipos permitidos). O pareamento automático usa formato e tipo. No PvE Monotipo, o tipo precisa corresponder ao treinador. Códigos usam `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, com oito posições independentes; espaços/hífens e letras minúsculas são normalizados no parser. Criação tem limite de três e adesão de dez tentativas por minuto, por conexão e IP. Convites/montagens/resultados inativos expiram após 15 minutos; combate e preparação ativa não expiram por esse mecanismo.

`choice` é `{type:"move",moveId}` ou `{type:"switch",combatantId}`. `requestId` é inteiro positivo e `actionId` tem até 64 caracteres alfanuméricos, hífen ou sublinhado. IDs de combatentes são estáveis por lado/slot: `p1s0` a `p2s5`. O lado do comando é derivado da conexão; não é recebido do jogador.

Os comandos de montagem aceitam `editId` opcional, com até 64 caracteres alfanuméricos, hífen ou sublinhado. A resposta `state` ou `error` devolve esse ID apenas ao remetente. Payload inválido também recebe correlação quando seu `editId` é seguro e o tipo é um comando de montagem conhecido; IDs inválidos não são refletidos. O React envia uma edição por vez, aplica previsão imutável, reconcilia a confirmação e solicita resync após rejeição ou timeout de cinco segundos. `editId` é uma correlação, sem semântica de retry/idempotência de ações de combate.

Reordenar preserva golpes e shiny associados à espécie; o servidor reatribui os IDs posicionais depois da edição e antes de criar o motor. Esses IDs permanecem estáveis durante o combate. A primeira posição determina o integrante inicial. O adversário recebe somente contagens e log genérico durante a montagem, sem espécies, posições ou correlações privadas.

## Solicitações e idempotência

Admissão usa `commandId` seguro de até 64 caracteres, devolvido nas respostas `lobby`, `waiting`, `match_found` ou `error`. O servidor mantém 64 recibos por conexão: repetir conteúdo e ID informa a admissão atual sem criar outra sala ou afetar o adversário. Mesmo ID com outro conteúdo falha. Uma admissão já encerrada exige novo ID. Recibos de ações de combate pertencem ao motor, separadamente.

A solicitação privada contém `id`, `kind` (move/switch/revive), `moves` com PP/disponibilidade, `switches`, `submitted` e `lockedMoveId`. O cliente só oferece escolhas da solicitação. Cargas, recarga, Struggle, revival e trocas forçadas usam esse mesmo contrato.

O primeiro envio aceito recebe ACK e snapshot somente para seu autor; o oponente não recebe aviso de escolha pendente. O motor resolve quando reúne todas as escolhas necessárias. O turno é ordenado pelas regras Gen 9, e efeitos residuais ocorrem no fim da rodada.

O servidor retém 256 recibos por sessão. Repetir a mesma chave e conteúdo devolve o recibo sem gastar PP nem executar novamente. Reutilizar a chave com conteúdo diferente falha. Solicitações antigas falham mesmo após expirar o recibo. O React tenta até três envios da mesma ação, com intervalo de 1,5 segundo; após o limite solicita ressincronização. ACK sem snapshot não reabre os controles. O terminal oferece `retry` com a mesma chave.

## Servidor → cliente

| Tipo | Conteúdo |
|---|---|
| welcome | playerId, protocol, catalogVersion |
| lobby | lobby privado ou null, message, commandId opcional |
| waiting | message, commandId opcional |
| match_found | roomId, state, commandId opcional |
| state | state, editId opcional para confirmar uma edição própria |
| action_ack | matchId, requestId, actionId, duplicate, resolved |
| error | code, message, actionId quando o comando validado era uma ação; editId seguro quando rejeita uma edição; commandId em admissões validadas |
| opponent_left | message, após o resultado por desconexão |

`RoomSnapshot` inclui roomId/matchId, formato, modo automatic/private/pve, inviteCode/trainerId/difficulty (ou null), rematch `{expiresAt,votes,available}`, fase, viewer, metadados dos jogadores, equipe própria, arena, BattleView, eventos, sequência, eventFloor, shinies revelados, preparação privada, resultado e até 40 linhas de preparação sem nomes de espécies adversárias. `PrivateLobbySnapshot` contém roomId, code, hostId, formato e participantes, sem equipes.

`BattleView` revela equipe própria completa, ativos, condições públicas, resultado e solicitação própria. Reservas inimigas não reveladas são apenas `{id,hidden:true}`. Depois de entrar em campo, espécie/HP/status/tipos/estágios ficam públicos; golpes equipados, PP, atributos, habilidade e escolhas continuam privados.

## Eventos e ressincronização

`BattleEvent` é união discriminada com `sequence`, `round` e `audience`. Tipos: battle_start, round_start, move, damage, heal, critical, super_effective, resisted, immune, faint, miss, hit_count, switch, status, boost, unable, effect, state_sync e battle_end.

Dano/cura informam HP anterior/final, máximo, quantidade, fonte e causa. Multi-hit produz uma transição por hit, com críticos separados. Troca inclui o Pokémon público de destino. Eventos usam lados/slots estáveis, sem IDs de conexão, horários, seed ou log bruto do simulador.

Snapshots incluem a janela das últimas 240 sequências globais. Eventos privados podem produzir lacunas naturais entre números visíveis; não se exige sequência contígua. O cliente usa `sequence` como watermark e `eventFloor` para detectar perda da janela: aplica o snapshot sem repetir animações antigas. Respostas de outra sala/partida ou com watermark inferior são ignoradas. Um `match_found` novo reinicia fila visual e totais mesmo com o mesmo roomId. Falha interna encerra a partida preservando o último watermark publicado.

Resultados: knockout, draw, disconnect, preparation_timeout ou engine_error. O evento nativo de desistência usa forfeit; a sala informa disconnect. Um resultado já concluído não é alterado pela saída posterior. O sobrevivente pode voltar à fila na mesma conexão quando a sala é removida.

Após knockout/draw, a sala abre uma revanche por 30 segundos. Dois votos aceitos criam outra Room/motor no mesmo roomId; no PvE o voto do servidor é automático. `keepTeam` preserva a seleção própria, ordem, golpes e shiny e a confirma; quem escolhe editar retorna à montagem. Toda condição de combate, solicitação, sequência e RNG é nova. Os eventos de introdução do motor novo podem estar presentes em preparing; nenhum evento antigo é reaproveitado. Uma recusa/expiração encerra a oferta. Saída do convidado libera o código; saída do criador encerra a sala privada. Reentrada começa outra preparação, sem recuperação do combate anterior.

## Validação e limites preservados

Payloads até 64 KiB, fila FIFO limitada por conexão, mutex por sala, limites de conexões/IP/frequência, timeout de entrada, backpressure e heartbeat. Códigos: MALFORMED_JSON, INVALID_MESSAGE, NOT_IN_MATCH, INVALID_ACTION, STALE_REQUEST, ALREADY_SUBMITTED, FINISHED, ENGINE_CONTRACT, CATALOG_MISMATCH, UNAUTHORIZED, RATE_LIMITED, QUEUE_FULL, JOIN_TIMEOUT e PAYLOAD_TOO_LARGE. Handshake de origem inválida recebe 403; capacidade esgotada recebe 503.

Escolha, preparação e combate não fazem I/O externo dentro do mutex. Rejeições de regra não mudam HP, PP, status ou solicitações; falhas internas invalidam o motor e produzem término explícito. TCP permanece em loopback; exposição de WebSocket requer chave e proxy TLS, conforme `security.ts`.

## Recursos visuais no cliente

`trainerId` e os descritores compartilhados são resolvidos pela whitelist local
para arte/retrato/splash/atlas; o servidor não envia caminhos arbitrários. Os seis
estados de treinador e as imagens dos 12 menus pertencem à apresentação. O evento
`battle_start` coordena a saída do treinador antes da entrada dos Pokémon, sem
alterar solicitações, ordem de ações, RNG ou qualquer regra do protocolo v4.
