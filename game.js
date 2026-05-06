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
  level1Tiles: [],     // the 20 tiles drawn for the current level 1
  level1TrapIds: [],   // ids of false friends that appeared in Level 1 (for connected pool in Level 2)
  level2Tiles: [],     // sentence tiles for Level 2
  safesTotal: 0,       // how many safe tiles in the current field
  safesClaimed: 0,     // how many the player has claimed so far
  trapsHit: []         // for the lose-state debrief
};

const GRID_SIZE = 20;             // 5x4 grid for Level 1
const TRAP_RATIO_MIN = 0.30;      // minimum % of tiles that are traps
const TRAP_RATIO_MAX = 0.45;      // maximum % of tiles that are traps
const STARTING_LIVES = 3;

// Level 2 settings
const LEVEL2_MAX_TILES = 12;        // cap Level 2 size (3x4 grid) regardless of pool
const LEVEL2_TRAP_RATIO_MIN = 0.40; // Level 2 is meant to be more challenging
const LEVEL2_TRAP_RATIO_MAX = 0.55;

// Sample a fresh trap ratio each level for variety
function pickTrapRatio() {
  return TRAP_RATIO_MIN + Math.random() * (TRAP_RATIO_MAX - TRAP_RATIO_MIN);
}

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
// COVER, INSTRUCTIONS, LANGUAGE SELECTOR
// ============================================================
// The prototype is locked to: English-native player learning Spanish.
// Direction 'es-from-en' means the player sees Spanish words/sentences and
// judges them against the English meanings they'd assume.
const PROTOTYPE_DIRECTION = 'es-from-en';

function setupCoverScreen() {
  // Cover screen: Play and Instructions buttons
  document.getElementById('cover-play-btn').addEventListener('click', () => {
    showScreen('screen-language');
  });
  document.getElementById('cover-instructions-btn').addEventListener('click', () => {
    showScreen('screen-instructions');
  });

  // Language screen: Play button starts the game with the locked direction
  document.getElementById('lang-play-btn').addEventListener('click', () => {
    GAME.direction = PROTOTYPE_DIRECTION;
    console.log('Direction locked to:', GAME.direction);
    startLevel1();
  });

  // Back buttons (used on instructions and language screens)
  document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.backTo || 'screen-cover';
      showScreen(target);
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
  GAME.level1TrapIds = [];

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

  // Sample a fresh trap ratio for this level so each session feels different
  const ratio = pickTrapRatio();
  const numTraps = Math.round(GRID_SIZE * ratio);
  const numSafes = GRID_SIZE - numTraps;
  console.log(`Level 1 ratio: ${(ratio * 100).toFixed(0)}% traps (${numTraps} traps / ${numSafes} safes)`);

  const pickedTraps = shuffle(traps).slice(0, numTraps);
  const pickedSafes = shuffle(safes).slice(0, numSafes);

  // Record which false friends appeared in Level 1 — Level 2 will draw sentences from these
  GAME.level1TrapIds = pickedTraps.map(w => w.id);

  // If we don't have enough of either, log a warning so we can grow the corpus later
  if (pickedTraps.length < numTraps) {
    console.warn(`Only ${pickedTraps.length} traps available for direction ${GAME.direction}; wanted ${numTraps}`);
  }
  if (pickedSafes.length < numSafes) {
    console.warn(`Only ${pickedSafes.length} safes available; wanted ${numSafes}`);
  }

  // Track the actual safe count delivered (may be less than requested if corpus is small)
  GAME.safesTotal = pickedSafes.length;
  GAME.safesClaimed = 0;

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
    GAME.safesClaimed += 1;
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
  const progressEl = document.getElementById('level1-progress');
  if (progressEl) {
    progressEl.textContent = `${GAME.safesClaimed} / ${GAME.safesTotal}`;
  }
}

function setFeedback(text, type) {
  const fb = document.getElementById('level1-feedback');
  fb.textContent = text;
  fb.className = 'feedback ' + (type || '');
}

