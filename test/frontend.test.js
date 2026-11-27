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
      width: 960, height: 576,
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
  const hostPlayer = { id: 'self', name: 'Tester', job: 'mage', ready: false, bot: false };
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
    performance: { now: () => 100 },
    requestAnimationFrame: callback => frames.push(callback),
    setInterval() {}
  });
  for (const script of ['soup-bank.js', 'app.js', 'arena-renderer.js']) vm.runInContext(read(script), context);
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
  const player = {
    id: 'self', name: 'Tester', job: 'mage', team: '紅隊', x: 80, y: 80, hp: 80, maxHp: 80,
    alive: true, facing: 0, attackAt: 0, skillAt: 0, spawnedAt: 0
  };
  socketHandlers.get('room')({ id: 'ABCDE0', host: 'self', players: [player], phase: 'playing' });
  socketHandlers.get('arenaState')({
    id: 'ABCDE0', now: 100, phase: 'playing', remaining: 299900, players: [player],
    map: { width: 960, height: 576, walls: [[280, 80, 48, 144]], border: 16 },
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
  assert.equal(emitted.at(-1)[1].x, 180);
  assert.equal(emitted.at(-1)[1].y, 90);
  assert.equal(emitted.at(-1)[1].skill, false);
  keyHandlers.get('keydown')(keyboard('KeyQ'));
  assert.equal(emitted.at(-1)[1].skill, true);
  keyHandlers.get('keydown')(keyboard('Enter'));
  assert.equal(emitted.at(-1)[0], 'arenaInput');
  assert.equal(emitted.at(-1)[1].x, 0);
});
