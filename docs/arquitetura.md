# Arquitetura e demonstracao

```mermaid
flowchart LR
  C1[Cliente CLI 1] -- TCP JSON\nnewline --> S[Servidor node:net]
  C2[Cliente CLI 2] -- TCP JSON\nnewline --> S
  S --> Q[Fila e RoomManager]
  Q --> R[Room: estado oficial]
  R --> M[AsyncMutex: regiao critica]
  M --> R
  R -- snapshots state --> C1
  R -- snapshots state --> C2
```

O recurso compartilhado e `Room.state`: jogadores, Pokemon, HP, energia, turno, log e vencedor. A regiao critica comeca quando `room.mutex.acquire()` resolve e termina no `finally` com `unlock()`. Escolha de Pokemon e acao de batalha so modificam o estado dentro desse intervalo.

O Node executa handlers no event loop, mas isso nao substitui a demonstracao: o `AsyncMutex` serializa explicitamente mensagens concorrentes que chegam para a mesma sala. Se dois ataques chegarem juntos, o primeiro lock adquirido valida seu turno e altera o estado; o segundo espera, depois recebe erro de turno ou processa o novo estado, sem intercalar mutacoes.

## Roteiro de apresentacao

1. Terminal 1: `npm start`. Mostre as conexoes TCP e as linhas `[mutex]`.
2. Terminais 2 e 3: `npm run client -- Alice` e `npm run client -- Bob`.
3. Mostre `waiting`, `match_found`, os dois jogadores e o estado central.
4. Em ambos, escolha um Pokemon. O servidor transmite o mesmo snapshot.
5. Tente atacar no cliente que nao tem o turno para mostrar a rejeicao.
6. Ataque no turno correto e mostre HP, log e troca de `turn` nos dois terminais.
7. Digite `invalid` para mostrar a resposta de protocolo invalido.
8. Repita ataques ate `phase: finished` e `winner`, ou feche um cliente para mostrar `opponent_left`.
