/* ============================================================
   MoodFlare — App Logic (Supabase backend)
   ============================================================ */

// ---------- Supabase Setup -------------------------------- //
const IS_CONFIGURED =
  CONFIG.SUPABASE_URL      !== 'YOUR_SUPABASE_URL' &&
  CONFIG.SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';

let db = null;
if (IS_CONFIGURED) {
  const { createClient } = supabase;
  db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
} else {
  document.getElementById('setup-banner').style.display = 'flex';
}

// ---------- Supabase Data Layer --------------------------- //
async function fetchEntries() {
  const { data, error } = await db
    .from('entries')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

async function insertEntry(entry) {
  const { error } = await db.from('entries').insert([entry]);
  if (error) throw error;
}

async function removeEntry(id) {
  const { error } = await db.from('entries').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Pattern Lock — Supabase helpers --------------- //
async function fetchPattern(username) {
  const { data, error } = await db
    .from('user_patterns')
    .select('pattern_hash')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  return data; // { pattern_hash } or null
}

async function savePattern(username, hash) {
  const { error } = await db
    .from('user_patterns')
    .insert([{ username, pattern_hash: hash }]);
  if (error) throw error;
}

// ---------- Pattern Lock — Browser hashing ---------------- //
async function hashPattern(indices) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(indices.join(','))
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------- Pattern Lock — Grid constants ----------------- //
const PATTERN_MAX_RETRIES = 5;

// Center coordinates (px) within the 240×240 stage
const DOT_CENTERS = [
  { x:  40, y:  40 }, { x: 120, y:  40 }, { x: 200, y:  40 },
  { x:  40, y: 120 }, { x: 120, y: 120 }, { x: 200, y: 120 },
  { x:  40, y: 200 }, { x: 120, y: 200 }, { x: 200, y: 200 },
];

// ---------- Pattern Lock — Grid rendering / interaction --- //
let isDrawing         = false;
let activeDots        = [];
let _onPatternEnd     = null;
let _onPatternCancel  = null;
let _dotsBuilt        = false;

function buildPatternDots() {
  if (_dotsBuilt) return;
  const stage = document.getElementById('pattern-stage');
  DOT_CENTERS.forEach((c, i) => {
    const dot = document.createElement('div');
    dot.className = 'pattern-dot';
    dot.dataset.idx = i;
    dot.style.left = c.x + 'px';
    dot.style.top  = c.y + 'px';
    stage.insertBefore(dot, document.getElementById('pattern-svg'));
  });
  _dotsBuilt = true;
}

function resetPatternGrid() {
  isDrawing  = false;
  activeDots = [];
  document.querySelectorAll('.pattern-dot').forEach(d => {
    d.classList.remove('active', 'error');
  });
  const svg = document.getElementById('pattern-svg');
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  setPatternStatus('');
}

function setPatternStatus(msg, type = '') {
  const el = document.getElementById('pattern-status');
  el.textContent = msg;
  el.className = 'pattern-status' + (type ? ' ' + type : '');
}

function flashError(msg) {
  setPatternStatus(msg, 'error');
  document.querySelectorAll('.pattern-dot.active').forEach(d => {
    d.classList.remove('active');
    d.classList.add('error');
  });
  setTimeout(() => resetPatternGrid(), 700);
}

function _makeLine(cls, x1, y1, x2, y2) {
  const svg  = document.getElementById('pattern-svg');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('class', cls);
  line.setAttribute('x1', x1); line.setAttribute('y1', y1);
  line.setAttribute('x2', x2); line.setAttribute('y2', y2);
  svg.appendChild(line);
  return line;
}

function drawCommittedLine(fromIdx, toIdx) {
  const a = DOT_CENTERS[fromIdx], b = DOT_CENTERS[toIdx];
  _makeLine('pattern-line', a.x, a.y, b.x, b.y);
}

let _liveLine = null;
function updateLiveLine(stageX, stageY) {
  if (!activeDots.length) return;
  const last = DOT_CENTERS[activeDots[activeDots.length - 1]];
  if (_liveLine) _liveLine.remove();
  _liveLine = _makeLine('pattern-line-live', last.x, last.y, stageX, stageY);
}

function getCoords(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

function getHitDot(clientX, clientY) {
  const stage = document.getElementById('pattern-stage');
  const rect  = stage.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  for (let i = 0; i < DOT_CENTERS.length; i++) {
    const c  = DOT_CENTERS[i];
    const dx = sx - c.x, dy = sy - c.y;
    if (Math.sqrt(dx * dx + dy * dy) < 28) return i;
  }
  return null;
}

function _onPointerStart(e) {
  e.preventDefault();
  isDrawing = true;
  resetPatternGrid();
  isDrawing = true; // resetPatternGrid sets it false — re-enable
  const { x, y } = getCoords(e);
  const idx = getHitDot(x, y);
  if (idx !== null) {
    activeDots.push(idx);
    document.querySelector(`.pattern-dot[data-idx="${idx}"]`).classList.add('active');
  }
}

function _onPointerMove(e) {
  if (!isDrawing) return;
  e.preventDefault();
  const { x, y } = getCoords(e);
  const idx = getHitDot(x, y);
  if (idx !== null && !activeDots.includes(idx)) {
    if (activeDots.length) drawCommittedLine(activeDots[activeDots.length - 1], idx);
    activeDots.push(idx);
    document.querySelector(`.pattern-dot[data-idx="${idx}"]`).classList.add('active');
  }
  // Update dashed live line
  if (activeDots.length) {
    const stage = document.getElementById('pattern-stage');
    const rect  = stage.getBoundingClientRect();
    updateLiveLine(x - rect.left, y - rect.top);
  }
}

function _onPointerEnd() {
  if (!isDrawing) return;
  isDrawing = false;
  if (_liveLine) { _liveLine.remove(); _liveLine = null; }
  if (_onPatternEnd) _onPatternEnd(activeDots.slice());
}

// ---------- Pattern Lock — Modal open / close ------------- //
function openPatternModal({ title, subtitle, onPatternEnd, onCancel }) {
  buildPatternDots();
  resetPatternGrid();

  document.getElementById('pattern-title').textContent    = title;
  document.getElementById('pattern-subtitle').textContent = subtitle;
  _onPatternEnd    = onPatternEnd;
  _onPatternCancel = onCancel;

  const stage = document.getElementById('pattern-stage');
  stage.addEventListener('mousedown',  _onPointerStart);
  stage.addEventListener('touchstart', _onPointerStart, { passive: false });
  stage.addEventListener('mousemove',  _onPointerMove);
  stage.addEventListener('touchmove',  _onPointerMove,  { passive: false });
  window.addEventListener('mouseup',   _onPointerEnd);
  window.addEventListener('touchend',  _onPointerEnd);

  document.getElementById('btn-pattern-cancel').onclick = () => {
    closePatternModal();
    if (_onPatternCancel) _onPatternCancel();
  };

  document.getElementById('pattern-modal').style.display = 'flex';
}

function closePatternModal() {
  document.getElementById('pattern-modal').style.display = 'none';
  const stage = document.getElementById('pattern-stage');
  stage.removeEventListener('mousedown',  _onPointerStart);
  stage.removeEventListener('touchstart', _onPointerStart);
  stage.removeEventListener('mousemove',  _onPointerMove);
  stage.removeEventListener('touchmove',  _onPointerMove);
  window.removeEventListener('mouseup',  _onPointerEnd);
  window.removeEventListener('touchend', _onPointerEnd);
  resetPatternGrid();
}

// ---------- Pattern Lock — First-time (set) flow ---------- //
function runSetFlow(lower) {
  return new Promise(resolve => {
    let phase     = 'draw'; // 'draw' | 'confirm'
    let firstHash = null;

    function handleEnd(dots) {
      if (dots.length < 4) {
        flashError('Connect at least 4 dots');
        return;
      }
      hashPattern(dots).then(hash => {
        if (phase === 'draw') {
          firstHash = hash;
          phase = 'confirm';
          document.getElementById('pattern-subtitle').textContent =
            'Draw the same pattern again to confirm';
          resetPatternGrid();
          isDrawing = false;
        } else {
          // Confirm phase
          if (hash !== firstHash) {
            flashError('Patterns don\'t match — try again');
            setTimeout(() => {
              document.getElementById('pattern-subtitle').textContent =
                'Draw the same pattern again to confirm';
            }, 750);
            return;
          }
          // Patterns match — save
          savePattern(lower, firstHash)
            .then(() => {
              closePatternModal();
              resolve(true);
            })
            .catch(err => {
              // PK collision: someone else registered this username first — fall back to verify
              if (err?.code === '23505') {
                closePatternModal();
                fetchPattern(lower)
                  .then(row => row ? runVerifyFlow(lower, row.pattern_hash).then(resolve)
                                   : resolve(false))
                  .catch(() => resolve(false));
              } else {
                flashError('Could not save pattern — try again');
              }
            });
        }
      });
    }

    openPatternModal({
      title:        'Secure your username',
      subtitle:     'Draw a path through at least 4 dots',
      onPatternEnd: handleEnd,
      onCancel:     () => resolve(false),
    });
  });
}

// ---------- Pattern Lock — Returning (verify) flow -------- //
function runVerifyFlow(lower, storedHash) {
  return new Promise(resolve => {
    let retries = 0;

    function handleEnd(dots) {
      if (dots.length < 4) {
        flashError('Pattern too short');
        return;
      }
      hashPattern(dots).then(attempt => {
        if (attempt === storedHash) {
          closePatternModal();
          resolve(true);
        } else {
          retries++;
          const left = PATTERN_MAX_RETRIES - retries;
          if (left <= 0) {
            flashError('Too many failed attempts');
            setTimeout(() => { closePatternModal(); resolve(false); }, 900);
          } else {
            flashError(`Wrong pattern — ${left} attempt${left !== 1 ? 's' : ''} left`);
          }
        }
      });
    }

    openPatternModal({
      title:        'Verify your identity',
      subtitle:     'Draw your unlock pattern',
      onPatternEnd: handleEnd,
      onCancel:     () => resolve(false),
    });
  });
}

// ---------- Pattern Lock — Auth gate ---------------------- //
async function requirePatternAuth(username) {
  const lower = username.toLowerCase();
  let existing;
  try {
    existing = await fetchPattern(lower);
  } catch {
    showToast('❌ Could not verify identity. Check your connection.');
    return false;
  }
  return existing
    ? runVerifyFlow(lower, existing.pattern_hash)
    : runSetFlow(lower);
}

// ---------- Preset Moods ---------------------------------- //
const PRESET_MOODS = [
  { emoji: '😊', label: 'Happy'      },
  { emoji: '😢', label: 'Sad'        },
  { emoji: '😠', label: 'Angry'      },
  { emoji: '😰', label: 'Anxious'    },
  { emoji: '😌', label: 'Calm'       },
  { emoji: '😴', label: 'Tired'      },
  { emoji: '🤩', label: 'Excited'    },
  { emoji: '😔', label: 'Melancholy' },
  { emoji: '😤', label: 'Frustrated' },
  { emoji: '🥰', label: 'Loved'      },
  { emoji: '😶', label: 'Numb'       },
  { emoji: '✨', label: 'Grateful'   },
  { emoji: '✏️', label: 'Other…', isCustom: true },
];

// ---------- State ----------------------------------------- //
let selectedMoodKey  = null;
let chartInstance    = null;
let filterName       = '';
let filterMood       = '';
let filterDateRange  = 'all';   // 'all' | 'today' | 'week' | 'month'
let filterDebounce   = null;
// Cache last-fetched entries so filter changes don't re-fetch
let cachedEntries    = null;

// ---------- DOM refs -------------------------------------- //
const moodGrid           = document.getElementById('mood-grid');
const customWrap         = document.getElementById('custom-mood-wrap');
const customInput        = document.getElementById('custom-mood-input');
const intensitySlider    = document.getElementById('intensity');
const intensityLabel     = document.getElementById('intensity-label');
const charCount          = document.getElementById('char-count');
const descriptionEl      = document.getElementById('description');
const form               = document.getElementById('mood-form');
const toast              = document.getElementById('toast');
const tabBtns            = document.querySelectorAll('.tab-btn');
const filterNameEl       = document.getElementById('filter-name');
const moodPillsRow       = document.getElementById('mood-pills-row');
const moodFilterSection  = document.getElementById('mood-filter-section');
const datePillsRow       = document.getElementById('date-pills-row');
const btnClearFilter     = document.getElementById('btn-clear-filter');
const btnClearAll        = document.getElementById('btn-clear-all');
const entriesContainer   = document.getElementById('entries-container');
const emptyState         = document.getElementById('empty-state');
const errorState         = document.getElementById('error-state');
const errorStateMsg      = document.getElementById('error-state-msg');
const btnGoLog           = document.getElementById('btn-go-log');
const btnRetry           = document.getElementById('btn-retry');
const statsRow           = document.getElementById('stats-row');
const chartSection       = document.getElementById('chart-section');
const historySpinner     = document.getElementById('history-spinner');
const btnSubmit          = document.getElementById('btn-submit');
const btnSubmitIcon      = document.getElementById('btn-submit-icon');
const btnSubmitText      = document.getElementById('btn-submit-text');

// ---------- Build Mood Grid ------------------------------- //
function buildMoodGrid() {
  moodGrid.innerHTML = '';
  PRESET_MOODS.forEach(mood => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'mood-chip';
    chip.dataset.label = mood.label;
    chip.innerHTML = `
      <span class="chip-emoji">${mood.emoji}</span>
      <span class="chip-label">${mood.label}</span>
    `;
    chip.addEventListener('click', () => selectMood(chip, mood));
    moodGrid.appendChild(chip);
  });
}

function selectMood(chip, mood) {
  document.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('selected'));
  chip.classList.add('selected');
  if (mood.isCustom) {
    selectedMoodKey = 'custom';
    customWrap.style.display = 'block';
    customInput.focus();
  } else {
    selectedMoodKey = mood.label;
    customWrap.style.display = 'none';
    customInput.value = '';
  }
  document.getElementById('error-mood').textContent = '';
}

// ---------- Intensity Slider ------------------------------ //
function updateSlider() {
  const val = intensitySlider.value;
  intensityLabel.textContent = `${val} / 10`;
  const pct = ((val - 1) / 9) * 100;
  intensitySlider.style.setProperty('--pct', `${pct}%`);
}
intensitySlider.addEventListener('input', updateSlider);
updateSlider();

// ---------- Char Counter ---------------------------------- //
descriptionEl.addEventListener('input', () => {
  charCount.textContent = `${descriptionEl.value.length} / 500`;
});

// ---------- Form Submit ----------------------------------- //
form.addEventListener('submit', async e => {
  e.preventDefault();

  const nameVal = document.getElementById('user-name').value.trim();
  let moodLabel = '';
  let moodEmoji = '';

  if (selectedMoodKey === 'custom') {
    moodLabel = customInput.value.trim();
    moodEmoji = '✏️';
  } else if (selectedMoodKey) {
    const preset = PRESET_MOODS.find(m => m.label === selectedMoodKey);
    moodLabel = preset.label;
    moodEmoji = preset.emoji;
  }

  // Validate
  let valid = true;
  if (!nameVal) {
    document.getElementById('error-name').textContent = 'Please enter your name or ID.';
    valid = false;
  } else {
    document.getElementById('error-name').textContent = '';
  }
  if (!moodLabel) {
    document.getElementById('error-mood').textContent = 'Please select or enter a mood.';
    valid = false;
  } else {
    document.getElementById('error-mood').textContent = '';
  }
  if (!valid) return;

  if (!IS_CONFIGURED) {
    showToast('⚠️ Supabase is not configured yet.');
    return;
  }

  // Pattern auth gate — disable button while we check Supabase for existing pattern
  setSubmitLoading(true);
  const authed = await requirePatternAuth(nameVal);
  setSubmitLoading(false);

  if (!authed) return; // user cancelled or too many attempts

  // Save entry
  setSubmitLoading(true);
  try {
    const entry = {
      name:        nameVal,
      mood_label:  moodLabel,
      mood_emoji:  moodEmoji,
      intensity:   parseInt(intensitySlider.value, 10),
      description: descriptionEl.value.trim(),
    };
    await insertEntry(entry);
    cachedEntries = null;
    showToast(`✨ Logged "${moodLabel}" for ${nameVal}!`);
    resetForm();
  } catch (err) {
    showToast('❌ Could not save entry. Check your connection.');
    console.error(err);
  } finally {
    setSubmitLoading(false);
  }
});

function setSubmitLoading(loading) {
  btnSubmit.disabled = loading;
  if (loading) {
    btnSubmitIcon.textContent = '';
    btnSubmitText.textContent = 'Saving…';
    btnSubmit.classList.add('loading');
  } else {
    btnSubmitIcon.textContent = '💾';
    btnSubmitText.textContent = 'Save Entry';
    btnSubmit.classList.remove('loading');
  }
}

function resetForm() {
  form.reset();
  document.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('selected'));
  selectedMoodKey = null;
  customWrap.style.display = 'none';
  customInput.value = '';
  charCount.textContent = '0 / 500';
  intensitySlider.value = 5;
  updateSlider();
  document.getElementById('error-name').textContent = '';
  document.getElementById('error-mood').textContent = '';
}

