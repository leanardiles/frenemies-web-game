Frenemies — False Cognates Game
Leandro Ardiles
AIM5014: Special Topics: The Future of Work and AI

================================================
HOW TO PLAY
================================================

Easiest (recommended): visit the live game online.

  https://leanardiles.github.io/frenemies-web-game/

This is the deployed version on GitHub Pages. No setup needed.


If you prefer to run it locally, the easiest way is with Python:

  1. Open a terminal in this folder
  2. Run:  python -m http.server 8000
           (or: python3 -m http.server 8000  on macOS/Linux)
  3. Open your browser to:  http://localhost:8000

This serves the game over HTTP so all assets (corpus, audio, images)
load correctly.


Note: opening index.html directly in a browser (file:// protocol) will
not work because modern browsers block local file loading for the
corpus JSON. Please use the URL above or run a local server.

================================================
CONTENTS
================================================

  index.html          Main page — entry point
  styles.css          All styling
  game.js             All game logic
  data/
    corpus.json       Game content (false cognates and sentences)
  audio/
    theme-intro.mp3   Background music for intro screens
    theme-gameplay.mp3 Background music for Level 1 and Level 2
    sound-shk.mp3     Click and correct-claim sound
    sound-fail.mp3    Trap sound
    sound-level-clear.mp3   Level cleared voice cue
    sound-level-fail.mp3    Game over voice cue
    level-one-intro.mp3     "Nivel uno" voice intro
    level-two-intro.mp3     "Nivel dos" voice intro
  images/
    intro-background.png    Background image for cover/language screens
    playing-background.png  Background image for Level 1/2

================================================
TECHNICAL NOTES
================================================

  - No build step required. Vanilla HTML/CSS/JS.
  - All content (words, sentences) is static JSON, no API calls.
  - Audio is HTML5 audio elements, no Web Audio API.
  - Tested in modern Chromium-based browsers.

================================================
LIVE GAME
================================================

  https://leanardiles.github.io/frenemies-web-game/