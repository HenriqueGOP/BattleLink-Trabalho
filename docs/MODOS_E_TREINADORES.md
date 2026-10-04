# Salas, revanche, formatos e treinadores

Entrega de 2026-10-03. A árvore de trabalho preserva as correções anteriores de
seleção, golpes, sprites e arenas. As novas alterações estão organizadas nos
contratos de formatos/treinadores, RoomManager, Room, aplicação, bot, menu e
recursos descritos abaixo. Não foi criado commit ou enviada publicação nesta entrega.

## Como jogar

Inicie `npm run dev` dentro de `server/` e, em outro terminal, dentro de
`client/`. Abra http://localhost:5173/. Para dois jogadores, use uma janela normal
e outra anônima/privativa. O roteiro completo está em [Como jogar](COMO_JOGAR.md).

- **Partida rápida:** escolha formato e entre na fila. Cada formato possui sua
  própria fila; Monotipo também separa o tipo escolhido.
- **Jogar com amigos:** crie um convite, copie o código e peça ao outro jogador
  que use Tenho um código. O convidado herda o formato do criador.
- **Desafios PvE:** escolha qualquer treinador, formato e dificuldade. Não há
  desbloqueios. O Monotipo segue o tipo central do treinador.
- **Revanche:** após nocaute final ou empate, ambos aceitam em até 30 segundos.
  Cada pessoa pode manter ou editar a própria equipe. No PvE basta o jogador aceitar.
  Manter preserva espécies, ordem, golpes e shiny; restaura HP, PP, status e estágios.

| Formato | Integrantes | Regra de seleção |
|---|---:|---|
| Clássico | 6 | Equipe livre |
| Duelo rápido | 3 | Equipe livre |
| Monotipo | 6 | Todos possuem o tipo escolhido; tipos duplos são aceitos |

## Organização e ciclo de vida

- `server/src/contracts/formats.ts` e `trainers.ts` publicam descritores tipados.
  `pokemon-battle/4` atualiza navegador, terminal e transportes juntos.
- `join` identifica a conexão no lobby. Admissões têm commandId e um histórico
  limitado de recibos; retransmissão não recria sala nem reinicia o adversário.
- `RoomManager` controla fila por formato/tipo, convites e associação dos participantes.
  roomId identifica a sala; matchId identifica uma preparação/partida específica.
- Toda edição, prontidão, ação e revanche enviada pela rede precisa do matchId atual.
  Solicitações antigas são rejeitadas. Cada revanche instancia uma Room/BattleSession
  nova, com novas solicitações, RNG e eventos; a sala privada conserva seu código.
- A escolha de golpes continua privada. Recursos são resolvidos por IDs locais;
  descritores não expõem equipes internas, decisões ou seeds do bot.
- Convites têm oito caracteres aleatórios sem caracteres visualmente ambíguos.
  Criação é limitada a três por minuto e entrada a dez por minuto, por conexão/IP.
  Inatividade de 15 minutos expira convites durante espera, montagem ou após resultado;
  combate/preparação de recursos em andamento não são interrompidos por esse prazo.
- Saída do convidado libera a vaga. Saída do criador encerra o convite. Desconexão
  durante combate causa desistência; reentrada começa uma nova montagem.
- Timers de bot, preparação e revanche são cancelados ao substituir/remover a sala.
  A manutenção periódica remove convites e contadores vencidos.

### Decisões do bot

O servidor usa solicitações e ações legais do mesmo motor do jogador. Nível 50,
IVs 31, EVs 0, natureza neutra e exclusões atuais são preservados; Showdown Gen 9
continua sendo a autoridade das regras e do dano real.

- Fácil escolhe golpes legais com RNG próprio e atende trocas obrigatórias.
- Normal estima dano, STAB, efetividade, precisão, recuperação e status.
- Difícil acrescenta avaliação de trocas e ameaças dos golpes adversários revelados.
- As três dificuldades usam as mesmas equipes/atributos. O bot recebe sua própria
  visão e eventos públicos, sem a escolha pendente do jogador.