// ---------- Toast ----------------------------------------- //
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ---------- Tab Navigation -------------------------------- //
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('.tab-panel').forEach(p => {
      p.style.display = 'none';
      p.classList.remove('active');
    });

    const panel = document.getElementById(`tab-${target}`);
    panel.style.display = 'block';
    panel.classList.add('active');

    if (target === 'history') renderHistory();
  });
});

btnGoLog.addEventListener('click', () => document.querySelector('[data-tab="log"]').click());
btnRetry.addEventListener('click', () => { cachedEntries = null; renderHistory(); });

// ---------- History --------------------------------------- //
filterNameEl.addEventListener('input', () => {
  filterName = filterNameEl.value.trim().toLowerCase();
  btnClearFilter.classList.toggle('visible', filterName.length > 0);
  updateClearAllBtn();
  clearTimeout(filterDebounce);
  filterDebounce = setTimeout(() => renderHistory(true), 300);
});

btnClearFilter.addEventListener('click', () => {
  filterNameEl.value = '';
  filterName = '';
  btnClearFilter.classList.remove('visible');
  updateClearAllBtn();
  renderHistory(true);
});

btnClearAll.addEventListener('click', () => {
  // Reset all filters
  filterNameEl.value = '';
  filterName  = '';
  filterMood  = '';
  filterDateRange = 'all';
  btnClearFilter.classList.remove('visible');
  // Reset date pills
  datePillsRow.querySelectorAll('.date-pill').forEach(p =>
    p.classList.toggle('active', p.dataset.range === 'all')
  );
  buildMoodPills(cachedEntries || [], true);
  updateClearAllBtn();
  renderHistory(true);
});

