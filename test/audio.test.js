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
  const nodes = { 'sound-toggle': button, game: { hidden: false }, battle: { dataset: { scene: 'forest' } }, soup: { hidden: true, dataset: {} } };
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
      sampleRate = 8000;
      createBuffer(_, size) { return { getChannelData: () => new Float32Array(size) }; }
      createBufferSource() { return { connect() {}, start() {} }; }
      createBiquadFilter() { return { frequency: {}, Q: {}, connect() {} }; }
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
  const playSound = vm.runInContext('window.playGameSound', client);
  playSound('chest');
  playSound('death');
  playSound('item');
  playSound('page');
  assert.equal(notes.length, 16);

  nodes.battle.hidden = true;
  nodes.soup.hidden = false;
  nodes.soup.dataset.case = 'hotel-call';
  time = 1;
  update();
  assert.equal(notes.length, 18);
  const hotel = notes.at(-2);
  nodes.soup.dataset.case = 'snow';
  time = 1.5;
  update();
  assert.equal(notes.length, 20);
  assert.notEqual(notes.at(-2), hotel);
  button.onclick();
  assert.equal(label.textContent, '靜音');
  assert.equal(settings.get('pixel-clash-muted'), 'yes');
  time = 2;
  update();
  playSound('chest');
  assert.equal(notes.length, 20);
});
