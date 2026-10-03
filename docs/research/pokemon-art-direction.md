# Pesquisa e direção de arte — Battle Link

Data: 2026-10-03. Pesquisa realizada antes de alterar a implementação visual. A revisão parte do relato de recursos ausentes no modo de desenvolvimento em `localhost:5173`, com janela normal e janela anônima.

## Fontes e método

Este documento complementa as pesquisas de [interface](pokemon-interface-references.md), [movimento](pokemon-motion-references.md) e o [diagnóstico de execução](visual-runtime-diagnosis.md). Foram consultados páginas oficiais, manuais, fontes dos criadores de fangames e código dos respectivos projetos. Resultados de busca e descrições automáticas de imagens serviram para localizar referências; não constituem comprovação visual.

| Fonte primária aberta | Evidência consultada | Adaptação proposta |
| --- | --- | --- |
| [Let's Go — como jogar](https://pokemonletsgo.pokemon.com/en-us/how-to-play/) | Texto oficial sobre equipe, tipos, comandos e imagens vinculadas | Combate como foco; informações essenciais junto dos combatentes |
| [Let's Go — imagem oficial de batalha](https://pokemonletsgo.pokemon.com/assets/img/en-us/p24_03.jpg) | Imagem inspecionada no navegador: criatura próxima à esquerda, adversário distante à direita, chão amplo e cenário verde | Diagonal com profundidade; terreno contínuo e sombra no chão |
| [Let's Go — região de Kanto](https://pokemonletsgo.pokemon.com/en-us/kanto-region/) | Apresentação oficial de lugares e ginásios | Cada arena recebe identidade reconhecível, mantendo a perspectiva |
| [Brilliant Diamond / Shining Pearl](https://diamondpearl.pokemon.com/en-gb/) | Página oficial relaciona conveniências modernas e cenas de batalha próximas | Menus tradicionais com legibilidade e adaptação a telas atuais |
| [Sword / Shield — Battle Stadium](https://swordshield.pokemon.com/en-us/gameplay/pokemon-battle-stadium/) | Apresentação oficial de competições e equipes; imagem de ranking inspecionada no navegador | Linguagem de competição: azul, branco, acentos e hierarquia limpa |
| [Sword / Shield — Wild Area](https://swordshield.pokemon.com/en-au/gameplay/wild-area/) | Cenários naturais e variações por localização documentados | Paleta por ambiente; ambientação visual sem introduzir regras de clima/terreno |
| [PokeAPI — sprites](https://github.com/PokeAPI/sprites) | README distingue PNGs, GIFs de Black/White e sprites comunitários; créditos e licença | Recursos animados locais onde existirem; fallback estático explícito para ausências |
| [Oxanium](https://fontsource.org/fonts/oxanium/about) | Fonte de títulos/HUD, licença OFL-1.1 e cobertura de idiomas documentadas | Títulos e indicadores de competição, sem fonte pixel estreita para todo texto |
| [Nunito Sans](https://fontsource.org/fonts/nunito-sans/about) | Fonte de texto, licença OFL-1.1 e cobertura linguística documentadas | Texto confortável, descrições e nomes acentuados |
| [Fontsource — subconjuntos](https://fontsource.org/docs/getting-started/subsets) | CSS local e unicode-range documentados | Fontes empacotadas com Latin e Latin Extended; nenhuma consulta a CDN no jogo |

As propostas abaixo são decisões do projeto, não afirmações de que os jogos pesquisados empregam as mesmas medidas, tempos ou implementação web.

## Direção escolhida

**Battle Link:** um terminal de batalha portátil inspirado na clareza dos menus Nintendo DS e na apresentação de competição dos jogos posteriores. Cabeçalho azul profundo, superfícies claras, bordas finas, detalhes vermelhos e verde menta. A arte da arena e os sprites são os elementos de maior destaque. Títulos em Oxanium e textos em Nunito Sans, servidos localmente.

- Início: ilustração de arena com acesso direto ao cartão do treinador; explicação breve dos dois jogadores e das etapas, sem requisitos técnicos no fluxo principal.
- Seleção: catálogo de fichas, numeração, sprites, busca legível e seis posições de equipe sempre identificáveis. Nome formatado para apresentação; IDs canônicos preservados nos comandos.
- Equipe: seis posições com seleção inequívoca; Pokémon em destaque; golpes equipados e candidatos mostram nome, tipo, categoria, poder, precisão e PP. Ações de salvar/confirmar distinguem intenção e estado.
- Batalha: campo panorâmico com criatura próxima à esquerda e distante à direita. HUDs compactos, sombra material no chão, nome da arena e rodada visíveis. Menu de ações seguido de golpes em 2×2, com informação de PP e detalhes acessíveis por foco/toque. Registro expandível para que não ocupe a tela toda.
- Diálogos: mesma tipografia, contraste, contorno, foco e estados. Nomes longos e caracteres como `é`, `ê`, `ã` e `ç` devem conservar conteúdo e caber no painel.

## Arte das seis arenas

Criar seis fundos raster originais na mesma perspectiva de jogo 2D. Detalhe concentrado no horizonte e nas bordas; espaço central e chão preservados para criaturas/efeitos. Não pintar menus, Pokémon, logotipos nem plataformas obrigatórias no fundo.

| Arena | Direção de arte |
| --- | --- |
| Floresta | Clareira iluminada, camadas de árvores, folhas grandes e chão verde |
| Estádio | Arquibancadas, bandeiras abstratas e gramado com marcações discretas |
| Caverna | Formações rochosas, cristais azulados e luz suficiente no chão |
| Praia | Costa azul, palmeiras nas bordas, areia dourada e horizonte aberto |
| Espaço | Observatório/plataforma lunar, estrelas, nebulosa distante e piso legível |
| Cidade Noturna | Terraço urbano, skyline e iluminação azul/âmbar, sem letreiros com texto |

A geração deve usar imagegen integrado. Os arquivos selecionados serão empacotados localmente em WebP e acompanhados de prompts, dimensões, origem, hashes e orçamento. Os SVG originais permanecem como fallback local. Referências pesquisadas não serão incorporadas como novos fundos.

## Critérios de integração

1. Priorizar arena, criaturas ativas e atlas durante a preparação. Timeout transitório não invalida o recurso para toda a sessão.
2. Separar frames da criatura, orientação, movimento de ataque, reação e sombra para evitar transformações concorrentes.
3. Perfis de golpes distinguem contato, corte, projétil, feixe, onda, área, pó e status. A animação de uso não pode antecipar acerto, dano ou estado ainda não confirmado pelo servidor.
4. Redução de movimento conserva feedback legível; ocultar uma aba conserva o snapshot oficial e deve deixar claro quando a apresentação foi resumida.
5. Verificar em `npm run dev` do servidor e cliente, com partida entre dois jogadores, além de build, lint e regressões existentes. Galeria isolada não basta.
6. Registrar capturas de desktop e 360 px, carregamento real dos recursos e efeitos em reprodução. FPS em aparelho real só poderá ser declarado após medição no aparelho.

O fluxo de abertura informado pelo usuário está documentado em [como jogar](../COMO_JOGAR.md) e no [README](../../README.md).
