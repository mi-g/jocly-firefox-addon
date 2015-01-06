
# jocly-firefox-addon

This is a Firefox addon to facilitate playing board games on [Jocly](https://www.jocly.com).

While having the addon installed is not necessary to play on Jocly, it provides a few nice features:

- **Browser-level notifications**: when your opponent makes its move, the Jocly addon icon in the toolbar animates, even if
no tab is open to the Jocly site. The icon also animates if you are invited by someone to play a game. Clicking on the icon
open a panel to go directly to the corresponding event: the playing game or the invitation page.
- **Quick game access**: the addon panel shows the list of available games and allows going directly to the game page to start
playing against the computer, invite someone, read the rules, ...
- **PJN Viewer**: for Chess, International Draughts and English Draughts, whenever you are on a site displaying game transcripts (in PGN format
for Chess or PDN for Draughts), you can mouse-select the game text, right-click and pick `Open PJN Viewer` to see and replay the whole
game from a Jocly 3D interface.

You can then enjoy all Jocly features:

- Over 110 Games, and growing...
- Artificial Intelligence to play alone, several levels available
- Remote playing against other users, over minutes or weeks
- Full 3D User Interface: see the board from various angles, zoom in/out, ...
- Video Chat with your opponent while playing: directly in the 3D scene
- Browser notifications on opponent moves and invitations even when no tab open to Jocly
- ELO based per-game Leader Board
- Replay and analyze played games
- Pure HTML5 technology: no Flash, no Java
- Many more ...

## Build instructions

- Install and enter the Firefox addon SDK environment (see [documentation](https://developer.mozilla.org/en-US/Add-ons/SDK/Tutorials/Installation)
- Go to the `./src` directory and type `cfx xpi`. This creates a `jocly-addon.xpi` file in the current directory

In the project source code, the file `./src/lib/pjn-parser.js` is generated. If you want to modify the parser (think twice about doing this):

- Install `node`, `npm` and `grunt` on your machine
- Go to `./parser`
- Execute `npm install`
- Make your modifications to the lexical parser file `PJNParser.jison`
- Run `grunt`, this modifies the file in `./src/lib/pjn-parser.js`
- Go to `./src` to regenerate the add-on

## See also

- [fapush](https://github.com/mi-g/fapush) has been developed for this jocly-firefox-addon project and released as a separate module.
It provides push notifications to Firefox addons.
- [jquery.jocly](https://github.com/mi-g/jquery-jocly) is a jQuery plugin to integrate Jocly games into your web site and modify or create 
your own games.
- [Jocly Wiki](https://wiki.jocly.com/) gives many details and examples of integration for the Jocly Game API







