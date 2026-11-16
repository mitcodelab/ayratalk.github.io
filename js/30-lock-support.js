'use strict';

// ============================
// LOCK / UNLOCK
// ============================

function applyLockState() {
  const locked = STATE.isLocked;
  $('#btn-save-phrase').classList.toggle('hidden', locked);
  ['tab-support', 'tab-trending', 'tab-categories', 'tab-settings', 'board-mgmt-bar', 'trending-reset-wrap']
    .forEach(id => document.getElementById(id).classList.toggle('hidden', locked));

  const li = $('#lock-indicator');
  li.innerHTML = locked
    ? '<span aria-hidden="true">🔒</span> Locked – Tap to Unlock'
    : '<span aria-hidden="true">🔓</span> Unlocked – Tap to Lock';
  li.classList.toggle('unlocked', !locked);

  if (locked) {
    // Caregiver-only dialogs close the moment the app locks
    if (confirmResolver) finishConfirm(false);
    ['pinset-modal', 'tile-modal', 'board-modal', 'settings-panel'].forEach(id => { if (isDialogOpen(id)) closeDialog(id, { restoreFocus: false }); });
    if (STATE.currentTab !== 'home') switchTab('home');
  }

  // Re-render so edit and delete buttons appear/disappear with the lock
  syncTabSelection();
  renderBoardNav();
  renderCurrentBoard();
  renderSavedPhrases();
}

// ============================
// PIN
// ============================

function defaultSecurity() { return { salt: '', hash: '', algo: '', fails: 0, lockUntil: 0 }; }
function loadSecurity() {
  try {
    const s = JSON.parse(localStorage.getItem(SECURITY_KEY) || 'null');
    if (s && typeof s === 'object') {
      return {
        salt: typeof s.salt === 'string' ? s.salt : '',
        hash: typeof s.hash === 'string' ? s.hash : '',
        algo: typeof s.algo === 'string' ? s.algo : '',
        fails: isNum(s.fails) ? s.fails : 0,
        lockUntil: isNum(s.lockUntil) ? s.lockUntil : 0
      };
    }
  } catch (e) {}
  return defaultSecurity();
}
let SECURITY = loadSecurity();
function saveSecurity() {
  try { localStorage.setItem(SECURITY_KEY, JSON.stringify(SECURITY)); } catch (e) { console.warn('Could not save PIN settings', e); }
}

function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
const hasSubtle = () => !!(window.crypto && crypto.subtle && window.TextEncoder);
async function hashPin(pin, salt, algo) {
  if (algo === 'sha256' && hasSubtle()) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return cyrb53(salt + ':' + pin).toString(16);
}
function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for (let i = 0; i < bytes; i++) a[i] = Math.floor(Math.random() * 256);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function pinMatches(pin) {
  if (!SECURITY.hash) return pin === DEFAULT_PIN;
  return (await hashPin(pin, SECURITY.salt, SECURITY.algo)) === SECURITY.hash;
}
async function setPin(pin) {
  const salt = randomHex(16);
  const algo = hasSubtle() ? 'sha256' : 'c53';
  const hash = await hashPin(pin, salt, algo);
  SECURITY = { salt, hash, algo, fails: 0, lockUntil: 0 };
  saveSecurity();
}

let pinBuffer = '';
let pinChecking = false;
let pinTimer = null;

const pinLockRemaining = () => Math.max(0, SECURITY.lockUntil - Date.now());

function openPinModal() {
  if (!STATE.isLocked) return;
  pinBuffer = '';
  updatePinDisplay();
  $('#pin-error').classList.add('hidden');
  openDialog('pin-modal', { onDismiss: () => closePinModal() });
  refreshPinLockout();
}

function closePinModal() {
  clearInterval(pinTimer);
  pinTimer = null;
  closeDialog('pin-modal');
}

function updatePinDisplay() {
  $('#pin-dots').textContent = '●'.repeat(pinBuffer.length) + '─'.repeat(6 - pinBuffer.length);
  $('#pin-count').textContent = `${pinBuffer.length} of 6 digits entered`;
}

function showPinError(text) {
  const el = $('#pin-error');
  el.textContent = text;
  el.classList.remove('hidden');
}

