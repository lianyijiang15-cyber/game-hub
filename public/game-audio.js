'use strict';

(() => {
  const toggle = $('sound-toggle');
  const AudioEngine = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioEngine) {
    toggle.hidden = true;
    return;
  }

  // Original looping motifs. Each four notes form a measure, with a separate harmony line.
  const songs = {
    menu: { beat: .5, wave: 'triangle', notes: [62, 65, 69, 74, 67, 65, 64, 60, 62, 65, 69, 72, 67, 64, 62, 0], bass: [38, 43, 41, 36] },
    soup: { beat: .61, wave: 'sine', notes: [65, 0, 64, 60, 58, 62, 0, 63, 60, 59, 55, 0, 57, 0, 62, 0], bass: [41, 39, 36, 38] },
    forest: { beat: .44, wave: 'sine', notes: [67, 71, 74, 0, 76, 74, 69, 71, 67, 64, 67, 74, 72, 69, 67, 0], bass: [43, 40, 45, 38] },
    marsh: { beat: .66, wave: 'sine', notes: [62, 0, 65, 69, 67, 65, 0, 60, 63, 0, 67, 70, 69, 64, 62, 0], bass: [38, 36, 39, 33] },
    ruins: { beat: .53, wave: 'triangle', notes: [60, 67, 0, 63, 68, 67, 63, 0, 58, 65, 67, 70, 63, 62, 60, 0], bass: [36, 44, 34, 43] },
    snow: { beat: .49, wave: 'sine', notes: [76, 79, 83, 0, 86, 83, 79, 76, 74, 78, 81, 83, 79, 78, 76, 0], bass: [40, 47, 38, 43] },
    inferno: { beat: .34, wave: 'triangle', notes: [48, 48, 55, 56, 48, 51, 55, 0, 46, 46, 53, 55, 44, 51, 43, 0], bass: [36, 32, 34, 31] },
    fortress: { beat: .39, wave: 'triangle', notes: [53, 57, 60, 65, 60, 57, 55, 0, 55, 58, 62, 65, 64, 60, 53, 0], bass: [41, 36, 43, 36] }
  };

  const caseThemes = new Map();
  function caseTheme(id) {
    if (caseThemes.has(id)) return caseThemes.get(id);
    const hash = [...id].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 5381);
    const uneasy = /hotel|theater|blackout|laundry|diner|light|stage/.test(id);
    const root = (uneasy ? 52 : 60) + hash % 5;
    const scale = uneasy ? [0, 2, 3, 5, 6, 7, 10] : [0, 2, 4, 5, 7, 9, 11];
    const notes = Array.from({ length: 16 }, (_, index) => {
      if (index % 4 === 3 || (hash >>> index & 1) && index % 4 === 2) return 0;
      return root + scale[(index + (hash >>> (index % 11)) % 13) % scale.length] + (index % 4 === 1 ? 12 : 0);
    });
    const song = { beat: (uneasy ? .56 : .47) + (hash % 8) * .018, wave: 'sine', notes,
      bass: [root - 24, root - 19, root - 24 + scale[2], root - 17], level: .64 };
    caseThemes.set(id, song);
    return song;
  }
  const sceneMusic = Object.fromEntries(['forest', 'marsh', 'ruins', 'snow', 'inferno', 'fortress']
    .map(scene => [scene, { ...songs[scene], level: .65, battle: true }]));
  const effects = {
    click: [[84, 0, .085, .30], [91, .025, .075, .12, 'sine']],
    chest: [[59, 0, .13, .20], [71, .07, .16, .22], [78, .14, .23, .16, 'sine']],
    item: [[67, 0, .10, .21], [76, .09, .22, .18, 'sine']],
    heal: [[64, 0, .13, .18, 'sine'], [69, .07, .16, .18], [76, .14, .26, .16, 'sine']],
    death: [[49, 0, .21, .22], [44, .12, .22, .16, 'sine'], [37, .24, .30, .14, 'sine']],
    respawn: [[55, 0, .12, .17, 'sine'], [67, .10, .19, .13, 'sine']],
    achievement: [[67, 0, .13, .17], [71, .09, .15, .18], [79, .18, .27, .16]],
    page: [[41, 0, .11, .08, 'sine'], [44, .19, .14, .07, 'sine']]
  };

  let muted = false;
  try { muted = localStorage.getItem('pixel-clash-muted') === 'yes'; } catch {}
  let context;
  let master;
  let track;
  let channel;
  let next;
  let step;
  let clock;
  let paperNoise;

  function renderToggle() {
    toggle.setAttribute('aria-pressed', String(!muted));
    toggle.querySelector('span').textContent = muted ? '靜音' : '音效';
  }

  function note(output, midi, time, length, volume, wave) {
    if (!midi) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    envelope.gain.setValueAtTime(.0001, time);
    envelope.gain.linearRampToValueAtTime(volume, time + .025);
    envelope.gain.exponentialRampToValueAtTime(.0001, time + length);
    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(time);
    oscillator.stop(time + length);
  }

  function paperRustle(time) {
    if (!paperNoise) {
      paperNoise = context.createBuffer(1, Math.round(context.sampleRate * .32), context.sampleRate);
      const samples = paperNoise.getChannelData(0);
      for (let index = 0; index < samples.length; index++) {
        const t = index / samples.length;
        const pressure = Math.sin(Math.PI * t) ** 2 * (.55 + .45 * Math.sin(25 * t) ** 2);
        samples[index] = (Math.random() * 2 - 1) * pressure;
      }
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = paperNoise;
    filter.type = 'bandpass';
    filter.frequency.value = 1750;
    filter.Q.value = .7;
    gain.gain.value = .29;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(time);
  }

  window.playGameSound = name => {
    if (muted || document.hidden || context?.state !== 'running' || !Object.hasOwn(effects, name)) return;
    const at = context.currentTime;
    if (name === 'page') paperRustle(at);
    for (const [midi, delay, duration, volume, wave = 'triangle'] of effects[name]) {
      note(master, midi, at + delay, duration, volume, wave);
    }
  };

  function updateMusic() {
    if (context.state !== 'running') return;
    const time = context.currentTime;
    const soup = $('soup');
    const battling = !$('game').hidden && !$('battle').hidden;
    const song = muted || document.hidden ? null : battling
      ? sceneMusic[$('battle').dataset.scene] ?? sceneMusic.forest
      : !soup.hidden ? (soup.dataset.case ? caseTheme(soup.dataset.case) : songs.soup) : songs.menu;
    if (song !== track) {
      if (channel) {
        const previous = channel;
        previous.gain.cancelScheduledValues(time);
        previous.gain.setTargetAtTime(0, time, .07);
        setTimeout(() => previous.disconnect(), 500);
      }
      track = song;
      if (!song) return;
      channel = context.createGain();
      channel.gain.setValueAtTime(0, time);
      channel.gain.linearRampToValueAtTime(song.level ?? .8, time + .42);
      channel.connect(master);
      step = 0;
      next = time + .025;
    }
    if (!song) return;
    if (next < time) next = time + .02;
    while (next < time + .24) {
      note(channel, song.notes[step % song.notes.length], next, song.beat * 1.5, .13, song.wave);
      if (step % 4 === 0) note(channel, song.bass[Math.floor(step / 4) % song.bass.length], next, song.beat * 3.2, .12, 'sine');
      if (song.battle && step % 4 === 2) {
        const bass = song.bass[Math.floor(step / 4) % song.bass.length];
        note(channel, bass + 12, next, song.beat * .8, .055, 'triangle');
      }
      next += song.beat;
      step++;
    }
  }

  async function unlock() {
    if (muted) return;
    try {
      if (!context) {
        context = new AudioEngine();
        master = context.createGain();
        master.gain.value = .27;
        master.connect(context.destination);
      }
      await context.resume();
      clock ??= setInterval(updateMusic, 120);
      updateMusic();
    } catch {
      // Browser playback may be blocked until another user gesture.
    }
  }

  renderToggle();
  toggle.onclick = () => {
    muted = !muted;
    try { localStorage.setItem('pixel-clash-muted', muted ? 'yes' : 'no'); } catch {}
    renderToggle();
    if (!muted) void unlock();
    else if (context) updateMusic();
  };

  document.addEventListener('click', async event => {
    if (!event.isTrusted || muted || event.target.closest?.('#sound-toggle')) return;
    await unlock();
    const control = event.target.closest?.('button:not([disabled]), a[href], summary');
    if (control && control.dataset?.gameSound !== 'custom') window.playGameSound('click');
  }, { capture: true });
})();
