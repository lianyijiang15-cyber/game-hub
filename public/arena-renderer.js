'use strict';

const arenaContext = $('arena').getContext('2d', { alpha: false });
const terrainChunks = new Map();
let paintedMap;
const chunkTiles = 8;
function createArenaCamera() {
  let world;
  let playerId;
  let spawnedAt;
  let lastTime;
  let x = 0;
  let y = 0;
  const clamp = (value, max) => Math.max(0, Math.min(max, value));
  return {
    x: 0, y: 0,
    follow(position, player, map, width, height, time) {
      const maxX = Math.max(0, map.width - width);
      const maxY = Math.max(0, map.height - height);
      const targetX = clamp(position.x - width / 2, maxX);
      const targetY = clamp(position.y - height / 2, maxY);
      const reset = world !== map || player.id !== playerId || player.spawnedAt !== spawnedAt;
      const elapsed = Math.min(100, Math.max(0, time - lastTime));
      const blend = reset ? 1 : 1 - Math.exp(-elapsed / 65);
      x = clamp(x + (targetX - x) * blend, maxX);
      y = clamp(y + (targetY - y) * blend, maxY);
      this.x = Math.round(x);
      this.y = Math.round(y);
      world = map;
      playerId = player.id;
      spawnedAt = player.spawnedAt;
      lastTime = time;
    }
  };
}
const arenaCamera = createArenaCamera();
const colors = {
  '紅隊': { light: '#fb8d74', mid: '#bb453d', dark: '#672939' },
  '藍隊': { light: '#87d4f8', mid: '#3d78ad', dark: '#284669' }
};
const letters = { warrior: '戰', archer: '弓', mage: '法' };

function rect(ctx, color, x, y, width, height) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), width, height);
}

const terrainColors = {
  g: ['#587c45', '#60854a', '#64894b'],
  f: ['#395c3d', '#416841', '#456c42'],
  t: ['#365b39', '#3a613d', '#406541'],
  b: ['#587948', '#62824a', '#617e48'],
  r: ['#60675e', '#666d64', '#73796c'],
  w: ['#306c83', '#32738a', '#34788c'],
  d: ['#826344', '#8d6a49', '#91714f'],
  p: ['#a38c61', '#ae956b', '#ad986d'],
  '#': ['#272e31', '#303837', '#353b3a']
};

function tileVariation(x, y) {
  return (Math.imul(x + 11, 73856093) ^ Math.imul(y + 17, 19349663)) >>> 0;
}

function paintTile(ctx, map, col, row, x, y) {
  const tile = map.tiles[row][col];
  const size = map.tileSize;
  const hash = tileVariation(col, row);
  const colors = terrainColors[tile];
  rect(ctx, colors[hash % 3], x, y, size, size);
  const adjacent = [map.tiles[row - 1]?.[col], map.tiles[row + 1]?.[col],
    map.tiles[row][col - 1], map.tiles[row][col + 1]];
  adjacent.forEach((neighbor, side) => {
    if (!neighbor || neighbor === tile) return;
    const tint = neighbor === 'w' ? '#69a7a4' : terrainColors[neighbor][1];
    for (let offset = 0; offset < size; offset += 4) {
      const depth = 1 + (tileVariation(col * 17 + offset, row * 13 + side) % 4);
      if (side < 2) rect(ctx, tint, x + offset, y + (side ? size - depth : 0), 4, depth);
      else rect(ctx, tint, x + (side === 3 ? size - depth : 0), y + offset, depth, 4);
    }
  });
  const dx = x + 5 + (hash % 14);
  const dy = y + 6 + ((hash >>> 8) % 15);
  if (tile === 'w') {
    rect(ctx, '#76b8bc80', dx - 2, dy, 8, 1);
    rect(ctx, '#9acacb55', dx + 4, dy + 4, 7, 1);
  } else if (tile === 'r' || tile === '#') {
    rect(ctx, '#343d39', x + 3, y + 8, 26, 21);
    rect(ctx, '#838984', x + 5, y + 5, 21, 17);
    rect(ctx, '#a3a799', x + 7, y + 6, 16, 3);
    rect(ctx, '#58635d', x + 13, y + 15, 13, 9);
  } else if (tile === 't') {
    rect(ctx, '#233e29', x + 1, y + 23, 30, 8);
    rect(ctx, '#816346', x + 12, y + 15, 8, 14);
    rect(ctx, '#30523b', x + 1, y + 8, 30, 16);
    rect(ctx, '#426e42', x + 3, y + 5, 26, 15);
    rect(ctx, '#59854a', x + 7, y + 2, 18, 12);
    rect(ctx, '#84a658', x + 10, y + 3, 10, 4);
  } else if (tile === 'f') {
    for (let fern = 0; fern < 3; fern++) {
      const stem = tileVariation(col * 7 + fern, row);
      const sx = x + 4 + stem % 22;
      const sy = y + 5 + ((stem >>> 6) % 23);
      rect(ctx, '#294f36', sx - 3, sy, 7, 2);
      rect(ctx, '#729657', sx - 1, sy - 3, 3, 4);
      rect(ctx, '#83a460', sx + 1, sy - 1, 3, 1);
    }
  } else if (tile === 'b') {
    for (let stem = 0; stem < 11; stem++) {
      const blade = tileVariation(col * 13 + stem, row);
      const sx = x + 2 + (blade % 27);
      const sy = y + 10 + ((blade >>> 11) % 17);
      const height = 5 + ((blade >>> 19) % 8);
      rect(ctx, '#3c623a', sx, sy - height, 2, height);
      rect(ctx, blade % 2 ? '#9bad59' : '#7c9c4c', sx - 1, sy - height, 2, 4);
    }
  } else {
    rect(ctx, tile === 'g' ? '#9baa65' : '#c1a574', dx, dy, 4, 1);
    rect(ctx, tile === 'g' ? '#385d3c' : '#65503a', dx + 2, dy + 4, 2, 2);
    if (tile === 'g' && hash % 11 === 0) rect(ctx, '#eee3a2', dx + 6, dy - 2, 2, 2);
  }
}

