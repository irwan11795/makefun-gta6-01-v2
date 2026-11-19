// SOLHAVEN audio — all sounds synthesized with WebAudio, no files.
// engine: sawtooth oscillator + lowpass, pitch follows speed.
// siren: two alternating tones. crash: noise burst.
// chime: 3-note arpeggio. click: short blip.
// resume() must be called from a user gesture before sound can start.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let sirenHigh = false;
  let muted = false;
  let started = false;

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function resume() {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') {
      c.resume().catch(() => {});
    }
    if (!started) {
      started = true;
      startEngine();
    }
  }

  function startEngine() {
    if (!ctx || engineOsc) return;
    try {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 400;
      engineFilter.Q.value = 2;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    } catch (e) {
      engineOsc = null;
    }
  }

  // speed01: 0 (idle / on foot) .. 1 (top speed).
  function engine(speed01) {
    if (!ctx || !engineOsc || !engineGain) return;
    const s = Math.max(0, Math.min(1, speed01 || 0));
    const t = ctx.currentTime;
    const freq = 45 + s * 175;
    const cutoff = 350 + s * 1800;
    try {
      engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
      engineFilter.frequency.setTargetAtTime(cutoff, t, 0.08);
      engineGain.gain.setTargetAtTime(s <= 0.01 ? 0.0 : 0.05 + s * 0.06, t, 0.1);
    } catch (e) { /* ignore */ }
  }

  function siren(on) {
    const c = ensureCtx();
    if (!c) return;
    if (on) {
      if (sirenOsc) return;
      try {
        sirenOsc = c.createOscillator();
        sirenOsc.type = 'sine';
        sirenOsc.frequency.value = 720;
        sirenGain = c.createGain();
        sirenGain.gain.value = 0.0;
        sirenGain.gain.setTargetAtTime(0.045, c.currentTime, 0.2);
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        sirenHigh = false;
        sirenTimer = window.setInterval(() => {
          if (!sirenOsc) return;
          sirenHigh = !sirenHigh;
          try { sirenOsc.frequency.setTargetAtTime(sirenHigh ? 960 : 720, c.currentTime, 0.05); } catch (e) { /* ignore */ }
        }, 380);
      } catch (e) {
        sirenOsc = null;
      }
    } else {
      if (sirenTimer !== null) {
        window.clearInterval(sirenTimer);
        sirenTimer = null;
      }
      if (sirenOsc && sirenGain) {
        const osc = sirenOsc;
        const gain = sirenGain;
        sirenOsc = null;
        sirenGain = null;
        try {
          gain.gain.setTargetAtTime(0, c.currentTime, 0.1);
          window.setTimeout(() => { try { osc.stop(); } catch (e) { /* ignore */ } }, 400);
        } catch (e) {
          try { osc.stop(); } catch (err) { /* ignore */ }
        }
      }
    }
  }

  function noiseBuffer(duration) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return buf;
  }

  function crash() {
    const c = ensureCtx();
    if (!c) return;
    try {
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(0.35);
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.5, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
      // Low thud underneath.
      const thud = c.createOscillator();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(120, c.currentTime);
      thud.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.25);
      const thudGain = c.createGain();
      thudGain.gain.setValueAtTime(0.4, c.currentTime);
      thudGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
      thud.connect(thudGain);
      thudGain.connect(master);
      thud.start();
      thud.stop(c.currentTime + 0.32);
    } catch (e) { /* ignore */ }
  }

  function tone(freq, startAt, dur, vol, type) {
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(vol || 0.18, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.05);
  }

  function chime() {
    const c = ensureCtx();
    if (!c) return;
    try {
      const t0 = c.currentTime + 0.01;
      tone(523.25, t0, 0.35, 0.18); // C5
      tone(659.25, t0 + 0.12, 0.35, 0.18); // E5
      tone(783.99, t0 + 0.24, 0.5, 0.2); // G5
    } catch (e) { /* ignore */ }
  }

  function click() {
    const c = ensureCtx();
    if (!c) return;
    try {
      tone(880, c.currentTime + 0.01, 0.08, 0.12, 'square');
    } catch (e) { /* ignore */ }
  }

  function setMuted(m) {
    muted = !!m;
    if (master && ctx) {
      try { master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05); } catch (e) { /* ignore */ }
    }
  }

  return {
    resume,
    engine,
    siren,
    crash,
    chime,
    click,
    setMuted,
    // Aliases for the names boot.js calls.
    playCrash: crash,
    playClick: click,
    playWin: chime,
    playLose: chime,
    get muted() { return muted; },
  };
}
