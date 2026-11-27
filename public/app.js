'use strict';

const socket = io();
const $ = id => document.getElementById(id);
let room = null;
let soup = null;
let hintCount = 0;
let progress = 0;

const stories=[
 {title:'餐廳裡的海龜湯',intro:'一名男子在餐廳喝了一口海龜湯，回家後卻做出了令人震驚的決定。為什麼？',clues:['他以前曾遭遇船難。','他當年吃過一碗被稱作海龜湯的湯。','餐廳的味道與記憶不同，讓他發現當年吃的不是海龜。'],hints:['想想男子過去的經歷。','關鍵在於兩次湯的味道。','當年的湯其實不是海龜肉。'],keys:['船','海龜','味道'],answer:'經典版本中，男子曾在船難後喝下被謊稱為海龜湯的湯。多年後嚐到真正的海龜湯，才察覺當年的真相。'},
 {title:'關燈的人',intro:'一個人晚上關燈睡覺，隔天得知許多人因此喪命。為什麼？',clues:['他住在靠海的地方。','這盞燈不是普通房間的照明。','他是燈塔管理員，關燈導致船隻迷航。'],hints:['注意這盞燈的位置。','燈光可能是給別人看的。','想想燈塔。'],keys:['海','燈','船'],answer:'他是燈塔管理員，誤關了指引船隻的燈，造成船難。'}
];
stories.push(...extraStories);
function openSoup(){show('soup');newSoup();}function newSoup(){soup=stories[Math.floor(Math.random()*stories.length)];hintCount=0;progress=0;$('soup-title').textContent=soup.title;$('soup-story').textContent=soup.intro;$('soup-end').textContent='';$('answer').textContent='';updateSoup();}
function updateSoup(){$('hints').textContent=3-hintCount;$('soup-progress').textContent=`已解鎖線索：${progress}/${soup.clues.length}`;}
function askSoup(){const q=$('question').value.trim();if(!q)return;$('question').value='';if(soup.keys.some(k=>q.includes(k))){$('answer').textContent='是。 '+(soup.clues[progress]||'線索已全部揭曉。');progress=Math.min(progress+1,soup.clues.length);}else if(/沒有|不是|不會|無法/.test(q))$('answer').textContent='不是。';else $('answer').textContent='無關（原型判斷；請嘗試詢問故事關鍵字）。';updateSoup();if(progress===soup.clues.length)$('soup-end').textContent='你已解鎖所有線索！可按「揭曉答案」。';}
function hint(){if(hintCount>=3)return;$('answer').textContent='提示：'+soup.hints[hintCount++];updateSoup();}function reveal(){$('soup-end').textContent=soup.answer;}

const jobNames = { warrior: '戰士', archer: '弓箭手', mage: '法師' };
const skills = { warrior: '旋風斬', archer: '三重箭', mage: '火球術' };
const classDetails = {
  warrior: { role: '近戰前排', hp: 800, defense: 35, range: 52, speed: 150, damage: 90, cooldown: 650, description: '以盾甲扛住第一波攻勢，逼近敵人後用長劍封住狹窄通道。敵人圍上來時，旋風斬能同時攻擊周圍目標。' },
  archer: { role: '遠距游擊', hp: 600, defense: 12, range: 240, speed: 185, damage: 72, cooldown: 850, description: '利用長弓和最快的移動速度，從遠處牽制敵人。三重箭向不同角度飛出，適合封住通道或在近距離打中多支。' },
  mage: { role: '遠程範圍傷害', hp: 560, defense: 8, range: 190, speed: 165, damage: 86, cooldown: 950, description: '靠隊友掩護尋找施法角度。火球撞擊後會爆炸，適合攻擊聚在一起的敵人。' }
};
let phase = 'lobby';
let loadingDeadline = 0;
let frame = null;
let previous = null;
let receivedAt = 0;
let listedRooms = [];
let joining = false;
let roomRequest = 0;
const keys = new Set();
const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
let aim = null;
let worldMap = null;
let worldChests = [];
let lootToastUntil = 0;
const matchKey = 'game-hub-seat';

function show(id) {
  for (const panel of ['home', 'soup', 'lobby', 'game']) $(panel).hidden = panel !== id;
  if (id !== 'game') $('mvp-video').pause?.();
  if (id !== 'game') $('game').classList.remove('in-combat', 'in-selection', 'in-lobby', 'in-loading', 'in-results');
  document.querySelector('header').hidden = id !== 'home';
}

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

