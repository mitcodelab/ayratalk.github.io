'use strict';

// ============================
// THEME
// ============================

function applyTheme(t) {
  STATE.theme = t === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', STATE.theme);
  document.documentElement.setAttribute('data-tile-size', STATE.tileSize === 'large' ? 'large' : 'standard');
  document.documentElement.setAttribute('data-high-contrast', STATE.highContrast ? 'true' : 'false');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = STATE.theme === 'dark' ? '#1C1F2A' : '#1976D2';
}

// ============================
// SPEECH & AUDIO OUTPUT
// ============================

let voices = [];
const hasTTS = () => 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

function loadVoices() {
  try { voices = hasTTS() ? speechSynthesis.getVoices() : []; } catch (e) { voices = []; }
  populateVoiceSelect();
}

function populateVoiceSelect() {
  const sel = $('#setting-voice');
  sel.innerHTML = '';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = '— Default —';
  sel.appendChild(opt0);
  voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    if (v.voiceURI === STATE.ttsVoiceURI) opt.selected = true;
    sel.appendChild(opt);
  });
}

let playToken = 0;
let currentAudio = null, currentAudioDone = null, currentUtterance = null;

// Stops speech and clips; returns a token that later async steps check.
function stopAllOutput() {
  playToken++;
  if (currentAudio) { try { currentAudio.pause(); } catch (e) {} }
  if (currentAudioDone) { const done = currentAudioDone; currentAudioDone = null; done(false); }
  currentAudio = null;
  if (hasTTS()) { try { speechSynthesis.cancel(); } catch (e) {} }
  return playToken;
}

function makeUtterance(text) {
  const utt = new SpeechSynthesisUtterance(text);
  utt.volume = clamp(STATE.ttsVolume, 0, 1);
  utt.rate = clamp(STATE.ttsRate, 0.1, 10);
  if (STATE.ttsVoiceURI) {
    const v = voices.find(x => x.voiceURI === STATE.ttsVoiceURI);
    if (v) { utt.voice = v; if (v.lang) utt.lang = v.lang; }
  }
  return utt;
}

// Immediate speech (called straight from a tap, which iOS requires)
function speakText(text) {
  if (!text || !hasTTS()) return;
  try {
    speechSynthesis.cancel();
    currentUtterance = makeUtterance(text);
    speechSynthesis.speak(currentUtterance);
  } catch (e) { console.warn('Speech failed', e); }
}

// Speech that resolves when finished (used for sequences)
function speakAsync(text, token) {
  return new Promise(resolve => {
    if (!text || !hasTTS() || token !== playToken) { resolve(); return; }
    let done = false;
    const words = text.split(/\s+/).length;
    const timer = setTimeout(() => finish(), 2500 + words * 1200 / Math.max(0.5, STATE.ttsRate));
    function finish() { if (!done) { done = true; clearTimeout(timer); resolve(); } }
    try {
      const u = makeUtterance(text);
      u.onend = finish;
      u.onerror = finish;
      currentUtterance = u;
      speechSynthesis.speak(u);
    } catch (e) { finish(); }
  });
}

// Plays a clip; resolves true when it played to the end, false if it could not play.
function playClip(src) {
  return new Promise(resolve => {
    let a;
    try { a = new Audio(src); } catch (e) { resolve(false); return; }
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      if (currentAudio === a) { currentAudio = null; currentAudioDone = null; }
      resolve(ok);
    };
    currentAudio = a;
    currentAudioDone = finish;
    a.volume = clamp(STATE.ttsVolume, 0, 1);
    a.addEventListener('ended', () => finish(true));
    a.addEventListener('error', () => finish(false));
    let p;
    try { p = a.play(); } catch (e) { finish(false); return; }
    if (p && typeof p.catch === 'function') p.catch(() => finish(false));
  });
}

function outputTile(tile) {
  const token = stopAllOutput();
  const clip = STATE.outputMode === 'audio' ? AudioStore.get('tile:' + tile.id) : null;
  if (!clip) { speakText(tile.label); return; }
  // If the clip cannot play, fall back to speech so the tap is never silent
  playClip(clip).then(ok => { if (!ok && token === playToken) speakText(tile.label); });
}

function messageText() {
  return STATE.message.map(w => w.label).join(' ');
}

function speakMessage({ quietIfEmpty = false } = {}) {
  if (!STATE.message.length) { if (!quietIfEmpty) toast('Nothing to speak yet!'); return; }
  vibrate(50);
  const useClips = STATE.outputMode === 'audio' && STATE.message.some(w => w.tileId && AudioStore.has('tile:' + w.tileId));
  const token = stopAllOutput();
  if (!useClips) { speakText(messageText()); return; }
  playSequence(token);
}

// Audio mode: play each word's clip in order; words without a clip are spoken
async function playSequence(token) {
  const segs = [];
  STATE.message.forEach(w => {
    const clip = w.tileId ? AudioStore.get('tile:' + w.tileId) : null;
    if (clip) segs.push({ clip, text: w.label });
    else {
      const last = segs[segs.length - 1];
      if (last && !last.clip) last.text += ' ' + w.label; else segs.push({ clip: null, text: w.label });
    }
  });
  for (const s of segs) {
    if (token !== playToken) return;
    if (s.clip) {
      const ok = await playClip(s.clip);
      if (token !== playToken) return;
      if (!ok) await speakAsync(s.text, token);
    } else {
      await speakAsync(s.text, token);
    }
  }
}

// ============================
// TRENDING
// ============================

function lowerBound(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}

