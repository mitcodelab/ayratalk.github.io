'use strict';

// ============================
// CATEGORIES
// ============================

function renderCategories() {
  const grid = $('#categories-grid');
  grid.innerHTML = '';
  getAllBoards().forEach(board => {
    const n = board.tiles ? board.tiles.length : 0;
    const card = document.createElement('div');
    card.className = 'category-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${board.name} board, ${n} tiles`);
    card.innerHTML = `<div class="category-card-icon" aria-hidden="true">${symbolHTML(board, 'category-card-emoji', 'category-card-img')}</div><div class="category-card-name">${esc(board.name)}</div><div class="category-card-count">${n} tiles${board.isStandard ? ' · Standard' : ''}</div>`;
    card.addEventListener('click', () => {
      switchTab('home');
      selectBoard(board.id);
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); card.click(); }
    });
    grid.appendChild(card);
  });
}

// ============================
// BOARD NAVIGATION
// ============================

function renderBoardNav() {
  const nav = $('#board-nav');
  nav.innerHTML = '';
  const currentBoard = getBoardById(STATE.currentBoardId);
  const addTileBtn = $('#btn-add-tile');
  const isVirtualBoard = currentBoard && ['favorites', 'recent'].includes(currentBoard.id);
  if (addTileBtn) addTileBtn.style.display = (!STATE.isLocked && currentBoard && !isVirtualBoard) ? '' : 'none';
  const copyBtn = $('#btn-copy-board');
  if (copyBtn) copyBtn.style.display = (!STATE.isLocked && currentBoard && !isVirtualBoard) ? '' : 'none';
  const deleteBtn = $('#btn-delete-board');
  if (deleteBtn) {
    const canDelete = !STATE.isLocked && currentBoard && currentBoard.id !== 'home' && !isVirtualBoard;
    deleteBtn.classList.toggle('hidden', !canDelete);
    if (canDelete) deleteBtn.setAttribute('aria-label', `Delete board ${currentBoard.name}`);
  }

  getAllBoards().filter(board => board.id !== 'phrases').forEach(board => {
    const wrap = document.createElement('div');
    wrap.className = 'board-chip-wrap';

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'board-chip';
    chip.setAttribute('aria-pressed', board.id === STATE.currentBoardId ? 'true' : 'false');
    chip.setAttribute('aria-label', board.name + ' board' + (board.isStandard ? ' (standard)' : ''));
    chip.dataset.focusKey = 'chip:' + board.id;
    chip.innerHTML = symbolHTML(board, 'board-chip-emoji', 'board-chip-img') + ' <span>' + esc(board.name) + '</span>';
    chip.addEventListener('click', () => selectBoard(board.id));
    wrap.appendChild(chip);

    if (!STATE.isLocked && !board.isStandard) {
      const idx = STATE.customBoards.findIndex(b => b.id === board.id);
      [-1, 1].forEach(delta => {
        const move = document.createElement('button');
        move.type = 'button'; move.className = 'board-move';
        move.textContent = delta < 0 ? '←' : '→';
        move.disabled = idx + delta < 0 || idx + delta >= STATE.customBoards.length;
        move.setAttribute('aria-label', `${delta < 0 ? 'Move earlier' : 'Move later'} ${board.name}`);
        move.addEventListener('click', e => { e.stopPropagation(); moveBoard(board.id, delta); });
        wrap.appendChild(move);
      });
    }

    nav.appendChild(wrap);
  });
}