function openLobby() {
  $('error').textContent = '';
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
    $('room-error').textContent = error ? '伺服器未回應這項操作，請確認已更新並重啟 Game Hub。' : result?.error || '';
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

function createRoom() { enter('create', { type: 'arena', size: 10 }); }
function joinRoom(id) { enter('join', { id: id || $('room-code').value }); }
function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function renderRoomList() {
  const list = $('room-list');
  list.replaceChildren();
  if (!listedRooms.length) list.append(element('p', '目前沒有房間'));
  for (const entry of listedRooms) {
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
    art.src = `/art/${job}-portrait.webp`;
    art.alt = jobNames[job] + '頭肩立繪';
  }
  profile.dataset.job = job;
  $('class-name').textContent = jobNames[job];
  $('class-role').textContent = details.role;
  $('job-description').textContent = details.description;
  $('class-hp').textContent = details.hp + ' HP';
  $('class-range').textContent = details.range + ' px';
  $('class-speed').textContent = details.speed + ' px/s';
  $('class-damage').textContent = details.damage;
  $('class-defense').textContent = `${details.defense}（減傷 ${Math.round(100 * details.defense / (100 + details.defense))}%）`;
  $('class-cooldown').textContent = details.cooldown + ' ms';
  const values = [details.hp / Math.max(...Object.values(classDetails).map(entry => entry.hp)), details.speed / 185, details.range / 240,
    details.damage / 90, 650 / details.cooldown];
  const points = values.map((value, index) => {
    const angle = index * Math.PI * 2 / values.length - Math.PI / 2;
    return `${50 + 42 * value * Math.cos(angle)}% ${50 + 42 * value * Math.sin(angle)}%`;
  });
  $('chart-shape').setAttribute('style', `clip-path: polygon(${points.join(',')})`);
  $('class-skill').textContent = skills[job];
  for (const [id, button] of Object.entries(classButtons)) {
    button.setAttribute('aria-pressed', String(id === job));
    button.dataset.position = ['center', 'right', 'left'][(classOrder.indexOf(id) - classOrder.indexOf(job) + classOrder.length) % classOrder.length];
  }
}

const classOrder = Object.keys(classDetails);
const classButtons = Object.fromEntries(classOrder.map(job => [
  job, $('class-' + job)
]));
for (const [job, button] of Object.entries(classButtons)) {
  button.onclick = () => {
    if ($('class-profile').dataset.job !== job) sendRoomCommand('chooseClass', job);
  };
}

function rotateClass(direction) {
  if ($('class-prev').disabled) return;
  const current = classOrder.indexOf($('class-profile').dataset.job);
  const job = classOrder[(current + direction + classOrder.length) % classOrder.length];
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
      art.src = `/art/${player.job}-cutout.webp`;
      art.alt = '';
      card.append(art, element('strong', player.name),
        element('small', jobNames[player.job] + (player.bot ? ' · AI' : '')));
      roster.append(card);
    }
  }
}

function renderRoom(state) {
  if (state.id !== room) return;
  const me = state.players.find(player => player.id === socket.id);
  if (!me) return;
  const host = state.host === socket.id;
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
  if (phase !== 'ended') $('mvp-video').pause?.();
  $('chat-title').textContent = waiting ? '房間聊天' : '隊伍聊天';
  $('return-lobby').hidden = $('rematch').hidden = !host;
  $('results-note').textContent = host ? '' : '等待房主返回大廳或開始下一局。';
  const full = state.players.length === state.size;
  const unready = state.players.filter(player => !player.ready).length;
  if (selecting) {
    renderClass(me.job);
    for (const button of Object.values(classButtons)) button.disabled = me.ready;
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
      art.src = `/art/${player.job}-avatar.webp`;
      art.alt = '';
      tile.append(art, element('strong', player.name),
        element('small', jobNames[player.job] + (player.ready ? ' · 已確認' : ' · 選角中')));
      team.append(tile);
    }
    return;
  }
  if (!waiting) return;
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
$('return-lobby').onclick = () => sendRoomCommand('returnLobby');
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
  if (phase !== 'playing' || !socket.connected) return;
  socket.volatile.emit('arenaInput', {
    x: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
    y: Number(keys.has('KeyS')) - Number(keys.has('KeyW'))
  });
}

function stopMovement() {
  keys.clear();
  if (phase === 'playing' && socket.connected) socket.emit('arenaInput', { x: 0, y: 0 });
}

function attack(skill) {
  if (phase !== 'playing' || !socket.connected || !frame || !worldMap) return;
  const canvas = $('arena');
  const cursor = aim || { x: canvas.width / 2 + 45, y: canvas.height / 2 };
  const x = Math.max(0, Math.min(worldMap.width, cursor.x + arenaCamera.x));
  const y = Math.max(0, Math.min(worldMap.height, cursor.y + arenaCamera.y));
  socket.volatile.emit('arenaAttack', { x, y, skill });
}

