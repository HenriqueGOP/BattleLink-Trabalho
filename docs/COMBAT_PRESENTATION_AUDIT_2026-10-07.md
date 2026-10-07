# Apresentação do combate — revisão de 2026-10-07

## Escopo e arquitetura preservada

Revisão incremental sobre o trabalho de frontend que já estava sem commit. Nenhuma mudança no protocolo `pokemon-battle/4`, nas regras, nos contratos compartilhados ou nas dependências. O servidor continua decidindo todos os resultados; o catálogo, Pokémon, símbolos e atlas são locais.

`BattleEventQueue` ordena eventos e confirma o estado apresentado. `AnimationDirector` possui os efeitos finitos e seus cancelamentos. `SpriteRenderer` reproduz clips Canvas com cache e relógio compartilhados. GSAP movimenta a camada corporal interna; WAAPI apresenta reações e números. As âncoras externas permanecem estáveis.

## Problemas e correções

| Causa observada | Correção |
| --- | --- |
| `move` emitia impacto no alvo sem confirmação e `damage` repetia a arte | `move` apresenta apenas preparação/execução do atacante; cada `damage` apresenta um impacto, um número e o HP recebido |
| `miss` inventava esquiva e movia o alvo | `ERROU!` no atacante, sem deslocar o alvo |
| Imunidade usava a arte de Protect | `NÃO AFETA!` sem reação de dano; proteção permanece ligada a efeitos confirmados |
| Tipos distintos caíam no mesmo impacto neutro | Registro completo dos 18 tipos com família existente, cor do tema e símbolo SVG local; tintura respeita o alpha do atlas |
| `hit_count` não tinha resposta própria | Resumo final com a contagem recebida: `N acertos` |
| Cura não diferenciava drenagem confirmada | Legenda de drenagem somente para `cause: drain`, sem inventar origem ou transferência |
| Marca de crítico podia atravessar limites da ação | Limpeza em nova ação, troca, sincronização, rodada, início/fim e cancelamento |
| Aura podia continuar após resultado ou reutilizar identidade anterior com status igual | Pausa pelo resultado apresentado; aura remontada pelo ID do combatente ativo |
| Laboratório forçava movimento completo e bloqueava o próximo snapshot | Preferência Sistema/Completo/Reduzido compartilhada e chegada de outra sequência durante a apresentação |
| Procedência de `impacts.webp` não correspondia à origem registrada | Manifesto e empacotador apontam à geração original em `docs/art-sources/battle-impacts/`; hashes continuam verificados |
| Comemoração de Aren tinha corpos cortados | Seis novos frames completos gerados com imagegen e empacotados na mesma grade/âncora; atlas final: 152004 bytes |

Movimento reduzido mantém legendas estáticas breves e quadros estáticos, sem investida/tremor. Não há estado React atualizado por frame. Permanecem os limites de 24 clips, tamanho e DPR do renderer. Os 18 Path2D são armazenados em cache. Não foram introduzidos projéteis viajantes.

## Verificações automatizadas atuais

Executadas novamente depois das correções, em 2026-10-07:

- `npm test`: passou o runner completo e `test:engine`.
- Apresentação: snapshots enfileirados, HP por hit, nocaute/troca/resultado, skip, aba oculta, confirmação obsoleta, cleanup e movimento reduzido.
- Eventos: nenhum atlas solicitado durante `move`; erro sem reação corporal, texto e participante corretos; imunidade sem proteção; resumo exato de multi-hit; semântica de status, confusão, recarga, Protect e crítico preservada.
- Renderer: 25 clips; hashes, transparência e geometria; 18 tipos, cores e símbolos; relógio/cache, cancelamento, loops, carregamento frio e fallback. Atlas de efeitos somam 2968982 bytes.
- Identidade apresentada: troca entre dois combatentes da mesma espécie e com queimadura preserva o status e muda o ID usado pela aura.
- Integração: TCP/WebSocket/HTTP, clientes de terminal, salas, revanche, mensagens antigas e 99 batalhas completas de treinador/formato/dificuldade passaram.
- Recursos: 11 atlas de treinador alinhados, 396 frames, 11 fundos, 2050 artes normal/shiny e recursos existentes verificados.
- `npm run build`: servidor e cliente passaram.
- `npm run lint`: zero erros; dois avisos preexistentes de Fast Refresh em `ToastProvider.tsx` e `BattleProvider.tsx`.

