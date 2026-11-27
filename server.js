'use strict';

const express = require('express');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { Server } = require('socket.io');
const combat = require('./arena/combat');
const modes = require('./arena/modes');
const { botInput, route } = require('./arena/bots');
const { createAccountRouter } = require('./accounts/router');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 8192 });
const accounts = createAccountRouter(process.env.PIXEL_CLASH_ACCOUNTS_FILE || path.join(__dirname, 'data', 'accounts.json'));
app.use('/api/account', accounts.router);
app.get('/title-map', (_, response) => {
  response.set('Cache-Control', 'public, max-age=3600').json(combat.map);
});
app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const seats = 10;
const maxRooms = 50;
const reconnectWindow = 45000;
const loadingDuration = process.env.NODE_ENV === 'test' ? 200 : 3500;
const matchActive = room => room.phase === 'selection' || room.phase === 'loading' || room.phase === 'playing';
const channel = room => 'arena:' + room.id;
const now = () => Math.floor(performance.now());

function list(target = io) {
  target.emit('rooms', [...rooms.values()].map(room => ({
    id: room.id, size: seats, count: room.players.length, phase: room.phase, mode: room.mode
  })));
}

function roomState(room, viewerId) {
  const viewer = room.players.find(player => player.id === viewerId);
  return {
    id: room.id, host: room.host, size: seats, phase: room.phase, mode: room.mode,
    loadingRemaining: Math.max(0, (room.loadingUntil ?? 0) - now()),
    players: room.players.map(({ id, name, job, hero, ready, bot, team, slot }) => ({
      id, name, ready, bot, ...(room.phase === 'loading' || (room.phase === 'selection' && team === viewer?.team) ? { job, hero, team, ...(room.mode !== 'deathmatch' ? { role: modes.roleFor(slot, hero) } : {}) } : id === viewerId ? { job, hero } : {})
    }))
  };
}

function publish(room) {
  for (const player of room.players) {
    if (!player.bot) io.to(player.id).emit('room', roomState(room, player.id));
  }
  list();
}

function member(socket) {
  const room = rooms.get(socket.data.room);
  const player = room?.players.find(entry => entry.id === socket.id && !entry.bot);
  return player ? { room, player } : {};
}

function addBot(room) {
  let number = 1;
  while (room.players.some(player => player.bot && player.name === 'AI ' + number)) number++;
  const botOrder = ['sky', 'sain', 'alpha', 'oshi', 'kosain', 'beta', 'frost', 'tanjun', 'gamma'];
  const hero = botOrder[(number - 1) % botOrder.length];
  room.players.push({ id: 'bot-' + crypto.randomUUID(), name: 'AI ' + number, bot: true, ready: true,
    hero, job: combat.playableHeroes[hero].job });
}

function closeRoom(room) {
  clearInterval(room.timer);
  clearTimeout(room.expiry);
  clearTimeout(room.vacancyTimer);
  rooms.delete(room.id);
  list();
}

function leave(socket, reconnect = false) {
  const { room, player } = member(socket);
  if (!room) return;
  socket.leave(channel(room));
  socket.data.room = null;
  const successor = room.players.find(entry => entry !== player && !entry.bot);
  const active = matchActive(room);
  if (!successor && !(active && reconnect)) {
    closeRoom(room);
    return;
  }
  if (active) {
    if (reconnect) player.reconnectUntil = now() + reconnectWindow;
    else player.ticket = null;
    player.originalName = player.name;
    if (room.matchId && player.accountKey) player.statsAtDeparture = playerStats(player);
    Object.assign(player, {
      id: 'bot-' + crypto.randomUUID(), name: player.name.slice(0, 18) + ' · AI',
      bot: true, ready: true, input: { x: 0, y: 0 }, route: null, routeAt: 0
    });
  } else {
    room.players = room.players.filter(entry => entry !== player);
  }
  if (room.host === socket.id) room.host = successor?.id ?? null;
  if (!successor) {
    room.vacancyTimer = setTimeout(() => closeRoom(room), reconnectWindow);
    room.vacancyTimer.unref();
  }
  publish(room);
}

