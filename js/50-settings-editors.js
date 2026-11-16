'use strict';

// ============================
// SETTINGS
// ============================

function openSettings() {
  if (STATE.isLocked) return;
  $('#setting-output-mode').value = STATE.outputMode;
  $('#setting-theme').value = STATE.theme;
  $('#setting-tile-size').value = STATE.tileSize;
  $('#setting-high-contrast').checked = STATE.highContrast;
  $('#setting-usage-tracking').checked = STATE.usageTracking;
  $('#setting-volume').value = STATE.ttsVolume;
  $('#setting-rate').value = STATE.ttsRate;
  $('#setting-haptic').checked = STATE.haptic;
  $('#setting-shortcuts').checked = STATE.shortcuts;
  populateVoiceSelect();
  updateVoicePreview();
  updatePinStatus();
  openDialog('settings-panel');
}

function closeSettings() {
  closeDialog('settings-panel');
}

$('#settings-close').addEventListener('click', closeSettings);
$('#settings-panel').addEventListener('click', e => {
  if (e.target === $('#settings-panel') && topDialog() === 'settings-panel') closeSettings();
});
$('#tab-settings').addEventListener('click', () => { if (!STATE.isLocked) openSettings(); });

// Settings controls (ignored while locked)
function onSetting(id, ev, fn) {
  document.getElementById(id).addEventListener(ev, e => {
    if (STATE.isLocked) return;
    fn(e);
    saveState();
  });
}
onSetting('setting-output-mode', 'change', e => { STATE.outputMode = e.target.value === 'audio' ? 'audio' : 'tts'; });
onSetting('setting-theme', 'change', e => applyTheme(e.target.value));
onSetting('setting-tile-size', 'change', e => { STATE.tileSize = e.target.value === 'large' ? 'large' : 'standard'; applyTheme(STATE.theme); renderCurrentBoard(); });
onSetting('setting-high-contrast', 'change', e => { STATE.highContrast = e.target.checked; applyTheme(STATE.theme); });
onSetting('setting-usage-tracking', 'change', e => { STATE.usageTracking = e.target.checked; });
onSetting('setting-volume', 'input', e => { STATE.ttsVolume = clamp(parseFloat(e.target.value) || 0, 0, 1); });
onSetting('setting-rate', 'input', e => { STATE.ttsRate = clamp(parseFloat(e.target.value) || 1, 0.5, 2); });
onSetting('setting-voice', 'change', e => { STATE.ttsVoiceURI = e.target.value; });
onSetting('setting-haptic', 'change', e => { STATE.haptic = e.target.checked; });
onSetting('setting-shortcuts', 'change', e => { STATE.shortcuts = e.target.checked; });

// Buttons that open a hidden file picker (keyboard-operable)
document.querySelectorAll('[data-file-trigger]').forEach(b => {
  b.addEventListener('click', () => {
    if (STATE.isLocked) return;
    document.getElementById(b.dataset.fileTrigger).click();
  });
});

// ----- Audio files: type, size and "can this device play it" checks
function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('read failed'));
    r.readAsDataURL(file);
  });
}

function canPlayFile(file) {
  return new Promise(resolve => {
    let url;
    try { url = URL.createObjectURL(file); } catch (e) { resolve(true); return; }
    const a = new Audio();
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      clearTimeout(t);
      a.removeAttribute('src');
      try { a.load(); } catch (e) {}
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    // Some browsers only load media after a tap; don't block the upload on that
    const t = setTimeout(() => finish(true), 4000);
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => finish(true));
    a.addEventListener('error', () => finish(false));
    a.src = url;
  });
}

