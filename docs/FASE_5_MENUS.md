# Fase 5 — menus e identidade visual

## Entrega

Interface baseada em fichas de treinador: superfícies creme, fundo azul profundo, contornos escuros, cantos arredondados e acentos vermelho/azul. Os tokens existentes continuam como contrato de cores, fontes, espaçamento, raios e camadas; foram adicionados tokens de superfícies, foco, controles e sombras para evitar paletas por componente.

- Início: composição em duas colunas no desktop, título destacado e cartão de treinador; uma coluna em telas menores.
- Seleção: catálogo numerado, cartões de Pokémon, equipe escolhida, busca, sorteio e estados de carregamento, erro e resultados vazios com a mesma linguagem visual.
- Montagem: fichas de Pokémon e golpes, contador, seleção e ações com a mesma tipografia e paleta.
- Batalha: HUD, golpes, equipe, indicador de escolha, comandos, log e resultado usam os tokens compartilhados.
- Fontes Press Start 2P e VT323 continuam empacotadas localmente. A fonte de título fica reservada aos títulos; os antigos rótulos de 6–8 px foram substituídos por texto de interface de 18–26 px na maioria dos controles e dados.
- Ícones SVG originais locais, sem requisições externas, representam ações de sorteio. Tipos usam faixas coloridas e fundos claros, mantendo texto escuro.
- Botões, entradas e controles acionáveis têm altura mínima de 44 px. O foco usa um contorno de 3 px visível, com variante azul em superfícies claras.
- Layouts de seleção e montagem têm grades responsivas; a batalha mantém os dois golpes por linha a 360 px para limitar a altura do painel.
- Rotas, handlers e identificadores existentes foram preservados. A fila anuncia seu estado; carregamento e resultado vazio têm semântica de status; o nome é obrigatório e conectado à dica.

## Contraste

As seguintes combinações de tokens foram calculadas pela luminância relativa sRGB. Todas superam 4,5:1 para texto normal.

| Texto / fundo                     | Razão   |
| --------------------------------- | ------- |
| Texto principal / creme           | 11,64:1 |
| Texto secundário / creme          | 6,19:1  |
| Texto secundário / creme inferior | 5,33:1  |
| Texto claro / azul profundo       | 14,49:1 |
| Texto discreto / painel azul      | 7,04:1  |
| Branco / vermelho primário        | 5,09:1  |
| Branco / verde de ação            | 7,46:1  |
| Branco / azul de ação             | 6,43:1  |
| Branco / etiqueta de queimadura   | 6,80:1  |
| Branco / etiqueta de veneno       | 7,69:1  |
| Texto escuro / amarelo de status  | 7,53:1  |

Os estados desabilitados são atenuados visualmente e continuam desabilitados semanticamente. As cores de tipo são decorativas; o nome do tipo permanece escrito.

## Acessibilidade e validação

Áudio, avisos e resultado recebem escopo de foco e controles de fechamento na entrega paralela de acessibilidade. Os diálogos usam a camada superior nativa do navegador para foco, navegação por Tab e fundo inerte.

As evidências antes/depois estão em `docs/evidence/phases-5-7`: início, seleção, montagem e batalha; as capturas móveis finais cobrem início, seleção e montagem. A versão anterior foi mantida em uma aba enquanto a nova foi percorrida em outra.

| Evidência | O que foi observado |
| --- | --- |
| `home-after.jpg`, `home-360.jpg` | Início em desktop e 360 px, com formulário e controles visíveis. |
| `selection-after.jpg`, `selection-360.jpg`, `selection-empty.jpg` | Catálogo, equipe sorteada pelo servidor e resultado vazio da busca. |
| `team-after.jpg`, `team-360.jpg` | Montagem e confirmação de equipe em desktop e 360 px. |
| `battle-after.jpg` | Partida real e menu de troca após uma rodada resolvida por dois clientes. |
| `battle-current-717.png`, `battle-real-after-switch.png` | Versão final em partida navegador/terminal, com a troca resolvida. Captura a 717 px; não deve ser apresentada como evidência de 360 px. |
| `audio-dialog-after.jpg` | Diálogo de áudio com controles legíveis; teclado e retorno de foco retestados no build atualizado. |
| `result-after.png` | Resultado da fixture no laboratório após a conclusão da apresentação; não representa uma nova partida ao vivo. |
| `result-real-after.png` | Resultado por desconexão após ataque e troca na partida navegador/terminal. |

Verificações executadas nesta entrega:

- Build normal e build `profile` do cliente passaram. O build de perfil inclui a instrumentação e a fixture, com aviso de chunk acima de 500 KB; a versão distribuída foi reconstruída no modo normal pela integração.
- Lint passou sem erros; os dois avisos de Fast Refresh existentes continuam em `BattleProvider` e `ToastProvider`.
- Em viewport de 360 px, início, seleção, montagem e batalha não tiveram largura rolável superior à largura do documento. Todos os botões inspecionados nessas telas mediram pelo menos 44 px de altura.
- Busca sem resultados, sorteio de equipe no servidor, confirmação e uma rodada real entre dois clientes foram percorridos. A escolha de troca também foi enviada e bloqueou novas escolhas enquanto aguardava o adversário.
- O indicador de escolha inicialmente sobrepunha a etiqueta de tipo do HUD próprio a 360 px; seu encaixe foi corrigido para o espaço central entre os HUDs e a altura mínima do campo móvel foi ampliada.
- O diálogo de áudio foi retestado após o reforço de foco: Shift+Tab do primeiro controle chega ao último; Tab do último volta ao primeiro; Escape e fechamento por clique devolvem o foco à engrenagem.

A integração percorreu ataque, troca resolvida, desconexão e retorno ao lobby com navegador e terminal. Nocaute/troca forçada e resultado foram percorridos também no laboratório; o encerramento natural completo permanece coberto pela integração automatizada de rede.

A inspeção inicial da batalha a 360 px identificou e motivou o ajuste do indicador. A renovação final dessa captura ficou **[VERIFICAR]**: o navegador do agente de interface ficou indisponível, e o controle de viewport da sessão restante não aplicou 360 px (DOM medido em 717 px). Isso não afeta as capturas finais dos demais menus a 360 px. Não há alegação de FPS em celular real.