// ============================================================
// LEVEL 2 — SENTENCE FIELD
// ============================================================
function goToLevel2() {
  // Compute starting lives from Level 1 performance per the brief's formula:
  // Level 2 starting lives = 1 + (Level 1 score / max possible) * 2, rounded.
  // This rewards strong Level 1 play with more margin for error in Level 2.
  const level1MaxScore = GAME.safesTotal;
  const ratio = (level1MaxScore > 0) ? (GAME.score / level1MaxScore) : 0;
  const carryoverLives = Math.max(1, Math.round(1 + ratio * 2));

  // Reset state for Level 2 (preserve score, replace lives)
  GAME.level = 2;
  GAME.lives = carryoverLives;
  GAME.trapsHit = [];

  // Build the sentence tile set
  GAME.level2Tiles = pickTilesForLevel2();

  // Render
  renderLevel2Grid();
  updateLevel2HUD();
  document.getElementById('carryover-lives').textContent = carryoverLives;
  setLevel2Feedback('Click a sentence to claim it.', '');

  showScreen('screen-level2');
}

function pickTilesForLevel2() {
  const allSentences = GAME.corpus.level2_sentences;

  // The player's reading language matches the direction they picked at the cover screen.
  // 'en-from-es' = player reads English; 'es-from-en' = player reads Spanish.
  const displayLang = (GAME.direction === 'en-from-es') ? 'en' : 'es';

  // Filter to sentences that:
  //   1. Reference a false friend that appeared in Level 1 (connected pool)
  //   2. Are in the language the player chose to read
  const relevantSentences = allSentences.filter(s =>
    GAME.level1TrapIds.includes(s.based_on) && s.language === displayLang
  );

  if (relevantSentences.length === 0) {
    console.warn('No Level 2 sentences available for Level 1 traps in chosen language; falling back to all sentences in that language');
    // Defensive fallback: ignore the connected-pool constraint, keep the language constraint
    return shuffleSentences(allSentences.filter(s => s.language === displayLang)).slice(0, LEVEL2_MAX_TILES);
  }

  // Sample a target trap ratio for this level
  const ratio = LEVEL2_TRAP_RATIO_MIN + Math.random() * (LEVEL2_TRAP_RATIO_MAX - LEVEL2_TRAP_RATIO_MIN);

  // Decide how many tiles total — capped by LEVEL2_MAX_TILES and limited by available sentences
  const targetTotal = Math.min(LEVEL2_MAX_TILES, relevantSentences.length);
  const targetTraps = Math.round(targetTotal * ratio);
  const targetSafes = targetTotal - targetTraps;

  const traps = relevantSentences.filter(s => !s.correct_usage);
  const safes = relevantSentences.filter(s => s.correct_usage);

  const pickedTraps = shuffleSentences(traps).slice(0, targetTraps);
  const pickedSafes = shuffleSentences(safes).slice(0, targetSafes);

  console.log(`Level 2: ${pickedTraps.length} traps + ${pickedSafes.length} safes from pool of ${relevantSentences.length} sentences (${(ratio * 100).toFixed(0)}% target trap ratio)`);

  // Set up progress tracking — in Level 2, "safe" tiles are correct usages
  GAME.safesTotal = pickedSafes.length;
  GAME.safesClaimed = 0;

  // Combine and shuffle into final tile order
  const allTiles = shuffleSentences([...pickedTraps, ...pickedSafes]);

  return allTiles.map(sentence => ({
    sentence: sentence,
    isTrap: !sentence.correct_usage,  // misuses are traps in Level 2
    claimed: false
  }));
}