async function readAudioFile(file) {
  if (!file) return { error: 'No file chosen.' };
  const looksAudio = /^audio\//.test(file.type) || /\.(mp3|wav|m4a|aac|ogg|oga|opus|webm|flac|caf)$/i.test(file.name || '');
  if (!looksAudio) return { error: 'That file is not an audio clip. Choose an MP3 or WAV file.' };
  if (file.size > MAX_AUDIO_BYTES) return { error: `Clip is too large (${(file.size / 1048576).toFixed(1)} MB). Use one under 5 MB.` };
  if (!(await canPlayFile(file))) return { error: 'This clip can\'t be played on this device. Try an MP3 or WAV file.' };
  try { return { dataUrl: await readAsDataURL(file) }; } catch (e) { return { error: 'Could not read that file.' }; }
}

let tileRecorder = null, tileRecordingStream = null, tileRecordingChunks = [];
function stopTileRecording(discard = false) {
  const recorder = tileRecorder;
  tileRecorder = null;
  if (recorder && discard) { recorder.ondataavailable = null; recorder.onstop = null; }
  if (recorder && recorder.state === 'recording') {
    try { recorder.stop(); } catch (e) {}
  }
  if (tileRecordingStream) tileRecordingStream.getTracks().forEach(t => t.stop());
  tileRecordingStream = null;
  if (discard) {
    $('#tile-record-start').classList.remove('hidden');
    $('#tile-record-stop').classList.add('hidden');
    $('#tile-record-status').textContent = '';
  }
}
$('#tile-record-start').addEventListener('click', async () => {
  if (STATE.isLocked) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('Audio recording is not supported by this browser. Choose an audio file instead.', 5000); return; }
  try {
    tileRecordingStream = await navigator.mediaDevices.getUserMedia({ audio:true });
    const options = {};
    const candidates = ['audio/webm;codecs=opus','audio/mp4','audio/webm'];
    const mimeType = candidates.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    if (mimeType) options.mimeType = mimeType;
    const rec = new MediaRecorder(tileRecordingStream, options);
    tileRecorder = rec; tileRecordingChunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) tileRecordingChunks.push(e.data); };
    rec.onerror = () => { stopTileRecording(true); toast('Recording failed. You can choose an audio file instead.', 4500); };
    rec.onstop = async () => {
      if (tileRecordingStream) tileRecordingStream.getTracks().forEach(t => t.stop());
      tileRecordingStream = null; tileRecorder = null;
      $('#tile-record-start').classList.remove('hidden');
      $('#tile-record-stop').classList.add('hidden');
      const type = rec.mimeType || (tileRecordingChunks[0] && tileRecordingChunks[0].type) || 'audio/webm';
      const ext = type.includes('mp4') ? 'm4a' : 'webm';
      const file = new File(tileRecordingChunks, `talkboard-recording.${ext}`, { type });
      const result = await readAudioFile(file);
      if (result.error) { $('#tile-record-status').textContent = ''; toast(result.error, 5000); return; }
      tileModalData.recordedClip = result.dataUrl;
      $('#tile-record-status').textContent = 'Recording ready. Save the tile to keep it.';
    };
    rec.start();
    $('#tile-record-start').classList.add('hidden');
    $('#tile-record-stop').classList.remove('hidden');
    $('#tile-record-status').textContent = 'Recording…';
  } catch (err) {
    stopTileRecording(true);
    toast('Microphone access was unavailable. Check browser permission or choose an audio file.', 5500);
  }
});
$('#tile-record-stop').addEventListener('click', () => {
  if (tileRecorder && tileRecorder.state === 'recording') tileRecorder.stop();
  $('#tile-record-status').textContent = 'Saving recording…';
});

// Voice sample (reference recording)
$('#upload-voice').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';                       // lets the same file be chosen again
  if (!file || STATE.isLocked) return;
  const r = await readAudioFile(file);
  if (r.error) { toast(r.error, 4500); return; }
  try {
    await setAudio('voice-sample', r.dataUrl);
    updateVoicePreview();
    toast('Voice sample saved on this device.');
  } catch (err) {
    toast('Could not save the voice sample: storage is full or blocked.', 5000);
  }
});

