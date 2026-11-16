'use strict';

// Critical styles are inline; activate the preloaded remainder once it is ready.
(() => {
  const stylesheet = document.getElementById('app-styles');
  if (!stylesheet) return;
  const activate = () => { stylesheet.media = 'all'; };
  try {
    // Reading cssRules can throw on file:// even when the local sheet loaded.
    if (stylesheet.sheet) {
      activate();
      return;
    }
  } catch (e) {}
  stylesheet.addEventListener('load', activate, { once: true });
  stylesheet.addEventListener('error', activate, { once: true });
})();

// ============================
// CONSTANTS & HELPERS
// ============================

const DEFAULT_PIN = '123456';
const STORAGE_KEY = 'talkboard_v2';
const SECURITY_KEY = 'talkboard_security';      // PIN hash + wrong-attempt counter (never exported)
const TREND_KEEP_MS = 190 * 86400000;           // individual taps kept ~6 months; older taps kept as a count
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;        // per clip
const PIN_MAX_TRIES = 5;                        // then 30 s lockout, doubling, max 5 min
const COLOR_NAMES = ['blue', 'green', 'orange', 'purple', 'red', 'teal', 'pink', 'yellow', ''];

const $ = sel => document.querySelector(sel);

// Escape text before it goes into innerHTML (prevents script injection)
function esc(str) {
  return String(str == null ? '' : str).replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c]));
}
const sanitize = esc;

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const uid = prefix => prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const cleanId = id => (typeof id === 'string' && /^[\w-]{1,64}$/.test(id)) ? id : '';

function graphemes(str) {
  try {
    if (window.Intl && Intl.Segmenter) return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(str)].map(s => s.segment);
  } catch (e) {}
  return Array.from(str);
}
function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  return Array.from(s.replace(/[\u0000-\u001F\u007F]/g, '').trim()).slice(0, max).join('').trim();
}
// Icons/emoji: keep up to 4 visible characters (multi-part emoji count as one)
function cleanIcon(s) {
  if (typeof s !== 'string') return '';
  const t = s.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  return t ? graphemes(t).slice(0, 4).join('').slice(0, 32) : '';
}
const isAudioUrl = s => typeof s === 'string' && s.length < 12 * 1024 * 1024 && /^data:(audio\/|video\/|application\/octet-stream)[^,]*;base64,/i.test(s.slice(0, 120));
function localDateStamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ============================
// DEFAULT BOARDS & TILES
// ============================

