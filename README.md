# Soberano

Xadrez no seu computador: Stockfish, livro de aberturas, problemas, treino e partidas entre duas pessoas, sem servidor de jogo.

## Como correr

Precisa de [Node.js 22](https://nodejs.org/).

```bash
git clone https://github.com/Bernardo-Petrassem/soberano.git
cd soberano
npm install
npm run dev
```

Abra [http://localhost:8080](http://localhost:8080).

Para uma versão de produção, no mesmo diretório:

```bash
npm run build
npm run preview
```

## O que já vem incluído

- Motor Stockfish 19 lite (licença GPLv3), em `public/engine`
- 3865 linhas do livro ECO público do Lichess
- 4900 problemas, amostra estratificada da base pública do Lichess
- Relógios de clássico a ultra bullet, Xadrez 960, bots, análise, treino e histórico local

Partidas, o rating táctico, a lista de amigos e os ficheiros importados ficam neste navegador. Não há conta.

## Mais aberturas e problemas

Em **Biblioteca** pode importar:

- TSV do livro ECO (`eco`, nome, pgn)
- PGN com cabeçalho `Opening`
- CSV de puzzles do Lichess

O ficheiro completo de puzzles é grande; a importação lê aos poucos e guarda só neste navegador.

## Jogar com um amigo

1. Os dois abrem **Amigos**.
2. Cada um copia o seu endereço fixo (ou o QR).
3. Um liga-se ao endereço do outro e propõe tempo e cor.
4. Empate, desistência e sair da mesa estão na partida.

O Tor não corre dentro do navegador. A partida é directa entre os dois aparelhos; só a apresentação inicial passa por um ponto de encontro temporário.