// Disables the keypad and counts down while locked out
function refreshPinLockout() {
  const left = pinLockRemaining();
  document.querySelectorAll('.pin-key').forEach(k => { k.disabled = left > 0; });
  clearInterval(pinTimer);
  pinTimer = null;
  if (left > 0) {
    showPinError(`Too many wrong PINs. Try again in ${Math.ceil(left / 1000)} s.`);
    pinTimer = setInterval(() => {
      const l = pinLockRemaining();
      if (l <= 0 || !isDialogOpen('pin-modal')) {
        clearInterval(pinTimer); pinTimer = null;
        document.querySelectorAll('.pin-key').forEach(k => { k.disabled = false; });
        if (isDialogOpen('pin-modal')) $('#pin-error').classList.add('hidden');
        return;
      }
      $('#pin-error').textContent = `Too many wrong PINs. Try again in ${Math.ceil(l / 1000)} s.`;
    }, 1000);
  }
}

function pinPress(k) {
  if (pinChecking) return;
  if (pinLockRemaining() > 0) { refreshPinLockout(); return; }
  if (k === 'del') {
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDisplay();
  } else if (k === 'ok') {
    checkPin();
  } else if (/^[0-9]$/.test(k) && pinBuffer.length < 6) {
    pinBuffer += k;
    updatePinDisplay();
    if (pinBuffer.length === 6) checkPin();
  }
}

document.querySelectorAll('.pin-key').forEach(btn => {
  btn.addEventListener('click', () => pinPress(btn.dataset.k));
});

async function checkPin() {
  if (pinChecking || pinLockRemaining() > 0) return;
  pinChecking = true;
  const entered = pinBuffer;
  let ok = false;
  try { ok = entered.length === 6 && await pinMatches(entered); } catch (e) { ok = false; }
  pinChecking = false;
  if (ok) {
    SECURITY.fails = 0;
    SECURITY.lockUntil = 0;
    saveSecurity();
    STATE.isLocked = false;
    closePinModal();
    applyLockState();
    toast('🔓 Unlocked successfully!');
    return;
  }
  SECURITY.fails = (SECURITY.fails || 0) + 1;
  if (SECURITY.fails >= PIN_MAX_TRIES) {
    SECURITY.lockUntil = Date.now() + Math.min(300000, 30000 * Math.pow(2, SECURITY.fails - PIN_MAX_TRIES));
  }
  saveSecurity();
  vibrate(100);
  pinBuffer = '';
  updatePinDisplay();
  if (pinLockRemaining() > 0) refreshPinLockout();
  else {
    const left = PIN_MAX_TRIES - SECURITY.fails;
    showPinError(`Incorrect PIN. ${left} ${left === 1 ? 'try' : 'tries'} left before a short lockout.`);
  }
}

$('#pin-cancel').addEventListener('click', () => closePinModal());

// Lock indicator click
$('#lock-indicator').addEventListener('click', () => {
  if (STATE.isLocked) {
    openPinModal();
  } else {
    STATE.isLocked = true;
    applyLockState();
    toast('🔒 Locked');
  }
});

// ----- Change PIN
function updatePinStatus() {
  const el = $('#pin-status');
  if (!el) return;
  if (SECURITY.hash) {
    el.textContent = 'Custom PIN set. 5 wrong tries lock the keypad for 30 s.';
    el.classList.remove('settings-warn');
  } else {
    el.textContent = 'Default PIN 123456 is still active. Anyone who reads the source code knows it — change it.';
    el.classList.add('settings-warn');
  }
}

function openPinSetModal() {
  if (STATE.isLocked) return;
  $('#pinset-new').value = '';
  $('#pinset-confirm').value = '';
  $('#pinset-error').classList.add('hidden');
  openDialog('pinset-modal');
}

async function savePinFromModal() {
  if (STATE.isLocked) return;
  const a = $('#pinset-new').value.trim();
  const b = $('#pinset-confirm').value.trim();
  const err = $('#pinset-error');
  const fail = t => { err.textContent = t; err.classList.remove('hidden'); };
  if (!/^\d{6}$/.test(a)) return fail('The PIN must be exactly 6 digits.');
  if (a === DEFAULT_PIN) return fail('Choose a PIN other than the default 123456.');
  if (a !== b) return fail('The two PINs do not match.');
  try { await setPin(a); } catch (e) { return fail('Could not save the PIN on this device.'); }
  closeDialog('pinset-modal');
  updatePinStatus();
  toast('🔐 PIN changed.');
}

