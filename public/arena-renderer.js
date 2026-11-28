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
  let watching = false;
  const clamp = (value, max) => Math.max(0, Math.min(max, value));
  return {
    x: 0, y: 0,
    follow(position, player, map, width, height, time) {
      const maxX = Math.max(0, map.width - width);
      const maxY = Math.max(0, map.height - height);
      const targetX = clamp(position.x - width / 2, maxX);
      const targetY = clamp(position.y - height / 2, maxY);
      const reset = watching || world !== map || player.id !== playerId || player.spawnedAt !== spawnedAt || player.warped !== this.warped;
      const elapsed = Math.min(100, Math.max(0, time - lastTime));
      const blend = reset ? 1 : 1 - Math.exp(-elapsed / 65);
      x = clamp(x + (targetX - x) * blend, maxX);
      y = clamp(y + (targetY - y) * blend, maxY);
      this.x = Math.min(maxX, Math.round(x));
      this.y = Math.min(maxY, Math.round(y));
      world = map;
      playerId = player.id;
      spawnedAt = player.spawnedAt;
      this.warped = player.warped;
      lastTime = time;
      watching = false;
    },
    pan(position, map, width, height, time, direction, anchor) {
      const maxX = Math.max(0, map.width - width);
      const maxY = Math.max(0, map.height - height);
      const fresh = world !== map || !watching;
      if (anchor || fresh) {
        const center = anchor ?? position;
        x = center.x - width / 2;
        y = center.y - height / 2;
      }
      const dt = fresh ? 0 : Math.min(60, Math.max(0, time - lastTime)) / 1000;
      const distance = 530 * dt / Math.max(1, Math.hypot(direction.x, direction.y));
      x = clamp(x + direction.x * distance, maxX);
      y = clamp(y + direction.y * distance, maxY);
      this.x = Math.min(maxX, Math.round(x));
      this.y = Math.min(maxY, Math.round(y));
      world = map;
      lastTime = time;
      watching = true;
    }
  };
}
const arenaCamera = createArenaCamera();
const compactBattle = window.matchMedia?.('(pointer: coarse) and (max-width: 1100px)');
let arenaZoom = 1.38;

function battleZoom(width, height, compact) {
  if (compact) return Math.max(width > height ? .80 : .92, width / 1260, height / 1020);
  return Math.max(1.38, width / 980, height / 700);
}
const heroSprites = typeof Image === 'undefined' ? null : new Image();
const campaignSprites = typeof Image === 'undefined' ? null : new Image();
if (heroSprites) heroSprites.src = '/art/heroes/sprites.webp';
if (campaignSprites) campaignSprites.src = '/art/heroes/campaign-sprites.webp';

function drawHeroPixels(ctx, id, x, y, width, height) {
  const campaignIndex = playableOrder.indexOf(id);
  const atlas = campaignIndex < 0 ? heroSprites : campaignSprites;
  const index = campaignIndex < 0 ? heroAtlasOrder.indexOf(id) : campaignIndex;
  if (!atlas?.complete || !atlas.naturalWidth || index < 0) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, index * 28, 0, 28, 30, x, y, width, height);
  return true;
}
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

