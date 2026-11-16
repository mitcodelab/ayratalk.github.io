'use strict';

// ============================
// STORAGE
// ============================

let storageWarned = false;

function buildSaveObject() {
  const inlineAudio = AudioStore.mode === 'memory';
  const includeInlineAudio = boards => inlineAudio
    ? boards.map(b => ({ ...b, tiles: b.tiles.map(t => AudioStore.has('tile:' + t.id) ? { ...t, audioData: AudioStore.get('tile:' + t.id) } : t) }))
    : boards;
  const boards = includeInlineAudio(STATE.customBoards);
  const boardOverrides = includeInlineAudio(STATE.boardOverrides);
  const out = {
    v: 3,
    currentBoardId: STATE.currentBoardId,
    outputMode: STATE.outputMode,
    theme: STATE.theme,
    tileSize: STATE.tileSize,
    highContrast: STATE.highContrast,
    usageTracking: STATE.usageTracking,
    ttsVolume: STATE.ttsVolume,
    ttsRate: STATE.ttsRate,
    ttsVoiceURI: STATE.ttsVoiceURI,
    haptic: STATE.haptic,
    shortcuts: STATE.shortcuts,
    customBoards: boards,
    boardOverrides,
    deletedBoardIds: STATE.deletedBoardIds,
    favoriteTileIds: STATE.favoriteTileIds,
    recentTileIds: STATE.recentTileIds,
    savedPhrases: STATE.savedPhrases,
    trendingData: STATE.trendingData
  };
  if (inlineAudio && AudioStore.has('voice-sample')) out.voiceSample = AudioStore.get('voice-sample');
  return out;
}

// Returns true when the data really reached storage. Never fails silently.
function saveState({ quiet = false } = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSaveObject()));
    storageWarned = false;
    return true;
  } catch (e) {
    console.warn('Storage save failed', e);
    if (!quiet || !storageWarned) {
      toast('⚠️ Not saved: this browser\'s storage is full or blocked. Export a backup, then remove unused clips or boards.', 7000);
      storageWarned = true;
    }
    return false;
  }
}

