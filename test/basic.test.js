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
  const avatar = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCUAomv/9k=';
  assert.equal((await accountAction('avatar', { photo: avatar }, cookie)).status, 200);
  const friendCredentials = { ...credentials, username: 'ClashFriend18' };
  assert.equal((await accountAction('register', friendCredentials)).status, 201);
  const friendLogin = await accountAction('login', friendCredentials);
  const friendCookie = friendLogin.headers.get('set-cookie').split(';')[0];
  const friendProfile = (await (await accountAction('profile', { name: 'Registered Friend' }, friendCookie)).json()).profile;
  const hostProfile = (await named.json()).profile;
  assert.equal((await accountAction('friends/request', { by: 'id', query: friendProfile.id }, cookie)).status, 201);
  assert.equal((await accountAction('friends/respond', { id: hostProfile.id, accept: true }, friendCookie)).status, 200);
  const clients = [cookie, null, null, friendCookie].map(value => connect(base, {
    transports: ['websocket'], extraHeaders: value ? { Cookie: value } : {}
  }));
  t.after(async () => {
    clients.forEach(client => client.disconnect());
    await io.close();
  });
  await Promise.all(clients.map(client => once(client, 'connect')));
  const [host, guest, outsider, friend] = clients;
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>PIXEL CLASH 像素衝突<\/title>/);
  assert.match(html, /id="title-start"[^>]*>TAP TO START<\/button>/);
  assert.match(html, /<section id="home" hidden\b[^>]*>/);
  assert.match(html, /id="menu-soup-name">海龜湯/);
  assert.match(html, /id="room-guide"[^>]*aria-haspopup="dialog"/);
  for (const path of ['/arena-guide.js', '/casebook.css', '/art/loot/item-icons.webp', '/art/achievements/emblems.webp', '/art/heroes/adventure-bots.webp', '/art/avatars/lobby-memes.webp', '/art/icons/combat-skills.webp', '/art/comics/clock.webp',
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
  assert.equal(created.players[0].avatar, avatar);
  assert.match(id, /^[A-F0-9]{6}$/);
  const joined = await send(guest, 'join', { id: id.toLowerCase(), name: 'Guest' });
  assert.equal(joined.id, id);
  assert.equal(joined.room.players[0].avatar, avatar);
  assert.equal(joined.room.players[1].avatar, undefined);
  const guestPortrait = joined.room.players[1].lobbyMeme;
  assert.ok(Number.isInteger(guestPortrait) && guestPortrait >= 0 && guestPortrait < 20);
  const hostPortrait = created.players[0].lobbyMeme;
  assert.ok(Number.isInteger(hostPortrait) && hostPortrait >= 0 && hostPortrait < 20);
  const removedPhoto = receive(guest, 'room', room => room.players[0].avatar === undefined);
  assert.equal((await accountAction('avatar', { photo: null }, cookie)).status, 200);
  assert.equal((await removedPhoto).players[0].lobbyMeme, hostPortrait);
  const replacedPhoto = receive(guest, 'room', room => room.players[0].avatar === avatar);
  assert.equal((await accountAction('avatar', { photo: avatar }, cookie)).status, 200);
  await replacedPhoto;
  assert.ok((await send(guest, 'fillBots')).error);
  const bots = (await send(host, 'addBot')).room.players.filter(p => p.bot);
  assert.equal(bots.length, 1);
  assert.equal(bots[0].lobbyHero, 'sky');
  assert.ok(bots[0].botPersona >= 0 && bots[0].botPersona < 20);
  assert.equal(bots[0].avatar, undefined);
  const botId = rooms.get(id).players.find(player => player.bot).id;
  assert.equal((await send(host, 'removeBot', botId)).ok, true);
  const filled = receive(guest, 'room', room => room.players.length === 10);
  assert.equal((await send(host, 'fillBots')).room.players.length, 10);
  const filledBots = (await filled).players.filter(player => player.bot);
  assert.equal(new Set(filledBots.map(player => player.botPersona)).size, 8);
  assert.equal(new Set(filledBots.map(player => player.name)).size, 8);
  const received = receive(friend, 'roomInvites', inbox => inbox.length === 1);
  assert.equal((await send(host, 'inviteFriend', friendProfile.id)).ok, true);
  const [invite] = await received;
  assert.equal(invite.name, 'Registered Host');
  assert.equal(invite.mode, 'deathmatch');
  assert.ok(!Object.hasOwn(invite, 'roomId'));
  assert.deepEqual((await send(friend, 'listRoomInvites')).invites, [invite]);
  assert.deepEqual((await send(outsider, 'listRoomInvites')).invites, []);
  assert.match((await send(outsider, 'replyRoomInvite', { id: invite.id, accept: true })).error, /無效/);
  const arrived = await send(friend, 'replyRoomInvite', { id: invite.id, accept: true });
  assert.equal(arrived.id, id);
  assert.equal(arrived.room.players.length, 10);
  assert.equal(arrived.room.players.filter(player => player.bot).length, 7);
  assert.ok(arrived.room.players.some(player => player.name === 'Registered Friend'));
  await wait(160);
  assert.match((await send(friend, 'replyRoomInvite', { id: invite.id, accept: true })).error, /過期/);
  await send(friend, 'leave');
  assert.equal((await send(host, 'fillBots')).room.players.length, 10);
  await wait(700);
  const laterInvite = receive(friend, 'roomInvites', inbox => inbox.length === 1);
  assert.equal((await send(host, 'inviteFriend', friendProfile.id)).ok, true);
  const missing = receive(friend, 'roomInvites', inbox => !inbox.length);
  assert.equal((await send(friend, 'replyRoomInvite', { id: (await laterInvite)[0].id, accept: false })).ok, true);
  await missing;
  assert.ok((await send(host, 'chooseClass', 'gamma')).error);
  assert.ok((await send(host, 'start')).error);
  await Promise.all([send(host, 'ready'), send(guest, 'ready')]);
  await wait(160);
  const selection = receive(host, 'room', room => room.phase === 'selection');
  assert.equal((await send(host, 'start')).ok, true);
  const selected = await selection;
  assert.ok(selected.players.every(player => player.avatar === undefined));
  const hostTeam = selected.players.find(p => p.id === host.id).team;
  const guestTeam = hostTeam === '紅隊' ? '藍隊' : '紅隊';
  const ownTeam = selected.players.filter(p => p.team === hostTeam);
  assert.equal(ownTeam.length, 5);
  assert.ok(ownTeam.every(p => p.job));
  const guestView = receive(guest, 'room');
  const hostView = receive(host, 'room');
  assert.equal((await send(host, 'chooseClass', 'gamma')).ok, true);
  assert.equal((await hostView).players.find(p => p.id === host.id).job, 'archer');
  const guestRoster = await guestView;
  assert.equal(guestRoster.players.find(p => p.id === host.id).job, undefined);
  assert.equal(guestRoster.players.filter(p => p.team === guestTeam && p.job).length, 5);
  assert.equal((await send(guest, 'chooseClass', 'oshi')).ok, true);
  assert.equal(rooms.get(id).players.find(player => player.id === guest.id).hero, 'oshi');
  let leakedDuringSelection = false;
  host.once('chat', () => { leakedDuringSelection = true; });
  const teamMessage = receive(guest, 'chat');
  assert.equal((await send(guest, 'chat', '選角中的隊伍訊息')).ok, true);
  assert.equal((await teamMessage).team, guestTeam);
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
  assert.deepEqual([firstMap.map.columns, firstMap.map.rows, firstMap.map.width], [144, 144, 4608]);
  assert.equal(firstMap.chests.length, 80);
  assert.equal(firstMap.map.secrets, undefined);
  assert.equal(initial.map, undefined);
  assert.equal(initial.now, shared.now);
  assert.equal(initial.players.filter(player => player.team === hostTeam).length, 5);
  assert.ok(initial.players.every(player => player.team === hostTeam));
  assert.ok(shared.players.every(player => player.team === guestTeam));
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

  const secret = { x: hostPlayer.x, y: hostPlayer.y, kind: 'visitor', found: new Set() };
  liveRoom.secrets.active = secret;
  const achievement = receive(host, 'achievementUnlocked');
  assert.equal(await achievement, '神秘訪客');
  const discoveries = await (await fetch(base + '/api/account/achievements', { headers: { Cookie: cookie } })).json();
  assert.ok(discoveries.soup.some(item => item.id === 'visitor' && item.count === 1));

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
  const catalog = await (await fetch(base + '/api/account/achievements', { headers: { Cookie: cookie } })).json();
  assert.equal(catalog.arena.find(item => item.id === 'first-match').count, 1);
  assert.equal(catalog.arena.find(item => item.id === 'first-win').count, 0);
  const detailPath = base + '/api/account/history/' + arena[0].id;
  const detail = await (await fetch(detailPath, { headers: { Cookie: cookie } })).json();
  assert.equal(detail.detail.players.length, 10);
  assert.deepEqual(detail.detail.awards, result.teamAwards);
  assert.equal((await fetch(detailPath)).status, 401);
  const retainedPlayers = liveRoom.players.map(({ id, name, bot, job }) => ({ id, name, bot, job }));
  const waiting = [host, guest].map(client => receive(client, 'room', state => state.id === id && state.phase === 'lobby'));
  assert.ok((await send(guest, 'rematch')).error);
  assert.equal((await send(host, 'rematch')).ok, true);
  const returned = await Promise.all(waiting);
  const [newHostPortrait, newGuestPortrait] = returned[0].players.slice(0, 2).map(player => player.lobbyMeme);
  assert.notEqual(newHostPortrait, hostPortrait);
  assert.notEqual(newGuestPortrait, guestPortrait);
  assert.equal(returned[1].players[0].lobbyMeme, newHostPortrait);
  assert.equal(returned[1].players[1].lobbyMeme, newGuestPortrait);
  assert.equal(returned[0].players[0].avatar, avatar);
  for (const state of returned) {
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
  const nextMap = (await rematchMap).map;
  assert.notDeepEqual(nextMap.tiles, firstMap.map.tiles);
  assert.notEqual(nextMap.scene, firstMap.map.scene);

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
  const enemyFlag = field.scenario.flags.find(flag => flag.team !== player.team);
  const baseRegion = field.scenario.bases.find(base => base.team === player.team);
  assert.ok((await send(outsider, 'modeInteract', enemyFlag.id)).error);
  const flagFinish = receive(outsider, 'arenaState', state => state.phase === 'ended');
  for (let count = 1; count <= 3; count++) {
    await wait(260);
    Object.assign(player, { x: enemyFlag.x, y: enemyFlag.y });
    assert.match((await send(outsider, 'modeInteract', enemyFlag.id)).message, /奪取敵旗/);
    const delivered = receive(outsider, 'arenaState', state => state.score[player.team] === count);
    Object.assign(player, { x: baseRegion.x, y: baseRegion.y });
    await delivered;
  }
  assert.equal((await flagFinish).winner, player.team);
  await send(outsider, 'leave');
  assert.equal(rooms.has(solo.id), false);
});
