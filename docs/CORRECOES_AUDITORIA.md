# Correções da auditoria técnica

Registro da linha de base anterior à reformulação, preservada no commit `34db709`.
Os contratos e testes foram posteriormente migrados conforme o
[relatório da fase 3](FASE_3_INTEGRACAO.md), que documenta as equivalências de cobertura.

## Oito apontamentos corrigidos

| # | Problema | Correção | Evidência de regressão |
| --- | --- | --- | --- |
| 01 | Log revelava a equipe adversária durante a preparação | Histórico público contém apenas contagens e confirmações; snapshots rejeitam leitores que não pertencem à sala. | Payload completo de log, eventos e adversário sem nomes das espécies reservadas. |
| 02 | Golpes podiam mudar durante o combate | Fase `setup` e confirmação individual `ready`; `accept_team` inicia o combate após ambas as confirmações. Equipe e golpes ficam travados. | Rejeição de alterações após confirmação e durante batalha, sem mutação do estado. |
| 03 | PokéAPI bloqueava a sala e dependia da rede em toda inicialização | Busca fora do mutex, revalidação por versão da equipe, timeout, compartilhamento de requisições em voo e cache persistente validado. | Busca lenta não bloqueia o adversário; reset invalida resposta atrasada; deduplicação; reinício offline; recuperação de cache inválido. |
| 04 | Desconexão deixava o sobrevivente em batalha sem resultado | Desistência confirma vencedor e motivo, limpa trocas e envia snapshot final antes de remover a sala. A interface mostra o resultado inclusive na preparação. | Integração real TCP/WebSocket com desconexão durante preparação e batalha; resultado final preservado. |
| 05 | Overkill inflava dano, drenagem e contagem de acertos | Cada acerto é limitado ao HP restante; drenagem e eventos usam o dano efetivo; multi-hit termina no nocaute. | Alvo com 1 HP recebe 1 de dano e apenas um acerto, com cura proporcional. |
| 06 | Cura interrompia efeitos compostos; Rest não aplicava sua regra | Motor resolve cura, remoção de status, sono e atributos no mesmo fluxo. Rest recebe efeitos explícitos que não estavam serializados no dataset. | Rest cura e impõe dois turnos de sono; falha com HP cheio; cura composta preserva atributos; Heal Pulse cura o alvo correto. |
| 07 | Transporte sem controle de origem, acesso e volume | Origens exatas, chave para exposição remota, TCP restrito ao loopback, quotas de conexões, frequência, fila e tamanho, prazo para join e heartbeat WebSocket. | Rejeição de origem/chave, quota de conexões, limite de mensagens, prazo de join e testes das políticas de configuração. |
| 08 | Fechamento manual não atualizava conexão e deixava operações pendentes | Socket notifica fechamento imediatamente, rejeita abertura cancelada, usa timeout, verifica envio e ignora callbacks de conexões anteriores. | Testes de fechamento manual/remoto, reconexão, cancelamento, timeout e falha de envio. |

## Compatibilidade e operação

- Cliente e servidor usam `pokemon-battle/2` e devem ser atualizados juntos. O CLI confirma com `ready`; a interface confirma em “Aceitar equipe e batalhar”.
- Node.js mínimo: 20.19. O backend carrega `server/.env`; veja `server/.env.example` e o README para configuração.
- O cache fica em `data/pokeapi-cache` ou em `POKEAPI_CACHE_DIR`. Catálogo e Pokémon ainda não armazenados exigem uma primeira consulta online. Imagens e áudio externos não são persistidos por esse cache.
- Para publicação remota, configure a chave e as origens permitidas e forneça HTTPS/WSS por um proxy com TLS. O transporte TCP permanece local. A chave de acesso é compartilhada para esta aplicação; não representa contas individuais.
- Efeitos de golpes já identificados como suporte parcial permanecem indicados no dataset; esta correção não transforma o motor em uma simulação completa do Pokémon Showdown.

## Validação

As sete suítes executadas por `npm test` cobrem domínio, eventos, auditoria, protocolo, políticas de segurança, socket do cliente e integração TCP/WebSocket/HTTP com dados offline determinísticos. `npm run build` compila backend e frontend. `npm run lint` verifica o frontend; os dois avisos existentes são de organização de exports para Fast Refresh.

Consulte também `docs/protocolo.md` para as mensagens e as novas fases da partida.
