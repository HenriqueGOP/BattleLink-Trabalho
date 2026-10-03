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
3. Informe um nome diferente em cada janela e entre na fila.
4. Escolha seis Pokémon, configure até quatro golpes por Pokémon e confirme a equipe nas duas janelas.
5. Aguarde a preparação da arena e dos recursos. Escolha uma ação em cada janela para resolver a rodada.

As escolhas são privadas até a resolução. Após um nocaute, o jogador escolhe um substituto disponível. A janela anônima mantém suas preferências separadas das da janela normal.

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