const lootButtons = Array.from({ length: 5 }, (_, index) => $('loot-' + (index + 1)));
function lootCommand(event, ...args) {
  if (!room || phase !== 'playing' || !socket.connected) return;
  const id = room;
  socket.timeout(2500).emit(event, ...args, (failure, result) => {
    if (room !== id || phase !== 'playing') return;
    const reward = result?.reward;
    $('loot-toast').textContent = failure ? '道具操作逾時' : result?.error ||
      (event === 'lootOpen' ? `取得 ${reward.label} · 欄位 ${reward.slot + 1}` :
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

function drawLootHud(state, serverTime) {
  $('chest-prompt').hidden = state.nearbyChest == null;
  $('loot-toast').hidden = performance.now() >= lootToastUntil;
  const buffs = (state.buffs || []).filter(buff => buff.until > serverTime);
  $('buff-status').hidden = !buffs.length;
  $('buff-status').textContent = buffs.map(buff =>
    `${buff.label} ${Math.ceil((buff.until - serverTime) / 1000)} 秒`).join(' · ');
}

window.addEventListener('keydown', event => {
  if (!room || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
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
  if (movement.has(event.code)) {
    event.preventDefault();
    if (event.repeat) return;
    keys.add(event.code);
    sendMovement();
  }
  if (event.repeat) return;
  if (event.code === 'KeyQ') attack(true);
  if (event.code === 'KeyE' && frame?.nearbyChest != null) lootCommand('lootOpen', frame.nearbyChest);
  if (event.code === 'KeyR' && frame?.buffs?.some(buff => buff.label === '震波符文 [R]')) lootCommand('lootRune');
  if (/^Digit[1-5]$/.test(event.code)) useLootSlot(Number(event.code.slice(-1)) - 1);
});
window.addEventListener('keyup', event => {
  if (!keys.delete(event.code)) return;
  if (keys.size) sendMovement();
  else stopMovement();
});
window.addEventListener('blur', stopMovement);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopMovement(); });
setInterval(() => { if (keys.size) sendMovement(); }, 50);

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

function renderResults(state) {
  $('winner').textContent = state.winner ? state.winner + '獲勝' : '平手';
  $('final-blue').textContent = state.score['藍隊'];
  $('final-red').textContent = state.score['紅隊'];
  const mvp = state.results.find(player => player.id === state.mvp);
  $('mvp-stage').hidden = !mvp;
  if (mvp) {
    const video = $('mvp-video');
    video.src = `/art/${mvp.job}-victory.mp4`;
    video.muted = true;
    video.setAttribute('aria-label', jobNames[mvp.job] + 'MVP 慶祝影片');
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      video.play?.().catch(() => {});
    }
    $('mvp-name').textContent = mvp.name + (mvp.bot ? ' · AI' : '');
    $('mvp-kda').textContent = `${jobNames[mvp.job]} · ${mvp.kills} / ${mvp.deaths} / ${mvp.assists}`;
  }
  for (const [team, id] of [['藍隊', 'results-blue'], ['紅隊', 'results-red']]) {
    const roster = $(id);
    roster.replaceChildren();
    for (const player of state.results.filter(entry => entry.team === team)) {
      const card = element('div', '');
      card.className = 'result-card';
      card.dataset.mvp = String(player.id === state.mvp);
      const art = element('img', '');
      art.src = `/art/${player.job}-avatar.webp`;
      art.alt = '';
      card.append(art, element('strong', player.name + (player.bot ? ' · AI' : '')),
        element('span', `${player.kills} / ${player.deaths} / ${player.assists}`),
        element('small', `傷害 ${player.damage}`));
      if (player.id === state.mvp) card.append(element('small', 'MVP'));
      roster.append(card);
    }
  }
}

socket.on('arenaMap', data => {
  if (data.id === room) {
    worldMap = data.map;
    worldChests = data.chests || [];
  }
});

socket.on('arenaState', state => {
  if (state.id !== room || phase === 'lobby') return;
  previous = frame;
  frame = state;
  receivedAt = performance.now();
  if (state.phase === 'ended') {
    renderResults(state);
    return;
  }
  const alive = state.players.find(player => player.id === socket.id)?.alive;
  lootButtons.forEach((button, index) => {
    const item = state.inventory?.[index];
    if (button.dataset.label !== (item?.label || '')) {
      button.dataset.label = item?.label || '';
      button.dataset.quality = item?.quality || '';
      button.replaceChildren(element('kbd', index + 1), element('span', item?.label || '空欄'));
    }
    button.disabled = !alive || !item;
  });
  $('concealed').hidden = !state.concealed;
  $('red-score').textContent = state.score['紅隊'];
  $('blue-score').textContent = state.score['藍隊'];
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
    $('health').textContent = `${jobNames[me.job]} · HP ${me.hp}/${me.maxHp}`;
    $('attack-status').textContent = `${frame.attackRange || '—'} px · ${cooldown(me.attackAt)}`;
    $('skill-status').textContent = `${skills[me.job]} · ${cooldown(me.skillAt)}`;
    $('respawn').hidden = me.alive;
    if (!me.alive) $('respawn').textContent = `${Math.ceil(Math.max(0, me.respawnAt - serverTime) / 1000)} 秒後復活`;
  }
  const blend = Math.min(1, elapsed / Math.max(1, frame.now - (previous?.now ?? frame.now - 50)));
  drawLootHud(frame, serverTime);
  drawArena(frame, previous, blend, serverTime, aim, socket.id, worldMap, time);
  drawMinimap(frame, worldMap, worldChests, socket.id);
}
requestAnimationFrame(renderFrame);
