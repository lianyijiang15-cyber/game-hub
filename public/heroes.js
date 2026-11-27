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

// Previous characters remain available to old match records.
const playableHeroes = {
  sky: { job: 'warrior', role: 'commander', name: '斯蓋', color: '#e75953', hp: 8000, speed: 600, damage: 100, skills: [
    ['反彈護盾', 10, '持續 5 秒，減傷 40% 並反彈 10% 傷害。'],
    ['速度強化', 8, '3 秒內移速增加 25%。'],
    ['隱身', 12, '5 秒內敵方看不見或鎖定你，每秒回復最大生命值的 4%。']
  ] },
  oshi: { job: 'mage', role: 'commander', name: '歐希', color: '#85a6f9', hp: 10000, speed: 530, damage: 100, skills: [
    ['定身敵人', 15, '指定敵人並定身 2 秒。', 'enemy'],
    ['速度強化', 5, '2 秒內移速增加 30%。'],
    ['虛無', 35, '2 秒內免疫所有傷害。']
  ] },
  frost: { job: 'warrior', role: 'commander', name: '福瑞斯', color: '#7be3df', hp: 6800, speed: 650, damage: 150, skills: [
    ['護盾', 13, '4 秒內減傷 30%。'],
    ['擊退中斷', 15, '指定附近最近三名敵人之一，擊退並中斷技能。', 'enemy'],
    ['隊友瞬移', 15, '瞬移到指定隊友身旁。', 'ally']
  ] },
  sain: { job: 'mage', role: 'support', name: '塞恩', color: '#ffd491', hp: 6000, speed: 800, damage: 90, skills: [
    ['雙人護盾', 10, '為自己與指定隊友提供 3 秒、30% 減傷。', 'ally'],
    ['治療', 9, '回復指定隊友最大生命值的 15%。', 'ally'],
    ['牽引', 25, '拉近附近最近三名敵人之一，並使其免傷 1 秒。', 'enemy']
  ] },
  kosain: { job: 'mage', role: 'support', name: '科賽恩', color: '#be7ad3', hp: 5300, speed: 700, damage: 160, skills: [
    ['群體治療', 25, '3 秒內每秒為自己與附近三位隊友回復各自最大生命值的 5%。'],
    ['攻擊提升', 9, '指定隊友在 2 秒內提升 11% 攻擊。', 'ally'],
    ['消減增益', 25, '移除附近最近三名敵人之一身上的輔助增益。', 'enemy']
  ] },
  tanjun: { job: 'warrior', role: 'support', name: '探菌', color: '#eca05e', hp: 11000, speed: 500, damage: 250, skills: [
    ['群體加速', 6, '附近最近三位隊友移速增加 25%，持續 3 秒。'],
    ['免疫控制', 15, '指定隊友免控 2 秒。期間若生命低於 15%，回復 10%，觸發一次。', 'ally'],
    ['短暫定身', 5, '定身附近最近三名敵人之一 0.7 秒。', 'enemy']
  ] },
  alpha: { job: 'warrior', role: 'fighter', name: '阿爾法', color: '#f16043', hp: 6500, speed: 1000, damage: 500, skills: [
    ['攻擊爆發', 14, '下一次普攻傷害增加 50%。'],
    ['生命燃燒', 30, '3 秒內每秒扣 200 生命，當前攻擊逐秒乘以 1.3。'],
    ['速度增強', 5, '2 秒內移速增加 30%。']
  ] },
  beta: { job: 'warrior', role: 'fighter', name: '貝塔', color: '#ac95ec', hp: 10000, speed: 460, damage: 650, skills: [
    ['吸收反彈', 20, '選隊友後再指定敵人，2 秒內替隊友承擔 90% 傷害，反彈吸收量的 20%。', 'dual'],
    ['瞬間強擊', 10, '對附近最近三名敵人之一造成目前攻擊力的 130%。', 'enemy'],
    ['切換形態', 45, '第二形態生命 5000、速度 670、攻擊 500。生命分開記錄，任何形態歸零即淘汰。']
  ] },
  gamma: { job: 'archer', role: 'fighter', name: '伽瑪', color: '#ffcb48', hp: 8000, speed: 650, damage: 570, skills: [
    ['換位', 25, '與指定敵人交換位置並定身對方 1 秒，自身獲得 2 秒、50% 減傷護盾。', 'enemy'],
    ['全面增益', 12, '2 秒內增加 12% 攻擊與速度，並減傷 12%。'],
    ['範圍攻擊', 13, '對周圍最近三名敵人各造成目前攻擊力的 50%。']
  ] }
};
const playableOrder = Object.keys(playableHeroes);
Object.assign(heroes, playableHeroes);
if (typeof module !== 'undefined') Object.assign(module.exports, { playableHeroes, playableOrder });
