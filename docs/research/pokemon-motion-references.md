# Pesquisa de movimento, combate e composição Pokémon

Data: **3 de outubro de 2026**. Pesquisa realizada antes da reformulação visual solicitada pelo usuário.

## Escopo e método

Foram consultadas páginas oficiais de Pokémon, o site dos próprios desenvolvedores de Insurgence e arquivos originais de Pokémon Showdown e Pokémon Essentials. A pesquisa identifica a gramática visual e o funcionamento dos animadores; não importa imagens, áudio, sprites ou código desses projetos. As propostas de duração e amplitude abaixo são decisões artísticas para este jogo, não medições de frames de jogos oficiais.

O material do Showdown é especialmente útil porque implementa uma batalha de sprites no navegador. Essentials fornece outra referência prática: comandos, coordenadas dos combatentes, animação de troca, vida e nocaute são processos separados. As fontes oficiais ajudam a distinguir a personalidade de um Pokémon e a forma de executar um golpe; apenas colorir o mesmo efeito para todos os movimentos perde essas diferenças.

## Fontes primárias consultadas

| Nº | Fonte aberta | Evidência consultada | Consequência para o projeto |
|---|---|---|---|
| 1 | [Showdown — animador da cena](https://github.com/smogon/pokemon-showdown-client/blob/master/play.pokemonshowdown.com/src/battle-animations.ts) | `runMoveAnim`, `runStatusAnim`, `runResidualAnim`, `runPrepareAnim`, `finishAnimations`, `stopAnimation`, `PokemonSprite.animFaint`; código original lido na versão raw | Separar preparação, ataque e reação; aguardar conclusão real; cancelar e restaurar a cena |
| 2 | [Showdown — catálogo de animações de golpes](https://github.com/smogon/pokemon-showdown-client/blob/master/play.pokemonshowdown.com/src/battle-animations-moves.ts) | Entradas próprias, trajetórias atacante/alvo e aliases, como Tackle/Slam, Ember/Flamethrower, Waterfall/Aqua Jet e Sleep Powder/Spore | Resolver movimentos por família com exceções explícitas; evitar apenas um efeito genérico por tipo |
| 3 | [Essentials — reprodução das animações](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/011_Battle/004_Scene/004_Scene_PlayAnimations.rb) | `pbFindMoveAnimation`, `pbAnimationCore`, `pbSendOutBattlers`, `pbRecall`, `pbHitAndHPLossAnimation`, `pbFaintBattler` | Usar âncoras reais dos sprites; restaurar posições; HP e nocaute precisam acompanhar os eventos |
| 4 | [Essentials — animações de cena](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/011_Battle/004_Scene/008_Battle_Scene_Animations.rb) | `BattlerRecall`, `BattlerDamage`, `BattlerFaint`, `PokeballTrainerSendOut` | Sombra, corpo, vida e efeitos têm ritmos próprios; recall é diferente de cair por nocaute |
| 5 | [Essentials — menus de batalha](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/011_Battle/004_Scene/005_Battle_Scene_Menus.rb) | `CommandMenu`, `FightMenu`, PP, tipo e destaque do golpe selecionado | Menu 2×2 e ficha de golpe; PP esgotado precisa ser visível e ter texto, além de cor |
| 6 | [Essentials — repositório do autor](https://github.com/Maruno17/pokemon-essentials) | Descrição do projeto e organização dos scripts; Graphics e Audio não vêm nesse repositório | Referência de arquitetura de fangame sem pressupor que seus recursos estejam disponíveis ou licenciados para importação |
| 7 | [Pokémon Let's Go — mundo e companheiro](https://pokemonletsgo.pokemon.com/en-us/story/) | Golpes exclusivos, interações e apoio do parceiro; páginas com imagens oficiais de combate | Ataque, aplicação de status, cura e aumento de atributo são acontecimentos visualmente distintos |
| 8 | [Pokémon Let's Go — controles](https://pokemonletsgo.pokemon.com/en-us/how-to-play/) | Apresentação oficial dos modos de controle e jogo | A interface deve funcionar com seleção explícita e toque, mantendo instruções simples |
| 9 | [Scarlet/Violet — descrições oficiais de Pokémon](https://www.pokemon.co.jp/ex/sv/ja/pokemon/221014_01/) | Descrições de ataque, postura e comportamento; Quaquaval dança, Miraidon flutua, Koraidon salta, Bellibolt estica o corpo | Definir perfis de movimento por espécie/corpo, sem atribuir a todos o mesmo salto |
| 10 | [Scarlet/Violet DLC — Upper Hand e Psychic Noise](https://www.pokemon.co.jp/ex/sv_dlc/ja/features/230813_03/) | Distinção oficial entre golpe físico de palma e ataque de ondas sonoras, acompanhados de imagens | Diferenciar contato, onda e projétil; não confundir categoria especial com viagem de uma bola |
| 11 | [Pokémon Insurgence — site dos desenvolvedores](https://p-insurgence.com/) | Recursos do fangame, espécies Delta, imagens próprias e equipe artística | Um fangame pode ter identidade própria e coerente; referências não precisam virar cópias da arte oficial |
| 12 | [Black 2/White 2 — site oficial japonês](https://www.pokemon.co.jp/ex/b2w2/) | Página oficial aberta, com navegação para mundo e sistemas do jogo | Referência histórica de apresentação; não foram medidos loops de sprites nem tempos de golpes a partir dessa página |

Fontes técnicas auxiliares: [GSAP Timeline](https://gsap.com/docs/v3/GSAP/Timeline/), [WAAPI `Animation.finished`](https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished) e [normalização Unicode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize).

### Fontes com acesso incompleto

[Reborn — Field Effects](https://www.rebornevo.com/pr/fields/) apareceu nos resultados da busca do próprio domínio, porém a abertura retornou 403/erro. Sua galeria e seus efeitos não foram inspecionados diretamente. A página inglesa de Scarlet/Violet e uma página arquivada de Black/White não forneceram conteúdo utilizável. Nenhuma conclusão detalhada sobre movimento ou frames deriva dessas páginas. O resumo principal se apoia nas doze fontes acima.

## Achados extraídos dos animadores

### Showdown: sequência e reação

O animador mantém controles de interrupção, espera pelas animações ativas e oferece caminhos distintos para ataque, preparação, status e residual. O posicionamento considera profundidade e escala. Status têm desenhos próprios: queimadura usa fogo, veneno usa efeitos púrpura, sono tem efeitos suaves e paralisia combina energia com pequenos deslocamentos do combatente. O nocaute tem movimento e desaparecimento próprios. O fallback por ausência de golpe não impede a apresentação da batalha. Essas observações vêm do [animador original](https://github.com/smogon/pokemon-showdown-client/blob/master/play.pokemonshowdown.com/src/battle-animations.ts).

O catálogo reúne movimentos com trajetórias próprias e reaproveita famílias através de aliases. A fonte distingue movimentos de aproximação, rajadas, ondas, bolas de energia, pós e efeitos que surgem no alvo. Esta classificação artística é mais útil que decidir tudo apenas por tipo ou pela categoria Physical/Special. Referência: [catálogo de golpes](https://github.com/smogon/pokemon-showdown-client/blob/master/play.pokemonshowdown.com/src/battle-animations-moves.ts).

### Essentials: âncoras e restauração

Essentials busca a animação específica e depois fallbacks por tipo, categoria e alvo. A reprodução adapta a linha de ação aos centros atuais dos sprites e restaura as posições ao terminar. Trocas, HP, nocaute e habilidades possuem processos distintos, com descarte dos recursos usados. Referência: [reprodução das animações](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/011_Battle/004_Scene/004_Scene_PlayAnimations.rb).

Recall absorve o Pokémon e remove sua sombra. Nocaute usa descida, desaparecimento e recorte do sprite. A implementação de dano contém flashes, mas essa frequência não é uma recomendação para o projeto: manteremos o limite global de flashes já definido. Referência: [animações de cena](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/011_Battle/004_Scene/008_Battle_Scene_Animations.rb).

## Diagnóstico da apresentação atual

Inspeção local anterior à edição:

- `BattleSprite` renderiza uma imagem por Pokémon, com loop genérico de deslocamento vertical. Um sprite estático não se transforma em animação desenhada apenas por esse loop.
- O código atual separa os atlas de efeitos do corpo do Pokémon. Um efeito de fogo sobreposto não garante que o corpo pareça preparar, lançar e recuperar um ataque.
- `projectileMove` usa a categoria Special como critério único. Ondas, feixes, chuva, pó e golpes que surgem no alvo também podem ser Special.
- `attackClip` reduz vários tipos a `impact`; os mesmos oito quadros atendem a muitas identidades diferentes.
- A distância fixa de 28 px da investida não considera a distância e a diagonal entre os combatentes.

Estas são limitações observadas por leitura dos arquivos locais, sem concluir que sejam a única causa de recursos invisíveis em produção. Falha de URL local, empacotamento, eventos ou sobreposição deve ser diagnosticada em execução separadamente.

## Direção proposta: sprites vivos e palco legível

As escolhas desta seção são **propostas originais**, informadas pelas referências; não reproduzem tempos oficiais nem prometem articulação desenhada de membros que os arquivos locais não possuem.

### Hierarquia de camadas

1. Pintura da arena: céu/fundo, horizonte, piso e detalhes de borda.
2. Sombra/ancoragem no chão, independente da animação do corpo.
3. Corpo de cada Pokémon em sua diagonal; orientação/espelhamento fica em um elemento separado.
4. Movimento ambiente/idle, independente da transformação de ação.
5. Efeitos localizados e trajetórias entre combatentes; nunca atrás do fundo por acidente.
6. HUD e mensagens em planos próprios, sem encobrir o corpo durante o impacto.

O adversário fica mais alto e à direita; o jogador, mais baixo e à esquerda. A sombra reforça a profundidade e mantém a sensação de chão quando um sprite sobe. A escala aparente deve favorecer a leitura da silhueta em vez de proporções literais que tornem Pokémon pequenos invisíveis.

### Perfis de idle

| Perfil | Corpo | Sombra | Uso proposto |
|---|---|---|---|
| Leve | Respiração de 1–2% e deslocamento de 1–3 px | Quase estática | Pokémon pequenos e leves |
| Pesado | Respiração lenta e menor deslocamento | Larga, estável | Pokémon volumosos; sem saltar como se fossem leves |
| Flutuante | Oscilação vertical de 3–7 px | Escala varia pouco, centrada no chão | Espécies com postura de flutuação |
| Voador | Oscilação pequena com inclinação discreta | Separada do corpo | Espécies aladas em postura aérea |
| Rasteiro | Movimento horizontal mínimo e base baixa | Achatada | Serpentes e corpos próximos do chão |

Selecionar o perfil pelo registro local de espécies com fallback leve. Tipo Flying não determina sozinho que a pose é aérea. Nenhum loop ambiente altera seed, decisões ou regras do servidor. Se houver sprites animados locais autênticos, preferi-los e reduzir a transformação genérica para não produzir movimentos redundantes.

### Estado corporal e status

| Estado | Presença contínua | Evento de aplicação/ativação |
|---|---|---|
| Sono | Respiração mais lenta, pose relaxada, símbolo discreto acima da cabeça | Bolhas/pequenos Z desenhados; pausa curta da ação; ao acordar, pequeno levantamento |
| Queimadura | Brasas raras na borda do corpo; ícone e nome legíveis no HUD | Fogo localizado e contração curta; residual distinto de receber um golpe de fogo |
| Veneno/Tóxico | Bolhas púrpura discretas; corpo oscila levemente | Pequena reação de mal-estar; residual tem pulso próprio; Tóxico pode ser mais intenso sem simular dano extra |
| Paralisia | Postura quase imóvel e faíscas espaçadas | Tremor breve e pequeno; se impedir a ação, reação visual específica |
| Congelamento | Casca/fragmentos de gelo sobrepostos sem ocultar a silhueta | Corpo interrompe o idle; descongelar dissolve fragmentos |
| Confusão | Estrelas/orbitais acima da cabeça | Inclinação curta; self-hit distingue o alvo do próprio atacante |
| Buff | Não manter brilho infinito para cada estágio | Setas/energia subindo e número/atributo no HUD |
| Debuff | Não pintar o Pokémon inteiro de vermelho permanentemente | Setas/energia descendo, corpo encolhe discretamente e número/atributo no HUD |
| Proteção | Só persistir enquanto o estado for válido | Escudo surge à frente; golpe bloqueado termina na borda do escudo |

Persistência depende do **estado apresentado**, não do snapshot mais recente antes de terminar a fila. Ícones e texto asseguram que cor e movimento não sejam a única informação. Preferência por movimento reduzido remove idles e deslocamentos fortes, mantendo resultados e sinais estáticos.

## Famílias de golpes e linguagem visual

| Família | Exemplos ilustrativos | Preparação | Viagem/contato | Impacto e recuperação |
|---|---|---|---|---|
| Investida | Tackle, Quick Attack, Body Slam | Comprimir/recuar o corpo | Avançar pela diagonal em direção ao alvo, com intensidade própria | Alvo recua; atacante volta à âncora sem deslizar infinitamente |
| Corte/garra | Slash, Dragon Claw, Leaf Blade | Giro curto da silhueta | Arco desenhado junto do alvo, orientado pelo atacante | Duas ou três marcas legíveis, sem cobrir ambos os HUDs |
| Soco/chute | Mach Punch, Close Combat | Inclinação e pequeno levantamento | Movimento curto repetido; preferir pistas desenhadas de contato | Cada hit tem leitura própria; retorno após o último hit recebido |
| Projétil | Shadow Ball, Energy Ball, Bullet Seed | Energia acumula junto do corpo | Orb/semente percorre linha ou arco entre âncoras | Explosão localizada; número de hits vem dos eventos |
| Feixe/jato | Ice Beam, Flamethrower, Hydro Pump | Corpo prepara e estabiliza | Faixa alongada/jato entre origem e alvo | Brilho fragmentado no alvo e dissipação gradual |
| Onda/pulso | Psychic Noise, Dark Pulse, Hyper Voice | Corpo pulsa ou assume postura de emissão | Anéis/ondas avançam em vez de uma bola genérica | Reação curta e dissolução da onda |
| Chão/área | Earthquake, Surf, Rock Slide | Arena recebe prenúncio discreto | Piso, ondas ou detritos passam pela região de combate | Tremor moderado; camada de fundo separada do HUD |
| Pó/esporos | Sleep Powder, Spore, Poison Powder | Pequena dispersão no atacante | Grãos atravessam a diagonal | Efeito de status começa somente quando confirmado |
| Sucção/dreno | Giga Drain, Drain Punch | Família de golpe correspondente | Partículas retornam do alvo ao usuário após dano | Cura depois do dano efetivo confirmado |
| Autocuidado | Rest, Recover, Calm Mind | Corpo relaxa ou concentra | Efeito junto do próprio Pokémon | Cura/buff/sono seguem seus próprios eventos |

O registro pode oferecer animação específica, família, variante do elemento e fallback. Identificadores canônicos continuam sendo os do catálogo; rótulos traduzidos pertencem à apresentação. Um golpe desconhecido nunca vira URL externa. Golpes charge/recharge não repetem o impacto no turno de preparação. Imunidade, erro, proteção e falha não devem tocar a mesma reação de dano.

### Ritmo sugerido para este projeto

| Momento | Faixa inicial proposta | Objetivo |
|---|---|---|
| Antecipação | 100–180 ms | Tornar clara a origem do ataque |
| Investida/projétil | 180–360 ms | Mostrar a trajetória e o alvo |
| Impacto | 60–90 ms de hit-stop apenas nos hits apropriados | Dar peso sem paralisar toda a interface |
| Recuperação | 160–260 ms | Retornar ao estado estável |
| Aplicação de status/buff | 450–700 ms | Tempo para identificar o sinal e o texto |
| Recall | 240–380 ms | Absorver o combatente antigo antes da substituição |
| Entrada | 350–550 ms | Aparição, expansão e acomodação no chão |
| Nocaute | 450–650 ms | Descida/desaparecimento após HP chegar ao valor final do evento |

Tempos são parâmetros próprios de design. Multi-hit mantém intervalos menores por hit e espera o último evento; não usa uma suposição de cinco impactos para qualquer ataque. A duração total não deve ser o único mecanismo de sincronização: GSAP expõe conclusão de timelines, e WAAPI possui uma promessa de conclusão. Referências técnicas: [GSAP](https://gsap.com/docs/v3/GSAP/Timeline/) e [WAAPI](https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished).

## Arenas: atmosfera com área de ação preservada

Proposta de composição original para as seis arenas existentes:

| Arena | Identidade | Movimento ambiente discreto | Área livre para combate |
|---|---|---|---|
| Floresta | Copa nas bordas, profundidade por árvores, luz quente | Folhas raras e pequenos pontos de luz | Clareira central com piso de grama/terra |
| Estádio | Arquibancadas ao fundo, iluminação lateral, piso de competição | Faixas/bandeiras e luzes muito lentas | Centro limpo, marcas de piso sem texto grande |
| Caverna | Rochas por planos, pontos de cristal, luz fria | Poeira espaçada ou brilhos de cristal | Plataforma de pedra com silhuetas contrastantes |
| Praia | Horizonte claro, mar ao fundo, areia no primeiro plano | Ondas lentas; não deslocar todo o fundo | Faixa seca de areia sem água cobrindo o sprite |
| Espaço | Estrelas pequenas, planeta fora das âncoras, plataforma física | Brilhos esparsos e nebulosa estática | Plataforma legível que justifica chão e sombra |
| Cidade noturna | Arquitetura ao longe, neon controlado, piso urbano | Reflexos e luzes lentas | Praça/pátio com contraste suficiente para sprites escuros |

Usar a mesma perspectiva e âncoras em todas as arenas, mudando a ambientação. A imagem principal não contém HUD, textos ou Pokémon. Elementos de borda não cobrem as duas âncoras. Atmosfera é apresentação: clima/terreno visual não altera regras, tipos, poder ou capacidades excluídas do motor.

Em telas estreitas, aceitar mais altura para preservar HUDs e palco. A imagem deve ter corte seguro: centros de combate permanecem dentro da área útil, independentemente do recorte do horizonte. Registrar todas as arenas na rota normal e nos dados da sala; uma galeria de laboratório não comprova que apareçam durante uma partida real.

## Menus e português com acentos

O menu Essentials apresenta quatro comandos e quatro golpes em duas colunas, com tipo e PP destacados para a seleção atual. É uma referência de hierarquia, não uma exigência de copiar cada detalhe de pixel. Referência: [menus originais](https://github.com/Maruno17/pokemon-essentials/blob/master/Data/Scripts/011_Battle/004_Scene/005_Battle_Scene_Menus.rb).

Propostas próprias para a interface web:

- Manter os botões reais do navegador, com foco visível e alvo de toque confortável.
- Preservar instrução de ação em uma caixa de texto curta; histórico pode ter espaço separado.
- Usar nome de golpe legível e tipo/PP como informação secundária, com destaque por cor e formato.
- Limitar a tipografia mais decorativa a títulos curtos; instruções, nomes longos e números precisam de fonte local legível.
- Verificar os glifos `á à â ã é ê í ó ô õ ú ü ç É Ê Ó Ç`, pontuação, símbolo de gênero e travessão. Ter arquivos UTF-8 e texto original preservado.
- Tratar `é` composto e `e` com acento combinante como variantes Unicode equivalentes em pesquisa/comparação. A normalização pode servir para comparação; não remover os acentos do nome apresentado. Referência: [normalização Unicode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize).
- Busca pode ser tolerante a acentos enquanto o rótulo permanece correto. Não alterar IDs de golpe/species enviados ao servidor ao traduzir rótulos.
- Não aplicar altura fixa que corte acentos ascendentes ou descendentes. Nomes de jogadores e golpes longos quebram linha ou recebem tratamento previsível.

## Critérios visuais para a implementação

- Cada arena aparece em uma batalha normal com registro local válido, não apenas na galeria.
- Ataque de contato mostra antecipação, aproximação, impacto e retorno.
- Projétil percorre de fato a diagonal entre os combatentes; onda/feixe têm forma própria.
- Sono, queimadura, veneno, paralisia, confusão, buff, debuff e proteção possuem sinais distintos.
- Troca não troca o arquivo do Pokémon antes de terminar o recall; nocaute não é antecipado pelo snapshot de HP.
- Efeitos recebidos durante uma animação continuam na fila, sem sobreposição de atores por acidente.
- Skip, aba oculta e saída cancelam loops, canvas, timelines e partículas; o estado apresentado termina consistente.
- Fontes e nomes com acentos são vistos no jogo em largura de 360 px e no desktop.
- Documentar screenshots de cada arena, ataque e status junto da evidência de execução. Screenshot de um quadro não prova movimento: combinar captura dos quadros relevantes com observação da sequência e verificações do diretor.

## Decisão para a reformulação

Reutilizar o protocolo e o diretor existentes, corrigindo a ligação da cena e os recursos invisíveis em execução. Evoluir a arte por famílias de golpes, adicionar perfis corporais e trabalhar arenas com uma composição comum. GSAP/WAAPI cuidam da transformação; atlas e canvas cuidam da arte desenhada dos efeitos. React confirma acontecimentos, sem renderizar estado por frame. O resultado deve ser identificado como animação de um sprite estático ou como sprite de múltiplos quadros conforme o recurso realmente disponível.