function paintWorld(ctx, map, width, height) {
  if (paintedMap !== map) {
    terrainChunks.clear();
    paintedMap = map;
  }
  const span = map.tileSize * chunkTiles;
  const left = Math.floor(arenaCamera.x / span);
  const top = Math.floor(arenaCamera.y / span);
  const right = Math.min(Math.ceil(map.columns / chunkTiles), Math.ceil((arenaCamera.x + width) / span));
  const bottom = Math.min(Math.ceil(map.rows / chunkTiles), Math.ceil((arenaCamera.y + height) / span));
  for (let row = top; row < bottom; row++) {
    for (let col = left; col < right; col++) {
      const key = row * map.columns + col;
      let chunk = terrainChunks.get(key);
      if (chunk) terrainChunks.delete(key);
      else {
        chunk = document.createElement('canvas');
        chunk.width = chunk.height = span;
        const surface = chunk.getContext('2d');
        for (let y = 0; y < chunkTiles && row * chunkTiles + y < map.rows; y++) {
          for (let x = 0; x < chunkTiles && col * chunkTiles + x < map.columns; x++) {
            paintTile(surface, map, col * chunkTiles + x, row * chunkTiles + y, x * map.tileSize, y * map.tileSize);
          }
        }
      }
      terrainChunks.set(key, chunk);
      ctx.drawImage(chunk, col * span, row * span);
    }
  }
  const limit = Math.max(24, (right - left) * (bottom - top) + 8);
  while (terrainChunks.size > limit) terrainChunks.delete(terrainChunks.keys().next().value);
}

function displayPosition(player, old, blend) {
  const interpolate = old && old.alive === player.alive && old.spawnedAt === player.spawnedAt;
  return {
    x: Math.round(interpolate ? old.x + (player.x - old.x) * blend : player.x),
    y: Math.round(interpolate ? old.y + (player.y - old.y) * blend : player.y)
  };
}