$('#btn-delete-voice').addEventListener('click', async () => {
  if (STATE.isLocked) return;
  try { await AudioStore.del('voice-sample'); } catch (e) {}
  if (AudioStore.mode === 'memory') saveState();
  updateVoicePreview();
  toast('Voice sample deleted.');
});

function updateVoicePreview() {
  const previewRow = $('#voice-preview-row');
  const previewAudio = $('#voice-preview');
  const deleteBtn = $('#btn-delete-voice');
  const vs = AudioStore.get('voice-sample');
  if (vs) {
    previewRow.classList.remove('hidden');
    if (previewAudio.getAttribute('src') !== vs) previewAudio.src = vs;
    deleteBtn.style.display = 'flex';
  } else {
    previewRow.classList.add('hidden');
    if (previewAudio.hasAttribute('src')) { previewAudio.removeAttribute('src'); try { previewAudio.load(); } catch (e) {} }
    deleteBtn.style.display = 'none';
  }
}

// ----- Export (everything except the PIN)
$('#btn-export').addEventListener('click', async () => {
  if (STATE.isLocked) return;
  const audio = {};
  AudioStore.keys().forEach(k => { audio[k] = AudioStore.get(k); });
  const exportData = {
    app: 'TalkBoard AAC',
    version: 3,
    exportedAt: new Date().toISOString(),
    note: 'Backup of boards, tiles, audio clips, settings and usage history. It does not contain the PIN. Keep this file private.',
    outputMode: STATE.outputMode,
    theme: STATE.theme,
    ttsVolume: STATE.ttsVolume,
    ttsRate: STATE.ttsRate,
    ttsVoiceURI: STATE.ttsVoiceURI,
    haptic: STATE.haptic,
    shortcuts: STATE.shortcuts,
    tileSize: STATE.tileSize,
    highContrast: STATE.highContrast,
    usageTracking: STATE.usageTracking,
    customBoards: STATE.customBoards,
    boardOverrides: STATE.boardOverrides,
    deletedBoardIds: STATE.deletedBoardIds,
    favoriteTileIds: STATE.favoriteTileIds,
    recentTileIds: STATE.recentTileIds,
    savedPhrases: STATE.savedPhrases,
    trendingData: STATE.trendingData,
    audio
  };
  const backupText = JSON.stringify(exportData, null, 2);
  const blob = new Blob([backupText], { type: 'application/json' });
  const filename = `talkboard-export-${localDateStamp()}.json`;
  try {
    const file = new File([backupText], filename, { type:'application/json' });
    if (navigator.canShare && navigator.canShare({ files:[file] }) && navigator.share) {
      await navigator.share({ title:'TalkBoard backup', text:'Keep this backup private. It contains boards and audio, but not the PIN.', files:[file] });
      toast('Backup shared. Keep it somewhere safe.');
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') { toast('Backup sharing cancelled.'); return; }
    console.warn('Share sheet unavailable; downloading backup instead.', err);
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Backup exported, including audio clips.');
});

// ----- Import
$('#import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  e.target.value = '';                       // reset even if the user cancels
  if (file) importData(file);
});

async function importData(file) {
  if (STATE.isLocked) return;
  let data;
  try { data = JSON.parse(await file.text()); }
  catch (err) { toast('Import failed: this is not a valid backup file.', 4000); return; }
  const clean = normalizeData(data);
  if (!clean.recognized) { toast('Import failed: no TalkBoard data found in this file.', 4000); return; }
  const hasBoardData = Array.isArray(data.customBoards) || Array.isArray(data.boardOverrides) || Array.isArray(data.deletedBoardIds);
  const tileCount = [...clean.customBoards, ...clean.boardOverrides].reduce((n, b) => n + b.tiles.length, 0);
  const audioCount = Object.keys(clean.audio).filter(k => k.startsWith('tile:')).length;
  const ok = await showConfirm(`Import preview: ${clean.customBoards.length} custom board(s), ${clean.boardOverrides.length} edited built-in board(s), ${clean.deletedBoardIds.length} hidden built-in board(s), ${tileCount} tile(s), ${audioCount} audio clip(s), and ${clean.savedPhrases.length} saved phrase(s). This replaces current board changes, clips, trends, preferences and phrases. Your PIN is not changed. Export a backup first if you may need the current setup. Continue?`);
  if (!ok || STATE.isLocked) return;

  const before = { s: { ...STATE }, boards: STATE.customBoards, trend: STATE.trendingData, favorites: STATE.favoriteTileIds, recent: STATE.recentTileIds, phrases:STATE.savedPhrases };
  Object.assign(STATE, clean.settings);
  if (hasBoardData) {
    STATE.customBoards = clean.customBoards;
    STATE.boardOverrides = clean.boardOverrides;
    STATE.deletedBoardIds = clean.deletedBoardIds;
  }
  if (data.trendingData && typeof data.trendingData === 'object' && !Array.isArray(data.trendingData)) STATE.trendingData = clean.trendingData;
  STATE.favoriteTileIds = clean.favoriteTileIds;
  STATE.recentTileIds = clean.recentTileIds;
  STATE.savedPhrases = clean.savedPhrases;
  if (!getBoardById(STATE.currentBoardId)) STATE.currentBoardId = STATE.customBoards.length ? STATE.customBoards[0].id : 'home';

  if (!saveState()) {
    Object.assign(STATE, before.s);
    STATE.customBoards = before.boards;
    STATE.trendingData = before.trend;
    STATE.favoriteTileIds = before.favorites;
    STATE.recentTileIds = before.recent;
    STATE.savedPhrases = before.phrases;
    return;
  }

  let audioOk = true;
  try {
    if (hasBoardData) {
      const keep = new Set();
      [...STATE.customBoards, ...STATE.boardOverrides].forEach(b => b.tiles.forEach(t => keep.add('tile:' + t.id)));
      for (const k of AudioStore.keys()) if (k.startsWith('tile:') && !keep.has(k)) await AudioStore.del(k);
    }
    for (const [k, v] of Object.entries(clean.audio)) await AudioStore.put(k, v);
    if (AudioStore.mode === 'memory') saveState();
  } catch (err) { audioOk = false; }

  closeSettings();
  renderAll();
  if (!audioOk) toast('Imported, but some audio clips could not be stored on this device.', 5000);
  else if (clean.skipped) toast(`Data imported. ${clean.skipped} invalid item(s) were skipped.`, 4000);
  else toast('Data imported successfully!');
}

// ----- Restore defaults
$('#btn-restore').addEventListener('click', async () => {
  if (STATE.isLocked) return;
  const ok = await showConfirm('Restore Defaults deletes ALL custom boards, tiles, audio clips, usage history and settings, and sets the PIN back to the default. This cannot be undone. Continue?');
  if (!ok || STATE.isLocked) return;
  try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(SECURITY_KEY); } catch (e) {}
  try { await AudioStore.clear(); } catch (e) {}
  SECURITY = defaultSecurity();
  stopAllOutput();
  STATE = freshState();
  applyTheme('light');
  switchTab('home');
  renderAll();
  toast('Restored to defaults.');
});

