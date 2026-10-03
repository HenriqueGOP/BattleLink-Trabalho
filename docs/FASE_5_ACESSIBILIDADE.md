# Fase 5 — acessibilidade e preferências

## Diálogos

- Configurações de áudio e resultado usam o elemento `dialog` aberto por `showModal()`. O navegador coloca o foco inicial e torna o restante da página inerte; o hook percorre os controles visíveis com Tab/Shift+Tab e restaura explicitamente o controle que abriu o diálogo.
- Configurações têm título associado, botão de fechar, Escape e fechamento ao clicar fora do painel. Sliders anunciam o volume em porcentagem. Controles e área clicável das opções têm pelo menos 44 px de altura.
- O resultado associa título e descrição ao `alertdialog`. O primeiro controle é “Voltar ao lobby”; Escape executa essa mesma ação após a partida finalizada.
- O hook compartilhado fecha o diálogo na desmontagem e suporta o ciclo adicional de montagem do Strict Mode. Atalhos Ctrl/Alt/Meta+Tab continuam disponíveis ao navegador.

## Avisos e estados

- Erros permanecem até fechamento explícito ou substituição pelo limite de quatro avisos. Mensagens informativas e de sucesso duram quatro segundos de exposição efetiva, pausando ao receber foco ou mouse.
- Erros são anunciados como alertas; mensagens transitórias como status. Os temporizadores são liberados ao remover avisos e desmontar o provedor. Fechar tem alvo de 44 × 44 px.
- Tentar novamente o catálogo limpa o erro anterior antes de mostrar carregamento.

## Áudio

- O snapshot inicial de `useAudio` mantém música e efeitos silenciados, conforme a preferência padrão; preferências explicitamente salvas são preservadas.
- `AudioManager` publica snapshots novos a cada alteração. Isso permite que `useSyncExternalStore` atualize sliders e checkboxes sem modificar snapshots anteriores.
- Ajustar volume com o canal silenciado conserva o ganho em zero; desmutar usa o volume escolhido. “Testar som” libera o contexto de áudio dentro do gesto do usuário.

## Verificações

- TypeScript do cliente e da suíte passaram após as alterações.
- Lint dos arquivos alterados: zero erros, aviso existente de Fast Refresh no arquivo que exporta `ToastProvider` e `useToast`.
- `server/src/audio-ui.test.ts`: snapshots reconhecíveis pelo React, preservação de valores anteriores, mute efetivo, volumes, persistência e liberação de assinatura passaram.
- No navegador, o áudio manteve Tab/Shift+Tab dentro do diálogo e devolveu foco à engrenagem após Escape/fechamento. O resultado recebeu foco no botão de lobby, manteve Tab/Shift+Tab dentro do diálogo e executou a saída ao pressionar Escape. A partida real também voltou ao início pelo botão de lobby.
- Aviso de desconexão foi exibido como alerta persistente. As capturas, medidas de 360 px e a limitação da captura final da batalha estão registradas na validação conjunta e no relatório de menus.
