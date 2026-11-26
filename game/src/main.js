// Jakarta Night Courier — game loop, screens and wiring.
// Owns the canvas, the fixed-step loop, the screen state machine (title,
// mission select, briefing, play, paused, complete, game over) and the wiring
// between plane, terrain, rings, missions, HUD, audio and the renderer.

import { FIELD, STEP, MAX_FRAME, SCREENS, MISSIONS, PLANE, STORAGE_KEY } from './config.js';
import { mulberry32 } from './rng.js';
import { createPlane } from './plane.js';
import { createTerrain, updateTerrain, checkTerrainCollision, checkRunwayLanding } from './terrain.js';
import { createRings, updateRings, getNextRing } from './rings.js';
import { createMissionManager, MISSION_STATE } from './missions.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_MISSION_NEXT, ACTION_MISSION_PREV } from './input.js';
import { drawHUD } from './hud.js';
import { drawWorld } from './render.js';
import { initAudio, resumeAudio, updateEngineSound, updateWindSound, SFX } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') || '', 10);
const seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : 7;
const shotName = params.get('shot');
const SHOT_MODE = shotName !== null && shotName !== '';

const rng = mulberry32(seed);
const terrain = createTerrain(rng);
const plane = createPlane(rng);
const missions = createMissionManager(rng);
const input = createInput(canvas);

// A persistent view of the plane: getState() returns a fresh object every call,
// so we merge into this one and keep prevX/prevY (ring crossing) alive, plus
// the plane's own methods for the mission manager.
const planeView = {
  applyDamage: (amount) => plane.applyDamage(amount),
  refuel: () => plane.refuel(),
  repair: () => plane.repair(),
};
function syncPlaneView() {
  Object.assign(planeView, plane.getState());
}
syncPlaneView();

let rings = [];
let wind = { x: 0, y: 0, gustTimer: 0, gustAngle: 0, gustStrength: 0 };
let screen = SCREENS.TITLE;
let screenData = {};
let selectedMission = 0;
let time = 0;
let totalScore = 0;
let bestScores = loadBest();
let eventFeed = [];
let shakeUntil = 0;
let shakeMag = 0;
let lastClick = null;
let fuelWarned = false;
let audioStarted = false;

canvas.addEventListener('pointerdown', (event) => {
  const rect = canvas.getBoundingClientRect();
  lastClick = {
    x: ((event.clientX - rect.left) / rect.width) * FIELD.width,
    y: ((event.clientY - rect.top) / rect.height) * FIELD.height,
  };
});

window.addEventListener('pointerdown', startAudioOnce, { once: true });
window.addEventListener('keydown', startAudioOnce, { once: true });
function startAudioOnce() {
  if (audioStarted) return;
  audioStarted = true;
  initAudio();
  resumeAudio();
}

function loadBest() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveBest() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bestScores));
  } catch {
    // Best scores are a nicety; a blocked storage must never break the game.
  }
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function pushEvent(type, message) {
  eventFeed.unshift({ type, message, until: time + 3.5 });
  if (eventFeed.length > 3) eventFeed.length = 3;
}

function shake(mag, seconds) {
  shakeMag = mag;
  shakeUntil = time + seconds;
}

function startMission(missionId) {
  missions.selectMission(missionId);
  plane.reset(missionId);
  syncPlaneView();
  if (missionId === 2) {
    // Storm Return starts east of the city, flying home to the runway.
    plane.place(1000, 220, Math.PI);
    syncPlaneView();
  }
  rings = createRings(missionId, rng);
  wind = { x: 0, y: 0, gustTimer: 0, gustAngle: 0, gustStrength: 0 };
  missions.startMission(planeView);
  totalScore = 0;
  eventFeed = [];
  fuelWarned = false;
  setScreen(SCREENS.PLAY);
  setStatus(`Mission ${missionId + 1}: ${MISSIONS[missionId].name}. ${MISSIONS[missionId].briefing}`);
}

function setScreen(next, data = {}) {
  screen = next;
  screenData = data;
}

