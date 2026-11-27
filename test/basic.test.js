'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { io: connect } = require('socket.io-client');
process.env.NODE_ENV = 'test';
const accountDir = mkdtempSync(path.join(tmpdir(), 'pixel-clash-arena-'));
process.env.PIXEL_CLASH_ACCOUNTS_FILE = path.join(accountDir, 'accounts.json');
const { server, io, rooms } = require('../server');
const combat = require('../arena/combat');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const send = (client, event, ...args) => client.timeout(2500).emitWithAck(event, ...args);
function receive(client, event, match = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event, handler);
      reject(new Error('Timed out waiting for ' + event));
    }, 2500);
    function handler(data) {
      if (!match(data)) return;
      clearTimeout(timer);
      client.off(event, handler);
      resolve(data);
    }
    client.on(event, handler);
  });
}

test('HTTP, mixed 5v5 Socket.IO lifecycle, isolation and rematch', async t => {
  t.after(() => rmSync(accountDir, { recursive: true, force: true }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const credentials = { username: 'ClashHost17', password: 'A castle with 7 rooms!' };
  const accountAction = (action, body, cookie) => fetch(base + '/api/account/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body)
  });
  assert.equal((await accountAction('register', credentials)).status, 201);
  const login = await accountAction('login', credentials);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const named = await accountAction('profile', { name: 'Registered Host' }, cookie);
  assert.equal(named.status, 200);
  const clients = [cookie, null, null].map(value => connect(base, {
    transports: ['websocket'], extraHeaders: value ? { Cookie: value } : {}
  }));
  t.after(async () => {
    clients.forEach(client => client.disconnect());
    await io.close();
  });
  await Promise.all(clients.map(client => once(client, 'connect')));
  const [host, guest, outsider] = clients;
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>PIXEL CLASH 像素衝突<\/title>/);
  assert.match(html, /id="title-start"[^>]*>TAP TO START<\/button>/);
  assert.match(html, /<section id="home" hidden\b[^>]*>/);
  assert.match(html, /id="menu-soup-name">海龜湯/);
  assert.match(html, /id="room-guide"[^>]*aria-haspopup="dialog"/);
  for (const path of ['/arena-guide.js', '/casebook.css', '/art/loot/item-icons.webp', '/art/comics/clock.webp',
    '/art/comics/class.webp', '/art/comics/snow.webp', '/art/comics/hotel-call.webp',
    '/art/comics/theater-shadow.webp', '/art/comics/blackout-window.webp', '/art/comics/laundry-knock.webp']) {
    assert.equal((await fetch(base + path, { method: 'HEAD' })).status, 200, path);
  }
  assert.match(html, /id="menu-arena-name">像素衝突/);
  assert.equal((await fetch(base + '/menu.css')).status, 200);
  assert.equal((await fetch(base + '/menu-art.js')).status, 200);
  const titleMap = await fetch(base + '/title-map');
  assert.equal(titleMap.status, 200);
  assert.deepEqual(await titleMap.json(), combat.map);
  assert.equal((await fetch(base + '/fonts/pixel-clash-display.woff')).status, 200);
  assert.equal((await fetch(base + '/soup-bank.js')).status, 200);
  assert.equal((await fetch(base + '/arena-renderer.js')).status, 200);
  for (const hero of Object.keys(combat.playableHeroes)) {
    for (const type of ['model', 'portrait']) {
      const art = await fetch(`${base}/art/heroes/${hero}-${type}.webp`, { method: 'HEAD' });
      assert.equal(art.status, 200);
      assert.equal(art.headers.get('content-type'), 'image/webp');
    }
  }
  assert.equal((await fetch(base + '/art/heroes/campaign-sprites.webp', { method: 'HEAD' })).status, 200);
  for (const job of ['warrior', 'archer', 'mage']) {
    for (const suffix of ['', '-avatar', '-cutout', '-model', '-key-art', '-portrait', '-celebration']) {
      const image = await fetch(`${base}/art/${job}${suffix}.webp`, { method: 'HEAD' });
      assert.equal(image.status, 200);
      assert.equal(image.headers.get('content-type'), 'image/webp');
    }
  }

  assert.equal((await fetch(base + '/art/selection-stage.webp', { method: 'HEAD' })).status, 200);
  const backdrop = await fetch(base + '/art/ravine-city.webp', { method: 'HEAD' });
  assert.equal(backdrop.status, 200);
  assert.equal(backdrop.headers.get('content-type'), 'image/webp');
  assert.ok((await send(outsider, 'create', null)).error);
  const { id, room: created } = await send(host, 'create', { type: 'arena', size: 10, name: 'Host' });
  assert.equal(created.players[0].name, 'Registered Host');
  assert.match(id, /^[A-F0-9]{6}$/);
  assert.equal((await send(guest, 'join', { id: id.toLowerCase(), name: 'Guest' })).id, id);
  assert.ok((await send(guest, 'fillBots')).error);
  assert.equal((await send(host, 'addBot')).room.players.filter(p => p.bot).length, 1);
  const botId = rooms.get(id).players.find(player => player.bot).id;
  assert.equal((await send(host, 'removeBot', botId)).ok, true);
  const filled = receive(guest, 'room', room => room.players.length === 10);
  assert.equal((await send(host, 'fillBots')).room.players.length, 10);
  assert.equal((await filled).players.filter(player => player.bot).length, 8);
  assert.ok((await send(host, 'chooseClass', 'gamma')).error);
  assert.ok((await send(host, 'start')).error);
  await Promise.all([send(host, 'ready'), send(guest, 'ready')]);
  await wait(160);
  const selection = receive(host, 'room', room => room.phase === 'selection');
  assert.equal((await send(host, 'start')).ok, true);
  const ownTeam = (await selection).players.filter(p => p.team === '紅隊');
  assert.equal(ownTeam.length, 5);
  assert.ok(ownTeam.every(p => p.job));
  const guestView = receive(guest, 'room');
  const hostView = receive(host, 'room');
  assert.equal((await send(host, 'chooseClass', 'gamma')).ok, true);
  assert.equal((await hostView).players.find(p => p.id === host.id).job, 'archer');
  const guestRoster = await guestView;
  assert.equal(guestRoster.players.find(p => p.id === host.id).job, undefined);
  assert.equal(guestRoster.players.filter(p => p.team === '藍隊' && p.job).length, 5);
  assert.equal((await send(guest, 'chooseClass', 'oshi')).ok, true);
  assert.equal(rooms.get(id).players.find(player => player.id === guest.id).hero, 'oshi');
  let leakedDuringSelection = false;
  host.once('chat', () => { leakedDuringSelection = true; });
  const teamMessage = receive(guest, 'chat');
  assert.equal((await send(guest, 'chat', '選角中的隊伍訊息')).ok, true);
  assert.equal((await teamMessage).team, '藍隊');
  await wait(160);
  assert.equal(leakedDuringSelection, false);
  host.removeAllListeners('chat');
  await Promise.all([send(host, 'ready'), send(guest, 'ready')]);

  const loading = receive(host, 'room', state => state.phase === 'loading');
  const hostMap = receive(host, 'arenaMap');
  const guestMap = receive(guest, 'arenaMap');
  const hostFrame = receive(host, 'arenaState');
  const guestFrame = receive(guest, 'arenaState');
  let outsideFrames = 0;
  outsider.on('arenaState', () => outsideFrames++);
  assert.equal((await send(host, 'start')).ok, true);
  const revealed = await loading;
  assert.equal(revealed.players.filter(p => p.team === '紅隊').length, 5);
  assert.equal(revealed.players.find(p => p.id === guest.id).job, 'mage');
  assert.ok(revealed.loadingRemaining > 0);
  assert.equal(rooms.get(id).phase, 'loading');
  const [initial, shared, firstMap, sharedMap] = await Promise.all([hostFrame, guestFrame, hostMap, guestMap]);
  assert.deepEqual(firstMap, sharedMap);
  assert.equal(firstMap.map.tiles.length, 100);
  assert.equal(initial.map, undefined);
  assert.equal(initial.now, shared.now);
  assert.equal(initial.players.filter(player => player.team === '紅隊').length, 5);
  assert.ok(initial.players.every(player => player.team === '紅隊'));
  assert.ok(shared.players.every(player => player.team === '藍隊'));
  const mine = initial.players.find(player => player.id === host.id);
  assert.equal(mine.job, 'archer');
  const moved = receive(host, 'arenaState', state => state.players.find(p => p.id === host.id)?.x > mine.x);
  host.emit('arenaInput', { x: 1, y: 0, hp: 1 });
  assert.equal((await moved).players.find(player => player.id === host.id).hp, 8000);
  host.emit('arenaInput', { x: 0, y: 0 });
  const stopped = await receive(host, 'arenaState');
  const next = await receive(host, 'arenaState');
  assert.equal(stopped.players.find(p => p.id === host.id).x, next.players.find(p => p.id === host.id).x);
  const swing = { x: mine.x + 34, y: mine.y, skill: false };
  const accepted = await send(host, 'arenaAttack', swing);
  assert.ok(accepted.attackAt > accepted.now);
  for (let i = 0; i < 4; i++) {
    const repeat = await send(host, 'arenaAttack', swing);
    assert.equal(repeat.attackAt, accepted.attackAt);
  }

  const boosted = receive(host, 'arenaState', state => state.heroEffects.some(effect => effect.key === 'surge'));
  assert.equal((await send(host, 'heroSkill', { slot: 1 })).ok, true);
  assert.ok((await boosted).skillTimes[1] > initial.now);
  let leaked = false;
  guest.on('chat', () => { leaked = true; });
  outsider.on('chat', () => { leaked = true; });
  const message = receive(host, 'chat');
  await send(host, 'chat', '<img onerror=alert(1)>');
  assert.equal((await message).text, '<img onerror=alert(1)>');
  await wait(100);
  assert.equal(leaked, false);
  assert.equal(outsideFrames, 0);

  const liveRoom = rooms.get(id);
  const lootChest = liveRoom.chests[0];
  const hostPlayer = liveRoom.players.find(player => player.id === host.id);
  const guestPlayer = liveRoom.players.find(player => player.id === guest.id);
  for (const player of [hostPlayer, guestPlayer]) {
    player.x = lootChest.x;
    player.y = lootChest.y;
  }
  const synced = [host, guest].map(client => receive(client, 'arenaState',
    state => state.openedChestIds.includes(lootChest.id)));
  const claims = await Promise.all([send(host, 'lootOpen', lootChest.id), send(guest, 'lootOpen', lootChest.id)]);
  assert.equal(claims.filter(result => result.reward).length, 1);
  const [hostLoot, guestLoot] = await Promise.all(synced);
  assert.deepEqual(hostLoot.openedChestIds, guestLoot.openedChestIds);
  assert.equal([...hostLoot.inventory, ...guestLoot.inventory].filter(Boolean).length, 1);
  assert.ok(!hostLoot.players.some(player => Object.hasOwn(player, 'inventory')));

  const final = receive(guest, 'arenaState', state => state.phase === 'ended');
  liveRoom.endsAt = 0;
  const result = await final;
  assert.equal(result.winner, null);
  assert.equal(result.results.length, 10);
  const history = await fetch(base + '/api/account/history', { headers: { Cookie: cookie } });
  const { arena } = await history.json();
  assert.equal(arena.length, 1);
  const official = result.results.find(player => player.id === host.id);
  for (const metric of ['team', 'job', 'kills', 'deaths', 'assists', 'damage']) {
    assert.equal(arena[0][metric], official[metric]);
  }
  assert.equal(arena[0].result, 'draw');
  const detailPath = base + '/api/account/history/' + arena[0].id;
  const detail = await (await fetch(detailPath, { headers: { Cookie: cookie } })).json();
  assert.equal(detail.detail.players.length, 10);
  assert.deepEqual(detail.detail.awards, result.teamAwards);
  assert.equal((await fetch(detailPath)).status, 401);
  const retainedPlayers = liveRoom.players.map(({ id, name, bot, job }) => ({ id, name, bot, job }));
  const waiting = [host, guest].map(client => receive(client, 'room', state => state.id === id && state.phase === 'lobby'));
  assert.ok((await send(guest, 'rematch')).error);
  assert.equal((await send(host, 'rematch')).ok, true);
  for (const state of await Promise.all(waiting)) {
    assert.equal(state.host, host.id);
    assert.deepEqual(state.players.map(p => p.id), retainedPlayers.map(p => p.id));
    assert.ok(state.players.every(p => p.ready === p.bot));
  }
  assert.deepEqual(liveRoom.players.map(({ id, name, bot, job }) => ({ id, name, bot, job })), retainedPlayers);
  assert.equal(liveRoom.phase, 'lobby');
  assert.equal(liveRoom.timer, null);

  await Promise.all([send(host, 'ready'), send(guest, 'ready')]);
  assert.equal((await send(host, 'start')).ok, true);
  await wait(160);
  await Promise.all([send(host, 'ready'), send(guest, 'ready')]);
  const rematchMap = receive(guest, 'arenaMap');
  const again = receive(guest, 'arenaState', state => state.phase === 'playing');
  assert.equal((await send(host, 'start')).ok, true);
  assert.deepEqual((await again).score, { 紅隊: 0, 藍隊: 0 });
  assert.notDeepEqual((await rematchMap).map.tiles, firstMap.map.tiles);

  const replacement = receive(guest, 'room', room => room.host === guest.id);
  host.disconnect();
  assert.equal((await replacement).players.filter(player => player.bot).length, 9);
  await send(guest, 'leave');
  assert.equal(rooms.has(id), false);

  const solo = await send(guest, 'create', { type: 'arena', size: 10, name: 'Solo Host', mode: 'flag' });
  assert.equal((await send(guest, 'fillBots')).room.players.filter(player => player.bot).length, 9);
  assert.match((await send(outsider, 'join', { id: solo.id, mode: 'survival', name: 'Outsider' })).error, /其他玩法/);
  const ready = receive(guest, 'room', room => room.players.every(player => player.ready));
  assert.equal((await send(guest, 'ready')).ok, true);
  await ready;
  const soloSelection = receive(guest, 'room', state => state.phase === 'selection');
  assert.equal((await send(guest, 'start')).ok, true);
  await soloSelection;
  await wait(160);
  assert.equal((await send(guest, 'ready')).ok, true);
  const soloMap = receive(guest, 'arenaMap');
  const soloFrame = receive(guest, 'arenaState', state => state.id === solo.id);
  assert.equal((await send(guest, 'start')).ok, true);
  assert.equal((await soloFrame).players.filter(player => player.bot).length, 4);
  const { map } = await soloMap;
  guest.disconnect();
  await wait(75);
  assert.ok(rooms.has(solo.id));
  assert.ok((await send(outsider, 'resume', { id: solo.id, ticket: 'invalid' })).error);
  const recovered = receive(outsider, 'arenaState', state => state.id === solo.id &&
    state.players.some(p => p.id === outsider.id && !p.bot));
  await wait(160);
  const resume = await send(outsider, 'resume', { id: solo.id, ticket: solo.ticket });
  assert.deepEqual(resume.map, map);
  assert.equal(resume.room.host, outsider.id);
  assert.notEqual(resume.ticket, solo.ticket);
  const field = await recovered;
  assert.equal(field.players.filter(p => p.team === field.players.find(p => p.id === outsider.id).team).length, 5);
  assert.equal(field.mode, 'flag');
  assert.equal(field.scenario.markers.length, 5);
  const liveFlag = rooms.get(solo.id);
  const player = liveFlag.players.find(member => member.id === outsider.id);
  assert.ok((await send(outsider, 'modeInteract', 'flag')).error);
  Object.assign(player, { x: field.scenario.flag.x, y: field.scenario.flag.y });
  await wait(260);
  const flagFinish = receive(outsider, 'arenaState', state => state.phase === 'ended');
  assert.ok((await send(outsider, 'modeInteract', 'flag')).message);
  assert.equal((await flagFinish).winner, player.team);
  await send(outsider, 'leave');
  assert.equal(rooms.has(solo.id), false);
});