// Date pills
datePillsRow.querySelectorAll('.date-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    filterDateRange = pill.dataset.range;
    datePillsRow.querySelectorAll('.date-pill').forEach(p =>
      p.classList.toggle('active', p === pill)
    );
    updateClearAllBtn();
    renderHistory(true);
  });
});

function updateClearAllBtn() {
  const hasFilter = filterName || filterMood || filterDateRange !== 'all';
  btnClearAll.style.display = hasFilter ? '' : 'none';
}

// useCache=true means re-use cachedEntries (filter changed, no new data)
async function renderHistory(useCache = false) {
  if (!IS_CONFIGURED) {
    showHistoryEmpty();
    return;
  }

  setHistoryLoading(true);

  try {
    if (!useCache || cachedEntries === null) {
      cachedEntries = await fetchEntries();
    }
    const entries = applyFilters(cachedEntries);
    buildMoodPills(cachedEntries);
    renderHistoryUI(entries);
  } catch (err) {
    console.error(err);
    showHistoryError(err.message || 'Could not load entries.');
  } finally {
    setHistoryLoading(false);
  }
}

function applyFilters(entries) {
  let result = entries;
  if (filterName) result = result.filter(e => e.name.toLowerCase().includes(filterName));
  if (filterMood) result = result.filter(e => e.mood_label === filterMood);
  if (filterDateRange !== 'all') {
    const now  = new Date();
    const today = now.toISOString().slice(0, 10);
    if (filterDateRange === 'today') {
      result = result.filter(e => e.timestamp.slice(0, 10) === today);
    } else if (filterDateRange === 'week') {
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7);
      result = result.filter(e => new Date(e.timestamp) >= cutoff);
    } else if (filterDateRange === 'month') {
      const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1);
      result = result.filter(e => new Date(e.timestamp) >= cutoff);
    }
  }
  return result;
}

