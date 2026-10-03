# Reformulação visual — Battle Link

Data: **2026-10-03**. Base anterior: `288917e`. Entrega posterior às fases 5, 6 e 7, motivada pelo relato de arenas e animações ausentes. As regras do servidor e o protocolo `pokemon-battle/3` permanecem os mesmos.

## Como abrir, conforme o uso informado

Em dois terminais separados, execute `npm run dev` dentro de `server/` e dentro de `client/`. Abra **http://localhost:5173/** em uma janela normal e em uma janela anônima, usando nomes diferentes. Na raiz, os scripts equivalentes são `npm run dev:server` e `npm run dev:client`. O [guia de abertura](COMO_JOGAR.md) registra instalação, etapas da partida e solução de conflitos de portas.

Após atualizar os arquivos, recarregue as duas janelas. Durante a resolução, mantenha a janela observada visível: ocultar uma aba aplica os eventos pendentes imediatamente. Na batalha, **Animações → Completo** permite ver a sequência completa mesmo quando o sistema operacional prefere movimento reduzido. **Sistema** respeita essa preferência; **Reduzido** usa feedback estático.

## Pesquisa realizada antes da implementação

A pesquisa consultou fontes oficiais Pokémon/Nintendo, manuais das gerações 3–5, BDSP, Let's Go, Sword/Shield e Scarlet/Violet; também fontes dos autores de Insurgence, Reborn e Infinite Fusion e o código do Pokémon Essentials e Pokémon Showdown. As limitações de acesso e a diferença entre observação, texto e inferência estão registradas nos documentos:

- [Direção de arte e imagens oficiais inspecionadas](research/pokemon-art-direction.md).
- [Referências de menus, equipe, navegação e tipografia](research/pokemon-interface-references.md).
- [Referências de movimentos, golpes e reações](research/pokemon-motion-references.md).
- [Diagnóstico inicial e recuperação dos recursos](research/visual-runtime-diagnosis.md).

A adaptação usa uma composição diagonal de batalha, campo contínuo, comandos separados dos golpes, quatro golpes em duas colunas, seis integrantes e informações de decisão legíveis. A identidade Battle Link, a escolha de fontes e as seis ilustrações são decisões deste projeto. Imagens pesquisadas não foram incorporadas como novos fundos.

## Causas corrigidas

| Problema confirmado | Correção |
| --- | --- |
| Uma camada antiga de céu/chão cobria a arena, mesmo com o WebP carregado | A camada só é montada quando há ambientação correspondente; seu céu é transparente e o chão opaco antigo foi removido |
| O pacote antigo continha apenas PNGs para os Pokémon | Registro separado de GIFs com frames reais, orientação e fallback local |
| Arena e efeitos chegavam depois de reservas e cries no preload | Prioridade para fallback, arena, criaturas ativas e atlas, mantendo seis trabalhadores e prazo de três segundos |
| Deadline de preload ou decode bania recursos durante toda a sessão | Cancelamento e prazo não são tratados como ausência; falhas confirmadas têm cooldown e recuperação limitada |
| Canvases de golpes eram limitados pelo tamanho e contexto do combatente | Efeitos transitórios desenham no plano do campo, com escala, distância e ângulo próprios |
| Preferência reduzida do sistema anulava o modo Completo no CSS | Preferência única sincroniza CSS, criaturas e diretor; redução conserva feedback estático |
| Golpes de status não tinham emissão e ataques compartilhavam a mesma investida | Perfis de contato, corte, projétil, feixe, onda, área, pó e status; consequências aguardam eventos oficiais |
| Repouso, orientação e reação disputavam transformações | Camadas independentes para frames, orientação, ação, repouso e sombra |
| Logs exibiam termos internos como `singleturn` | Mensagens locais em português resolvidas pelo catálogo e pelos eventos, preservando oponentes ocultos |
| Hints confundiam dano variável com status e alvos aliados com oponente | Categoria oficial determina o rótulo; alvos e conjugação foram corrigidos e cobertos por regressões |

## Telas e recursos entregues

