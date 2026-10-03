# Sprites animados Pokémon

Arquivos GIF preservados, sem redesenho, conversão ou remoção de frames, de [PokeAPI/sprites](https://github.com/PokeAPI/sprites/tree/bfb75391935310368065096fa08c51e8970bc43e/sprites/pokemon/versions/generation-v/black-white/animated), revisão fixa `bfb75391935310368065096fa08c51e8970bc43e`.

Direção visual: sprites de batalha animados da geração V (Black/White), incluindo variantes frontais, traseiras e shiny que realmente existem na árvore upstream. Somente GIFs com mais de um frame foram incluídos. Espécies sem versão animada mantêm o PNG local como fallback. Os 5.125 recursos originais não foram alterados.

Manifesto: `manifest.json`, com dimensão, contagem de frames, duração, bytes, SHA-256 e origem individual. Catálogo seguro: `client/src/data/animated-registry.json`. Importador: `scripts/vendor-animated-pokemon.py`, com oito trabalhadores e limite de 512 KiB por arquivo. Nenhum download de sprites ocorre no jogo.

Os avisos upstream são preservados em `../sprites-LICENSE.txt`. Pokémon e personagens pertencem aos respectivos titulares; a licença do repositório não concede direitos adicionais sobre essas marcas/personagens.