const scenePalettes = {
  forest: {
    g: ['#356238', '#396c3a', '#3c703e'], f: ['#244d3e', '#295543', '#2c5a46'],
    t: ['#234135', '#284837', '#2c4b3c'], w: ['#142f46', '#18374e', '#1b3c52'],
    b: ['#355b3d', '#385e40', '#3b6342'], p: ['#634430', '#6e4b34', '#72503b'],
    d: ['#573e31', '#604736', '#65503a'], '#': ['#152b38', '#172e3c', '#193141'],
    leaves: ['#152c33', '#286052', '#459064', '#7abc74', '#b5d794'], spores: ['#735bd6', '#b3a8ff']
  },
  marsh: {
    g: ['#384d46', '#3c544a', '#415b4f'], f: ['#263941', '#2b464a', '#2f4b4f'],
    t: ['#283e43', '#2b4349', '#2f4a4d'], w: ['#232b54', '#26335e', '#2a3c66'],
    b: ['#304f4f', '#34574e', '#385c50'], p: ['#625453', '#6a5b56', '#70615d'],
    d: ['#4c4553', '#554a5a', '#594d60'], '#': ['#161f39', '#191f3d', '#1a2342'],
    leaves: ['#182738', '#2b4b5b', '#467479', '#6da399', '#a2d4b0'], spores: ['#42a9b6', '#a4f4de']
  },
  ruins: {
    g: ['#565843', '#5b6047', '#606649'], f: ['#494a38', '#50523c', '#545844'],
    t: ['#3d4235', '#414833', '#484b37'], w: ['#323642', '#363b48', '#3e414d'],
    r: ['#555361', '#625d69', '#686271'], p: ['#765c4d', '#816452', '#886c56'],
    d: ['#5b5145', '#62574b', '#665a50'], '#': ['#262331', '#2d2838', '#322c3b'],
    leaves: ['#312d2b', '#575139', '#807d50', '#b3a96b', '#dac78f'], spores: ['#b97850', '#ffcd80']
  },
  snow: {
    g: ['#b7cad3', '#c1d4df', '#cbdde6'], f: ['#829fab', '#90aeb8', '#9ab8c0'],
    t: ['#667e91', '#6e889b', '#7892a5'], b: ['#a9c1cd', '#b0c8d4', '#b9cfdb'],
    w: ['#355e88', '#3d6a91', '#467499'], r: ['#6c7c90', '#78879a', '#8493a5'],
    p: ['#938b87', '#9c948f', '#a99e98'], d: ['#9d9ca4', '#a8a8ad', '#b9b8bc'], '#': ['#2b4158', '#32495f', '#3a5167'],
    leaves: ['#293c50', '#3b646c', '#528281', '#bfd9dd', '#f2f9f4'], spores: ['#447eba', '#e9f9ff']
  },
  inferno: {
    g: ['#50343d', '#583944', '#603d46'], f: ['#422c3a', '#4b3040', '#523745'],
    t: ['#39252b', '#43292e', '#4c2e32'], b: ['#50343b', '#58373e', '#603a40'],
    w: ['#a33036', '#c03e31', '#d05530'], r: ['#392d40', '#48374b', '#523d53'],
    p: ['#67443b', '#744b40', '#7c5143'], d: ['#5b3836', '#683c36', '#703e36'], '#': ['#271b2a', '#2c1c2d', '#342033'],
    leaves: ['#271b2b', '#573341', '#8d4950', '#bc624f', '#e89263'], spores: ['#df6236', '#ffc170']
  },
  fortress: {
    g: ['#626a54', '#69715a', '#6e775f'], f: ['#4e584b', '#565f51', '#5c6657'],
    t: ['#434d43', '#4a554b', '#515f53'], b: ['#535c47', '#5d674f', '#657056'],
    w: ['#344958', '#3c5363', '#445e6e'], r: ['#535867', '#5c6371', '#666e78'],
    p: ['#77746d', '#807c74', '#888479'], d: ['#645c50', '#706859', '#7a7060'], '#': ['#454b59', '#515966', '#5a6372'],
    leaves: ['#2b342f', '#455848', '#697757', '#889565', '#b2b780'], spores: ['#b8954a', '#f8d478']
  }
};

function paintCanopy(ctx, x, y, hash, palette) {
  const [shade, dark, mid, leaf, glint] = palette.leaves;
  rect(ctx, shade, x + 1, y + 24, 30, 6);
  rect(ctx, '#33271f', x + 10, y + 12, 12, 17);
  rect(ctx, '#a57e55', x + 13, y + 15, 4, 12);
  rect(ctx, '#75583e', x + 17, y + 21, 3, 7);
  rect(ctx, '#967b60', x + 7, y + 27, 7, 2);
  rect(ctx, '#644836', x + 19, y + 26, 7, 3);
  for (const [offsetX, offsetY, width] of [[0, 7, 14], [16, 6, 14], [8, 1, 16], [8, 10, 15]]) {
    const tx = x + offsetX + (hash >>> offsetX) % 3;
    const ty = y + offsetY;
    rect(ctx, shade, tx, ty + 3, width, 11);
    rect(ctx, dark, tx + 1, ty + 2, width - 2, 9);
    rect(ctx, mid, tx + 2, ty + 1, width - 4, 7);
    rect(ctx, leaf, tx + 3, ty, width - 7, 4);
    rect(ctx, glint, tx + 4, ty + 1, 3, 2);
    rect(ctx, mid, tx + width - 6, ty + 8, 3, 3);
  }
}