// ----- Trending reset
$('#btn-reset-trending').addEventListener('click', async () => {
  if (STATE.isLocked) return;
  const ok = await showConfirm('Reset all trending data? This cannot be undone.');
  if (!ok || STATE.isLocked) return;
  const before = STATE.trendingData;
  STATE.trendingData = {};
  if (!saveState()) { STATE.trendingData = before; return; }
  renderTrending(STATE.trendPeriod);
  toast('Trending data reset.');
});

// ============================
// TILE MODAL
// ============================

const COLOR_OPTIONS = [
  {name:'blue',hex:'#1976D2'},{name:'green',hex:'#388E3C'},{name:'orange',hex:'#F57C00'},
  {name:'purple',hex:'#7B1FA2'},{name:'red',hex:'#C62828'},{name:'teal',hex:'#00796B'},
  {name:'pink',hex:'#AD1457'},{name:'yellow',hex:'#F9A825'},{name:'',hex:'#9E9E9E'}
];

let tileModalData = { tile: null, board: null, removeAudio: false, recordedClip: null };

function pickerButton(container, className, label, selected, onPick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className + (selected ? ' selected' : '');
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  btn.addEventListener('click', () => {
    container.querySelectorAll('.' + className).forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('selected');
    btn.setAttribute('aria-pressed', 'true');
    if (onPick) onPick();
  });
  container.appendChild(btn);
  return btn;
}

