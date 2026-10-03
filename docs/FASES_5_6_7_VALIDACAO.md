# Validação conjunta — fases 5, 6 e 7

Data: 2026-10-02. O usuário autorizou executar as três fases juntas. A implementação
preserva o motor Gen 9 e o protocolo `pokemon-battle/3`, com mudanças na interface,
nos IDs de arena e na apresentação de eventos.

## Entregas

| Fase | Resultado | Detalhes |
|---|---|---|
| 5 | Menus, HUDs, controles e diálogos com tokens comuns, fontes e ícones locais | [Interface](FASE_5_MENUS.md), [acessibilidade](FASE_5_ACESSIBILIDADE.md) |
| 6 | Floresta, Estádio, Caverna, Praia, Espaço e Cidade Noturna | [Arenas](FASE_6_ARENAS.md) |
| 7 | 24 clips de combate em três atlas originais com transparência | [Animações](FASE_7_ANIMACOES.md) |

Áudio começa desligado quando não existe preferência salva. O controle de volume
publica um novo snapshot a cada alteração, respeitando mute. Diálogos usam a camada
modal nativa, escopo explícito de Tab e restauração de foco. Avisos de erro permanecem
até fechamento; avisos temporários pausam o prazo durante foco ou hover.

## Regressões automatizadas

A suíte completa da raiz passou após as alterações finais de apresentação e recorte
dos atlas. Não foi removido nenhum grupo anterior. O runner inclui os novos testes
de áudio, renderer e eventos reais.

| Grupo | Evidência |
|---|---|
| Matemática e motor | 900 combinações de atributos; 324 pares de tipos; 360 casos × 16 rolls; determinismo e regras Gen 9 |
| Mecânicas e capacidade | 12 replays completos, 553 casos de Metronome e 1.564 turnos em cenários de regras |
| Transporte e segurança | Validação de payload, privacidade, idempotência, escolha atrasada, HTTP, TCP, WebSocket, dois clientes de terminal, encerramento, timeout e quit com código zero |
| Recursos | Hashes de 5.125 sprites/cries Pokémon, seis arenas e três atlas; apenas caminhos locais conhecidos |
| Preload | Seis workers, deadline de três segundos, cancelamento e fallback para recurso indisponível, inclusive transporte que ignora abort |
| Renderer | Grade e alpha, 24 clips incluindo poses estáticas, cache de três imagens, um RAF compartilhado, abort, loop, reverso, atraso, projeção, pausa e atlas ausente |
| Apresentação | Fila durante animação, HP e troca confirmados uma vez, multi-hit, resultado, skip, aba oculta e desmontagem |
| Eventos reais | Protect/confusão/sono/paralisia/congelamento, carga/recharge, crítico absorvido por Substitute e dano residual sem crítico indevido |
| Áudio | Preferências imutáveis, persistência, assinatura e ganho zero enquanto muted |

O teste antigo de partículas CSS foi adaptado à substituição intencional por atlas:
verifica ausência das formas antigas e limpeza dos efeitos. O novo grupo valida o
limite de 24 clips e seu cancelamento, conservando a cobertura de recursos limitados.

## Navegador e evidências

Capturas anteriores foram obtidas da versão já carregada antes de reconstruir o
cliente. A interface nova foi percorrida em preview local de produção. O laboratório
usa build `profile`, eventos reais gravados e o mesmo diretor/renderer; ele é excluído
do build normal distribuído.

| Tela | Antes | Depois | 360 px |
|---|---|---|---|
| Início | [PNG](evidence/phases-5-7/home-before.png) | [JPG](evidence/phases-5-7/home-after.jpg) | [JPG](evidence/phases-5-7/home-360.jpg) |
| Seleção | [PNG](evidence/phases-5-7/selection-before.png) | [JPG](evidence/phases-5-7/selection-after.jpg) | [JPG](evidence/phases-5-7/selection-360.jpg) |
| Montagem | [PNG](evidence/phases-5-7/team-before.png) | [JPG](evidence/phases-5-7/team-after.jpg) | [JPG](evidence/phases-5-7/team-360.jpg) |
| Batalha | [PNG](evidence/phases-5-7/battle-before.png) | [PNG após troca real](evidence/phases-5-7/battle-real-after-switch.png) | Captura final **[VERIFICAR]**, conforme limite abaixo |

- Busca vazia, sorteio validado no servidor, seleção de golpes, confirmação e escolhas
  foram percorridos. As telas inspecionadas a 360 px não excederam a largura do
  documento; os botões inspecionados mediram pelo menos 44 px de altura.
- Áudio: Shift+Tab do primeiro controle chega ao último; Tab do último chega ao
  primeiro; Escape e fechamento devolvem foco à engrenagem.
- Partida navegador/terminal: arena Espaço, Thunderbolt/Tackle resolvidos, HP
  150/163 e 78/120, troca para Porygon concluída com HP 126/140 após o ataque
  recebido, desconexão, resultado e retorno ao lobby. O encerramento do CLI revelou
  um prompt após fechar readline; recebeu correção e regressão de saída limpa.
