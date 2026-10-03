# Diagnóstico da apresentação de batalha

Data: 03/10/2026. Base examinada: `288917e`. Esta investigação consultou código e arquivos locais; não alterou implementação nem executou uma partida no navegador. As hipóteses sobre o ambiente do usuário permanecem explicitamente pendentes de reprodução. Ambiente informado: cliente e servidor em desenvolvimento, `http://localhost:5173`, um jogador na janela normal e outro na anônima.

## Achados confirmados por fonte

| Prioridade | Achado | Evidência | Efeito observável esperado |
|---|---|---|---|
| Alta | Tempo de preload vira falha permanente na sessão | `client/src/lib/preloadBattle.ts:35,60`; `client/src/lib/assets.ts:12,22`; `client/src/config/battleBackgrounds.ts:66,73`; `client/src/lib/presentation/SpriteRenderer.ts:4,35` | Um recurso apenas lento nunca volta a ser tentado pelo registro correspondente; arena passa ao fundo genérico e atlas pode desaparecer. |
| Alta | Arenas e atlas ficam depois de sprites e gritos na fila inicial | `client/src/lib/preloadBattle.ts:23,31,32` | O orçamento de três segundos pode acabar antes de os principais recursos visuais serem sequer pedidos. |
| Alta | Pokémon não possuem frames animados no pacote atual | `scripts/vendor-battle-assets.py:66`; `client/src/pages/BattlePage/components/BattleSprite/BattleSprite.tsx:35`; CSS desse componente:23 | A criatura apenas oscila como uma imagem rígida; não há animação corporal de repouso/ataque. |
| Alta | Todos os golpes de status são excluídos do primeiro efeito do golpe | `client/src/lib/presentation/spriteRegistry.ts:58`; `AnimationDirector.ts:210` | Só consequências específicas animam; numerosos golpes de status não têm apresentação própria. |
| Média | Timeout de decodificação do atlas também fica permanente | `client/src/lib/presentation/SpriteRenderer.ts:41,47,54` | Depois de 1,5 s, o atlas vira `null` no cache e no conjunto de falhas, sem recuperação posterior. |
| Média | Redução de movimento remove inteiramente efeitos de evento | `AnimationDirector.ts:200,204`; `client/src/styles/global.css` | Não há um quadro ou indicação visual alternativa para cada golpe; a apresentação pode parecer não implementada. |
| Média | Ocultar a aba descarta imediatamente a fila | `useBattleEvents.ts:70`; `BattleEventQueue.ts:180,250`; `StatusAura.tsx:27` | Ao alternar entre dois jogadores, a aba oculta perde as animações pendentes e volta já no estado final. É política intencional atual, mas pouco evidente ao usuário. |
| Média | O reset global de imagens também restringe canvases de efeitos | `client/src/styles/global.css:35,38`; `SpriteRenderer.ts:126` | Um canvas de 150–240 px dentro do holder menor pode ficar reduzido à largura do Pokémon; conferir tamanho computado no navegador. |
| Média | Efeitos pertencem a holders dos combatentes, com recorte no campo | `SpriteRenderer.ts:131`; `BattlePage.module.css:172`; `BattleSpot.module.css:8,24`; `client/src/styles/effects.css:8` | Golpes de cenário e projéteis atravessando a arena têm escala/camadas limitadas pela árvore local, em vez de uma camada única sobre o campo. |
| Baixa | Arena é sorteada por partida e não é apresentada no texto da interface | `server/src/game/Room.ts:87`; `BattleBackground.tsx:27` | Não há garantia de ver todas as seis arenas em poucas partidas nem um rótulo que confirme qual foi escolhida. |

### 1. Falha transitória convertida em ausência duradoura

`preloadBattle` busca todas as variantes de todos os membros conhecidos da equipe, incluindo gritos. A arena e os três atlas são acrescentados no fim. Se seis trabalhadores ainda não terminaram em três segundos, o controlador interno é cancelado. O `finally` marca **todos os caminhos pendentes**, inclusive os que não começaram, como falhos nos três registros. Cancelar o sinal externo por desmontagem é tratado de forma diferente e não contamina os registros; o timeout interno contamina.

Os registros usam `Set` em escopo de módulo e não expõem operação de recuperação, validade temporal ou reset por sala. `resolveBackground` deixa de retornar o caminho da imagem; `pokemonAssets` passa ao fallback; `SpriteRenderer.load` sequer tenta carregar um atlas marcado. Reabrir uma partida no mesmo aplicativo conserva essa situação. O teste `server/src/resources.test.ts:176` confirma o fallback da arena lenta, mas não exige recuperação quando o recurso posteriormente responde.

