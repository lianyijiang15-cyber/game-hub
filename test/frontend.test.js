'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('frontend scripts preserve soup and route Canvas controls to the arena protocol', async () => {
  const read = name => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
  const elements = new Map();
  const socketHandlers = new Map();
  const keyHandlers = new Map();
  const emitted = [];
  const frames = [];
  let pixelDraws = 0;
  let narration;
  const battleSounds = [];
  const narrationTimers = new Map();
  let wallTime = 100;
  let pointerCapture;
  const canvasContext = {
    fillRect() { pixelDraws++; },
    createRadialGradient() { return { addColorStop() {} }; }
  };
  for (const name of ['save', 'restore', 'translate', 'scale', 'rotate', 'strokeText', 'fillText', 'drawImage',
    'beginPath', 'arc', 'moveTo', 'lineTo', 'stroke']) canvasContext[name] = () => {};

  function element(tagName = 'DIV') {
    const classes = new Set();
    return {
      tagName, hidden: false, children: [], value: '', textContent: '',
      width: 960, height: 576, dataset: {},
      classList: {
        toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
        remove(...names) { for (const name of names) classes.delete(name); },
        contains(name) { return classes.has(name); }
      },
      setAttribute(name, value) { this[name] = value; },
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; },
      setPointerCapture(id) { pointerCapture = id; },
      hasPointerCapture(id) { return pointerCapture === id; },
      releasePointerCapture() { pointerCapture = null; },
      getContext() { return canvasContext; },
      getBoundingClientRect() { return { width: 480, height: 288, left: 0, top: 0 }; },
      matches() { return false; },
      blur() {},
      showModal() { this.open = true; },
      close() { this.open = false; },
      focus() { this.onfocus?.(); }
    };
  }
  for (const [, id] of read('index.html').matchAll(/id="([^"]+)"/g)) elements.set(id, element());
  const hostPlayer = { id: 'self', name: 'Tester', job: 'warrior', ready: false, bot: false, avatar: 'data:image/jpeg;base64,photo' };
  const bot = index => ({ id: 'bot-' + index, name: 'AI ' + index, job: 'archer', ready: true, bot: true, lobbyHero: 'sain', botPersona: 7 });
  const roster = { id: 'ABCDE0', host: 'self', phase: 'lobby', size: 10, players: [hostPlayer] };
  const socket = {
    id: 'self', connected: true,
    on(event, handler) { socketHandlers.set(event, handler); },
    emit(...args) { emitted.push(args); },
    timeout() {
      return { emit(event, ...args) {
        emitted.push([event, ...args.slice(0, -1)]);
        if (event === 'lootOpen') return args.at(-1)(null, args[0] === 1
          ? { reward: { label: '生命藥水', slot: 0 } } : { error: '寶箱已領取' });
        if (event === 'lootUse') return args.at(-1)(null, { reward: { label: '生命藥水', healing: 15 } });
        if (event === 'arenaAttack') return args.at(-1)(null, { now: wallTime, attackAt: wallTime + 650 });
        if (event === 'addBot') roster.players.push(bot(1));
        if (event === 'fillBots') while (roster.players.length < 10) roster.players.push(bot(roster.players.length));
        if (event === 'chooseClass') {
          hostPlayer.hero = args[0];
          hostPlayer.job = require('../public/heroes').heroes[args[0]].job;
          hostPlayer.ready = false;
        }
        if (event === 'ready') hostPlayer.ready = !hostPlayer.ready;
        if (event === 'start') {
          const waiting = roster.phase === 'lobby';
          roster.phase = waiting ? 'selection' : 'loading';
          roster.loadingRemaining = 3500;
          roster.players.forEach((p, i) => { p.team = i < 5 ? '紅隊' : '藍隊'; });
          if (waiting) hostPlayer.ready = false;
        }
        args.at(-1)(null, { id: 'ABCDE0', room: roster });
      } };
    },
    volatile: { emit(...args) { emitted.push(args); } }
  };

  const context = vm.createContext({
    io: () => socket,
    document: {
      getElementById: id => elements.get(id),
      querySelector: () => element('HEADER'),
      createElement: tag => element(tag.toUpperCase()),
      addEventListener() {},
      activeElement: null
    },
    window: {
      addEventListener(event, handler) { keyHandlers.set(event, handler); },
      matchMedia() { return { matches: true }; },
      playGameSound(name) { battleSounds.push(name); },
      SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
      speechSynthesis: {
        getVoices: () => [{ lang: 'zh-TW' }],
        speak: clip => { narration = clip; },
        cancel: () => { narration = null; }
      }
    },
    sessionStorage: { getItem() {}, setItem() {}, removeItem() {} },
    performance: { now: () => wallTime },
    requestAnimationFrame: callback => frames.push(callback),
    setTimeout(callback, delay) { narrationTimers.set(callback, delay); return callback; },
    clearTimeout(callback) { narrationTimers.delete(callback); },
    setInterval() {}
  });
  for (const script of ['soup-bank.js', 'heroes.js', 'app.js', 'arena-renderer.js', 'menu-art.js', 'arena-guide.js']) vm.runInContext(read(script), context);
  assert.ok(pixelDraws > 0);
  context.show('title-screen');
  elements.get('title-start').onclick();
  assert.equal(elements.get('title-screen').hidden, true);
  assert.equal(elements.get('home').hidden, false);
  elements.get('menu-back').onclick();
  assert.equal(elements.get('title-screen').hidden, false);
  keyHandlers.get('keydown')({ code: 'Enter', preventDefault() {} });
  assert.equal(elements.get('title-screen').hidden, true);
  assert.equal(elements.get('home').hidden, false);
  const beforeMap = pixelDraws;
  context.drawMapPreview(elements.get('title-map'), require('../arena/combat').map, 0.5, 0.5);
  assert.ok(pixelDraws > beforeMap);
  assert.equal(vm.runInContext('arenaCamera.x + arenaCamera.y', context), 0);
  // Separate cameras own their positions, even when driven by the same map and clock.
  vm.runInContext(`
    const cameraMap = { width: 3200, height: 3200 };
    const firstCamera = createArenaCamera();
    const secondCamera = createArenaCamera();
    const firstPlayer = { id: 'first', spawnedAt: 0 };
    const secondPlayer = { id: 'second', spawnedAt: 0 };
    firstCamera.follow({ x: 1000, y: 1200 }, firstPlayer, cameraMap, 960, 600, 100);
    secondCamera.follow({ x: 2200, y: 2000 }, secondPlayer, cameraMap, 960, 600, 100);
    firstCamera.follow({ x: 1300, y: 1200 }, firstPlayer, cameraMap, 960, 600, 116);
  `, context);
  assert.ok(vm.runInContext('firstCamera.x > 520 && firstCamera.x < 820', context));
  assert.equal(vm.runInContext('secondCamera.x', context), 1720);
  assert.equal(vm.runInContext('secondCamera.y', context), 1700);
  vm.runInContext(`
    firstCamera.follow({ x: 3190, y: 3190 }, { ...firstPlayer, spawnedAt: 200 }, cameraMap, 800, 500, 200);
    secondCamera.follow({ x: 1, y: 1 }, { ...secondPlayer, spawnedAt: 200 }, cameraMap, 800, 500, 200);
  `, context);
  assert.equal(vm.runInContext('firstCamera.x', context), 2400);
  assert.equal(vm.runInContext('firstCamera.y', context), 2700);
  assert.equal(vm.runInContext('secondCamera.x + secondCamera.y', context), 0);
  assert.equal(vm.runInContext(`
    firstCamera.follow({ x: 3190, y: 3190 }, { ...firstPlayer, spawnedAt: 200 }, cameraMap, 3200, 3200, 216);
    firstCamera.x + firstCamera.y;
  `, context), 0);
  assert.equal(vm.runInContext("stories.length", context), vm.runInContext("extraStories.length + 2", context));
  elements.get('menu-soup').onclick();
  assert.equal(elements.get('soup').hidden, false);
  assert.equal(elements.get('soup-levels').hidden, false);
  elements.get('soup-hard').onclick();
  assert.equal(elements.get('soup-comic').hidden, false);
  assert.equal(elements.get('soup-difficulty').textContent, '困難');
  assert.ok(elements.get('soup').dataset.case);
  assert.equal(elements.get('comic-page-count').textContent, '1 / 2');
  assert.ok(elements.get('comic-caption').textContent);
  assert.equal(elements.get('soup-investigation').hidden, true);
  elements.get('comic-start').onclick();
  assert.equal(elements.get('soup-investigation').hidden, true);
  elements.get('comic-next').onclick();
  assert.equal(elements.get('comic-page-count').textContent, '2 / 2');
  elements.get('comic-narration').onclick();
  assert.ok(elements.get('comic-caption').textContent.startsWith(narration.text));
  assert.ok(narration.rate < 1);
  assert.equal(narration.voice.lang, 'zh-TW');
  elements.get('comic-narration').onclick();
  vm.runInContext("soupPanels[soupPage] = '門口傳來腳步聲。忽然，腳步聲停止了……'", context);
  elements.get('comic-narration').onclick();
  const firstPhrase = narration;
  assert.equal(firstPhrase.text, '門口傳來腳步聲。');
  firstPhrase.onend();
  const [nextPhrase, pause] = [...narrationTimers][0];
  assert.equal(pause, 230);
  narrationTimers.delete(nextPhrase);
  nextPhrase();
  assert.equal(narration.text, '忽然，腳步聲停止了……');
  assert.ok(narration.rate < firstPhrase.rate && narration.pitch < firstPhrase.pitch);
  // Restore the case before verifying the reference captions.
  vm.runInContext('soupPanels = soupView(soup).panels', context);
  elements.get('comic-previous').onclick();
  assert.equal(narration, null);
  assert.equal(elements.get('comic-page-count').textContent, '1 / 2');
  elements.get('comic-next').onclick();
  elements.get('comic-start').onclick();
  assert.equal(elements.get('soup-investigation').hidden, false);
  assert.ok(elements.get('soup-story').textContent);
  assert.equal(elements.get('soup-investigation-layout').hidden, false);
  const panels = elements.get('soup-reference-pages').children;
  assert.deepEqual(Array.from(panels, panel => panel.children[0].dataset.page), ['0', '1']);
  assert.ok(panels.every(panel => panel.children[1].textContent.length > 0));
  assert.equal(panels[1].children[1].textContent, elements.get('comic-caption').textContent);
  const questions = ['這件事發生在晚上嗎？', '人物是獨自一人嗎？'];
  const log = elements.get('soup-question-log');
  for (const question of questions) {
    elements.get('question').value = question;
    await context.askSoup();
    assert.equal(log.children.at(-1).children[1].textContent, elements.get('answer').textContent);
  }
  assert.deepEqual(log.children.map(row => row.children[0].textContent), questions);
  assert.equal(elements.get('soup-no-questions').hidden, true);
  context.hint();
  assert.match(elements.get('answer').textContent, /提示/);
  assert.equal(elements.get('hints').textContent, 2);
  context.reveal();
  assert.ok(elements.get('soup-end').textContent);
  elements.get('soup-reread').onclick();
  assert.equal(elements.get('comic-page-count').textContent, '1 / 2');
  elements.get('comic-next').onclick();
  elements.get('comic-start').onclick();
  assert.equal(elements.get('hints').textContent, 2);
  assert.equal(log.children.length, 2);
  elements.get('soup-next-case').onclick();
  assert.equal(log.children.length, 0);
  assert.equal(elements.get('soup-comic').hidden, false);
  assert.equal(elements.get('soup-difficulty').textContent, '困難');
  elements.get('soup-level-back').onclick();
  assert.equal(elements.get('soup-levels').hidden, false);

  context.home();
  elements.get('menu-arena').onclick();
  assert.equal(elements.get('modes').hidden, false);
  for (const [mode, name, caption] of [
    ['flag', '拔旗戰', '己方圈內'], ['survival', '生存戰', '陷阱'], ['control', '據點戰', '進度條']
  ]) {
    elements.get('mode-' + mode).onclick();
    assert.equal(elements.get('lobby-mode').textContent, name);
    assert.equal(elements.get('room-guide').hidden, false);
    elements.get('room-guide').onclick();
    assert.equal(elements.get('mode-guide').open, true);
    assert.equal(elements.get('guide-title').textContent, name + '玩法介紹');
    assert.match(elements.get('guide-caption').textContent, new RegExp(caption));
    const guideSteps = elements.get('guide-steps').children;
    assert.ok(guideSteps.length >= 3);
    assert.equal(guideSteps.at(-1).children[0].textContent, '寶箱與道具');
    if (mode === 'flag') assert.doesNotMatch(guideSteps.flatMap(row => row.children).map(node => node.textContent).join(' '), /草藥|毒氣|毒霧|解藥/);
    const pixelsBeforeGuide = pixelDraws;
    context.paintGuideScene(mode, require('../arena/combat').map);
    assert.ok(pixelDraws > pixelsBeforeGuide);
    elements.get('guide-close').onclick();
    assert.equal(elements.get('mode-guide').open, false);
  }
  elements.get('mode-deathmatch').onclick();
  assert.equal(elements.get('room-guide').hidden, true);
  assert.equal(elements.get('lobby').hidden, false);
  elements.get('nickname').value = 'Tester';
  context.createRoom();
  assert.equal(elements.get('room-id').textContent, 'ABCDE0');
  assert.equal(elements.get('bot-controls').hidden, false);
  const ownTile = elements.get('players').children[0];
  assert.equal(ownTile.children[0].tagName, 'IMG');
  assert.equal(ownTile.children[0].src, hostPlayer.avatar);
  ownTile.children[0].onerror();
  assert.equal(ownTile.children[0].src, '/art/heroes/sky-portrait.webp');
  elements.get('add-bot').onclick();
  assert.equal(emitted.at(-1)[0], 'addBot');
  const botPortrait = elements.get('players').children[1].children[0];
  assert.match(botPortrait.className, /bot-portrait/);
  assert.match(botPortrait.style, /--portrait-x:50%.*--portrait-y:33/);
  assert.match(botPortrait.style, /sain-portrait.webp/);
  assert.equal(elements.get('bot-summary').textContent, '1 名 AI · 8 個空位');
  elements.get('fill-bots').onclick();
  assert.equal(emitted.at(-1)[0], 'fillBots');
  assert.equal(elements.get('bot-summary').textContent, '9 名 AI · 0 個空位');
  assert.equal(elements.get('fill-bots').disabled, true);
  assert.equal(elements.get('class-profile').hidden, true);
  assert.equal(elements.get('game').classList.contains('in-lobby'), true);
  assert.equal(elements.get('lobby-start').disabled, true);
  elements.get('lobby-ready').onclick();
  assert.equal(elements.get('lobby-start').disabled, false);
  elements.get('lobby-start').onclick();
  assert.equal(elements.get('class-profile').hidden, false);
  assert.equal(elements.get('room-waiting').hidden, true);
  assert.equal(elements.get('game').classList.contains('in-lobby'), false);
  assert.equal(elements.get('chat-title').textContent, '隊伍聊天');
  assert.equal(elements.get('selection-team').children.length, 5);
  assert.equal(elements.get('start').disabled, true);
  elements.get('class-next').onclick();
  assert.deepEqual(emitted.at(-1), ['chooseClass', 'oshi']);
  assert.equal(elements.get('class-art').src, '/art/heroes/oshi-portrait.webp');
  assert.equal(elements.get('class-name').textContent, '歐希');
  assert.equal(elements.get('class-hp').textContent, '10000 HP');
  assert.equal(elements.get('class-oshi').dataset.position, 'center');
  assert.equal(elements.get('class-sky').dataset.position, 'left');
  assert.equal(elements.get('class-alpha').hidden, true);
  elements.get('hero-supports').onclick();
  assert.equal(elements.get('class-hp').textContent, '6000 HP');
  assert.equal(elements.get('selection-team').children[0].children[0].src, '/art/heroes/sain-portrait.webp');
  elements.get('class-kosain').onclick();
  assert.equal(elements.get('class-art').src, '/art/heroes/kosain-portrait.webp');
  elements.get('ready').onclick();
  assert.deepEqual(emitted.at(-1), ['ready']);
  assert.equal(elements.get('class-next').disabled, true);
  assert.equal(elements.get('start').disabled, false);
  elements.get('start').onclick();
  assert.deepEqual(emitted.at(-1), ['start']);
  assert.equal(elements.get('match-loading').hidden, false);
  assert.equal(elements.get('game').classList.contains('in-loading'), true);
  assert.equal(elements.get('battle').hidden, true);
  assert.equal(elements.get('loading-blue').children.length, 5);
  assert.equal(elements.get('loading-red').children.length, 5);
  assert.equal(elements.get('loading-red').children[0].children[0].src, '/art/heroes/kosain-model.webp');
  const player = {
    id: 'self', name: 'Tester', job: 'mage', hero: 'kosain', team: '紅隊', x: 1600, y: 1400, hp: 5300, maxHp: 5300,
    alive: true, facing: 0, attackAt: 0, skillAt: 0, spawnedAt: 0
  };
  socketHandlers.get('room')({ id: 'ABCDE0', host: 'self', players: [player], phase: 'playing' });
  socketHandlers.get('arenaMap')({ id: 'ABCDE0', map: require('../arena/world').generateWorld() });
  assert.equal(elements.get('match-loading').hidden, true);
  assert.equal(elements.get('game').classList.contains('in-loading'), false);
  assert.equal(elements.get('battle').hidden, false);
  socketHandlers.get('arenaState')({
    id: 'ABCDE0', now: 100, phase: 'playing', mode: 'control', remaining: 299900,
    scenario: { mode: 'control', points: [], pointCount: 5 },
    players: [player], inventory: [{ id: 'rune', quality: 'legendary', label: '震波符文 [R]' }],
    effects: [], kills: [], projectiles: [], score: { 紅隊: 0, 藍隊: 0 }
  });
  const slot = elements.get('loot-1');
  assert.equal(elements.get('loot-slots').hidden, false);
  assert.equal(slot.dataset.item, 'rune');
  assert.equal(slot.children[1].className, 'loot-icon');
  assert.match(slot['aria-label'], /震波符文/);
  context.lootCommand('lootOpen', 1);
  context.lootCommand('lootOpen', 2);
  context.lootCommand('lootUse', 0);
  assert.deepEqual(battleSounds, ['chest', 'heal']);
  socketHandlers.get('arenaState')({
    id: 'ABCDE0', now: 100, phase: 'playing', remaining: 299900, players: [player],
    effects: [], kills: [], projectiles: [], score: { 紅隊: 0, 藍隊: 0 }
  });
  frames.shift()(115);
  assert.ok(pixelDraws > 100);
  assert.match(elements.get('health').textContent, /科賽恩 · HP 5300\/5300/);
  const arena = elements.get('arena');
  const keyboard = code => ({ code, target: element('BODY'), preventDefault() {} });
  keyHandlers.get('keydown')(keyboard('KeyD'));
  assert.equal(emitted.at(-1)[0], 'arenaInput');
  assert.equal(emitted.at(-1)[1].x, 1);
  keyHandlers.get('keyup')(keyboard('KeyD'));
  assert.equal(emitted.at(-1)[1].x, 0);
  const pad = elements.get('touch-movement');
  assert.equal(pad.hidden, false);
  const touch = { pointerId: 7, pointerType: 'touch', clientX: 400, clientY: 144, preventDefault() {} };
  pad.onpointerdown(touch);
  assert.deepEqual(Array.from(Object.values(emitted.at(-1)[1])), [1, 0]);
  pad.onpointermove({ ...touch, clientX: 240, clientY: 40 });
  assert.equal(emitted.at(-1)[1].y, -1);
  pad.onpointercancel(touch);
  assert.deepEqual(Array.from(Object.values(emitted.at(-1)[1])), [0, 0]);
  assert.equal(pointerCapture, null);
  arena.onpointerdown({ button: 0, clientX: 90, clientY: 45 });
  assert.equal(emitted.at(-1)[0], 'arenaAttack');
  assert.equal(emitted.at(-1)[1].x, vm.runInContext('arenaCamera.x + 180 / arenaZoom', context));
  assert.equal(emitted.at(-1)[1].y, vm.runInContext('arenaCamera.y + 90 / arenaZoom', context));
  assert.ok(vm.runInContext('arenaZoom > 1', context));
  assert.equal(emitted.at(-1)[1].skill, false);
  const firstAttack = emitted.length;
  const savedDeadline = vm.runInContext('attackDeadline.local', context);
  wallTime = 190;
  arena.onpointerdown({ button: 0, clientX: 90, clientY: 45 });
  assert.equal(emitted.length, firstAttack);
  vm.runInContext('syncAttackDeadline(750, 110)', context);
  assert.equal(vm.runInContext('attackDeadline.local', context), savedDeadline);
  keyHandlers.get('keydown')(keyboard('KeyQ'));
  assert.equal(emitted.at(-1)[0], 'heroSkill');
  assert.equal(emitted.at(-1)[1].slot, 0);
  keyHandlers.get('keydown')(keyboard('Enter'));
  assert.equal(emitted.at(-1)[0], 'arenaInput');
  assert.equal(emitted.at(-1)[1].x, 0);
  const ally = { id: 'ally', name: '遠方隊友', job: 'warrior', hero: 'sky', team: '紅隊', x: 2280, y: 1780, hp: 4300, maxHp: 8000, alive: true };
  socketHandlers.get('arenaState')({
    id: 'ABCDE0', now: 120, phase: 'playing', mode: 'survival', remaining: 299880,
    players: [{ ...player, alive: false, hp: 0 }, ally], teammates: [ally],
    effects: [{ type: 'hero-skill', appearance: 'heal', x: 1600, y: 1400, tint: '#91ffb2', until: 810 }],
    kills: [], projectiles: [], score: { 紅隊: 0, 藍隊: 0 }
  });
  elements.get('map-preview').onclick();
  assert.equal(elements.get('tactical-overlay').hidden, false);
  elements.get('map-close').onclick();
  assert.equal(elements.get('tactical-overlay').hidden, true);
  elements.get('map-toggle').onclick();
  keyHandlers.get('keydown')(keyboard('Escape'));
  assert.equal(elements.get('tactical-overlay').hidden, true);
  const vitals = elements.get('team-vitals').children[0];
  const watch = vitals.children[0];
  assert.equal(watch.children[0].src, '/art/heroes/sky-portrait.webp');
  assert.equal(watch.disabled, false);
  watch.onclick();
  assert.equal(watch['aria-pressed'], 'true');
  assert.equal(vitals.children[1].children[1].value, 4300);
  frames.shift()(200);
  assert.match(elements.get('respawn').textContent, /已淘汰/);
  assert.equal(elements.get('respawn').hidden, false);
  const initialCamera = vm.runInContext('arenaCamera.x', context);
  assert.equal(initialCamera, Math.round(ally.x - arena.width / 1.38 / 2));
  const initialMessages = emitted.length;
  keyHandlers.get('keydown')(keyboard('ArrowRight'));
  assert.equal(watch['aria-pressed'], 'false');
  frames.shift()(220);
  keyHandlers.get('keyup')(keyboard('ArrowRight'));
  assert.ok(vm.runInContext('arenaCamera.x', context) > initialCamera);
  assert.equal(emitted.length, initialMessages);
  wallTime = 5180;
  socketHandlers.get('arenaState')({
    id: 'ABCDE0', now: 5110, phase: 'playing', mode: 'survival', remaining: 294890,
    players: [{ ...player, alive: false, hp: 0 }, ally], teammates: [ally],
    effects: [], kills: [], projectiles: [], score: { 紅隊: 0, 藍隊: 0 }
  });
  frames.shift()(5189);
  assert.equal(elements.get('respawn').hidden, false);
  frames.shift()(5190);
  assert.equal(elements.get('respawn').hidden, true);
  assert.deepEqual(battleSounds, ['chest', 'heal', 'death']);
  watch.onclick();
  assert.equal(watch['aria-pressed'], 'true');
  socketHandlers.get('arenaState')({
    id: 'ABCDE0', phase: 'ended', winner: '紅隊', mvp: 'self', score: { 紅隊: 7, 藍隊: 2 },
    teamAwards: { 紅隊: { mvp: 'self', lowestKda: 'red-low' }, 藍隊: { mvp: 'blue-mvp', lowestKda: 'blue-low' } },
    results: [
      { ...player, kills: 5, deaths: 1, assists: 3, damage: 1100 },
      { ...player, id: 'red-low', name: 'Red Low', kills: 0, deaths: 6, assists: 0, damage: 110 },
      { ...player, id: 'blue-mvp', team: '藍隊', name: 'Blue MVP', kills: 2, deaths: 2, assists: 2, damage: 750 },
      { ...player, id: 'blue-low', team: '藍隊', name: 'Blue Low', kills: 0, deaths: 3, assists: 0, damage: 75 }
    ]
  });
  assert.equal(elements.get('mvp-portrait').src, '/art/heroes/kosain-model.webp');
  assert.equal(elements.get('mvp-name').textContent, 'Tester');
  assert.equal(elements.get('red-outcome').textContent, '勝利');
  assert.equal(elements.get('blue-outcome').textContent, '敗北');
  assert.deepEqual(elements.get('results-red').children[0].children.slice(1).map(cell => cell.textContent),
    ['5', '1', '3', '1100']);
  assert.equal(vm.runInContext('JSON.stringify(minimapView({width: 3200, height: 3200}, {x: 1300, y: 1600}))', context),
    '{"x":900,"y":1200,"width":800,"height":800}');
  assert.equal(vm.runInContext('JSON.stringify(minimapView({width: 3200, height: 3200}, {x: 10, y: 3190}))', context),
    '{"x":0,"y":2400,"width":800,"height":800}');
  assert.ok(!read('index.html').includes('<video'));
  assert.match(elements.get('mvp-kda').textContent, /5 \/ 1 \/ 3/);
  assert.equal(elements.get('results-red').children[0].dataset.mvp, 'true');
  assert.equal(elements.get('results-red').children[1].dataset.lowestKda, 'true');
  assert.equal(elements.get('results-blue').children[0].dataset.mvp, 'true');
  assert.equal(elements.get('results-blue').children[1].dataset.lowestKda, 'true');

});

