'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('frontend scripts preserve soup and route Canvas controls to the arena protocol', () => {
  const read = name => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
  const elements = new Map();
  const socketHandlers = new Map();
  const keyHandlers = new Map();
  const emitted = [];
  const frames = [];
  let pixelDraws = 0;
  const canvasContext = {
    fillRect() { pixelDraws++; },
    createRadialGradient() { return { addColorStop() {} }; }
  };
  for (const name of ['save', 'restore', 'translate', 'rotate', 'strokeText', 'fillText', 'drawImage',
    'beginPath', 'arc', 'moveTo', 'lineTo', 'stroke']) canvasContext[name] = () => {};

  function element(tagName = 'DIV') {
    return {
      tagName, hidden: false, children: [], value: '', textContent: '',
      width: 960, height: 576, dataset: {},
      classList: { toggle() {}, remove() {} },
      setAttribute(name, value) { this[name] = value; },
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; },
      getContext() { return canvasContext; },
      getBoundingClientRect() { return { width: 480, height: 288, left: 0, top: 0 }; },
      matches() { return false; },
      blur() {},
      focus() { this.onfocus?.(); }
    };
  }
  for (const [, id] of read('index.html').matchAll(/id="([^"]+)"/g)) elements.set(id, element());
  const hostPlayer = { id: 'self', name: 'Tester', job: 'warrior', ready: false, bot: false };
  const bot = index => ({ id: 'bot-' + index, name: 'AI ' + index, job: 'archer', ready: true, bot: true });
  const roster = { id: 'ABCDE0', host: 'self', phase: 'lobby', size: 10, players: [hostPlayer] };
  const socket = {
    id: 'self', connected: true,
    on(event, handler) { socketHandlers.set(event, handler); },
    emit(...args) { emitted.push(args); },
    timeout() {
      return { emit(event, ...args) {
        emitted.push([event, ...args.slice(0, -1)]);
        if (event === 'addBot') roster.players.push(bot(1));
        if (event === 'fillBots') while (roster.players.length < 10) roster.players.push(bot(roster.players.length));
        if (event === 'chooseClass') {
          hostPlayer.job = args[0];
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
    window: { addEventListener(event, handler) { keyHandlers.set(event, handler); } },
    sessionStorage: { getItem() {}, setItem() {}, removeItem() {} },
    performance: { now: () => 100 },
    requestAnimationFrame: callback => frames.push(callback),
    setInterval() {}
  });
  for (const script of ['soup-bank.js', 'app.js', 'arena-renderer.js']) vm.runInContext(read(script), context);
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
  context.openSoup();
  assert.equal(elements.get('soup').hidden, false);
  assert.ok(elements.get('soup-story').textContent);
  context.hint();
  assert.match(elements.get('answer').textContent, /提示/);
  assert.equal(elements.get('hints').textContent, 2);
  context.reveal();
  assert.ok(elements.get('soup-end').textContent);

  context.openLobby();
  elements.get('nickname').value = 'Tester';
  context.createRoom();
  assert.equal(elements.get('room-id').textContent, 'ABCDE0');
  assert.equal(elements.get('bot-controls').hidden, false);
  elements.get('add-bot').onclick();
  assert.equal(emitted.at(-1)[0], 'addBot');
  assert.equal(elements.get('bot-summary').textContent, '1 名 AI · 8 個空位');
  elements.get('fill-bots').onclick();
  assert.equal(emitted.at(-1)[0], 'fillBots');
  assert.equal(elements.get('bot-summary').textContent, '9 名 AI · 0 個空位');
  assert.equal(elements.get('fill-bots').disabled, true);
  assert.equal(elements.get('class-profile').hidden, true);
  assert.equal(elements.get('lobby-start').disabled, true);
  elements.get('lobby-ready').onclick();
  assert.equal(elements.get('lobby-start').disabled, false);
  elements.get('lobby-start').onclick();
  assert.equal(elements.get('class-profile').hidden, false);
  assert.equal(elements.get('room-waiting').hidden, true);
  assert.equal(elements.get('chat-title').textContent, '隊伍聊天');
  assert.equal(elements.get('selection-team').children.length, 5);
  assert.equal(elements.get('start').disabled, true);
  elements.get('class-next').onclick();
  assert.deepEqual(emitted.at(-1), ['chooseClass', 'archer']);
  assert.equal(elements.get('class-art').src, '/art/archer-key-art.webp');
  assert.equal(elements.get('class-name').textContent, '弓箭手');
  assert.equal(elements.get('selection-team').children[0].children[0].src, '/art/archer-avatar.webp');
  assert.equal(elements.get('class-archer').dataset.position, 'center');
  assert.equal(elements.get('class-warrior').dataset.position, 'left');
  elements.get('class-prev').onclick();
  assert.equal(elements.get('class-art').src, '/art/warrior-key-art.webp');
  elements.get('class-prev').onclick();
  assert.equal(elements.get('class-art').src, '/art/mage-key-art.webp');
  assert.equal(elements.get('class-mage').dataset.position, 'center');
  elements.get('ready').onclick();
  assert.deepEqual(emitted.at(-1), ['ready']);
  assert.equal(elements.get('class-next').disabled, true);
  assert.equal(elements.get('start').disabled, false);
  elements.get('start').onclick();
  assert.deepEqual(emitted.at(-1), ['start']);
  assert.equal(elements.get('match-loading').hidden, false);
  assert.equal(elements.get('battle').hidden, true);
  assert.equal(elements.get('loading-blue').children.length, 5);
  assert.equal(elements.get('loading-red').children.length, 5);
  assert.equal(elements.get('loading-red').children[0].children[0].src, '/art/mage-cutout.webp');
  const player = {
    id: 'self', name: 'Tester', job: 'mage', team: '紅隊', x: 1600, y: 1400, hp: 80, maxHp: 80,
    alive: true, facing: 0, attackAt: 0, skillAt: 0, spawnedAt: 0
  };
  socketHandlers.get('room')({ id: 'ABCDE0', host: 'self', players: [player], phase: 'playing' });
  socketHandlers.get('arenaMap')({ id: 'ABCDE0', map: require('../arena/world').generateWorld() });
  assert.equal(elements.get('match-loading').hidden, true);
  assert.equal(elements.get('battle').hidden, false);
  socketHandlers.get('arenaState')({
    id: 'ABCDE0', now: 100, phase: 'playing', remaining: 299900, players: [player],
    effects: [], kills: [], projectiles: [], score: { 紅隊: 0, 藍隊: 0 }
  });
  frames.shift()(115);
  assert.ok(pixelDraws > 100);
  assert.match(elements.get('health').textContent, /法師 · HP 80\/80/);
  const arena = elements.get('arena');
  const keyboard = code => ({ code, target: element('BODY'), preventDefault() {} });
  keyHandlers.get('keydown')(keyboard('KeyD'));
  assert.equal(emitted.at(-1)[0], 'arenaInput');
  assert.equal(emitted.at(-1)[1].x, 1);
  keyHandlers.get('keyup')(keyboard('KeyD'));
  assert.equal(emitted.at(-1)[1].x, 0);
  arena.onpointerdown({ button: 0, clientX: 90, clientY: 45 });
  assert.equal(emitted.at(-1)[0], 'arenaAttack');
  assert.equal(emitted.at(-1)[1].x, 1300);
  assert.equal(emitted.at(-1)[1].y, 1202);
  assert.equal(emitted.at(-1)[1].skill, false);
  keyHandlers.get('keydown')(keyboard('KeyQ'));
  assert.equal(emitted.at(-1)[1].skill, true);
  keyHandlers.get('keydown')(keyboard('Enter'));
  assert.equal(emitted.at(-1)[0], 'arenaInput');
  assert.equal(emitted.at(-1)[1].x, 0);
});