const DEFAULT_BOARDS = [
  {
    id: 'home',
    name: 'Quick Access',
    icon: '⭐',
    isStandard: true,
    tiles: [
      {id:'t_yes',label:'Yes',emoji:'✅',color:'green'},
      {id:'t_no',label:'No',emoji:'❌',color:'red'},
      {id:'t_help',label:'Help',emoji:'🆘',color:'red'},
      {id:'t_more',label:'More',emoji:'➕',color:'blue'},
      {id:'t_stop',label:'Stop',emoji:'🛑',color:'red'},
      {id:'t_please',label:'Please',emoji:'🙏',color:'purple'},
      {id:'t_thankyou',label:'Thank You',emoji:'😊',color:'green'},
      {id:'t_sorry',label:'Sorry',emoji:'😔',color:'orange'},
      {id:'t_ilike',label:'I Like',emoji:'👍',color:'green'},
      {id:'t_idont',label:'I Don\'t',emoji:'👎',color:'orange'},
      {id:'t_want',label:'I Want',emoji:'🤲',color:'blue'},
      {id:'t_need',label:'I Need',emoji:'‼️',color:'red'},
      {id:'t_finished',label:'Finished',emoji:'✔️',color:'teal'},
      {id:'t_wait',label:'Wait',emoji:'⏳',color:'yellow'},
      {id:'t_again',label:'Again',emoji:'🔁',color:'blue'},
      {id:'t_my',label:'My',emoji:'👤',color:'purple'},
      {id:'s_hello',label:'Hello',emoji:'👋',color:'yellow'},
      {id:'s_bye',label:'Goodbye',emoji:'👋',color:'orange'},
      {id:'s_morning',label:'Good Morning',emoji:'🌅',color:'yellow'},
      {id:'s_night',label:'Good Night',emoji:'🌙',color:'purple'},
      {id:'s_name',label:'My Name is Ayra',emoji:'👩',color:'purple',art:'x_ayra'},
    ]
  },
  {
    id: 'phrases',
    name: 'Phrases',
    icon: '💬',
    isStandard: true,
    tiles: [
      {id:'phrase_morning',label:'Hello Good Morning',emoji:'👋',color:'yellow',art:'s_hello',parts:['s_hello','s_morning']},
      {id:'phrase_like',label:'Yes I Like',emoji:'✅',color:'green',art:'t_yes',parts:['t_yes','t_ilike']},
      {id:'phrase_no',label:'No I Don\'t',emoji:'❌',color:'orange',art:'t_no',parts:['t_no','t_idont']},
      {id:'phrase_ayra',label:'Hello My Name is Ayra',emoji:'👋',color:'purple',art:'s_hello',parts:['s_hello','s_name']},
      {id:'phrase_spotify',label:'Hey Google Play Christmas Playlist on Spotify',emoji:'🎵',color:'blue',art:'x_music'},
    ]
  },
  {
    id: 'feelings',
    name: 'Feelings',
    icon: '😊',
    isStandard: true,
    tiles: [
      {id:'f_happy',label:'Happy',emoji:'😄',color:'yellow'},
      {id:'f_sad',label:'Sad',emoji:'😢',color:'blue'},
      {id:'f_angry',label:'Angry',emoji:'😠',color:'red'},
      {id:'f_scared',label:'Scared',emoji:'😨',color:'purple'},
      {id:'f_surprised',label:'Surprised',emoji:'😲',color:'orange'},
      {id:'f_tired',label:'Tired',emoji:'😴',color:'teal'},
      {id:'f_sick',label:'Sick',emoji:'🤒',color:'green'},
      {id:'f_pain',label:'Pain',emoji:'😣',color:'red'},
      {id:'f_good',label:'Good',emoji:'😊',color:'green'},
      {id:'f_bad',label:'Bad',emoji:'☹️',color:'orange'},
      {id:'f_love',label:'Love',emoji:'❤️',color:'pink'},
      {id:'f_bored',label:'Bored',emoji:'😑',color:'yellow'},
      {id:'f_excited',label:'Excited',emoji:'🎉',color:'orange'},
      {id:'f_calm',label:'Calm',emoji:'😌',color:'teal'},
      {id:'f_confused',label:'Confused',emoji:'😕',color:'orange'},
      {id:'f_hungry',label:'Hungry',emoji:'😋',color:'yellow'},
    ]
  },
  {
    id: 'food',
    name: 'Food & Drink',
    icon: '🍎',
    isStandard: true,
    tiles: [
      {id:'fd_water',label:'Water',emoji:'💧',color:'blue'},
      {id:'fd_food',label:'Food',emoji:'🍽️',color:'orange'},
      {id:'fd_milk',label:'Milk',emoji:'🥛',color:'blue'},
      {id:'fd_juice',label:'Juice',emoji:'🧃',color:'orange'},
      {id:'fd_snack',label:'Snack',emoji:'🍪',color:'yellow'},
      {id:'fd_apple',label:'Apple',emoji:'🍎',color:'red'},
      {id:'fd_banana',label:'Banana',emoji:'🍌',color:'yellow'},
      {id:'fd_bread',label:'Bread',emoji:'🍞',color:'orange'},
      {id:'fd_chicken',label:'Chicken',emoji:'🍗',color:'orange'},
      {id:'fd_rice',label:'Rice',emoji:'🍚',color:'teal'},
      {id:'fd_pizza',label:'Pizza',emoji:'🍕',color:'orange'},
      {id:'fd_burger',label:'Burger',emoji:'🍔',color:'orange'},
      {id:'fd_soup',label:'Soup',emoji:'🍲',color:'red'},
      {id:'fd_cake',label:'Cake',emoji:'🎂',color:'pink'},
      {id:'fd_coffee',label:'Coffee',emoji:'☕',color:'orange'},
      {id:'fd_tea',label:'Tea',emoji:'🍵',color:'green'},
    ]
  },
  {
    id: 'actions',
    name: 'Actions',
    icon: '🏃',
    isStandard: true,
    tiles: [
      {id:'a_go',label:'Go',emoji:'🚶',color:'green'},
      {id:'a_come',label:'Come',emoji:'🙋',color:'blue'},
      {id:'a_eat',label:'Eat',emoji:'🍴',color:'orange'},
      {id:'a_drink',label:'Drink',emoji:'🥤',color:'blue'},
      {id:'a_sleep',label:'Sleep',emoji:'😴',color:'purple'},
      {id:'a_sit',label:'Sit',emoji:'🪑',color:'teal'},
      {id:'a_stand',label:'Stand',emoji:'🧍',color:'green'},
      {id:'a_play',label:'Play',emoji:'🎮',color:'blue'},
      {id:'a_read',label:'Read',emoji:'📖',color:'teal'},
      {id:'a_write',label:'Write',emoji:'✏️',color:'orange'},
      {id:'a_listen',label:'Listen',emoji:'👂',color:'purple'},
      {id:'a_look',label:'Look',emoji:'👁️',color:'blue'},
      {id:'a_give',label:'Give',emoji:'🫳',color:'green'},
      {id:'a_take',label:'Take',emoji:'🫴',color:'orange'},
      {id:'a_open',label:'Open',emoji:'📂',color:'yellow'},
      {id:'a_close',label:'Close',emoji:'📁',color:'red'},
    ]
  },
  {
    id: 'people',
    name: 'People',
    icon: '👨‍👩‍👧‍👦',
    isStandard: true,
    tiles: [
      {id:'p_me',label:'Me',emoji:'👤',color:'blue'},
      {id:'p_you',label:'You',emoji:'👉',color:'green'},
      {id:'p_mom',label:'Mom',emoji:'👩',color:'pink'},
      {id:'p_dad',label:'Dad',emoji:'👨',color:'blue'},
      {id:'p_friend',label:'Friend',emoji:'🤝',color:'green'},
      {id:'p_teacher',label:'Teacher',emoji:'👩‍🏫',color:'teal'},
      {id:'p_doctor',label:'Doctor',emoji:'👨‍⚕️',color:'red'},
      {id:'p_family',label:'Family',emoji:'👨‍👩‍👧‍👦',color:'orange'},
      {id:'p_baby',label:'Baby',emoji:'👶',color:'pink'},
      {id:'p_boy',label:'Boy',emoji:'👦',color:'blue'},
      {id:'p_girl',label:'Girl',emoji:'👧',color:'pink'},
      {id:'p_everyone',label:'Everyone',emoji:'👥',color:'purple'},
    ]
  },
  {
    id: 'places',
    name: 'Places',
    icon: '📍',
    isStandard: true,
    tiles: [
      {id:'pl_home',label:'Home',emoji:'🏠',color:'green'},
      {id:'pl_school',label:'School',emoji:'🏫',color:'blue'},
      {id:'pl_hospital',label:'Hospital',emoji:'🏥',color:'red'},
      {id:'pl_store',label:'Store',emoji:'🏪',color:'orange'},
      {id:'pl_park',label:'Park',emoji:'🌳',color:'green'},
      {id:'pl_toilet',label:'Toilet',emoji:'🚽',color:'blue'},
      {id:'pl_bedroom',label:'Bedroom',emoji:'🛏️',color:'purple'},
      {id:'pl_kitchen',label:'Kitchen',emoji:'🍳',color:'orange'},
      {id:'pl_outside',label:'Outside',emoji:'🌤️',color:'teal'},
      {id:'pl_inside',label:'Inside',emoji:'🛋️',color:'blue'},
      {id:'pl_car',label:'Car',emoji:'🚗',color:'red'},
      {id:'pl_bus',label:'Bus',emoji:'🚌',color:'orange'},
    ]
  },
  {
    id: 'social',
    name: 'Social',
    icon: '💬',
    isStandard: true,
    tiles: [
      {id:'s_how',label:'How are you?',emoji:'🤔',color:'blue'},
      {id:'s_fine',label:'I\'m Fine',emoji:'😊',color:'green'},
      {id:'s_what',label:'What?',emoji:'❓',color:'orange'},
      {id:'s_where',label:'Where?',emoji:'📍',color:'blue'},
      {id:'s_when',label:'When?',emoji:'🕐',color:'purple'},
      {id:'s_who',label:'Who?',emoji:'👤',color:'green'},
      {id:'s_why',label:'Why?',emoji:'🤷',color:'orange'},
    ]
  },
  {
    id: 'body',
    name: 'Body',
    icon: '🫀',
    isStandard: true,
    tiles: [
      {id:'b_head',label:'Head',emoji:'🤕',color:'orange'},
      {id:'b_tummy',label:'Tummy',emoji:'🤢',color:'green'},
      {id:'b_back',label:'Back',emoji:'😣',color:'red'},
      {id:'b_arm',label:'Arm',emoji:'💪',color:'blue'},
      {id:'b_leg',label:'Leg',emoji:'🦵',color:'orange'},
      {id:'b_foot',label:'Foot',emoji:'🦶',color:'teal'},
      {id:'b_hand',label:'Hand',emoji:'✋',color:'yellow'},
      {id:'b_eye',label:'Eye',emoji:'👁️',color:'blue'},
      {id:'b_ear',label:'Ear',emoji:'👂',color:'pink'},
      {id:'b_mouth',label:'Mouth',emoji:'👄',color:'red'},
      {id:'b_nose',label:'Nose',emoji:'👃',color:'orange'},
      {id:'b_hot',label:'Hot',emoji:'🥵',color:'red'},
      {id:'b_cold',label:'Cold',emoji:'🥶',color:'blue'},
      {id:'b_itchy',label:'Itchy',emoji:'😖',color:'yellow'},
      {id:'b_dizzy',label:'Dizzy',emoji:'😵‍💫',color:'purple'},
      {id:'b_breathe',label:'Can\'t Breathe',emoji:'😮‍💨',color:'red'},
    ]
  }
];

