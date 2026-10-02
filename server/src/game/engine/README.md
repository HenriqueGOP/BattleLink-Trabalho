# Motor de batalha: base da fase 2A

Importe a API pública de `index.ts`. Apenas os adapters conhecem os objetos mutáveis
de `@pkmn/sim`. Este módulo ainda não está ligado à Room nem ao protocolo de sockets.

## API disponível

| API | Contrato |
|---|---|
| `calculateStats(speciesId, build?)` | Espécie base da Gen 1–9; nível 50, IVs 31, EVs 0 e Hardy como defaults. Aceita nível 1–100, IVs 0–31, EVs 0–252 e soma até 510. Retorna cópia congelada dos atributos oficiais; Shedinja mantém HP 1. |
| `effectiveness(type, defenderTypes)` | Tipos locais em minúsculas; um ou dois tipos defensivos distintos. Imunidade é zero. |
| `calculateDamage(request)` | Consulta de um hit, com atributos finais antes dos estágios, tipo/categoria/poder já resolvidos, crítico explícito opcional (default falso) e roll inteiro obrigatório de 85 a 100. Retorna dano teórico, não limitado pelo HP atual. |
| `calculateDamageRange(context)` | Mesma consulta para os 16 rolls, em ordem crescente. Usa uma simulação descartável por consulta, sem mutar entradas ou consumir RNG de sala. |
| `stageMultiplier` / `accuracyMultiplier` | Multiplicadores base 2/base 3, com estágio inteiro validado em −6…+6. |
| `createRng(seed)` / `restoreRng(snapshot)` | PRNG Gen 5 do Showdown, com quatro palavras de 16 bits obrigatórias; snapshots congelados e serializáveis. Nenhuma seed implícita. |
| `createBattleRngs(seed)` | Fluxos independentes combat/teams/presentation, derivados com SHA-256 e separação de domínio versionada. Não consome outro fluxo e não gera entropia. |
| `randomInt` / `randomChance` | Sorteios pelo RNG injetado, intervalo superior exclusivo e razão inteira validada. |

## Limites intencionais desta etapa

Consultas matemáticas não executam golpes: não verificam precisão, PP, Protect,
charge, secundários ou status residuais, nem calculam chance de crítico. O pipeline
e o registro declarativo completo pertencem à fase 2B. Dano de golpes com callbacks,
poder variável ou regras especiais será resolvido pelo próprio simulador na batalha;
não deve ser aproximado chamando esta consulta de poder fixo com dados incompletos.

O cálculo aceita Adaptability como modificador matemático; a verificação de que a
espécie pode possuir essa habilidade pertence à montagem de equipe na fase 2B.
Outras habilidades, itens, clima, terreno e formas não são aceitos na API de consulta.

O dano não é subtraído do HP nesta fase. A aplicação do dano efetivo e os invariantes
de HP, logs/eventos e ações privadas serão testados quando o pipeline for integrado.
Nunca exponha objetos internos, seed, snapshot de RNG ou logs brutos do Showdown
no socket. O timestamp interno do construtor não participa dos resultados públicos.

O formato local preserva truncamentos de 16/32 bits; não trocar pelo formato upstream
Custom Game, que desativa esses limites. As classes upstream não são reexportadas.

## Verificação

Na raiz: `npm run test:engine --prefix server` executa checagem TypeScript dos testes
e a suíte offline com o runner já usado no projeto (tsx + node:assert).
`npm test` inclui a suíte nova após os sete grupos anteriores. Não é necessário iniciar
servidor, navegador ou serviços externos.

`@smogon/calc` aparece somente no teste e é dependência de desenvolvimento. As duas
dependências diretas são fixadas; mudanças de versão exigem repetir testes cruzados.