Há um segundo caminho independente: `SpriteRenderer.load` aceita 1,5 s para `Image.onload`, desliga callbacks e armazena a promessa concluída com `null`. Mesmo que a imagem tenha sido baixada por `fetch` no preload, isso não garante que foi decodificada e pronta para desenho. A [API `HTMLImageElement.decode`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode) fornece a conclusão da decodificação da imagem.

**Proposta:** priorizar fallback, arena, sprites ativos e atlas de ataque/status/transição; carregar variantes de reserva e gritos depois. Diferenciar cancelamento, deadline e erro confirmado. Usar estados de carregamento com tentativas limitadas e recuperação, mantendo o fallback local durante a espera. A prontidão da partida pode continuar com limite; esse limite não deve banir arquivos da sessão. Pré-decodificar imagens principais e compartilhar essa cache com o renderer. Testar falha temporária seguida de sucesso, nova sala na mesma sessão, erro permanente e cancelamento, mantendo a whitelist de caminhos locais.

### 2. Ausência de animação corporal real

Inspeção local do registro e dos chunks PNG: **1.025 espécies**, **4.100 PNGs**, **zero chunks APNG `acTL`**, **zero GIFs/APNGs registrados**, **5.125 caminhos existentes sem arquivo ausente**. Front/back/shiny são quadros estáticos da PokeAPI. Gritos somam 1.022 OGG e três MP3. A imagem exibida pelo componente muda apenas ao trocar sua origem; `bob` desloca rigidamente a imagem seis pixels. Reações de ataque, dano, esquiva, recolhimento e derrota transformam o mesmo holder com WAAPI/GSAP.

Não é correto descrever isso como sprites Pokémon animados por frames. O renderer por frames existente é usado para **efeitos abstratos**, não para a criatura. Os três atlas somam **1.856.830 bytes** e foram inspecionados como imagens locais; presença, transparência e organização dos arquivos não comprovam a sua reprodução no jogo normal.

**Proposta:** adicionar variantes animadas locais com procedência registrada e fallback estático para espécies sem animação disponível; usar registro específico de criatura com dimensões, orientação, origem e comportamento. Escolher GIF/WebP animado ou atlas/frames conforme necessidade de controlar pausa e sincronização. Animação de repouso corporal e pose/reação são camadas distintas: pausa durante sono/nocaute, reação breve ao impacto, preparação e deslocamento de ataque, recolhimento/invocação. Manter uma camada externa para movimento da criatura e interna para frames evita que transformações de orientação, repouso e reação se sobrescrevam.

### 3. Golpes genéricos e cobertura visual incompleta

`attackClip` retorna `null` para categoria `Status`. Para os demais, usa padrão textual de cortes, depois oito grupos de tipo ou `impact`. A categoria `Special` inteira vira projétil, embora existam ondas, áreas, raios contínuos, movimentos em si próprio e ataques globais. A categoria `Physical` inteira vira a mesma investida curta de 28 px se não atacar a si próprio. O evento de dano repete o clip do golpe no alvo: a intenção de impacto existe, mas nem sempre deve repetir a mesma arte da emissão.

O caso `effect` só cobre confusão, proteção/Substitute/Endure, carga e recharge. Efeitos como Taunt, Encore, Disable, trap, Leech Seed, mudanças de tipo e barreiras não possuem linguagem visual dedicada nesse diretor. Há aura persistente somente para status principal e confusão. Isso não significa falta das regras; significa ausência da representação específica.

**Proposta:** registro declarativo de perfis por golpe com emissão, trajetória, área, impacto e reação. Perfis concretos para golpes reconhecíveis e fallback por família para o restante. Toda categoria deve ter ao menos uma apresentação de uso, mesmo quando falha ou não muda atributos. Emissão não deve anunciar a consequência antes de o evento autoritativo confirmar acerto, status ou alteração. Cobrir buff/debuff, sono, burn, poison, paralisia, congelamento, confusão, proteção, cura, dreno, recuo, multi-hit, charge/recharge, auto/forced switch, miss, immunity, faint e vitória/derrota. Recursos excluídos das regras continuam excluídos.

### 4. Visibilidade e acessibilidade