// ============================
// ARTWORK
// Illustrated symbols replace the emoji. The emoji stays in the data as a
// fallback (shown if a picture cannot load) and for older backups.
// ============================

const BOARD_ART = { home: 'board_quick', phrases: 'x_speech', feelings: 'f_happy', food: 'fd_apple', actions: 'a_go', people: 'p_family', places: 'pl_home', social: 'x_chat', body: 'x_heart' };
const EXTRA_ART = [
  ['x_chat', 'Chat', '💬'], ['x_speech', 'Talk', '🗨️'], ['x_smile_heart', 'Smile', '🥰'], ['x_handshake', 'Handshake', '🤝'],
  ['x_gift', 'Gift', '🎁'], ['x_music', 'Music', '🎵'], ['x_story', 'Story', '📖'], ['x_playground', 'Playground', '🛝'],
  ['x_shopping', 'Shopping', '🛒'], ['x_bath', 'Bath', '🛁'], ['x_shower', 'Shower', '🚿'], ['x_tooth', 'Tooth', '🦷'],
  ['x_brain', 'Brain', '🧠'], ['x_bandage', 'Bandage', '🩹'], ['x_heart', 'Heart', '❤️'], ['board_quick', 'Star', '⭐']
];
const artPath = id => 'art/' + id + '.webp';
DEFAULT_BOARDS.forEach(b => {
  b.img = artPath(BOARD_ART[b.id]);
  b.tiles.forEach(t => { t.img = artPath(t.art || t.id); });
});
// Every picture, offered when making custom tiles and boards
const ART_LIBRARY = [];
DEFAULT_BOARDS.forEach(b => b.tiles.forEach(t => ART_LIBRARY.push({ img: t.img, label: t.label, emoji: t.emoji })));
EXTRA_ART.forEach(([id, label, emoji]) => ART_LIBRARY.push({ img: artPath(id), label, emoji }));
const ART_FILES = new Set(ART_LIBRARY.map(a => a.img));
const isArtPath = s => typeof s === 'string' && ART_FILES.has(s);