// Validates anything loaded from storage or an imported file.
function normalizeData(d) {
  const out = { settings: {}, customBoards: [], boardOverrides: [], deletedBoardIds: [], favoriteTileIds: [], recentTileIds: [], savedPhrases: [], trendingData: {}, audio: {}, recognized: false, skipped: 0 };
  if (!d || typeof d !== 'object' || Array.isArray(d)) return out;
  const s = out.settings;
  const skip = () => { out.skipped++; };

  if ('outputMode' in d) { if (d.outputMode === 'tts' || d.outputMode === 'audio') s.outputMode = d.outputMode; else skip(); }
  if ('theme' in d) { if (d.theme === 'light' || d.theme === 'dark') s.theme = d.theme; else skip(); }
  if ('tileSize' in d) { if (d.tileSize === 'standard' || d.tileSize === 'large') s.tileSize = d.tileSize; else skip(); }
  if ('highContrast' in d) { if (typeof d.highContrast === 'boolean') s.highContrast = d.highContrast; else skip(); }
  if ('usageTracking' in d) { if (typeof d.usageTracking === 'boolean') s.usageTracking = d.usageTracking; else skip(); }
  if ('ttsVolume' in d) { if (isNum(d.ttsVolume)) s.ttsVolume = clamp(d.ttsVolume, 0, 1); else skip(); }
  if ('ttsRate' in d) { if (isNum(d.ttsRate)) s.ttsRate = clamp(d.ttsRate, 0.5, 2); else skip(); }
  if ('ttsVoiceURI' in d) { if (typeof d.ttsVoiceURI === 'string') s.ttsVoiceURI = d.ttsVoiceURI.slice(0, 300); else skip(); }
  if ('haptic' in d) { if (typeof d.haptic === 'boolean') s.haptic = d.haptic; else skip(); }
  if ('shortcuts' in d) { if (typeof d.shortcuts === 'boolean') s.shortcuts = d.shortcuts; else skip(); }
  if (Object.keys(s).length) out.recognized = true;

  const audioMap = (d.audio && typeof d.audio === 'object' && !Array.isArray(d.audio)) ? d.audio : {};
  const boardIds = new Set(DEFAULT_BOARDS.map(b => b.id));
  const tileIds = new Set();
  DEFAULT_BOARDS.forEach(b => b.tiles.forEach(t => tileIds.add(t.id)));
  const defaultBoard = id => DEFAULT_BOARDS.find(b => b.id === id);
  const homeTileIds = new Set((defaultBoard('home')?.tiles || []).map(t => t.id));
  const safeParts = parts => Array.isArray(parts) && parts.length >= 2 && parts.length <= 4 && parts.every(id => homeTileIds.has(cleanId(id)))
    ? parts.map(cleanId)
    : null;

  if ('deletedBoardIds' in d) {
    if (Array.isArray(d.deletedBoardIds)) {
      out.deletedBoardIds = [...new Set(d.deletedBoardIds.map(cleanId).filter(id => boardIds.has(id) && id !== 'home'))];
      out.recognized = true;
    } else skip();
  }
  const deletedBoardIds = new Set(out.deletedBoardIds);

  if ('boardOverrides' in d) {
    if (Array.isArray(d.boardOverrides)) {
      out.recognized = true;
      const seenOverrides = new Set();
      d.boardOverrides.forEach(b => {
        if (!b || typeof b !== 'object') { skip(); return; }
        const id = cleanId(b.id);
        const base = defaultBoard(id);
        if (!base || deletedBoardIds.has(id) || seenOverrides.has(id)) { skip(); return; }
        seenOverrides.add(id);
        const board = { id, name: cleanText(b.name, 30) || base.name, icon: cleanIcon(b.icon) || base.icon, isStandard: true, tiles: [] };
        board.img = isArtPath(b.img) ? b.img : base.img;
        const seenTileIds = new Set();
        (Array.isArray(b.tiles) ? b.tiles : []).forEach(t => {
          if (!t || typeof t !== 'object') { skip(); return; }
          const label = cleanText(t.label, 40);
          if (!label) { skip(); return; }
          const oldId = cleanId(t.id);
          const baseTile = base.tiles.find(item => item.id === oldId);
          let tid = oldId;
          if (!tid || seenTileIds.has(tid) || (!baseTile && tileIds.has(tid))) tid = uid('custom');
          seenTileIds.add(tid);
          tileIds.add(tid);
          const tileObj = {
            id: tid,
            label,
            emoji: cleanIcon(t.emoji) || (baseTile && baseTile.emoji) || '💬',
            color: COLOR_NAMES.includes(t.color) ? t.color : (baseTile && baseTile.color) || ''
          };
          if (isArtPath(t.img)) tileObj.img = t.img;
          else if ('img' in t) tileObj.img = '';
          else if (baseTile && isArtPath(baseTile.img)) tileObj.img = baseTile.img;
          if (Array.isArray(t.parts)) {
            const parts = safeParts(t.parts);
            if (parts) tileObj.parts = parts; else skip();
          }
          board.tiles.push(tileObj);
          const clip = isAudioUrl(t.audioData) ? t.audioData : (oldId && isAudioUrl(audioMap['tile:' + oldId]) ? audioMap['tile:' + oldId] : null);
          if (clip) out.audio['tile:' + tid] = clip;
        });
        out.boardOverrides.push(board);
      });
    } else skip();
  }

  if ('customBoards' in d) {
    if (Array.isArray(d.customBoards)) {
      out.recognized = true;
      d.customBoards.forEach(b => {
        if (!b || typeof b !== 'object') { skip(); return; }
        const name = cleanText(b.name, 30);
        if (!name) { skip(); return; }
        let id = cleanId(b.id);
        if (!id || boardIds.has(id)) id = uid('board');   // never shadow a standard board
        boardIds.add(id);
        const board = { id, name, icon: cleanIcon(b.icon) || '📋', isStandard: false, tiles: [] };
        if (isArtPath(b.img)) board.img = b.img;
        (Array.isArray(b.tiles) ? b.tiles : []).forEach(t => {
          if (!t || typeof t !== 'object') { skip(); return; }
          const label = cleanText(t.label, 40);
          if (!label) { skip(); return; }
          const oldId = cleanId(t.id);
          let tid = oldId;
          if (!tid || tileIds.has(tid)) tid = uid('custom');
          tileIds.add(tid);
          const tileObj = { id: tid, label, emoji: cleanIcon(t.emoji) || '💬', color: COLOR_NAMES.includes(t.color) ? t.color : '' };
          if (isArtPath(t.img)) tileObj.img = t.img;
          if (Array.isArray(t.parts)) {
            const parts = safeParts(t.parts);
            if (parts) tileObj.parts = parts; else skip();
          }
          board.tiles.push(tileObj);
          const clip = isAudioUrl(t.audioData) ? t.audioData : (oldId && isAudioUrl(audioMap['tile:' + oldId]) ? audioMap['tile:' + oldId] : null);
          if (clip) out.audio['tile:' + tid] = clip;
        });
        out.customBoards.push(board);
      });
    } else skip();
  }

  if (Array.isArray(d.favoriteTileIds)) out.favoriteTileIds = [...new Set(d.favoriteTileIds.map(cleanId).filter(Boolean))].slice(0, 500);
  if (Array.isArray(d.recentTileIds)) out.recentTileIds = [...new Set(d.recentTileIds.map(cleanId).filter(Boolean))].slice(0, 20);
  if (Array.isArray(d.savedPhrases)) out.savedPhrases = d.savedPhrases.filter(p => p && typeof p === 'object' && Array.isArray(p.words)).slice(0, 20).map(p => ({
    id: cleanId(p.id) || uid('phrase'),
    label: cleanText(p.label, 80) || 'Saved phrase',
    words: p.words.slice(0, 30).filter(w => w && typeof w === 'object' && typeof w.label === 'string').map(w => ({ label:cleanText(w.label,40), emoji:cleanIcon(w.emoji), img:isArtPath(w.img) ? w.img : '', tileId:cleanId(w.tileId) }))
  })).filter(p => p.words.length);

  if ('trendingData' in d) {
    const td = d.trendingData;
    if (td && typeof td === 'object' && !Array.isArray(td)) {
      out.recognized = true;
      Object.entries(td).forEach(([id, e]) => {
        const key = cleanId(id);
        if (!key || !e || typeof e !== 'object') { skip(); return; }
        const taps = Array.isArray(e.taps) ? e.taps.map(t => (isNum(t) ? t : (t && isNum(t.ts) ? t.ts : NaN))).filter(isNum) : [];
        if (!Array.isArray(e.taps) && 'taps' in e) skip();
        const older = isNum(e.older) ? Math.max(0, Math.floor(e.older)) : 0;
        if (!taps.length && !older) return;
        taps.sort((a, b) => a - b);
        out.trendingData[key] = {
          label: cleanText(e.label, 40) || key,
          emoji: cleanIcon(e.emoji),
          img: isArtPath(e.img) ? e.img : '',
          taps, older,
          olderLast: isNum(e.olderLast) ? e.olderLast : 0
        };
      });
    } else skip();
  }

  const vs = isAudioUrl(d.voiceSample) ? d.voiceSample : (isAudioUrl(audioMap['voice-sample']) ? audioMap['voice-sample'] : null);
  if (vs) { out.audio['voice-sample'] = vs; out.recognized = true; }

  compactTrending(out.trendingData);
  return out;
}

