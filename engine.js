const uci = require('node-uci');
const Engine = uci.Engine;

const moves = [ 'e2e4', ];

(async () => {
    const engine = new Engine('Stockfish/src/stockfish')
    await engine.init()
    await engine.setoption('Threads', '4')
    await engine.isready()
    console.log('engine ready', engine.id, engine.options)
    await engine.position('startpos', moves)
    const result = await engine.go({movetime: 250})
    console.log(JSON.stringify(result, null, 4))
    console.log(result.bestmove)
    await engine.quit()
})();