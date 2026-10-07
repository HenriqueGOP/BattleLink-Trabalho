# Efeitos originais de batalha

Arte produzida para este projeto em 02/10/2026 com a ferramenta integrada OpenAI imagegen,
a pedido do responsável pelo jogo. Não foram copiados packs de animação ou imagens de
terceiros. Os atlas contêm efeitos abstratos; os sprites dos Pokémon mantêm sua
procedência e avisos em `/pokemon`.

- `attacks.webp`: impacto, corte, fogo, água, raio, folhas, gelo e sombra.
- `statuses.webp`: queimadura, veneno, sono, confusão, proteção, buff, debuff e cura.
- `transitions.webp`: recolhimento, invocação, nocaute, vitória, derrota, empate, esquiva e psíquico.
- `impacts.webp`: substituição artística do atlas de ataques, gerada com imagegen integrado em 04/10/2026. Original e prompt em `docs/art-sources/battle-impacts`; exportação por `scripts/package-battle-impacts.py`. O atlas anterior permanece como histórico.
- `frozen.webp`: aura local de congelamento; procedência e hashes preservados no manifesto.

Em 07/10/2026, os efeitos de dano passaram a combinar clips existentes com a paleta de tipos e os símbolos SVG originais do projeto. O clip `dodge` é usado para retirada forçada; um evento `miss` mostra apenas “ERROU!”, sem inferir esquiva. `immune` não exibe a barreira de Protect.

Os prompts finais estão em `docs/art-prompts/{attacks,statuses,transitions}.txt`.
Dimensões e hashes dos originais e arquivos distribuídos estão em `manifest.json`.
O empacotamento apenas converte PNG para WebP com alpha preservado, sem retoque ou
reorganização dos quadros. A ferramenta entregou 1254 × 1254 px; o renderer usa essa
dimensão real e uma grade fracionária de 8 × 8. FPS e escalas são definidos no registro
tipado `client/src/lib/presentation/spriteRegistry.ts`.

Procedência: geração original para o projeto, conforme os termos aplicáveis do serviço
de geração utilizado pelo responsável. Não há licença de um pack de terceiros para
atribuir a estes arquivos; os avisos de recursos de terceiros existentes são preservados.
