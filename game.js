/* Frenemies — game logic
   Loads the corpus, builds Level 1, handles clicks and game state.
   Level 2 and audio come later. */

// ============================================================
// GAME STATE
// ============================================================
const GAME = {
  corpus: null,        // loaded from data/corpus.json
  direction: null,     // 'en-from-es' or 'es-from-en'
  level: 1,
  lives: 3,
  score: 0,
  level1Tiles: [],     // the 25 tiles drawn for the current level 1
  trapsHit: []         // for the lose-state debrief
};

const GRID_SIZE = 25;       // 5x5 grid
const TRAP_RATIO = 0.35;    // ~35% of tiles are traps; tweak to taste
const STARTING_LIVES = 3;

// ============================================================
// SCREEN MANAGEMENT
// ============================================================
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

// ============================================================
// CORPUS LOADING
// ============================================================
async function loadCorpus() {
  try {
    const response = await fetch('./data/corpus.json');
    if (!response.ok) throw new Error('Failed to load corpus.json: ' + response.status);
    GAME.corpus = await response.json();
    console.log('Corpus loaded:', GAME.corpus.level1_words.length, 'words,',
                                  GAME.corpus.level2_sentences.length, 'sentences');
  } catch (err) {
    console.error('Could not load corpus:', err);
    document.body.innerHTML = '<p style="padding:2rem;">Error loading game content. Check console.</p>';
  }
}

// ============================================================
// COVER SCREEN — direction selection
// ============================================================
function setupCoverScreen() {
  document.querySelectorAll('.direction-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      GAME.direction = btn.dataset.direction;
      console.log('Direction selected:', GAME.direction);
      startLevel1();
    });
  });
}

// ============================================================
// LEVEL 1 — WORD FIELD
// ============================================================
function startLevel1() {
  // Reset state
  GAME.level = 1;
  GAME.lives = STARTING_LIVES;
  GAME.score = 0;
  GAME.trapsHit = [];

  // Build the tile set from the corpus
  GAME.level1Tiles = pickTilesForLevel1();

  // Render
  renderLevel1Grid();
  updateHUD();
  setFeedback('Click a tile to claim it.', '');

  showScreen('screen-level1');
}

function pickTilesForLevel1() {
  // Determine which language the player will SEE based on direction
  // 'en-from-es' = player reads English (judging against Spanish meanings they assume)
  // 'es-from-en' = player reads Spanish (judging against English meanings they assume)
  const displayLang = (GAME.direction === 'en-from-es') ? 'en' : 'es';

  // Separate corpus into traps and safes for this direction
  const allWords = GAME.corpus.level1_words;
  const traps = allWords.filter(w => w.type === 'false_friend' && w.trap_in.includes(displayLang));
  const safes = allWords.filter(w => w.type === 'true_cognate');

  // Shuffle helpers
  const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

  const numTraps = Math.round(GRID_SIZE * TRAP_RATIO);
  const numSafes = GRID_SIZE - numTraps;

  const pickedTraps = shuffle(traps).slice(0, numTraps);
  const pickedSafes = shuffle(safes).slice(0, numSafes);

  // If we don't have enough of either, log a warning so we can grow the corpus later
  if (pickedTraps.length < numTraps) {
    console.warn(`Only ${pickedTraps.length} traps available for direction ${GAME.direction}; wanted ${numTraps}`);
  }
  if (pickedSafes.length < numSafes) {
    console.warn(`Only ${pickedSafes.length} safes available; wanted ${numSafes}`);
  }

  // Combine and shuffle into final tile order
  const allTiles = shuffle([...pickedTraps, ...pickedSafes]);

  // Annotate each tile with what to display and whether it's a trap
  return allTiles.map(word => ({
    word: word,
    displayText: word.forms[displayLang],
    isTrap: word.type === 'false_friend',
    claimed: false
  }));
}

