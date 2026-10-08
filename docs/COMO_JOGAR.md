# Como abrir e jogar

## Desenvolvimento: janela normal e janela anônima

Este é o fluxo usado pelo proprietário do projeto. Abra dois terminais na raiz de `Maurilio-e-Pietro-Henrique`.

No primeiro terminal:

```powershell
cd server
npm install
npm run dev
```

No segundo terminal:

```powershell
cd client
npm install
npm run dev
```

Após a primeira instalação, basta repetir `npm run dev` em cada pasta. Mantenha ambos os terminais abertos durante a partida.

1. Abra **http://localhost:5173/** em uma janela normal do navegador.
2. Abra uma janela **anônima/privativa** e acesse **http://localhost:5173/** novamente.
3. Informe um nome diferente em cada janela, escolha **Partida rápida** e o mesmo formato. No Monotipo, escolha também o mesmo tipo. Entre na fila.
4. Escolha três ou seis Pokémon, conforme o formato. A seleção permanece aberta: revise a ordem e pressione **Preparar golpes**.
5. Configure até quatro golpes por Pokémon e pressione **Aceitar equipe e batalhar** nas duas janelas.
6. Aguarde a preparação da arena e dos recursos. Escolha uma ação em cada janela para resolver a rodada.

As escolhas são privadas até a resolução. Após um nocaute, o jogador escolhe um substituto disponível. A janela anônima mantém suas preferências separadas das da janela normal.

### Editar a equipe antes da batalha

- **Mover antes**, **Mover depois** e **Remover** aparecem tanto na seleção quanto na preparação de golpes; funcionam com mouse, toque e teclado.
- As posições **01–03** ou **01–06** indicam a ordem. O primeiro Pokémon inicia a batalha.
- **Voltar à seleção** preserva os integrantes e os golpes preparados. Remover alguém na preparação retorna à seleção para preencher a vaga, preservando os demais.
- A ordem muda imediatamente na tela e é confirmada pelo servidor. A confirmação da equipe fica indisponível durante a sincronização; uma edição rejeitada restaura a equipe confirmada.
- Depois de aceitar a equipe, a montagem fica bloqueada.

### Jogar com amigos

1. Na tela inicial, escolha **Jogar com amigos → Criar sala**, defina o formato e crie o convite.
2. Copie o código de oito caracteres. Na outra janela, escolha **Tenho um código**, informe-o e entre.
3. Preparem as equipes. A barra de informações mostra código, participantes e confirmação. O convidado segue o formato definido pelo criador.
4. A fila automática continua independente. Ao sair o convidado, a vaga fica disponível no mesmo código. Ao sair o criador, a sala é encerrada.

Convites sem atividade expiram após 15 minutos, inclusive durante montagem. Combates em andamento não expiram por esse mecanismo. Há limites de criação/entrada por conexão e IP. Desconexão encerra a partida por desistência; entrar novamente por código começa outra preparação.

### Desafios PvE

Escolha **Desafios PvE**, um dos 11 treinadores, o formato e Fácil, Normal ou Difícil; pressione **Desafiar**. Apenas uma janela é necessária. Todos os treinadores estão disponíveis desde o início. No Monotipo, use o tipo central do treinador; Pokémon de dois tipos são permitidos quando um deles corresponde ao tema.

Os atributos e equipes do adversário são iguais nas três dificuldades. Fácil sorteia golpes legais; Normal avalia ataques, precisão, recuperação e status; Difícil também considera trocas e golpes adversários já revelados. A decisão não conhece sua escolha pendente.

### Revanche

Após uma vitória, derrota ou empate, o resultado oferece **Revanche com minha equipe** e **Revanche montando outra equipe**, com contagem de tempo. Os dois jogadores precisam aceitar dentro de 30 segundos; no PvE, basta você aceitar. Manter preserva espécies, golpes, ordem e shiny. HP, PP, status, eventos, solicitações e RNG são reiniciados. Você pode voltar ao lobby se preferir.

