# Fase 7 — animações de combate em spritesheets

**Status:** implementada. Esta etapa foi adicionada a pedido do usuário após a fase 4 e executada junto das fases 5 e 6. A medição de 60 FPS em celular real continua pendente.

## Objetivo

Dar identidade visual aos eventos de batalha com arte animada em spritesheets locais. O combate e seus resultados continuam sob autoridade do servidor; a fase 7 muda a apresentação e se conecta ao `AnimationDirector` e à `BattleEventQueue` entregues na fase 4.

Os efeitos são quadros de imagens com transparência. CSS define posição, tamanho,
recorte do campo e acessibilidade da camada. O renderer Canvas 2D reproduz a arte
dos atlas, enquanto GSAP/WAAPI movimentam os Pokémon e as barras de HP.

O Pokémon continua usando os sprites locais do jogo. A fase prioriza efeitos reutilizáveis disparados pelos eventos; não exige criar animações corporais exclusivas para cada uma das 1.025 espécies.

## Catálogo de efeitos

| Evento ou situação | Família entregue |
|---|---|
| Ataque | Investida/contato, golpe cortante, projétil e impacto. A seleção considera os dados disponíveis do golpe e tem fallback neutro. |
| Esquiva e precisão | Deslocamento breve do alvo para esquiva; efeito de erro quando o golpe falha; barreira para bloqueio/Protect; resposta discreta de imunidade ou resistência. |
| Dano e crítico | Impacto, variação de intensidade para crítico e sequência coerente com cada hit registrado pelo servidor. |
| Troca | Saída do Pokémon ativo e entrada do substituto, sincronizadas ao ponto de troca atômica já usado pelo diretor. |
| Nocaute e resultado | Queda do Pokémon, seguida de vitória, derrota ou empate depois que os eventos anteriores terminam. |
| Status | Efeitos de aplicar e, quando couber, aura persistente/cancelável para queimadura, envenenamento, intoxicação, paralisia, sono, congelamento e confusão. |
| Buff e debuff | Sinal de aumento/redução de atributo ligado ao evento de `boost`, sem inferir mudança a partir do texto do log. |
| Cura e efeitos correlatos | Brilho/recuperação para cura e drenagem, com famílias visuais curtas e reutilizáveis. |

Os assets são agrupados por família visual e dados confiáveis do catálogo/evento.
São reutilizados entre golpes. Efeitos desconhecidos ou indisponíveis usam impacto
neutro local ou conclusão sem arte, sem impedir o combate.

## Arte e procedência

Três imagens originais foram geradas com imagegen integrado, em modo de geração
nova com fundo transparente: ataques, status e transições. Cada prompt especifica
oito famílias, oito quadros por linha, paleta e sequência temporal, sem texto,
assinatura ou logotipos. Não foram incorporadas imagens encontradas na internet.

Os atlas e quadros foram inspecionados visualmente na galeria e no campo. A conversão
para WebP preserva dimensões e alpha; pequenos fragmentos entre três linhas são
excluídos pelo recorte tipado descrito abaixo. Créditos, termos aplicáveis, prompts,
dimensões e hashes estão registrados. Caminhos são fixos no registro local; conteúdo
do socket não seleciona URLs, arquivos ou HTML.

## Integração técnica entregue

- Registro tipado com IDs, atlas, linha, FPS, tamanho e margens de recorte. A resolução usa eventos canônicos e dados locais validados.
- O `AnimationDirector` inicia o clip adequado e aguarda sua conclusão. Efeitos persistentes têm ciclo de início/fim e não bloqueiam a fila de turnos.
- A camada de cada participante usa Canvas sem commits React por frame; React confirma o estado apresentado nos limites dos eventos.
- AbortSignal cancela quadros, timers e canvas em skip, aba oculta e desmontagem. Skip aplica os fatos e limpa efeitos pendentes; sair da sala libera os recursos da cena.
- Preload limitado carrega recursos pertinentes e os três atlas universais. Arquivo indisponível usa fallback e conserva o resultado autoritativo.
- `prefers-reduced-motion` usa poses estáticas de status e confirma os demais eventos sem efeitos finitos; não há flashes de tela cheia.
- Limitar os clips a 24; spritesheets não criam nós DOM por quadro nem alteram HP, RNG ou regras. As antigas partículas CSS foram substituídas pela arte dos atlas.

