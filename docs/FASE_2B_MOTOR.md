# Fase 2B — regras, escolhas e eventos do motor

Data: 2026-10-02. Etapa concluída; integração na aplicação pertence à fase 3.

## Entrega

- BattleSession sem rede, com escolhas simultâneas privadas, prioridade/Speed,
  desempate por RNG injetável, turnos completos e solicitações intermediárias de troca.
- Catálogo declarativo e manifesto com 954 entradas: 792 compatíveis e 162 bloqueadas.
  Cada exclusão inclui seus motivos; aliases não são golpes selecionáveis distintos.
- Hooks nativos de golpes e condições preservados no adapter. Extensões simples por
  dados usam um Dex isolado e não alteram o resolvedor nem o registro global.
- Status, Protect, Substitute, bloqueios, multi-hit, dreno/recuo, charge/recharge,
  Rest, trocas por golpe, trocas forçadas, Baton Pass e Revival Blessing.
- Eventos discriminados imutáveis, com sequência/rodada, participantes estáveis e HP
  anterior/final por hit. Snapshots por perspectiva e replay determinístico.
- Validação de equipes/learnsets, PP, fases/solicitações, ações duplicadas/atrasadas,
  limites de HP/PP/estágios e defesa contra ativação de sistemas excluídos.

## Evidência de validação

| Verificação | Resultado |
|---|---|
| Build | Servidor e cliente passaram |
| Lint | Zero erros; dois avisos preexistentes de Fast Refresh em ToastProvider/BattleProvider |
| Suíte completa | Sete grupos anteriores passaram, incluindo integração TCP/WebSocket/HTTP; suítes 2A/2B passaram |
| Matemática 2A preservada | 900 atributos, 324 pares de tipos, 360 cenários × 16 rolls; sanidade 31–37 |
| Catálogo | 782 golpes com espécie elegível × dois extremos de RNG = 1.564 cenários, com até oito solicitações adicionais por cenário |
| Golpes indiretos | Todos os 553 resultados possíveis do pool permitido de Metronome exercitados; continuação de Solar Beam chamado indiretamente |
| Determinismo | 12 partidas completas, repetidas com a mesma seed/ações e ordem invertida de chegada; eventos e snapshots idênticos |
| Probabilidades | Bullet Seed 35/35/15/15 em 100 posições do sorteio; críticos independentes por hit, críticos elevados, Focus Energy, precisão e Protect até o limite 729 |
| Fluxos de regras | Status e duração, residual após ambas as ações, Toxic reiniciado após troca, PP/Struggle, carga com PP zero, recharge, Rest, Substitute, Taunt, Disable, Encore, U-turn, Roar, Baton Pass, Revival Blessing |
| Integridade/privacidade | Entradas e saídas congeladas; HP/PP/estágios válidos, reservas ocultas, escolha pendente invisível, duplicatas/atrasos/payloads malformados sem mutação |
| Isolamento | Replay sob relógios distintos e proibição de fetch/Math.random; extensão de golpe não altera o catálogo global |
| Cliente | Bundle permanece em 429,20 kB de JavaScript, 140,18 kB gzip; nenhum simulador no navegador |

Os cenários do catálogo verificam execução, continuidade e invariantes, e não provam
todas as combinações possíveis entre golpes. Os exemplos obrigatórios possuem
asserções específicas; a semântica restante é delegada ao simulador fixado, mantendo
seus callbacks. Nenhum teste anterior foi retirado ou relaxado.

## Ajustes encontrados durante a implementação

1. Nocaute é representado internamente por status fnt: o snapshot o converte para
   fainted, preservando a união de status maiores.
2. A solicitação de carga possui um único slot. Usar o índice original quebrava golpes
   em outros slots e golpes chamados por Metronome. Comandos usam IDs validados;
   lockedMoveId autoriza a conclusão mesmo quando o último PP já foi consumido.
3. Linhas split contêm HP exato e percentual do mesmo fato: somente uma gera evento.
   Pain Split atualiza ambos os participantes e efeitos residuais não são atribuídos
   ao atacante da ação anterior.
4. Double-Edge usa a razão nativa 33/100, com arredondamento do simulador, sobre o dano
   efetivo. O teste de catálogo registra essa razão; nenhum callback foi aproximado.
5. Hyperspace Fury exige Hoopa-Unbound, forma excluída, e foi bloqueado no manifesto.

## Contratos para a fase 3

- A sala associará conexão autenticada ao side; autenticação continua fora do motor.
- requestId muda também em trocas intermediárias. actionId tem idempotência em janela
  de 256 recibos; comandos antigos fora da janela são rejeitados como atrasados.
- Nunca enviar setup/seed, dados nativos, ambas as perspectivas do replay ou escolhas
  pendentes. Eventos privados podem gerar lacunas visíveis: usar o watermark do snapshot.
- O pipeline de apresentação consome os eventos antes do state_sync final da resolução.
- Em ENGINE_CONTRACT durante a resolução, encerrar e liberar a instância/sala: a partida
  não pode continuar após uma possível mutação parcial.
- Catálogo local, sorteios no servidor, protocolo v3 e atualização dos dois clientes
  permanecem como entrega conjunta da fase 3. O Room atual ainda usa o motor anterior.

## Organização e limites

Alterações desta etapa ficam em `server/src/game/engine`, neste relatório e no ADR.
As alterações locais da auditoria anterior foram preservadas, sem entrar no commit.
Dependências e versões não mudaram nesta etapa. O alerta preexistente de desenvolvimento
em brace-expansion, documentado na fase 2A, não foi tratado como parte desta entrega.

No Windows, os testes usaram a execução autorizada fora da restrição que impede o tsx
de iniciar; o runner e as suítes existentes foram mantidos.

[VERIFICAR nas fases seguintes] Fluxo real com dois navegadores usando o novo motor,
desconexão sob protocolo v3, recursos locais/licenças, diretor de animação, screenshots,
acessibilidade, desempenho e FPS em celular real. A integração automática executada
nesta fase ainda exercita o protocolo atual.

Pausa prevista no plano antes da **fase 3**.
