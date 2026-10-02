# Pokémon Battle — React

Interface React 19, TypeScript e Vite 8. Rotas preservadas: `/`, `/selecao`, `/equipe`, `/batalha`. O cliente envia escolhas e apresenta o estado oficial do servidor em `pokemon-battle/3`.

## Executar

Na raiz: `npm start --prefix server` após build. Em outro terminal: `npm run dev --prefix client`. Abra duas abas em http://localhost:5173. Build: `npm run build --prefix client`; produção local: `npm run preview --prefix client`.

Única variável de rede do frontend: `VITE_WS_URL`, padrão `ws://127.0.0.1:3002`. Para acesso remoto use WSS e origem explícita no backend. Chave do lobby permanece somente em memória. Catálogo e recursos são empacotados, sem REST/PokéAPI/CDN em runtime.

## Integração

- `BattleProvider`: snapshot autoritativo, preparação, tentativas idempotentes e cancelamento ao sair.
- `SocketService`: ciclo de conexão e decoder compartilhado com o terminal.
- `battleView`: converte IDs em modelo visual e recursos locais, preservando reservas ocultas.
- `eventEngine`: adapta eventos canônicos usando watermark e detecta perda da janela de eventos.
- `assets` / `preloadBattle`: whitelist local, até seis downloads simultâneos, prazo de três segundos e fallback.
- `AudioManager`: áudio desligado sem preferência salva; preserva escolhas anteriores. Cries locais via Howler; demais sons procedurais.

O motor e a calculadora de referência são proibidos no bundle por verificação do Vite. Dados estáticos têm chunks próprios, que podem ser reutilizados pelo cache quando a interface mudar. Créditos, direitos, revisões e hashes: `public/pokemon`.

## Escopo visual

GSAP, CSS Modules, tokens e fontes locais foram preservados. A fila atual ainda usa duração estimada e HP acompanha o snapshot imediatamente. O diretor sequencial/cancelável e a separação temporal da apresentação serão implementados na fase 4. Menus e novas arenas pertencem às fases 5 e 6.

Validação unificada: `npm test`, `npm run build`, `npm run lint` na raiz. Relatório: [fase 3](../docs/FASE_3_INTEGRACAO.md).
