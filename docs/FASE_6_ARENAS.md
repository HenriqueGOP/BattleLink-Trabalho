# Fase 6 — arenas locais e preparação

Entrega: 2026-10-02. Validação móvel concluída em 2026-10-03. As arenas e a preparação estão implementadas; o percurso integrado
das fases 5–7 está registrado na validação conjunta. O pedido mais recente autorizou
executar as três fases em sequência.

## Entrega

- Seis ilustrações vetoriais originais, em uma direção cartunesca comum, com centro
  e chão livres para os combatentes. O servidor escolhe um único ID por sala pelo
  fluxo de RNG de apresentação existente; ambos os jogadores recebem o mesmo ID.
- O registro aceita apenas IDs e caminhos locais conhecidos. Valores de rede não
  se tornam URLs, caminhos ou HTML. A mudança troca `meadow`, `night` e `city`
  pelos cenários aprovados; o protocolo permanece `pokemon-battle/3`, migrado em
  conjunto com o cliente e a fixture de desenvolvimento.
- Fallback local por tema quando o preload expira, o recurso responde com erro
  ou a imagem falha ao decodificar. A cena não depende de uma requisição externa
  para apresentar esse fallback. Uma navegação cancelada não invalida recursos.
- Preload mantém seis tarefas concorrentes e limite de três segundos, incluindo
  transportes que ignoram cancelamento. O timeout de oito segundos da sala para
  cliente ausente permanece na orquestração já existente.
- Apenas seis elementos de ambientação por arena, animando transform/opacity.
  Preferência por movimento reduzido desativa a animação; aba oculta e apresentação
  pausada suspendem os loops. Não há estado React atualizado por frame.
- Os JPG antigos são preservados como arquivos legados; nenhum deles é selecionado
  pelo registro novo. Créditos e hashes das novas ilustrações estão junto aos SVG.

| ID | Nome | Tamanho SVG | Orçamento |
|---|---|---:|---:|
| forest | Floresta | 2.716 bytes | 600.000 bytes |
| stadium | Estádio | 2.812 bytes | 600.000 bytes |
| cave | Caverna | 2.570 bytes | 600.000 bytes |
| beach | Praia | 2.655 bytes | 600.000 bytes |
| space | Espaço | 2.913 bytes | 600.000 bytes |
| night-city | Cidade Noturna | 2.894 bytes | 600.000 bytes |

Total: **16.560 bytes** para as seis imagens. Todos os SVG têm viewBox 1200×700 e
foram inspecionados renderizados. A implementação usa recorte responsivo com
`object-fit: cover`; o contrato do registro permite trocar a arte por WebP local.

[Galeria das seis arenas](evidence/phases-5-7/arenas-original-gallery.png): linhas
Floresta/Estádio, Caverna/Praia, Espaço/Cidade Noturna. A imagem é uma renderização
dos SVG, e não uma captura do jogo.

## Validação

| Verificação | Resultado |
|---|---|
| Typecheck do servidor e testes | Passou |
| Lint dos módulos de arena/preload | Passou sem avisos |
| Integridade dos recursos | Passou: 5.125 recursos Pokémon e seis SVG, tamanhos e hashes |
| Registro e segurança | IDs iguais ao contrato; IDs arbitrários não viram caminhos; SVG sem scripts, handlers ou dependências externas |
| Preload e fallback | Seis workers, cancelamento sem invalidação e deadline de três segundos passaram |
| Arte original | Seis SVG renderizados e inspecionados; créditos CC0-1.0 e manifest registrados |
| Build e runner completo | Passaram novamente em 2026-10-03; resultados na validação conjunta |
| Composição integrada | Partida de duas abas, partida navegador/terminal e laboratório inspecionados; caso final com HUDs densos e indicador validado a 360 × 800 px em 2026-10-03, sem rolagem horizontal |
| 60 FPS e memória em celular intermediário real | **[VERIFICAR]**; não houve medição em aparelho real |

A pendência da composição móvel foi encerrada com `innerWidth` de 360 px e
`clientWidth = scrollWidth = 350` por causa da scrollbar. Com dois tipos, TOX e sete
modificadores no HUD próprio, o campo cresceu de 360 para 442 px; os HUDs de 254 e
148 px não se cruzaram. O indicador ficou em linha própria fora do campo.
Evidências: [antes](evidence/phases-5-7/battle-360-dense-before.png),
[depois](evidence/phases-5-7/battle-360-dense-after.png),
[medidas](evidence/phases-5-7/battle-360-measurements.json) e
[desktop de 1280 px](evidence/phases-5-7/battle-desktop-followup.png), com conteúdo
de 1270 px sem rolagem horizontal. Esta verificação cobre a composição integrada
nesse caso; não certifica todas as combinações de estados e arenas nem desempenho
em aparelho real.

Os testes foram adicionados ao grupo de recursos existente, preservando todas as
verificações anteriores. Para reproduzir, execute o runner normal na raiz. O teste
verifica o orçamento, integridade, registro seguro e fallback, enquanto o percurso
em navegador cobre a composição junto aos HUDs, sprites e controles.
