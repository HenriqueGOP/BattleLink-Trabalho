# Arenas originais

## Ilustrações de batalha · 2026-10-03

Os fundos usados pelo jogo são seis ilustrações originais geradas pela ferramenta ImageGen, a pedido do usuário, seguindo a pesquisa visual de jogos de batalha. Nenhuma captura de jogo oficial foi copiada para as arenas. Prompts completos: `docs/art-prompts/arena-refresh.json`. Os PNGs de origem foram codificados como WebP (qualidade 82) sem redimensionamento ou retoque, pelo script `scripts/encode-arenas.cjs`.

Todos os fundos têm 1672×941 pixels e ficam abaixo do orçamento de 600 KiB por arena:

| Arena | Arquivo principal | Bytes |
|---|---|---:|
| Floresta | forest.webp | 345.300 |
| Estádio | stadium.webp | 252.034 |
| Caverna | cave.webp | 168.082 |
| Praia | beach.webp | 196.196 |
| Espaço | space.webp | 187.012 |
| Cidade Noturna | night-city.webp | 166.356 |

`manifest.json` preserva dimensões, SHA-256 do arquivo de origem e do WebP, tamanho e procedência. `project-original-generated-art` identifica a procedência da arte gerada para o projeto; não é licença de sprites ou marcas de terceiros. Os SVGs abaixo continuam disponíveis como fallback local.

## Fallbacks vetoriais · 2026-10-02

As seis ilustrações SVG foram desenhadas para este projeto em 2026-10-02, como arte
vetorial original por Codex a pedido do usuário. Não utilizam imagens, fontes,
logotipos ou recursos remotos. Licença destes arquivos: CC0-1.0 (dedicação ao domínio
público). O aviso não altera direitos sobre a marca Pokémon ou sprites de terceiros.

| ID | Nome | Arquivo |
|---|---|---|
| forest | Floresta | forest.svg |
| stadium | Estádio | stadium.svg |
| cave | Caverna | cave.svg |
| beach | Praia | beach.svg |
| space | Espaço | space.svg |
| night-city | Cidade Noturna | night-city.svg |

Todos têm viewBox 1200×700, composição com centro livre para os combatentes e
recorte responsivo por `object-fit: cover`. O registro aceita também futuros arquivos
WebP locais sem alterar mensagens do protocolo. Hashes e tamanhos estão em
`manifest.json`, verificados pela suíte de recursos.