/** One fixed simulation step while playing. */
function stepPlay(dt) {
  time += dt;
  updateTerrain(terrain, dt, time);

  const throttleInput = input.throttle();
  const turnInput = input.turn();
  const brake = input.brake();
  const result = plane.step(dt, throttleInput, turnInput, brake, wind);
  syncPlaneView();
  updateEngineSound(planeView.throttle, planeView.speed, PLANE.maxSpeed, planeView.damage > 50);
  updateWindSound(Math.hypot(wind.x, wind.y), missions.getMission().hasStorm);

  // Rings
  const ringResult = updateRings(rings, planeView, dt, time, missions.getMissionProgress().missionId);
  for (let i = 0; i < ringResult.ringsPassed; i += 1) {
    SFX.ringPass();
    pushEvent('ring', `RING ${missions.getMissionProgress().objectives.ringsPassed}/${missions.getMission().ringCount}`);
  }
  if (ringResult.ringPostHits > 0) {
    plane.applyDamage(PLANE.damagePerRingClip * ringResult.ringPostHits);
    syncPlaneView();
    SFX.ringHit();
    shake(6, 0.3);
    pushEvent('hit', 'CLIPPED A RING POST');
  }

  // Terrain collision — runway touchdown first, then crash/damage.
  const hit = checkTerrainCollision(planeView, terrain);
  if (hit.hit) {
    const landing = checkRunwayLanding(planeView, terrain);
    if (hit.type === 'ground' || hit.type === 'sea') {
      if (landing.onRunway) {
        // Touchdown on the strip: Storm Return scores it (good or hard) in the
        // mission update below, and a plane already down just rolls. The other
        // missions end the sortie here — gently if the approach was good.
        if (missions.getMissionProgress().missionId === 2) {
          // Let the mission update below register the landing.
        } else if (landing.goodApproach) {
          endMission(false, 'Landed safely on the runway', false);
          return;
        } else {
          endMission(true, 'Runway overshoot', true);
          return;
        }
      } else {
        endMission(true, hit.type === 'sea' ? 'Ditched in the sea' : 'Crashed into the ground', true);
        return;
      }
    } else {
      // Building / Monas: damage, kick away, brief invulnerability via cooldown.
      if (time > (stepPlay.lastHitAt || 0) + 1) {
        stepPlay.lastHitAt = time;
        const destroyed = plane.applyDamage(PLANE.damagePerHit);
        syncPlaneView();
        SFX.impact();
        shake(10, 0.4);
        plane.kick(hit.type === 'building' ? 0.9 : -0.9);
        syncPlaneView();
        pushEvent('hit', hit.type === 'monas' ? 'HIT MONAS TOWER' : 'HIT A BUILDING');
        if (destroyed) {
          endMission(true, 'Aircraft destroyed', true);
          return;
        }
      }
    }
  }

  // Fuel warning
  if (planeView.fuel < 20 && !fuelWarned) {
    fuelWarned = true;
    SFX.fuelWarning();
    pushEvent('warn', 'FUEL LOW');
  }
  if (planeView.fuel >= 20) fuelWarned = false;

  // Mission rules (fuel, damage, time, rings, pad, landing, completion)
  const missionResult = missions.update(planeView, rings, terrain, dt, wind);
  totalScore += missionResult.score || 0;
  for (const event of missionResult.events || []) {
    pushEvent(event.type, event.message);
    if (event.type === 'ring') SFX.ringPass();
    else if (event.type === 'delivery') SFX.delivery();
    else if (event.type === 'landing' || event.type === 'hard_landing') SFX.touchdown();
  }
  if (missionResult.complete) {
    const mission = missions.getMission();
    const id = missions.getMissionProgress().missionId;
    const best = Math.max(bestScores[id] || 0, totalScore);
    bestScores[id] = best;
    saveBest();
    SFX.missionComplete();
    setScreen(SCREENS.MISSION_COMPLETE, {
      missionName: mission.name,
      score: totalScore,
      totalScore: best,
    });
    setStatus(`Mission complete: ${mission.name}. Score ${totalScore}.`);
    return;
  }
  if (missionResult.failed) {
    endMission(true, missionResult.reason || 'Mission failed', missionResult.reason !== 'Fuel exhausted — forced landing');
    return;
  }
}

