# Fase 2A — base do motor

Data: 2026-10-02.

## Entrega

- ADR aprovado registrado em `docs/adr/battle-overhaul.md`.
- Nova API em `server/src/game/engine`: tipos imutáveis, validação, RNG injetável e
  serializável, fluxos independentes, atributos, efetividade e consulta de dano.
- Adapters privados encapsulam o simulador; consultas usam instâncias isoladas.
- Novos testes offline e `server/tsconfig.engine-tests.json`, para também checar os
  tipos do código de teste. Script `test:engine` incluído na suíte existente.
- Manifesto e lockfile do servidor atualizados. Nenhum teste anterior foi removido.
- Alterações da auditoria anterior preservadas; nenhuma migração de sala/socket ou
  mudança de frontend faz parte desta etapa.

## Dependências diretas adicionadas

| Pacote | Versão | Uso | Licença |
|---|---|---|---|
| `@pkmn/sim` | 0.10.11 exata | Servidor; fonte única das regras matemáticas | MIT |
| `@smogon/calc` | 0.11.0 exata | Desenvolvimento; oráculo dos testes cruzados | MIT |

## Evidência de validação

| Verificação | Resultado |
|---|---|
| `npm run build` | Servidor e cliente passaram |
| `npm run lint` | Zero erros; os mesmos dois avisos de Fast Refresh da linha de base |
| `npm test` | Sete grupos anteriores e a nova suíte passaram |
| Atributos | 900 combinações contra a calculadora independente; seis espécies, 25 naturezas, três níveis e dois conjuntos de EVs |
| Tipos | Todas as 324 combinações 18×18 comparadas |
| Dano | 360 cenários × 16 rolls comparados, além das regressões explícitas |
| Sanidade | Mínimo 31, máximo 37, com L50/BP80/A=D100/neutro/sem STAB/sem crítico |
| RNG | 1.000 palavras contra referência BigInt de 64 bits, restauração e independência entre fluxos; ramos probabilísticos forçados |
| Isolamento | Entradas congeladas, consultas intercaladas, relógios diferentes e proibição de fetch/Math.random durante a consulta |
| Bundle do cliente | Continua com 429,20 kB de JavaScript, 140,18 kB gzip; simulador não importado pelo frontend |

Foi encontrada e corrigida uma divergência do formato Custom Game: ele substitui a
aritmética de cartucho por Math.trunc. O formato local preserva overflows, incluindo
uma regressão de dano extremo. O teste não foi relaxado para acomodar a divergência.

No Windows, o runner tsx não inicia sob o isolamento disponível
(`uv_os_get_passwd / ENOMEM`). As execuções bem-sucedidas usaram a autorização para
rodar os mesmos comandos fora dessa restrição; os testes continuam offline.

## Risco preexistente e pendências

`npm audit` do servidor reporta um alerta alto em `brace-expansion@5.0.9`, dependência
de desenvolvimento de `nodemon → minimatch`. Essa versão já está no lockfile original;
nenhum dos novos pacotes introduziu a cadeia. A atualização dessa ferramenta não foi
misturada com a migração do motor. Referências do relatório npm:
[GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) e
[GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p).

O jogo ainda utiliza o motor anterior. Registro completo de golpes, pipeline, logs
canônicos e invariantes de HP são da fase 2B; ativação na Room e protocolo v3 são da
fase 3. [VERIFICAR nas fases seguintes] Partida entre dois navegadores, recursos
locais/licenças, screenshots, acessibilidade e FPS em celular real.

## Validação manual desta fase

Na raiz, executar `npm run test:engine --prefix server` para conferir a matemática e
`npm test` para repetir os fluxos existentes. Para o jogo, iniciar servidor e cliente
pelos comandos habituais e usar a fila: nenhuma mudança visual ou de protocolo é
esperada nesta fase. A integração TCP/WebSocket/HTTP foi executada automaticamente;
não foi afirmada uma nova sessão manual entre dois navegadores.

Próxima etapa: **2B**, somente após a pausa prevista no plano.
