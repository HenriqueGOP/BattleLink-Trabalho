# Protocolo pokemon-battle/1

Dois transportes ligam o cliente ao mesmo dominio (e um terceiro serve dados):

- **TCP em 127.0.0.1:3001** — cliente CLI (mensagens JSON delimitadas por newline);
- **WebSocket em 127.0.0.1:3002** — navegador React (browsers nao abrem TCP bruto; a ponte fica no processo do servidor);
- **HTTP em 127.0.0.1:3003** — API REST do catalogo, usada pelo front-end (`GET /api/pokemon`).

O servidor nunca aceita dano, HP, turno ou vencedor vindos do cliente. Ele recebe **intenções** e devolve **snapshots oficiais** do estado.

Cada jogador recebe o snapshot **na visão dele** (`Room.getStateFor`): o que o adversário tem de secreto — os golpes equipados, o PP e o moveset do banco — não é enviado. O que uma batalha revela (Pokemon em campo, HP, status, stat stages, Terastal e quantos Pokemon ainda estão de pé) continua visível.

## Cliente para servidor

| Mensagem | Efeito |
| --- | --- |
| `{"type":"join","name":"Alice"}` | Entra na fila. `name` e limitado a 24 caracteres. |
| `{"type":"choose_pokemon","pokemon":"garchomp"}` | Adiciona um Pokemon a equipe. |
| `{"type":"set_moves","pokemon":"garchomp","moves":[...]}` | Define ate 4 golpes do membro informado. |
| `{"type":"reset_team"}` | Zera a equipe. So e aceito **antes de a batalha comecar** (isto e, antes de as duas equipes ficarem completas). |
| `{"type":"terastallize"}` | Ativa o Tera do Pokemon ativo (1x por jogador por partida). |
| `{"type":"switch_pokemon","pokemon":"gengar"}` | Troca o Pokemon ativo. |
| `{"type":"action","action":{"type":"attack","move":"ice-beam"}}` | Ataca com um golpe equipado. |
| `{"type":"leave"}` | Encerra a conexao. |

> As acoes `defend` e `special` foram removidas das regras: o servidor responde com erro orientando a usar golpes equipados. Os ataques consomem apenas os PP do golpe.

## Equipe

- 6 Pokemon por jogador, sem repeticao; qualquer um dos 1025 da PokeAPI;
- HP real derivado da base stat; golpes do dataset publico do Pokemon Showdown (`data/moves.json`), com power/accuracy/PP/categoria/tipo e efeitos;
- 1/100 de chance de cada Pokemon nascer **shiny**.

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
| `opponent_left` | O oponente desconectou. |

## Mensagens invalidas

`MALFORMED_JSON` para JSON quebrado; `INVALID_MESSAGE` para mensagem fora da ordem, Pokemon inexistente, golpe desconhecido, golpe sem PP, acao fora do turno, `reset_team` apos o inicio da batalha ou acao enquanto o **adversario** ainda deve uma troca forcada.

A mensagem invalida **nao altera o estado**: toda validacao capaz de lancar erro acontece antes de qualquer mutacao (inclusive a de PP, que antes era conferida depois de consumir sono/congelamento/confusao).