function endMission(crashed, reason, withSound) {
  const id = missions.getMissionProgress().missionId;
  const best = Math.max(bestScores[id] || 0, totalScore);
  bestScores[id] = best;
  saveBest();
  if (crashed && withSound) {
    SFX.crash();
    SFX.missionFailed();
  }
  shake(8, 0.5);
  setScreen(SCREENS.GAME_OVER, {
    reason,
    score: totalScore,
    totalScore: best,
  });
  setStatus(`${reason}. Final score ${totalScore}.`);
}

/** Attract mode behind the title: the plane flies the Ring Run on autopilot. */
function stepAttract(dt) {
  time += dt;
  updateTerrain(terrain, dt, time);
  if (rings.length === 0) {
    rings = createRings(0, rng);
  }
  const target = getNextRing(rings) || { x: 640, y: 300 };
  const autopilot = steerToward(target, 280);
  plane.step(dt, autopilot.throttle, autopilot.turn, autopilot.brake, wind);
  syncPlaneView();
  updateRings(rings, planeView, dt, time, 0);
}

/** Steering helper shared by attract mode and screenshot staging. */
export function steerToward(target, cruiseSpeed) {
  const dx = target.x - planeView.x;
  // Shallow descent: cap the vertical speed the steering asks for, and pull up
  // hard when low — unless the target itself is low (a final-approach ring or
  // the runway), in which case the descent is the point.
  let dy = target.y - planeView.y;
  if (planeView.y > 470 && target.y < 450) dy = -220;
  const dyCapped = Math.max(-180, Math.min(180, dy * 0.8));
  const wanted = Math.atan2(dyCapped, dx);
  let err = wanted - planeView.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const turn = Math.max(-1, Math.min(1, err * 2.2));
  const dist = Math.hypot(dx, dy);
  // Proportional throttle: hold the cruise speed instead of banging full/zero.
  const throttle = Math.max(-1, Math.min(1, (cruiseSpeed - planeView.speed) / 80));
  const brake = dist < 180 && planeView.speed > 150 && cruiseSpeed <= 200;
  return { throttle, turn, brake };
}

function handleActions(actions) {
  if (actions & ACTION_PAUSE) {
    if (screen === SCREENS.PLAY) {
      setScreen(SCREENS.PAUSED);
      setStatus('Paused.');
    } else if (screen === SCREENS.PAUSED) {
      setScreen(SCREENS.PLAY);
      setStatus('Resumed.');
    } else if (screen === SCREENS.MISSION_COMPLETE || screen === SCREENS.GAME_OVER) {
      setScreen(SCREENS.MISSION_SELECT);
      setStatus('Select a mission.');
    }
    return;
  }

  if (screen === SCREENS.TITLE) {
    if (actions & ACTION_CONFIRM) {
      SFX.click();
      setScreen(SCREENS.MISSION_SELECT);
      setStatus('Select a mission.');
    }
    return;
  }

  if (screen === SCREENS.MISSION_SELECT) {
    if (actions & ACTION_MISSION_NEXT) {
      selectedMission = (selectedMission + 1) % MISSIONS.length;
      SFX.click();
    }
    if (actions & ACTION_MISSION_PREV) {
      selectedMission = (selectedMission + MISSIONS.length - 1) % MISSIONS.length;
      SFX.click();
    }
    if (actions & ACTION_CONFIRM) {
      SFX.click();
      missions.selectMission(selectedMission);
      setScreen(SCREENS.BRIEFING, { mission: MISSIONS[selectedMission], missionId: selectedMission });
      setStatus(`Briefing: ${MISSIONS[selectedMission].name}.`);
    }
    if (lastClick) {
      // Click a mission card to pick it straight away.
      for (let i = 0; i < MISSIONS.length; i += 1) {
        const cardY = FIELD.height / 2 - 40 + i * 80;
        const cardX = FIELD.width / 2 - 300;
        if (lastClick.x >= cardX && lastClick.x <= cardX + 600 && lastClick.y >= cardY && lastClick.y <= cardY + 65) {
          selectedMission = i;
          SFX.click();
          missions.selectMission(i);
          setScreen(SCREENS.BRIEFING, { mission: MISSIONS[i], missionId: i });
          setStatus(`Briefing: ${MISSIONS[i].name}.`);
          break;
        }
      }
    }
    return;
  }

  if (screen === SCREENS.BRIEFING) {
    if (actions & ACTION_CONFIRM) {
      SFX.click();
      startMission(selectedMission);
    }
    return;
  }

  if (screen === SCREENS.PAUSED) {
    if (actions & ACTION_CONFIRM) {
      setScreen(SCREENS.PLAY);
      setStatus('Resumed.');
    }
    return;
  }

  if (screen === SCREENS.MISSION_COMPLETE || screen === SCREENS.GAME_OVER) {
    if (actions & ACTION_CONFIRM) {
      SFX.click();
      startMission(missions.getMissionProgress().missionId);
    }
    return;
  }
}

