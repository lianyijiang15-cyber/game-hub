'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io: connect } = require('socket.io-client');
const { server, io, rooms } = require('../server');

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
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const clients = Array.from({ length: 3 }, () => connect(base, { transports: ['websocket'] }));
  t.after(async () => {
    clients.forEach(client => client.disconnect());
    await io.close();
  });
  await Promise.all(clients.map(client => once(client, 'connect')));
  const [host, guest, outsider] = clients;
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /GAME.*海龜湯/s);
  assert.equal((await fetch(base + '/soup-bank.js')).status, 200);
  assert.equal((await fetch(base + '/arena-renderer.js')).status, 200);
  for (const job of ['warrior', 'archer', 'mage']) {
    for (const suffix of ['', '-avatar']) {
      const image = await fetch(`${base}/art/${job}${suffix}.webp`, { method: 'HEAD' });
      assert.equal(image.status, 200);
      assert.equal(image.headers.get('content-type'), 'image/webp');
    }
  }

  assert.ok((await send(outsider, 'create', null)).error);
  const { id } = await send(host, 'create', { type: 'arena', size: 10, name: 'Host' });
  assert.match(id, /^[A-F0-9]{6}$/);
  assert.equal((await send(guest, 'join', { id: id.toLowerCase(), name: 'Guest' })).id, id);
  assert.ok((await send(guest, 'fillBots')).error);
  assert.equal((await send(host, 'addBot')).room.players.filter(p => p.bot).length, 1);
  const botId = rooms.get(id).players.find(player => player.bot).id;
  assert.equal((await send(host, 'removeBot', botId)).ok, true);
  const filled = receive(guest, 'room', room => room.players.length === 10);
  assert.equal((await send(host, 'fillBots')).room.players.length, 10);
  assert.equal((await filled).players.filter(player => player.bot).length, 8);
  assert.equal((await send(host, 'chooseClass', 'archer')).ok, true);
  assert.equal((await send(guest, 'chooseClass', 'mage')).ok, true);
  assert.ok((await send(host, 'start')).error);
  await Promise.all([send(host, 'ready'), send(guest, 'ready')]);
  await wait(160);

  const hostMap = receive(host, 'arenaMap');
  const guestMap = receive(guest, 'arenaMap');
  const hostFrame = receive(host, 'arenaState');
  const guestFrame = receive(guest, 'arenaState');
  let outsideFrames = 0;
  outsider.on('arenaState', () => outsideFrames++);
  assert.equal((await send(host, 'start')).ok, true);
  const [initial, shared, firstMap, sharedMap] = await Promise.all([hostFrame, guestFrame, hostMap, guestMap]);
  assert.deepEqual(firstMap, sharedMap);
  assert.equal(firstMap.map.tiles.length, 100);
  assert.equal(initial.map, undefined);
  assert.equal(initial.now, shared.now);
  assert.equal(initial.players.filter(player => player.team === '紅隊').length, 5);
  const mine = initial.players.find(player => player.id === host.id);
  assert.equal(mine.job, 'archer');
  const moved = receive(guest, 'arenaState', state => state.players.find(p => p.id === host.id).x > mine.x);
  host.emit('arenaInput', { x: 1, y: 0, hp: 1 });
  assert.equal((await moved).players.find(player => player.id === host.id).hp, 100);
  host.emit('arenaInput', { x: 0, y: 0 });
  const stopped = await receive(guest, 'arenaState');
  const next = await receive(guest, 'arenaState');
  assert.equal(stopped.players.find(p => p.id === host.id).x, next.players.find(p => p.id === host.id).x);

  const fired = receive(guest, 'arenaState', state => state.projectiles.length === 3);
  host.emit('arenaAttack', { x: mine.x + 100, y: mine.y, skill: true });
  assert.ok((await fired).projectiles.every(p => p.type === 'arrow'));

  let leaked = false;
  guest.on('chat', () => { leaked = true; });
  outsider.on('chat', () => { leaked = true; });
  const message = receive(host, 'chat');
  await send(host, 'chat', '<img onerror=alert(1)>');
  assert.equal((await message).text, '<img onerror=alert(1)>');
  await wait(100);
  assert.equal(leaked, false);
  assert.equal(outsideFrames, 0);

  const replacement = receive(guest, 'room', room => room.host === guest.id);
  host.disconnect();
  assert.equal((await replacement).players.filter(player => player.bot).length, 9);
  const final = receive(guest, 'arenaState', state => state.phase === 'ended');
  rooms.get(id).endsAt = 0;
  const result = await final;
  assert.equal(result.winner, null);
  assert.equal(result.results.length, 10);
  const rematchMap = receive(guest, 'arenaMap');
  const again = receive(guest, 'arenaState', state => state.phase === 'playing');
  assert.equal((await send(guest, 'rematch')).ok, true);
  assert.deepEqual((await again).score, { 紅隊: 0, 藍隊: 0 });
  assert.notDeepEqual((await rematchMap).map.tiles, firstMap.map.tiles);
  await send(guest, 'leave');
  assert.equal(rooms.has(id), false);

  const solo = await send(guest, 'create', { type: 'arena', size: 10, name: 'Solo Host' });
  assert.equal((await send(guest, 'fillBots')).room.players.filter(player => player.bot).length, 9);
  const ready = receive(guest, 'room', room => room.players.every(player => player.ready));
  assert.equal((await send(guest, 'ready')).ok, true);
  await ready;
  const soloMap = receive(guest, 'arenaMap');
  const soloFrame = receive(guest, 'arenaState', state => state.id === solo.id);
  assert.equal((await send(guest, 'start')).ok, true);
  assert.equal((await soloFrame).players.filter(player => player.bot).length, 9);
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
  assert.equal((await recovered).players.length, 10);
  await send(outsider, 'leave');
  assert.equal(rooms.has(solo.id), false);
});
