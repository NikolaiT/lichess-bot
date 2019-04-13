/**
 * @name lichess bot
 * @date April 2019
 * @author: Nikolai Tschacher
 * @desc Logs into lichess and starts playing with stockfish.
 * Provide your username and password as environment variables when running the script, i.e:
 * `LICHESS_USER=myuser LICHESS_PWD=mypassword node index.js`
 *
 */

const puppeteer = require('puppeteer');
const uci = require('node-uci');
const Engine = uci.Engine;


// by default the bot challenges the player again after the game
// when the challenge is not accepted, a new game is seeked
const config = {
    suggest_only_strongest_move: false, // if true, will only highlight/move the best move
    only_highlight: false, // if false, will move automatically
    stockfish_binary_path: 'Stockfish/src/stockfish',
    maxGames: 5,
    only_one_game_per_player: false,
    movetime: [100, 200], // picks a random movetime in ms in this interval
};

async function get_fen(page) {
    try {
        let contents = await page.content();
        var re = /"fen":"(.*?)"/gi;
        var found = contents.match(re);
        return found[1];
    } catch (e) {
        return false;
    }
}

// lichess uses the style attribute to manage moves
// <square class="last-move" style="transform: translate(320px, 128px);"></square>
// <square class="last-move" style="transform: translate(320px, 64px);"></square>
// 0px, 0px corresponds to the left top corner of the board
// 448px, 0px corresponds to top right corner of the board
// 0px, 448px corresponds to bottom left corner of the board
// 448px, 448px to the bottom right corner
// when we play black, (0,0) => (h,1)
// when we play black, (448,448) => (a,8)
// when we play white, (0,0) => (a,8)
// when we play white, (448,448) => (h,1)

async function get_last_move(page) {

    return await page.evaluate(() => {
        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === "attributes") {
                    var files = [1,2,3,4,5,6,7,8];
                    var ranks = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
                    var is_white = document.querySelector('.orientation-white') != null;

                    // first in array is dst, second is src
                    var last_moves = document.querySelectorAll('square.last-move');

                    if (last_moves.length === 2) {
                        var src_match = last_moves[1].getAttribute('style').match(/([0-9]+)px, ([0-9]+)px/i);
                        var dst_match = last_moves[0].getAttribute('style').match(/([0-9]+)px, ([0-9]+)px/i);

                        if (is_white) {
                            files.reverse();
                        } else {
                            ranks.reverse();
                        }

                        var src_coords = ranks[src_match[1]/64].toString() + files[src_match[2]/64].toString();
                        var dst_coords = ranks[dst_match[1]/64].toString() + files[dst_match[2]/64].toString();

                        return src_coords + dst_coords;
                    }
                    return false;
                }
            });
        });

        var elements = document.querySelectorAll('square.last-move');

        if (elements.length !== 2) {
            return false;
        } else {
            observer.observe(elements[0], {
                attributes: true //configure it to listen to attribute changes
            });
        }
    });
}

function style_to_move(is_white, last_moves) {
    var files = [1,2,3,4,5,6,7,8];
    var ranks = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    var src_match = last_moves.src.match(/([0-9]+)px, ([0-9]+)px/i);
    var dst_match = last_moves.dst.match(/([0-9]+)px, ([0-9]+)px/i);

    if (is_white) {
        files.reverse();
    } else {
        ranks.reverse();
    }

    var src_coords = ranks[src_match[1]/64].toString() + files[src_match[2]/64].toString();
    var dst_coords = ranks[dst_match[1]/64].toString() + files[dst_match[2]/64].toString();

    return src_coords + dst_coords;
}

// we have a move in algebraic notation, find out the piece we need to click
// given: b7c6
// searched: "transform: translate(320px, 128px);", "transform: translate(320px, 128px);"

function get_move_selectors(smove, is_white) {
    var files = [1,2,3,4,5,6,7,8];
    var ranks = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    var src = smove.slice(0, 2);
    var dst = smove.slice(2);

    if (is_white) {
        files.reverse();
    } else {
        ranks.reverse();
    }

    var c1 = ranks.indexOf(src[0]) * 64;
    var c2 = files.indexOf(parseInt(src[1])) * 64;
    var fs = "transform: translate("+c1+"px, "+c2+"px);";

    var d1 = ranks.indexOf(dst[0]) * 64;
    var d2 = files.indexOf(parseInt(dst[1])) * 64;
    var fs2 = "transform: translate("+d1+"px, "+d2+"px);";

    return {
        src: fs,
        dst: fs2
    };
}

async function we_are_white(page) {
    return await page.evaluate(() => {
        return document.querySelector('.orientation-white') != null;
    });
}

/**
 * Returns a random integer between min (inclusive) and max (inclusive).
 * The value is no lower than min (or the next integer greater than min
 * if min isn't an integer) and no greater than max (or the next integer
 * lower than max if max isn't an integer).
 * Using Math.round() will give you a non-uniform distribution!
 */
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}