function loadState() {
  let saved = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch (e) { console.warn('Storage load failed', e); }
  if (!saved) return { audio: {} };
  const clean = normalizeData(saved);
  Object.assign(STATE, clean.settings);
  STATE.customBoards = clean.customBoards;
  STATE.boardOverrides = clean.boardOverrides;
  STATE.deletedBoardIds = clean.deletedBoardIds;
  STATE.favoriteTileIds = clean.favoriteTileIds;
  STATE.recentTileIds = clean.recentTileIds;
  STATE.savedPhrases = clean.savedPhrases;
  STATE.trendingData = clean.trendingData;
  STATE.currentBoardId = typeof saved.currentBoardId === 'string' ? saved.currentBoardId : 'home';
  if (!getBoardById(STATE.currentBoardId)) STATE.currentBoardId = 'home';
  return clean;
}

// ============================
// UTILITY
// ============================

function toast(msg, duration = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), duration);
}

function vibrate(ms = 30) {
  if (STATE.haptic && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (e) {}
  }
}

function getAllBoards() {
  const overrides = new Map((STATE.boardOverrides || []).map(board => [board.id, board]));
  const deleted = new Set(STATE.deletedBoardIds || []);
  const standards = DEFAULT_BOARDS.filter(board => !deleted.has(board.id)).map(board => overrides.get(board.id) || board);
  const all = [...standards, ...STATE.customBoards];
  const byId = new Map(all.flatMap(b => (b.tiles || []).map(t => [t.id, t])));
  const virtual = [];
  const favorites = STATE.favoriteTileIds.map(id => byId.get(id)).filter(Boolean);
  const recent = STATE.recentTileIds.map(id => byId.get(id)).filter(Boolean);
  if (favorites.length) virtual.push({ id:'favorites', name:'Favorites', icon:'⭐', isStandard:true, tiles:favorites });
  if (recent.length) virtual.push({ id:'recent', name:'Recent', icon:'🕘', isStandard:true, tiles:recent });
  return [...virtual, ...all];
}

function getBoardById(id) {
  const standard = DEFAULT_BOARDS.find(board => board.id === id);
  if (standard) {
    if ((STATE.deletedBoardIds || []).includes(id)) return undefined;
    return (STATE.boardOverrides || []).find(board => board.id === id) || standard;
  }
  const custom = STATE.customBoards.find(board => board.id === id);
  if (custom) return custom;
  if (id === 'favorites' || id === 'recent') return getAllBoards().find(board => board.id === id);
  return undefined;
}