function shuffleSentences(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function renderLevel2Grid() {
  const grid = document.getElementById('level2-grid');
  grid.innerHTML = '';

  GAME.level2Tiles.forEach((tile, index) => {
    const btn = document.createElement('button');
    btn.className = 'tile tile-sentence';
    btn.dataset.index = index;

    // Build sentence with the flagged word emphasized
    const sentence = tile.sentence.sentence;
    const flaggedWord = tile.sentence.flagged_word;
    // Use a regex that handles word boundaries case-insensitively, but preserves original case
    const escaped = flaggedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b(${escaped})\\b`, 'i');
    const html = sentence.replace(regex, '<span class="flagged">$1</span>');
    btn.innerHTML = html;

    btn.addEventListener('click', () => handleLevel2TileClick(index));
    grid.appendChild(btn);
  });
}

function handleLevel2TileClick(index) {
  const tile = GAME.level2Tiles[index];
  if (tile.claimed) return;

  tile.claimed = true;
  const tileEl = document.querySelector(`#level2-grid .tile[data-index="${index}"]`);
  tileEl.disabled = true;

  if (tile.isTrap) {
    // Trap hit — sentence used the word incorrectly
    GAME.lives -= 1;
    GAME.trapsHit.push(tile.sentence);
    tileEl.classList.add('trap-hit');
    setLevel2Feedback(`Trap. The word is misused — ${tile.sentence.translation_meaning}.`, 'failure');

    if (GAME.lives <= 0) {
      endGame(false);
      return;
    }
  } else {
    // Safe claim — sentence used the word correctly
    GAME.score += 1;
    GAME.safesClaimed += 1;
    tileEl.classList.add('claimed');
    setLevel2Feedback(`Safe. Correct usage — ${tile.sentence.translation_meaning}.`, 'success');

    // Win check: all safe sentences claimed?
    const remainingSafes = GAME.level2Tiles.filter(t => !t.isTrap && !t.claimed);
    if (remainingSafes.length === 0) {
      // Level 2 complete — full game won!
      setTimeout(() => endGame(true), 1000);
      return;
    }
  }

  updateLevel2HUD();
}

function updateLevel2HUD() {
  document.getElementById('level2-lives').textContent = GAME.lives;
  document.getElementById('level2-score').textContent = GAME.score;
  document.getElementById('level2-progress').textContent = `${GAME.safesClaimed} / ${GAME.safesTotal}`;
}

function setLevel2Feedback(text, type) {
  const fb = document.getElementById('level2-feedback');
  fb.textContent = text;
  fb.className = 'feedback ' + (type || '');
}

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

    // Reveal remaining traps on whichever level the player lost on
    if (GAME.level === 1) {
      GAME.level1Tiles.forEach((tile, i) => {
        if (tile.isTrap && !tile.claimed) {
          const tileEl = document.querySelector(`#level1-grid .tile[data-index="${i}"]`);
          if (tileEl) tileEl.classList.add('trap-revealed');
        }
      });
    } else {
      GAME.level2Tiles.forEach((tile, i) => {
        if (tile.isTrap && !tile.claimed) {
          const tileEl = document.querySelector(`#level2-grid .tile[data-index="${i}"]`);
          if (tileEl) tileEl.classList.add('trap-revealed');
        }
      });
    }

    showScreen('screen-lose');
  }
}

function renderLoseDebrief() {
  const debrief = document.getElementById('lose-debrief');
  if (GAME.trapsHit.length === 0) {
    debrief.innerHTML = '';
    return;
  }

  // Trap data shape differs between Level 1 (word objects) and Level 2 (sentence objects)
  let items;
  if (GAME.level === 1) {
    const displayLang = (GAME.direction === 'en-from-es') ? 'en' : 'es';
    items = GAME.trapsHit.map(w => {
      return `<li><strong>${w.forms[displayLang]}</strong> — ${w.meanings[displayLang]}</li>`;
    }).join('');
  } else {
    items = GAME.trapsHit.map(s => {
      return `<li>"${s.sentence}" — ${s.translation_meaning}</li>`;
    }).join('');
  }

  debrief.innerHTML = '<p>The traps that caught you:</p><ul>' + items + '</ul>';
}

// ============================================================
// REPLAY
// ============================================================
function setupReplayButtons() {
  document.querySelectorAll('.replay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Direction is locked, so replay goes straight to a fresh Level 1
      startLevel1();
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