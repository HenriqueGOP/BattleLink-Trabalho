# Contribuindo

1. Crie uma branch para a alteracao.
2. Mantenha regras de jogo no servidor, nunca no React ou no cliente CLI.
3. Atualize `docs/protocolo.md` ao alterar mensagens.
4. Adicione ou ajuste testes em `server/src/**/*.test.ts`.
5. Rode `npm run build`, `npm test` e `npm run lint` na raiz.
6. Descreva no pull request como a alteracao afeta turno, estado e sincronizacao.

Prefira mudancas pequenas e modulares. Nao comite `node_modules`, `dist` ou arquivos `.env`.