async function deleteBoard(board) {
  if (STATE.isLocked) return;
  if (!board || board.id === 'home' || ['favorites', 'recent'].includes(board.id)) {
    toast('The Home board is required for the main navigation and cannot be deleted.');
    return;
  }
  const ok = await showConfirm('Delete board "' + board.name + '" and all its tiles? This cannot be undone.');
  if (!ok || STATE.isLocked) return;
  const before = {
    customBoards: STATE.customBoards,
    boardOverrides: STATE.boardOverrides,
    deletedBoardIds: STATE.deletedBoardIds,
    favoriteTileIds: STATE.favoriteTileIds,
    recentTileIds: STATE.recentTileIds,
    trendingData: STATE.trendingData,
    currentBoardId: STATE.currentBoardId
  };
  const tileIds = new Set((board.tiles || []).map(tile => tile.id));
  if (board.isStandard) {
    STATE.deletedBoardIds = [...new Set([...STATE.deletedBoardIds, board.id])];
    STATE.boardOverrides = STATE.boardOverrides.filter(item => item.id !== board.id);
  } else STATE.customBoards = STATE.customBoards.filter(item => item.id !== board.id);
  STATE.favoriteTileIds = STATE.favoriteTileIds.filter(id => !tileIds.has(id));
  STATE.recentTileIds = STATE.recentTileIds.filter(id => !tileIds.has(id));
  STATE.trendingData = { ...STATE.trendingData };
  tileIds.forEach(id => { delete STATE.trendingData[id]; });
  if (STATE.currentBoardId === board.id) STATE.currentBoardId = 'home';
  if (!saveState()) {
    Object.assign(STATE, before);
    syncTabSelection();
    renderBoardNav();
    return;
  }
  (board.tiles || []).forEach(t => removeAudio('tile:' + t.id));
  syncTabSelection();
  renderBoardNav();
  renderCurrentBoard();
  toast('Board "' + board.name + '" deleted.');
}

$('#btn-delete-board').addEventListener('click', () => deleteBoard(getBoardById(STATE.currentBoardId)));

function selectBoard(id) {
  if (!getBoardById(id)) id = 'home';
  STATE.currentBoardId = id;
  saveState({ quiet: true });
  syncTabSelection();
  renderBoardNav();
  renderCurrentBoard();
}

function cloneBoard(board) {
  return {
    ...board,
    tiles: (board.tiles || []).map(tile => ({ ...tile, ...(Array.isArray(tile.parts) ? { parts: [...tile.parts] } : {}) }))
  };
}

function prepareBoardMutation(board) {
  if (!board || ['favorites', 'recent'].includes(board.id)) return null;
  if (!board.isStandard) return { board, created: false };
  const existing = STATE.boardOverrides.find(item => item.id === board.id);
  if (existing) return { board: existing, created: false };
  const copy = cloneBoard(board);
  STATE.boardOverrides = [...STATE.boardOverrides, copy];
  return { board: copy, created: true };
}

function saveBoardMutation(board, mutate) {
  const prepared = prepareBoardMutation(board);
  if (!prepared) return null;
  const snapshot = cloneBoard(prepared.board);
  mutate(prepared.board);
  if (!saveState()) {
    if (prepared.created) STATE.boardOverrides = STATE.boardOverrides.filter(item => item !== prepared.board);
    else Object.assign(prepared.board, snapshot);
    return null;
  }
  return prepared.board;
}

function moveBoard(id, delta) {
  const from = STATE.customBoards.findIndex(b => b.id === id), to = from + delta;
  if (from < 0 || to < 0 || to >= STATE.customBoards.length) return;
  const before = STATE.customBoards;
  STATE.customBoards = [...before];
  [STATE.customBoards[from], STATE.customBoards[to]] = [STATE.customBoards[to], STATE.customBoards[from]];
  if (!saveState()) { STATE.customBoards = before; return; }
  renderBoardNav();
}