O documento oculto usa ressincronização imediata. A [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) distingue visibilidade de simples foco e navegadores normalmente interrompem `requestAnimationFrame` em abas ocultas. Portanto, trocar entre jogadores pode ocultar justamente a apresentação que se deseja observar. Reproduzir mantendo a janela observada visível e enviar a segunda ação pela outra janela; registrar `document.visibilityState` e a sequência durante o teste.

`prefers-reduced-motion` é herdado de preferências do sistema. Atualmente todos os efeitos de eventos são pulados pelo diretor; as auras persistentes exibem um quadro estático e as animações CSS são quase anuladas pelo reset global. A [documentação dessa preferência](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion) sustenta adaptar o movimento; a ausência completa de feedback não é requisito da API.

**Proposta:** oferecer uma preferência visual clara, com modo normal/reduzido, preservando o padrão do sistema. No modo reduzido, usar quadro estático breve, brilho suave, mensagens e HP sem deslocamentos intensos; não anunciar simplesmente que os efeitos estão ativos se esse modo os suprimiu. Na volta da aba, fornecer um resumo/replay visual seguro da última rodada se fizer sentido, mantendo a integridade do snapshot e sem reproduzir comandos. Um botão de replay não pode executar ação de jogo. Arena continua visível independentemente de redução de movimento.

### 5. Arenas: arquivos presentes, execução pendente

As seis arenas SVG estão fisicamente presentes no pacote local: forest 2.716 bytes, stadium 2.812, cave 2.570, beach 2.655, space 2.913, night-city 2.894. `Room` escolhe o ID em um fluxo de RNG de apresentação e o snapshot o transmite; `presentSnapshot` o entrega a `BattleBackground`. Não foi encontrado um bloqueio exclusivo do laboratório para a arena ou os efeitos: `BattlePage` normal monta ambos. O laboratório é apenas uma rota condicionada ao modo `profile`.

