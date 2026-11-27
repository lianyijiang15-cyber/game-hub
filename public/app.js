'use strict';

const socket = io();
const $ = id => document.getElementById(id);
let room = null;
let soup = null;
let onlineSoup = false;
let soupSequence = 0;
let soupPending = false;
let soupDifficulty;
let soupStoryId;
let soupStage = 'levels';
let soupPage = 0;
let soupPanels = [];
const soupLevelButtons = ['soup-easy', 'soup-medium', 'soup-hard'];

const narrationButton = $('comic-narration');
const narrationVoice = window.speechSynthesis;
const Utterance = window.SpeechSynthesisUtterance;
let activeNarration = null;
narrationButton.hidden = !narrationVoice || !Utterance;

function stopNarration() {
  if (!activeNarration) return;
  clearTimeout(activeNarration.timer);
  activeNarration = null;
  narrationVoice.cancel();
  narrationButton.textContent = '播放旁白';
}

narrationButton.onclick = () => {
  if (activeNarration) return stopNarration();
  if (!narrationVoice || !Utterance || soupStage !== 'comic' || !soupPanels[soupPage]) return;
  const voices = narrationVoice.getVoices();
  const mandarin = voices.filter(option => /^zh(?:[-_]|$)/i.test(option.lang));
  const taiwan = mandarin.filter(option => /^zh[-_](tw|hant)/i.test(option.lang));
  const choices = taiwan.length ? taiwan : mandarin;
  const voice = choices.find(option => /natural|neural|online|premium|enhanced|自然|高品質/i.test(option.name)) ?? choices[0];
  // Keep commas inside each spoken phrase so the voice can use its own internal pauses.
  const phrases = soupPanels[soupPage].match(/[^。！？；…]+[。！？；…]*|[。！？；…]+/g)
    ?.map(phrase => phrase.trim()).filter(Boolean);
  if (!phrases?.length) return;
  const narration = { timer: null };
  activeNarration = narration;
  narrationButton.textContent = '停止旁白';

  function speak(index) {
    if (activeNarration !== narration) return;
    const phrase = phrases[index];
    const clip = new Utterance(phrase);
    const question = /[？?]/.test(phrase);
    const suspense = /[…]|突然|忽然|沒想到|竟然|震驚|卻|只傳來/.test(phrase);
    clip.lang = 'zh-TW';
    clip.rate = suspense ? .83 : index % 2 ? .92 : .89;
    clip.pitch = question ? 1.08 : suspense ? .92 : index % 2 ? 1.02 : .98;
    if (voice) clip.voice = voice;
    clip.onend = () => {
      if (activeNarration !== narration) return;
      if (index + 1 < phrases.length) {
        narration.timer = setTimeout(() => speak(index + 1), suspense ? 480 : 230);
      } else {
        activeNarration = null;
        narrationButton.textContent = '播放旁白';
      }
    };
    clip.onerror = () => {
      if (activeNarration !== narration) return;
      stopNarration();
      $('soup-record').textContent = '無法播放中文旁白，可以繼續閱讀漫畫字幕。';
    };
    narrationVoice.speak(clip);
  }

  $('soup-record').textContent = '';
  speak(0);
};

function showSoupStage(stage) {
  if (stage !== 'comic') stopNarration();
  soupStage = stage;
  $('soup').dataset.case = stage === 'levels' ? '' : soupStoryId ?? '';
  for (const name of ['levels', 'comic', 'investigation']) $('soup-' + name).hidden = stage !== name;
  $('soup-investigation-layout').hidden = stage !== 'investigation';
  $('soup-level-back').hidden = stage === 'levels';
}

function showComicPage(index) {
  stopNarration();
  soupPage = Math.max(0, Math.min(index, soupPanels.length - 1));
  $('comic-picture').dataset.page = String(soupPage);
  $('comic-caption').textContent = soupPanels[soupPage];
  $('comic-page-count').textContent = `${soupPage + 1} / ${soupPanels.length}`;
  $('comic-previous').disabled = soupPage === 0;
  const last = soupPage === soupPanels.length - 1;
  $('comic-next').hidden = last;
  $('comic-start').hidden = !last;
}

function prepareComic(view) {
  soupStoryId = view.storyId;
  soupPanels = view.panels;
  $('soup-difficulty').textContent = view.difficulty;
  $('soup-comic-title').textContent = view.title;
  const background = `background-image: url(/art/comics/${encodeURIComponent(view.storyId)}.webp)`;
  $('comic-picture').setAttribute('style', background);
  $('soup-reference-pages').replaceChildren(...soupPanels.map((caption, index) => {
    const panel = element('figure', '');
    panel.className = 'soup-page';
    const picture = element('div', '');
    picture.className = 'comic-picture';
    picture.dataset.page = String(index);
    picture.setAttribute('style', background);
    picture.setAttribute('aria-hidden', 'true');
    panel.append(picture, element('figcaption', caption));
    return panel;
  }));
  $('question').value = '';
  $('soup-question-log').replaceChildren();
  $('soup-no-questions').hidden = false;
  renderSoup(view);
  showComicPage(0);
  showSoupStage('comic');
  $('comic-next').focus();
}

function chooseSoupLevel() {
  soupSequence++;
  $('soup-record').textContent = '';
  showSoupStage('levels');
  $('soup-easy').focus();
}


function renderSoup(view) {
  $('soup-title').textContent = view.title;
  $('soup-story').textContent = view.intro;
  $('hints').textContent = 3 - view.hints;
  $('soup-hint').disabled = view.hints >= 3;
  $('soup-progress').textContent = `已解鎖線索：${view.progress}/${view.clues}`;
  $('answer').textContent = view.reply;
  $('soup-end').textContent = view.end;
}

function openSoup() {
  show('soup');
  chooseSoupLevel();
}

async function newSoup(difficulty = soupDifficulty) {
  if (soupPending || !soupDifficulties.includes(difficulty)) return;
  const sequence = ++soupSequence;
  const previousStory = difficulty === soupDifficulty ? soupStoryId : undefined;
  soupDifficulty = difficulty;
  onlineSoup = typeof playerAccount !== 'undefined' && Boolean(playerAccount.profile);
  $('soup-record').textContent = '';
  if (!onlineSoup) {
    soup = startSoupGame(Math.random, difficulty, previousStory);
    prepareComic(soupView(soup));
    return;
  }
  soupPending = true;
  const buttons = [...soupLevelButtons, 'soup-next-case'].map($);
  for (const button of buttons) button.disabled = true;
  $('soup-record').textContent = '載入漫畫與題目中…';
  try {
    const view = await accountRequest('soup/start', { difficulty });
    if (sequence !== soupSequence) return;
    soup = view.id;
    $('soup-record').textContent = '';
    prepareComic(view);
  } catch (error) {
    if (sequence === soupSequence) $('soup-record').textContent = error.message;
  } finally {
    soupPending = false;
    for (const button of buttons) button.disabled = false;
  }
}