// Grid of pictures with a search box; typing an emoji instead clears the choice
function buildArtPicker(gridId, searchId, emojiInputId, selectedImg) {
  const grid = document.getElementById(gridId);
  const search = document.getElementById(searchId);
  grid.innerHTML = '';
  ART_LIBRARY.forEach(a => {
    const sel = a.img === selectedImg;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'art-opt' + (sel ? ' selected' : '');
    b.setAttribute('aria-label', a.label);
    b.setAttribute('aria-pressed', sel ? 'true' : 'false');
    b.title = a.label;
    b.dataset.img = a.img;
    b.dataset.search = a.label.toLowerCase();
    b.innerHTML = `<img ${artResponsiveAttributes(a.img, '44px')} alt="" loading="lazy" decoding="async" draggable="false">`;
    b.addEventListener('click', () => {
      grid.querySelectorAll('.art-opt').forEach(x => { x.classList.remove('selected'); x.setAttribute('aria-pressed', 'false'); });
      b.classList.add('selected');
      b.setAttribute('aria-pressed', 'true');
      document.getElementById(emojiInputId).value = '';
    });
    grid.appendChild(b);
  });
  search.value = '';
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    grid.querySelectorAll('.art-opt').forEach(x => { x.hidden = !!q && !x.dataset.search.includes(q); });
  };
  document.getElementById(emojiInputId).oninput = e => {
    if (e.target.value.trim()) grid.querySelectorAll('.art-opt.selected').forEach(x => { x.classList.remove('selected'); x.setAttribute('aria-pressed', 'false'); });
  };
  const chosen = grid.querySelector('.art-opt.selected');
  if (chosen) requestAnimationFrame(() => { grid.scrollTop = chosen.offsetTop - grid.clientHeight / 2 + chosen.clientHeight / 2; });
}

// Picture/emoji chosen in a picker: { img, emoji } (img '' when an emoji was typed)
function pickedSymbol(gridId, emojiInputId, current) {
  const typed = cleanIcon(document.getElementById(emojiInputId).value);
  if (typed) return { img: '', emoji: typed };
  const sel = document.querySelector(`#${gridId} .art-opt.selected`);
  if (sel) {
    const a = ART_LIBRARY.find(x => x.img === sel.dataset.img);
    return { img: sel.dataset.img, emoji: (a && a.emoji) || '💬' };
  }
  return { img: current && isArtPath(current.img) ? current.img : '', emoji: (current && (current.emoji || current.icon)) || '' };
}

