// WebAudio sound engine for Jakarta Night Courier.
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
    const gain = Math.min(0.2, windSpeed / 200);
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