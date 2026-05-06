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
const LEVEL2_TILES = 8;             // fixed grid: 2 columns x 4 rows
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
  audio.onScreenChange(screenId);
  updateNavButton(screenId);

  // Reset language selection when the language screen becomes active —
  // makes the click-to-select gesture fresh every time the player visits.
  if (screenId === 'screen-language') {
    document.querySelectorAll('.lang-btn.lang-target').forEach(b => b.classList.remove('lang-selected'));
    const playBtn = document.getElementById('lang-play-btn');
    if (playBtn) playBtn.disabled = true;
  }
}

// ============================================================
// NAV BUTTON — context-aware Back/Quit in top-left
// ============================================================
// On instructions/language screens: shows "Back" and returns to cover screen.
// On Level 1/Level 2 screens: shows "Quit" and triggers a confirmation modal.
// On other screens (cover, summary, win, lose): hidden.
function updateNavButton(screenId) {
  const btn = document.getElementById('nav-btn');
  if (!btn) return;

  // Reset state
  btn.classList.remove('visible', 'quit-mode');
  btn.onclick = null;

  if (screenId === 'screen-language') {
    btn.textContent = '← Back';
    btn.classList.add('visible');
    btn.onclick = () => showScreen('screen-cover');
  } else if (screenId === 'screen-level1' || screenId === 'screen-level2') {
    btn.textContent = 'Quit';
    btn.classList.add('visible', 'quit-mode');
    btn.onclick = () => requestQuit();
  }
  // All other screens: button stays hidden
}

// ============================================================
// QUIT FLOW — confirmation modal then return to cover
// ============================================================
function requestQuit(onConfirm) {
  showConfirmation('Are you sure you want to quit?', () => {
    if (onConfirm) onConfirm();
    showScreen('screen-cover');
  });
}

function showConfirmation(message, onConfirm) {
  const modal = document.getElementById('confirm-modal');
  const messageEl = document.getElementById('confirm-modal-message');
  const yesBtn = document.getElementById('confirm-yes-btn');
  const noBtn = document.getElementById('confirm-no-btn');

  messageEl.textContent = message;

  // Re-wire buttons each time to ensure clean state
  yesBtn.onclick = () => {
    closeConfirmation();
    if (onConfirm) onConfirm();
  };
  noBtn.onclick = () => closeConfirmation();

  modal.classList.add('active');
}

function closeConfirmation() {
  document.getElementById('confirm-modal').classList.remove('active');
}

function setupConfirmationModal() {
  const modal = document.getElementById('confirm-modal');
  // Click backdrop closes the dialog as a "Cancel"
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeConfirmation();
  });
  // Escape key closes the dialog
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) closeConfirmation();
  });
}