function openTileModal(tile, board) {
  if (STATE.isLocked || !board || ['favorites', 'recent'].includes(board.id)) return;
  tileModalData = { tile, board, removeAudio: false, recordedClip: null };
  const isNew = !tile;
  $('#tile-modal-title').textContent = isNew ? '➕ Add Tile' : '✏️ Edit Tile';
  $('#tile-label-input').value = isNew ? '' : tile.label;
  const hasArt = !isNew && isArtPath(tile.img);
  $('#tile-custom-emoji').value = (!isNew && !hasArt) ? (tile.emoji || '') : '';
  $('#tile-delete-btn').classList.toggle('hidden', isNew);

  buildArtPicker('art-picker', 'art-search', 'tile-custom-emoji', hasArt ? tile.img : '');

  const cp = $('#color-picker');
  cp.innerHTML = '';
  COLOR_OPTIONS.forEach(c => {
    const sw = pickerButton(cp, 'color-swatch', c.name || 'None', !isNew && (tile.color || '') === c.name);
    sw.style.background = c.hex;
    sw.dataset.color = c.name;
  });

  $('#tile-audio-upload').value = '';
  $('#tile-record-status').textContent = '';
  $('#tile-record-start').classList.remove('hidden');
  $('#tile-record-stop').classList.add('hidden');
  const hasClip = !isNew && AudioStore.has('tile:' + tile.id);
  $('#tile-audio-current').classList.toggle('hidden', !hasClip);
  $('#tile-audio-status').textContent = 'This tile has an audio clip.';
  $('#tile-audio-play').classList.remove('hidden');
  $('#tile-audio-remove').classList.remove('hidden');

  openDialog('tile-modal');
}

$('#tile-audio-play').addEventListener('click', () => {
  const { tile } = tileModalData;
  const clip = tile && AudioStore.get('tile:' + tile.id);
  if (!clip) return;
  stopAllOutput();
  playClip(clip).then(ok => { if (!ok) toast('This clip can\'t be played on this device.'); });
});

$('#tile-audio-remove').addEventListener('click', () => {
  tileModalData.removeAudio = true;
  $('#tile-audio-status').textContent = 'The clip will be removed when you save.';
  $('#tile-audio-play').classList.add('hidden');
  $('#tile-audio-remove').classList.add('hidden');
  $('#tile-audio-upload').focus();
});

$('#tile-audio-upload').addEventListener('change', () => {
  if ($('#tile-audio-upload').files[0]) { tileModalData.recordedClip = null; $('#tile-record-status').textContent = ''; }
});

$('#tile-modal-close').addEventListener('click', () => closeDialog('tile-modal'));
$('#tile-cancel-btn').addEventListener('click', () => closeDialog('tile-modal'));

$('#tile-delete-btn').addEventListener('click', async () => {
  const { tile, board } = tileModalData;
  if (!tile || !board || STATE.isLocked) return;
  const ok = await showConfirm(`Delete tile "${tile.label}"? This cannot be undone.`);
  if (!ok || STATE.isLocked) return;
  const changedBoard = saveBoardMutation(board, mutable => {
    mutable.tiles = mutable.tiles.filter(item => item.id !== tile.id);
  });
  if (!changedBoard) return;
  removeAudio('tile:' + tile.id);
  closeDialog('tile-modal');
  renderCurrentBoard();
  toast(`Tile "${tile.label}" deleted.`);
});

