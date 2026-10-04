# Correções da seleção, dos golpes e da apresentação

Entrega de 2026-10-03. A estrutura React/CSS Modules, os registros locais, a fila
de eventos, o diretor de animação e o simulador Showdown Gen 9 foram preservados.
As alterações estão organizadas na árvore de trabalho; esta entrega não faz
commit nem publicação.

## O que mudou

### Equipe e protocolo

- Editor compartilhado na seleção e na preparação, com posições 01–06, indicação
  do Pokémon inicial e controles visíveis Mover antes, Mover depois e Remover.
- Ao completar seis integrantes, a seleção permanece aberta e libera Preparar
  golpes. Voltar preserva integrantes e rascunhos dos golpes. A ficha acompanha
  o ID da espécie, independentemente da posição.
- Remover alguém na preparação retorna à seleção; golpes e shiny dos demais
  permanecem associados ao integrante correto.
- `remove_pokemon` e `reorder_team` estendem `pokemon-battle/3`. A permutação deve
  conter exatamente os integrantes atuais, sem duplicatas. O servidor verifica
  pertencimento, fase e confirmação, reatribui IDs posicionais e mantém privados
  os integrantes e as posições do adversário.
- As edições têm `editId`, previsão imutável e envio serializado. Respostas
  confirmam a previsão; erros de regra e payloads rejeitados devolvem a correlação
  quando seu identificador é válido. Rejeições ou timeout removem as previsões pendentes e
  solicitam ressincronização. A confirmação fica bloqueada durante a sincronização.
  O cliente de terminal recebeu os comandos de remoção e ordenação.

### Golpes e início

- A grade de golpes usa linhas dimensionadas pelo conteúdo e rolagem. O problema
  foi reproduzido: cartões com aproximadamente 5,05 px passaram a 205,80 px no
  catálogo desktop inspecionado, mantendo nomes, atributos, descrição e restrições.
- Golpes disponíveis, equipados e de batalha compartilham identidade por tipo.
  Seleção, indisponibilidade e foco têm indicadores próprios; fogo e gelo recebem
  decoração discreta em hover/foco, estática com movimento reduzido.
- O parágrafo e os três passos solicitados foram removidos do início, junto com
  seus estilos exclusivos, sem uma área reservada para o conteúdo antigo.
- Em 360 px, a prévia do golpe tem altura estável e rolagem acessível por teclado.
  A conferência real encontrou e corrigiu um deslocamento do botão no foco que
  podia impedir o primeiro clique de enviar a ação.

### Sprites, animações e arenas

- Sombras ovais e filtros de sombra foram removidos. A vista correta tem
  preferência: costas do jogador e frente do adversário, inclusive no fallback.
- Foram medidos 7.468 recursos PNG/GIF locais. GIFs usam a união dos limites dos
  frames; o PNG da vista correta fornece a referência de tamanho da espécie.
  Não há redimensionamento com base no frame atual. O ponto inferior do limite
  visível ancora o sprite; corpo e cabeça possuem marcadores compartilhados.
- Os atores são independentes dos cartões de HP. Pés em 28%/86% e 72%/60%, com
  profundidade fixa de 0,82 no adversário. Deslocamentos de ataque são limitados
  e não modificam escala nem espelhamento. Conclusão e cancelamento restauram
  a configuração-base.
- Ataques e status usam as mesmas âncoras dos atores. Congelamento tem um atlas
  transparente dedicado de oito frames, 2048 × 256, com aura azul e cristais
  periféricos. Movimento reduzido usa um frame estático. O centro permanece
  transparente e o Pokémon continua reconhecível.
- As seis arenas declaram paletas para o menu externo e superfícies legíveis.
  O cenário desfocado fica em uma camada decorativa, separado do conteúdo.
- A fila sequencial, HP por evento, skip, aplicação imediata em aba oculta,
  desmontagem e limite compartilhado de 24 clips permanecem ativos. O laboratório
  separa inspeção de atores da galeria para não consumir o orçamento simultâneo.