// ============================================================
// AUDIO — background music with crossfade and mute toggle
// ============================================================
const audio = {
  intro: null,
  gameplay: null,
  muted: true,                  // start muted by default; user must opt in
  current: null,                // 'intro' | 'gameplay' | null
  baseVolume: 0.5,              // perceived volume target when unmuted
  fadeDurationMs: 800,
  fadeTimer: null,

  init() {
    this.intro = document.getElementById('audio-intro');
    this.gameplay = document.getElementById('audio-gameplay');
    this.intro.volume = 0;
    this.gameplay.volume = 0;

    // Wire up the mute button
    const btn = document.getElementById('mute-btn');
    btn.addEventListener('click', () => this.toggleMute());
  },

  // Map screen IDs to which track should be playing on that screen
  trackForScreen(screenId) {
    const introScreens = ['screen-cover', 'screen-language'];
    const gameplayScreens = ['screen-level1', 'screen-level2'];
    const silentScreens = ['screen-win', 'screen-lose'];
    if (introScreens.includes(screenId)) return 'intro';
    if (gameplayScreens.includes(screenId)) return 'gameplay';
    if (silentScreens.includes(screenId)) return null;
    return null;
  },

  onScreenChange(screenId) {
    const target = this.trackForScreen(screenId);
    this.switchTo(target);
  },

  switchTo(target) {
    if (target === this.current) return;  // already playing the right track

    const oldTrack = this.current === 'intro' ? this.intro :
                     this.current === 'gameplay' ? this.gameplay : null;
    const newTrack = target === 'intro' ? this.intro :
                     target === 'gameplay' ? this.gameplay : null;

    this.current = target;

    // Crossfade: fade old out, fade new in simultaneously
    if (oldTrack) this.fade(oldTrack, oldTrack.volume, 0, () => oldTrack.pause());

    if (newTrack && !this.muted) {
      newTrack.currentTime = 0;
      const playPromise = newTrack.play();
      // Browser may block autoplay before first interaction — that's fine, just swallow it
      if (playPromise) playPromise.catch(() => { /* will play after first interaction */ });
      this.fade(newTrack, 0, this.baseVolume);
    }
  },

  fade(track, fromVol, toVol, onComplete) {
    const steps = 20;
    const stepMs = this.fadeDurationMs / steps;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      track.volume = Math.max(0, Math.min(1, fromVol + (toVol - fromVol) * (i / steps)));
      if (i >= steps) {
        clearInterval(interval);
        if (onComplete) onComplete();
      }
    }, stepMs);
  },

  toggleMute() {
    this.muted = !this.muted;
    const btn = document.getElementById('mute-btn');
    btn.setAttribute('aria-pressed', this.muted ? 'true' : 'false');

    if (this.muted) {
      // Fade out current track
      const t = this.current === 'intro' ? this.intro :
                this.current === 'gameplay' ? this.gameplay : null;
      if (t) this.fade(t, t.volume, 0, () => t.pause());
    } else {
      // Unmute: start whichever track matches the current screen
      const activeScreen = document.querySelector('.screen.active');
      if (activeScreen) {
        const target = this.trackForScreen(activeScreen.id);
        if (target) {
          const t = target === 'intro' ? this.intro : this.gameplay;
          this.current = target;
          t.currentTime = 0;
          const playPromise = t.play();
          if (playPromise) playPromise.catch(() => {});
          this.fade(t, 0, this.baseVolume);
        }
      }
    }
  },

  // Fade out the current track without changing mute state — used when modal pauses
  // gameplay reflectively. The next showScreen() call will resume music for whichever
  // screen comes next.
  duck() {
    const t = this.current === 'intro' ? this.intro :
              this.current === 'gameplay' ? this.gameplay : null;
    if (t) this.fade(t, t.volume, 0, () => t.pause());
    this.current = null;
  }
};

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
    openInstructionsModal();
  });

  // Language screen: clicking an available target tile selects it (only one at a time)
  const playBtn = document.getElementById('lang-play-btn');
  document.querySelectorAll('.lang-btn.lang-target:not(.lang-disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      // Clear other selections in the target group, then select this one
      document.querySelectorAll('.lang-btn.lang-target').forEach(b => b.classList.remove('lang-selected'));
      btn.classList.add('lang-selected');
      // Enable Play now that a learning language is selected
      playBtn.disabled = false;
    });
  });

  // Language screen: Play button starts the game with the locked direction
  playBtn.addEventListener('click', () => {
    if (playBtn.disabled) return;
    GAME.direction = PROTOTYPE_DIRECTION;
    console.log('Direction locked to:', GAME.direction);
    startLevel1();
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
    btn.addEventListener('dblclick', (e) => {
      e.preventDefault();
      handleTileDoubleClick(index);
    });
    grid.appendChild(btn);
  });
}

function handleTileClick(index) {
  const tile = GAME.level1Tiles[index];
  if (tile.claimed) return;

  tile.claimed = true;
  const tileEl = document.querySelector(`#level1-grid .tile[data-index="${index}"]`);

  if (tile.isTrap) {
    // Trap hit — tile turns red, stays clickable for the double-click reveal
    GAME.lives -= 1;
    GAME.trapsHit.push(tile.word);
    tileEl.classList.add('trap-hit');
    setFeedback(`Trap. Double-click the tile to see what it really means.`, 'failure');

    if (GAME.lives <= 0) {
      endGame(false);
      return;
    }
  } else {
    // Safe claim — tile turns green and is no longer interactive
    GAME.score += 1;
    GAME.safesClaimed += 1;
    tileEl.classList.add('claimed');
    tileEl.disabled = true;
    setFeedback(`Safe. "${tile.displayText}" is a true cognate.`, 'success');

    // Win check: all safe tiles claimed?
    const remainingSafes = GAME.level1Tiles.filter(t => !t.isTrap && !t.claimed);
    if (remainingSafes.length === 0) {
      // Level 1 complete — go to summary screen, not straight to Level 2
      setTimeout(() => goToLevel1Summary(), 800);
      return;
    }
  }

  updateHUD();
}

