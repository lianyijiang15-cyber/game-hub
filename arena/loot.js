'use strict';

const { campOffset } = require('./world');
const { terrainBlocked } = require('./collision');

const chestCount = 48;
const inventorySize = 5;
const chestSpacing = 160;
const interactRange = 54;
const campClearance = 320;
const objectiveClearance = 112;
const shockwave = { range: 112, healthRatio: .05, attackRatio: .80 };

const loot = {
  common: [
    { id: 'potion', label: '生命藥水', healRatio: .15 },
    { id: 'haste', label: '速度藥水', duration: 8000, speed: 1.18 },
    { id: 'minorPower', label: '小型攻擊增益', duration: 8000, attack: 1.18 }
  ],
  rare: [
    { id: 'guard', label: '防禦提升', duration: 10000, defense: 30 },
    { id: 'greaterPotion', label: '強效治療', healRatio: .30 },
    { id: 'power', label: '攻擊強化', duration: 10000, attack: 1.30 }
  ],
  legendary: [
    { id: 'shield', label: '無敵護盾', duration: 3000, immune: true },
    { id: 'fury', label: '狂暴效果', duration: 7000, attack: 1.35, speed: 1.22 },
    { id: 'rune', label: '震波符文 [R]', duration: 18000, skill: true }
  ]
};

function describeItem(item, maxHp) {
  if (item.healRatio) return `立即回復最大生命值的 ${Math.round(item.healRatio * 100)}%（${Math.round(maxHp * item.healRatio)} HP，上限為滿血）`;
  const duration = item.duration / 1000;
  if (item.skill) return `${duration} 秒內可按 R 施放一次震波，半徑 ${shockwave.range} px，基礎傷害為自身最大生命值的 ${shockwave.healthRatio * 100}% 加基礎普攻的 ${shockwave.attackRatio * 100}%`;
  const effects = [];
  if (item.attack) effects.push(`傷害 +${Math.round((item.attack - 1) * 100)}%`);
  if (item.speed) effects.push(`移速 +${Math.round((item.speed - 1) * 100)}%`);
  if (item.defense) effects.push(`防禦 +${item.defense}`);
  if (item.immune) effects.push('免疫傷害');
  return `${duration} 秒內${effects.join('、')}`;
}

const inRange = (a, b, range) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= range ** 2;

function quality(roll) {
  if (roll < 0.70) return 'common';
  if (roll < 0.95) return 'rare';
  return 'legendary';
}

function generateChests(world, random = Math.random, { camps, objectives = [] } = {}) {
  const candidates = [];
  const spawnCamps = camps ?? [-campOffset, campOffset].map(offset => ({ x: world.width / 2 + offset, y: world.height / 2 }));
  for (let row = 1; row < world.rows - 1; row++) {
    for (let col = 1; col < world.columns - 1; col++) {
      const point = { x: (col + 0.5) * world.tileSize, y: (row + 0.5) * world.tileSize };
      if (terrainBlocked(world, point.x, point.y) || spawnCamps.some(camp => inRange(camp, point, campClearance)) ||
          objectives.some(object => inRange(object, point, objectiveClearance))) continue;
      candidates.push(point);
    }
  }
  const chests = [];
  const limit = world.scene ? 80 : chestCount;
  while (candidates.length && chests.length < limit) {
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
  player.chestsOpened = (player.chestsOpened ?? 0) + 1;
  const rewards = loot[chest.quality];
  const item = rewards[Math.floor(random() * rewards.length)];
  player.inventory[slot] = { ...item, quality: chest.quality };
  return { label: item.label, slot };
}

function useItem(player, slot, maxHp, now) {
  const item = player.inventory[slot];
  if (!item) return { error: '這個欄位沒有道具' };
  if (item.healRatio && player.hp >= maxHp) return { error: '生命值已滿' };
  player.inventory[slot] = null;
  if (item.healRatio) {
    const healing = Math.min(Math.round(maxHp * item.healRatio), maxHp - player.hp);
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
  interactRange, objectiveClearance, inRange, shockwave, inventorySize, useItem, describeItem };