for (const [index, id] of soupLevelButtons.entries()) $(id).onclick = () => newSoup(soupDifficulties[index]);
$('soup-level-back').onclick = chooseSoupLevel;
$('soup-next-case').onclick = () => newSoup();
$('comic-previous').onclick = () => showComicPage(soupPage - 1);
$('comic-next').onclick = () => {
  showComicPage(soupPage + 1);
  if (!$('comic-start').hidden) $('comic-start').focus();
};
$('comic-start').onclick = () => {
  if (soupPage !== soupPanels.length - 1) return;
  showSoupStage('investigation');
  $('question').focus();
};
$('soup-reread').onclick = () => {
  showComicPage(0);
  showSoupStage('comic');
  $('comic-next').focus();
};
$('soup-question-form').onsubmit = event => {
  event.preventDefault();
  return askSoup();
};

function renderSoupAction(view, action, question) {
  renderSoup(view);
  if (action !== 'ask') return;
  const row = element('li', '');
  row.append(element('strong', question), element('p', view.reply));
  $('soup-question-log').append(row);
  $('soup-no-questions').hidden = true;
}

async function submitSoupAction(action, question) {
  if (soupStage !== 'investigation' || !soup || soupPending) return;
  const sequence = soupSequence;
  if (!onlineSoup) {
    const game = soup;
    let verdict;
    if (action === 'ask' && typeof accountRequest === 'function') {
      soupPending = true;
      try {
        ({ verdict } = await accountRequest('soup/judge-guest', { storyId: soupStoryId, question }));
      } catch {
        // Guests still have the local judge if the server is unreachable.
      } finally {
        soupPending = false;
      }
    }
    if (sequence !== soupSequence) return false;
    playSoup(game, action, question, verdict);
    renderSoupAction(soupView(game), action, question);
    return true;
  }
  soupPending = true;
  $('soup-record').textContent = '';
  try {
    const view = await accountRequest('soup/action', { id: soup, action, question });
    if (sequence !== soupSequence) return false;
    renderSoupAction(view, action, question);
    return true;
  } catch (error) {
    if (sequence === soupSequence) $('soup-record').textContent = error.message;
    return false;
  } finally {
    soupPending = false;
  }
}

function askSoup() {
  const input = $('question');
  const question = input.value.trim();
  if (!question || !soup || soupPending) return;
  if (!onlineSoup) {
    input.value = '';
    return submitSoupAction('ask', question);
  }
  const submitted = input.value;
  return submitSoupAction('ask', question).then(ok => {
    if (ok && input.value === submitted) input.value = '';
  });
}
function hint() { return submitSoupAction('hint'); }
function reveal() { return submitSoupAction('reveal'); }

const jobNames = { warrior: '戰士', archer: '弓箭手', mage: '法師' };
const skills = { warrior: '旋風斬', archer: '三重箭', mage: '火球術' };
const baseStats = {
  warrior: { role: '近戰前排', hp: 800, defense: 35, range: 52, speed: 150, damage: 90, cooldown: 650, description: '以盾甲扛住第一波攻勢，逼近敵人後用長劍封住狹窄通道。敵人圍上來時，旋風斬能同時攻擊周圍目標。' },
  archer: { role: '遠距游擊', hp: 600, defense: 12, range: 240, speed: 185, damage: 72, cooldown: 850, description: '利用長弓和最快的移動速度，從遠處牽制敵人。三重箭向不同角度飛出，適合封住通道或在近距離打中多支。' },
  mage: { role: '遠程範圍傷害', hp: 560, defense: 8, range: 190, speed: 165, damage: 86, cooldown: 950, description: '靠隊友掩護尋找施法角度。火球撞擊後會爆炸，適合攻擊聚在一起的敵人。' }
};
const classDetails = Object.fromEntries(playableOrder.map(id => {
  const hero = playableHeroes[id];
  return [id, { ...baseStats[hero.job], ...hero, speed: adjustedSpeed(hero.speed) }];
}));
const heroSkillKeys = ['Q', 'C', 'V'];
function heroName(player) { return heroes[player.hero ?? player.job]?.name ?? jobNames[player.job]; }
function heroArt(id, type, job = id) {
  const variant = type === 'avatar' ? 'portrait' : type;
  return Object.hasOwn(heroes, id) ? `/art/heroes/${id}-${variant}.webp` : `/art/${job}-${type}.webp`;
}
let phase = 'lobby';
let isRoomHost = false;
let loadingDeadline = 0;
let frame = null;
let previous = null;
let receivedAt = 0;
let listedRooms = [];
let joining = false;
let roomRequest = 0;
const keys = new Set();
const touchPad = $('touch-movement');
const touchStick = $('touch-stick');
const coarsePointer = window.matchMedia?.('(any-pointer: coarse)');
let touchPointer = null;
let touchVector = { x: 0, y: 0 };
const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
let spectatorTarget = null;
let eliminationNoticeUntil = 0;
let pendingAttack = null;
let attackDeadline = { server: 0, local: 0 };

function syncAttackDeadline(deadline, serverNow) {
  if (!Number.isFinite(deadline) || deadline < attackDeadline.server || !Number.isFinite(serverNow)) return;
  const end = performance.now() + Math.max(0, deadline - serverNow);
  attackDeadline = { server: deadline, local: deadline === attackDeadline.server ? Math.min(attackDeadline.local, end) : end };
}