- A avaliação tem orçamento determinístico de 96 operações; falha da política usa
  uma escolha legal. RNG da decisão não consome RNG do combate. Timer de decisão
  confere sala/solicitação atuais antes de atuar.

## Personagens e equipes

No Duelo rápido, usa-se o núcleo. No Clássico, núcleo + complementos mistos.
No Monotipo, núcleo + complementos temáticos. A primeira espécie é a assinatura.

| Treinador | Tipo | Núcleo | Complementos mistos | Complementos temáticos |
|---|---|---|---|---|
| Véspera | Sombrio | Spiritomb, Umbreon, Grimmsnarl | Chandelure, Corviknight, Mimikyu | Houndoom, Weavile, Zoroark |
| Maré | Água | Milotic, Lapras, Lanturn | Gardevoir, Roserade, Altaria | Starmie, Gastrodon, Pelipper |
| Téo Volt | Elétrico | Ampharos, Magnezone, Rotom | Porygon-Z, Klinklang, Noivern | Luxray, Galvantula, Electivire |
| Brasa | Fogo | Blaziken, Arcanine, Talonflame | Lucario, Hitmontop, Krookodile | Chandelure, Torkoal, Magmortar |
| Nina Eco | Fantasma | Mimikyu, Gengar, Drifblim | Wigglytuff, Espeon, Meowstic | Chandelure, Banette, Dusknoir |
| Flora | Planta | Leavanny, Roserade, Tsareena | Ribombee, Flygon, Ampharos | Breloom, Tangrowth, Decidueye |
| Nival | Gelo | Frosmoth, Glaceon, Cryogonal | Reuniclus, Bronzong, Kingdra | Mamoswine, Weavile, Walrein |
| Rixa | Veneno | Toxicroak, Toxtricity, Crobat | Scrafty, Obstagoon, Bisharp | Roserade, Drapion, Tentacruel |
| Aren Cume | Pedra | Lycanroc, Gigalith, Rhyperior | Excadrill, Braviary, Lucario | Tyranitar, Aerodactyl, Crustle |
| Lia Horizonte | Voador | Altaria, Noivern, Staraptor | Heliolisk, Mienshao, Espeon | Corviknight, Braviary, Talonflame |
| Bento Ferrugem | Aço | Aggron, Copperajah, Metagross | Mudsdale, Conkeldurr, Snorlax | Magnezone, Klinklang, Steelix |

`game/trainers.ts` fixa quatro golpes por espécie na inicialização, usando learnset,
manifesto de compatibilidade e pontuação de STAB/cobertura do catálogo, com um
espaço de recuperação/status/melhoria quando disponível. A equipe passa pelo mesmo
caminho de seleção/validação do jogador. Mudanças de catálogo exigem nova validação.

## Arte e apresentação

Os 11 personagens receberam ilustrações anime próprias com transparência,
retratos derivados, splashes dinâmicos e atlas pixel art de seis estados. Véspera usa
preto/ameixa, cabelo volumoso e detalhes lunares; Maré usa azul-petróleo/marfim,
conchas e pérolas. Nina foi diferenciada com suéter lavanda e postura reservada.

- Recursos finais: `client/public/trainers/<id>/{art,portrait,atlas,splash,motion}.webp` — 55 arquivos.
- Originais: [fontes PNG](art-sources/trainers/), geradas com **imagegen integrado**.
- Prompts e associação de fontes: [trainers.json](art-prompts/trainers.json) e [trainer-motion.json](art-prompts/trainer-motion.json).
- Empacotamento reproduzível: `scripts/package-trainers.py`, com Pillow. Apenas
  recorta transparência, redimensiona e comprime; não desenha as personagens.
  `scripts/package-frontend.py` empacota as artes de menu, splashes e movimentos;
  `--motion-only` refaz apenas os atlas. Recortes excluem fragmentos de células
  vizinhas; quadros de arremesso são ordenados do preparo para a soltura.
