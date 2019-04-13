# Lichess Bot

This is a little bot playing hyperbullet (30s per game) on lichess.org.

It makes use of puppeteer to communicate with a chromium browser and to get the last moves from the dom.

### Installation

1. You need a recent version of `npm` and `node` installed on your computer.
2. Then clone this repo and change into the directory.
3. Install dependencies with `npm install`. This will download puppeteer and a local chromium browser (around 120MB)
3. Compile stockfish or download a binary and remember the path to the stockfish binary.
4. Modify the settings in the top of `index.js`:

```js
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
```

**Before you start the bot:** You need to manually login to your cheating account and create a game with the settings you like. The bot will just use the saved settings for creating games.

Then start the bot by calling it in a command line using this command:

```
LICHESS_USER=your_lichess_account LICHESS_PWD=your_lichess_password node index.js
```

I hope calling it like this works on Windows. If not, just hardcode the user login and password. If you don't manage to do that, you probably have legitimate reasons to cheat :D

### Features

1. Plays completely autonomous and challenges the opponent until she had enough. Then seeks for a new game.
2. Picks a random move suggestion by the engine. Doesn't always play the best move.
3. You can highlight the engine suggestion instead of playing them automatically by setting `only_highlight` to `true` in the config.

### Limitations

1. Has problems promoting. Just change the lichess settings to autoqueen to fix that.
2. Gets detected rather quickly because it's too strong. *fixed*
3. Improvement: Add a mode to highlight the engine moves instead of playing them automatically. Then you can decide on your own if you want to make the bad bad engine move ;) *done*

### Why?

Cheating sucks, no doubt. But I got triggered when playing some cheaters in the high hyper bullet range.


