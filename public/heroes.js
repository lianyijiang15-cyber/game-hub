'use strict';

// Shared by the browser and the authoritative combat simulation.
const heroes = {
  warrior: { job: 'warrior', name: '赤盾衛', trait: '均衡前鋒', description: '以劍盾封鎖通道，擅長近身纏鬥。', color: '#d2694c' },
  archer: { job: 'archer', name: '翠林獵手', trait: '長弓游擊', description: '以移動速度拉開距離，三重箭適合封住小徑。', color: '#83bc6e' },
  mage: { job: 'mage', name: '紫焰術師', trait: '範圍爆發', description: '火球撞擊後會爆炸，適合打擊聚集的敵人。', color: '#af76e0' },
  frostguard: { job: 'warrior', name: '霜甲騎士', trait: '重甲守護', description: '生命與防禦更高，移速與普攻傷害較低。', color: '#7abcea',
    stats: { hp: 980, defense: 55, speed: 133, damage: 76 } },
  berserker: { job: 'warrior', name: '銅斧狂戰士', trait: '近戰猛攻', description: '揮舞重斧提高傷害與攻擊距離，護甲較低。', color: '#f49949',
    stats: { hp: 700, defense: 18, speed: 164, range: 65, damage: 114, cooldown: 720, skillDamage: 162 } },
  scout: { job: 'archer', name: '疾風斥候', trait: '快速連射', description: '跑得最快，普攻間隔更短，但射程與傷害較低。', color: '#4fd9bd',
    stats: { hp: 540, defense: 9, speed: 211, range: 180, damage: 60, cooldown: 540 } },
  marksman: { job: 'archer', name: '暮弦狙手', trait: '遠距重弩', description: '以最遠普攻射程及高傷害牽制對手，移動與射擊較慢。', color: '#d5658b',
    stats: { hp: 580, speed: 161, range: 286, damage: 101, cooldown: 1120, skillDamage: 60 } },
  frostmage: { job: 'mage', name: '冰晶詠者', trait: '冰爆控場', description: '冰彈爆炸範圍較大，被擊中的對手會短暫減速。', color: '#65d8f4',
    stats: { hp: 620, defense: 15, speed: 156, damage: 75, skillDamage: 103, blast: 84, slow: true } },
  stormmage: { job: 'mage', name: '雷鳴使', trait: '高速雷擊', description: '移動與投射物速度更快，技能冷卻較短，生命值較低。', color: '#f7cd58',
    stats: { hp: 490, speed: 180, range: 211, cooldown: 790, skillCooldown: 3900, projectileSpeed: 500, blast: 48 } }
};
const heroAtlasOrder = ['warrior', 'frostguard', 'berserker', 'archer', 'scout', 'marksman', 'mage', 'frostmage', 'stormmage'];

if (typeof module !== 'undefined') module.exports = { heroes, heroAtlasOrder };
