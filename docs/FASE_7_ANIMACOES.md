# Fase 7 — animações de combate em spritesheets

**Status:** planejada; ainda não implementada. Esta etapa foi adicionada a pedido do usuário após a fase 4. A fase 5 continua dedicada aos menus, e a fase 6 às arenas e à validação integrada.

## Objetivo

Dar identidade visual aos eventos de batalha com arte animada em spritesheets locais. O combate e seus resultados continuam sob autoridade do servidor; a fase 7 muda a apresentação e se conecta ao `AnimationDirector` e à `BattleEventQueue` entregues na fase 4.

Os efeitos serão quadros desenhados para animação, não formas de fogo, bolhas, brilhos ou palavras montados com keyframes CSS. CSS pode definir posição, tamanho, recorte do campo e acessibilidade da camada. O desenho e os quadros dos efeitos virão das imagens do spritesheet, reproduzidos por um renderer de Canvas 2D ou por outro renderer leve validado no protótipo.

O Pokémon continua usando os sprites locais do jogo. A fase prioriza efeitos reutilizáveis disparados pelos eventos; não exige criar animações corporais exclusivas para cada uma das 1.025 espécies.

## Catálogo de efeitos

| Evento ou situação | Animação planejada |
|---|---|
| Ataque | Investida/contato, golpe cortante, projétil e impacto. A seleção considera os dados disponíveis do golpe e tem fallback neutro. |
| Esquiva e precisão | Deslocamento breve do alvo para esquiva; efeito de erro quando o golpe falha; barreira para bloqueio/Protect; resposta discreta de imunidade ou resistência. |
| Dano e crítico | Impacto, variação de intensidade para crítico e sequência coerente com cada hit registrado pelo servidor. |
| Troca | Saída do Pokémon ativo e entrada do substituto, sincronizadas ao ponto de troca atômica já usado pelo diretor. |
| Nocaute e resultado | Queda do Pokémon, seguida de vitória, derrota ou empate depois que os eventos anteriores terminam. |
| Status | Efeitos de aplicar e, quando couber, aura persistente/cancelável para queimadura, envenenamento, intoxicação, paralisia, sono, congelamento e confusão. |
| Buff e debuff | Sinal de aumento/redução de atributo ligado ao evento de `boost`, sem inferir mudança a partir do texto do log. |
| Cura e efeitos correlatos | Brilho/recuperação para cura e drenagem, com famílias visuais curtas e reutilizáveis. |

Os assets serão agrupados por família visual e tags confiáveis do catálogo/evento. Não será criado um spritesheet por golpe. Efeitos desconhecidos ou indisponíveis usam o efeito neutro/local já existente, sem impedir o combate.

## Arte e procedência

1. Produzir efeitos originais com geração de imagem/sprites ou ilustração própria, ou selecionar material cuja licença permita explicitamente uso e redistribuição no jogo. Pesquisas na internet podem orientar referências e linguagem de prompt; uma imagem encontrada não entra no jogo por estar publicamente acessível.
2. Preferir atlas de quadros com fundo transparente, grade consistente, enquadramento e ponto de origem definidos, sequência temporal legível e sem texto, assinatura ou marcas d'água.
3. Manter junto de cada asset seu ID, fonte/método de criação, prompt final quando gerado, licença/termos, autoria/créditos, dimensões, quantidade e duração de quadros, frequência de reprodução e hash.
4. Revisar manualmente bordas, transparência, alinhamento entre quadros, escala no campo e contraste sobre as seis arenas. Otimizar em formato que preserve o alpha e a nitidez do estilo final.
5. Guardar os arquivos no repositório local; nenhum endereço, prompt ou conteúdo recebido do socket pode escolher um caminho de arquivo ou URL.

Um prompt de geração por asset descreverá um efeito 2D original para jogo, a paleta e silhueta, fundo transparente, número/ordem de quadros, grade uniforme e ausência de letras/logotipos. O prompt será adaptado por família (por exemplo, chama, brilho de buff ou espiral de sono), não reaproveitado como uma instrução genérica para todo efeito.

## Integração técnica planejada

- Criar um registro tipado de IDs de efeitos e metadados de atlas, quadro, ponto de origem, duração e tags. A resolução usa eventos canônicos e dados locais validados.
- Estender o `AnimationDirector` para iniciar o asset adequado e aguardar sua conclusão. Efeitos persistentes, como status ativo, têm ciclo de início/fim e não bloqueiam a fila de turnos.
- Desenhar em uma camada visual comum por arena, com número limitado de efeitos e quadros ativos. O renderer próprio atualiza Canvas sem criar commits React por frame; componentes React só sinalizam início, estado acessível e conclusão.
- Usar o AbortSignal já adotado pelo diretor para cancelar quadros, timers, preload e camadas ao pular, ocultar a aba, trocar de sala ou desmontar a cena. Skip aplica os fatos do evento e limpa efeitos visuais pendentes.
- Pré-carregar apenas os assets pertinentes à cena/equipe/movimentos conhecidos, com concorrência e limite de tempo. Se o arquivo falhar, usar fallback local e seguir o resultado autoritativo.
- Respeitar `prefers-reduced-motion`: reduzir efeitos e duração visual sem omitir eventos, áudio escolhido, HP ou resultado. Aplicar limite global para flashes e evitar strobe.
- Manter partículas do diretor em pool limitado; spritesheets não criam nós DOM por quadro nem alteram HP, RNG ou regras.

O tamanho final dos atlas e o renderer serão fixados após um protótipo medido. Alvos iniciais para orientar a produção: até 256 KiB por atlas e até 4 MiB para o conjunto de efeitos de batalha comprimidos. Se o conjunto visual não couber sem reduzir legibilidade, a seleção e os limites serão revistos com evidência de tamanho, memória e desempenho antes de expandir o catálogo.

## Aceite da fase

- Há ao menos uma família para cada linha da tabela, incluindo status de sono e queimadura, buff/debuff, esquiva, troca, nocaute e resultado.
- Hit, crítico e multi-hit mantêm correspondência um a um com os eventos de dano; resultado e troca respeitam os limites de conclusão/commit da fila.
- Animações repetidas com as mesmas entradas produzem a mesma seleção e ordem visual. Animação não altera estado de combate nem consome RNG do servidor.
- Testes verificam ciclo completo e cancelamento para início/fim de efeito, atlas ausente/corrompido, aba oculta, skip, movimento reduzido, desmontagem, troca e chegada de novos snapshots durante uma animação.
- A suíte existente de regras, protocolo, segurança e rede continua passando; teste visual não enfraquece a validação do motor.
- O bundle não depende de CDNs durante a partida; hashes, licença, prompts e créditos estão registrados.
- Registrar capturas dos casos principais e contagens do React Profiler, além do tamanho dos atlas e uma medição em build de produção. O alvo de 60 FPS em celular intermediário só será declarado após teste no aparelho real.

Ataques por famílias e efeitos visuais dão cobertura ampla com assets reutilizáveis. Novas famílias podem ser adicionadas no registro sem criar uma animação dedicada para cada golpe.