- Início com cartão de treinador, estado de fila, chave recolhível e arena ilustrada.
- Seleção com busca por nome/número tolerante a acentos, filtro de tipo, carregamento incremental de 48 fichas e estado vazio. Consulta da ficha independe de selecionar o integrante.
- Montagem com seis posições, quatro golpes, poder, precisão, PP, categoria, detalhes e confirmação explícita.
- Batalha com HUDs compactos, nome da arena, rodada, menu LUTAR/POKÉMON/FUGIR, troca obrigatória, registro recolhível e resultado após a apresentação.
- Fontes locais **Nunito Sans** e **Oxanium**, subconjuntos Latin/Latin Extended. Nomes e buscas como Érica, Ênio, João, Açúcar e Flabébé foram conferidos sem modificar os IDs do protocolo.
- **3.368 GIFs para 868 espécies**, total de **165.270.133 bytes**. Revisão fixa do repositório PokeAPI/sprites, hash, duração, dimensões e mais de um frame verificados. As variantes ausentes usam fallback; não há uma animação desenhada individualmente para cada golpe de cada espécie.
- **5.125 arquivos originais** preservados, **19.008.688 bytes**. Espécies sem GIF continuam com PNG e movimento corporal quando permitido. Sono, congelamento, nocaute, aba oculta e movimento reduzido usam imagem estática.
- **Seis arenas WebP originais**, cada uma em 1672 × 941, total de **1.314.980 bytes**: Floresta, Estádio, Caverna, Praia, Espaço e Cidade Noturna. Cada arquivo tem menos de 600 KB; os seis SVGs anteriores são fallback.
- **24 efeitos por frames** nos três atlas locais existentes, associados aos novos perfis: ataques, esquiva, troca, queimadura, sono, confusão, proteção, buff/debuff, cura, nocaute e resultado. O renderer conserva o limite de 24 clips e um relógio compartilhado.

O conjunto de GIFs acrescenta cerca de 165 MB ao repositório e à distribuição completa. A partida carrega recursos por demanda; o preload não transfere todo o catálogo. Procedência e avisos de direitos estão nos créditos de [Pokémon](../client/public/pokemon/CREDITS.md), [animações](../client/public/pokemon/animated/CREDITS.md) e [arenas](../client/public/arenas/CREDITS.md). Prompts das arenas: [registro](art-prompts/arena-refresh.json).

## Validação final

| Verificação | Resultado e limite |
| --- | --- |
| `npm test` | Passou: contratos, segurança, sockets, dois clientes de terminal, partida completa por integração, recursos, apresentação, áudio, formatação e motor |
| Matemática e determinismo preservados | 900 construções de atributos, 324 pares de tipos, 360 amostras × 16 rolls, 12 replays, 553 resultados de Metronome e 1.564 cenários de múltiplos turnos passaram |
| `npm run build` | Servidor e cliente passaram; build normal rejeita simulador, calculadora, laboratório e fixture no navegador |
| Inicialização `npm run dev` do servidor | Passou em portas locais separadas 3101/3102/3103, preservando a instância já aberta nas portas padrão |
| `npm run lint` | Zero erros; dois avisos anteriores de Fast Refresh em ToastProvider e BattleProvider |
| Auditoria das dependências de produção do cliente | Zero vulnerabilidades no resultado consultado; não equivale a uma auditoria completa do sistema |
| Fluxo real em desenvolvimento, `localhost:5173` | Pareamento, seleção, golpes, confirmação, arena, escolhas simultâneas, ataques, queimadura, redução de atributo, Protect, nocaute, troca voluntária/obrigatória, skip e desconexão observados |
| Encerramento real pela interface | Vitória por desconexão observada; uma partida de seis nocautes até o fim foi coberta pela integração automatizada, não por esta inspeção visual |
| 360 px | Cliente real em iframe de largura interna 360, documento útil 350 com scrollbar e scrollWidth 350; equipe, batalha, troca e resultado sem rolagem horizontal |
| Teclado | Escolhas e confirmação executadas pelo teclado; entrada em equipe retorna ao topo/foca o título; diálogo final mantém Tab no botão de saída |
| Alvos de toque observados em 360 px | Controles com pelo menos 44 × 44; golpes 146 × 106,6; membros 146 × 121 |
| Contraste da paleta | Texto 13,95:1; texto secundário 5,85:1; branco/vermelho 5,12:1; bordas de campo 3,37–3,50:1; foco menta/painel 9,02:1. Cálculo de pares usados, sem alegar certificação de toda combinação possível |
| Arenas | Todas as seis carregadas na galeria pelo componente real; Estádio, Floresta e Cidade Noturna observados em partidas reais |
| Recursos | Integridade de PNG/áudio/GIF/arenas/atlas e recuperação de falhas passaram; inventário observado no profile contém 34 recursos, todos locais |
| Fila da apresentação | Oito novas atualizações recebidas durante as animações dos nove snapshots; resultado apresentado somente após a fila |
| Skip, aba oculta e desmontagem | Estado sincronizado; canvases transitórios cancelados; após parar a galeria: zero canvases e zero RAF pendente do renderer |
| React Profiler, build profile | 97 commits na sequência de nove snapshots, média 0,181 ms e máximo 2,7 ms; durante a amostra animada da galeria há publicações de início/fim, sem commit React por frame |
| Amostra RAF no navegador de desktop | 289 intervalos em 2.006,6 ms, média 144,0 FPS e p95 de 7 ms; inclui o fim da rodada de 24 efeitos e não mede um aparelho móvel |
| 60 FPS e memória em celular intermediário real | **[VERIFICAR]** — a largura emulada e o navegador do desktop não comprovam este critério |