test('account menu presents registration, achievements, detailed records and friends', async () => {
  const read = name => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
  function node() {
    return {
      value: '', children: [], focus() {},
      removeAttribute(name) { delete this[name]; },
      setAttribute(name, value) { this[name] = value; },
      showModal() { this.open = true; },
      close() { this.open = false; this.onclose?.(); },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; }
    };
  }
  const elements = new Map([...read('index.html').matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, node()]));
  const find = id => elements.get(id);
  const calls = [];
  const profile = { id: 'AB123456', name: '冒險者' };
  const opponent = { id: 'CD654321', name: '弓箭手' };
  const responses = {
    session: { username: null, profile: null },
    register: { ok: true },
    login: { username: 'Player7', profile: null },
    profile: { profile },
    achievements: {
      arena: [{ rarity: 'hidden', hint: '在樹根旁找找。', count: 0, goal: 1 },
        ...Array.from({ length: 6 }, (_, index) => ({ description: '戰場任務 ' + (index + 1), count: 0, goal: 1 }))],
      soup: [{ title: '初露鋒芒', description: '解開一題', reward: '入門偵探徽章', count: 1, goal: 1 }]
    },
    history: { arena: [], soup: [{ id: 'saved-soup', title: '第一題', result: 'solved', hints: 0, date: '2026-01-01T00:00:00Z' }] },
    'history/saved-soup': { kind: 'soup', title: '第一題', result: 'solved', hints: 0, date: '2026-01-01T00:00:00Z' },
    friends: { friends: [], incoming: [], sent: [opponent] },
    'friends/request': { player: opponent },
    logout: { ok: true }
  };
  let openedArena = false;
  const pageSounds = [];
  const pageAnimations = [];
  find('achievement-turn').animate = frames => { pageAnimations.push(frames); return { cancel() {} }; };
  const context = vm.createContext({
    window: { playGameSound: name => pageSounds.push(name) },
    $: find, AbortSignal, openModes() { openedArena = true; }, openSoup() {},
    socket: { disconnect() { return this; }, connect() {} },
    element(_tag, text) { return { ...node(), textContent: text }; },
    async fetch(url, options) {
      const route = url.replace('/api/account/', '');
      calls.push([route, options.body && JSON.parse(options.body)]);
      return { ok: true, json: async () => responses[route] };
    }
  });
  for (const script of ['account.js', 'player-panel.js']) vm.runInContext(read(script), context);

  await find('menu-history').onclick();
  assert.equal(find('account-dialog').open, true);
  find('account-register').onclick();
  find('account-username').value = 'Player7';
  find('account-password').value = 'My pixel adventure!';
  const event = { preventDefault() {} };
  await find('account-form').onsubmit(event);
  assert.match(find('account-message').textContent, /不一致/);
  find('account-confirm').value = 'My pixel adventure!';
  await find('account-form').onsubmit(event);
  assert.match(find('account-message').textContent, /註冊成功/);
  find('account-password').value = 'My pixel adventure!';
  await find('account-form').onsubmit(event);
  assert.equal(find('account-name-form').hidden, false);
  find('account-dialog').close();
  await find('menu-arena').onclick();
  assert.equal(openedArena, false);
  find('account-player-name').value = profile.name;
  await find('account-name-form').onsubmit(event);
  assert.equal(find('account-player-id').textContent, profile.id);
  assert.equal(find('profile-name').textContent, profile.name);
  find('account-dialog').close();
  await find('menu-arena').onclick();
  assert.equal(openedArena, true);

  await find('menu-history').onclick();
  assert.equal(find('player-title').textContent, '成就圖鑑');
  assert.equal(find('player-history').hidden, true);
  assert.equal(find('achievement-summary').textContent, '已解鎖 1 / 8 · 金幣 0');
  assert.equal(find('arena-achievements').children[0]['data-unlocked'], 'false');
  assert.equal(find('soup-achievements').children[0]['data-unlocked'], 'true');
  const hiddenBadge = find('arena-achievements').children[0].children[0];
  assert.equal(hiddenBadge.children[0].textContent, '?');
  hiddenBadge.onclick();
  assert.match(find('achievement-detail').children[1].textContent, /樹根/);
  find('soup-achievements').children[0].children[0].onclick();
  assert.match(find('achievement-detail').children[2].textContent, /入門偵探徽章/);
  assert.match(find('soup-achievements').children[0].children[0].children[0].className, /illustrated/);
  assert.equal(find('achievement-prev').disabled, true);
  find('achievement-next').onclick();
  assert.equal(find('achievement-page-index').textContent, '2 / 2');
  assert.equal(find('achievement-next').disabled, true);
  find('arena-achievements').children[0].children[0].onclick();
  assert.equal(find('achievement-detail').children[1].textContent, '戰場任務 6');
  find('player-dialog').onkeydown({ key: 'ArrowLeft', preventDefault() {} });
  assert.equal(find('achievement-page-index').textContent, '1 / 2');
  assert.deepEqual(pageSounds, ['page', 'page']);
  assert.equal(pageAnimations.length, 2);
  await find('achievement-history').onclick();
  const historyButton = find('soup-history').children[0].children[0];
  assert.equal(historyButton.children[0].textContent, '第一題');
  await historyButton.onclick();
  assert.equal(find('history-detail').hidden, false);
  assert.equal(find('history-detail-content').children[0].textContent, '第一題');
  find('history-back').onclick();
  assert.equal(find('player-history').hidden, false);
  await find('history-catalog').onclick();
  assert.equal(find('player-achievements').hidden, false);
  find('player-dialog').close();
  await find('menu-friends').onclick();
  find('friend-by').value = 'id';
  find('friend-query').value = opponent.id;
  await find('friend-form').onsubmit(event);
  assert.ok(calls.some(([route, body]) =>
    route === 'friends/request' && body.by === 'id' && body.query === opponent.id));
  assert.match(find('player-message').textContent, /已送出邀請/);
  assert.match(find('friend-sent').children[0].textContent, /CD654321/);
  find('player-dialog').close();
  find('menu-profile').onclick();
  await find('account-logout').onclick();
  assert.equal(find('profile-name').textContent, '登入／註冊');
});