function handleTileDoubleClick(index) {
  const tile = GAME.level1Tiles[index];
  // Only respond to double-click on already-claimed false-friend tiles
  if (!tile.claimed || !tile.isTrap) return;
  openTileModal(tile.word);
}

// ============================================================
// TILE MODAL — false-friend reveal
// ============================================================
// When a player double-clicks a claimed false-friend tile, this opens
// a modal showing both the source-language word and the deceptive
// English-language equivalent the player likely assumed.
function openTileModal(word) {
  const modal = document.getElementById('tile-modal');
  const content = document.getElementById('tile-modal-content');

  // Spanish form + what it actually means in Spanish (the truth)
  // English form + what 'compromise' (etc.) actually means in English (the trap they assumed)
  content.innerHTML = `
    <div class="modal-row">
      <span class="modal-lang-tag">(ES)</span>
      <span class="modal-word">${word.forms.es}</span>
    </div>
    <p class="modal-meaning">${word.meanings.es}</p>
    <hr class="modal-divider">
    <div class="modal-row">
      <span class="modal-lang-tag">(EN)</span>
      <span class="modal-word">${word.forms.en}</span>
    </div>
    <p class="modal-meaning">${word.meanings.en}</p>
    <p class="modal-hint">Double-click anywhere or press Esc to close.</p>
  `;

  modal.classList.add('active');
}

function closeTileModal() {
  document.getElementById('tile-modal').classList.remove('active');
}

function setupTileModal() {
  const modal = document.getElementById('tile-modal');

  // Double-click anywhere on the modal closes it
  modal.addEventListener('dblclick', closeTileModal);

  // Click on the backdrop (outside the modal content) closes it
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeTileModal();
  });

  // Esc key closes it
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) closeTileModal();
  });
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
// LEVEL 1 SUMMARY SCREEN
// ============================================================
function goToLevel1Summary() {
  // Render stats
  const statsEl = document.getElementById('summary-stats');
  statsEl.innerHTML = `
    <div class="summary-stat">
      <p class="summary-stat-label">Score</p>
      <p class="summary-stat-value">${GAME.score}</p>
    </div>
    <div class="summary-stat">
      <p class="summary-stat-label">Lives Remaining</p>
      <p class="summary-stat-value">${GAME.lives}</p>
    </div>
    <div class="summary-stat">
      <p class="summary-stat-label">Traps Hit</p>
      <p class="summary-stat-value">${GAME.trapsHit.length}</p>
    </div>
  `;

  // Conditionally show the trap-tile section or the perfect-play message
  const trapsSection = document.getElementById('summary-traps-section');
  const perfectMessage = document.getElementById('summary-perfect-message');

  if (GAME.trapsHit.length > 0) {
    trapsSection.style.display = '';
    perfectMessage.style.display = 'none';
    renderSummaryTraps();
  } else {
    trapsSection.style.display = 'none';
    perfectMessage.style.display = '';
  }

  // Wire the action buttons (re-wire each time to ensure clean state)
  document.getElementById('summary-continue-btn').onclick = () => {
    closeSummaryModal();
    goToLevel2();
  };
  document.getElementById('summary-quit-btn').onclick = () => {
    // requestQuit handles its own confirmation; on confirm, summary modal also closes
    requestQuit(() => closeSummaryModal());
  };

  openSummaryModal();
}

function openSummaryModal() {
  document.getElementById('summary-modal').classList.add('active');
  // Fade out background music — the summary is a quiet, reflective pause
  audio.duck();
}