$('#btn-change-pin').addEventListener('click', openPinSetModal);
$('#pinset-close').addEventListener('click', () => closeDialog('pinset-modal'));
$('#pinset-cancel').addEventListener('click', () => closeDialog('pinset-modal'));
$('#pinset-save').addEventListener('click', savePinFromModal);

// ============================
// NAVIGATION / TABS
// ============================

function switchTab(tab) {
  if (tab !== 'home' && STATE.isLocked) tab = 'home';
  STATE.currentTab = tab;
  syncTabSelection();
  ['home', 'support', 'trending', 'categories'].forEach(t => document.getElementById('panel-' + t).classList.toggle('hidden', t !== tab));
  if (tab === 'trending') renderTrending(STATE.trendPeriod);
  if (tab === 'categories') renderCategories();
  if (tab === 'support') renderSupportContacts();
}

function syncTabSelection() {
  const phrasesAvailable = !!getBoardById('phrases');
  $('#tab-phrases').classList.toggle('hidden', !phrasesAvailable);
  const phrasesSelected = phrasesAvailable && STATE.currentTab === 'home' && STATE.currentBoardId === 'phrases';
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    const selected = btn.dataset.board
      ? STATE.currentTab === 'home' && STATE.currentBoardId === btn.dataset.board
      : btn.dataset.tab === STATE.currentTab && !phrasesSelected;
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
  $('#panel-home').setAttribute('aria-labelledby', phrasesSelected ? 'tab-phrases' : 'tab-home');
}

document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.board) {
      switchTab('home');
      selectBoard(btn.dataset.board);
    } else switchTab(btn.dataset.tab);
  });
});

// ============================
// SUPPORT / CCaaS HANDOFF
// ============================

const SUPPORT_QUICK_MESSAGES = [
  'I use AAC. Please give me time to respond.',
  'Please ask one question at a time.',
  'Please send your reply as text when possible.',
  'I need help. Please tell me what I should do next.'
];

function supportBusinesses() {
  const items = window.TALKBOARD_SUPPORT_CONFIG && window.TALKBOARD_SUPPORT_CONFIG.businesses;
  if (!Array.isArray(items)) return [];
  return items.filter(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.name !== 'string') return false;
    if (!['genesys', 'nice', 'twilio'].includes(item.provider)) return false;
    if (item.channel === 'web') {
      try { return new URL(item.url).protocol === 'https:'; } catch (e) { return false; }
    }
    if (item.channel === 'sms' || item.channel === 'call') return /^\+[1-9]\d{7,14}$/.test(item.phone || '');
    return false;
  });
}

function selectedSupportBusiness() {
  const select = $('#support-contact');
  return supportBusinesses().find(item => item.id === select.value) || null;
}