O teste de apresentação tem prazo de 60 segundos: uma promise de animação simulada que nunca terminar agora falha explicitamente, em vez de permitir saída silenciosa do processo.

## Conferência atual no navegador

Servidor e cliente iniciados separadamente com `npm run dev`; endereço `http://localhost:5173/`. Capturas desta revisão usam prefixo **combat-oct7-**, em [visual-corrections](screenshots/visual-corrections/). As outras capturas da pasta são históricas.

- Laboratório PvE: entrada, atributos, dano nos dois lados, nocaute/substituição e resultado. Após resultado: zero canvases transitórios, zero legendas, corpos sem transformação temporária e palco pausado.
- Laboratório PvP: múltiplos hits, status, snapshot seguinte durante apresentação, skip para HP mais recente e desmontagem. Após skip: nenhum efeito transitório ou marcador de atuação.
- Largura 360 px: aba oculta simulada cancela os efeitos; preferência reduzida conserva a indicação estática de queimadura. Documento não excedeu a largura do viewport (350 px de conteúdo/360 px de viewport).
- Galeria: 18 tipos renderizados pelo mesmo Canvas/atlas da batalha, em modo estático e reprodução. Paleta e símbolo distinguem as famílias compartilhadas.
- PvP real: duas conexões independentes, duelo de três. Overheat causou nocaute e redução de Ataque Especial; substituição por Squirtle; Flare Blitz e Water Spout resolveram o turno seguinte com nocaute no outro lado. Perspectivas refletidas e controles de substituição conferidos.
- PvE real: Aren, duelo de três, Normal. Entrada e turno com Psychic, resposta do bot, HP 74/150 de Chimecho na rodada 2. Após a sequência: zero canvases transitórios, ambas as camadas corporais com `transform: none`, `opacity: 1` e sem estilo temporário.

Capturas principais:

- [PvE real após o turno](screenshots/visual-corrections/combat-oct7-live-pve-turn.png)
- [PvP, segundo turno](screenshots/visual-corrections/combat-oct7-live-turn2.png)
- [Resultado no laboratório](screenshots/visual-corrections/combat-oct7-result.png)
- [18 tipos](screenshots/visual-corrections/combat-oct7-type-gallery.png)
- [360 px e movimento reduzido](screenshots/visual-corrections/combat-oct7-360-reduced.png)
- [Atlas de Aren revisado](screenshots/visual-corrections/aren-motion.jpg)

## Pesquisa e decisões

- [GSAP Timeline](https://gsap.com/docs/v3/GSAP/Timeline/): conservar preparação, execução e retorno agrupados na sequência existente.
- [GSAP matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia%28%29/): conservar reversão/cleanup e a preferência compartilhada existente, sem criar outro sistema de mídia.
- [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API): aguardar `finished`, cancelar efeitos temporários e tratar a rejeição de cancelamento.
- [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) e [otimização de Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas): manter timestamp compartilhado, cache e limites, sem renders React por frame.

## Limites da evidência

As sessões PvP foram duas abas com conexões independentes no navegador integrado, não uma janela normal e uma anônima. Nem todo status raro, drenagem, imunidade, crítico ou falha de recurso foi reproduzido visualmente em partida real nesta rodada; esses caminhos têm verificação automatizada, que não equivale a aprovação visual de todas as combinações. Os cenários do laboratório são fixtures de eventos canônicos, identificados como tal.

As capturas são quadros isolados; a observação de cleanup usa também o DOM. Não houve medição de FPS/memória em celular físico. Tipos que compartilham uma família continuam compartilhando sua silhueta de impacto, diferenciada por cor e símbolo. O sprite traseiro nativo permanece pixelado e não foi inventada arte traseira em alta resolução.