function runMatch(room) {
  clearTimeout(room.expiry);
  for (const player of room.players) if (player.bot) player.ticket = null;
  combat.start(room, now(), crypto.randomBytes(4).readUInt32LE());
  room.matchId = crypto.randomUUID();
  for (const player of room.roster) player.statsAtDeparture = null;
  room.phase = 'loading';
  room.loadingUntil = now() + loadingDuration;
  room.endsAt += loadingDuration;
  publish(room);
  io.to(channel(room)).emit('arenaMap', { id: room.id, map: room.map, chests: combat.chestLayout(room) });
  let lastTick = now();
  const broadcast = time => {
    for (const player of room.players) {
      if (!player.bot) io.to(player.id).volatile.emit('arenaState', combat.snapshot(room, time, player));
    }
  };
  room.timer = setInterval(() => {
    const time = now();
    if (room.phase === 'loading') {
      lastTick = time;
      if (time < room.loadingUntil) return;
      room.phase = 'playing';
      room.matchStartedAt = time;
      modes.begin(room, time);
      for (const player of room.players) {
        player.spawnedAt = time;
        if (!player.bot) player.playedMatch = room.matchId;
      }
      publish(room);
      broadcast(time);
      return;
    }
    if (room.phase === 'playing') combat.tick(room, time, Math.min((time - lastTick) / 1000, 0.05), botInput, route);
    lastTick = time;
    if (room.phase === 'ended') {
      clearInterval(room.timer);
      room.timer = null;
      const result = combat.snapshot(room, time);
      const participants = new Map(room.roster.filter(player => player.accountKey && player.playedMatch === room.matchId)
        .map(player => [player.accountKey, player.statsAtDeparture ?? playerStats(player)]));
      result.duration = Math.max(0, Math.min(time, room.endsAt) - room.matchStartedAt);
      accounts.saveArena(room.matchId, participants, result).catch(error => {
        console.error('Could not save arena history:', error.code ?? error.name);
      });
      io.to(channel(room)).emit('arenaState', result);
      publish(room);
      room.expiry = setTimeout(() => {
        io.to(channel(room)).emit('roomClosed', '結算已保留 10 分鐘，房間已關閉');
        for (const socket of io.of('/').sockets.values()) {
          if (socket.data.room !== room.id) continue;
          socket.data.room = null;
          socket.leave(channel(room));
        }
        closeRoom(room);
      }, 600000);
      room.expiry.unref();
      return;
    }
    broadcast(time);
  }, 50);
}

function playerStats({ team, job, hero, kills, deaths, assists, damage }) {
  return { team, job, hero, kills, deaths, assists, damage };
}

function join(socket, room, name, accountKey) {
  const ticket = crypto.randomUUID();
  room.players.push({ id: socket.id, name, accountKey, job: 'warrior', hero: 'sky', ready: false, bot: false, ticket });
  socket.join(channel(room));
  socket.data.room = room.id;
  return ticket;
}

function validName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 24) : '';
}

