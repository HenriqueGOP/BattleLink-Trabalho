# ADR: reformulação do sistema de batalha

Data: 2026-10-02. Status: aprovado pelo usuário; implementação incremental.

## Contexto e linha de base

O jogo é singles, com dois jogadores e seis Pokémon por equipe, pareados automaticamente.
A revisão anterior já deixou alterações locais de auditoria: elas são a linha de base desta
migração e não devem ser descartadas nem confundidas com as mudanças do novo motor.
Antes da implementação, build e os sete grupos de testes passaram. O lint apresentou
apenas dois avisos de Fast Refresh, em BattleProvider e ToastProvider. O lobby foi
inspecionado no navegador; partida entre dois navegadores e FPS em aparelho real ainda
dependem de validação.

## Decisões

| Decisão | Alternativas | Motivo | Trade-off |
|---|---|---|---|
| Adotar `@pkmn/sim@0.10.11` no servidor, com versão exata e adapter interno | Reimplementar o motor; usar apenas `@pkmn/dex`/`@pkmn/data` | O simulador preserva callbacks e a resolução completa dos golpes. Dex/Data são úteis para dados, mas não substituem a execução das regras. O importador atual perde efeitos e possui 167 golpes marcados como parciais. A licença do pacote é MIT. | Cerca de 45,9 MB descompactados no servidor, sem inclusão no bundle do cliente. A dependência fica encapsulada; atualizações exigem testes de contrato e regressão. [Fonte](https://github.com/pkmn/ps/blob/main/sim/README.md). |
| Usar `@smogon/calc@0.11.0` somente como dependência de desenvolvimento | Manter duas fórmulas de produção; confiar apenas em exemplos calculados manualmente | A calculadora MIT será o oráculo independente de testes de dano e tipos, enquanto o simulador continua sendo a única autoridade de combate. | Acrescenta dados à instalação de desenvolvimento, sem dependência de produção. [Fonte](https://github.com/smogon/damage-calc/blob/master/README.md). |
| Dados declarativos de golpes com hooks opcionais encapsulados e manifesto de capacidades | Importador reduzido; resolvedor com um grande switch | Dados simples não devem exigir mudanças no resolvedor. Exceções usam o mecanismo de eventos do simulador, preservando sua semântica. Golpes dependentes de sistemas excluídos ficam indisponíveis com motivo; golpes que chamam outros golpes também respeitam essa restrição. | É necessário auditar capacidades e adaptar callbacks, sem expor objetos internos nem funções ao cliente. |
| Manter GSAP, CSS e WAAPI, com um único AnimationDirector | Adicionar Motion; renderizar toda a batalha em canvas | GSAP já está instalado. Timelines e promises de conclusão permitem execução sequencial, cancelamento e skip; partículas usam pool limitado. | A animação imperativa precisa de cleanup consistente e testes de cancelamento. [GSAP](https://gsap.com/docs/v3/GSAP/Timeline/), [WAAPI](https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished). |
| Manter CSS Modules e consolidar tokens existentes | Trocar a solução de estilos; adicionar biblioteca de componentes | Fontes locais, paletas, HP, auras e menus compartilharão tokens e componentes. Rotas, textos, test IDs e handlers são preservados durante o polimento. | Componentes precisam ser migrados por tela, com contraste, teclado, foco e screenshots verificados. |
| Usar arenas e recursos locais | CDN com whitelist | O padrão é zero requisições externas em runtime. Registros locais resolvem IDs; nenhuma string do socket vira URL, caminho ou HTML. As seis arenas começam em CSS/SVG, preparadas para WebP. | Exige empacotamento, orçamento de tamanho, origem/licença dos recursos e fallbacks locais. |
| Adicionar efeitos de combate como arte em spritesheets locais na fase 7 | Desenhar cada efeito com keyframes CSS; carregar animações de CDNs; criar um sprite corporal exclusivo por espécie | O `AnimationDirector` já sincroniza efeitos com eventos canônicos e controla cancelamento, skip e movimento reduzido. Spritesheets originais/licenciados permitem efeitos expressivos de ataque, status, esquiva, troca e resultado, mantendo as imagens dos Pokémon já empacotadas. | Requer produzir e revisar arte, metadados de frames, registro de licença/créditos, preload seletivo e limites de download/memória. CSS ficará para disposição e posicionamento, não para desenhar os efeitos de combate. |

## Regras e limites aprovados

- Mecânicas da Geração 9, com o comportamento do Showdown como referência de execução.
- Defaults: nível 50, IVs 31, EVs 0, natureza neutra. Somente Adaptability pode produzir
  efeito de habilidade, em espécies cujo cadastro permita; nenhuma habilidade é escolhida
  pelo cliente. Nenhum item.
- Completar as mecânicas existentes compatíveis, incluindo proteção, Substitute,
  bloqueios de golpes, confusão, charge/recharge e trocas automáticas/forçadas.
- Não implementar itens, outras habilidades, clima/terreno de combate, Terastalização,
  Dynamax, hazards ou formas alternativas. Desativar TERA e efeitos de terreno na fase 3,
  conforme decisão explícita do usuário. Ambientação visual continua permitida.
- Protect é verificado antes da precisão na Gen 9. A penalidade de usos consecutivos
  segue o limite do simulador. Bullet Seed usa 35/35/15/15% para 2/3/4/5 hits, com roll
  e crítico por hit. Essas regras corrigem divergências do enunciado inicial.
  [Ataques](https://github.com/smogon/pokemon-showdown/blob/master/sim/battle-actions.ts),
  [condições](https://github.com/smogon/pokemon-showdown/blob/master/data/conditions.ts).

## Fronteiras da arquitetura

O adapter é o único módulo que conhece objetos mutáveis do simulador. As regras não
fazem rede nem acessam sockets, relógio ou arquivos da aplicação. A consulta de dano
recebe contexto imutável e roll explícito, cria uma simulação isolada e não consome o
RNG de uma partida. Não há uma segunda fórmula de dano mantida em paralelo.

**Detalhe confirmado na fase 2A:** o formato upstream `gen9customgame` substitui
`trunc` por `Math.trunc`, desativando os overflows oficiais. O adapter usa um formato
local singles Gen 9 com limites de seis Pokémon, quatro golpes e nível 100, sem essa
substituição. Um teste explícito de dano extremo e a comparação cruzada cobrem o caso.
O construtor upstream também gera uma linha privada de timestamp: ela é descartada,
nunca retornada pela fachada, e testes com relógios diferentes confirmam resultados
idênticos. Não se substituem relógios globais no código de produção.

O RNG tem estado serializável e injetável. Combate, sorteio de equipes e apresentação
usam fluxos derivados da seed inicial, de modo que uma mudança visual não altera o
combate. O log canônico usa participantes e sequências estáveis; horários, conexões e
seed ficam fora dos eventos públicos. A seed nasce na orquestração, nunca nas regras.

Na fase 3, servidor e ambos os clientes migram juntos para `pokemon-battle/3`. Escolhas
privadas incluem solicitação de turno e chave de idempotência. Eventos discriminados
carregam sequência, rodada, participantes e resultados suficientes para animação.
Snapshots privados permitem ressincronização; escolhas ainda não resolvidas não vazam.

O estado autoritativo e o estado apresentado são separados. A fila aguarda o diretor
de animação e React confirma resultados apenas nos limites de eventos. Skip e aba
oculta aplicam os resultados pendentes; sair libera efeitos. HP anima por scaleX,
com barra-fantasma, e o pool comporta até 24 partículas por impacto. Reduced motion
desativa movimento intenso e flashes; flashes são limitados globalmente.

## Etapas e interrupções

1. **2A:** adapter, RNG, tipos, atributos, calculadora e testes cruzados. O motor antigo
   continua atendendo o jogo e o protocolo atual permanece intacto.
2. **2B:** registro/capacidades de golpes, pipeline, status, ações, eventos e testes.
3. **3:** ativação do novo motor, protocolo e clientes juntos, catálogo/recursos locais,
   sorteio no servidor, remoção de TERA/terreno e preparação da batalha.
4. **4:** AnimationDirector, componentes, HP e juice; evidência do React Profiler.
5. **5:** tokens, componentes e telas, sem mudança de fluxos; screenshots antes/depois.
6. **6:** seis arenas, preload/fallback e validação integrada entre dois clientes, teclado e largura de 360 px.
7. **7:** spritesheets locais originais ou licenciados para ataques, esquiva, troca, nocaute/resultado, status, buff/debuff, cura e efeitos relacionados; integrar com o AnimationDirector, movimento reduzido e fallbacks. Especificação e critérios: [fase 7](../FASE_7_ANIMACOES.md).

Cada etapa termina com build, lint e testes, commit isolado ou alterações organizadas,
resumo de até 15 linhas e pausa antes da seguinte. Nenhum teste existente será removido
ou enfraquecido sem justificativa. Não afirmar que as fases futuras estão implementadas.

A fase 7 foi solicitada após a entrega da fase 4. Na autorização seguinte, o usuário
pediu executar as fases 5, 6 e 7 juntas, substituindo a pausa entre essas três etapas.
O diretor existente é o ponto de integração; a arte dos efeitos migrou para atlas locais.

## Critérios de validação

### Registro da fase 2B

A fachada BattleSession e o manifesto foram implementados separadamente da Room.
São 954 entradas de golpes, com 792 compatíveis e 162 bloqueadas por motivo. A montagem
valida o learnset nacional Gen 9 (incluindo golpes legados); compatibilidade de execução
não substitui aprendibilidade. Hyperspace Fury é excluído por exigir Hoopa-Unbound.
Golpes como Weather Ball, Thief e Tera Blast mantêm sua semântica nativa sem clima,
itens e Terastalização. Metronome usa apenas o pool compatível; chamadas indiretas
também passam pelos bloqueios do adapter.

PP usa o valor base, sem PP Ups. Double-Edge preserva a razão nativa 33/100. Gênero é
o fixo da espécie ou M e felicidade é 255, sem nova tela de configuração. As equipes
do motor aceitam um a seis Pokémon base distintos; a sala continuará exigindo seis.

As solicitações incluem lockedMoveId para concluir cargas mesmo com zero PP ou quando
o golpe foi chamado indiretamente. Eventos privados podem deixar lacunas na sequência
de uma perspectiva; a integração usará o watermark do snapshot. A idempotência retém
256 recibos, e requisições antigas são rejeitadas após sua expiração. Falhas de contrato
durante a execução invalidam a instância para impedir continuidade de estado parcial.

Detalhes, evidências e limites: [relatório da fase 2B](../FASE_2B_MOTOR.md).
Na conclusão da fase 2B, o motor ainda não estava conectado ao protocolo da aplicação.

### Registro da fase 3

O motor foi ativado na Room, e servidor, React e terminal migraram juntos para
`pokemon-battle/3`. Ações possuem solicitação e chave idempotente; escolhas pendentes
e equipes não reveladas permanecem privadas. Snapshots usam watermark e janela de
240 sequências; falhas internas encerram a partida sem regredir a sequência publicada.

O catálogo local contém 1.025 espécies base e o manifesto da fase 2B. Seleção e sorteio
não dependem da PokeAPI; o sorteio usa um fluxo privado por lado. TERA e terreno de
combate foram removidos. A preparação usa preload de três segundos, seis tarefas
concorrentes e fallback local, com timeout da sala de oito segundos configuráveis.

Foram empacotados 5.125 sprites/cries, somando 19.008.688 bytes, com hashes, revisões
fixadas e avisos de licença preservados. O custo é armazenamento e distribuição local;
a batalha pré-carrega apenas os recursos pertinentes. Catálogo, golpes e registro de
recursos têm chunks próprios, ainda carregados inicialmente. O build rejeita inclusão
do simulador ou da calculadora de referência no bundle do navegador.

Build, lint (zero erros/dois avisos anteriores), suítes do motor, integração de rede,
dois processos de terminal e integridade dos recursos passaram. Duas abas do navegador
de produção percorreram montagem, escolhas, troca e desconexão. O encerramento natural
completo foi exercitado na integração TCP/WebSocket. Não houve medição de FPS real.

A sincronização de estado apresentado com conclusão das animações continua como
entrega da fase 4. As seis novas arenas e a revisão completa de acessibilidade continuam
nas fases correspondentes. Detalhes e evidências: [relatório da fase 3](../FASE_3_INTEGRACAO.md).

### Registro da fase 4

A fila agora mantém snapshots apresentados e checkpoints, aguarda conclusão real do
diretor e cancela efeitos em skip, aba oculta e desmontagem. HP/nocaute são confirmados
ao concluir os eventos; a troca confirma o ativo entre saída e entrada. A versão normal
exclui o laboratório e a fixture usados na medição de commits React.

No cliente, partículas derivam variação da sequência pública; nenhuma seed privada é
enviada para apresentação. O resultado das regras e o sorteio continuam independentes
dos efeitos visuais. O pool tem até 24 nós, com liberação idempotente após cancelamento.

Testes completos, build, lint e inspeção de duas abas/cenário visual passaram. O Profiler
não mostrou commits por frame nos impactos observados. FPS em celular real, revisão
completa dos menus, novas arenas e animações em spritesheets continuam nas etapas seguintes. Detalhes e limites:
[relatório da fase 4](../FASE_4_APRESENTACAO.md).

### Registro das fases 5, 6 e 7

Menus e diálogos foram unificados com tokens, tipografia local legível, controles de
44 px e foco modal/restauração. Preferências de áudio publicam snapshots imutáveis.
As seis arenas originais usam IDs validados e somam 16.560 bytes. Preload e erros de
imagem usam fallback local, com o prazo de três segundos preservado.

O combate usa 24 clips originais em três atlas WebP, total de 1.856.830 bytes. O renderer
Canvas compartilha um relógio, tem cache de três imagens e limite de 24 clips, e segue
conclusão/cancelamento do diretor. Auras CSS e partículas desenhadas foram removidas.
Carga, recharge e críticos absorvidos por Substitute receberam regressões com eventos
reais. O alvo inicial de 256 KiB/atlas foi revisto para 768 KiB com base no empacotamento;
o conjunto continua abaixo de 4 MiB. O motor e escolhas privadas permanecem inalterados.

Builds, lint, suítes e evidências de navegador são registrados na
[validação conjunta](../FASES_5_6_7_VALIDACAO.md). FPS em celular real continua pendente.

### Critérios gerais atuais

- Sanidade de dano 31–37; todos os 16 rolls; atributos, estágios, críticos, STAB,
  Adaptability, Burn, imunidades e tabela 18×18 contra `@smogon/calc`.
- Entradas imutáveis, repetição determinística, limites de HP/estágios e RNG forçado
  cobrindo ambos os ramos probabilísticos.
- Na integração: privacidade, duplicatas, ações atrasadas, desconexão e payloads inválidos.
- Na apresentação: fila durante animação, multi-hit, skip, aba oculta, teardown e nenhum
  commit React por frame; modal acessível, contraste AA e largura mínima de 360 px.
- Recursos sem rede externa; arenas até 600 KB e preload com timeout de três segundos
  antes de fallback local. A sala também limita a espera por cliente ausente.
- Recursos locais, avisos de licença e screenshots foram registrados nas fases 3–7.
  O percurso em dois clientes e a apresentação são descritos na validação conjunta.
  **[VERIFICAR]** 60 FPS em celular intermediário real. Emulação não substitui medição
  em aparelho.
- Na fase 7, efeitos artísticos de combate migram para atlas originais ou licenciados:
  ataques, esquiva, troca, status, buff/debuff, cura e nocaute/resultado. O renderer deve
  seguir eventos canônicos e aceitar skip/cancelamento/movimento reduzido. Fontes,
  prompts, cobertura, preload e orçamento estão registrados na validação conjunta.
  FPS e memória em aparelho real continuam **[VERIFICAR]**.
  Especificação: [fase 7](../FASE_7_ANIMACOES.md).

## Atualização visual — 2026-10-03

A pesquisa e a reformulação Battle Link posteriores às fases 5–7 estão registradas em
[FRONTEND_REFRESH](../FRONTEND_REFRESH.md). Incorporam GIFs locais por frames, seis
ilustrações WebP com SVG de fallback, perfis separados de criatura/golpe e preferência
Sistema/Completo/Reduzido. A recuperação de falhas temporárias foi corrigida e uma
camada antiga que encobria o cenário foi removida. Regras, exclusões e protocolo v3
continuam preservados. Instrumentação e fixtures abrem em DEV/profile; o bundle normal
as rejeita. Evidências atuais incluem partida real no Vite, 360 px, fila/cancelamento,
inventário local e React Profiler. FPS em aparelho real permanece **[VERIFICAR]**.

O modo de uso informado pelo usuário está no [guia de abertura](../COMO_JOGAR.md):
`npm run dev` dentro de server e client em terminais separados, `localhost:5173` em
janela normal e em janela anônima.
