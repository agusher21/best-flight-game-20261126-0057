// WebAudio sound engine for Jakarta Night Courier — Storm Run.
// All sounds synthesized programmatically — no external audio files.

let audioContext = null;
let masterGain = null;
let engineOsc = null;
let engineGain = null;
let windNoise = null;
let windGain = null;
let initialized = false;

/** Initialize the audio context (must be called on user interaction). */
export function initAudio() {
  if (initialized) return;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(audioContext.destination);

    // Engine oscillator (low hum)
    engineOsc = audioContext.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 80;
    engineGain = audioContext.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineGain).connect(masterGain);
    engineOsc.start();

    // Wind noise for storm
    const bufferSize = 2 * audioContext.sampleRate;
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    windNoise = audioContext.createBufferSource();
    windNoise.buffer = noiseBuffer;
    windNoise.loop = true;
    windGain = audioContext.createGain();
    windGain.gain.value = 0;
    const windFilter = audioContext.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 400;
    windFilter.Q.value = 0.5;
    windNoise.connect(windFilter).connect(windGain).connect(masterGain);
    windNoise.start();

    initialized = true;
  } catch (e) {
    console.warn('WebAudio not available:', e);
  }
}

/** Resume audio context if suspended (browser autoplay policy). */
export function resumeAudio() {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

/** Set master volume (0-1). */
export function setMasterVolume(vol) {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, vol)) * 0.3;
}

/** Update engine sound based on throttle and speed. */
export function updateEngineSound(throttle, speed, maxSpeed, damaged) {
  if (!initialized || !engineOsc || !engineGain) return;

  const speedRatio = speed / maxSpeed;
  const baseFreq = 60 + 180 * speedRatio;
  const throttleFreq = 40 * throttle;
  engineOsc.frequency.setTargetAtTime(baseFreq + throttleFreq, audioContext.currentTime, 0.1);

  // Volume based on throttle and speed
  let targetGain = 0.15 * throttle + 0.1 * speedRatio;
  if (damaged) targetGain *= 0.7; // Damaged engine sounds weaker
  engineGain.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.05);
}

/** Update wind noise for storm. */
export function updateWindSound(windSpeed, active) {
  if (!initialized || !windGain) return;

  if (active && windSpeed > 5) {
    const gain = Math.min(0.25, windSpeed / 180);
    windGain.gain.setTargetAtTime(gain, audioContext.currentTime, 0.2);
  } else {
    windGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.5);
  }
}

/** Play a one-shot beep/tone. */
export function playTone(frequency, duration, type = 'sine', volume = 0.15, startDelay = 0) {
  if (!initialized || !audioContext) return;

  try {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain).connect(masterGain);

    const when = audioContext.currentTime + startDelay;
    osc.start(when);
    gain.gain.setTargetAtTime(0, when + duration * 0.1, duration * 0.3);
    osc.stop(when + duration);
  } catch (e) {
    // Ignore audio errors
  }
}

/** Play a chord (multiple tones). */
export function playChord(frequencies, duration, type = 'sine', volume = 0.1) {
  frequencies.forEach((f, i) => playTone(f, duration, type, volume, i * 0.02));
}

/** Play thunder sound — low rumble with crack. */
export function playThunder(intensity = 0.7) {
  if (!initialized || !audioContext) return;

  try {
    const now = audioContext.currentTime;
    const duration = 2.0 + intensity * 2.0; // 2-4 seconds

    // Close crack (if intense)
    if (intensity > 0.6) {
      const crackOsc = audioContext.createOscillator();
      const crackGain = audioContext.createGain();
      const crackFilter = audioContext.createBiquadFilter();
      crackOsc.type = 'square';
      crackOsc.frequency.value = 120;
      crackFilter.type = 'highpass';
      crackFilter.frequency.value = 80;
      crackGain.gain.value = intensity * 0.15;
      crackOsc.connect(crackFilter).connect(crackGain).connect(masterGain);
      crackOsc.start(now);
      crackGain.gain.setTargetAtTime(0, now + 0.05, 0.03);
      crackOsc.stop(now + 0.15);
    }

    // Main rumble — filtered noise
    const rumbleBuffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
    const rumbleData = rumbleBuffer.getChannelData(0);
    for (let i = 0; i < rumbleData.length; i++) {
      // Low-frequency biased noise
      rumbleData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioContext.sampleRate * 0.5));
    }
    const rumbleSource = audioContext.createBufferSource();
    rumbleSource.buffer = rumbleBuffer;
    const rumbleGain = audioContext.createGain();
    const rumbleFilter = audioContext.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 120;
    rumbleFilter.Q.value = 1.5;
    rumbleGain.gain.value = intensity * 0.12;
    rumbleSource.connect(rumbleFilter).connect(rumbleGain).connect(masterGain);
    rumbleSource.start(now);
    rumbleGain.gain.setTargetAtTime(0, now + duration * 0.3, duration * 0.5);
    rumbleSource.stop(now + duration);

    // Distant rolling thunder — slower oscillation
    const rollOsc = audioContext.createOscillator();
    const rollGain = audioContext.createGain();
    const rollFilter = audioContext.createBiquadFilter();
    rollOsc.type = 'sine';
    rollOsc.frequency.value = 35;
    rollFilter.type = 'lowpass';
    rollFilter.frequency.value = 60;
    rollGain.gain.value = intensity * 0.06;
    rollOsc.connect(rollFilter).connect(rollGain).connect(masterGain);
    rollOsc.start(now + 0.3);
    rollGain.gain.setTargetAtTime(0, now + duration * 0.5, duration * 0.7);
    rollOsc.stop(now + duration);
  } catch (e) {
    // Ignore
  }
}

