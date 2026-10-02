# Protocolo pokemon-battle/3

A definição compartilhada está em `server/src/contracts/protocol.ts`; `parseClientMessage` valida entradas e `decodeServerMessage` valida respostas nos dois clientes. IDs canônicos são minúsculos e sem separadores: `pikachu`, `icebeam`. Servidor e clientes devem ser atualizados juntos; não há compatibilidade com v2.

## Transportes e confiança

- TCP local, porta 3001: JSON delimitado por newline, UTF-8 incremental.
- WebSocket, porta 3002: JSON textual; origem exata e limites compartilhados com TCP.
- HTTP, porta 3003: `GET /api/pokemon` devolve versão e lista local `{id,num,name}`. O React usa o catálogo empacotado, sem chamada REST.
- O cliente envia intenções. HP, dano, RNG, lado, resultados e legalidade pertencem ao servidor. Nenhuma mensagem contém URLs de recursos, seed ou objetos mutáveis do simulador.

## Ciclo de sala

`setup → preparing → battle → finished`. Desconexão também pode encerrar `setup` ou `preparing`.

Em setup cada jogador seleciona seis espécies distintas e de um a quatro golpes compatíveis por membro. `accept_team` trava a própria equipe. `reset_team` pode desfazer a confirmação apenas durante setup. As duas confirmações criam o motor e a preparação. O navegador carrega recursos locais por até três segundos, com até seis tarefas concorrentes; erros usam fallback. O terminal confirma imediatamente. Ambos devem enviar `battle_ready` com o identificador recebido.

Após oito segundos (configurável em `PREPARATION_TIMEOUT_MS`), uma preparação incompleta termina: quem confirmou vence; se nenhum confirmou, não há vencedor. Sair cancela o timer. A confirmação repetida da mesma preparação é inofensiva depois do início.

## Cliente → servidor

| Tipo | Campos além de type | Regra |
|---|---|---|
| join | name, protocol, catalogVersion, token opcional | Nome de 1–24 caracteres; versão exata; chave exigida conforme configuração. |
| choose_pokemon | pokemon | ID de espécie conhecida, com golpes compatíveis, sem duplicar a equipe. |
| random_team | count | Inteiro de 1–6, limitado aos espaços livres; RNG exclusivo de equipe, no servidor. |
| set_moves | pokemon, moves | De 1–4 IDs distintos, aprendíveis e compatíveis; apenas equipe própria não confirmada. |
| reset_team | — | Limpa equipe e confirmação durante setup. |
| accept_team | — | Exige seis membros válidos. |
| battle_ready | preparationId | Confirma preparo da solicitação atual. |
| action | requestId, actionId, choice | Escolha privada da solicitação atual. |
| resync | — | Snapshot completo na perspectiva do remetente. |
| leave | — | Encerra conexão e, se necessário, a partida. |

`choice` é `{type:"move",moveId}` ou `{type:"switch",combatantId}`. `requestId` é inteiro positivo e `actionId` tem até 64 caracteres alfanuméricos, hífen ou sublinhado. IDs de combatentes são estáveis por lado/slot: `p1s0` a `p2s5`. O lado do comando é derivado da conexão; não é recebido do jogador.

## Solicitações e idempotência

A solicitação privada contém `id`, `kind` (move/switch/revive), `moves` com PP/disponibilidade, `switches`, `submitted` e `lockedMoveId`. O cliente só oferece escolhas da solicitação. Cargas, recarga, Struggle, revival e trocas forçadas usam esse mesmo contrato.

O primeiro envio aceito recebe ACK e snapshot somente para seu autor; o oponente não recebe aviso de escolha pendente. O motor resolve quando reúne todas as escolhas necessárias. O turno é ordenado pelas regras Gen 9, e efeitos residuais ocorrem no fim da rodada.

O servidor retém 256 recibos por sessão. Repetir a mesma chave e conteúdo devolve o recibo sem gastar PP nem executar novamente. Reutilizar a chave com conteúdo diferente falha. Solicitações antigas falham mesmo após expirar o recibo. O React tenta até três envios da mesma ação, com intervalo de 1,5 segundo; após o limite solicita ressincronização. ACK sem snapshot não reabre os controles. O terminal oferece `retry` com a mesma chave.

## Servidor → cliente

| Tipo | Conteúdo |
|---|---|
| welcome | playerId, protocol, catalogVersion |
| waiting | message |
| match_found | roomId, state |
| state | state |
| action_ack | requestId, actionId, duplicate, resolved |
| error | code, message, actionId quando o comando validado era uma ação |
| opponent_left | message, após o resultado por desconexão |

`RoomSnapshot` inclui sala/fase, viewer, metadados dos jogadores, equipe própria, arena, BattleView, eventos, sequência, eventFloor, shinies revelados, preparação privada, resultado e até 40 linhas de preparação sem nomes de espécies adversárias.

`BattleView` revela equipe própria completa, ativos, condições públicas, resultado e solicitação própria. Reservas inimigas não reveladas são apenas `{id,hidden:true}`. Depois de entrar em campo, espécie/HP/status/tipos/estágios ficam públicos; golpes equipados, PP, atributos, habilidade e escolhas continuam privados.

## Eventos e ressincronização

`BattleEvent` é união discriminada com `sequence`, `round` e `audience`. Tipos: battle_start, round_start, move, damage, heal, critical, super_effective, resisted, immune, faint, miss, hit_count, switch, status, boost, unable, effect, state_sync e battle_end.

Dano/cura informam HP anterior/final, máximo, quantidade, fonte e causa. Multi-hit produz uma transição por hit, com críticos separados. Troca inclui o Pokémon público de destino. Eventos usam lados/slots estáveis, sem IDs de conexão, horários, seed ou log bruto do simulador.

Snapshots incluem a janela das últimas 240 sequências globais. Eventos privados podem produzir lacunas naturais entre números visíveis; não se exige sequência contígua. O cliente usa `sequence` como watermark e `eventFloor` para detectar perda da janela: aplica o snapshot sem repetir animações antigas. Respostas de outra sala ou com watermark inferior são ignoradas. Falha interna encerra a partida preservando o último watermark publicado.

Resultados: knockout, draw, disconnect, preparation_timeout ou engine_error. O evento nativo de desistência usa forfeit; a sala informa disconnect. Um resultado já concluído não é alterado pela saída posterior. O sobrevivente pode voltar à fila na mesma conexão quando a sala é removida.

## Validação e limites preservados

Payloads até 64 KiB, fila FIFO limitada por conexão, mutex por sala, limites de conexões/IP/frequência, timeout de entrada, backpressure e heartbeat. Códigos: MALFORMED_JSON, INVALID_MESSAGE, NOT_IN_MATCH, INVALID_ACTION, STALE_REQUEST, ALREADY_SUBMITTED, FINISHED, ENGINE_CONTRACT, CATALOG_MISMATCH, UNAUTHORIZED, RATE_LIMITED, QUEUE_FULL, JOIN_TIMEOUT e PAYLOAD_TOO_LARGE. Handshake de origem inválida recebe 403; capacidade esgotada recebe 503.

Escolha, preparação e combate não fazem I/O externo dentro do mutex. Rejeições de regra não mudam HP, PP, status ou solicitações; falhas internas invalidam o motor e produzem término explícito. TCP permanece em loopback; exposição de WebSocket requer chave e proxy TLS, conforme `security.ts`.
