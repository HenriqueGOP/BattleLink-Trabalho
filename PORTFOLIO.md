# Guia rápido do repositório — BattleLink

O [README principal](README.md) contém os comandos completos para instalação e execução.

## O que é

Trabalho acadêmico de Sistemas Operacionais que demonstra **comunicação cliente-servidor**, sockets TCP, WebSocket, concorrência, sincronização de estado e integração com uma interface web.

**Tecnologias presentes no projeto:** Node.js, TypeScript, React e WebSocket. Parte relevante do desenvolvimento e das interfaces foi realizada com apoio de IA; seu uso não deve ser confundido com domínio individual de todas essas ferramentas.

## Por onde começar

1. [Como abrir e jogar](docs/COMO_JOGAR.md)
2. [Arquitetura e componentes](docs/arquitetura.md)
3. [Guia do código](docs/GUIA_DO_CODIGO.md)
4. [Protocolo de comunicação](docs/protocolo.md)
5. [Modos e treinadores](docs/MODOS_E_TREINADORES.md)

## Organização

- `server/` — regras, estado da partida, API e comunicação.
- `client/` — interface do navegador.
- `docs/` — documentação e registros técnicos.
- `data/` — arquivos de dados.

## Limitações importantes

Partidas e salas ficam em memória; reiniciar o servidor encerra as sessões. A demonstração exige a execução local dos processos. Os recursos de Pokémon pertencem aos seus respectivos titulares; consulte os créditos do projeto.

> Este arquivo é um índice complementar. Não altera o README principal nem os códigos originais.