io.on('connection', socket => {
  const rates = new Map();
  function accept(key, interval) {
    const time = now();
    if (time - (rates.get(key) ?? -Infinity) < interval) return false;
    rates.set(key, time);
    return true;
  }

  function command(event, handler, interval = 150) {
    socket.on(event, (...args) => {
      const callback = typeof args.at(-1) === 'function' ? args.pop() : () => {};
      if (!accept(event, interval)) return callback({ error: '操作太快，請稍後再試' });
      const result = handler(args[0], member(socket));
      callback(result || { ok: true });
      if (result?.id) publish(rooms.get(result.id));
    });
  }

  function hostCommand(event, phase, action) {
    command(event, (data, { room }) => {
      if (!room || room.host !== socket.id || room.phase !== phase) {
        return { error: '此操作目前僅限房主使用' };
      }
      return action(room, data);
    });
  }

  list(socket);
  socket.on('list', () => { if (accept('list', 300)) list(socket); });
  command('create', (data, { room }) => {
    if (room) return { error: '請先離開目前房間' };
    const account = accounts.session(socket.request);
    if (account && !account.profile) return { error: '請先設定玩家名稱' };
    const name = account?.profile?.name ?? validName(data?.name);
    if (data?.type !== 'arena' || data.size !== seats || !name) return { error: '請輸入暱稱並建立 10 人對戰房間' };
    if (rooms.size >= maxRooms) return { error: '房間已達上限' };
    let id;
    do { id = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(id));
    const mode = data.mode ?? 'deathmatch';
    if (typeof mode !== 'string' || !Object.hasOwn(modes.durations, mode)) return { error: '未知副本' };
    const created = { id, host: socket.id, phase: 'lobby', mode, players: [] };
    rooms.set(id, created);
    const ticket = join(socket, created, name, account?.key);
    return { id, ticket, room: roomState(created, socket.id) };
  });
  command('join', (data, { room }) => {
    if (room) return { error: '請先離開目前房間' };
    const account = accounts.session(socket.request);
    if (account && !account.profile) return { error: '請先設定玩家名稱' };
    const name = account?.profile?.name ?? validName(data?.name);
    const id = typeof data?.id === 'string' ? data.id.trim().toUpperCase() : '';
    if (!name || !/^[A-F0-9]{6}$/.test(id)) return { error: '請輸入暱稱與 6 碼房間代碼' };
    const target = rooms.get(id);
    const requestedMode = data?.mode ?? 'deathmatch';
    if (target && target.mode !== requestedMode) return { error: '此房間屬於其他玩法，請回到副本選單切換' };
    if (!target || target.phase !== 'lobby' || target.players.length >= seats) {
      return { error: '房間不存在、已開始或已滿' };
    }
    if (account && target.players.some(player => player.accountKey === account.key)) {
      return { error: '這個帳號已在房間內' };
    }
    if (target.players.some(player => player.name.toLowerCase() === name.toLowerCase())) {
      return { error: '房間內已有相同玩家名稱' };
    }
    const ticket = join(socket, target, name, account?.key);
    return { id, ticket, room: roomState(target, socket.id) };
  });
  command('resume', (data, { room }) => {
    if (room || typeof data?.id !== 'string' || typeof data?.ticket !== 'string') {
      return { error: '無法恢復席位' };
    }
    const target = rooms.get(data.id);
    if (!target || !matchActive(target)) return { error: '原本的對戰已結束或已關閉' };
    const player = target.players.find(entry => entry.ticket === data.ticket);
    if (player?.accountKey && player.accountKey !== accounts.session(socket.request)?.key) {
      return { error: '請使用原本的玩家帳號恢復席位' };
    }
    if (player && !player.bot) {
      const previous = io.of('/').sockets.get(player.id);
      if (previous) {
        leave(previous, true);
        previous.emit('roomClosed', '此席位已在重新載入的分頁恢復');
      }
    }
    if (!player?.bot || now() >= player.reconnectUntil) return { error: '重連期限已過' };
    clearTimeout(target.vacancyTimer);
    const ticket = crypto.randomUUID();
    Object.assign(player, { id: socket.id, name: player.originalName, bot: false, ticket, reconnectUntil: 0,
      input: { x: 0, y: 0 }, inputAt: 0, statsAtDeparture: null });
    if (target.phase === 'playing') player.playedMatch = target.matchId;
    target.host ??= socket.id;
    socket.join(channel(target));
    socket.data.room = target.id;
    return { id: target.id, ticket, room: roomState(target, socket.id), map: target.map, chests: target.chests ? combat.chestLayout(target) : [] };
  });
  command('leave', () => leave(socket), 0);
  hostCommand('addBot', 'lobby', room => {
    if (room.players.length >= seats) return { error: '房間已滿' };
    addBot(room);
    publish(room);
    return { ok: true, room: roomState(room, socket.id) };
  });
  hostCommand('fillBots', 'lobby', room => {
    while (room.players.length < seats) addBot(room);
    publish(room);
    return { ok: true, room: roomState(room, socket.id) };
  });
  hostCommand('removeBot', 'lobby', (room, id) => {
    if (typeof id !== 'string' || !room.players.some(player => player.id === id && player.bot)) {
      return { error: '找不到 AI' };
    }
    room.players = room.players.filter(player => player.id !== id);
    publish(room);
  });
  command('chooseClass', (hero, { room, player }) => {
    if (room?.phase !== 'selection' || player.ready || typeof hero !== 'string' || !Object.hasOwn(combat.playableHeroes, hero)) return { error: '目前無法選擇此職業' };
    player.hero = hero;
    player.job = combat.heroes[hero].job;
    player.ready = false;
    publish(room);
  });
  command('ready', (_, { room, player }) => {
    if (room?.phase !== 'lobby' && room?.phase !== 'selection') return { error: '目前無法切換準備狀態' };
    player.ready = !player.ready;
    publish(room);
  });
  command('start', (_, { room }) => {
    if (!room || room.host !== socket.id || !['lobby', 'selection'].includes(room.phase)) {
      return { error: '此操作目前僅限房主使用' };
    }
    if (room.players.length !== seats || !room.players.every(player => player.ready)) {
      return { error: '需要 10 名已準備玩家' };
    }
    if (room.phase === 'selection') {
      runMatch(room);
      return;
    }
    combat.assignTeams(room.players);
    room.phase = 'selection';
    room.map = null;
    room.players.forEach(player => { player.ready = player.bot; });
    publish(room);
  });
  function returnToLobby(room) {
    clearTimeout(room.expiry);
    for (const player of room.players) {
      if (!player.bot) continue;
      player.ticket = null;
      player.accountKey = null;
    }
    room.phase = 'lobby';
    room.players.forEach(player => { player.ready = player.bot; });
    publish(room);
  }
  hostCommand('returnLobby', 'ended', returnToLobby);
  hostCommand('rematch', 'ended', returnToLobby);

  socket.on('arenaInput', data => {
    const { room, player } = member(socket);
    if (room?.phase !== 'playing' || !player.alive ||
        !Number.isFinite(data?.x) || !Number.isFinite(data?.y) ||
        Math.abs(data.x) > 1 || Math.abs(data.y) > 1) return;
    const stopping = data.x === 0 && data.y === 0;
    if (!accept(stopping ? 'stop' : 'input', stopping ? 5 : 20)) return;
    player.input = { x: data.x, y: data.y };
    player.inputAt = now();
  });
  command('modeInteract', (id, { room, player }) => {
    if (!room || typeof id !== 'string' || id.length > 24) return { error: '無效的互動目標' };
    return combat.interact(room, player, id, now());
  }, 250);
  command('modeCraft', (_, { room, player }) => {
    if (!room) return { error: '目前無法融合草藥' };
    return modes.craftAntidote(room, player);
  }, 400);
  command('heroSkill', (data, { room, player }) => {
    const validId = value => value == null || typeof value === 'string' && value.length <= 64;
    if (!room || !validId(data?.ally) || !validId(data?.enemy)) return { error: '無效技能目標' };
    return combat.cast(room, player, data, now());
  }, 140);
  command('modeAntidote', (_, { room, player }) => {
    if (!room) return { error: '目前無法使用解藥' };
    return modes.antidote(room, player, now());
  }, 400);
  command('lootOpen', (id, { room, player }) => {
    if (!room || !Number.isSafeInteger(id)) return { error: '寶箱目前無法開啟' };
    const reward = combat.openChest(room, player, id, now());
    return reward.error ? reward : { reward };
  }, 250);
  command('lootUse', (slot, { room, player }) => {
    if (!room || !Number.isInteger(slot) || slot < 0 || slot >= 5) return { error: '無效的道具欄位' };
    const result = combat.useItem(room, player, slot, now());
    return result.error ? result : { reward: result };
  }, 150);
  command('lootRune', (_, { room, player }) => {
    if (!room || !combat.castRune(room, player, now())) return { error: '沒有可使用的震波符文' };
  }, 250);

  socket.on('arenaAttack', data => {
    if (!accept('attack', 75)) return;
    const { room, player } = member(socket);
    if (room?.phase !== 'playing' || typeof data?.skill !== 'boolean' ||
        !Number.isFinite(data.x) || !Number.isFinite(data.y) ||
        data.x < 0 || data.y < 0 || data.x > combat.map.width || data.y > combat.map.height) return;
    combat.attack(room, player, data.x, data.y, data.skill, now());
  });
  command('chat', (message, { room, player }) => {
    if (!room || typeof message !== 'string' || !message.trim()) return { error: '請輸入訊息' };
    const text = message.trim().slice(0, 300);
    const team = room.phase === 'lobby' ? null : player.team;
    const payload = { name: player.name, text, team };
    if (!team) io.to(channel(room)).emit('chat', payload);
    else for (const teammate of room.players) {
      if (!teammate.bot && teammate.team === team) io.to(teammate.id).emit('chat', payload);
    }
  }, 650);
  socket.on('disconnect', () => leave(socket, true));
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log('PIXEL CLASH: http://localhost:' + port));
}

module.exports = { app, server, io, rooms };