const panKeys = new Set(['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
function localPlayer(state = frame) { return state?.players?.find(player => player.id === socket.id); }
function directionOfKeys(spectating = false) {
  const axis = (key, arrow) => Number(keys.has(key) || spectating && keys.has(arrow));
  if (touchPointer !== null) return touchVector;
  return { x: axis('KeyD', 'ArrowRight') - axis('KeyA', 'ArrowLeft'),
    y: axis('KeyS', 'ArrowDown') - axis('KeyW', 'ArrowUp') };
}
let aim = null;
let worldMap = null;
let worldChests = [];
let lootToastUntil = 0;
const modeNames = { deathmatch: '團隊死鬥', flag: '拔旗戰', survival: '生存戰', control: '據點戰' };
const roleNames = { commander: '指揮', support: '輔助', fighter: '打手' };
const modeReasons = { flag: '敵隊旗幟已被拔下', closest: '以最靠近旗區的存活隊員判定',
  eliminated: '一方全員淘汰，立即結算', time: '時間結束', 'all-marked': '所有據點已完成標記' };
let selectedMode = 'deathmatch';
let fullMap = false;

const matchKey = 'game-hub-seat';

function show(id) {
  if (id !== 'soup') stopNarration();
  for (const panel of ['title-screen', 'home', 'modes', 'soup', 'lobby', 'game']) $(panel).hidden = panel !== id;
  if (id !== 'game') $('game').classList.remove('in-combat', 'in-selection', 'in-lobby', 'in-loading', 'in-results');
  if (id === 'home') $('menu-arena').focus();
  if (id === 'modes') { roomRequest++; joining = false; }
  if (id === 'title-screen') $('title-start').focus();
}

$('title-start').onclick = () => show('home');
$('menu-back').onclick = () => show('title-screen');
function openModes() {
  show('modes');
  $('mode-flag').focus();
}
$('menu-arena').onclick = openModes;
$('modes-back').onclick = home;
for (const mode of Object.keys(modeNames)) $('mode-' + mode).onclick = () => openLobby(mode);
$('menu-soup').onclick = openSoup;

function exitRoom() {
  sessionStorage.removeItem(matchKey);
  stopMovement();
  if (room && socket.connected) socket.emit('leave');
  room = null;
  worldMap = null;
  phase = 'lobby';
  frame = previous = null;
  $('messages').replaceChildren();
  $('chat-input').value = '';
  openLobby();
}

function home() {
  sessionStorage.removeItem(matchKey);
  stopMovement();
  if (room && socket.connected) socket.emit('leave');
  room = null;
  worldMap = null;
  phase = 'lobby';
  frame = previous = null;
  roomRequest++;
  joining = false;
  show('home');
}

function openLobby(mode = selectedMode) {
  selectedMode = mode;
  $('lobby-mode').textContent = modeNames[mode];
  $('room-guide').hidden = mode === 'deathmatch';
  $('room-guide').setAttribute('aria-label', modeNames[mode] + '玩法介紹');
  $('lobby').dataset.mode = mode;
  $('entry-rules').textContent = {
    deathmatch: '5v5 · 5 分鐘 · 率先取得 20 擊殺', flag: '5v5 · 20 分鐘 · 拔下敵方旗幟',
    survival: '5v5 · 24 分鐘 · 任一隊全滅即結算', control: '5v5 · 20 分鐘 · 完成據點標記'
  }[mode];
  $('error').textContent = '';
  const name = typeof playerAccount === 'undefined' ? '' : playerAccount.profile?.name;
  $('nickname').readOnly = Boolean(name);
  if (name) $('nickname').value = name;
  show('lobby');
  renderRoomList();
  if (socket.connected) socket.emit('list');
}

function sendRoomCommand(event, ...args) {
  if (!socket.connected) {
    $('room-error').textContent = '連線中斷';
    return;
  }
  socket.timeout(3000).emit(event, ...args, (error, result) => {
    $('room-error').textContent = error ? '伺服器未回應這項操作，請確認已更新並重啟 PIXEL CLASH。' : result?.error || '';
    if (result?.room) renderRoom(result.room);
  });
}

function enter(event, data) {
  if (!socket.connected || joining) {
    if (!socket.connected) $('error').textContent = '尚未連線，請稍後再試';
    return;
  }
  joining = true;
  const request = ++roomRequest;
  socket.timeout(3500).emit(event, { ...data, name: $('nickname').value }, (error, result) => {
    if (request !== roomRequest) {
      if (result?.id && !room) socket.emit('leave');
      return;
    }
    joining = false;
    if (error || result.error) {
      if (event === 'resume') exitRoom();
      $('error').textContent = error ? '連線逾時' : result.error;
      return;
    }
    room = result.id;
    if (result.ticket) sessionStorage.setItem(matchKey, JSON.stringify({ id: room, ticket: result.ticket }));
    worldMap = null;
    phase = 'lobby';
    frame = previous = null;
    $('messages').replaceChildren();
    $('chat-input').value = '';
    $('room-error').textContent = '';
    $('room-id').textContent = room;
    $('waiting').hidden = false;
    $('match-loading').hidden = $('battle').hidden = $('results').hidden = true;
    show('game');
    if (result.room) renderRoom(result.room);
    if (result.map) worldMap = result.map;
    worldChests = result.chests || [];
  });
}

function createRoom() { enter('create', { type: 'arena', size: 10, mode: selectedMode }); }
$('room-entry-back').onclick = openModes;
$('entry-create').onclick = createRoom;
$('entry-join').onsubmit = event => { event.preventDefault(); joinRoom(); };

function joinRoom(id) { enter('join', { id: id || $('room-code').value, mode: selectedMode }); }
function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function renderRoomList() {
  const list = $('room-list');
  list.replaceChildren();
  const matching = listedRooms.filter(entry => (entry.mode ?? 'deathmatch') === selectedMode);
  if (!matching.length) list.append(element('p', '目前沒有房間'));
  for (const entry of matching) {
    const label = { lobby: '等待中', selection: '選角中', loading: '載入中', playing: '對戰中', ended: '已結束' }[entry.phase];
    const row = element('p', `${entry.id} · ${entry.count}/${entry.size} · ${label} `);
    if (entry.phase === 'lobby' && entry.count < entry.size) {
      const join = element('button', '加入');
      join.className = 'secondary';
      join.onclick = () => joinRoom(entry.id);
      row.append(join);
    }
    list.append(row);
  }
}

socket.on('rooms', entries => {
  listedRooms = entries;
  if (!$('lobby').hidden) renderRoomList();
});

function renderClass(job) {
  const details = classDetails[job];
  const profile = $('class-profile');
  if (profile.dataset.job !== job || !$('class-role').textContent) {
    const art = $('class-art');
    art.src = heroArt(job, 'portrait');
    art.alt = details.name + '頭肩立繪';
  }
  profile.dataset.job = job;
  profile.setAttribute('style', '--class-color: ' + details.color);
  $('class-name').textContent = details.name;
  $('class-role').textContent = roleNames[details.role] + (details.role === 'support' ? ' · 可融合資源' : '');
  $('job-description').textContent = details.description;
  $('class-hp').textContent = details.hp + ' HP';
  $('class-range').textContent = details.range + ' px';
  $('class-speed').textContent = details.speed + ' px/s';
  $('class-damage').textContent = details.damage;
  $('class-defense').textContent = `${details.defense}（減傷 ${Math.round(100 * details.defense / (100 + details.defense))}%）`;
  $('class-cooldown').textContent = details.cooldown + ' ms';
  const values = [details.hp / Math.max(...Object.values(classDetails).map(entry => entry.hp)), details.speed / 500, details.range / 240,
    details.damage / 650, 650 / details.cooldown];
  const points = values.map((value, index) => {
    const angle = index * Math.PI * 2 / values.length - Math.PI / 2;
    return `${50 + 42 * value * Math.cos(angle)}% ${50 + 42 * value * Math.sin(angle)}%`;
  });
  $('chart-shape').setAttribute('style', `clip-path: polygon(${points.join(',')})`);
  $('class-skills').replaceChildren(...details.skills.map(([name, cooldown, description], index) => {
    const item = element('li', '');
    item.append(element('kbd', heroSkillKeys[index]), element('strong', name + ' · ' + cooldown + ' 秒'),
      element('span', description));
    return item;
  }));
  for (const [category, button] of Object.entries(categoryButtons)) {
    button.setAttribute('aria-pressed', String(playableHeroes[category].role === details.role));
  }
  const ordered = classOrder.filter(id => playableHeroes[id].role === details.role);
  for (const [id, button] of Object.entries(classButtons)) {
    button.setAttribute('aria-pressed', String(id === job));
    button.hidden = playableHeroes[id].role !== details.role;
    button.dataset.position = ['center', 'right', 'left'][(ordered.indexOf(id) - ordered.indexOf(job) + 3) % 3];
  }
}

const classOrder = playableOrder;
const classButtons = Object.fromEntries(classOrder.map(job => [
  job, $('class-' + job)
]));
const categoryButtons = { sky: $('hero-commanders'), sain: $('hero-supports'), alpha: $('hero-fighters') };
for (const [job, button] of Object.entries(categoryButtons)) button.onclick = () => sendRoomCommand('chooseClass', job);
for (const [job, button] of Object.entries(classButtons)) {
  button.replaceChildren(Object.assign(element('img', ''), { src: heroArt(job, 'model'), alt: '', width: 220, height: 310 }),
    element('span', heroes[job].name));
  button.onclick = () => {
    if ($('class-profile').dataset.job !== job) sendRoomCommand('chooseClass', job);
  };
}

function rotateClass(direction) {
  if ($('class-prev').disabled) return;
  const active = $('class-profile').dataset.job;
  const available = classOrder.filter(id => playableHeroes[id].role === playableHeroes[active].role);
  const job = available[(available.indexOf(active) + direction + available.length) % available.length];
  sendRoomCommand('chooseClass', job);
}
$('class-prev').onclick = () => rotateClass(-1);
$('class-next').onclick = () => rotateClass(1);

function renderLoading(state) {
  loadingDeadline = performance.now() + state.loadingRemaining;
  for (const [team, id] of [['藍隊', 'loading-blue'], ['紅隊', 'loading-red']]) {
    const roster = $(id);
    roster.replaceChildren();
    for (const player of state.players.filter(entry => entry.team === team)) {
      const card = element('div', '');
      card.className = 'loading-card';
      card.dataset.local = String(player.id === socket.id);
      const art = element('img', '');
      art.src = heroArt(player.hero ?? player.job, 'model');
      art.alt = '';
      card.append(art, element('strong', player.name),
        element('small', heroName(player) + (player.role ? ' · ' + roleNames[player.role] : '') + (player.bot ? ' · AI' : '')));
      roster.append(card);
    }
  }
}

function renderRoom(state) {
  if (state.id !== room) return;
  selectedMode = state.mode ?? selectedMode;
  const me = state.players.find(player => player.id === socket.id);
  if (!me) return;
  const host = state.host === socket.id;
  isRoomHost = host;
  const waiting = state.phase === 'lobby';
  const selecting = state.phase === 'selection';
  if (phase !== state.phase) {
    stopMovement();
    if (phase === 'lobby' || waiting || state.phase === 'ended') $('messages').replaceChildren();
    if (state.phase === 'playing' || waiting) frame = previous = null;
    if (state.phase === 'loading') {
      worldMap = null;
      worldChests = [];
      lootToastUntil = 0;
      fullMap = false;
      $('tactical-overlay').hidden = true;
    }
  }
  phase = state.phase;
  $('waiting').hidden = !(waiting || selecting);
  $('room-waiting').hidden = !waiting;
  $('class-profile').hidden = !selecting;
  $('match-loading').hidden = phase !== 'loading';
  if (phase === 'loading') renderLoading(state);
  $('battle').hidden = phase !== 'playing';
  $('game').classList.toggle('in-combat', phase === 'playing');
  $('game').classList.toggle('in-selection', selecting);
  $('game').classList.toggle('in-lobby', waiting);
  $('game').classList.toggle('in-loading', phase === 'loading');
  $('game').classList.toggle('in-results', phase === 'ended');
  $('results').hidden = phase !== 'ended';
  $('chat-title').textContent = waiting ? '房間聊天' : '隊伍聊天';
  $('rematch').hidden = !host;
  const full = state.players.length === state.size;
  const unready = state.players.filter(player => !player.ready).length;
  if (selecting) {
    renderClass(Object.hasOwn(playableHeroes, me.hero) ? me.hero : 'sky');
    for (const button of [...Object.values(classButtons), ...Object.values(categoryButtons)]) button.disabled = me.ready;
    $('class-prev').disabled = $('class-next').disabled = me.ready;
    $('ready').hidden = me.ready;
    $('unlock').hidden = !me.ready;
    $('start').hidden = !host || !me.ready;
    $('start').disabled = !full || unready > 0;
    $('start-help').textContent = !me.ready ? '選好後按「確認選角」' :
      unready ? `等待 ${unready} 名玩家確認職業` : host ? '全員已確認，可以開局' : '全員已確認，等待房主開局';
    const team = $('selection-team');
    team.replaceChildren();
    for (const player of state.players.filter(entry => entry.team && entry.team === me.team)) {
      const tile = element('div', '');
      tile.className = 'selection-teammate';
      tile.dataset.ready = String(player.ready);
      const art = element('img', '');
      art.src = heroArt(player.hero ?? player.job, 'avatar');
      art.alt = '';
      tile.append(art, element('strong', player.name),
        element('small', heroName(player) + (player.ready ? ' · 已確認' : ' · 選角中')));
      team.append(tile);
    }
    return;
  }
  if (!waiting) return;
  $('waiting-title').textContent = modeNames[selectedMode] + ' · 等待大廳';
  $('waiting-rule').textContent = { deathmatch: '5 分鐘 · 20 擊殺', flag: '20 分鐘 · 爭奪中央旗幟',
    survival: '24 分鐘 · 比較平均生存時間', control: '20 分鐘 · 標記及守住據點' }[selectedMode];
  $('seat-count').textContent = `玩家 ${state.players.length}/${state.size}`;
  $('players').replaceChildren();
  for (const player of state.players) {
    const tile = element('div', '');
    tile.className = 'player-tile';
    tile.dataset.ready = String(player.ready);
    const badge = element('span', player.bot ? 'AI' : '玩家');
    badge.className = 'private-avatar';
    tile.append(badge);
    tile.append(element('strong', player.name),
      element('small', `${player.id === me.id ? '你 · ' : ''}${player.ready ? '已準備' : '未準備'}${player.id === state.host ? ' · 房主' : ''}`));
    if (host && player.bot) {
      const remove = element('button', '移除 AI');
      remove.className = 'ghost';
      remove.onclick = () => sendRoomCommand('removeBot', player.id);
      tile.append(remove);
    }
    $('players').append(tile);
  }
  for (let index = state.players.length; index < state.size; index++) {
    const empty = element('div', '');
    empty.className = 'player-tile vacant';
    empty.append(element('span', '+'), element('small', '空位'));
    $('players').append(empty);
  }
  const bots = state.players.filter(player => player.bot).length;
  $('bot-controls').hidden = !host;
  $('add-bot').disabled = $('fill-bots').disabled = full;
  $('bot-summary').textContent = `${bots} 名 AI · ${state.size - state.players.length} 個空位`;
  $('bot-help').textContent = host ? '用 AI 補足空位，單人也能開局。' : '由房主加入或移除 AI。';
  $('lobby-ready').textContent = me.ready ? '取消準備' : '準備';
  $('lobby-start').hidden = !host;
  $('lobby-start').disabled = !full || unready > 0;
  $('lobby-help').textContent = !full ? `還有 ${state.size - state.players.length} 個空位` :
    unready ? `等待 ${unready} 名玩家準備` : '全員就緒，等待房主進入選角';

}
socket.on('room', renderRoom);
$('add-bot').onclick = () => sendRoomCommand('addBot');
$('fill-bots').onclick = () => sendRoomCommand('fillBots');
$('lobby-ready').onclick = () => sendRoomCommand('ready');
$('lobby-start').onclick = () => sendRoomCommand('start');
$('ready').onclick = () => sendRoomCommand('ready');
$('unlock').onclick = () => sendRoomCommand('ready');
$('start').onclick = () => sendRoomCommand('start');
$('return-lobby').onclick = () => {
  if (isRoomHost) sendRoomCommand('returnLobby');
  else exitRoom();
};
$('rematch').onclick = () => sendRoomCommand('rematch');

socket.on('chat', message => {
  if (!room) return;
  const messages = $('messages');
  messages.append(element('p', `${message.name}：${message.text}`));
  if (messages.children.length > 60) messages.firstElementChild.remove();
  messages.scrollTop = messages.scrollHeight;
});
$('chat-input').onfocus = stopMovement;
$('chat-form').onsubmit = event => {
  event.preventDefault();
  const input = $('chat-input');
  if (!input.value.trim()) return;
  sendRoomCommand('chat', input.value);
  input.value = '';
  input.blur();
};

socket.on('roomClosed', reason => {
  if (!room) return;
  exitRoom();
  $('error').textContent = reason;
});

socket.on('connect', () => {
  const saved = sessionStorage.getItem(matchKey);
  if (saved) enter('resume', JSON.parse(saved));
});

socket.on('disconnect', () => {
  if (!room) return;
  stopMovement();
  $('room-error').textContent = '連線中斷，正在嘗試恢復席位…';
});

function sendMovement() {
  if (phase !== 'playing' || !socket.connected || !localPlayer()?.alive) return;
  socket.volatile.emit('arenaInput', directionOfKeys());
}

function resetTouch() {
  const pointer = touchPointer;
  touchPointer = null;
  touchVector = { x: 0, y: 0 };
  touchStick.setAttribute('style', '');
  if (pointer !== null && touchPad.hasPointerCapture?.(pointer)) touchPad.releasePointerCapture(pointer);
}

function stopMovement() {
  keys.clear();
  resetTouch();
  if (phase === 'playing' && socket.connected && localPlayer()?.alive) socket.emit('arenaInput', { x: 0, y: 0 });
}

function moveTouch(event) {
  if (event.pointerId !== touchPointer) return;
  const { left, top, width, height } = touchPad.getBoundingClientRect();
  const radius = Math.min(width, height) * .34;
  const x = (event.clientX - left - width / 2) / radius;
  const y = (event.clientY - top - height / 2) / radius;
  const length = Math.hypot(x, y);
  const divisor = Math.max(1, length);
  touchVector = length < .12 ? { x: 0, y: 0 } : { x: x / divisor, y: y / divisor };
  touchStick.setAttribute('style', `transform:translate(${touchVector.x * radius}px, ${touchVector.y * radius}px)`);
  if (spectatorTarget !== null) selectSpectator(null);
  sendMovement();
}

touchPad.onpointerdown = event => {
  if (event.pointerType !== 'touch' || touchPointer !== null || phase !== 'playing' || fullMap || !localPlayer()) return;
  event.preventDefault();
  touchPointer = event.pointerId;
  touchPad.setPointerCapture(touchPointer);
  moveTouch(event);
};
touchPad.onpointermove = moveTouch;
touchPad.onpointerup = touchPad.onpointercancel = touchPad.onlostpointercapture = event => {
  if (event.pointerId !== touchPointer) return;
  resetTouch();
  if (keys.size) sendMovement();
  else stopMovement();
};

function aimInWorld() {
  const canvas = $('arena');
  const cursor = aim || { x: canvas.width / 2 + 45, y: canvas.height / 2 };
  return {
    x: Math.max(0, Math.min(worldMap.width, cursor.x / arenaZoom + arenaCamera.x)),
    y: Math.max(0, Math.min(worldMap.height, cursor.y / arenaZoom + arenaCamera.y))
  };
}

function attack(skill) {
  if (phase !== 'playing' || !socket.connected || !localPlayer()?.alive || !worldMap) return;
  const input = { ...aimInWorld(), skill };
  if (skill) {
    socket.volatile.emit('arenaAttack', input);
    return;
  }
  if (pendingAttack || performance.now() < attackDeadline.local) return;
  const request = { room, player: localPlayer().spawnedAt };
  pendingAttack = request;
  socket.timeout(850).emit('arenaAttack', input, (error, answer) => {
    if (pendingAttack !== request) return;
    pendingAttack = null;
    if (!error && room === request.room && localPlayer()?.spawnedAt === request.player) {
      syncAttackDeadline(answer?.attackAt, answer?.now);
    }
  });
}

const skillButtons = Array.from({ length: 3 }, (_, index) => $('hero-skill-' + index));
function castHeroSkill(slot) {
  const player = frame?.players.find(p => p.id === socket.id);
  if (!player?.alive || !worldMap) return;
  const hero = playableHeroes[player.hero];
  if (!hero) {
    if (!slot) attack(true);
    return;
  }
  const point = aimInWorld();
  const closest = players => {
    const target = [...players].sort((a, b) =>
      Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
    return target && Math.hypot(target.x - point.x, target.y - point.y) <= 48 ? target.id : undefined;
  };
  const kind = hero.skills[slot][3];
  const ally = ['ally', 'dual'].includes(kind) ? $('skill-ally').value || closest(frame.skillAllies ?? []) : undefined;
  const enemy = ['enemy', 'dual'].includes(kind) ? closest(frame.players.filter(p => p.alive && p.team !== player.team)) : undefined;
  lootCommand('heroSkill', { slot, ally, enemy });
}

skillButtons.forEach((button, index) => { button.onclick = () => castHeroSkill(index); });
$('skill-ally').onchange = () => $('skill-ally').blur();

function drawHeroHud(state, me, now, cooldown) {
  const hero = playableHeroes[me.hero];
  $('legacy-skill').hidden = Boolean(hero);
  $('hero-skill-controls').hidden = !hero;
  if (!hero) {
    $('skill-status').textContent = `${skills[me.job]} · ${cooldown(me.skillAt)}`;
    return;
  }
  const allySelect = $('skill-ally');
  allySelect.hidden = !hero.skills.some(entry => entry[3] === 'ally' || entry[3] === 'dual');
  const teammates = state.skillAllies ?? [];
  const signature = teammates.map(ally => ally.id).join(',');
  if (allySelect.dataset.roster !== signature) {
    const previous = allySelect.value;
    allySelect.dataset.roster = signature;
    allySelect.replaceChildren(Object.assign(element('option', '指定隊友…'), { value: '' }),
      ...teammates.map(({ id, name }) => Object.assign(element('option', name), { value: id })));
    if (teammates.some(ally => ally.id === previous)) allySelect.value = previous;
  }
  skillButtons.forEach((button, slot) => {
    const [label, , description] = hero.skills[slot];
    const at = state.skillTimes?.[slot] ?? 0;
    button.textContent = `[${heroSkillKeys[slot]}] ${label} · ${cooldown(at)}`;
    button.title = description;
    button.disabled = !me.alive || at > now;
  });
}

const lootButtons = Array.from({ length: 5 }, (_, index) => $('loot-' + (index + 1)));
function lootCommand(event, ...args) {
  if (!room || phase !== 'playing' || !socket.connected) return;
  const id = room;
  socket.timeout(2500).emit(event, ...args, (failure, result) => {
    if (room !== id || phase !== 'playing') return;
    const reward = result?.reward;
    if (!failure && result && !result.error) {
      const sound = event === 'lootOpen' && reward ? 'chest' :
        reward?.healing ? 'heal' : ['lootUse', 'lootRune', 'modeAntidote', 'modeCraft', 'modeInteract'].includes(event) ? 'item' : null;
      if (sound) window.playGameSound?.(sound);
    }
    $('loot-toast').textContent = failure ? '道具操作逾時' : result?.error || result?.message ||
      (event === 'lootOpen' && reward ? `取得 ${reward.label} · 欄位 ${reward.slot + 1}` :
        reward ? `使用 ${reward.label}${reward.healing ? ' · +' + reward.healing + ' HP' : ''}` : '已施放震波');
    lootToastUntil = performance.now() + 2500;
  });
}

function useLootSlot(slot) {
  if (frame?.inventory?.[slot]) lootCommand('lootUse', slot);
}

lootButtons.forEach((button, index) => {
  button.onclick = () => useLootSlot(index);
});

function interactNearby() {
  if (frame?.scenario?.nearby) lootCommand('modeInteract', frame.scenario.nearby);
  else if (frame?.nearbyChest != null) lootCommand('lootOpen', frame.nearbyChest);
}
$('chest-prompt').onclick = interactNearby;

function drawLootHud(state, serverTime) {
  $('chest-prompt').hidden = state.nearbyChest == null || Boolean(state.scenario?.nearby);
  $('loot-toast').hidden = performance.now() >= lootToastUntil;
  const buffs = (state.buffs || []).filter(buff => buff.until > serverTime);
  $('buff-status').hidden = !buffs.length;
  $('buff-status').textContent = buffs.map(buff =>
    `${buff.label} ${Math.ceil((buff.until - serverTime) / 1000)} 秒`).join(' · ');
}

window.addEventListener('keydown', event => {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  if (!$('title-screen').hidden) {
    if (event.code === 'Enter') {
      event.preventDefault();
      if (!event.repeat) show('home');
    }
    return;
  }
  if (!room) return;
  if (event.code === 'Escape' && fullMap) {
    event.preventDefault();
    toggleMap(false);
    return;
  }
  if (event.target.matches?.('input, textarea, select, [contenteditable]')) return;
  if (event.code === 'Enter' && !event.repeat && event.target.tagName !== 'BUTTON') {
    event.preventDefault();
    $('chat-input').focus();
  }
  if (phase === 'selection' && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) {
    event.preventDefault();
    if (!event.repeat) rotateClass(event.code === 'ArrowLeft' ? -1 : 1);
    return;
  }
  if (phase !== 'playing') return;
  if (movement.has(event.code) || !localPlayer()?.alive && panKeys.has(event.code)) {
    event.preventDefault();
    if (event.repeat) return;
    keys.add(event.code);
    if (spectatorTarget !== null) selectSpectator(null);
    sendMovement();
  }
  if (event.repeat) return;
  if (event.code === 'KeyQ') castHeroSkill(0);
  if (event.code === 'KeyC') castHeroSkill(1);
  if (event.code === 'KeyV') castHeroSkill(2);
  if (event.code === 'KeyG' && frame?.mode === 'flag' && frame.scenario?.role === 'support') lootCommand('modeCraft');
  if (event.code === 'KeyE') interactNearby();
  if (event.code === 'KeyF' && frame?.mode === 'flag') lootCommand('modeAntidote');
  if (event.code === 'KeyM' && frame) toggleMap();
  if (event.code === 'KeyR' && frame?.buffs?.some(buff => buff.label === '震波符文 [R]')) lootCommand('lootRune');
  if (/^Digit[1-5]$/.test(event.code)) useLootSlot(Number(event.code.slice(-1)) - 1);
});
window.addEventListener('keyup', event => {
  if (!keys.delete(event.code)) return;
  if (keys.size || touchPointer !== null) sendMovement();
  else stopMovement();
});
window.addEventListener('blur', stopMovement);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopMovement(); });
setInterval(() => { if (keys.size || touchPointer !== null) sendMovement(); }, 50);

function updateAim(event) {
  const canvas = $('arena');
  const bounds = canvas.getBoundingClientRect();
  aim = {
    x: Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) * canvas.width / bounds.width)),
    y: Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) * canvas.height / bounds.height))
  };
}
$('arena').onpointermove = updateAim;
$('arena').onpointerdown = event => {
  if (event.button !== 0 || document.activeElement === $('chat-input')) return;
  document.activeElement?.blur();
  updateAim(event);
  attack(false);
};