// Taps older than ~6 months become a count, so storage stays small
// and "All Time" totals stay correct.
function compactTrending(td, now = Date.now()) {
  const cutoff = now - TREND_KEEP_MS;
  Object.values(td).forEach(d => {
    if (!d.taps.length || d.taps[0] >= cutoff) return;
    const i = lowerBound(d.taps, cutoff);
    d.older = (d.older || 0) + i;
    d.olderLast = Math.max(d.olderLast || 0, d.taps[i - 1]);
    d.taps = d.taps.slice(i);
  });
}

function recordTap(tile) {
  if (!STATE.usageTracking) return;
  const id = tile.id;
  let d = STATE.trendingData[id];
  if (!d) d = STATE.trendingData[id] = { label: tile.label, emoji: tile.emoji, taps: [], older: 0, olderLast: 0 };
  d.label = tile.label;
  d.emoji = tile.emoji;
  d.img = isArtPath(tile.img) ? tile.img : '';
  const now = Date.now();
  if (d.taps.length && d.taps[d.taps.length - 1] > now) d.taps.sort((a, b) => a - b);
  d.taps.push(now);
  STATE.recentTileIds = [tile.id, ...STATE.recentTileIds.filter(id => id !== tile.id)].slice(0, 20);
  if (d.taps[0] < now - TREND_KEEP_MS) compactTrending({ [id]: d }, now);
  saveState({ quiet: true });
}

const PERIOD_MS = { day: 86400000, week: 604800000, month: 2592000000, '6months': 15552000000 };

function getTrendingFiltered(period) {
  const now = Date.now();
  const cutoff = period in PERIOD_MS ? now - PERIOD_MS[period] : -Infinity;
  const result = [];
  Object.entries(STATE.trendingData).forEach(([id, d]) => {
    const start = cutoff === -Infinity ? 0 : lowerBound(d.taps, cutoff);
    const count = (d.taps.length - start) + (period === 'all' ? (d.older || 0) : 0);
    if (!count) return;
    const last = d.taps.length ? d.taps[d.taps.length - 1] : (d.olderLast || 0);
    result.push({ id, label: d.label, emoji: d.emoji, img: isArtPath(d.img) ? d.img : (DEFAULT_TILE_ART[id] || ''), count, last, start, data: d });
  });
  result.sort((a, b) => b.count - a.count || b.last - a.last);
  return result;
}

const dayKey = ts => { const d = new Date(ts); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const dayFromKey = k => new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100, 12);

// Last 7 days that have taps, newest first (sorted by real date, not by text)
function dailyBreakdown(items) {
  const days = new Map();
  items.forEach(it => {
    const taps = it.data.taps;
    let seen = 0, lastK = null;
    for (let i = taps.length - 1; i >= it.start; i--) {
      const k = dayKey(taps[i]);
      if (k !== lastK) { seen++; lastK = k; if (seen > 7) break; }
      let day = days.get(k);
      if (!day) { day = new Map(); days.set(k, day); }
      const e = day.get(it.id) || { label: it.label, emoji: it.emoji, img: it.img, count: 0 };
      e.count++;
      day.set(it.id, e);
    }
  });
  return [...days.keys()].sort((a, b) => b - a).slice(0, 7)
    .map(k => ({ key: k, tiles: [...days.get(k).values()].sort((a, b) => b.count - a.count) }));
}

function syncFilterButtons(period) {
  document.querySelectorAll('.filter-btn').forEach(b => {
    const on = b.dataset.period === period;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function renderTrending(period = STATE.trendPeriod) {
  STATE.trendPeriod = period;
  syncFilterButtons(period);
  const container = $('#trending-content');
  const items = getTrendingFiltered(period);

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">📊</div><p>No usage data for this period.<br>Start tapping tiles to see trends!</p></div>`;
    return;
  }

  const maxCount = items[0].count;
  let html = `<div class="section-title">Top Tiles</div><div class="trending-list">`;
  items.slice(0, 20).forEach((item, i) => {
    const pct = Math.round((item.count / maxCount) * 100);
    const lastStr = item.last ? new Date(item.last).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    html += `
      <div class="trending-item">
        <div class="trending-rank"><span class="sr-only">Rank </span>${i + 1}</div>
        <div class="trending-emoji" aria-hidden="true">${symbolHTML(item, 'trending-emoji-char', 'trending-img')}</div>
        <div class="trending-info">
          <div class="trending-label">${esc(item.label)}</div>
          <div class="trending-meta">Last: ${esc(lastStr)}</div>
          <div class="trending-bar-wrap">
            <div class="trending-bar"><div class="trending-bar-fill" style="width:${pct}%"></div></div>
          </div>
        </div>
        <div class="trending-count">${item.count}<span class="sr-only"> taps</span></div>
      </div>`;
  });
  html += `</div>`;

  const days = dailyBreakdown(items);
  if (days.length > 0) {
    html += `<div class="section-title" style="margin-top:24px;">Daily Breakdown</div><div class="trending-list">`;
    days.forEach(day => {
      const label = dayFromKey(day.key).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      const topStr = day.tiles.slice(0, 3).map(t => `${symbolHTML(t, 'trending-mini-emoji', 'trending-mini-img')} ${esc(t.label)} ×${t.count}`).join(' · ');
      const total = day.tiles.reduce((s, t) => s + t.count, 0);
      html += `<div class="trending-item"><div style="flex:1;"><div class="trending-label">${esc(label)}</div><div class="trending-meta">${topStr}</div></div><div class="trending-count">${total}<span class="sr-only"> taps</span></div></div>`;
    });
    html += `</div>`;
  }

  container.innerHTML = html;
}