function armor(ctx, job, color, headX, stride, back) {
  rect(ctx, '#1a1924', -10, -25, 20, 23);
  rect(ctx, '#312a38', -7, -8 + stride, 5, 10);
  rect(ctx, '#312a38', 2, -8 - stride, 5, 10);
  rect(ctx, '#141922', -8, stride, 7, 3);
  rect(ctx, '#141922', 2, -stride, 7, 3);
  rect(ctx, color.dark, -8, -22, 16, 16);
  rect(ctx, color.mid, -7, -22, 14, 12);
  if (job === 'warrior') {
    rect(ctx, '#9aabb5', -10, -22, 5, 8);
    rect(ctx, '#d0d4cd', 5, -22, 5, 8);
    rect(ctx, '#d5c2a1', -4, -21, 8, 2);
    rect(ctx, '#73818e', headX - 7, -34, 14, 13);
    rect(ctx, '#c6cacf', headX - 5, -35, 10, 8);
    rect(ctx, color.light, headX - 2, -39, 4, 5);
    if (!back) rect(ctx, '#272e3c', headX - 5, -28, 10, 3);
    rect(ctx, '#3a252a', -13, -17, 8, 12);
    rect(ctx, color.light, -12, -16, 6, 8);
    rect(ctx, color.mid, -12, -11, 6, 5);
  } else if (job === 'archer') {
    rect(ctx, color.dark, -9, -17, 5, 11);
    rect(ctx, '#b7865d', 4, -25, 4, 17);
    rect(ctx, '#f2d497', 5, -28, 2, 8);
    rect(ctx, color.dark, headX - 8, -32, 16, 12);
    rect(ctx, color.light, headX - 5, -35, 10, 3);
    rect(ctx, color.mid, headX - 6, -33, 12, 5);
    if (!back) {
      rect(ctx, '#e4ab83', headX - 4, -28, 8, 6);
      rect(ctx, '#352636', headX - 3, -27, 2, 2);
    }
  } else {
    rect(ctx, color.dark, -10, -16, 20, 16);
    rect(ctx, color.mid, -8, -17, 16, 13);
    rect(ctx, '#dfaf71', -8, -6, 16, 2);
    if (!back) {
      rect(ctx, '#e4b297', headX - 4, -29, 8, 8);
      rect(ctx, '#e6d6cb', headX - 3, -24, 6, 6);
    }
    rect(ctx, color.light, headX - 10, -32, 20, 3);
    rect(ctx, color.dark, headX - 7, -37, 14, 5);
    rect(ctx, color.mid, headX - 4, -41, 8, 5);
    rect(ctx, color.light, headX + 1, -44, 3, 5);
  }
  rect(ctx, '#edbe77', -2, -12, 4, 2);
}

function weapon(ctx, player, color, time) {
  const swinging = player.action?.until > time;
  const angle = swinging ? player.angle : player.facing;
  const elapsed = swinging ? 1 - (player.action.until - time) / 240 : 0;
  ctx.save();
  ctx.translate(0, -13);
  ctx.rotate(angle + (swinging && player.job === 'warrior' ? 1.5 * (elapsed - 0.5) : 0));
  const reach = swinging ? 5 : 0;
  if (player.job === 'warrior') {
    rect(ctx, '#ba8757', 8 + reach, -2, 7, 4);
    rect(ctx, '#efbc75', 14 + reach, -5, 3, 10);
    rect(ctx, '#d3dfe4', 17 + reach, -2, 13, 4);
    rect(ctx, '#f7ffef', 19 + reach, -2, 9, 1);
  } else if (player.job === 'archer') {
    rect(ctx, '#a16b47', 11 + reach, -8, 3, 16);
    rect(ctx, '#d29562', 14 + reach, -6, 4, 12);
    rect(ctx, '#d8ceb4', 10 + reach, -7, 1, 14);
    if (swinging) rect(ctx, '#ffe5b4', 12, 0, 13, 2);
  } else {
    rect(ctx, '#b98258', 10 + reach, -1, 13, 3);
    rect(ctx, color.light, 22 + reach, -4, 6, 8);
    rect(ctx, '#fff0dd', 23 + reach, -3, 2, 3);
  }
  ctx.restore();
}

function sprite(ctx, p, old, blend, time, localId) {
  const { x, y } = displayPosition(p, old, blend);
  const color = colors[p.team];
  if (!p.alive) {
    const age = time - (p.respawnAt - 3000);
    if (age < 600) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 600);
      rect(ctx, color.dark, x - 13, y - 3, 26, 7);
      for (let i = 0; i < 6; i++) {
        rect(ctx, color.light, x + (i - 3) * (3 + age / 70), y - 7 - (i % 3 + 1) * age / 38, 3, 3);
      }
      ctx.restore();
    }
    return;
  }
  rect(ctx, '#13151fee', x - 13, y + 1, 26, 6);
  rect(ctx, p.id === localId ? '#f9df9b' : color.light, x - 11, y + 4, 22, 2);
  const stride = p.moving ? [2, 0, -2, 0][Math.floor(time / 75) % 4] : 0;
  const bob = p.moving ? Math.abs(stride) / 2 : Math.floor(time / 330) % 2;
  const facing = p.action?.until > time ? p.angle : p.facing;
  const headX = Math.abs(Math.cos(facing)) > 0.7 ? Math.sign(Math.cos(facing)) * 3 : 0;
  ctx.save();
  ctx.translate(x, y - bob);
  armor(ctx, p.job, color, headX, stride, Math.sin(facing) < -0.7);
  weapon(ctx, p, color, time);
  if (time - p.hurtAt < 145 && p.hurtAt > 0) rect(ctx, '#fff1db83', -8, -25, 16, 14);
  ctx.restore();
  if (time - p.spawnedAt < 650) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - (time - p.spawnedAt) / 650);
    for (const shift of [-14, 12]) rect(ctx, color.light, x + shift, y - 35, 2, 35);
    ctx.restore();
  }
  const name = `${p.bot ? '[AI] ' : ''}${p.name} · ${letters[p.job]}`;
  ctx.font = 'bold 12px system-ui';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#17131d';
  ctx.strokeText(name, x, y - 53, 155);
  ctx.fillStyle = p.id === localId ? '#ffe3a3' : '#faf0df';
  ctx.fillText(name, x, y - 53, 155);
  rect(ctx, '#16151d', x - 20, y - 49, 40, 5);
  rect(ctx, color.light, x - 19, y - 48, Math.ceil(38 * p.hp / p.maxHp), 3);
}

