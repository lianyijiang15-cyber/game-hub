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

  let muted = false;
  try { muted = localStorage.getItem('pixel-clash-muted') === 'yes'; } catch {}
  let context;
  let master;
  let track;
  let channel;
  let next;
  let step;
  let clock;

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

  function updateMusic() {
    if (context.state !== 'running') return;
    const time = context.currentTime;
    const scene = !$('game').hidden && !$('battle').hidden
      ? $('battle').dataset.scene : !$('soup').hidden ? 'soup' : 'menu';
    const song = muted || document.hidden ? null : songs[scene] ?? songs.menu;
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
      channel.gain.linearRampToValueAtTime(1, time + .32);
      channel.connect(master);
      step = 0;
      next = time + .025;
    }
    if (!song) return;
    if (next < time) next = time + .02;
    while (next < time + .24) {
      note(channel, song.notes[step % song.notes.length], next, song.beat * 1.5, .13, song.wave);
      if (step % 4 === 0) note(channel, song.bass[Math.floor(step / 4) % song.bass.length], next, song.beat * 3.2, .12, 'sine');
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
    if (muted || context?.state !== 'running' ||
        !event.target.closest?.('button:not([disabled]), a[href], summary')) return;
    const at = context.currentTime;
    note(master, 84, at, .085, .30, 'triangle');
    note(master, 91, at + .025, .075, .12, 'sine');
  }, { capture: true });
})();