function artResponsiveAttributes(img, sizes) {
  const src = esc(img);
  const smallSrc = esc(img.replace(/\.webp$/i, '-128.webp'));
  return `src="${src}" srcset="${smallSrc} 128w, ${src} 320w" sizes="${sizes}" width="320" height="320"`;
}
const DEFAULT_TILE_ART = {};
DEFAULT_BOARDS.forEach(b => b.tiles.forEach(t => { DEFAULT_TILE_ART[t.id] = t.img; }));

// Picture for a tile/board/word, or its emoji when it has no picture
function symbolHTML(item, spanClass, imgClass, prioritize = false, lazy = false) {
  const fallback = (item && (item.emoji || item.icon)) || '💬';
  if (item && isArtPath(item.img)) {
    const sizes = {
      'tile-img': '(max-width: 600px) 70px, 110px',
      'board-chip-img': '22px',
      'msg-img': '22px',
      'trending-img': '36px',
      'trending-mini-img': '18px',
      'category-card-img': '52px'
    }[imgClass] || '52px';
    const loading = lazy ? ' loading="lazy"' : '';
    const priority = prioritize ? ' fetchpriority="high"' : '';
    return `<img class="${imgClass}" ${artResponsiveAttributes(item.img, sizes)} alt="" aria-hidden="true" draggable="false" decoding="async"${loading}${priority} data-fallback="${esc(fallback)}" data-fallback-class="${spanClass}">`;
  }
  return `<span class="${spanClass}" aria-hidden="true">${esc(fallback)}</span>`;
}