const chestPaint = {
  common: ['#532d1e', '#a56837', '#e0ad62'],
  rare: ['#253e59', '#4f7ba4', '#a2dfeb'],
  legendary: ['#59326e', '#8b4bb0', '#fbc85c']
};

function drawChest(ctx, chest, time) {
  const [outline, material, trim] = chestPaint[chest.quality];
  const { x, y } = chest;
  const opened = chest.openedAt !== null;
  const age = opened ? Math.max(0, time - chest.openedAt) : 0;
  const lift = opened ? Math.min(8, age / 24) : 0;
  rect(ctx, '#18241ab3', x - 13, y + 6, 26, 5);
  if (!opened && chest.quality !== 'common') {
    const glow = ctx.createRadialGradient(x, y, 1, x, y, chest.quality === 'legendary' ? 31 : 20);
    glow.addColorStop(0, trim + 'ad');
    glow.addColorStop(1, trim + '00');
    rect(ctx, glow, x - 32, y - 32, 64, 64);
  }
  rect(ctx, outline, x - 12, y - 3, 24, 12);
  rect(ctx, material, x - 10, y, 20, 6);
  rect(ctx, opened ? '#211b22' : material, x - 10, y - 4, 20, 5);
  rect(ctx, outline, x - 12, y - 9 - lift, 24, 6);
  rect(ctx, material, x - 10, y - 8 - lift, 20, 4);
  rect(ctx, trim, x - 9, y - 9 - lift, 2, 15 + lift);
  rect(ctx, trim, x + 7, y - 9 - lift, 2, 15 + lift);
  if (!opened) rect(ctx, trim, x - 3, y - 4, 6, 5);
  if (opened && age < 550) {
    ctx.save();
    ctx.globalAlpha = 1 - age / 550;
    for (let spark = -2; spark <= 2; spark++) {
      rect(ctx, trim, x + spark * (4 + age / 54), y - 9 - age / (15 + Math.abs(spark) * 7), 3, 3);
    }
    ctx.restore();
  }
}

const minimapGround = document.createElement('canvas');
let minimapWorld;
function minimapView(map, center) {
  const width = map.width / 4;
  const height = map.height / 4;
  return {
    x: Math.max(0, Math.min(map.width - width, center.x - width / 2)),
    y: Math.max(0, Math.min(map.height - height, center.y - height / 2)),
    width, height
  };
}

