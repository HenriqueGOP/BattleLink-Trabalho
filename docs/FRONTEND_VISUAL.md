# Refatoração visual Battle Link

## Direção antes da arte

Painéis de console em azul profundo, bordas angulares ciano, ações principais vermelhas. Textos e dados permanecem HTML. Referências Genshin estudadas pela composição, linhas de ação, espaço negativo e luz; personagens e figurinos próprios do projeto.

| Personagem | Presença e silhueta | Expressão, movimento e assinatura visual |
|---|---|---|
| Véspera | Reservada, gentil; vestido preto/ameixa e cabelo volumoso | Olhar atento, gesto discreto envolvendo Spiritomb, lua e espíritos violetas |
| Maré | Teatral, elegante; tecidos fluidos azul-petróleo e marfim | Giro suave, pérolas e conchas, Milotic acompanhando a curva da água |
| Téo Volt | Inventor curioso; casaco amarelo, óculos e ferramentas | Sorriso de descoberta, impulso diagonal e circuitos dourados com Ampharos |
| Brasa | Atleta competitiva; roupa esportiva vermelha/laranja | Postura de corrida, punho firme, energia crescente com Blaziken |
| Nina Eco | Tímida e observadora; suéter lavanda, sem chapéu | Ombros recolhidos, sorriso pequeno, Mimikyu e ecos suaves |
| Flora | Pesquisadora; verde, bolsa e caderno | Inclina-se para descobrir, folhas e sementes, Leavanny |
| Nival | Estrategista preciso; cabelo branco e casaco de gelo | Olhar sereno, gesto calculado, cristais e Frosmoth |
| Rixa | Rival punk; preto e magenta | Sorriso provocador, postura assimétrica e neon, Toxicroak |
| Aren Cume | Guia confiante; roupa de trilha em tons terrosos | Postura estável, corda e rochas, Lycanroc |
| Lia Horizonte | Exploradora otimista; azul e equipamento de viagem | Braços abertos para o horizonte, vento e Altaria |
| Bento Ferrugem | Mecânico veterano; barba e roupa de oficina | Presença firme e acolhedora, ferramentas, faíscas e Aggron |

## Inventário de menus e imagens próprias

| Menu | Imagem 1 | Imagem 2 |
|---|---|---|
| Início | home-background | home-modes (três ícones) |
| Partida rápida | quick-splash | quick-emblem |
| Amigos: criar/entrar | friends-splash | friends-emblem |
| Sala aguardando convidado | waiting-splash | waiting-emblem |
| Aguardando confirmação / carregamento de equipes | ready-panel | ready-emblem |
| Desafios PvE | pve-background | pve-emblem; também 11 splashes exclusivos |
| Seleção de Pokémon | selection-background | selection-emblem |
| Preparação de golpes | setup-background | setup-emblem |
| Comandos de combate / golpes | combat-panel | combat-emblem; também arte dos 18 tipos |
| Trocar Pokémon | party-panel | party-emblem |
| Resultado / revanche | result-panel | result-emblem |
| Configurações de áudio | audio-panel | audio-emblem |

Criar/entrar são estados do mesmo menu. Movimento é um seletor inline, não uma tela adicional. Ficha é uma região da seleção; detalhes de golpes pertencem à preparação. Avisos e telas técnicas de desenvolvimento não são menus do jogador. As imagens acima são exclusivas para a contagem; a marca e sprites do catálogo são compartilhados sem contar novamente.

## Recursos

Prompts: `docs/art-prompts/frontend.json`. Fontes raster originais: `docs/art-sources/frontend`. Recursos compactados: `client/public/interface`. Treinadores: `client/public/trainers`, fontes e prompts próprios. Geração pelo imagegen integrado. Sem arte simulada por gradientes CSS.

Todos os nomes da tabela correspondem a arquivos `.webp` em `client/public/interface/`.
O [manifesto da interface](../client/public/interface/manifest.json) declara caminho,
dimensões, bytes e alfa dos 43 arquivos: 24 exclusivos de menu, marca `logo.webp`
e 18 `type-<id>.webp`. O maior arquivo de interface mede 301 KiB.

Cada treinador usa `client/public/trainers/<id>/splash.webp` no painel PvE,
`portrait.webp` no seletor e `motion.webp` na entrada e resultado. Os arquivos
anteriores `art.webp` e `atlas.webp` foram preservados. São 55 WebP de treinador.
O [manifesto dos treinadores](../client/public/trainers/manifest.json) declara alfa,
orçamento e geometria. Splashes/ilustrações têm até 350 KiB; atlas até 150 KiB.

`motion.webp` mede 960×400, com seis colunas (idle, prepare, throw, follow,
celebrate, defeated) e duas linhas de quadros. Célula 160×200, âncora 80/194,
escala única por personagem. Os 132 quadros foram inspecionados; o empacotamento
recorta margens e fragmentos de células vizinhas sem pintar pixels. Os estados
de lançamento de cinco personagens foram reordenados para ir do impulso à soltura.
Prompts: [trainer-motion.json](art-prompts/trainer-motion.json). Fontes PNG:
`docs/art-sources/trainers`. Empacotamento: `scripts/package-frontend.py`.

## Telas e componentes

- `HomePage`: início com três modos, formulários contextuais, convite, seletor de
  treinadores e splash com assinatura. O parágrafo e a lista de três passos antigos
  foram removidos, inclusive sua área de layout.
- `SelectionPage`, `TeamSetupPage` e `TeamEditor`: identidade compartilhada,
  sprites legíveis, ordem instantânea, remoção e anúncio acessível. Em 360 px,
  remover ocupa uma linha própria para preservar o tamanho dos controles.