- [Manifesto](../client/public/trainers/manifest.json): dimensões, bytes, limites
  visíveis e geometria. O atlas de movimento mede 960×400: seis colunas e duas
  linhas, células de 160×200, pés em 80/194 e mesma escala entre poses. Os seis
  estados (repouso, preparo, lançamento, reação, celebração e derrota) possuem
  dois quadros cada. Ilustrações/splashes respeitam 350 KiB e atlas 150 KiB.
  Todos os 55 WebP têm canal alfa. O atlas anterior de duas poses foi preservado.
- Cartões carregam retratos progressivamente. Apenas o treinador escolhido tem
  splash/arte/atlas de movimento antecipados antes da batalha, dentro do limite existente de três segundos.
  Falhas usam o parceiro assinatura local como fallback.
- Aura fica atrás da ilustração; nomes, história, assinatura e foco têm superfície
  legível. `AnimationDirector` apresenta entrada, repouso, preparo, lançamento,
  reação e saída antes de revelar os Pokémon. Nocaute do jogador provoca
  celebração do adversário; resultado usa celebração/derrota conforme o vencedor.
  Cancelamento, skip, aba oculta e movimento reduzido encerram o bloqueio da entrada.

O inventário dos 12 menus, suas 24 imagens exclusivas, a marca e os 18 ornamentos
de tipo está em [Refatoração visual](FRONTEND_VISUAL.md).

## Verificações

| Verificação | Resultado |
|---|---|
| Runner completo do servidor | Passou, incluindo cobertura anterior e motor |
| 99 combates PvE | 11 treinadores × 3 formatos × 3 dificuldades, completos e legais |
| Modos e rede | Convites idempotentes, dois convidados concorrentes, fila isolada, saída/expiração, revanche e comandos antigos |
| Equipes e bot | 33 configurações, monotipo/tipos duplos, quatro golpes compatíveis, PP esgotado, trocas obrigatórias, determinismo, privacidade e fallback |
| Recursos | 55 WebP de treinador, 43 de interface; alfa, 12 células por movimento, 24 imagens exclusivas de menu, 18 tipos, whitelist e orçamento |
| Builds | Cliente e servidor passaram |
| Lint | Sem erros; dois avisos anteriores de Fast Refresh |
| Navegador PvE | Desafio Normal contra Véspera em três integrantes, nocaute, substituição, vitória e revanche mantendo a equipe; HP/PP restaurados |
| Navegador PvP | Dois clientes locais, criação/cópia/adesão do convite, formato herdado, montagem, preparação, escolhas simultâneas, substituições e partida completa; vitória/derrota coerentes |
| Ciclo privado | Expiração da oferta de revanche, convidado sai e libera vaga no mesmo código, retorno do criador com sua identidade e menu privado, saída do criador encerra convite |
| Layout | Menu, batalha e resultado inspecionados em desktop/360 px; sem rolagem horizontal; acionamento de golpes pelo teclado |
| Console e arquivos | Sem erros nos dois clientes durante os fluxos finais; git diff --check passou |

Evidências em [evidence/trainers](evidence/trainers/): revisão das 11 artes/atlas,
menu desktop/360, batalha desktop/360, convite, batalha privada, retorno do criador
e resultados PvE/PvP. A revisão final também impede queue_cancel de desvincular
uma conexão que esteja em sala; a regressão faz parte do teste de rede.

## Limites observados

- Salas e partidas ficam em memória. Reinício fecha sessões; contas, campanha,
  progresso persistente e múltiplos servidores não fazem parte desta entrega.
- A IA usa heurísticas com orçamento limitado; não faz busca profunda nem simula
  escolhas secretas. Equipes fixas priorizam compatibilidade, sem prometer equilíbrio competitivo.
- O teste visual usou o navegador integrado e dois clientes em abas distintas.
  Opera e isolamento real normal/anônimo permanecem sem conferência visual neste ambiente;
  o modo de uso solicitado está documentado. Integração WebSocket usa conexões independentes.
- Não houve medição em celular físico. FPS de aparelho intermediário permanece **[VERIFICAR]**.
- Personagens não possuem cenas de caminhada ou área explorável.
