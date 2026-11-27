'use strict';

const { campOffset } = require('./world');
const { terrainBlocked } = require('./collision');

const chestCount = 48;
const inventorySize = 5;
const chestSpacing = 160;
const interactRange = 54;
const campClearance = 320;
const shockwave = { range: 112, damage: 128 };

const loot = {
  common: [
    { id: 'potion', label: '生命藥水', heal: 120 },
    { id: 'haste', label: '速度藥水', duration: 10000, speed: 1.22 },
    { id: 'minorPower', label: '小型攻擊增益', duration: 10000, attack: 1.15 }
  ],
  rare: [
    { id: 'guard', label: '防禦提升', duration: 12000, defense: 40 },
    { id: 'greaterPotion', label: '強效治療', heal: 260 },
    { id: 'power', label: '攻擊強化', duration: 12000, attack: 1.30 }
  ],
  legendary: [
    { id: 'shield', label: '無敵護盾', duration: 4000, immune: true },
    { id: 'fury', label: '狂暴效果', duration: 8000, attack: 1.40, speed: 1.30 },
    { id: 'rune', label: '震波符文 [R]', duration: 18000, skill: true }
  ]
};
const inRange = (a, b, range) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= range ** 2;

function quality(roll) {
  if (roll < 0.70) return 'common';
  if (roll < 0.95) return 'rare';
  return 'legendary';
}

function generateChests(world, random = Math.random) {
  const candidates = [];
  const camps = [-campOffset, campOffset].map(offset => ({ x: world.width / 2 + offset, y: world.height / 2 }));
  for (let row = 1; row < world.rows - 1; row++) {
    for (let col = 1; col < world.columns - 1; col++) {
      const point = { x: (col + 0.5) * world.tileSize, y: (row + 0.5) * world.tileSize };
      if (terrainBlocked(world, point.x, point.y) || camps.some(camp => inRange(camp, point, campClearance))) continue;
      candidates.push(point);
    }
  }
  const chests = [];
  while (candidates.length && chests.length < chestCount) {
    const index = Math.floor(random() * candidates.length);
    const point = candidates[index];
    candidates[index] = candidates.at(-1);
    candidates.pop();
    if (chests.some(chest => inRange(chest, point, chestSpacing))) continue;
    chests.push({ ...point, id: chests.length + 1, quality: quality(random()), openedAt: null });
  }
  return chests;
}

function activeBuffs(player, now) {
  return [...player.buffs.values()].filter(buff => buff.until > now);
}

function modifiers(player, now) {
  const result = { attack: 1, speed: 1, defense: 0, immune: false };
  for (const buff of activeBuffs(player, now)) {
    result.attack = Math.max(result.attack, buff.attack ?? 1);
    result.speed = Math.max(result.speed, buff.speed ?? 1);
    result.defense = Math.max(result.defense, buff.defense ?? 0);
    result.immune ||= !!buff.immune;
  }
  return result;
}

function openChest(room, player, id, now, canReach, random = Math.random) {
  if (room.phase !== 'playing' || !player.alive || now >= room.endsAt) return { error: '目前無法開啟寶箱' };
  const chest = room.chests.find(entry => entry.id === id);
  if (!chest || chest.openedAt !== null ||
      !inRange(player, chest, interactRange) || !canReach(player, chest)) {
    return { error: '寶箱已被領取，或你離寶箱太遠' };
  }
  const slot = player.inventory.indexOf(null);
  if (slot < 0) return { error: '道具欄已滿，請先使用一個道具' };
  chest.openedAt = now;
  const rewards = loot[chest.quality];
  const item = rewards[Math.floor(random() * rewards.length)];
  player.inventory[slot] = { ...item, quality: chest.quality };
  return { label: item.label, slot };
}

function useItem(player, slot, maxHp, now) {
  const item = player.inventory[slot];
  if (!item) return { error: '這個欄位沒有道具' };
  if (item.heal && player.hp >= maxHp) return { error: '生命值已滿' };
  player.inventory[slot] = null;
  if (item.heal) {
    const healing = Math.min(item.heal, maxHp - player.hp);
    player.hp += healing;
    return { label: item.label, healing };
  }
  player.buffs.set(item.id, { ...item, until: now + item.duration });
  return { label: item.label, duration: item.duration };
}

function consumeRune(player, now) {
  if (!(player.buffs.get('rune')?.until > now)) return false;
  return player.buffs.delete('rune');
}

module.exports = { generateChests, quality, activeBuffs, modifiers, openChest, consumeRune,
  interactRange, inRange, shockwave, inventorySize, useItem };
