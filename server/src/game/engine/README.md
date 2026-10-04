# Motor de batalha: fases 2A e 2B

Importe a API pública de `index.ts`. Apenas os adapters conhecem os objetos mutáveis
de `@pkmn/sim`. `Room` usa este módulo como autoridade para PvP e PvE; o bot envia
as mesmas escolhas legais dos jogadores. O protocolo atual é `pokemon-battle/4`.

## API disponível

| API | Contrato |
|---|---|
| `calculateStats(speciesId, build?)` | Espécie base da Gen 1–9; nível 50, IVs 31, EVs 0 e Hardy como defaults. Aceita nível 1–100, IVs 0–31, EVs 0–252 e soma até 510. Retorna cópia congelada dos atributos oficiais; Shedinja mantém HP 1. |
| `effectiveness(type, defenderTypes)` | Tipos locais em minúsculas; um ou dois tipos defensivos distintos. Imunidade é zero. |
| `calculateDamage(request)` | Consulta de um hit, com atributos finais antes dos estágios, tipo/categoria/poder já resolvidos, crítico explícito opcional (default falso) e roll inteiro obrigatório de 85 a 100. Retorna dano teórico, não limitado pelo HP atual. |
| `calculateDamageRange(context)` | Mesma consulta para os 16 rolls, em ordem crescente. Usa uma simulação descartável por consulta, sem mutar entradas ou consumir RNG de sala. |
| `stageMultiplier` / `accuracyMultiplier` | Multiplicadores base 2/base 3, com estágio inteiro validado em −6…+6. |
| `createRng(seed)` / `restoreRng(snapshot)` | PRNG Gen 5 do Showdown, com quatro palavras de 16 bits obrigatórias; snapshots congelados e serializáveis. Nenhuma seed implícita. |
| `createBattleRngs(seed)` | Fluxos independentes combat/teams/presentation, derivados com SHA-256 e separação de domínio versionada. Não consome outro fluxo e não gera entropia. |
| `randomInt` / `randomChance` | Sorteios pelo RNG injetado, intervalo superior exclusivo e razão inteira validada. |
| `getMove(id)` / `listMoves()` | Catálogo imutável e manifesto de capacidades: dados declarativos, nomes dos hooks preservados e motivos das exclusões. |
| `new BattleSession(setup, options?)` | Partida isolada, sem rede; duas equipes e seed explícita. Aceita RNG injetado e extensões declarativas confiáveis no servidor. |
| `session.getView(side)` | Snapshot imutável daquela perspectiva, com solicitação de ação. Reservas adversárias ainda não reveladas permanecem ocultas. |
| `session.submit(command)` | Escolha privada por requestId/actionId; resolve quando todos os jogadores necessários responderem. Retorna confirmação de resolução/duplicata e sequência. |
| `session.getEvents(side, afterSequence?)` | Eventos discriminados, imutáveis e ordenados; filtra eventos privados por destinatário. |
| `session.forfeit(side)` / `session.destroy()` | Desistência explícita; liberação idempotente dos recursos da partida. |
| `replayBattle(setup, actions, options?)` | Execução isolada e determinística das escolhas, retornando snapshots e eventos das duas perspectivas. Uso interno; nunca enviar ambas ao mesmo jogador. |

## Cálculo isolado e execução de partidas

Consultas matemáticas não executam golpes: não verificam precisão, PP, Protect,
charge, secundários ou status residuais, nem calculam chance de crítico. A BattleSession
executa essas regras, preservando os callbacks nativos. Dano de golpes com callbacks,
poder variável ou regras especiais é resolvido pelo próprio simulador na batalha;
não deve ser aproximado chamando esta consulta de poder fixo com dados incompletos.

O cálculo aceita Adaptability como modificador matemático; a verificação de que a
espécie pode possuir essa habilidade é feita na montagem da BattleSession.
Outras habilidades, itens, clima, terreno e formas não são aceitos na API de consulta.

A BattleSession aplica o dano efetivo e verifica limites de HP, PP e estágios após
cada resolução. Nunca exponha objetos internos, seed, snapshot de RNG ou logs brutos
do Showdown no socket. O timestamp interno não participa dos resultados públicos.