A [documentação do Vite](https://vite.dev/guide/assets.html) confirma que `client/public/arenas` e `client/public/battle-vfx` são servidos por caminhos na raiz durante o desenvolvimento e copiados para a raiz do build. Os caminhos atuais são compatíveis com `http://localhost:5173` na raiz; reiniciar o servidor de backend não reconstrói nem serve esses recursos. O [servidor de desenvolvimento](https://vite.dev/guide/) usa fontes, enquanto [preview](https://vite.dev/guide/static-deploy.html) usa `dist`. Nesta investigação, não foi constatado que o usuário esteja usando um build antigo; isso precisa ser verificado no ambiente real informado.

**Proposta artística:** separar cenário de longa distância, horizonte, chão e objetos de primeiro plano. Resguardar os eixos das criaturas e os contrastes do HUD; plataforma deve combinar com o material da arena em vez do disco cinza único. Todas as arenas precisam usar direção artística e perspectiva compatíveis, detalhes grandes que resistam ao recorte móvel e nome perceptível na interface. Verificar as seis opções de forma explícita no laboratório e ao menos arenas diferentes em partidas reais; sorteio aleatório não constitui cobertura das seis.

## Tipografia e caracteres portugueses

`client/index.html` usa UTF-8 e `lang="pt-BR"`. Os arquivos locais `@fontsource/vt323/400.css` e `@fontsource/press-start-2p/400.css` incluem `U+0000-00FF`, que cobre `é`, `ê`, `ã`, `ç`, `á` e `ó`. Portanto não há evidência de ausência desses glifos na fonte atual. Isso não assegura legibilidade: VT323 estreita e texto decorativo em todos os componentes podem dificultar a leitura de descrições longas.

Para o redesign, manter fonte de interface legível com Latin/Latin Extended local, usar a fonte decorativa apenas nos títulos e testar **João, Érica, Ênio, Açúcar, Paralisia, Confusão, Pokémon, Troca obrigatória, Não foi possível agir** em entrada de nome, cartões, comandos, toast, log e resultado. Conferir caracteres compostos/decompostos, line-height e recorte, sem remover acentos para encaixar no layout. Esse conjunto foi proposto, não validado no navegador nesta investigação.

## Reproduções que devem encerrar a correção

1. Partida normal no Vite em `localhost:5173`, duas janelas como o usuário, com console e caminhos de recursos inspecionados pelo DOM. Confirmar fase, ID/nome de arena, presença de imagem com `naturalWidth`, ausência de fallback indevido, preferência de movimento e visibilidade.
2. Golpe físico, projétil, área, buff/debuff, status principal, miss, proteção, troca e nocaute no fluxo real. Observar emissão, impacto e HP correspondentes ao mesmo evento.
3. Recurso inicialmente indisponível/lento que posteriormente carrega, sem recarregar o aplicativo inteiro; fallback deve se recuperar.
4. Uso explícito de movimento reduzido, aba oculta e retorno; confirmar feedback e sincronização.
5. Larguras de 360 px e desktop, todos os HUDs densos; conferir dimensão computada de canvas, camada de efeito e recorte sem sobreposição da interface.
6. Seis arenas por escolha de fixture de apresentação; uma partida real não substitui cobertura do registro inteiro.

Nenhuma reprodução real foi realizada por esta investigação. O próximo passo autorizado pelo responsável da implementação é investigar o navegador normal, depois executar as alterações e verificações previstas no pedido.

## Implementação após a pesquisa — 03/10/2026

As observações acima descrevem a base `288917e`, preservada como diagnóstico inicial. Após encerramento da pesquisa e autorização de implementação, foram aplicadas as seguintes correções neste escopo:

- Importação de **3.368 GIFs genuinamente animados para 868 espécies**, com **165.270.133 bytes**. Todos os arquivos têm mais de um frame e menos de 512 KiB. A árvore Git da revisão fixa foi consultada, sem tentar milhares de URLs presumidas; a API Contents truncava a listagem do diretório a 1.000 entradas, por isso o importador resolve os diretórios por objetos Git Trees. Arquivos permanecem idênticos ao upstream, comprovados também pelo SHA-1 do Git blob. Espécies/variantes ausentes usam os PNGs anteriores.
- Resolver `resolveBattleSprite` distingue orientação da animação e do PNG. Isso conserva o back PNG correto no modo reduzido mesmo quando só existe GIF frontal, como no caso de Greninja.
- Os **5.125 recursos originais, 19.008.688 bytes**, são preservados e continuam cobertos por seus hashes originais. Os GIFs ficam em registro/manifesto separados, com dimensões, duração, frames, SHA-256 e origem. O importador é uma ferramenta de desenvolvimento; o navegador do jogo não acessa a PokeAPI.
- Preload prioriza fallback, arena, criaturas ativas e atlas, deixando reservas e gritos depois. A busca tem no máximo duas tentativas por arquivo e continua com seis trabalhadores e limite global de três segundos. O deadline e a desmontagem não invalidam recursos. Um sucesso limpa a marca de falha anterior.
- Falhas comprovadas de imagem/arena/atlas têm cooldown de um segundo e podem ser recuperadas no mesmo aplicativo. A cache do renderer deixa de conservar promessas falhas com `null`. O preload aquece a mesma cache decodificada usada pelos atlas.
- Seis ilustrações WebP originais, produzidas pelo responsável pela integração, foram incorporadas ao registro mantendo cada SVG original como fallback. O conjunto WebP soma **1.314.980 bytes**; cada arena respeita 600 KB. A cena tenta recuperar a imagem primária no máximo duas vezes, mantendo SVG/fundo local durante falhas.
- Efeitos transitórios desenham no plano do palco, fora do stacking context dos combatentes. Auras persistentes continuam ancoradas ao holder local. Canvases têm `max-width: none`, feixes usam a distância/ângulo entre âncoras, ondas/pó viajam até o alvo e efeitos de área usam o centro do palco. O limite de 24 clips e o relógio único permanecem.

### Verificações executadas neste escopo

| Verificação | Resultado |
|---|---|
| Integridade dos 5.125 arquivos originais | Passou, mesmos bytes e hashes |
| Integridade dos 3.368 GIFs | Passou, frames reais, dimensões, SHA-256 e Git blob upstream |
| Seis WebP e seis SVG de fallback | Passou, hashes, caminhos permitidos e orçamento de tamanho |
| Prioridade, seis trabalhadores, deadline e cancelamento de preload | Passou |
| Falha temporária seguida de sucesso | Passou, sem reiniciar o aplicativo |
| Cache de atlas após erro e timeout | Passou, nova tentativa e renderização recuperadas |
| Canvas no palco, feixe, pó, área, limites e cancelamento | Passou |
| Tipos do cliente e lint dos arquivos deste escopo | Passaram |
| Navegador normal em `localhost:5173` | Validação conduzida separadamente pelo responsável pela integração |

Os testes de recurso que antes exigiam banimento após deadline foram corrigidos com justificativa inline: um prazo excedido só prova que o preload não terminou; não prova que o recurso esteja ausente. A cobertura de prazo, cancelamento, fallback, concorrência e integridade permanece, acrescida da recuperação. Não foi usada documentação como evidência de que uma animação tenha efetivamente aparecido no navegador.