function buildMoodPills(entries, resetActive = false) {
  if (resetActive) filterMood = '';
  const moods = [...new Set(entries.map(e => e.mood_label))].sort();

  // Show or hide the mood filter section
  moodFilterSection.style.display = moods.length > 0 ? '' : 'none';

  moodPillsRow.innerHTML = '';

  // "All moods" pill
  const allPill = document.createElement('button');
  allPill.type = 'button';
  allPill.className = 'mood-pill' + (filterMood === '' ? ' active' : '');
  allPill.textContent = 'All moods';
  allPill.addEventListener('click', () => {
    filterMood = '';
    buildMoodPills(entries);
    updateClearAllBtn();
    renderHistory(true);
  });
  moodPillsRow.appendChild(allPill);

  moods.forEach(m => {
    const emoji = getEmoji(m);
    const pill  = document.createElement('button');
    pill.type   = 'button';
    pill.className = 'mood-pill' + (filterMood === m ? ' active' : '');
    pill.innerHTML = `<span>${emoji}</span><span>${m}</span>`;
    pill.addEventListener('click', () => {
      filterMood = m;
      buildMoodPills(entries);
      updateClearAllBtn();
      renderHistory(true);
    });
    moodPillsRow.appendChild(pill);
  });
}

function setHistoryLoading(on) {
  historySpinner.style.display = on ? 'flex' : 'none';
  if (on) {
    entriesContainer.innerHTML = '';
    emptyState.style.display  = 'none';
    errorState.style.display  = 'none';
    statsRow.style.display    = 'none';
    chartSection.style.display = 'none';
  }
}

