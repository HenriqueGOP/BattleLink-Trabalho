# Fase 5 — menus e identidade visual

## Atualização de frontend — 2026-10-03

A reformulação **Battle Link** substitui a paleta creme e a tipografia anteriores por branco gelo/azul profundo, acentos vermelho/mint e fontes locais Oxanium/Nunito Sans. Início, catálogo, montagem e batalha foram redesenhados. Evidências e limites desta entrega ficam em [Frontend Refresh](FRONTEND_REFRESH.md).

O conteúdo abaixo preserva o histórico da fase 5: suas capturas, medidas e contrastes correspondem à interface anterior. A validação atual usa dois terminais, com `npm run dev` em `server/` e em `client/`, e **http://localhost:5173/** em janelas normal e anônima. Resultados novos são registrados no relatório da reformulação quando verificados; FPS e memória em aparelho real continuam **[VERIFICAR]**.

## Registro histórico da fase 5

Última validação integrada: **2026-10-03**. A pendência da captura final da batalha a 360 px foi encerrada.

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

As evidências antes/depois estão em `docs/evidence/phases-5-7`: início, seleção, montagem e batalha; as capturas móveis finais cobrem início, seleção, montagem, batalha e resultado. A versão anterior foi mantida em uma aba enquanto a nova foi percorrida em outra na entrega inicial.

| Evidência | O que foi observado |
| --- | --- |
| `home-after.jpg`, `home-360.jpg` | Início em desktop e 360 px, com formulário e controles visíveis. |
| `selection-after.jpg`, `selection-360.jpg`, `selection-empty.jpg` | Catálogo, equipe sorteada pelo servidor e resultado vazio da busca. |
| `team-after.jpg`, `team-360.jpg` | Montagem e confirmação de equipe em desktop e 360 px. |
| `battle-after.jpg` | Partida real e menu de troca após uma rodada resolvida por dois clientes. |
| `battle-360-dense-before.png`, `battle-360-dense-after.png`, `battle-360-measurements.json` | Comparação e medidas finais a 360 × 800 px: HUD com dois tipos, TOX e sete modificadores; sem interseção dos HUDs ou do indicador. |
| `battle-360-after-switch.png` | Troca voluntária para Thundurus concluída com 154/154 HP em 360 px. |
| `battle-desktop-followup.png` | Versão final em desktop de 1280 px, com conteúdo de 1270 px sem rolagem horizontal. |
| `audio-dialog-after.jpg` | Diálogo de áudio com controles legíveis; teclado e retorno de foco retestados no build atualizado. |
| `result-after.png` | Resultado da fixture no laboratório após a conclusão da apresentação; não representa uma nova partida ao vivo. |
| `result-real-after.png` | Resultado por desconexão após ataque e troca na partida navegador/terminal. |
| `result-360-followup.png` | Vitória por desconexão em 360 px, modal sem rolagem horizontal e navegação por teclado. |

Verificações executadas nesta entrega:

- Build normal e build `profile` do cliente passaram. O build de perfil inclui a instrumentação e a fixture, com aviso de chunk acima de 500 KB; a versão distribuída foi reconstruída no modo normal pela integração.
- Lint passou sem erros; os dois avisos de Fast Refresh existentes continuam em `BattleProvider` e `ToastProvider`.
- A suíte completa (`npm test`) passou novamente em 2026-10-03, incluindo os 1.564 cenários/turnos da fase 2B e os 12 replays. O build normal final passou, com 443,98 KB de JS principal e 78,01 KB de CSS.
- Em viewport de 360 px, início, seleção, montagem e batalha não tiveram largura rolável superior à largura do documento. Todos os botões inspecionados nessas telas mediram pelo menos 44 px de altura.
- Busca sem resultados, sorteio de equipe no servidor, confirmação e uma rodada real entre dois clientes foram percorridos. A escolha de troca também foi enviada e bloqueou novas escolhas enquanto aguardava o adversário.
- O campo passou a usar uma grade que incorpora a altura dos HUDs; o indicador de escolha fica em linha própria fora do campo. Em 360 × 800 px, `innerWidth` foi 360 e `clientWidth = scrollWidth = 350` devido à scrollbar. Com Normal/Grass, TOX e todos os sete modificadores no HUD próprio, o campo cresceu de 360 para 442 px, o HUD próprio mediu 254 px e o adversário 148 px. Nenhum HUD cruzou o outro ou o indicador. O nome adversário `ABCDEFGHIJKLMNOPQRSTUVWX` tinha 24 caracteres.
- No fluxo final, Enter abriu/fechou a equipe, abriu golpes e escolheu Cosmic Power; os controles ficaram desabilitados enquanto a escolha estava pendente. Após nocaute por dano tóxico de 130 a zero, a troca forçada colocou Heatmor com 160/160. A troca voluntária seguinte colocou Thundurus com 154/154.
- Os seis botões de equipe mediram 96 px de altura; controles principais, 44 px; golpes, 97 px. No resultado por desconexão, o modal teve 350 px de conteúdo sem rolagem horizontal e botão de 66,59 px. Tab/Shift+Tab mantiveram foco no botão; Escape voltou ao lobby e focou o campo de nome.
- O diálogo de áudio foi retestado após o reforço de foco: Shift+Tab do primeiro controle chega ao último; Tab do último volta ao primeiro; Escape e fechamento por clique devolvem o foco à engrenagem.

A integração anterior percorreu ataque, troca resolvida, desconexão e retorno ao lobby com navegador e terminal. O reteste em duas abas acrescentou nocaute por dano tóxico e troca forçada pelo teclado em 360 px. O laboratório também cobriu nocaute/troca forçada e resultado; o encerramento natural completo permanece coberto pela integração automatizada de rede.

Os rótulos dos cards de reviver e a quebra de palavras longas no título/descrição de resultado foram corrigidos e revisados no código. Revival e derrota com nome contínuo de 24 caracteres não foram exercitados ao vivo; o nome longo foi observado no HUD adversário. A validação fecha o caso específico da composição móvel e do percurso por teclado, sem representar certificação completa de acessibilidade. **60 FPS e memória em celular intermediário real permanecem [VERIFICAR].**
