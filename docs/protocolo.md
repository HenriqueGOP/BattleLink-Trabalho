# Protocolo pokemon-battle/2

Dois transportes ligam o cliente ao mesmo dominio (e um terceiro serve dados):

- **TCP em 127.0.0.1:3001** — cliente CLI (mensagens JSON delimitadas por newline);
- **WebSocket em 127.0.0.1:3002** — navegador React (browsers nao abrem TCP bruto; a ponte fica no processo do servidor);
- **HTTP em 127.0.0.1:3003** — API REST do catalogo, usada pelo front-end (`GET /api/pokemon`).

O servidor nunca aceita dano, HP, turno ou vencedor vindos do cliente. Ele recebe **intenções** e devolve **snapshots oficiais** do estado.

Cada jogador recebe o snapshot **na visão dele** (`Room.getStateFor`): o que o adversário tem de secreto — os golpes equipados, o PP e o moveset do banco — não é enviado. O que uma batalha revela (Pokemon em campo, HP, status, stat stages, Terastal e quantos Pokemon ainda estão de pé) continua visível.

O histórico de preparação registra apenas contagens e confirmações: nomes das espécies e shiny do banco não são publicados. A identidade de quem consulta o snapshot deve pertencer à sala.

## Fases e confirmação

`setup` permite escolher seis Pokémon e configurar de um a quatro golpes por membro. `accept_team` confirma e trava a equipe do jogador; só a confirmação de ambos muda a fase para `battle`. Durante `setup`, `reset_team` pode desfazer uma confirmação e remontar a própria equipe. Em `battle` e `finished`, não é permitido alterar equipe ou golpes.

## Cliente para servidor

| Mensagem | Efeito |
| --- | --- |
| `{"type":"join","name":"Alice","token":"..."}` | Entra na fila. `name` tem até 24 caracteres; `token` é opcional no modo local e obrigatório se o servidor exigir chave. |
| `{"type":"choose_pokemon","pokemon":"garchomp"}` | Adiciona um Pokemon a equipe. |
| `{"type":"set_moves","pokemon":"garchomp","moves":[...]}` | Define de 1 a 4 golpes durante `setup`, antes da confirmação do jogador. |
| `{"type":"accept_team"}` | Confirma e trava a equipe; inicia a batalha quando ambos estão prontos. |
| `{"type":"reset_team"}` | Zera a equipe e a confirmação. Só é aceito em `setup`. |
| `{"type":"terastallize"}` | Ativa o Tera do Pokemon ativo (1x por jogador por partida). |
| `{"type":"switch_pokemon","pokemon":"gengar"}` | Troca o Pokemon ativo. |
| `{"type":"action","action":{"type":"attack","move":"ice-beam"}}` | Ataca com um golpe equipado. |
| `{"type":"leave"}` | Encerra a conexao. |

> As acoes `defend` e `special` foram removidas das regras: o servidor responde com erro orientando a usar golpes equipados. Os ataques consomem apenas os PP do golpe.

## Equipe

- 6 Pokemon por jogador, sem repeticao; qualquer um dos 1025 da PokeAPI;
- HP real derivado da base stat; golpes do dataset publico do Pokemon Showdown (`data/moves.json`), com power/accuracy/PP/categoria/tipo e efeitos;
- 5% de chance de cada Pokemon nascer **shiny**.

## Terastalizacao (Gen 9, simplificada)

- Tipos defensivos viram APENAS o Tera Type;
- STAB do tipo Tera (2.0x se Tera = tipo original, senao 1.5x) e mantem STAB nos tipos originais;
- Golpes do tipo Tera com power < 60 sobem para 60 (exceto multi-hit e prioridade).

## Servidor para cliente

| Mensagem | Conteudo |
| --- | --- |
| `welcome` | `playerId` e versao do protocolo. |
| `waiting` | Posicao na fila. |
| `match_found` | `roomId` + estado inicial (`state`). |
| `state` | Snapshot oficial apos toda escolha/acao valida. |
| `error` | JSON/acao invalida com `code` e `message`. |
| `opponent_left` | Aviso após o snapshot final de vitória por desconexão. |

Cada jogador tem `ready`. O estado final tem `finishReason: "knockout"` ou `"disconnect"`. A desconexão durante preparação ou combate produz `phase: "finished"`, limpa trocas pendentes e define o sobrevivente como vencedor antes de remover a sala. Sair após um resultado já finalizado não muda o vencedor. O sobrevivente pode enviar `join` para entrar novamente na fila.

Os eventos públicos usam IDs monotônicos e identificadores de jogador. Os clientes apenas espelham `victory`/`defeat` pela perspectiva, sem calcular o resultado. Dano, drenagem e contagens de multi-hit refletem somente HP efetivamente removido.

Rest restaura HP e remove o status anterior, depois impõe dois turnos de sono. Cura, status e mudanças de atributos são resolvidos em conjunto; efeitos não representáveis pelo dataset continuam identificados como suporte parcial.

## Mensagens invalidas

`MALFORMED_JSON` para JSON quebrado; `INVALID_MESSAGE` para mensagem fora da ordem, Pokemon inexistente, golpe desconhecido, golpe sem PP, acao fora do turno, `reset_team` apos o inicio da batalha ou acao enquanto o **adversario** ainda deve uma troca forcada.

A mensagem invalida **nao altera o estado**: toda validacao capaz de lancar erro acontece antes de qualquer mutacao (inclusive a de PP, que antes era conferida depois de consumir sono/congelamento/confusao).

`UNAUTHORIZED` rejeita uma chave inválida; `RATE_LIMITED` limita a frequência; `QUEUE_FULL` limita comandos pendentes; `JOIN_TIMEOUT` encerra conexões que não entram na fila no prazo; `PAYLOAD_TOO_LARGE` rejeita frames TCP acima de 64 KiB (WebSocket também limita payloads a 64 KiB). Origens WebSocket ausentes ou não permitidas são rejeitadas no handshake HTTP com 403; excesso de conexões recebe 503.

Há FIFO por conexão e mutex apenas durante a confirmação de mutações. Consultas à PokéAPI ocorrem fora do mutex, têm timeout de 10 segundos, compartilham requisições em voo e persistem dados válidos no cache local. Uma resposta atrasada não pode alterar uma equipe redefinida nem uma sala encerrada.