function showHistoryEmpty() {
  emptyState.style.display   = 'block';
  errorState.style.display   = 'none';
  statsRow.style.display     = 'none';
  chartSection.style.display = 'none';
  entriesContainer.innerHTML = '';
}

function showHistoryError(msg) {
  errorStateMsg.textContent  = `Could not load entries: ${msg}`;
  errorState.style.display   = 'block';
  emptyState.style.display   = 'none';
  statsRow.style.display     = 'none';
  chartSection.style.display = 'none';
  entriesContainer.innerHTML = '';
}

function renderHistoryUI(entries) {
  entriesContainer.innerHTML = '';

  if (entries.length === 0) {
    showHistoryEmpty();
    return;
  }

  emptyState.style.display   = 'none';
  errorState.style.display   = 'none';
  statsRow.style.display     = 'flex';
  chartSection.style.display = 'block';

  renderStats(entries);
  renderChart(entries);
  renderEntries(entries);
}

// ---------- Stats ----------------------------------------- //
function renderStats(entries) {
  document.getElementById('stat-total').innerHTML =
    `<strong>${entries.length}</strong>Total entries`;

  const moodCounts = {};
  entries.forEach(e => { moodCounts[e.mood_label] = (moodCounts[e.mood_label] || 0) + 1; });
  const topMood  = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];
  const topEmoji = getEmoji(topMood[0]);
  document.getElementById('stat-top').innerHTML =
    `<strong>${topEmoji} ${topMood[0]}</strong>Top mood`;

  const streak = calcStreak(entries);
  document.getElementById('stat-streak').innerHTML =
    `<strong>${streak} day${streak !== 1 ? 's' : ''}</strong>Current streak`;
}

