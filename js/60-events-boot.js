'use strict';

// ============================
// TRENDING FILTERS
// ============================

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => renderTrending(btn.dataset.period));
});

// ============================
// KEYBOARD
// ============================

const ENTER_SUBMITS = { 'tile-modal': '#tile-save-btn', 'board-modal': '#board-save-btn', 'pinset-modal': '#pinset-save' };

document.addEventListener('keydown', e => {
  const top = topDialog();

  // Escape: close only the top dialog; otherwise clear the message
  if (e.key === 'Escape') {
    if (top) { e.preventDefault(); dismissTop(); return; }
    if (!isTypingTarget(e.target)) clearMessage();
    return;
  }

  // While a dialog is open, keys belong to the dialog only
  if (top) {
    if (e.key === 'Tab') { trapTab(e, top); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (top === 'pin-modal') {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); pinPress(e.key); return; }
      if (e.key === 'Backspace') { e.preventDefault(); pinPress('del'); return; }
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); pinPress('ok'); return; }
      return;
    }
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && ENTER_SUBMITS[top] && e.target.matches && e.target.matches('input[type="text"], input[type="password"]')) {
      e.preventDefault();
      $(ENTER_SUBMITS[top]).click();
    }
    return;
  }

  if (e.ctrlKey || e.metaKey || e.altKey) return;   // leave browser shortcuts alone
  if (isTypingTarget(e.target)) return;

  if (e.key === 'Enter') {
    // Enter on a focused button activates that button only
    if (e.target.closest && e.target.closest('button, a[href], [role="button"], select, input, textarea, audio')) return;
    e.preventDefault();
    speakMessage({ quietIfEmpty: true });
    return;
  }

  if (e.key === 'Backspace') {
    e.preventDefault();
    undoWord();
    return;
  }

  if (!STATE.shortcuts) return;   // single-key shortcuts can be switched off (WCAG 2.1.4)
  const k = e.key.toLowerCase();

  if (k === 'u') {
    if (STATE.isLocked) { e.preventDefault(); openPinModal(); }
    return;
  }

  if (!STATE.isLocked) {
    if (k === 's') { e.preventDefault(); openSettings(); return; }
    if (e.key === '1') { switchTab('home'); return; }
    if (e.key === '2') { switchTab('trending'); return; }
    if (e.key === '3') { switchTab('categories'); return; }
  }
});

// ============================
// RENDER ALL
// ============================

function renderAll() {
  applyTheme(STATE.theme);
  updateMessageBar();
  renderSavedPhrases();
  applyLockState();
  updateVoicePreview();
}

// ============================
// SERVICE WORKER (offline)
// Must be a real file (sw.js) next to index.html: browsers refuse
// service workers created from blob: URLs.
// ============================

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Offline support unavailable:', e && e.message));
}

// ============================
// BOOT
// ============================

(async function init() {
  const loaded = loadState();
  updateInert();
  renderAll();
  switchTab('home');
  registerServiceWorker();

  if (hasTTS()) {
    loadVoices();
    try { speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch (e) {}
  }

  // iOS: speech must first be started from a touch
  document.body.addEventListener('touchstart', () => {
    if (hasTTS()) { try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) {} }
  }, { once: true, passive: true });

  // Move audio from old saves (inline in localStorage) into IndexedDB,
  // then rewrite the save without it (also stores compacted usage history).
  await AudioStore.ready;
  let migrated = true;
  for (const [k, v] of Object.entries(loaded.audio || {})) {
    if (AudioStore.has(k)) continue;
    try { await AudioStore.put(k, v); } catch (e) { AudioStore.cacheOnly(k, v); migrated = false; }
  }
  if (!migrated) AudioStore.forceMemory();     // keep clips inline rather than lose them
  saveState({ quiet: true });
  updateVoicePreview();
})();
