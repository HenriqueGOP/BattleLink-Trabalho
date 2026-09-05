# Protocolo pokemon-battle/1

O transporte e TCP em `127.0.0.1:3001`. Cada mensagem e um objeto JSON completo terminado por `\n`. O servidor nunca aceita dano, HP, turno ou vencedor vindos do cliente.

## Cliente para servidor

`{"type":"join","name":"Alice"}` entra na fila. `name` e obrigatorio na pratica e limitado a 24 caracteres pelo servidor.

`{"type":"choose_pokemon","pokemon":"charizard"}` escolhe um dado local. Opcoes: `charizard` (100 HP), `blastoise` (110 HP) e `venusaur` (105 HP). Cada jogador escolhe uma vez.

`{"type":"action","action":{"type":"attack","move":"flamethrower"}}` solicita um ataque. O campo `move` e descritivo; o servidor calcula 15 de dano. As acoes `defend` (+5 HP, custo 1) e `special` (40 de dano, custo 3) tambem sao aceitas. Energia inicia em 3, e o servidor controla custos e regeneracao.

`{"type":"leave"}` encerra a conexao.

## Servidor para cliente

- `welcome`: informa `playerId` e a versao do protocolo.
- `waiting`: confirma a fila e sua posicao.
- `match_found`: informa `roomId` e o estado inicial.
- `state`: snapshot oficial apos toda escolha ou acao valida.
- `error`: rejeita JSON/acao invalida com `code` e `message`.
- `opponent_left`: informa que o outro processo desconectou.

O `GameState` inclui `phase` (`battle` ou `finished`), dois jogadores, `pokemon`, `hp`, `maxHp`, `energy`, `turn` (`0` ou `1`), `log` e `winner`. `turn` e o indice do jogador que pode agir. Depois de uma acao valida, o servidor calcula o resultado, troca `turn` e envia o mesmo snapshot aos dois clientes.

## Mensagens invalidas

JSON malformado gera `MALFORMED_JSON`. Mensagem fora da ordem, Pokemon desconhecido, acao fora do turno, energia insuficiente ou acao desconhecida gera `INVALID_MESSAGE` com explicacao. A mensagem invalida nao altera o estado.