- No laboratório, novos snapshots chegaram durante Bullet Seed. Simular aba oculta
  concluiu os fatos pendentes e removeu todos os canvas da cena, com HP 122/130 no
  oponente. Retomar e pular o buff preservou ATK +2 e os status autoritativos.
- A galeria confirmou 24 poses estáticas com zero RAF. Parar confirmou zero canvas
  e zero RAF. A inspeção dos quadros identificou pequenos fragmentos em três linhas
  de transição; margens no registro excluem esses fragmentos sem alterar as imagens.
- [Galeria final de efeitos](evidence/phases-5-7/sprite-gallery-final.png) e
  [galeria de arenas](evidence/phases-5-7/arenas-original-gallery.png).
- Nocaute e troca forçada terminaram naturalmente no laboratório, com Eevee em
  campo e cinco Pokémon disponíveis no oponente. O resultado por desconexão
  apareceu após os efeitos finais. Tab/Shift+Tab ficaram no botão do diálogo;
  Escape reiniciou a fixture. Capturas: [laboratório](evidence/phases-5-7/result-after.png),
  [partida real](evidence/phases-5-7/result-real-after.png).

A captura final da batalha a 360 px continua **[VERIFICAR]**. A inspeção inicial
identificou sobreposição e o layout foi ajustado. Na retomada, uma sessão de navegador
ficou indisponível e a restante não aplicou o viewport solicitado, medindo 717 px.
A [captura atual](evidence/phases-5-7/battle-current-717.png) está identificada por
essa largura; não representa a verificação móvel final do indicador corrigido.

Build final normal do servidor e cliente passou; o chunk principal tem 443,95 KB
e o CSS 77,87 KB. O build normal exclui laboratório, galeria, fixture e instrumentação
própria, e rejeita simulador/calculadora no navegador. Lint terminou com zero erros
e os dois avisos anteriores de Fast Refresh. O build de perfil passou com o aviso
esperado de chunk acima de 500 KB. `git diff --check` passou.

O contraste documentado mede as combinações principais de tokens, com razões de
5,09:1 a 14,49:1 para texto. Não equivale a uma certificação completa de acessibilidade.
Tipos e status também possuem nomes escritos, sem depender apenas da cor.

## Orçamentos e desempenho

| Recurso | Medição |
|---|---:|
| Seis arenas SVG | 16.560 bytes somados; cada uma abaixo de 600 KB |
| Atlas de ataques | 620.824 bytes |
| Atlas de status | 579.934 bytes |
| Atlas de transições | 656.072 bytes |
| Atlas somados | 1.856.830 bytes; abaixo de 4 MiB |
| Cache decodificado | Três imagens de 1254×1254; aproximadamente 18 MiB de pixels RGBA |
| Canvas | Até 24 clips, tamanho lógico até 240 px e DPR até dois |

O alvo inicial de 256 KiB por atlas foi revisto para 768 KiB após empacotamento.
O cache de imagens permanece limitado durante a aba; canvas, callbacks e listeners
de cada clip são liberados após conclusão/cancelamento.

A amostra desktop de dois segundos registrou 288 intervalos RAF, média de 144 FPS
e p95 de 7 ms. São intervalos de um relógio no navegador, com a cauda ociosa após
clips finitos; não representa 24 efeitos animados durante toda a amostra nem uma
medição de GPU. O React Profiler registrou cinco commits entre montagem, ajustes,
início e conclusão da amostra, sem commits por frame. Dados e captura:
[JSON](evidence/phases-5-7/sprite-gallery-profile.json),
[JPG](evidence/phases-5-7/sprite-gallery-profile.jpg).

**60 FPS e memória em celular intermediário real continuam [VERIFICAR].**
Largura de 360 px e desktop não substituem o aparelho.

## Arte e reprodução

Os efeitos foram gerados pelo imagegen integrado em modo de geração original,
com fundo transparente. Três resultados foram empacotados em WebP; os prompts
selecionados estão em [docs/art-prompts](art-prompts). Dimensões reais, hashes,
origens e termos aplicáveis estão nos créditos e manifest de
`client/public/battle-vfx`. Arenas e ícones SVG foram desenhados no repositório.

O script `scripts/package-battle-vfx.cjs` recebe a pasta dos PNG originais e usa
Sharp apenas para codificação WebP, sem retoque/redimensionamento da arte. Sharp
é uma ferramenta de empacotamento, não dependência de execução do jogo. Os PNG
originais ficam na pasta de imagens geradas do Codex; os assets usados pelo jogo
estão versionados e não dependem dessa pasta nem de serviços externos.

Para repetir a validação, use os scripts da raiz `build`, `lint` e `test`. Para
inspeção visual instrumentada, compile o cliente no modo `profile` e abra
`/visual-check`; reconstrua no modo normal antes de distribuição.