function renderLevel1Grid() {
  const grid = document.getElementById('level1-grid');
  grid.innerHTML = '';

  GAME.level1Tiles.forEach((tile, index) => {
    const btn = document.createElement('button');
    btn.className = 'tile';
    btn.textContent = tile.displayText;
    btn.dataset.index = index;
    btn.addEventListener('click', () => handleTileClick(index));
    grid.appendChild(btn);
  });
}

function handleTileClick(index) {
  const tile = GAME.level1Tiles[index];
  if (tile.claimed) return;

  tile.claimed = true;
  const tileEl = document.querySelector(`#level1-grid .tile[data-index="${index}"]`);
  tileEl.disabled = true;

  if (tile.isTrap) {
    // Trap hit
    GAME.lives -= 1;
    GAME.trapsHit.push(tile.word);
    tileEl.classList.add('trap-hit');
    tileEl.innerHTML = `<div>${tile.displayText}<br><small>${tile.word.meanings[tile.word.trap_in[0]]}</small></div>`;
    setFeedback(`Trap. "${tile.displayText}" doesn't mean what it looks like.`, 'failure');

    if (GAME.lives <= 0) {
      endGame(false);
      return;
    }
  } else {
    // Safe claim
    GAME.score += 1;
    tileEl.classList.add('claimed');
    setFeedback(`Safe. "${tile.displayText}" is a true cognate.`, 'success');

    // Win check: all safe tiles claimed?
    const remainingSafes = GAME.level1Tiles.filter(t => !t.isTrap && !t.claimed);
    if (remainingSafes.length === 0) {
      // Level 1 complete!
      setTimeout(() => goToLevel2(), 800);
      return;
    }
  }

  updateHUD();
}

// ============================================================
// HUD AND FEEDBACK
// ============================================================
function updateHUD() {
  document.getElementById('level1-lives').textContent = GAME.lives;
  document.getElementById('level1-score').textContent = GAME.score;
}

function setFeedback(text, type) {
  const fb = document.getElementById('level1-feedback');
  fb.textContent = text;
  fb.className = 'feedback ' + (type || '');
}

// ============================================================
// LEVEL 2 PLACEHOLDER
// ============================================================
function goToLevel2() {
  document.getElementById('carryover-score').textContent = GAME.score;
  showScreen('screen-level2');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('level2-finish').addEventListener('click', () => endGame(true));
});

// ============================================================
// END STATES
// ============================================================
function endGame(won) {
  if (won) {
    document.getElementById('win-score').textContent = GAME.score;
    showScreen('screen-win');
  } else {
    document.getElementById('lose-score').textContent = GAME.score;
    renderLoseDebrief();

    // Reveal remaining traps on the board for visual debrief
    GAME.level1Tiles.forEach((tile, i) => {
      if (tile.isTrap && !tile.claimed) {
        const tileEl = document.querySelector(`#level1-grid .tile[data-index="${i}"]`);
        if (tileEl) tileEl.classList.add('trap-revealed');
      }
    });

    showScreen('screen-lose');
  }
}

function renderLoseDebrief() {
  const debrief = document.getElementById('lose-debrief');
  if (GAME.trapsHit.length === 0) {
    debrief.innerHTML = '';
    return;
  }

  const items = GAME.trapsHit.map(w => {
    const displayLang = (GAME.direction === 'en-from-es') ? 'en' : 'es';
    return `<li><strong>${w.forms[displayLang]}</strong> — ${w.meanings[displayLang]}</li>`;
  }).join('');

  debrief.innerHTML = '<p>The traps that caught you:</p><ul>' + items + '</ul>';
}

// ============================================================
// REPLAY
// ============================================================
function setupReplayButtons() {
  document.querySelectorAll('.replay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Reset to cover screen so player can re-pick direction
      showScreen('screen-cover');
    });
  });
}

// ============================================================
// INITIALIZATION
// ============================================================
async function init() {
  await loadCorpus();
  if (!GAME.corpus) return;
  setupCoverScreen();
  setupReplayButtons();
}

document.addEventListener('DOMContentLoaded', init);