function closeSummaryModal() {
  document.getElementById('summary-modal').classList.remove('active');
  // Note: music doesn't auto-restore here because Continue takes us to Level 2
  // (which has its own music) and Quit takes us to cover (which restarts music).
}

function openInstructionsModal() {
  document.getElementById('instructions-modal').classList.add('active');
}

function closeInstructionsModal() {
  document.getElementById('instructions-modal').classList.remove('active');
}

function setupPopupModals() {
  // Instructions modal: Close button, backdrop click, and Escape all dismiss
  const instrModal = document.getElementById('instructions-modal');
  document.getElementById('instructions-close-btn').onclick = closeInstructionsModal;
  instrModal.addEventListener('click', (e) => {
    if (e.target === instrModal) closeInstructionsModal();
  });

  // Summary modal: only the explicit buttons dismiss (no backdrop click,
  // since the user must make a choice to continue or quit)
  // Buttons are wired in goToLevel1Summary each time the modal opens.

  // Escape closes whichever popup modal is currently active
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (instrModal.classList.contains('active')) {
      closeInstructionsModal();
    }
    // Note: summary modal intentionally does NOT close on Escape —
    // the user must make a choice (Continue or Quit).
  });
}

function renderSummaryTraps() {
  const grid = document.getElementById('summary-traps-grid');
  grid.innerHTML = '';

  // Render each false friend the player hit as a clickable tile
  GAME.trapsHit.forEach((word, index) => {
    const btn = document.createElement('button');
    btn.className = 'tile trap-hit';
    btn.textContent = word.forms.es;  // show the Spanish word (the one the player saw)
    btn.dataset.index = index;
    // Single-click does nothing; double-click opens the existing tile modal
    btn.addEventListener('dblclick', (e) => {
      e.preventDefault();
      openTileModal(word);
    });
    grid.appendChild(btn);
  });
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
    return shuffleSentences(allSentences.filter(s => s.language === displayLang)).slice(0, LEVEL2_TILES);
  }

  // Sample a target trap ratio for this level
  const ratio = LEVEL2_TRAP_RATIO_MIN + Math.random() * (LEVEL2_TRAP_RATIO_MAX - LEVEL2_TRAP_RATIO_MIN);

  // Always aim for exactly LEVEL2_TILES tiles (8) — fixed grid size
  const targetTotal = LEVEL2_TILES;
  const targetTraps = Math.round(targetTotal * ratio);
  const targetSafes = targetTotal - targetTraps;

  // Connected-pool traps and safes (limited to false friends from Level 1)
  let traps = relevantSentences.filter(s => !s.correct_usage);
  let safes = relevantSentences.filter(s => s.correct_usage);

  // If the connected pool is too thin to honor the trap ratio, top up from the broader
  // language pool. This prioritizes maintaining gameplay difficulty over strict pool purity.
  if (traps.length < targetTraps) {
    const extraTraps = allSentences.filter(s =>
      s.language === displayLang && !s.correct_usage &&
      !traps.some(t => t.id === s.id)
    );
    traps = traps.concat(shuffleSentences(extraTraps).slice(0, targetTraps - traps.length));
  }
  if (safes.length < targetSafes) {
    const extraSafes = allSentences.filter(s =>
      s.language === displayLang && s.correct_usage &&
      !safes.some(t => t.id === s.id)
    );
    safes = safes.concat(shuffleSentences(extraSafes).slice(0, targetSafes - safes.length));
  }

  const pickedTraps = shuffleSentences(traps).slice(0, targetTraps);
  const pickedSafes = shuffleSentences(safes).slice(0, targetSafes);

  console.log(`Level 2: ${pickedTraps.length} traps + ${pickedSafes.length} safes (${(ratio * 100).toFixed(0)}% target trap ratio, connected pool size: ${relevantSentences.length})`);

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
  audio.init();
  setupCoverScreen();
  setupReplayButtons();
  setupTileModal();
  setupConfirmationModal();
  setupPopupModals();
}

document.addEventListener('DOMContentLoaded', init);