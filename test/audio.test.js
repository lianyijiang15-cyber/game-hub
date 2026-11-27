'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('audio waits for interaction, plays scene-specific notes and respects the stored mute state', async () => {
  const scripts = fs.readFileSync(path.join(__dirname, '../public/game-audio.js'), 'utf8');
  const notes = [];
  const label = {};
  const settings = new Map();
  const button = { querySelector: () => label, setAttribute(name, value) { this[name] = value; } };
  const nodes = { 'sound-toggle': button, game: { hidden: false }, battle: { dataset: { scene: 'forest' } }, soup: { hidden: true } };
  let click;
  let time = 0;
  let update;
  const client = vm.createContext({
    $: id => nodes[id],
    localStorage: { getItem: key => settings.get(key), setItem: (key, value) => settings.set(key, value) },
    document: { hidden: false, addEventListener(_name, handler) { click = handler; } },
    setInterval(callback) { update = callback; return 1; },
    setTimeout() {},
    window: { AudioContext: class {
      state = 'suspended';
      get currentTime() { return time; }
      async resume() { this.state = 'running'; }
      createGain() {
        return {
          gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
            cancelScheduledValues() {}, setTargetAtTime() {} },
          connect() {}, disconnect() {}
        };
      }
      createOscillator() {
        return { frequency: {}, connect() {}, start() { notes.push(this.frequency.value); }, stop() {} };
      }
    } }
  });
  vm.runInContext(scripts, client);
  assert.equal(update, undefined);
  await click({ isTrusted: false });
  assert.equal(notes.length, 0);
  await click({ isTrusted: true, target: { closest: selector => selector.startsWith('button') } });
  assert.equal(notes.length, 4, 'first melody and bass notes plus two UI click tones');
  nodes.battle.dataset.scene = 'snow';
  time = .5;
  update();
  assert.equal(notes.length, 6);
  assert.notEqual(notes[0], notes[4]);
  button.onclick();
  assert.equal(label.textContent, '靜音');
  assert.equal(settings.get('pixel-clash-muted'), 'yes');
  time = 1;
  update();
  assert.equal(notes.length, 6);
});