O protótipo fixou o renderer em Canvas 2D, com um relógio RAF compartilhado e até 24 clips
simultâneos (incluindo poses estáticas), sem criar nós por quadro. Foram removidas as
partículas e auras desenhadas por CSS; GSAP/WAAPI conservam a movimentação dos Pokémon,
HP e textos. O hit-stop também congela o relógio dos sprites.

O alvo inicial de 256 KiB por atlas foi revisto para 768 KiB após empacotamento: ataques
620.824 bytes, status 579.934 e transições 656.072. Total **1.856.830 bytes**, abaixo dos
4 MiB previstos para o conjunto. São 24 clips de oito quadros, com alpha real, grade 8×8,
dimensões reais 1254×1254 e FPS entre 8 e 24 conforme a família. Três clips de transição
têm margens de recorte no registro para excluir pequenos fragmentos da linha vizinha
observados na inspeção; os testes verificam o recorte dentro da célula, conservando ao
menos 75% de sua altura. Não houve redimensionamento
ou retoque do arquivo gerado. As imagens decodificadas representam aproximadamente
18 MiB de pixels RGBA; três entradas de cache limitam a retenção dos atlas. O backing
store dos canvas tem DPR limitado a dois e tamanho máximo de 240 px lógicos.

O preload carrega os três atlas universais, a arena selecionada e recursos conhecidos
dos participantes com até seis tarefas concorrentes, conservando o limite global de três segundos. Isso
não requer conhecer golpes privados do oponente. Decodificação de cada imagem tem limite
de 1,5 s. Falha em status/transições usa impacto neutro local; se todos os arquivos
estiverem indisponíveis, os fatos, HP, texto e resultado continuam sendo apresentados.

Fontes, hashes, prompts e método de empacotamento estão em
`client/public/battle-vfx/{CREDITS.md,manifest.json}` e `docs/art-prompts`.

Proteção/confusão usam operações canônicas. A fila fornece o próximo evento público ao
diretor para distinguir preparação de carga de uma liberação ofensiva. Nenhuma escolha
pendente é revelada por essa consulta. Críticos absorvidos por Substitute não contaminam
danos residuais; loops de status terminam ao curar, nocautear, trocar ou desmontar, e
são cancelados na aba oculta. Em movimento reduzido, são poses estáticas e o diretor
confirma eventos sem efeitos finitos. Não há flashes de tela cheia.

## Aceite da fase

- Há ao menos uma família para cada linha da tabela, incluindo status de sono e queimadura, buff/debuff, esquiva, troca, nocaute e resultado.
- Hit, crítico e multi-hit mantêm correspondência um a um com os eventos de dano; resultado e troca respeitam os limites de conclusão/commit da fila.
- Animações repetidas com as mesmas entradas produzem a mesma seleção e ordem visual. Animação não altera estado de combate nem consome RNG do servidor.
- Testes verificam ciclo completo e cancelamento para início/fim de efeito, atlas ausente/corrompido, aba oculta, skip, movimento reduzido, desmontagem, troca e chegada de novos snapshots durante uma animação.
- A suíte existente de regras, protocolo, segurança e rede continua passando; teste visual não enfraquece a validação do motor.
- O bundle não depende de CDNs durante a partida; hashes, licença, prompts e créditos estão registrados.
- Registrar capturas dos casos principais e contagens do React Profiler, além do tamanho dos atlas e uma medição em build de produção. O alvo de 60 FPS em celular intermediário só será declarado após teste no aparelho real.

Ataques por famílias e efeitos visuais dão cobertura ampla com assets reutilizáveis. Novas famílias podem ser adicionadas no registro sem criar uma animação dedicada para cada golpe.

## Evidência e limites

Testes completos, builds normal/profile, lint, galeria de 24 clips, React Profiler,
multi-hit, troca, nocaute, skip, aba oculta e resultado foram executados. Os resultados
e capturas estão na [validação conjunta](FASES_5_6_7_VALIDACAO.md). A amostra de FPS é
desktop e inclui o término dos efeitos finitos; 60 FPS em celular real e a captura
final do indicador corrigido a 360 px permanecem **[VERIFICAR]**.