function toggleFavorite(tile) {
  const before = STATE.favoriteTileIds;
  STATE.favoriteTileIds = before.includes(tile.id) ? before.filter(id => id !== tile.id) : [...before, tile.id].slice(-500);
  if (!saveState()) { STATE.favoriteTileIds = before; return; }
  renderBoardNav();
  renderCurrentBoard();
}

function isVisible(el) {
  if (!el || !el.isConnected) return false;
  if (!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

function isTypingTarget(t) {
  if (!t || !t.tagName) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  if (t.tagName !== 'INPUT') return false;
  return !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color'].includes(t.type);
}

// ============================
// DIALOGS (one stack: Escape closes only the top one,
// focus is kept inside it and returned to the opener)
// ============================

const DIALOG_IDS = ['settings-panel', 'pin-modal', 'tile-modal', 'board-modal', 'confirm-modal', 'pinset-modal'];
const BACKGROUND_IDS = ['message-bar', 'tab-bar', 'content', 'lock-indicator'];
const dialogStack = [];

function topDialog() { return dialogStack.length ? dialogStack[dialogStack.length - 1].id : null; }
function isDialogOpen(id) { return dialogStack.some(d => d.id === id); }

function setInert(el, on) {
  if (!el) return;
  if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
}

function updateInert() {
  const top = topDialog();
  BACKGROUND_IDS.forEach(id => setInert(document.getElementById(id), !!top));
  DIALOG_IDS.forEach(id => setInert(document.getElementById(id), id !== top));
}

function focusables(root) {
  return [...root.querySelectorAll('button, [href], input, select, textarea, audio[controls], [tabindex]:not([tabindex="-1"])')]
    .filter(x => !x.disabled && x.getAttribute('tabindex') !== '-1' && !x.hidden && isVisible(x) && !x.closest('[inert]'));
}

function openDialog(id, { onDismiss } = {}) {
  if (isDialogOpen(id)) return;
  const el = document.getElementById(id);
  const opener = document.activeElement;
  dialogStack.push({ id, opener, openerKey: opener && opener.dataset ? opener.dataset.focusKey || null : null, onDismiss });
  el.classList.add('open');
  el.removeAttribute('aria-hidden');
  updateInert();
  const target = el.querySelector('[data-autofocus]') || focusables(el)[0];
  if (target) { try { target.focus({ preventScroll: true }); } catch (e) {} }
}

function closeDialog(id, { restoreFocus = true } = {}) {
  if (id === 'tile-modal' && typeof stopTileRecording === 'function') stopTileRecording(true);
  const el = document.getElementById(id);
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  const idx = dialogStack.findIndex(d => d.id === id);
  if (idx === -1) { updateInert(); return; }
  const wasTop = idx === dialogStack.length - 1;
  const [entry] = dialogStack.splice(idx, 1);
  updateInert();
  if (restoreFocus && wasTop) restoreFocusTo(entry);
}

function restoreFocusTo(entry) {
  let t = entry.opener;
  const usable = x => x && x.isConnected && x !== document.body && !x.closest('[inert]') && isVisible(x);
  if (!usable(t) && entry.openerKey) t = document.querySelector(`[data-focus-key="${CSS.escape(entry.openerKey)}"]`);
  if (usable(t)) { try { t.focus({ preventScroll: true }); } catch (e) {} }
  else if (document.activeElement && document.activeElement.closest('[inert], .modal-overlay:not(.open), #settings-panel:not(.open)')) document.activeElement.blur();
}

function dismissTop() {
  const top = dialogStack[dialogStack.length - 1];
  if (!top) return;
  if (top.onDismiss) top.onDismiss(); else closeDialog(top.id);
}

function trapTab(e, id) {
  const el = document.getElementById(id);
  const items = focusables(el);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0], last = items[items.length - 1];
  const a = document.activeElement;
  if (e.shiftKey && (a === first || !el.contains(a))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (a === last || !el.contains(a))) { e.preventDefault(); first.focus(); }
}

// Kept for compatibility with older code
const openModal = id => openDialog(id);
const closeModal = id => closeDialog(id);

// ----- Confirm dialog: one permanent pair of listeners, so a dismissed
// confirmation can never fire later.
let confirmResolver = null;
function finishConfirm(val) {
  const r = confirmResolver;
  confirmResolver = null;
  closeDialog('confirm-modal');
  if (r) r(val);
}
function showConfirm(msg) {
  if (confirmResolver) finishConfirm(false);
  return new Promise(resolve => {
    $('#confirm-msg').textContent = msg;
    confirmResolver = resolve;
    openDialog('confirm-modal', { onDismiss: () => finishConfirm(false) });
  });
}
$('#confirm-ok').addEventListener('click', () => finishConfirm(true));
$('#confirm-cancel').addEventListener('click', () => finishConfirm(false));