function formatDuration(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function scoreText(state, team) {
  return state.mode === 'survival' ? formatDuration(state.score[team]) : state.score[team];
}

function toggleMap(open = !fullMap) {
  fullMap = open;
  $('tactical-overlay').hidden = !fullMap;
  if (fullMap) {
    stopMovement();
    $('map-close').focus();
  }
}
$('map-preview').onclick = $('map-toggle').onclick = () => toggleMap(true);
$('map-close').onclick = () => { toggleMap(false); $('map-preview').focus(); };
$('mode-craft').onclick = () => lootCommand('modeCraft');
$('mode-antidote').onclick = () => lootCommand('modeAntidote');
$('mode-interact').onclick = () => {
  if (frame?.scenario?.nearby) lootCommand('modeInteract', frame.scenario.nearby);
};

function drawModeHud(state, now) {
  const info = state.scenario;
  $('mode-hud').hidden = !info;
  const interaction = $('mode-interact');
  interaction.hidden = !info?.nearby;
  if (interaction.dataset.anchored === 'true') {
    interaction.style.left = '';
    interaction.style.top = '';
  }
  interaction.dataset.anchored = 'false';
  if (!info) return;
  const words = [modeNames[info.mode], roleNames[info.role]];
  $('mode-antidote').hidden = info.mode !== 'flag';
  $('mode-craft').hidden = info.mode !== 'flag' || info.role !== 'support';
  if (info.mode === 'flag') words.push('毒氣免疫 ' + formatDuration(info.protectedUntil - now),
    `草藥 月露 ${info.herbs[0]} · 赤蕊 ${info.herbs[1]} · 星脈 ${info.herbs[2]} · 解藥 ${info.antidotes}`);
  if (info.mode === 'survival') {
    words.push(info.night ? '黑夜' : '白天', '生存資源 ' + formatDuration(info.protectedUntil - now));
    if (info.exposureUntil > now) words.push('定位暴露 ' + formatDuration(info.exposureUntil - now));
  }
  if (info.mode === 'control') words.push(`已標記 ${state.score['紅隊'] + state.score['藍隊']}/${info.pointCount}`, ...info.points.filter(point => point.marking)
    .map(point => `${point.marking}標記中 ${formatDuration(point.ends - now)}`));
  $('mode-status').textContent = words.filter(Boolean).join('｜');
  const point = info.points.find(point => point.id === info.nearby);
  if (point) {
    const canvas = $('arena');
    const bounds = canvas.getBoundingClientRect();
    interaction.dataset.anchored = 'true';
    interaction.style.left = Math.min(bounds.width - 95, Math.max(95,
      (point.x - arenaCamera.x) * arenaZoom * bounds.width / canvas.width)) + 'px';
    interaction.style.top = Math.max(100, (point.y - arenaCamera.y) * arenaZoom * bounds.height / canvas.height - 74) + 'px';
  }
  interaction.textContent = '[E] ' + { flag: '拔下敵方旗幟', survival: '開啟補給包', control: '開始標記 · 3 分鐘' }[info.mode];
}

function renderResults(state) {
  $('mode-result').hidden = !state.scenario;
  $('mode-result').textContent = state.scenario ? modeNames[state.mode] + ' · ' + (modeReasons[state.scenario.reason] ?? '') : '';
  $('winner').textContent = state.winner ? state.winner + '獲勝' : '平手';
  $('results-board').dataset.winner = state.winner || '';
  const mvp = state.results.find(player => player.id === state.mvp);
  $('mvp-feature').hidden = !mvp;
  if (mvp) {
    const portrait = $('mvp-portrait');
    portrait.src = heroArt(mvp.hero ?? mvp.job, 'model');
    portrait.alt = heroName(mvp) + '立繪';
    $('mvp-name').textContent = mvp.name + (mvp.bot ? ' · AI' : '');
    $('mvp-kda').textContent = `${heroName(mvp)} · ${mvp.kills} / ${mvp.deaths} / ${mvp.assists}`;
  }

  for (const [team, key] of [['藍隊', 'blue'], ['紅隊', 'red']]) {
    $(`final-${key}`).textContent = scoreText(state, team);
    $(`${key}-outcome`).textContent = !state.winner ? '平手' : state.winner === team ? '勝利' : '敗北';
    const awards = state.teamAwards?.[team];
    const roster = $(`results-${key}`);
    roster.replaceChildren();
    for (const player of state.results.filter(entry => entry.team === team)) {
      const row = element('tr', '');
      const teamMvp = player.id === awards?.mvp;
      const lowestKda = player.id === awards?.lowestKda;
      row.dataset.mvp = String(teamMvp);
      row.dataset.lowestKda = String(lowestKda);
      const identity = element('th', '');
      identity.setAttribute('scope', 'row');
      const profile = element('div', '');
      profile.className = 'result-player';
      const art = element('img', '');
      art.src = heroArt(player.hero ?? player.job, 'avatar');
      art.alt = '';
      const name = element('strong', player.name + (player.bot ? ' · AI' : ''));
      profile.append(art, name);
      if (teamMvp || lowestKda) {
        const badges = element('div', '');
        badges.className = 'result-awards';
        if (teamMvp) badges.append(element('small', 'MVP'));
        if (lowestKda) {
          const badge = element('small', '戰犯');
          badge.className = 'lowest-kda';
          badge.title = '隊內最低 KDA';
          badges.append(badge);
        }
        profile.append(badges);
      }
      identity.append(profile);
      row.append(identity, ...[player.kills, player.deaths, player.assists, player.damage]
        .map(value => element('td', String(value))));
      roster.append(row);
    }
  }
}

socket.on('achievementUnlocked', title => {
  window.playGameSound?.('achievement');
  $('loot-toast').textContent = `成就解鎖 · ${title}`;
  lootToastUntil = performance.now() + 5000;
});

socket.on('arenaMap', data => {
  if (data.id === room) {
    worldMap = data.map;
    $('battle').dataset.scene = worldMap.scene ?? 'forest';
    worldChests = data.chests || [];
  }
});

function selectSpectator(id) {
  spectatorTarget = id;
  for (const [playerId, { watch }] of teammateRows) {
    watch.setAttribute('aria-pressed', String(playerId === id));
  }
}

const teammateRows = new Map();
function drawTeamVitals(teammates) {
  const roster = $('team-vitals');
  const ids = teammates.map(player => player.id).join(',');
  if (roster.dataset.roster !== ids) {
    roster.dataset.roster = ids;
    teammateRows.clear();
    roster.replaceChildren();
    for (const player of teammates) {
      const row = element('div', '');
      row.className = 'team-vital';
      const watch = element('button', '');
      watch.type = 'button';
      watch.className = 'teammate-watch';
      watch.setAttribute('aria-label', '觀戰 ' + player.name);
      watch.onclick = () => {
        if (localPlayer()?.alive === false) {
          keys.clear();
          selectSpectator(player.id);
        }
      };
      const portrait = element('img', '');
      portrait.src = heroArt(player.hero ?? player.job, 'avatar');
      portrait.alt = '';
      const labels = element('span', '');
      const name = element('strong', player.name);
      name.title = player.name;
      const hp = element('progress', '');
      hp.setAttribute('aria-label', player.name + '的生命值');
      const numbers = element('small', '');
      labels.append(name, hp, numbers);
      watch.append(portrait);
      row.append(watch, labels);
      roster.append(row);
      teammateRows.set(player.id, { row, watch, hp, numbers });
    }
  }
  for (const player of teammates) {
    const { row, watch, hp, numbers } = teammateRows.get(player.id);
    watch.disabled = localPlayer()?.alive !== false;
    watch.setAttribute('aria-pressed', String(spectatorTarget === player.id));
    row.dataset.alive = String(player.alive);
    hp.max = player.maxHp;
    hp.value = player.alive ? player.hp : 0;
    numbers.textContent = player.alive ? `${player.hp} / ${player.maxHp}` : '已倒下';
  }
}

socket.on('arenaState', state => {
  if (state.id !== room || phase === 'lobby') return;
  const lastPlayer = localPlayer();
  previous = frame;
  frame = state;
  const me = localPlayer();
  if (lastPlayer?.alive !== me?.alive || lastPlayer?.spawnedAt !== me?.spawnedAt) {
    keys.clear();
    resetTouch();
    pendingAttack = null;
    attackDeadline = { server: 0, local: 0 };
    selectSpectator(null);
  }
  if (me?.alive) syncAttackDeadline(me.attackAt, state.now);
  if (lastPlayer?.alive === true && me?.alive === false) window.playGameSound?.('death');
  if (lastPlayer?.alive === false && me?.alive === true) window.playGameSound?.('respawn');
  if (me?.alive === false && lastPlayer?.alive !== false) {
    eliminationNoticeUntil = performance.now() + 5000;
  }
  receivedAt = performance.now();
  if (state.phase === 'ended') {
    renderResults(state);
    return;
  }
  const alive = localPlayer(state)?.alive;
  drawTeamVitals(state.teammates ?? []);
  lootButtons.forEach((button, index) => {
    const item = state.inventory?.[index];
    if (button.dataset.item !== (item?.id ?? '') || button.dataset.quality !== (item?.quality ?? '')) {
      button.dataset.item = item?.id ?? '';
      button.dataset.quality = item?.quality || '';
      const hotkey = element('kbd', index + 1);
      const label = element('span', item?.label ?? '空欄');
      label.className = 'loot-label';
      const children = [hotkey];
      if (item) {
        const icon = element('span', '');
        icon.className = 'loot-icon';
        icon.setAttribute('aria-hidden', 'true');
        children.push(icon);
      }
      children.push(label);
      button.replaceChildren(...children);
      button.setAttribute('aria-label', `欄位 ${index + 1}：${item?.label ?? '空欄'}`);
    }
    const title = item?.description ? `${item.label}｜${item.description}` : item?.label ?? '';
    if (button.title !== title) button.title = title;
    button.disabled = !alive || !item;
  });
  $('battle-mode-name').textContent = [modeNames[state.mode ?? 'deathmatch'], worldMap?.name].filter(Boolean).join(' · ');
  $('battle').dataset.mode = state.mode ?? 'deathmatch';
  $('battle').dataset.scene = worldMap?.scene ?? 'forest';
  touchPad.hidden = !coarsePointer?.matches || !localPlayer() || fullMap;
  $('red-score').textContent = scoreText(state, '紅隊');
  $('blue-score').textContent = scoreText(state, '藍隊');
  $('kill-feed').replaceChildren(...state.kills.map(kill => element('li', `${kill.attacker} 擊倒 ${kill.victim}`)));
});

function renderFrame(time) {
  requestAnimationFrame(renderFrame);
  if (phase === 'loading') {
    const remaining = Math.max(0, loadingDeadline - time);
    $('loading-progress').value = worldMap ? 3500 - Math.min(3500, remaining) : 0;
    $('loading-status').textContent = worldMap ? (remaining ? `${Math.ceil(remaining / 1000)} 秒後進入戰場` : '正在進入戰場…') : '正在同步本場隨機地圖…';
    return;
  }
  if (!worldMap || !frame || phase !== 'playing' || frame.phase !== 'playing') return;
  const elapsed = Math.min(150, Math.max(0, time - receivedAt));
  const serverTime = frame.now + elapsed;
  const remaining = Math.ceil(Math.max(0, frame.remaining - elapsed) / 1000);
  $('clock').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const me = frame.players.find(player => player.id === socket.id);
  if (me) {
    const cooldown = at => at > serverTime ? ((at - serverTime) / 1000).toFixed(1) + ' 秒' : '就緒';
    $('health-bar').max = me.maxHp;
    $('health-bar').value = me.hp;
    $('health').textContent = `${heroName(me)}${me.form === 1 ? ' · 第二形態' : ''} · HP ${me.hp}/${me.maxHp}`;
    const attackLeft = attackDeadline.local - time;
    $('attack-status').textContent = `${frame.attackRange || '—'} px · ${attackLeft > 0 ? (attackLeft / 1000).toFixed(1) + ' 秒' : '就緒'}`;
    drawHeroHud(frame, me, serverTime, cooldown);
    const eliminated = ['flag', 'survival'].includes(frame.mode);
    $('respawn').hidden = me.alive || (eliminated && time >= eliminationNoticeUntil);
    if (!$('respawn').hidden && !me.alive) $('respawn').textContent = eliminated
      ? '已淘汰 · WASD／方向鍵移動視角' :
      `${Math.ceil(Math.max(0, me.respawnAt - serverTime) / 1000)} 秒後復活 · WASD／方向鍵移動視角`;
  }
  const blend = Math.min(1, elapsed / Math.max(1, frame.now - (previous?.now ?? frame.now - 50)));
  drawLootHud(frame, serverTime);
  drawArena(frame, previous, blend, serverTime, aim, socket.id, worldMap, time, directionOfKeys(true), spectatorTarget);
  drawModeHud(frame, serverTime);
  drawMinimap(frame, previous, blend, worldMap, worldChests, socket.id);
  if (fullMap) drawMinimap(frame, previous, blend, worldMap, worldChests, socket.id, $('tactical-map'));
}
requestAnimationFrame(renderFrame);
