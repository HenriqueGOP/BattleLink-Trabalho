# Recursos locais de Pokémon

Importação de desenvolvimento em 2026-10-02, preservando os bytes originais. O jogo não consulta os repositórios abaixo durante partidas.

| Origem | Revisão fixada | Conteúdo |
|---|---|---|
| [PokeAPI/sprites](https://github.com/PokeAPI/sprites) | bfb75391935310368065096fa08c51e8970bc43e | Front, back, shiny front e shiny back das 1.025 espécies base |
| [PokeAPI/cries](https://github.com/PokeAPI/cries) | ef687b18f0ce17169b4b4c09175819f7ade92f0f | Cries das 1.025 espécies |

São 5.125 arquivos originais, 19.008.688 bytes (19,01 MB decimais), sem ausências nesta importação. Em 2026-10-03 foram acrescentados 3.368 GIFs com vários quadros, para 868 espécies, totalizando 165.270.133 bytes. A procedência e os hashes desses arquivos estão em [animated/CREDITS.md](animated/CREDITS.md) e `animated/manifest.json`. O cry 25 foi distribuído upstream com extensão .ogg e conteúdo MP3; os mesmos bytes são armazenados como .mp3 para identificação correta.

Os repositórios declaram CC0 1.0 Universal para sua distribuição e explicitam que as imagens/áudios pertencem à **The Pokémon Company**. Esses avisos são preservados integralmente em `sprites-LICENSE.txt` e `cries-LICENSE.txt`; a licença do repositório não é declaração de propriedade sobre personagens ou marcas. Consulte as fontes para os créditos históricos de sprites/cries.

`manifest.json` registra caminho, tamanho e SHA-256 por recurso; `sources.json` registra os commits. `scripts/vendor-battle-assets.py` reproduz a importação, com limite de tamanho, validação da assinatura, concorrência limitada e tentativas de rede. Os testes conferem todos os hashes.

`fallback.svg` é um placeholder geométrico original deste projeto. Fontes são servidas localmente por @fontsource e mantêm os avisos de seus pacotes. Música e SFX são procedurais. Cenários preexistentes têm seus próprios créditos em `public/backgrounds`; as seis novas arenas serão tratadas na fase 6.