O formato local preserva truncamentos de 16/32 bits; não trocar pelo formato upstream
Custom Game, que desativa esses limites. As classes upstream não são reexportadas.

## Escolhas e privacidade

A orquestração deve atribuir p1/p2 pela conexão autenticada. O motor não conhece
conexões: receber um side válido não autentica o chamador. O protocolo v3 é da fase 3.

requestId identifica cada solicitação, inclusive trocas no meio da mesma rodada.
Cada side envia uma ação; a ordem de chegada não decide a iniciativa. Uma duplicata
idêntica é reconhecida sem consumo de PP/RNG; o mesmo actionId com conteúdo diferente
é rejeitado. Até 256 recibos são retidos. Duplicatas anteriores à janela são rejeitadas
como atrasadas, nunca reexecutadas. Uma escolha confirmada não pode ser trocada.

Solicitações distinguem move, switch e revive. lockedMoveId identifica continuações
como carga/recharge, que podem ser executadas com zero PP. Struggle também não exige
PP. Os demais golpes exigem PP e disponibilidade. IDs são canônicos do catálogo;
índices nativos podem mudar durante trocas, portanto os comandos usam IDs estáveis.

Snapshots do adversário não contêm golpes, PP, atributos, habilidade ou solicitações.
Somente Pokémon já revelados têm dados públicos. Escolhas pendentes não alteram a
perspectiva adversária nem geram eventos. Eventos privados podem deixar lacunas na
sequência visível: a camada de transporte deve usar o watermark do snapshot, e não
interpretar toda lacuna como perda de mensagem. Nunca transmitir o log bruto nativo.

HP anterior/final é capturado por hit; as cópias percentuais do protocolo Showdown não
duplicam impactos. state_sync encerra cada resolução com efeitos/campo atualizados;
a apresentação deve consumi-lo após os eventos anteriores. battle_end é emitido após
os danos/nocautes. Efeitos residuais não herdam o autor da última ação.

## Catálogo e extensões

O manifesto contém 954 entradas: 792 compatíveis e 162 bloqueadas com motivos. Uma
entrada compatível não garante aprendibilidade por qualquer espécie: a montagem
também valida o learnset nacional da Gen 9, incluindo golpes legados. Struggle só é
oferecido pelo motor quando necessário. Sem itens ou outras habilidades, golpes como
Thief/Weather Ball mantêm o comportamento nativo nesse contexto; golpes que exigem
os sistemas excluídos ficam bloqueados (incluindo Hyperspace Fury, que exige uma forma
excluída). Tera Blast funciona como golpe normal sem Terastalização.

As funções dos golpes e suas condições permanecem no Dex interno. SimpleMoveDefinition
permite adicionar golpes simples por dados, em um registro isolado e sem modificar o
resolvedor. Essa opção é configuração confiável do servidor, nunca payload de socket.
Metronome sorteia apenas golpes compatíveis; runMove/useMove também verificam o escopo
em chamadas indiretas. Clima, terreno e transformações possuem bloqueios adicionais.

As equipes usam um a seis Pokémon base distintos (o lobby exigirá seis). Defaults de
nível/IV/EV/natureza seguem a fase 2A; PP base, sem PP Ups, sem itens e apenas
Adaptability quando cadastrada para a espécie. Gênero usa o fixo da espécie ou M;
felicidade é 255, sem configuração adicional de tela nesta fase.

Se um contrato upstream desconhecido for encontrado durante a resolução, a instância
fica inválida e recusa novas operações; a orquestração deverá tratar esse erro e
encerrar/liberar a sala. O motor não tenta continuar uma partida parcialmente resolvida.

## Verificação

Na raiz: `npm run test:engine --prefix server` executa checagem TypeScript dos testes
e as suítes offline com o runner já usado no projeto (tsx + node:assert).
`npm test` inclui a suíte nova após os sete grupos anteriores. Não é necessário iniciar
servidor, navegador ou serviços externos.

`@smogon/calc` aparece somente no teste e é dependência de desenvolvimento. As duas
dependências diretas são fixadas; mudanças de versão exigem repetir testes cruzados.
Os cenários e resultados desta etapa estão em `docs/FASE_2B_MOTOR.md`.
