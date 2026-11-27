'use strict';

const { terrainBlocked } = require('./collision');

const kinds = { forest: ['forest-secret', 'visitor'], marsh: ['marsh-secret', 'visitor'], ruins: ['ruins-secret', 'visitor'],
  snow: ['snow-secret', 'visitor'], inferno: ['inferno-secret', 'visitor'], fortress: ['fortress-secret', 'visitor'] };
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function createSecrets(map, random = Math.random) {
  if (!kinds[map.scene]) return null;
  const landmarks = [];
  const spacing = map.tileSize;
  for (let row = 2; row < map.rows - 2; row++) {
    for (let col = 2; col < map.columns - 2; col++) {
      if (!['f', 'g', 'd'].includes(map.tiles[row][col])) continue;
      if (![map.tiles[row - 1][col], map.tiles[row][col - 1], map.tiles[row][col + 1]].some(tile => 'trw#'.includes(tile))) continue;
      const x = (col + .5) * spacing;
      const y = (row + .5) * spacing;
      if (!terrainBlocked(map, x, y)) landmarks.push({ x, y });
    }
  }
  return { landmarks, random, count: 0, nextAt: null, active: null, discoveries: [] };
}

function tickSecrets(room, now, clearLine) {
  const state = room.secrets;
  if (!state || room.phase !== 'playing') return;
  const { random } = state;
  state.nextAt ??= now + 18000 + Math.floor(random() * 24000);
  if (now >= state.nextAt) {
    const excluded = [...room.chests, ...(room.scenario?.camps ?? []),
      ...(room.scenario?.flags ?? []), ...(room.scenario?.supplies ?? [])];
    const spots = state.landmarks.filter(point => excluded.every(object => gap(point, object) > 80) &&
      room.players.every(player => gap(point, player) > 140) &&
      (!state.active || gap(point, state.active) > 260));
    if (spots.length) {
      const options = kinds[room.map.scene];
      state.active = { ...spots[Math.floor(random() * spots.length)], kind: options[state.count++ % options.length],
        found: new Set() };
    }
    state.nextAt = now + 48000 + Math.floor(random() * 42000);
  }
  const secret = state.active;
  if (!secret) return;
  for (const player of room.players) {
    if (!player.alive || player.bot || !player.accountKey || secret.found.has(player.accountKey) ||
        gap(player, secret) > 25 || !clearLine(player, secret, 0, room.map)) continue;
    secret.found.add(player.accountKey);
    state.discoveries.push({ accountKey: player.accountKey, playerId: player.id, kind: secret.kind });
  }
}

function lookForSecret(room, player, clearLine) {
  const secret = room.secrets?.active;
  if (!secret || !player?.alive || secret.found.has(player.accountKey) ||
      gap(player, secret) > 145 || !clearLine(player, secret, 0, room.map)) return null;
  return { x: secret.x, y: secret.y, visitor: secret.kind === 'visitor' };
}

module.exports = { createSecrets, tickSecrets, lookForSecret };