function render() {
  ctx.save();
  if (time < shakeUntil && shakeMag > 0) {
    ctx.translate((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag);
  }
  const missionId = missions.getMissionProgress().missionId;
  const storm = screen === SCREENS.PLAY && missions.getMission().hasStorm;
  drawWorld(ctx, terrain, rings, planeView, time, missionId, storm);
  ctx.restore();

  // Event feed (top-left, under the instruments)
  ctx.save();
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  let feedY = 150;
  for (const event of eventFeed) {
    const alpha = Math.max(0, Math.min(1, (event.until - time) / 1.5));
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = event.type === 'hit' || event.type === 'warn' ? '#ff6666' : '#7dffd4';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.fillText(event.message, 200, feedY);
    feedY += 24;
  }
  ctx.restore();

  drawHUD(ctx, canvas.width, canvas.height, planeView, terrain, rings, missions, screen, {
    ...screenData,
    selectedMission,
  });
}

let lastTimestamp = 0;
let accumulator = 0;

function frame(timestamp) {
  requestAnimationFrame(frame);
  if (SHOT_MODE) {
    render();
    input.endFrame();
    lastClick = null;
    return;
  }
  if (lastTimestamp === 0) lastTimestamp = timestamp;
  let frameTime = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  if (frameTime > MAX_FRAME) frameTime = MAX_FRAME;
  accumulator += frameTime;

  const actions = input.takeActions();
  handleActions(actions);
  if (actions & ACTION_CONFIRM) {
    // Confirm clicks also start audio on first interaction.
    startAudioOnce();
  }

  while (accumulator >= STEP) {
    accumulator -= STEP;
    if (screen === SCREENS.PLAY) {
      stepPlay(STEP);
      if (screen !== SCREENS.PLAY) break;
    } else if (screen === SCREENS.TITLE || screen === SCREENS.MISSION_SELECT) {
      stepAttract(STEP);
    }
  }

  render();
  input.endFrame();
  lastClick = null;
}

// Boot: title screen with the attract-mode plane already flying.
plane.reset(0);
syncPlaneView();
rings = createRings(0, rng);
setStatus('Jakarta Night Courier. Press Space or click to begin.');

if (SHOT_MODE) {
  // Deterministic screenshot scene: stage the world, freeze it, render once.
  // rings/time/wind are live accessors: startMission() reassigns the module
  // variables, and a plain object literal would freeze the boot values (the
  // parcel/landing scenes then chased the wrong rings and died in the city).
  const game = {
    plane, planeView, syncPlaneView, terrain, missions, startMission, setScreen, steerToward, rng,
    get rings() { return rings; },
    set rings(v) { rings = v; },
    get time() { return time; },
    set time(v) { time = v; },
    get wind() { return wind; },
    set wind(v) { wind = v; },
  };
  const staged = stageShot(shotName, game);
  time = staged.time;
  screen = staged.screen;
  screenData = staged.screenData || {};
  rings = staged.rings;
  render();
  window.__shotReady = true;
} else {
  requestAnimationFrame(frame);
}