test('players can send a room invitation and join it through the inbox', async () => {
  const ids = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  function node(textContent = '') {
    return {
      textContent, children: [], append(...items) { this.children.push(...items); },
      replaceChildren() { this.children = []; },
      showModal() { this.open = true; }, close() { this.open = false; }
    };
  }
  const nodes = new Map([...ids.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, node()]));
  const find = id => nodes.get(id);
  const handlers = new Map();
  const sent = [];
  const context = vm.createContext({
    $: find, element: (_tag, text) => node(text),
    room: 'MYROOM', phase: 'lobby', modeNames: { flag: '拔旗戰' },
    setTimeout() {}, clearTimeout() {},
    accountRequest: async () => ({ friends: [{ id: 'AB123456', name: '好友' }] }),
    socket: {
      connected: false, on(name, cb) { handlers.set(name, cb); },
      timeout: () => ({ emit(name, ...args) {
        sent.push([name, ...args.slice(0, -1)]);
        args.at(-1)(null, name === 'listRoomInvites' ? { invites: [] } : { ok: true });
      } })
    },
    enter(name, { id, accept }, done) { sent.push([name, id, accept]); done(); }
  });
  const source = fs.readFileSync(path.join(__dirname, '../public/room-invites.js'), 'utf8');
  vm.runInContext(source, context);
  context.socket.connected = true;
  await find('lobby-invite').onclick();
  await find('invite-friends').children[0].children[1].onclick();
  assert.deepEqual(sent.at(-1), ['inviteFriend', 'AB123456']);
  assert.match(find('invite-message').textContent, /已邀請/);
  find('invite-close').onclick();
  context.room = null;
  handlers.get('roomInvites')([{ name: '好友', mode: 'flag', id: 'invite-1', expiresAt: Date.now() + 30000 }]);
  assert.equal(find('invite-inbox').hidden, false);
  void find('invite-inbox').onclick();
  const join = find('invite-received').children[0].children[1].children[0];
  join.onclick();
  assert.deepEqual(sent.at(-1), ['replyRoomInvite', 'invite-1', true]);
  assert.equal(find('invite-dialog').open, false);
});