As capturas móveis mostram o cliente real dentro da prévia responsiva, com contexto ao redor. Não são screenshots de um telefone físico. Os testes anteriores de deadline foram adaptados com justificativa: prazo excedido não prova que o arquivo inexista. Cobertura de timeout, cancelamento, fallback, concorrência e integridade foi mantida e ampliada.

## Evidências

- [Início antes](evidence/frontend-refresh/home-dev-before.png) e [início novo em 1280 px](evidence/frontend-refresh/home-desktop.png).
- [Seleção com Flabébé](evidence/frontend-refresh/selection-desktop.png) e [montagem desktop](evidence/frontend-refresh/team-desktop.png).
- [Arena encoberta antes](evidence/frontend-refresh/battle-dev-before-action.png) e [Estádio após correção](evidence/frontend-refresh/battle-dev-after.png).
- [Cidade Noturna em partida real, 1280 px](evidence/frontend-refresh/battle-desktop.png); sprites carregados por GIF e documento sem overflow horizontal.
- [Emissão de fogo](evidence/frontend-refresh/battle-dev-status-action.png), [queimadura e debuff](evidence/frontend-refresh/battle-dev-status-result.png), [Protect](evidence/frontend-refresh/battle-dev-protect.png), [nocaute](evidence/frontend-refresh/battle-dev-knockout.png) e [troca](evidence/frontend-refresh/battle-dev-switch.png).
- [Floresta em 360 px](evidence/frontend-refresh/battle-360.png), [resultado em 360 px](evidence/frontend-refresh/result-360.png) e [medidas](evidence/frontend-refresh/mobile-measurements.json). Reservas fora da tela podem permanecer sem carga por serem lazy; isso não indica falha do recurso.
- [Galeria de arenas](evidence/frontend-refresh/arenas-dev-gallery.png), [perfil React](evidence/frontend-refresh/react-profiler.json), [amostra da galeria e cancelamento](evidence/frontend-refresh/sprite-gallery-profile.json), [controles da fila](evidence/frontend-refresh/queue-controls.json) e [inventário local observado](evidence/frontend-refresh/local-assets-profile.json).

## Reproduzir a medição

O laboratório abre em `/visual-check` durante `npm run dev`. Para medir React, use `npm run build --prefix client -- --mode profile --outDir dist-profile` e `npm run preview --prefix client -- --outDir dist-profile`. Abra `/visual-check` no endereço informado pelo preview. O build normal exclui o laboratório e os dados de cenário; `dist-profile/` não é versionado.

Clique em Próxima sequência enquanto a anterior anima, espere o resultado e consulte os outputs `data-battle-profile`. Reinicie e use Simular aba oculta/Pular animações. Desmonte a cena, desmarque Quadro estático e reproduza a galeria para obter a amostra RAF. Parar/Inspecionar recursos ativos deve retornar zero canvases e zero relógios pendentes.
