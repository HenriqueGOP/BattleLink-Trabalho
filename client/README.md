# Pokémon Battle — React

Interface React 19, TypeScript e Vite 8. Rotas preservadas: `/`, `/selecao`, `/equipe`, `/batalha`. O cliente envia escolhas e apresenta o estado oficial do servidor em `pokemon-battle/3`.

## Executar

Para desenvolvimento, abra dois terminais: dentro de `server/`, execute `npm run dev`; dentro de `client/`, execute `npm run dev`. Abra **http://localhost:5173/** em uma janela normal e em uma janela anônima, usando nomes diferentes. Após a primeira instalação, não é necessário fazer build para iniciar este fluxo. Passo a passo: [Como jogar](../docs/COMO_JOGAR.md).

Na raiz, os equivalentes são `npm run dev:server` e `npm run dev:client`. Build: `npm run build`; produção local: `npm start` em `server/` e `npm run preview` em `client/`.

Única variável de rede do frontend: `VITE_WS_URL`, padrão `ws://127.0.0.1:3002`. Para acesso remoto use WSS e origem explícita no backend. Chave do lobby permanece somente em memória. Catálogo e recursos são empacotados, sem REST/PokéAPI/CDN em runtime.

## Integração

- `BattleProvider`: snapshot autoritativo, preparação, tentativas idempotentes e cancelamento ao sair.
- `SocketService`: ciclo de conexão e decoder compartilhado com o terminal.
- `battleView`: converte IDs em modelo visual e recursos locais, preservando reservas ocultas.
- `eventEngine`: mensagens e categorias visuais dos eventos canônicos.
- `BattleEventQueue`: snapshots apresentados, watermark, checkpoints, lacunas e cancelamento.
- `AnimationDirector`: único executor de efeitos finitos; aguarda spritesheets/WAAPI/GSAP antes de confirmar cada evento.
- `SpriteRenderer`: relógio Canvas compartilhado, cache de três atlas locais, até 24 clips, cancelamento e poses estáticas para status com movimento reduzido.
- `assets` / `preloadBattle`: whitelist local, até seis downloads simultâneos, prazo de três segundos e fallback.
- `AudioManager`: áudio desligado sem preferência salva; preserva escolhas anteriores. Cries locais via Howler; demais sons procedurais.

O motor e a calculadora de referência são proibidos no bundle por verificação do Vite. Dados estáticos têm chunks próprios, que podem ser reutilizados pelo cache quando a interface mudar. Créditos, direitos, revisões e hashes: `public/pokemon`.

## Escopo visual

Desde a reformulação de **2026-10-03**, a direção **Battle Link** usa superfícies branco gelo, azul profundo e acentos vermelho/mint. Oxanium nos títulos e Nunito Sans no corpo são fontes locais com suporte a acentos. Início, catálogo, montagem da equipe e batalha compartilham tokens, CSS Modules e componentes; as regras continuam no servidor.

| Recurso local | Cobertura e fallback |
|---|---|
| Pokémon | Catálogo de 1.025 espécies; **868 espécies com 3.368 GIFs** animados, incluindo as variantes disponíveis de orientação e shiny. Recursos ausentes usam o sprite estático local. |
| Arenas | **Seis WebP** ilustrados em `public/arenas`, com **seis SVG de fallback** locais para os mesmos temas. |
| Efeitos de combate | Três atlas originais e 24 clips em `public/battle-vfx`, com hashes, prompts e procedência registrados. |

HP e nocaute seguem os eventos apresentados; a troca confirma o substituto entre saída e entrada. A barra principal e a fantasma animam por transform, sem estado React por frame. Pular e ocultar a aba aplicam a fila inteira; sair cancela efeitos e libera os clips. Os controles adotam altura mínima de 44 px, diálogos modais e foco visível.

O seletor **Animações** oferece **Sistema**, **Completo** e **Reduzido**. Sistema acompanha a preferência de movimento do sistema operacional; Completo solicita as animações completas; Reduzido substitui deslocamentos por feedback estático breve e mantém status em poses estáticas. A escolha fica salva quando o armazenamento local está disponível e não altera os resultados da partida. Áudio continua desligado para quem não possui uma preferência salva.

## Laboratório e validação

O laboratório `/visual-check` está disponível no servidor de **desenvolvimento** (`npm run dev`) e no build de **profile**. Inclui um cenário de nove snapshots do motor real, galeria dos 24 clips, seis arenas, cancelamento, amostragem RAF e prévias responsivas. A cena do laboratório força movimento completo para inspecionar os efeitos; o jogo respeita a preferência escolhida.

Para medir commits React, gere o cliente com `npm run build -- --mode profile` e abra `/visual-check` no preview. Esse modo usa React DOM profiling. O **build normal exclui o laboratório, a fixture e a galeria**. Regenere o cenário com `node scripts/generate-presentation-fixture.cjs`, na raiz, após compilar o servidor.

Validação unificada: `npm test`, `npm run build`, `npm run lint` na raiz. Evidências e limites da reformulação: [Frontend Refresh](../docs/FRONTEND_REFRESH.md). As medições históricas das fases 5–7 não certificam o frontend reformulado; FPS e memória em aparelho real continuam **[VERIFICAR]**. Relatórios anteriores: [fase 3](../docs/FASE_3_INTEGRACAO.md), [fase 4](../docs/FASE_4_APRESENTACAO.md) e [validação das fases 5–7](../docs/FASES_5_6_7_VALIDACAO.md).