- `MoveIdentity` e `MoveMenu`: 18 ornamentos raster transparentes por tipo;
  centro discreto e livre para nomes, categoria, poder, precisão, PP e descrição.
- `BattlePage`, `BattleSpot`, `BattleSprite`, `StatusAura`, `BattleControls` e
  `CommandBar`: arena ilustrada, fundo externo com paleta/blur correspondente,
  âncoras e direção dos sprites, golpes e trocas sem sombras de chão.
  Congelamento usa o atlas local `client/public/battle-vfx/frozen.webp`.
- `TrainerArt`, `TrainerSprite`, `EndOverlay`, `AudioSettings` e `MenuArt`:
  recursos locais, estados de resultado, emblemas, cenários e marca. Fallbacks
  mantêm a assinatura local, os textos e os controles quando uma arte falha.

## Entrada PvE e ordem efetiva

`AnimationDirector` aguarda cada etapa: entrada → idle → preparo → arremesso →
reação → saída → aparição dos Pokémon. A fase do palco bloqueia a visibilidade
dos dois Pokémon até `complete`; a limpeza de conclusão/cancelamento também libera
esse bloqueio. O teste de apresentação verifica que nenhuma animação dos Pokémon
começa durante os quatro estados ou a saída. Skip, aba oculta, partida obsoleta
e movimento reduzido usam a mesma limpeza. No nocaute do jogador, o adversário
celebra; no resultado, celebração/derrota segue o vencedor.

A conferência usa a versão instalada e fixada de `@pkmn/sim`: `sim/battle.js`
(`comparePriority`, `speedSort`) e `sim/pokemon.js` (`getActionSpeed`). O servidor
ordena prioridade e velocidade efetiva; o desempate usa seu RNG. Trick Room
inverte a velocidade, preservando a prioridade. Os testes do motor cobrem estágios,
Tailwind e seu fim, ativação/reuso/fim de Trick Room e mudanças de velocidade dentro
da rodada. Não foi encontrada divergência. A interface reproduz a sequência
autoritativa e confirma HP/log após cada evento; chegada dos comandos não define
iniciativa. Não se exibe uma previsão falsa de quem atacará primeiro.

## Validação em 03/10/2026

| Verificação | Resultado |
|---|---|
| Runner completo (`npm test`) | Passou: domínio, contratos v4, rede, terminal, edição, recursos, apresentação, áudio, sprites, modos, bot e motor |
| PvE automático | 99 batalhas completas: 11 treinadores × 3 formatos × 3 dificuldades |
| Motor | 900 atributos, 324 pares de tipos, 360 danos × 16 rolls, 12 replays; prioridade/velocidade/Trick Room; 553 Metronome e 1.564 cenários multi-turno |
| Arte final | Passou: 55 arquivos de treinador, 24 imagens exclusivas de menu, 18 ornamentos, alfa, limites e geometria; teste repetido após o recorte final |
| Builds | Servidor e cliente passaram |
| Lint | Zero erros; dois avisos anteriores de Fast Refresh em providers |
| PvE no navegador | Normal, Véspera, três membros: vitória, PP consumido, HP recebido; revanche manter restaurou HP 143/143 e Moonblast 15/15; editar abriu equipe 0/3 |
| PvP no navegador | Dois clientes em abas: criar/copiar/entrar, formato herdado, confirmações, escolhas privadas, substituições obrigatórias e combate completo; vitória/derrota, expiração da revanche, vaga liberada e encerramento pelo criador |
| Layout | Início, PvE, montagem, preparação, combate, troca, resultado e áudio em desktop/360 px; sem rolagem horizontal; controles de ordem corrigidos |
| Teclado | Golpe acionado por Enter; Escape fechou áudio e devolveu foco às configurações |
| Arte ausente | Splash de Bento temporariamente indisponível: `art.webp` carregou como fallback e Desafiar continuou habilitado. Arquivo restaurado após a conferência |
| Console / diff | Sem erros nas duas sessões de jogo; 404 deliberado apenas no ensaio de fallback. `git diff --check` passou |

Capturas desta refatoração em [screenshots](screenshots/), incluindo
[PvE final com os 11 cartões](screenshots/frontend-pve-final.png),
[PvE desktop](screenshots/frontend-pve-desktop.png), [início 360](screenshots/frontend-home-360.png),
[ordem 360](screenshots/frontend-team-order-360.png), [batalha 360](screenshots/frontend-battle-360.png),
[resultado 360](screenshots/frontend-result-360.png), [áudio 360](screenshots/frontend-audio-360.png)
e [revisão dos 132 quadros](screenshots/trainer-motion-review.jpg).
As verificações completas anteriores de salas/PvP estão em [Modos e treinadores](MODOS_E_TREINADORES.md).
O combate privado desta revisão está em [resultado PvP](screenshots/frontend-private-result.png);
[convite](screenshots/frontend-private-wait.png) e [confirmação](screenshots/frontend-ready.png)
registram seus estados anteriores.

## Limites observados

- Dois clientes foram usados em abas do navegador integrado; não há sessão
  normal/anônima de Opera disponível para conferência visual neste ambiente.
  Os testes de transporte usam conexões independentes.
- Largura de 360 px é uma conferência de viewport. Desempenho/FPS em celular
  físico não foi medido.
- Atlas têm dois quadros por estado. Representam poses distintas e identidade
  individual, com transições coordenadas; não são animações de caminhada.
- Salas em memória não sobrevivem a reinício do servidor. Contas, campanha e
  distribuição entre servidores permanecem fora do escopo aprovado.
- Alterações anteriores e novas permanecem na árvore de trabalho; não houve
  commit, push ou publicação.