/** Play lightning crack (close strike). */
export function playLightningCrack() {
  if (!initialized || !audioContext) return;

  try {
    const now = audioContext.currentTime;
    // Sharp crack
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    osc.type = 'square';
    osc.frequency.value = 200;
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 3;
    gain.gain.value = 0.1;
    osc.connect(filter).connect(gain).connect(masterGain);
    osc.start(now);
    gain.gain.setTargetAtTime(0, now + 0.02, 0.01);
    osc.stop(now + 0.08);

    // High-frequency snap
    const snapOsc = audioContext.createOscillator();
    const snapGain = audioContext.createGain();
    snapOsc.type = 'sawtooth';
    snapOsc.frequency.value = 2000;
    snapGain.gain.value = 0.05;
    snapOsc.connect(snapGain).connect(masterGain);
    snapOsc.start(now);
    snapGain.gain.setTargetAtTime(0, now + 0.01, 0.005);
    snapOsc.stop(now + 0.03);
  } catch (e) {
    // Ignore
  }
}

/** Predefined sound effects. */
export const SFX = {
  /** Ring passed - ascending major triad. */
  ringPass: () => playChord([523.25, 659.25, 783.99], 0.4, 'sine', 0.12),

  /** Ring post hit - harsh buzz. */
  ringHit: () => playTone(180, 0.3, 'square', 0.15),

  /** Building/ground impact - low thud. */
  impact: () => {
    playTone(60, 0.2, 'sine', 0.2);
    playTone(40, 0.4, 'triangle', 0.1);
  },

  /** Fuel warning - repeating beep. */
  fuelWarning: (count = 3) => {
    for (let i = 0; i < count; i++) {
      playTone(880, 0.15, 'square', 0.18, i * 0.3);
    }
  },

  /** Damage warning - descending tone. */
  damageWarning: () => {
    playTone(660, 0.1, 'sawtooth', 0.15);
    playTone(440, 0.15, 'sawtooth', 0.15, 0.1);
    playTone(330, 0.2, 'sawtooth', 0.15, 0.2);
  },

  /** Mission complete - fanfare. */
  missionComplete: () => {
    playChord([523.25, 659.25, 783.99, 1046.5], 0.6, 'triangle', 0.1);
    setTimeout(() => playChord([783.99, 1046.5, 1318.5], 0.8, 'sine', 0.08), 200);
  },

  /** Mission failed - sad trombone. */
  missionFailed: () => {
    playTone(330, 0.3, 'sawtooth', 0.15);
    playTone(294, 0.3, 'sawtooth', 0.15, 0.2);
    playTone(262, 0.5, 'sawtooth', 0.15, 0.4);
  },

  /** Button click - short click. */
  click: () => playTone(1200, 0.05, 'square', 0.08),

  /** Throttle change - subtle tick. */
  throttleTick: () => playTone(800, 0.03, 'sine', 0.05),

  /** Flaps deploy - hydraulic sound. */
  flaps: () => {
    playTone(200, 0.1, 'triangle', 0.1);
    playTone(150, 0.15, 'sine', 0.08, 0.05);
  },

  /** Stall warning - intermittent horn. */
  stallWarning: () => {
    for (let i = 0; i < 3; i++) {
      playTone(440, 0.1, 'square', 0.2, i * 0.15);
    }
  },

  /** Overspeed warning. */
  overspeedWarning: () => {
    playTone(600, 0.1, 'sawtooth', 0.15);
    playTone(600, 0.1, 'sawtooth', 0.15, 0.12);
  },

  /** Landing gear / touchdown. */
  touchdown: () => {
    playTone(120, 0.15, 'sine', 0.2);
    playTone(80, 0.3, 'triangle', 0.15, 0.05);
  },

  /** Parcel delivered. */
  delivery: () => {
    playChord([659.25, 880, 1046.5], 0.5, 'sine', 0.12);
  },
};

/** Clean up audio resources. */
export function cleanupAudio() {
  if (engineOsc) {
    engineOsc.stop();
    engineOsc.disconnect();
    engineOsc = null;
  }
  if (windNoise) {
    windNoise.stop();
    windNoise.disconnect();
    windNoise = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  initialized = false;
}