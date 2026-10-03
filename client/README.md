# Pokémon Battle — React

Interface React 19, TypeScript e Vite 8. Rotas preservadas: `/`, `/selecao`, `/equipe`, `/batalha`. O cliente envia escolhas e apresenta o estado oficial do servidor em `pokemon-battle/3`.

## Executar

Na raiz: `npm start --prefix server` após build. Em outro terminal: `npm run dev --prefix client`. Abra duas abas em http://localhost:5173. Build: `npm run build --prefix client`; produção local: `npm run preview --prefix client`.

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

GSAP, CSS Modules, tokens e fontes locais foram preservados. HP e nocaute seguem os eventos apresentados; a troca confirma o substituto entre saída e entrada. A barra principal e a fantasma animam por transform, sem estado React por frame. Pular e ocultar a aba aplicam a fila inteira; sair cancela efeitos e libera os clips. Movimento reduzido desativa efeitos finitos e mantém status em poses estáticas. Menus usam controles de 44 px, diálogos modais e foco visível. As seis arenas originais estão em `public/arenas`, e os três atlas/24 clips em `public/battle-vfx`, com hashes, prompts e procedência registrados.

Para medir commits React, gere o cliente com `npm run build -- --mode profile` e abra `/visual-check` no preview. Esse modo usa React DOM profiling e um cenário de nove snapshots produzidos pelo motor real. O laboratório força movimento completo apenas em sua cena, para validar efeitos mesmo quando o sistema pede movimento reduzido. O build normal exclui a rota e a fixture. Regenere o cenário com `node scripts/generate-presentation-fixture.cjs`, na raiz, após compilar o servidor.

Validação unificada: `npm test`, `npm run build`, `npm run lint` na raiz. O laboratório também tem galeria dos 24 clips, cancelamento e amostragem RAF; não é distribuído no build normal. Relatórios: [fase 3](../docs/FASE_3_INTEGRACAO.md), [fase 4](../docs/FASE_4_APRESENTACAO.md) e [validação das fases 5–7](../docs/FASES_5_6_7_VALIDACAO.md).