$('#tile-save-btn').addEventListener('click', async () => {
  const { tile, board } = tileModalData;
  if (STATE.isLocked || !board) return;
  if (tileRecorder && tileRecorder.state === 'recording') { toast('Stop the recording before saving this tile.'); return; }
  const saveBtn = $('#tile-save-btn');
  if (saveBtn.disabled) return;          // no double-saves while a clip is being read
  const label = $('#tile-label-input').value.trim();
  if (!label) { toast('Please enter a label.'); $('#tile-label-input').focus(); return; }

  saveBtn.disabled = true;
  try {
    const sym = pickedSymbol('art-picker', 'tile-custom-emoji', tile);
    const emoji = sym.emoji || '💬';
    const selectedColor = document.querySelector('#color-picker .color-swatch.selected');
    const color = selectedColor ? selectedColor.dataset.color : (tile ? tile.color || '' : '');

    let newClip = null;
    const audioFile = $('#tile-audio-upload').files[0];
    if (audioFile) {
      const r = await readAudioFile(audioFile);
      if (r.error) { toast(r.error, 4500); return; }
      newClip = r.dataUrl;
    } else if (tileModalData.recordedClip) newClip = tileModalData.recordedClip;

    const targetId = tile ? tile.id : uid('custom');
    let target = null;
    let missingTile = false;
    const changedBoard = saveBoardMutation(board, mutable => {
      target = tile ? mutable.tiles.find(item => item.id === tile.id) : { id: targetId };
      if (!target) { missingTile = true; return; }
      const oldLabel = target.label;
      const oldImage = target.img || '';
      const oldEmoji = target.emoji || '';
      if (Array.isArray(target.parts) && (label !== oldLabel || (sym.img || '') !== oldImage || emoji !== oldEmoji)) delete target.parts;
      target.label = label;
      target.emoji = emoji;
      target.img = sym.img || '';
      target.color = color;
      delete target.audioData;
      if (!tile) mutable.tiles.push(target);
    });
    if (missingTile) { toast('This tile is no longer on the board.'); return; }
    if (!changedBoard) return;

    const key = 'tile:' + target.id;
    try {
      if (newClip) await setAudio(key, newClip);
      else if (tileModalData.removeAudio) removeAudio(key);
    } catch (err) {
      toast('Tile saved, but its audio clip could not be stored (storage full or blocked).', 5500);
      closeDialog('tile-modal');
      renderCurrentBoard();
      return;
    }

    requestPersistence();
    closeDialog('tile-modal');
    renderCurrentBoard();
    toast(tile ? 'Tile updated!' : 'Tile added!');
  } finally {
    saveBtn.disabled = false;
  }
});

// ============================
// BOARD MODAL
// ============================

function openBoardModal() {
  if (STATE.isLocked) return;
  $('#board-modal-title').textContent = '➕ New Board';
  $('#board-name-input').value = '';
  $('#board-template').value = 'blank';
  $('#board-custom-emoji').value = '';

  buildArtPicker('board-art-picker', 'board-art-search', 'board-custom-emoji', '');

  openDialog('board-modal');
}

$('#btn-add-board').addEventListener('click', openBoardModal);
$('#board-modal-close').addEventListener('click', () => closeDialog('board-modal'));
$('#board-cancel-btn').addEventListener('click', () => closeDialog('board-modal'));

$('#board-save-btn').addEventListener('click', () => {
  if (STATE.isLocked) return;
  const name = $('#board-name-input').value.trim();
  if (!name) { toast('Please enter a board name.'); $('#board-name-input').focus(); return; }

  const sym = pickedSymbol('board-art-picker', 'board-custom-emoji', null);
  const newBoard = { id: uid('board'), name: cleanText(name, 30), icon: sym.emoji || '📋', isStandard: false, tiles: [] };
  if (sym.img) newBoard.img = sym.img;
  const template = $('#board-template').value;
  const templateBoards = template === 'school' ? ['people','social'] : (template === 'blank' ? [] : [template]);
  const templateTiles = templateBoards.flatMap(id => (getBoardById(id)?.tiles || []));
  newBoard.tiles = templateTiles.map(t => ({ ...t, id:uid('custom') }));
  const prevBoardId = STATE.currentBoardId;
  STATE.customBoards.push(newBoard);
  STATE.currentBoardId = newBoard.id;
  if (!saveState()) {
    STATE.customBoards.pop();
    STATE.currentBoardId = prevBoardId;
    return;
  }
  requestPersistence();
  closeDialog('board-modal');
  renderBoardNav();
  renderCurrentBoard();
  toast(templateTiles.length ? `Board "${newBoard.name}" created from a template.` : `Board "${newBoard.name}" created!`);
});

// Add tile button (within board mgmt bar)
$('#btn-add-tile').addEventListener('click', () => {
  const board = getBoardById(STATE.currentBoardId);
  if (!board || ['favorites', 'recent'].includes(board.id)) {
    toast('Choose a board before adding a tile.');
    return;
  }
  openTileModal(null, board);
});