// A picture that fails to load is swapped for its emoji, so no tile is ever blank
document.addEventListener('error', e => {
  const img = e.target;
  if (!img || img.tagName !== 'IMG' || !img.dataset || !img.dataset.fallbackClass) return;
  const span = document.createElement('span');
  span.className = img.dataset.fallbackClass;
  span.setAttribute('aria-hidden', 'true');
  span.textContent = img.dataset.fallback || '💬';
  img.replaceWith(span);
}, true);

// ============================
// STATE
// ============================

function freshState() {
  return {
    isLocked: true,
    currentTab: 'home',
    currentBoardId: 'home',
    outputMode: 'tts',
    theme: 'light',
    tileSize: 'standard',
    highContrast: false,
    usageTracking: true,
    ttsVolume: 1,
    ttsRate: 1,
    ttsVoiceURI: '',
    haptic: true,
    shortcuts: true,       // single-key shortcuts (U, S, 1–3)
    customBoards: [],      // boards the caregiver created
    boardOverrides: [],    // caregiver edits to built-in boards
    deletedBoardIds: [],   // built-in boards hidden by the caregiver
    favoriteTileIds: [],
    recentTileIds: [],
    savedPhrases: [],
    trendingData: {},      // { tileId: { label, emoji, taps: [timestamps, ascending], older: count, olderLast: ts } }
    trendPeriod: 'day',
    message: []            // [{ label, emoji, tileId }]
  };
}
let STATE = freshState();

// ============================
// AUDIO STORE (IndexedDB)
// Audio clips live in IndexedDB, not localStorage, so they cannot fill
// the ~5 MB localStorage quota and block every other save.
// Falls back to memory + inline storage if IndexedDB is unavailable.
// ============================

const AudioStore = (() => {
  const DB = 'talkboard_audio', STORE = 'clips';
  const cache = new Map();
  let db = null, mode = 'pending';
  function openDb() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }
  function run(rw, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, rw);
      fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }
  async function init() {
    try {
      if (!('indexedDB' in window)) throw new Error('IndexedDB not supported');
      db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (c) { if (typeof c.value === 'string') cache.set(String(c.key), c.value); c.continue(); }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      mode = 'idb';
    } catch (e) {
      console.warn('Audio storage unavailable, keeping clips in page storage instead:', e);
      db = null; mode = 'memory';
    }
    return mode;
  }
  const ready = init();
  return {
    ready,
    get mode() { return mode; },
    forceMemory() { mode = 'memory'; },
    cacheOnly(k, v) { cache.set(k, v); },
    has: k => cache.has(k),
    get: k => cache.get(k) || null,
    keys: () => [...cache.keys()],
    async put(k, v) { await ready; if (mode === 'idb') await run('readwrite', s => s.put(v, k)); cache.set(k, v); },
    async del(k) { await ready; if (mode === 'idb') await run('readwrite', s => s.delete(k)); cache.delete(k); },
    async clear() { await ready; if (mode === 'idb') await run('readwrite', s => s.clear()); cache.clear(); }
  };
})();

let persistAsked = false;
function requestPersistence() {
  if (persistAsked) return;
  persistAsked = true;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
}
async function setAudio(key, dataUrl) {
  await AudioStore.put(key, dataUrl);
  if (AudioStore.mode === 'memory') saveState();
  requestPersistence();
}
function removeAudio(key) {
  if (!AudioStore.has(key)) return;
  AudioStore.del(key).then(() => { if (AudioStore.mode === 'memory') saveState({ quiet: true }); }).catch(e => console.warn('Could not remove clip', e));
}