$('#btn-copy-board').addEventListener('click', async () => {
  if (STATE.isLocked) return;
  const source = getBoardById(STATE.currentBoardId);
  if (!source || ['favorites','recent'].includes(source.id)) return;
  const board = { id:uid('board'), name:cleanText('Copy of ' + source.name, 30), icon:source.icon || '📋', isStandard:false, tiles:[] };
  if (isArtPath(source.img)) board.img = source.img;
  const idMap = new Map();
  board.tiles = (source.tiles || []).map(t => {
    const id = uid('custom'); idMap.set(t.id, id);
    const copy = { ...t, id };
    delete copy.audioData;
    return copy;
  });
  STATE.customBoards.push(board);
  const beforeId = STATE.currentBoardId;
  STATE.currentBoardId = board.id;
  if (!saveState()) { STATE.customBoards.pop(); STATE.currentBoardId = beforeId; return; }
  try {
    for (const [oldId, newId] of idMap) {
      const clip = AudioStore.get('tile:' + oldId);
      if (clip) await AudioStore.put('tile:' + newId, clip);
    }
  } catch (e) { toast('Board copied, but some audio clips could not be copied.', 4500); }
  if (AudioStore.mode === 'memory') saveState({ quiet:true });
  requestPersistence();
  renderBoardNav(); renderCurrentBoard();
  toast(`Copied “${source.name}” to a custom board.`);
});

// ============================
// TILE RENDERING
// ============================

function getEagerTileCount() {
  if (document.documentElement.dataset.tileSize === 'large') return 4;
  if (window.innerWidth <= 600) return 6;
  if (window.innerWidth >= 1200) return 10;
  return 8;
}

const BOARD_RENDER_THRESHOLD = 160;
const BOARD_RENDER_CHUNK_SIZE = 50;
let boardRenderVersion = 0;

function applyTileSearch() {
  const query = ($('#tile-search')?.value || '').trim().toLocaleLowerCase();
  const board = getBoardById(STATE.currentBoardId);
  if ((board?.tiles || []).length > BOARD_RENDER_THRESHOLD) {
    renderCurrentBoard();
    return;
  }
  $('#tile-container').querySelectorAll('.tile-wrap[data-search]').forEach(wrap => {
    wrap.hidden = !!query && !wrap.dataset.search.includes(query);
  });
}

function yieldBoardRender() {
  if (window.scheduler && typeof window.scheduler.yield === 'function') return window.scheduler.yield();
  return new Promise(resolve => {
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
    else window.setTimeout(resolve, 16);
  });
}

function tileGridIntrinsicBlockSize(container) {
  const style = getComputedStyle(container);
  const columns = style.gridTemplateColumns.split(/\s+/).filter(Boolean).length || (window.innerWidth <= 600 ? 3 : 4);
  const gap = Number.parseFloat(style.rowGap) || 0;
  const gridWidth = container.clientWidth || Math.max(0, window.innerWidth - 32);
  const cellWidth = (gridWidth - gap * (columns - 1)) / columns;
  const minimumHeight = STATE.tileSize === 'large' ? 150 : 0;
  return Math.ceil(Math.max(cellWidth, minimumHeight));
}

function createAddTileWrap(board) {
  if (STATE.isLocked || ['favorites', 'recent'].includes(board.id)) return null;
  const wrap = document.createElement('div');
  wrap.className = 'tile-wrap';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'tile tile-add';
  addBtn.setAttribute('aria-label', 'Add new tile');
  addBtn.dataset.focusKey = 'add-tile:' + board.id;
  addBtn.innerHTML = `<span class="tile-emoji" aria-hidden="true">➕</span><span class="tile-label">Add Tile</span>`;
  wrap.appendChild(addBtn);
  return wrap;
}

async function appendBoardTileChunks(version, container, items, start, board, priorityImage, eagerCount, addWrap) {
  for (let offset = start; offset < items.length; offset += BOARD_RENDER_CHUNK_SIZE) {
    await yieldBoardRender();
    if (version !== boardRenderVersion) return;

    const fragment = document.createDocumentFragment();
    const end = Math.min(offset + BOARD_RENDER_CHUNK_SIZE, items.length);
    for (let position = offset; position < end; position++) {
      const item = items[position];
      const isDeferred = position >= eagerCount;
      const wrap = createTileElement(item.tile, board, item.index, item.tile.img === priorityImage, isDeferred, isDeferred);
      wrap.dataset.search = item.search;
      fragment.appendChild(wrap);
    }
    container.insertBefore(fragment, addWrap && addWrap.isConnected ? addWrap : null);
  }

  if (version === boardRenderVersion) container.removeAttribute('aria-busy');
}