function drawMinimap(state, old, blend, map, chests, localId) {
  const me = state.players.find(player => player.id === localId);
  if (!me) return;
  const center = displayPosition(me, old?.players.find(player => player.id === localId), blend);
  const view = minimapView(map, center);
  const canvas = $('minimap');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (minimapWorld !== map) {
    minimapWorld = map;
    minimapGround.width = map.columns;
    minimapGround.height = map.rows;
    const terrain = minimapGround.getContext('2d');
    map.tiles.forEach((row, y) => [...row].forEach((tile, x) => rect(terrain, terrainColors[tile][1], x, y, 1, 1)));
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(minimapGround, view.x / map.tileSize, view.y / map.tileSize,
    view.width / map.tileSize, view.height / map.tileSize, 0, 0, canvas.width, canvas.height);
  const x = value => (value - view.x) / view.width * canvas.width;
  const y = value => (value - view.y) / view.height * canvas.height;
  const inView = point => point.x >= view.x && point.x < view.x + view.width &&
    point.y >= view.y && point.y < view.y + view.height;
  const open = new Set(state.openedChestIds);
  for (const chest of chests) {
    if (!inView(chest)) continue;
    const mark = open.has(chest.id) ? '#aca996' : chestPaint[chest.quality][2];
    const size = open.has(chest.id) ? 2 : 3;
    rect(ctx, mark, x(chest.x) - 1, y(chest.y) - 1, size, size);
  }
  for (const player of state.players) {
    if (!player.alive || player === me || !inView(player)) continue;
    rect(ctx, player.team === me.team ? '#78d5ff' : '#ff6b71', x(player.x) - 2, y(player.y) - 2, 4, 4);
  }
  rect(ctx, '#fff8e3', x(center.x) - 2, y(center.y) - 2, 5, 5);
}

function drawArena(state, old, blend, time, aim, localId, map, frameTime) {
  const ctx = arenaContext;
  const canvas = $('arena');
  const width = Math.min(map.width, canvas.clientWidth || canvas.width);
  const height = Math.min(map.height, canvas.clientHeight || canvas.height);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const older = new Map(old?.players.map(p => [p.id, p]));
  const player = state.players.find(p => p.id === localId);
  const position = player && displayPosition(player, older.get(localId), blend);
  if (position) arenaCamera.follow(position, player, map, width, height, frameTime);
  ctx.save();
  ctx.translate(-arenaCamera.x, -arenaCamera.y);
  paintWorld(ctx, map, width, height);
  for (const chest of state.chests || []) drawChest(ctx, chest, time);
  for (const p of [...state.players].sort((a, b) => a.y - b.y)) {
    if (p.x < arenaCamera.x - 96 || p.y < arenaCamera.y - 96 ||
        p.x > arenaCamera.x + width + 96 || p.y > arenaCamera.y + height + 96) continue;
    sprite(ctx, p, older.get(p.id), blend, time, localId);
  }
  for (const effect of state.effects) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, (effect.until - time) / 240));
    ctx.strokeStyle = effect.type === 'rune' ? '#dfb3ff' : effect.type === 'blast' || effect.type === 'mage' ? '#ffad61' : colors[effect.team].light;
    ctx.lineWidth = effect.type === 'blast' ? 8 : 4;
    ctx.beginPath();
    if (effect.type === 'spin' || effect.type === 'blast' || effect.type === 'rune') {
      ctx.arc(effect.x, effect.y, effect.range, 0, Math.PI * 2);
    } else if (effect.type === 'warrior') {
      ctx.arc(effect.x, effect.y, effect.range - 12, effect.angle - 0.65, effect.angle + 0.65);
    } else {
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(effect.x + 36 * Math.cos(effect.angle), effect.y + 36 * Math.sin(effect.angle));
    }
    ctx.stroke();
    ctx.restore();
  }
  for (const p of state.projectiles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    if (p.type === 'arrow') {
      rect(ctx, '#ebba7a', -11, -1, 14, 2);
      rect(ctx, '#ffffce', 2, -2, 4, 4);
    } else {
      rect(ctx, '#c74638', -11, -4, 17, 8);
      rect(ctx, '#ff9a44', -5, -6, 12, 12);
      rect(ctx, '#ffe3a0', 0, -3, 6, 6);
    }
    ctx.restore();
  }
  ctx.restore();
  if (position && state.visionRadius) {
    const x = position.x - arenaCamera.x;
    const y = position.y - arenaCamera.y;
    const radius = state.visionRadius;
    const fog = ctx.createRadialGradient(x, y, radius * 0.74, x, y, radius + 6);
    fog.addColorStop(0, '#10171800');
    fog.addColorStop(0.96, '#101718e8');
    fog.addColorStop(1, '#101718f0');
    rect(ctx, fog, 0, 0, width, height);
  }
  if (position && state.attackRange) {
    ctx.save();
    ctx.strokeStyle = state.targetInRange ? '#a8f8a6' : '#fff0c2bd';
    ctx.lineWidth = state.targetInRange ? 2 : 1.5;
    ctx.beginPath();
    ctx.arc(position.x - arenaCamera.x, position.y - arenaCamera.y, state.attackRange, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const cursor = aim || { x: width / 2 + 45, y: height / 2 };
  rect(ctx, '#fff0c2', cursor.x - 6, cursor.y, 4, 1);
  rect(ctx, '#fff0c2', cursor.x + 3, cursor.y, 4, 1);
  rect(ctx, '#fff0c2', cursor.x, cursor.y - 6, 1, 4);
  rect(ctx, '#fff0c2', cursor.x, cursor.y + 3, 1, 4);
}