function paintMushroom(ctx, x, y, shades) {
  rect(ctx, '#202432', x - 6, y + 4, 13, 3);
  rect(ctx, '#ccbac3', x - 1, y + 1, 3, 5);
  rect(ctx, shades[0], x - 7, y - 4, 15, 7);
  rect(ctx, shades[0], x - 5, y - 7, 11, 5);
  rect(ctx, shades[1], x - 3, y - 5, 4, 2);
  rect(ctx, shades[1], x + 3, y - 2, 3, 2);
}

function tileVariation(x, y) {
  return (Math.imul(x + 11, 73856093) ^ Math.imul(y + 17, 19349663)) >>> 0;
}

function paintTile(ctx, map, col, row, x, y) {
  const tile = map.tiles[row][col];
  const size = map.tileSize;
  const hash = tileVariation(col, row);
  const palette = scenePalettes[map.scene];
  const colors = palette?.[tile] ?? terrainColors[tile];
  rect(ctx, colors[hash % 3], x, y, size, size);
  const adjacent = [map.tiles[row - 1]?.[col], map.tiles[row + 1]?.[col],
    map.tiles[row][col - 1], map.tiles[row][col + 1]];
  adjacent.forEach((neighbor, side) => {
    if (!neighbor || neighbor === tile) return;
    const tint = neighbor === 'w' && !palette ? '#69a7a4' : (palette?.[neighbor] ?? terrainColors[neighbor])[1];
    for (let offset = 0; offset < size; offset += 4) {
      const depth = 1 + (tileVariation(col * 17 + offset, row * 13 + side) % 4);
      if (side < 2) rect(ctx, tint, x + offset, y + (side ? size - depth : 0), 4, depth);
      else rect(ctx, tint, x + (side === 3 ? size - depth : 0), y + offset, depth, 4);
    }
  });
  const dx = x + 5 + (hash % 14);
  const dy = y + 6 + ((hash >>> 8) % 15);
  if (tile === 'w' && map.scene === 'inferno') {
    rect(ctx, '#fb9a48', dx - 2, dy, 8, 2);
    rect(ctx, '#ffd276', dx + 4, dy + 4, 6, 1);
  } else if (tile === '#' && map.scene === 'fortress') {
    for (let level = 0; level < 4; level++) {
      rect(ctx, '#303642', x, y + level * 8 + 7, 32, 1);
      rect(ctx, '#303642', x + 8 + level % 2 * 10, y + level * 8, 1, 8);
      rect(ctx, '#859098', x + 1, y + level * 8 + 1, 7, 1);
    }
  } else if (tile === 'w') {
    rect(ctx, '#76b8bc80', dx - 2, dy, 8, 1);
    rect(ctx, '#9acacb55', dx + 4, dy + 4, 7, 1);
  } else if (tile === 'r' || tile === '#') {
    rect(ctx, '#343d39', x + 3, y + 8, 26, 21);
    rect(ctx, palette?.r?.[2] ?? '#838984', x + 5, y + 5, 21, 17);
    rect(ctx, map.scene === 'snow' ? '#d7edf0' : '#a3a799', x + 7, y + 6, 16, 3);
    rect(ctx, '#58635d', x + 13, y + 15, 13, 9);
  } else if (tile === 't' && palette) {
    paintCanopy(ctx, x, y, hash, palette);
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
      rect(ctx, palette?.leaves[0] ?? '#294f36', sx - 3, sy, 7, 2);
      rect(ctx, palette?.leaves[2] ?? '#729657', sx - 1, sy - 3, 3, 4);
      rect(ctx, palette?.leaves[3] ?? '#83a460', sx + 1, sy - 1, 3, 1);
    }
  } else if (tile === 'b') {
    for (let stem = 0; stem < 11; stem++) {
      const blade = tileVariation(col * 13 + stem, row);
      const sx = x + 2 + (blade % 27);
      const sy = y + 10 + ((blade >>> 11) % 17);
      const height = 5 + ((blade >>> 19) % 8);
      rect(ctx, palette?.leaves[1] ?? '#3c623a', sx, sy - height, 2, height);
      rect(ctx, palette ? palette.leaves[2 + blade % 2] : blade % 2 ? '#9bad59' : '#7c9c4c', sx - 1, sy - height, 2, 4);
    }
  } else {
    rect(ctx, tile === 'g' ? '#9baa65' : '#c1a574', dx, dy, 4, 1);
    rect(ctx, tile === 'g' ? '#385d3c' : '#65503a', dx + 2, dy + 4, 2, 2);
    if (tile === 'g' && hash % 11 === 0) rect(ctx, '#eee3a2', dx + 6, dy - 2, 2, 2);
  }
  if (palette && ['f', 'g', 'd'].includes(tile)) {
    if (hash % 21 === 0) paintMushroom(ctx, dx, dy, palette.spores);
    else if (hash % 13 === 0) rect(ctx, palette.spores[1], dx + 2, dy + 1, 2, 2);
    if (map.scene === 'ruins' && hash % 29 === 0) {
      rect(ctx, '#34313b', dx - 3, dy - 3, 10, 8);
      rect(ctx, '#aca19b', dx - 2, dy - 3, 7, 3);
    }
  }
}