function renderCurrentBoard() {
  const version = ++boardRenderVersion;
  const board = getBoardById(STATE.currentBoardId);
  const container = $('#tile-container');
  if (!board) {
    container.classList.remove('tile-grid--large-board');
    container.removeAttribute('data-board-id');
    container.style.removeProperty('--tile-intrinsic-block-size');
    container.removeAttribute('aria-busy');
    container.replaceChildren();
    return;
  }

  const tiles = board.tiles || [];
  const largeBoard = tiles.length > BOARD_RENDER_THRESHOLD;
  const query = ($('#tile-search')?.value || '').trim().toLocaleLowerCase();
  const eagerTileCount = getEagerTileCount();
  const items = tiles.map((tile, index) => ({ tile, index, search: tile.label.toLocaleLowerCase() }))
    .filter(item => !largeBoard || !query || item.search.includes(query));
  const quickAccessLcpImage = !query && board.id === 'home' && tiles.some(tile => tile.img === 'art/t_no.webp')
    ? 'art/t_no.webp'
    : '';
  const priorityImage = quickAccessLcpImage || items.slice(0, eagerTileCount).find(item => isArtPath(item.tile.img))?.tile.img || '';
  const addWrap = createAddTileWrap(board);
  const fragment = document.createDocumentFragment();

  container.dataset.boardId = board.id;
  container.classList.toggle('tile-grid--large-board', largeBoard);
  if (largeBoard) container.style.setProperty('--tile-intrinsic-block-size', `${tileGridIntrinsicBlockSize(container)}px`);
  else container.style.removeProperty('--tile-intrinsic-block-size');

  if (!largeBoard) {
    items.forEach((item, position) => {
      const isDeferred = position >= eagerTileCount;
      const wrap = createTileElement(item.tile, board, item.index, item.tile.img === priorityImage, isDeferred);
      wrap.dataset.search = item.search;
      fragment.appendChild(wrap);
    });
    if (addWrap) fragment.appendChild(addWrap);
    container.removeAttribute('aria-busy');
    container.replaceChildren(fragment);
    applyTileSearch();
    return;
  }

  const initialCount = Math.min(eagerTileCount, items.length);
  for (let position = 0; position < initialCount; position++) {
    const item = items[position];
    const wrap = createTileElement(item.tile, board, item.index, item.tile.img === priorityImage, false, false);
    wrap.dataset.search = item.search;
    fragment.appendChild(wrap);
  }
  if (addWrap) fragment.appendChild(addWrap);
  container.replaceChildren(fragment);
  if (items.length > initialCount) {
    container.setAttribute('aria-busy', 'true');
    appendBoardTileChunks(version, container, items, initialCount, board, priorityImage, initialCount, addWrap)
      .catch(error => {
        if (version !== boardRenderVersion) return;
        container.removeAttribute('aria-busy');
        console.error('Board rendering stopped early:', error);
      });
  } else container.removeAttribute('aria-busy');
}

// The edit button sits next to the tile button (not inside it),
// so screen readers and keyboards see two separate controls.
function resolvePhraseParts(tile) {
  if (!Array.isArray(tile?.parts) || !tile.parts.length) return [];
  const homeTiles = getBoardById('home')?.tiles || [];
  const parts = tile.parts.map(id => homeTiles.find(part => part.id === id));
  return parts.every(Boolean) ? parts : [];
}

function phraseCompositionHTML(parts) {
  const content = parts.map((part, index) => {
    const plus = index ? '<span class="tile-composition-plus" aria-hidden="true">+</span>' : '';
    return plus + `<span class="tile-composition-part">${symbolHTML(part, 'phrase-part-emoji', 'phrase-part-img')}<span class="phrase-part-label">${esc(part.label)}</span></span>`;
  }).join('');
  return `<span class="tile-composition" aria-hidden="true">${content}</span>`;
}

