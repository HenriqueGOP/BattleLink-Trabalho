# Fase 4 — apresentação sincronizada

## Revisão atual — 2026-10-07

Consulte a [auditoria incremental de combate](COMBAT_PRESENTATION_AUDIT_2026-10-07.md) para comportamento e evidências atuais. A arquitetura de fila/diretor foi mantida no protocolo v4 já existente. Movimento reduzido agora conserva legendas e quadros estáticos breves; resultado apresentado encerra loops persistentes. O restante deste documento é o registro histórico da fase 4.

Data: 2026-10-02. Etapa iniciada após `eae5795` (fase 3); mudanças anteriores preservadas nos commits existentes. Protocolo `pokemon-battle/3` e regras de combate permanecem os da fase 3.

## Entrega

- `BattleEventQueue` mantém estado apresentado independente do snapshot autoritativo, eventos por sequência e checkpoints por snapshot. Novos eventos entram durante a apresentação; duplicatas não executam novamente. Lacunas e snapshots antigos são tratados explicitamente.
- `AnimationDirector` é o único dono dos efeitos finitos. A fila aguarda promises reais de WAAPI/GSAP; as durações configuradas definem o efeito, sem estimar quando a fila pode avançar.
- Cada hit confirma seu HP final após o efeito; a flag de nocaute muda após a queda. Trocas confirmam o substituto entre saída e entrada. Status, atributos e log acompanham os fatos apresentados. O resultado aparece depois da fila.
- HP principal e fantasma usam `scaleX`, com atraso da fantasma. React publica nos limites dos eventos; nenhuma barra atualiza estado React por frame.
- Impactos usam pausa de 70 ms (90 ms no crítico), até 24 partículas reutilizáveis e até dois overlays de impacto por segundo, globalmente. Efeitos finitos animam somente transform/opacity. A variação cosmética é determinística por sequência pública e não consome a seed de combate.
- Pular animações e ocultar a aba aplicam o snapshot mais recente. AbortController e geração da fila impedem confirmação obsoleta. Saída/desmontagem cancela WAAPI, GSAP, frames, timers e nós transitórios; a devolução do pool é idempotente.
- Movimento reduzido aplica os eventos sem efeitos finitos e desativa auras/bob/shiny animados em CSS. A camada de clima cancela o frame atual e evita loops duplicados ao retornar à aba.
- A preparação já contém HP, ativos e o histórico inicial. A entrada visual usa esse snapshot antes de consumir novas rodadas, sem antecipar dano recebido entre renders nem duplicar eventos canônicos. Movimento reduzido preserva o áudio escolhido pelo usuário.
- Foram removidos os executores concorrentes BattleEffects/DamageNumbers, helpers antigos e confetes independentes. Áudio por evento tem um único ponto de execução no diretor.

## Bug descoberto no navegador

A ficha de golpe alterava a altura do painel sob o cursor. O botão entrava e saía de hover repetidamente, impedindo o clique e causando aproximadamente 144 commits React por segundo na observação inicial. A mensagem agora reserva altura estável e permite rolagem interna; sua atualização por caractere foi removida. Depois da correção, o clique chegou ao servidor, o próprio cliente aguardou em privado e o adversário continuou podendo escolher. O indicador de turno também perdeu seu timer independente, que podia deixar um sinal visual preso ao cancelar.

## Validação

| Verificação | Resultado |
|---|---|
| Build normal do servidor e cliente | Passou |
| Build de medição `--mode profile` | Passou |
| Lint | Zero erros; dois avisos anteriores de Fast Refresh |
| Runner completo existente | Passou, incluindo regras, segurança, HTTP/TCP/WebSocket e dois terminais reais |
| Apresentação automatizada | Preparação/entrada com render agrupado, HP por hit, fila durante evento, duplicatas, imutabilidade, status/atributos, KO/troca/resultado, skip, aba oculta, lacuna, conclusão obsoleta, reativação e cleanup passaram |
| DOM controlado do diretor | Um número por hit, HP fantasma, propriedades animadas, pool reutilizado após cancelamento, saída/entrada atômica, cancelamento e movimento reduzido passaram |
| Duas abas do jogo | Fila, equipes, confirmação, escolha privada e rodada com Bullet Seed/Splash verificados |
| Cenário visual completo | Multi-hit, cura, status/residual, boost, KO, troca, resultado, novos snapshots durante efeitos, skip, aba oculta e desmontagem verificados |
| Erros no console do cenário | Nenhum observado |
| FPS em celular intermediário | **[VERIFICAR]**; não houve medição em aparelho real |

Os testes antigos não foram removidos nem enfraquecidos. O grupo `presentation.test.ts` foi acrescentado ao runner atual.

Esta fase usa efeitos pontuais, auras e animações de interface existentes, alguns ainda definidos em CSS. A fase 7 substitui os efeitos artísticos específicos de combate por spritesheets originais ou licenciados; sincronização, cancelamento e fila continuam sob o AnimationDirector desta fase.

## Evidências e reprodução

O modo `profile` substitui React DOM pela versão com Profiler e grava commits em um output oculto, sem atualizar estado React. `/visual-check` usa nove snapshots validados, gerados pelo motor real com seed fixa e ações conhecidas, incluindo preparação e entrada. A cena força movimento completo somente nesse laboratório: a preferência do sistema disponível no navegador de inspeção estava em movimento reduzido. O jogo normal continua respeitando essa preferência.

Gere o servidor, execute `node scripts/generate-presentation-fixture.cjs` na raiz quando precisar renovar a fixture e compile o cliente com `npm run build -- --mode profile`. Inicie o preview e percorra `/visual-check`. Use Próxima sequência durante um impacto para simular chegada concorrente; Pular animações, Simular aba oculta e Desmontar cena exercitam cancelamento. O build normal exclui a rota, seus dados e a instrumentação ativa.

- [Commits do React Profiler](evidence/phase4/react-profiler.json): 91 commits no percurso de preparação até resultado. Seis impactos sem entrada concorrente tiveram dois commits cada, separados por cerca de 631–638 ms; a maior duração de render da cena foi 1,8 ms nessa amostra. Um snapshot recebido durante o impacto acrescenta atualizações legítimas (quatro commits no hit de sequência 9). Não existe uma série de commits a cada frame.
- [Impacto e HP anterior](evidence/phase4/impacto.png): evento de dano ativo, número único, pool de dez partículas no impacto comum e HP ainda não confirmado.
- [Troca e resultado concluídos](evidence/phase4/resultado.png): substituto apresentado e fila concluída.

As medições são locais e limitadas à cena instrumentada; timers/frames podem sofrer throttling do navegador. Elas comprovam o padrão de commits observado, sem substituir medição de FPS, uso de memória prolongado ou desempenho em aparelho físico. Contraste, foco uniforme e revisão dos menus continuam na fase 5; arenas e validação integrada, na fase 6; efeitos de combate em arte de spritesheets, na fase 7.