function paintWorld(ctx, map, width, height, camera = arenaCamera) {
  if (paintedMap !== map) {
    terrainChunks.clear();
    paintedMap = map;
  }
  const span = map.tileSize * chunkTiles;
  const left = Math.floor(camera.x / span);
  const top = Math.floor(camera.y / span);
  const right = Math.min(Math.ceil(map.columns / chunkTiles), Math.ceil((camera.x + width) / span));
  const bottom = Math.min(Math.ceil(map.rows / chunkTiles), Math.ceil((camera.y + height) / span));
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
  const interpolate = old && old.alive === player.alive && old.spawnedAt === player.spawnedAt && old.warped === player.warped;
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
  if (p.form === 1) {
    rect(ctx, '#bd99fd8e', -21, -46, 2, 44);
    rect(ctx, '#bd99fd8e', 19, -46, 2, 44);
  }
  ctx.save();
  if (Math.cos(facing) < -.3) ctx.scale(-1, 1);
  ctx.rotate(p.action?.until > time ? .10 : 0);
  const painted = drawHeroPixels(ctx, p.hero ?? p.job, -23, -49 + stride / 2, 46, 50);
  ctx.restore();
  if (!painted) {
    armor(ctx, p.job, color, headX, stride, Math.sin(facing) < -0.7);
    weapon(ctx, p, color, time);
  }
  if (time - p.hurtAt < 145 && p.hurtAt > 0) rect(ctx, '#fff1db83', -8, -25, 16, 14);
  ctx.restore();
  if (time - p.spawnedAt < 650) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - (time - p.spawnedAt) / 650);
    for (const shift of [-14, 12]) rect(ctx, color.light, x + shift, y - 35, 2, 35);
    ctx.restore();
  }
  const name = `${p.bot ? '[AI] ' : ''}${p.name} · ${p.role ? roleNames[p.role] : letters[p.job]}`;
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