Salas, convites e partidas ficam em memória. Reiniciar o servidor fecha as sessões; esta entrega não salva campanha, contas ou progresso.

### Arenas e animações

- O servidor sorteia uma das seis arenas; o fundo ilustrado aparece na própria partida.
- Na barra da batalha, **Animações → Completo** habilita os movimentos completos. **Sistema** segue a preferência de movimento reduzido do navegador/sistema operacional; **Reduzido** mantém indicadores estáticos dos efeitos.
- Os sprites animados são arquivos locais, com vários quadros, para 868 espécies. As outras espécies usam a imagem local com movimento corporal; não há download de sprites de sites externos durante a partida.
- Ao trocar entre as duas janelas, a apresentação de uma aba oculta aplica os resultados pendentes. Observe a janela da batalha durante a resolução para ver a sequência inteira, ou use **Pular animações**.
- O áudio começa desligado quando não há preferência salva.

### Alternativa sem mudar de pasta

Na raiz, em terminais separados, use `npm run dev:server` e `npm run dev:client`. Não use `npm run dev client` ou `npm run dev server`: esses não são os nomes dos scripts da raiz.

### Se o jogo não atualizar

- Confirme que os dois processos estão executando a pasta atual deste repositório.
- Feche uma instância anterior que esteja ocupando as portas antes de iniciar outra. O servidor usa 3001, 3002 e 3003; o cliente usa 5173.
- Abra o endereço mostrado pelo cliente. Se o Vite escolher outra porta por conflito, resolva o conflito para voltar a 5173.
- Recarregue as duas janelas depois de reiniciar os processos. O modo de desenvolvimento usa os arquivos fonte, sem exigir um build manual.

## Build de produção

Na raiz, `npm run build` gera servidor e cliente. Para executar, use `npm start` dentro de `server/` e `npm run preview` dentro de `client/`. O endereço de preview é o informado no terminal e pode ser diferente de 5173.

Os comandos de build, lint e testes da raiz estão no [README](../README.md).

As correções e as evidências da seleção e da batalha estão em [Seleção e apresentação](SELECTION_BATTLE_FIXES.md).

Descrição dos modos, personagens, recursos e verificações: [Modos e treinadores](MODOS_E_TREINADORES.md).

### Interface Battle Link

O início abre Partida rápida, Jogar com amigos ou Desafios PvE. Use **Voltar** para
retornar à escolha dos modos. No PvE, os cartões de treinador podem ser percorridos
horizontalmente em telas pequenas; selecionar um muda a história, assinatura e splash.

Na montagem e nos golpes, **← / →** mudam a posição e **×** remove um integrante.
O primeiro da lista inicia o combate. A ordem é atualizada imediatamente e anunciada
para leitores de tela. Em telas pequenas, remover fica abaixo das duas setas.

Em movimento completo, o treinador entra, prepara e lança a Pokébola, reage e sai;
os Pokémon aparecem depois. **Pular animações** e movimento reduzido chegam ao mesmo
estado de combate. Celebração e derrota aparecem no resultado. Áudio fecha por
**Escape** e devolve o foco ao botão de configurações.

Recursos e evidências: [Refatoração visual](FRONTEND_VISUAL.md).

### Notebooks e botões

Em notebooks com largura a partir de 980 px e altura até 800 px, arena e registro
ficam à esquerda, comandos e golpes à direita. Na preparação, a lista de golpes
rola separadamente; Salvar e Confirmar permanecem acessíveis. Em telas menores,
use **Revisar e confirmar ↓** para chegar à confirmação da equipe.

Os golpes preservam cores, símbolos e dados de cada tipo e recebem uma moldura
estática discreta. A skin também aparece em Lutar, Pokémon e Fugir. Movimento
reduzido elimina o pequeno deslocamento de pressionamento. Recarga e PP continuam
informados pelo servidor. Conferências atuais: [skin e notebooks](button-art-notebook.md).