function createTileElement(tile, board, index, prioritizeImage, lazyImage, deferOffscreen = false) {
  const wrap = document.createElement('div');
  wrap.className = 'tile-wrap';
  wrap.dataset.tileIndex = String(index);
  wrap.dataset.tileId = tile.id;
  if (deferOffscreen) wrap.dataset.offscreen = 'true';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tile';
  btn.dataset.color = COLOR_NAMES.includes(tile.color) ? tile.color : '';
  btn.setAttribute('aria-label', tile.label);
  btn.setAttribute('data-tile-id', tile.id);
  btn.dataset.focusKey = 'tile:' + tile.id;
  const phraseParts = resolvePhraseParts(tile);
  const tileVisual = phraseParts.length ? phraseCompositionHTML(phraseParts) : symbolHTML(tile, 'tile-emoji', 'tile-img', prioritizeImage, lazyImage);
  btn.innerHTML = `${tileVisual}<span class="tile-label">${esc(tile.label)}</span>`;
  wrap.appendChild(btn);

  const fav = document.createElement('button');
  fav.type = 'button';
  fav.className = 'tile-fav';
  const isFav = STATE.favoriteTileIds.includes(tile.id);
  fav.textContent = isFav ? '★' : '☆';
  fav.setAttribute('aria-label', isFav ? `Remove ${tile.label} from favorites` : `Add ${tile.label} to favorites`);
  fav.setAttribute('aria-pressed', String(isFav));
  wrap.appendChild(fav);

  if (!STATE.isLocked && !['favorites', 'recent'].includes(board.id)) {
    [-1, 1].forEach(delta => {
      const move = document.createElement('button');
      move.type = 'button'; move.className = 'tile-order ' + (delta < 0 ? 'up' : 'down'); move.textContent = delta < 0 ? '↑' : '↓';
      move.setAttribute('aria-label', `${delta < 0 ? 'Move up' : 'Move down'} ${tile.label}`);
      move.dataset.delta = String(delta);
      move.disabled = index + delta < 0 || index + delta >= board.tiles.length;
      wrap.appendChild(move);
    });
  }

  if (!STATE.isLocked && !['favorites', 'recent'].includes(board.id)) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'tile-edit-btn';
    editBtn.setAttribute('aria-label', `Edit ${tile.label}`);
    editBtn.dataset.focusKey = 'edit:' + tile.id;
    editBtn.textContent = '✏️';
    wrap.appendChild(editBtn);
  }
  return wrap;
}

function moveTile(board, id, delta) {
  const from = board.tiles.findIndex(t => t.id === id), to = from + delta;
  if (from < 0 || to < 0 || to >= board.tiles.length) return;
  const changed = saveBoardMutation(board, mutable => {
    [mutable.tiles[from], mutable.tiles[to]] = [mutable.tiles[to], mutable.tiles[from]];
  });
  if (changed) renderCurrentBoard();
}

function onTileTap(tile, btnEl) {
  vibrate();
  const parts = resolvePhraseParts(tile);
  const words = parts.length ? parts : [tile];
  STATE.message.push(...words.map(word => ({ label: word.label, emoji: word.emoji, img: isArtPath(word.img) ? word.img : '', tileId: word.id })));
  updateMessageBar();

  btnEl.classList.add('speaking');
  setTimeout(() => btnEl.classList.remove('speaking'), 600);

  outputTile(tile);
  recordTap(tile);
}

// ============================
// MESSAGE BAR
// ============================

function updateMessageBar() {
  const el = $('#message-text');
  el.innerHTML = '';
  STATE.message.forEach(w => {
    const span = document.createElement('button');
    span.type = 'button';
    span.className = 'msg-word';
    span.setAttribute('aria-label', `Remove ${w.label} from message`);
    span.title = 'Tap to remove this word';
    if (isArtPath(w.img)) {
      span.innerHTML = symbolHTML(w, 'msg-emoji', 'msg-img');
      span.appendChild(document.createTextNode(' ' + w.label));
    } else {
      span.textContent = (w.emoji ? w.emoji + ' ' : '') + w.label;
    }
    span.addEventListener('click', () => { const i = [...el.children].indexOf(span); if (i >= 0) STATE.message.splice(i, 1); updateMessageBar(); });
    el.appendChild(span);
  });
  el.scrollTop = el.scrollHeight;   // keep the newest word in view
}