function drawMinimap(state, old, blend, map, chests, localId, tactical = null) {
  const me = state.players.find(player => player.id === localId);
  if (!me) return;
  const arena = $('arena');
  const center = me.alive ? displayPosition(me, old?.players.find(player => player.id === localId), blend) :
    { x: arenaCamera.x + arena.width / arenaZoom / 2, y: arenaCamera.y + arena.height / arenaZoom / 2 };
  const view = tactical ? { x: 0, y: 0, width: map.width, height: map.height } : minimapView(map, center);
  const canvas = tactical ?? $('minimap');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (minimapWorld !== map) {
    minimapWorld = map;
    minimapGround.width = map.columns;
    minimapGround.height = map.rows;
    const terrain = minimapGround.getContext('2d');
    map.tiles.forEach((row, y) => [...row].forEach((tile, x) => rect(terrain, (scenePalettes[map.scene]?.[tile] ?? terrainColors[tile])[1], x, y, 1, 1)));
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
  const scenario = state.scenario;
  const markers = new Map(state.players.filter(player => player.alive).map(player => [player.id, player]));
  for (const marker of scenario?.markers ?? []) markers.set(marker.id, marker);
  for (const base of scenario?.bases ?? []) {
    if (inView(base)) drawZone(ctx, { x: x(base.x), y: y(base.y) }, base.radius / view.width * canvas.width, colors[base.team].light);
  }
  for (const target of [...(scenario?.points ?? []), ...(scenario?.flags ?? []), ...(scenario?.supplies ?? [])]) {
    if (!inView(target)) continue;
    const shade = target.owner || target.marking || target.team;
    const mark = target.kind === 'drop' ? 7 : 5;
    rect(ctx, shade ? colors[shade].light : target.kind === 'drop' ? '#75ffdf' : '#f3cf69',
      x(target.x) - (mark >> 1), y(target.y) - (mark >> 1), mark, mark);
  }
  for (const player of markers.values()) {
    if (player.id === localId || !inView(player)) continue;
    rect(ctx, player.team === me.team ? '#78d5ff' : '#ff6b71', x(player.x) - 2, y(player.y) - 2, 4, 4);
  }
  rect(ctx, '#fff8e3', x(center.x) - 2, y(center.y) - 2, 5, 5);
}

function drawZone(ctx, point, radius, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = .08;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill?.();
  ctx.globalAlpha = .82;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawObjective(ctx, point, time) {
  const { x, y } = point;
  rect(ctx, '#26252d', x - 12, y, 24, 7);
  rect(ctx, '#ddc5a5', x - 2, y - 36, 4, 38);
  const team = point.owner ?? point.marking;
  const color = team ? colors[team].light : '#f8d172';
  rect(ctx, color, x + 2, y - 34, 21, 15);
  if (point.remaining != null || point.ends) {
    rect(ctx, '#201922', x - 17, y - 45, 36, 5);
    const remaining = point.ends ? point.ends - time : point.remaining;
    rect(ctx, point.status === 'contested' ? '#ffba71' : color, x - 16, y - 44,
      34 * Math.max(0, Math.min(1, 1 - remaining / 180_000)), 3);
  }
}

function drawBeast(ctx, beast, time) {
  const { x, y, species } = beast;
  const bob = Math.floor(time / 175) % 2;
  const fur = ['#6bb377', '#c77258', '#9d7bc9'][species];
  const top = y - [23, 28, 34][species] - bob;
  rect(ctx, '#171d28', x - 17, y - 3, 34, 8);
  rect(ctx, '#232134', x - 16, top + 5, 32, y - top - 3);
  rect(ctx, fur, x - 13, top + 6, 26, y - top - 10);
  rect(ctx, fur, x - 12, top, 6, 9);
  rect(ctx, fur, x + 6, top, 6, 9);
  rect(ctx, '#ffc682', x - 8, top + 10, 4, 3);
  rect(ctx, '#ffc682', x + 4, top + 10, 4, 3);
  rect(ctx, '#302333', x - 4, top + 16, 8, 4);
  rect(ctx, '#181b24', x - 15, top - 7, 30, 4);
  rect(ctx, '#f5a479', x - 14, top - 6, 28 * beast.hp / beast.maxHp, 2);
  ctx.font = 'bold 10px system-ui';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff4d4';
  ctx.fillText(['苔牙狼', '棘背獸', '幽光靈'][species], x, top - 10);
}

function drawSkillEffect(ctx, { x, y, tint, appearance, until }, now) {
  const progress = Math.max(0, 1 - (until - now) / 720);
  if (progress >= 1) return;
  const centerY = y - 16;
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = tint;
  ctx.lineWidth = appearance === 'shield' ? 3 : 2;
  ctx.beginPath();
  if (appearance === 'strike' || appearance === 'speed') {
    for (let i = -1; i <= 1; i++) {
      const offset = i * 11;
      const spread = progress * (appearance === 'speed' ? 50 : 32);
      ctx.moveTo(x - 21 - spread, centerY + offset + 10);
      ctx.lineTo(x + 20 + spread, centerY + offset - (appearance === 'strike' ? 14 : -10));
    }
  } else {
    const radius = appearance === 'shield' ? 25 + progress * 8 : 13 + progress * 27;
    ctx.arc(x, centerY, radius, 0, Math.PI * 2);
    if (appearance === 'bind') {
      ctx.moveTo(x - radius, centerY);
      ctx.lineTo(x + radius, centerY);
      ctx.moveTo(x, centerY - radius);
      ctx.lineTo(x, centerY + radius);
    }
  }
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3 + progress;
    const spread = 12 + progress * 35;
    const px = x + Math.cos(angle) * spread;
    const py = centerY + Math.sin(angle) * spread - progress * 12;
    rect(ctx, tint, px - 2, py - 2, appearance === 'heal' ? 7 : 4, 3);
    if (appearance === 'heal') rect(ctx, tint, px, py - 4, 3, 7);
  }
  ctx.restore();
}

function drawAttackCharge(ctx, x, y, charge) {
  const color = charge >= 1 ? '#fff0bf' : '#e09c66';
  rect(ctx, '#271e2b', x - 13, y + 15, 42, 5);
  rect(ctx, color, x - 12, y + 16, Math.round(40 * charge), 3);
  for (let step = 0; step < 6; step++) {
    rect(ctx, '#201d29', x - 25 + step, y + 19 - step, 4, 4);
    rect(ctx, color, x - 24 + step, y + 19 - step, 2, 2);
  }
  rect(ctx, '#f4ac55', x - 26, y + 20, 5, 2);
}

function drawArena(state, old, blend, time, aim, localId, map, frameTime, direction, spectatorTarget, attackCharge = 1) {
  const ctx = arenaContext;
  const canvas = $('arena');
  const width = Math.min(map.width, canvas.clientWidth || canvas.width);
  const height = Math.min(map.height, canvas.clientHeight || canvas.height);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const older = new Map(old?.players.map(p => [p.id, p]));
  const player = state.players.find(p => p.id === localId);
  const position = player && displayPosition(player, older.get(localId), blend);
  arenaZoom = battleZoom(width, height, compactBattle?.matches);
  const worldWidth = width / arenaZoom;
  const worldHeight = height / arenaZoom;
  if (player?.alive) arenaCamera.follow(position, player, map, worldWidth, worldHeight, frameTime);
  else if (position) {
    const watched = state.players.find(p => p.id === spectatorTarget && p.team === player.team);
    const anchor = watched && displayPosition(watched, older.get(watched.id), blend);
    arenaCamera.pan(position, map, worldWidth, worldHeight, frameTime, direction, anchor);
  }
  ctx.save();
  ctx.scale(arenaZoom, arenaZoom);
  ctx.translate(-arenaCamera.x, -arenaCamera.y);
  paintWorld(ctx, map, worldWidth, worldHeight);
  for (const chest of state.chests || []) drawChest(ctx, chest, time);
  if (state.fieldDetail) {
    const { x, y, visitor } = state.fieldDetail;
    if (visitor) {
      rect(ctx, '#292a38', x - 8, y + 4, 16, 4);
      rect(ctx, '#3d354c', x - 6, y - 10, 12, 16);
      rect(ctx, '#a09b8a', x - 4, y - 12, 8, 6);
      rect(ctx, '#d9bf8c', x - 2, y - 8, 4, 4);
      rect(ctx, '#c0a965', x + 6, y - 7, 2, 12);
    } else if (scenePalettes[map.scene]) {
      paintMushroom(ctx, x, y, scenePalettes[map.scene].spores);
    }
  }
  const scenario = state.scenario;
  for (const base of scenario?.bases ?? []) drawZone(ctx, base, base.radius, colors[base.team].light);
  for (const flag of scenario?.flags ?? []) {
    if (flag.status !== 'carried') drawObjective(ctx, { ...flag, owner: flag.team }, time);
  }
  for (const point of scenario?.points ?? []) {
    drawZone(ctx, point, scenario.guardRadius, point.marking ? colors[point.marking].light : '#d3b674');
    drawObjective(ctx, point, time);
  }
  for (const pack of scenario?.supplies ?? []) {
    drawChest(ctx, { ...pack, quality: pack.kind === 'drop' ? 'legendary' : pack.kind === 'medicine' ? 'rare' : 'common', openedAt: null }, time);
  }
  for (const beast of scenario?.beasts ?? []) drawBeast(ctx, beast, time);
  for (const p of [...state.players].sort((a, b) => a.y - b.y)) {
    if (p.x < arenaCamera.x - 96 || p.y < arenaCamera.y - 96 ||
        p.x > arenaCamera.x + worldWidth + 96 || p.y > arenaCamera.y + worldHeight + 96) continue;
    sprite(ctx, p, older.get(p.id), blend, time, localId);
    const flag = scenario?.flags?.find(item => item.carrierId === p.id);
    if (flag && p.alive) {
      const { x, y } = displayPosition(p, older.get(p.id), blend);
      rect(ctx, '#f3deb0', x + 20, y - 41, 2, 22);
      rect(ctx, colors[flag.team].light, x + 22, y - 40, 12, 8);
    }
  }
  for (const effect of state.effects) {
    if (effect.type === 'hero-skill') {
      drawSkillEffect(ctx, effect, time);
      continue;
    }
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
      rect(ctx, p.tint ?? '#ff9a44', -5, -6, 12, 12);
      rect(ctx, '#ffe3a0', 0, -3, 6, 6);
    }
    ctx.restore();
  }
  ctx.restore();
  if (scenario?.night) rect(ctx, '#5e7ac024', 0, 0, width, height);
  if (position && state.attackRange) {
    ctx.save();
    ctx.strokeStyle = state.targetInRange ? '#a8f8a6' : '#fff0c2bd';
    ctx.lineWidth = state.targetInRange ? 2 : 1.5;
    ctx.beginPath();
    ctx.arc((position.x - arenaCamera.x) * arenaZoom, (position.y - arenaCamera.y) * arenaZoom, state.attackRange * arenaZoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (!player?.alive) return;
  drawAttackCharge(ctx, (position.x - arenaCamera.x) * arenaZoom,
    (position.y - arenaCamera.y) * arenaZoom, attackCharge);
  const cursor = aim || { x: width / 2 + 45, y: height / 2 };
  rect(ctx, '#fff0c2', cursor.x - 6, cursor.y, 4, 1);
  rect(ctx, '#fff0c2', cursor.x + 3, cursor.y, 4, 1);
  rect(ctx, '#fff0c2', cursor.x, cursor.y - 6, 1, 4);
  rect(ctx, '#fff0c2', cursor.x, cursor.y + 3, 1, 4);
}

function drawMapPreview(canvas, map, centerX, centerY) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const camera = {
    x: Math.floor(map.width * centerX - canvas.width / 2),
    y: Math.floor(map.height * centerY - canvas.height / 2)
  };
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  paintWorld(ctx, map, canvas.width, canvas.height, camera);
  ctx.restore();
}

const previewMap = typeof fetch === 'function'
  ? fetch('/title-map').then(response => response.ok ? response.json() : null).catch(() => null)
  : Promise.resolve(null);
previewMap.then(map => {
  if (map) drawMapPreview($('title-map'), map, 0.5, 0.5);
});