function renderSupportContacts() {
  const select = $('#support-contact');
  const previous = select.value;
  const businesses = supportBusinesses();
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = businesses.length ? 'Choose a support service' : 'No support service configured';
  select.appendChild(placeholder);
  businesses.forEach(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.name} — ${item.provider === 'nice' ? 'NICE CXone' : item.provider === 'twilio' ? 'Twilio' : 'Genesys Cloud'}`;
    select.appendChild(option);
  });
  if (businesses.some(item => item.id === previous)) select.value = previous;
  renderSupportContactInfo();
  renderSupportQuickMessages();
  updateSupportLaunchState();
}

function renderSupportContactInfo() {
  const item = selectedSupportBusiness();
  const info = $('#support-contact-info');
  if (!item) {
    info.textContent = 'No support service is configured. The site owner can add a public web chat URL or phone number in support-config.js. Do not put API keys or passwords in that file.';
    return;
  }
  const names = { genesys: 'Genesys Cloud', nice: 'NICE CXone', twilio: 'Twilio' };
  const descriptions = {
    web: 'Opens the organization’s configured web chat page. TalkBoard copies your reviewed message so you can paste it into the chat.',
    sms: 'Opens the phone’s SMS app with your reviewed message as a draft. You choose whether to send it.',
    call: 'Opens the phone dialer. TalkBoard does not connect its speech audio to the call.'
  };
  info.textContent = `${names[item.provider]} · ${descriptions[item.channel]}`;
  if (item.channel === 'web') {
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open support page';
    info.append(document.createTextNode(' '), link);
  }
}

function renderSupportQuickMessages() {
  const target = $('#support-quick-phrases');
  target.replaceChildren();
  SUPPORT_QUICK_MESSAGES.forEach(message => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'support-phrase';
    button.textContent = message;
    button.addEventListener('click', () => {
      $('#support-message').value = message;
      $('#support-consent').checked = false;
      $('#support-status').textContent = 'Quick message added. Review or edit it, then confirm before opening support.';
      updateSupportLaunchState();
      $('#support-message').focus();
    });
    target.appendChild(button);
  });
  (STATE.savedPhrases || []).slice(0, 8).forEach(phrase => {
    if (!phrase || !Array.isArray(phrase.words)) return;
    const text = phrase.words.map(word => word.label).join(' ').trim();
    if (!text) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'support-phrase';
    button.textContent = phrase.label || text;
    button.addEventListener('click', () => {
      $('#support-message').value = text;
      $('#support-consent').checked = false;
      $('#support-status').textContent = 'Saved phrase added. Review or edit it, then confirm before opening support.';
      updateSupportLaunchState();
      $('#support-message').focus();
    });
    target.appendChild(button);
  });
}

function updateSupportLaunchState() {
  const item = selectedSupportBusiness();
  const hasMessage = Boolean($('#support-message').value.trim());
  const consent = $('#support-consent').checked;
  const button = $('#btn-support-launch');
  button.disabled = !(item && hasMessage && consent);
  button.textContent = !item ? 'Choose a service first' : !hasMessage ? 'Write or choose a message' : !consent ? 'Review and confirm to continue' : item.channel === 'sms' ? 'Open text message draft' : item.channel === 'call' ? 'Open phone dialer' : 'Copy message and open support chat';
}

$('#support-contact').addEventListener('change', () => { renderSupportContactInfo(); updateSupportLaunchState(); });
$('#support-message').addEventListener('input', updateSupportLaunchState);
$('#support-consent').addEventListener('change', updateSupportLaunchState);
$('#btn-support-use-board').addEventListener('click', () => {
  const text = (STATE.message || []).map(word => word.label).join(' ').trim();
  if (!text) { $('#support-status').textContent = 'Your message board is empty. Choose a quick message or type a message first.'; return; }
  $('#support-message').value = text;
  $('#support-consent').checked = false;
  $('#support-status').textContent = 'Message board text added. Review it before sharing.';
  updateSupportLaunchState();
});
$('#btn-support-clear').addEventListener('click', () => {
  $('#support-message').value = '';
  $('#support-consent').checked = false;
  $('#support-status').textContent = 'Draft cleared.';
  updateSupportLaunchState();
});
$('#btn-support-launch').addEventListener('click', async () => {
  const item = selectedSupportBusiness();
  const message = $('#support-message').value.trim();
  if (!item || !message || !$('#support-consent').checked) return;
  $('#support-status').textContent = '';
  if (item.channel === 'sms') {
    const separator = item.phone.includes('?') ? '&' : '?';
    location.href = `sms:${item.phone}${separator}body=${encodeURIComponent(message)}`;
    $('#support-status').textContent = 'Your messaging app should open with a draft. Review it there and tap Send if you want to share it.';
    return;
  }
  if (item.channel === 'call') {
    location.href = `tel:${item.phone}`;
    $('#support-status').textContent = 'Your phone dialer should open. TalkBoard does not send its speech audio into the call.';
    return;
  }
  window.open(item.url, '_blank', 'noopener,noreferrer');
  try {
    await navigator.clipboard.writeText(message);
    $('#support-status').textContent = 'Message copied. If the chat did not open, use the support page link above. Paste the message into the chat and choose Send there.';
  } catch (e) {
    $('#support-status').textContent = 'If the chat did not open, use the support page link above. Clipboard access was unavailable; select and copy the message here, then paste it into the chat.';
  }
});