async function get_stockfish_move(engine, fen, moves) {
    if (fen) {
        await engine.position(fen);
    } else if (moves) {
        await engine.position('startpos', moves);
    }

    var random_movetime = getRandomInt(config.movetime[0], config.movetime[1]);
    console.log(`Searching for ${random_movetime}ms`);

    const result = await engine.go({movetime: random_movetime});

    if (config.suggest_only_strongest_move) {
        return result.bestmove;
    } else {
        // do not always take the best move,
        // randomly select canidates from the info element
        let candidates = [];
        for (var obj of result.info) {
            if (obj.depth > 6) {
                let move = obj.pv.split(' ')[0];
                if (!candidates.includes(move)) {
                    candidates.push(move);
                }
            }
        }
        console.log('Candidate moves: ', candidates);
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
}

function sleep(ms){
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}

async function move(page, engine, moves_algebraic, white) {
    let smove = await get_stockfish_move(engine, null, moves_algebraic);
    console.log('Stockfish suggests', smove);
    let selectors = get_move_selectors(smove, white);
    var obj = {
        src: `piece[style="${selectors.src}"]`,
        dst: `[style="${selectors.dst}"]`,
    };
    if (config.only_highlight) {
        await page.click(obj.src);
        await page.waitFor(getRandomInt(45, 50));
        await page.evaluate((obj) => {
            document.querySelectorAll('piece').forEach((element) => {
                element.style.border = '';
            });
            document.querySelector(obj.src).style.border = '3px solid #e33';
            document.querySelector(obj.dst).style.border = '3px solid #e33';
            //
            // document.querySelectorAll('piece').forEach((element) => {
            //     element.classList.remove('check');
            // });
            // document.querySelector(obj.src).classList.add('check');
            // document.querySelector(obj.dst).classList.add('check');

        }, obj);
    } else {
        try {
            await page.click(obj.src);
            await page.waitFor(getRandomInt(35, 50));
            await page.click(obj.dst);
        } catch (e) {
            console.error('Cannot click that piece. Is user interfering?');
        }
        return smove;
    }
}

(async () => {
    // start the engine
    const engine = new Engine(config.stockfish_binary_path);
    await engine.init();
    await engine.setoption('Threads', '4');
    await engine.isready();
    console.log('engine ready', engine.id, engine.options);

    // start the browser
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--window-size=1920,1080']
    });

    const page = await browser.newPage();
    page.setViewport({width: 1920, height: 1080});
    await page.goto('https://lichess.org/login?referrer=/login');
    await page.type('#form3-username', process.env.LICHESS_USER);
    await page.type('#form3-password', process.env.LICHESS_PWD);
    await page.click('button.submit');
    await page.waitForNavigation();
    await page.waitForSelector('#user_tag');

    for (var i = 0; i < config.maxGames; i++) {
        await page.goto('https://lichess.org/?any#hook');
        await page.waitForSelector('button.random');
        await page.waitFor(500);
        await page.click('button.random');

        try {
            await page.waitForNavigation({
                timeout: 120000 // wait for 2 minutes max
            });
        } catch (e) {
            console.error('No one wants to play with us :(');
            break;
        }

        await page.waitForSelector('.cg-board');
        await page.waitFor(250);

        var last_move = null;
        var moves_algebraic = [];
        var white = await we_are_white(page);
        var show_info = true;
        var style_attrs = null;

        while (true) {

            if (show_info) {
                console.log(`We got the ${(white === true ? 'white' : 'black')} pieces`);
                show_info = false;
            }

            if (white === true && moves_algebraic.length === 0) {
                let smove = await move(page, engine, moves_algebraic, white);
                if (smove) {
                    moves_algebraic.push(smove);
                }
            }

            try {
                await page.waitForSelector('square.last-move');
                // wait for the next move with different style attribute
                if (style_attrs) {
                    // let selector_src = `square.last-move:last-child:not([style="${style_attrs.src}"])`;
                    // let selector_dst = `square.last-move:first-child:not([style="${style_attrs.dst}"])`;
                    await page.waitFor((style_attrs) => {
                        var last_moves = document.querySelectorAll('square.last-move');
                        return last_moves[1].getAttribute('style') !== style_attrs.src ||
                            last_moves[0].getAttribute('style') !== style_attrs.dst;
                    }, {}, style_attrs);

                }
                style_attrs = await page.evaluate(() => {
                    var last_moves = document.querySelectorAll('square.last-move');
                    return {
                        src: last_moves[1].getAttribute('style'),
                        dst: last_moves[0].getAttribute('style'),
                    }
                });
                last_move = style_to_move(white, style_attrs);
            } catch (e) {
                console.log('Starting a new game :)');
                break;
            }

            if (last_move && moves_algebraic[moves_algebraic.length - 1] !== last_move) {
                // handle multiple user friends castling
                // possibilities
                if (last_move === 'e8h8') {
                    last_move = 'e8g8';
                } else if (last_move === 'e8a8') {
                    last_move = 'e8c8';
                } else if (last_move === 'e1h1') {
                    last_move = 'e1g1';
                } else if (last_move === 'e1a1') {
                    last_move = 'e1c1';
                }

                console.log('Got new last move: ', last_move);
                moves_algebraic.push(last_move);
                console.log('Game State', moves_algebraic);

                let our_term = (white && moves_algebraic.length % 2 === 0) ||
                    (!white && moves_algebraic.length % 2 === 1);

                if (our_term) {
                    await move(page, engine, moves_algebraic, white);
                }

                continue;
            }

            // did we win ;)
            let msg = await page.evaluate(() => {
                var result = document.querySelector('.result_wrap');
                if (result) {
                    return result.innerText;
                } else {
                    return false;
                }
            });

            if (msg) {
                console.log(msg);
                if (config.only_one_game_per_player) {
                    console.log('Starting a new game :)');
                    break;
                } else {
                    console.log('Challenging for a new game :)');
                    await page.waitFor(1000);
                    await page.click('.follow_up button.rematch');
                    try {
                        await page.waitForNavigation({timeout: 22000});
                    } catch (e) {
                        console.error('Our friendo had enough xD');
                        console.log('Starting a new game :)');
                        break;
                    }
                    last_move = null;
                    moves_algebraic = [];
                    white = await we_are_white(page);
                    show_info = true;
                    style_attrs = null;
                    continue;
                }
            }
        }
    }

    await browser.close();
    await engine.quit();
})();