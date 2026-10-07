# Fundos e estrutura dos menus

## Origem dos problemas

- `HomePage` mostrava a mesma imagem `/arenas/forest.webp` em `.scene::before` tanto na partida rápida quanto no convite para amigos. As imagens distintas `quick-splash.webp` e `friends-splash.webp` apareciam apenas dentro dos painéis.
- `MenuScenery` preenchia absolutamente o ancestral da tela. O ancestral da seleção é limitado a 1320 px e muda de altura com a paginação e a ficha escolhida. Isso limitava a arte aos limites do catálogo e alterava seu enquadramento.
- O footer estava depois do conteúdo em um flex sem reserva de altura. A linha de treinadores do PvE e os campos extras de monotipo ou chave de acesso mudavam sua posição.
- O PvE carregava um fundo compartilhado, além de uma ilustração `splash.webp` com outro cenário embutido.

## Alterações

`MenuScenery` agora diferencia a camada de viewport fixa da arte de um painel. A camada de viewport tem `inset: 0`, `object-fit: cover` e enquadramento central. O tamanho é independente da ficha, do carregamento das imagens e da quantidade de Pokémon na grade. Seleção e preparação de golpes usam essa camada, incluindo a área externa aos seus conteúdos limitados a 1320 px.

O menu inicial aplica `blur(2px)` apenas à imagem, com uma pequena expansão para evitar uma borda vazia. Logo, controles e textos ficam fora da camada desfocada. Partida rápida carrega `/interface/quick-splash.webp`; amigos carrega `/interface/friends-splash.webp`; a sala de espera usa `/interface/waiting-splash.webp`.

O menu usa três linhas do grid: cabeçalho, conteúdo rolável e footer. O footer ocupa sempre 64 px dentro do layout, inclusive na entrada inicial. Ele não é uma sobreposição fixa; o conteúdo tem sua própria área de rolagem e pode alcançar o final sem ficar escondido atrás dele.

O PvE carrega `/trainers/<id>/background.webp` tanto na camada da página quanto no destaque. A ilustração da personagem usa `art.webp` transparente para que o cenário escolhido fique visível. Falhas no fundo exclusivo carregam o fundo PvE local; se o fallback também falhar, a base escura permanece sem deslocar conteúdo.

## Arte original e conferência dos arquivos

Foram criados onze ambientes exclusivos com a ferramenta integrada `imagegen`. Os prompts exatos e as imagens originais estão em `docs/art-sources/trainer-backgrounds/`. O arquivo `background-review.jpg` reúne os onze ambientes revisados: sem personagens, piso central livre para combate e decoração nas bordas.

| Treinador | Ambiente e paleta | Bytes do WebP |
| --- | --- | ---: |
| Véspera | Jardim gótico lunar, ameixa e violeta | 300172 |
| Maré | Terraço costeiro, azul-petróleo, marfim e rosa | 295502 |
| Téo Volt | Oficina elétrica, azul noturno e dourado | 317510 |
| Brasa | Quadra ao pôr do sol, laranja e carmim | 220052 |
| Nina Eco | Conservatório suave, índigo e lavanda | 323694 |
| Flora | Clareira botânica, verde e terracota | 321692 |
| Nival | Terraço de gelo, ciano e prata | 251138 |
| Rixa | Pátio punk, magenta, violeta e verde-lima | 302344 |
| Aren Cume | Plataforma de montanha, areia e âmbar | 299022 |
| Lia Horizonte | Observatório acima das nuvens, azul e branco | 276432 |
| Bento Ferrugem | Oficina industrial, aço, ferrugem e carvão | 275884 |

Todos os fundos são WebP opacos de 1600 × 900, têm hashes distintos e ocupam menos de 350000 bytes individualmente. `scripts/package-trainer-backgrounds.py` reproduz o empacotamento com Pillow a partir dos originais locais e atualiza apenas as entradas `background` do manifesto dos treinadores.

A conferência de interação no navegador deve comparar os retângulos do footer entre partida rápida, amigos, PvE, monotipo e chave aberta; comparar o retângulo da camada da seleção antes/depois de alterar a ficha e carregar mais Pokémon; e inspecionar cada cenário do PvE em tela cheia e na arena. A inspeção dos arquivos e da estrutura CSS cobre o carregamento e a geometria declarados; a conferência visual integrada é registrada junto às evidências finais do frontend.