## Ordem dos turnos

O adaptador foi conferido contra o simulador instalado `@pkmn/sim@0.10.11` e as
fontes oficiais de [ordenação](https://github.com/smogon/pokemon-showdown/blob/master/sim/battle.ts),
[fila de ações](https://github.com/smogon/pokemon-showdown/blob/master/sim/battle-queue.ts),
[golpes/Trick Room](https://github.com/smogon/pokemon-showdown/blob/master/data/moves.ts)
e [condições](https://github.com/smogon/pokemon-showdown/blob/master/data/conditions.ts).

Não foi demonstrada uma divergência no motor que exigisse substituir sua
ordenação. O simulador permanece a autoridade; a apresentação segue a sequência
resolvida dos eventos e não anuncia a ordem a partir de escolhas privadas.

A regressão agora cobre prioridade, estágios de velocidade, paralisia, Tailwind
e seu término, empate por RNG em 32 seeds, ativação de Trick Room (prioridade −7),
prioridade superior dentro dele, cancelamento por reaplicação, nova ativação e
término após cinco rodadas. Também verifica o evento de alteração de velocidade
antes da ação seguinte na mesma rodada. O jogo é Singles: esse último caso não
equivale a uma validação da ordenação de vários atores em Doubles.

## Verificações realizadas

| Área | Resultado e evidência |
|---|---|
| Builds | Servidor e cliente de produção passaram; nenhum chunk excedeu o aviso de 500 KB. O simulador e o laboratório permanecem fora do bundle normal. |
| Lint | Zero erros; dois avisos já existentes de Fast Refresh em ToastProvider e BattleProvider. |
| Suíte completa | Passou, incluindo HTTP/TCP/WebSocket, dois processos de terminal, segurança, contratos, montagem, recursos, apresentação, áudio e motor. |
| Equipe | Remoção de primeiro/meio/último, permutação, remoção/reinclusão, rejeições, privacidade, bloqueio por fase/confirmação, IDs iniciais, preservação de golpes/shiny e previsão imutável. Integração envia reordenações consecutivas e confere confirmação exclusiva ao autor. |
| Navegador | Edição nas duas telas, ficha estável após reordenar, rascunho de três golpes preservado ao voltar, remoção preservando os demais, reordenação com Enter e confirmação de ambas as equipes. |
| Fluxo completo | Dois clientes reais em localhost:5173: montagem, preparação, golpes, trocas voluntárias/forçadas e derrota dos seis integrantes em sete rodadas. Resultado final: 777 de dano causado e 78 recebido pelo vencedor. |
| Mobile | Documento real de 360 px: início, seleção, preparação, batalha, envio de golpe, nocaute, substituição e vitória por desconexão. Sem transbordamento horizontal nas telas inspecionadas (largura de conteúdo 350 px). |
| Sprites | Amostras Bulbasaur, Wailord, Charizard, Flabébé, Gastly e Greninja nos dois lados das seis arenas; variantes shiny, costas/frente e GIF/PNG. Os 7.468 limites e a igualdade de extensão visível entre formatos têm teste automatizado. |
| Efeitos | Runner cobre ataque, miss/esquiva, multi-hit, troca, KO/resultado, sono/status, buff/debuff, congelamento, skip, aba oculta, cancelamento e recursos ausentes. Laboratório percorreu fila durante animação, multi-hit, residual, atributo, KO/troca/resultado, skip, aba oculta e desmontagem. |
| React Profiler | 19 commits em cerca de 3,241 segundos no cenário animado observado, ligados aos eventos; não foi observado commit por frame. Dados brutos anexados. |
| Legibilidade | Texto principal de golpe de fogo medido em 11,86:1 na amostra; controles de equipe com mínimo de 44 px e golpes de batalha acima de 106 px. Busca com acentos, IDs e categorias passou no runner. Foco e teclado conferidos no navegador. |
| Recursos | Hashes dos 5.125 recursos originais e 3.368 GIFs preservados. Quatro atlas transparentes: 2.120.060 bytes, abaixo do limite de 4 MiB. Novo gelo: 263.230 bytes. Arenas/fallbacks, whitelist local, cancelamento e prazo de três segundos passaram. |
| Matemática/regras | 900 cálculos de atributos, 324 pares de tipos, 360 amostras × 16 rolls, 12 replays completos determinísticos, 553 resultados de Metronome e 1.564 cenários de golpes com várias rodadas passaram. |

Os testes antigos que esperavam GIF da vista oposta para Greninja foram ajustados
para a preferência intencional pelo PNG de costas. A validação de atlas foi
ampliada de três para quatro arquivos e aceita a geometria 8 × 1 do gelo,
preservando as verificações de hash, alpha, tamanho, cancelamento e orçamento.

A auditoria de regressão que permitia reset após confirmação foi adaptada à
decisão aprovada de bloquear a montagem após aceitar: agora verifica rejeição e
snapshot intacto. A cobertura de reset antes da confirmação, seleção atômica e
ausência de acesso à rede permanece no mesmo runner.

## Imagens e dados

| Evidência | Arquivo |
|---|---|
| Golpes antes / depois | [Antes](screenshots/selection-battle-fixes/before-moves.png), [depois desktop](screenshots/selection-battle-fixes/after-moves.jpg), [depois 360 px](screenshots/selection-battle-fixes/after-moves-360.jpg) |
| Início antes / depois | [Antes](screenshots/selection-battle-fixes/before-home.png), [depois 360 px](screenshots/selection-battle-fixes/after-home-360.jpg) |
| Edição de equipe | [Desktop](screenshots/selection-battle-fixes/after-selection.jpg), [360 px e rótulos completos](screenshots/selection-battle-fixes/after-selection-360.jpg) |
| Batalha | [Partida real](screenshots/selection-battle-fixes/after-live-battle.jpg), [rodada móvel após correção do clique](screenshots/selection-battle-fixes/after-mobile-round.jpg), [resultado por KO](screenshots/selection-battle-fixes/after-knockout-result.jpg), [desconexão em 360 px](screenshots/selection-battle-fixes/after-disconnect-360.jpg) |
| Gelo e arenas | [Inspeção de gelo](screenshots/selection-battle-fixes/after-ice-arena.jpg), [posições medidas](screenshots/selection-battle-fixes/grounding-desktop.json) |
| Profiler | [Dados brutos](screenshots/selection-battle-fixes/react-profiler.json) |

## Uso e limites observados

O [guia de abertura](COMO_JOGAR.md) mantém o fluxo informado pelo usuário:
`npm run dev` em server e client, separadamente, e localhost:5173 em janela normal
e anônima. A validação desta entrega usou abas independentes do navegador integrado
e um servidor temporário em portas separadas, preservando instâncias já abertas.
Não foi medida a separação de preferências de uma janela anônima nesse navegador.

- Opera não estava disponível na superfície de automação; o fluxo continua
  documentado para conferência manual nele.
- Não houve medição em celular físico nem certificação de 60 FPS. 360 px e Profiler
  verificam layout e atualizações React, não desempenho em um aparelho intermediário.
- A amostra de contraste não substitui uma auditoria automatizada completa de AA.
- Nem todas as espécies foram examinadas visualmente; seus limites foram medidos
  e validados automaticamente, com amostras representativas no navegador.
- Fallbacks e recursos indisponíveis foram verificados pelo runner; não foi
  simulada a falha individual de cada arquivo no navegador real.
- A nova arte é local e original; especificação, origem e empacotamento estão em
  [art-prompts/frozen.txt](art-prompts/frozen.txt). As exclusões atuais de regras
  e o modelo Singles foram preservados.
