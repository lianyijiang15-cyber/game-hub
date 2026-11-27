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
const descriptions = {
  warrior: '150 HP · 近戰長劍 · 旋風斬攻擊四周敵人',
  archer: '100 HP · 遠程長弓 · 三重箭向三個角度射出實體箭矢',
  mage: '80 HP · 遠程法杖 · 火球撞擊後造成範圍傷害'
};
let phase = 'lobby';
let frame = null;
let previous = null;
let receivedAt = 0;
let listedRooms = [];
let joining = false;
let roomRequest = 0;
const keys = new Set();
const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
const aim = { x: 480, y: 288 };

function show(id) {
  for (const panel of ['home', 'soup', 'lobby', 'game']) $(panel).hidden = panel !== id;
  document.querySelector('header').hidden = id !== 'home';
}

function exitRoom() {
  stopMovement();
  if (room && socket.connected) socket.emit('leave');
  room = null;
  phase = 'lobby';
  frame = previous = null;
  $('messages').replaceChildren();
  $('chat-input').value = '';
  openLobby();
}

function home() {
  stopMovement();
  if (room && socket.connected) socket.emit('leave');
  room = null;
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

function command(event, ...args) {
  if (!socket.connected) {
    $('room-error').textContent = '連線中斷';
    return;
  }
  socket.timeout(3000).emit(event, ...args, (error, result) => {
    $('room-error').textContent = error ? '操作逾時' : result.error || '';
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
      $('error').textContent = error ? '連線逾時' : result.error;
      return;
    }
    room = result.id;
    phase = 'lobby';
    frame = previous = null;
    $('messages').replaceChildren();
    $('chat-input').value = '';
    $('room-error').textContent = '';
    $('room-id').textContent = room;
    $('waiting').hidden = false;
    $('battle').hidden = $('results').hidden = true;
    show('game');
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
    const label = { lobby: '等待中', playing: '對戰中', ended: '已結束' }[entry.phase];
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

socket.on('room', state => {
  if (state.id !== room) return;
  const me = state.players.find(player => player.id === socket.id);
  if (!me) return;
  const host = state.host === socket.id;
  const waiting = state.phase === 'lobby';
  if (phase !== state.phase) {
    stopMovement();
    $('messages').replaceChildren();
    if (state.phase === 'playing' || waiting) frame = previous = null;
  }
  phase = state.phase;
  $('waiting').hidden = !waiting;
  $('battle').hidden = phase !== 'playing';
  $('results').hidden = phase !== 'ended';
  $('chat-title').textContent = waiting ? '房間聊天' : '隊伍聊天';
  $('return-lobby').hidden = $('rematch').hidden = !host;
  $('results-note').textContent = host ? '' : '等待房主返回大廳或開始下一局。';
  if (!waiting) return;
  $('seat-count').textContent = `玩家 ${state.players.length}/${state.size}`;
  $('players').replaceChildren();
  for (const player of state.players) {
    const tile = element('div', '');
    tile.append(element('strong', player.name),
      element('small', `${player.bot ? 'AI' : '真人'} · ${jobNames[player.job]} · ${player.ready ? '已準備' : '未準備'}${player.id === state.host ? ' · 房主' : ''}`));
    if (host && player.bot) {
      const remove = element('button', '移除 AI');
      remove.className = 'ghost';
      remove.onclick = () => command('removeBot', player.id);
      tile.append(remove);
    }
    $('players').append(tile);
  }
  $('job').value = me.job;
  $('job-description').textContent = descriptions[me.job];
  $('bot-controls').hidden = !host || state.players.length === state.size;
  $('ready').textContent = me.ready ? '取消準備' : '準備';
  $('start').hidden = !host;
  $('start').disabled = state.players.length !== state.size || !state.players.every(p => p.ready);
});
$('job').onchange = () => command('chooseClass', $('job').value);

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
  command('chat', input.value);
  input.value = '';
  input.blur();
};

socket.on('roomClosed', reason => {
  if (!room) return;
  exitRoom();
  $('error').textContent = reason;
});

socket.on('disconnect', () => {
  if (!room) return;
  exitRoom();
  $('error').textContent = '已斷線並離開房間。連線恢復後可重新加入等待中的房間。';
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
  if (phase !== 'playing' || !socket.connected || !frame) return;
  socket.volatile.emit('arenaAttack', { ...aim, skill });
}

window.addEventListener('keydown', event => {
  if (!room || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.matches?.('input, textarea, select, [contenteditable]')) return;
  if (event.code === 'Enter' && !event.repeat && event.target.tagName !== 'BUTTON') {
    event.preventDefault();
    $('chat-input').focus();
  }
  if (phase !== 'playing') return;
  if (movement.has(event.code)) {
    event.preventDefault();
    if (event.repeat) return;
    keys.add(event.code);
    sendMovement();
  }
  if (event.code === 'KeyQ' && !event.repeat) attack(true);
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
  aim.x = Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) * canvas.width / bounds.width));
  aim.y = Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) * canvas.height / bounds.height));
}
$('arena').onpointermove = updateAim;
$('arena').onpointerdown = event => {
  if (event.button !== 0 || document.activeElement === $('chat-input')) return;
  document.activeElement?.blur();
  updateAim(event);
  attack(false);
};

function renderResults(state) {
  const headline = state.winner ? state.winner + '獲勝' : '平手';
  $('winner').textContent = `${headline} · ${state.score['紅隊']} : ${state.score['藍隊']}`;
  const body = $('results-body');
  body.replaceChildren();
  for (const player of state.results) {
    const row = document.createElement('tr');
    row.className = player.team === '紅隊' ? 'red' : 'blue';
    for (const value of [player.name + (player.bot ? ' [AI]' : ''), player.team, jobNames[player.job],
      player.kills, player.deaths, player.damage]) row.append(element('td', value));
    body.append(row);
  }
}

socket.on('arenaState', state => {
  if (state.id !== room || phase === 'lobby') return;
  previous = frame;
  frame = state;
  receivedAt = performance.now();
  if (state.phase === 'ended') {
    renderResults(state);
    return;
  }
  $('red-score').textContent = state.score['紅隊'];
  $('blue-score').textContent = state.score['藍隊'];
  $('kill-feed').replaceChildren(...state.kills.map(kill => element('li', `${kill.attacker} 擊倒 ${kill.victim}`)));
});

function renderFrame(time) {
  requestAnimationFrame(renderFrame);
  if (!frame || phase !== 'playing' || frame.phase !== 'playing') return;
  const elapsed = Math.min(150, Math.max(0, time - receivedAt));
  const serverTime = frame.now + elapsed;
  const remaining = Math.ceil(Math.max(0, frame.remaining - elapsed) / 1000);
  $('clock').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const me = frame.players.find(player => player.id === socket.id);
  if (me) {
    const cooldown = at => at > serverTime ? ((at - serverTime) / 1000).toFixed(1) + ' 秒' : '就緒';
    $('health').textContent = `${jobNames[me.job]} · HP ${me.hp}/${me.maxHp}`;
    $('attack-status').textContent = '普攻 ' + cooldown(me.attackAt);
    $('skill-status').textContent = `Q ${skills[me.job]} · ${cooldown(me.skillAt)}`;
    $('respawn').hidden = me.alive;
    if (!me.alive) $('respawn').textContent = `${Math.ceil(Math.max(0, me.respawnAt - serverTime) / 1000)} 秒後復活`;
  }
  const blend = Math.min(1, elapsed / Math.max(1, frame.now - (previous?.now ?? frame.now - 50)));
  drawArena(frame, previous, blend, serverTime, aim, socket.id);
}
requestAnimationFrame(renderFrame);