function calcStreak(entries) {
  if (!entries.length) return 0;
  const days = [...new Set(entries.map(e => e.timestamp.slice(0, 10)))].sort().reverse();
  let streak = 1;
  const today = new Date().toISOString().slice(0, 10);
  if (days[0] !== today && days[0] !== getPrevDay(today)) return 0;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === getPrevDay(days[i - 1])) streak++;
    else break;
  }
  return streak;
}

function getPrevDay(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getEmoji(label) {
  const preset = PRESET_MOODS.find(m => m.label === label);
  return preset ? preset.emoji : '✏️';
}

// ---------- Chart ----------------------------------------- //
function renderChart(entries) {
  const dayMap = {};
  entries.forEach(e => {
    const day = e.timestamp.slice(0, 10);
    if (!dayMap[day]) dayMap[day] = [];
    dayMap[day].push(e.intensity);
  });

  const labels = Object.keys(dayMap).sort();
  const data   = labels.map(d => {
    const arr = dayMap[d];
    return +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
  });

  const ctx = document.getElementById('mood-chart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.map(formatChartDate),
      datasets: [{
        label: 'Avg Intensity',
        data,
        fill: true,
        tension: 0.4,
        borderColor: '#f97316',
        backgroundColor: 'rgba(249,115,22,0.10)',
        pointBackgroundColor: '#ea580c',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a0900',
          borderColor: 'rgba(249,115,22,0.3)',
          borderWidth: 1,
          titleFont: { family: 'Nunito', weight: '800' },
          bodyFont:  { family: 'Nunito' },
          callbacks: { label: ctx => `Intensity: ${ctx.parsed.y} / 10` }
        }
      },
      scales: {
        y: {
          min: 0, max: 10,
          ticks: { stepSize: 2, font: { family: 'Nunito', size: 11 }, color: '#6b6b6b' },
          grid:  { color: 'rgba(255,255,255,0.04)' },
        },
        x: {
          ticks: { font: { family: 'Nunito', size: 11 }, color: '#6b6b6b', maxTicksLimit: 7 },
          grid:  { display: false },
        }
      }
    }
  });
}

function formatChartDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------- Entry Cards ----------------------------------- //
function renderEntries(entries) {
  const groups = {};
  entries.forEach(e => {
    const day = e.timestamp.slice(0, 10);
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  });

  const sortedDays = Object.keys(groups).sort().reverse();
  sortedDays.forEach(day => {
    const group = document.createElement('div');
    group.className = 'entry-date-group';

    const label = document.createElement('div');
    label.className = 'date-label';
    label.textContent = formatGroupDate(day);
    group.appendChild(label);

    groups[day].forEach(entry => group.appendChild(buildEntryCard(entry)));
    entriesContainer.appendChild(group);
  });
}

function formatGroupDate(iso) {
  const d         = new Date(iso + 'T00:00:00');
  const today     = new Date();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const sameDay   = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today))     return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function buildEntryCard(entry) {
  const card = document.createElement('div');
  card.className = 'entry-card';

  const time = new Date(entry.timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit'
  });

  card.innerHTML = `
    <div class="entry-header">
      <div class="entry-mood">
        <span class="entry-mood-emoji">${entry.mood_emoji}</span>
        <span>${escapeHTML(entry.mood_label)}</span>
      </div>
      <div class="entry-meta">
        <span class="entry-user">👤 ${escapeHTML(entry.name)}</span>
        <span class="entry-time">${time}</span>
        <button class="btn-delete" data-id="${entry.id}" title="Delete entry">🗑</button>
      </div>
    </div>
    <div class="entry-intensity">
      Intensity ${entry.intensity}/10 ${buildIntensityDots(entry.intensity)}
    </div>
    ${entry.description ? `<div class="entry-description">${escapeHTML(entry.description)}</div>` : ''}
  `;

  card.querySelector('.btn-delete').addEventListener('click', e => deleteEntry(e.currentTarget));
  return card;
}

function buildIntensityDots(intensity) {
  let html = '<span class="intensity-dots">';
  for (let i = 1; i <= 10; i++) {
    html += `<span class="intensity-dot ${i <= intensity ? 'filled' : ''}"></span>`;
  }
  return html + '</span>';
}

async function deleteEntry(btn) {
  const id = btn.dataset.id;
  btn.textContent = '⏳';
  btn.disabled    = true;

  try {
    await removeEntry(id);
    cachedEntries = null;
    showToast('Entry removed.');
    renderHistory();
  } catch (err) {
    btn.textContent = '🗑';
    btn.disabled    = false;
    showToast('❌ Could not delete entry.');
    console.error(err);
  }
}

// ---------- Utilities ------------------------------------- //
function escapeHTML(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

// ---------- Init ------------------------------------------ //
buildMoodGrid();