function undoWord() {
  STATE.message.pop();
  updateMessageBar();
}

function clearMessage() {
  STATE.message = [];
  updateMessageBar();
  stopAllOutput();
}

function renderSavedPhrases() {
  const bar = $('#phrase-bar');
  if (!bar) return;
  bar.innerHTML = '';
  STATE.savedPhrases.forEach(phrase => {
    const wrap = document.createElement('div');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'phrase-chip'; btn.textContent = phrase.label;
    btn.setAttribute('aria-label', `Add phrase: ${phrase.label}`);
    btn.addEventListener('click', () => { STATE.message.push(...phrase.words.map(w => ({ ...w }))); updateMessageBar(); });
    wrap.appendChild(btn);
    if (!STATE.isLocked) {
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'phrase-delete'; del.textContent = '×';
      del.setAttribute('aria-label', `Delete phrase ${phrase.label}`);
      del.addEventListener('click', () => { const before = STATE.savedPhrases; STATE.savedPhrases = before.filter(p => p.id !== phrase.id); if (!saveState()) STATE.savedPhrases = before; renderSavedPhrases(); });
      wrap.appendChild(del);
    }
    bar.appendChild(wrap);
  });
}

$('#btn-save-phrase').addEventListener('click', () => {
  if (!STATE.message.length) { toast('Build a message first, then save it as a phrase.'); return; }
  const label = messageText();
  if (STATE.savedPhrases.some(p => p.label.toLocaleLowerCase() === label.toLocaleLowerCase())) { toast('That phrase is already saved.'); return; }
  if (STATE.savedPhrases.length >= 20) { toast('You can save up to 20 phrases. Remove one first.'); return; }
  const before = STATE.savedPhrases;
  STATE.savedPhrases = [...before, { id:uid('phrase'), label:cleanText(label,80), words:STATE.message.map(w => ({...w})) }];
  if (saveState()) { renderSavedPhrases(); toast('Phrase saved for quick access.'); }
  else STATE.savedPhrases = before;
});

$('#btn-speak').addEventListener('click', () => speakMessage());
$('#btn-repeat').addEventListener('click', () => speakMessage({ quietIfEmpty: true }));
$('#btn-undo').addEventListener('click', undoWord);
$('#btn-clear').addEventListener('click', clearMessage);
const tileContainer = $('#tile-container');
tileContainer.addEventListener('click', event => {
  const button = event.target instanceof Element ? event.target.closest('button') : null;
  if (!button || !tileContainer.contains(button)) return;

  const board = getBoardById(STATE.currentBoardId);
  if (!board) return;
  if (button.classList.contains('tile-add')) {
    if (!STATE.isLocked && !['favorites', 'recent'].includes(board.id)) openTileModal(null, board);
    return;
  }

  const wrap = button.closest('.tile-wrap');
  const tileIndex = Number(wrap?.dataset.tileIndex);
  const tileId = button.dataset.tileId || wrap?.dataset.tileId;
  let tile = Number.isInteger(tileIndex) ? board.tiles[tileIndex] : null;
  if ((!tile || tile.id !== tileId) && tileId) tile = board.tiles.find(item => item.id === tileId);
  if (!tile || button.dataset.tileId && button.dataset.tileId !== tile.id) return;

  if (button.classList.contains('tile-fav')) toggleFavorite(tile);
  else if (button.classList.contains('tile-order')) moveTile(board, tile.id, Number(button.dataset.delta));
  else if (button.classList.contains('tile-edit-btn')) openTileModal(tile, board);
  else if (button.classList.contains('tile')) onTileTap(tile, button);
});
$('#tile-search').addEventListener('input', applyTileSearch);
