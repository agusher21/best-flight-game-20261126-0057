// Deterministic screenshot scenes for Jakarta Night Courier — Storm Run.
// Each scene plays the real rules forward from a fresh world for a fixed number
// of steps, steered by a simple autopilot (steer at the next ring / pad /
// runway, hold a target speed, climb over buildings in the way), so the frame
// is what a short game really looks like. The same seed always gives the same
// frame (apart from cosmetic particle flicker).

import { STEP, SHOT_SCENES, SCREENS, PLANE, CAMERA } from './config.js';
import { mulberry32 } from './rng.js';
import { createRings, updateRings, getNextRing } from './rings.js';
import { updateTerrain, checkTerrainCollision, checkRunwayLanding, getPadPosition } from './terrain.js';
import { createCamera, updateCamera, createMonasBolt } from './render.js';

/** One simulation step shared by all scenes. */
function stepScene(game, input, dt) {
  const { plane, planeView, syncPlaneView, terrain, rings, missions, wind, camera } = game;
  game.time += dt;
  updateTerrain(terrain, dt, game.time);

  // Record the flown trail for the minimap (one point per 15 steps).
  game._trailTick = (game._trailTick || 0) + 1;
  if (game._trailTick % 15 === 0 && game.trail) {
    game.trail.push({ x: planeView.x, y: planeView.y });
    if (game.trail.length > 200) game.trail.shift();
  }

  // Update camera (handles lightning, rain, dawn, wind)
  const mission = missions.getMission();
  updateCamera(camera, planeView, dt, mission.hasStorm, mission.hasDawn);

  plane.step(dt, input.throttle, input.turn, input.brake, wind);
  syncPlaneView();
  const ringResult = updateRings(rings, planeView, dt, game.time, missions.getMissionProgress().missionId);
  const hit = checkTerrainCollision(planeView, terrain);
  if (hit.hit && hit.type !== 'ground' && hit.type !== 'sea') {
    if (game.time > (stepScene.lastHitAt || 0) + 1) {
      stepScene.lastHitAt = game.time;
      plane.applyDamage(PLANE.damagePerHit);
      plane.kick(hit.type === 'building' ? 0.9 : -0.9);
      syncPlaneView();
    }
  }
  missions.update(planeView, rings, terrain, dt, camera);
  return { ringResult, hit };
}

function freshRings(game, missionId) {
  game.rings = createRings(missionId, game.rng);
  return game.rings;
}

/** Autopilot steering toward a target, avoiding obstacles. */
export function autopilot(game, target, cruiseSpeed, dt) {
  const { plane, planeView, terrain, camera } = game;
  let tx = target.x;
  let ty = target.y;

  // Obstacle avoidance steers at a NEAR waypoint above the obstacle
  const dirX = Math.cos(planeView.heading);
  for (const b of terrain.buildings) {
    const ahead = (b.x + b.width / 2 - planeView.x) * dirX;
    if (ahead > 0 && ahead < 220) {
      const verticalOverlap = planeView.y + 24 > b.y && planeView.y - 24 < b.y + b.height;
      if (verticalOverlap) {
        tx = planeView.x + 200 * dirX;
        ty = b.y - 90;
        break;
      }
    }
  }

  // Monas tower: fly over its flame, never through it.
  const monasAhead = (terrain.monas.x - planeView.x) * dirX;
  if (monasAhead > 0 && monasAhead < 350 && planeView.y > 200) {
    tx = planeView.x + 250 * dirX;
    ty = 130;
  }

  const dx = tx - planeView.x;
  let dy = ty - planeView.y;
  if (planeView.y > 470 && ty < 450) dy = -220;
  const dyCapped = Math.max(-180, Math.min(180, dy * 0.8));
  const wanted = Math.atan2(dyCapped, dx);
  let err = wanted - planeView.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const turn = Math.max(-1, Math.min(1, err * 2.4));
  const dist = Math.hypot(dx, dy);
  const throttle = Math.max(-1, Math.min(1, (cruiseSpeed - planeView.speed) / 80));
  const brake = dist < 180 && planeView.speed > 150 && cruiseSpeed <= 200;
  return { throttle, turn, brake };
}

/**
 * Stage the named scene and return the frozen state to render.
 * Names: menu | cover | parcel | storm | landing (anything else is cover).
 * Every scene is staged through photo-mode machinery: the sim is played
 * forward to a chosen mission beat, then FROZEN, and the camera is placed by
 * hand — so each frame is a composed shot, not a random gameplay grab.
 */
export function stageShot(name, game) {
  const { plane, planeView, syncPlaneView, terrain, missions, startMission } = game;
  game.time = 0;
  game.wind = { x: 0, y: 0, gustTimer: 0, gustAngle: 0, gustStrength: 0 };
  game.camera = createCamera();
  game.trail = [];
  game._trailTick = 0;
  let screen = SCREENS.PLAY;
  let screenData = {};

  if (name === 'menu') {
    // Bright attract-mode frame: Parcel Drop flying behind a translucent
    // panel, the parcel crate slung under the fuselage. The world stays
    // FULLY LIT — no black dim — with the plane right-of-centre between the
    // title band (top) and the mission cards (bottom).
    missions.selectMission(1);
    game.rings = freshRings(game, 1);
    plane.reset(1);
    syncPlaneView();
    for (let i = 0; i < 6 / STEP; i++) {
      const target = getNextRing(game.rings) || { x: 640, y: 300 };
      const input = autopilot(game, target, 280, STEP);
      stepScene(game, input, STEP);
    }
    // Freeze a clean, level eastbound frame with the parcel aboard.
    plane.repair();
    syncPlaneView();
    planeView.x = 700;
    planeView.y = 300;
    planeView.heading = 0.1;
    planeView.roll = 0;
    planeView.pitch = 0.03;
    planeView.throttle = 0.65;
    // Camera places the plane right-of-centre (screen ~790, 490): clear of
    // the title band above and the mission cards below.
    game.camera.x = 550;
    game.camera.y = 170;
    game.camera.vx = 0;
    game.camera.vy = 0;
    screen = SCREENS.TITLE;
    return { time: game.time, screen, screenData, rings: game.rings, camera: game.camera, trail: game.trail };
  }

  if (name === 'cover') {
    // Cover: Ring Run mission, recomposed — not panned. Plane lower-centre,
    // runway + approach lights leading in from bottom-centre, skyline across
    // the full lower half, rings in a plane → next ring → Monas triangle.
    // ONE branched bolt strikes Monas only; nothing crosses the plane.
    startMission(0);
    const cap = SHOT_SCENES.play;
    for (let t = 0; t < cap / STEP; t++) {
      const next = getNextRing(game.rings);
      if (!next) break;
      const input = autopilot(game, next, 280, STEP);
      stepScene(game, input, STEP);
      // Stop after 3rd ring passed so several rings and city stay ahead
      if (missions.getMissionProgress().objectives.ringsPassed >= 3) break;
    }
    // Freeze a clean level frame: plane lower-centre, eastbound, slight
    // nose-up, throttle up — the hero moment, not a random mid-turn frame.
    plane.repair();
    syncPlaneView();
    planeView.x = 400;
    planeView.y = 400;
    planeView.heading = 0.05;
    planeView.roll = 0;
    planeView.pitch = 0.05;
    planeView.throttle = 0.7;
    planeView.flaps = false;
    // Hand-placed camera: plane at screen (580, 415), runway strip at
    // screen y ≈ 650 (clear of the flight-plan strip), Monas at (820, 235),
    // next ring at (775, 185).
    game.camera.x = 460;
    game.camera.y = 345;
    game.camera.vx = 0;
    game.camera.vy = 0;
    // One bolt, striking Monas only, flash capped low (0.2) so the sky
    // stays night instead of washing pale grey.
    game.camera.lightningFlash = 0.2;
    game.camera.lightningBolts = [createMonasBolt(terrain.monas.x, terrain.monas.y - 16)];
    return { time: game.time, screen, screenData, rings: game.rings, camera: game.camera, trail: game.trail };
  }

  if (name === 'parcel') {
    // Parcel Drop: fly the rings from the normal spawn, then the pad.
    startMission(1);
    const pad = getPadPosition(terrain);
    // Long cap (60s): the approach overshoots the pad at speed and must
    // circle back at delivery speed to line up — the old 26s cap (plus the
    // 20s escape) froze the frame mid-overshoot with no pad in view.
    const cap = 60;
    for (let t = 0; t < cap / STEP; t++) {
      const next = getNextRing(game.rings);
      const progress = missions.getMissionProgress();
      const isLastRing = !!next && progress.objectives.ringsPassed >= progress.objectives.ringsTotal - 1;
      const target = next || { x: pad.padX, y: pad.padY - 40 };
      const cruise = next ? (isLastRing ? 200 : 280) : 130;
      const input = autopilot(game, target, cruise, STEP);
      stepScene(game, input, STEP);
      if (!next && missions.getMissionProgress().objectives.parcelDelivered) break;
    }
    // Fly on past the pad (~1.5s) so the frozen frame shows the plane clear
    // of the pad: otherwise the plane sits exactly on top of the green
    // "DROP PAD" ring and its label and the pad reads as a smudge.
    for (let i = 0; i < 90; i++) {
      const input = autopilot(game, { x: pad.padX + 250, y: pad.padY - 60 }, 200, STEP);
      stepScene(game, input, STEP);
    }
    // Freeze a clean delivery frame: repaired, level, gentle east descent.
    plane.repair();
    syncPlaneView();
    planeView.heading = 0.12;
    planeView.roll = 0;
    planeView.pitch = 0.04;
    return { time: game.time, screen, screenData, rings: game.rings, camera: game.camera, trail: game.trail };
  }

  if (name === 'storm') {
    // Storm Return (mission 2): rain + lightning + magenta rings, westbound
    // for home. The storm leg v2.3 never showed in any submitted shot despite
    // "Storm Run" in the title — this is its frame. Damage is staged at 35
    // (amber bar + red edge flash) so damage reads as a real mechanic.
    startMission(2);
    const cap = 30;
    for (let t = 0; t < cap / STEP; t++) {
      const next = getNextRing(game.rings);
      if (!next) break;
      const input = autopilot(game, next, 260, STEP);
      stepScene(game, input, STEP);
      if (missions.getMissionProgress().objectives.ringsPassed >= 3) break;
    }
    // Freeze a level westbound beat — the mirror fix keeps the plane upright
    // and "BNZ" readable on this heading; without it this frame inverted.
    plane.repair();
    plane.applyDamage(35);
    syncPlaneView();
    planeView.x = 520;
    planeView.y = 280;
    planeView.heading = Math.PI;
    planeView.roll = 0.04;
    planeView.pitch = 0.03;
    planeView.throttle = 0.75;
    planeView.flaps = false;
    // Camera: plane at screen (600, 295), next magenta ring ahead-left at
    // (510, 295), runway strip bottom-left, Monas at (720, 235). The plane
    // sits 25 px clear of the Monas bolt — the bolt never touches the plane.
    game.camera.x = 560;
    game.camera.y = 345;
    game.camera.vx = 0;
    game.camera.vy = 0;
    game.camera.lightningFlash = 0.2;
    game.camera.lightningBolts = [createMonasBolt(terrain.monas.x, terrain.monas.y - 16)];
    return { time: game.time, screen, screenData, rings: game.rings, camera: game.camera, trail: game.trail };
  }

  if (name === 'landing') {
    // Dawn Landing (mission 3): start east of the runway, fly the rings, then final approach.
    startMission(3);
    plane.place(1050, 200, Math.PI);
    syncPlaneView();
    const runway = { x: 190, y: terrain.groundY - 14 };
    const cap = 30;
    for (let t = 0; t < cap / STEP; t++) {
      const next = getNextRing(game.rings);
      const target = next || runway;
      const cruise = next ? 260 : 180;
      const input = autopilot(game, target, cruise, STEP);
      stepScene(game, input, STEP);
      const dist = Math.hypot(planeView.x - runway.x, planeView.y - runway.y);
      if (!next && dist < 170) break;
      if (missions.getMissionProgress().objectives.landed) break;
    }
    // Advance dawn progress for the screenshot
    game.camera.dawnProgress = 0.8;
    // Reconcile the rings with the scored count: the approach sim can fail
    // mid-flight (building clips → damage 100 → mission failed), after which
    // updateRings keeps marking rings passed while missions.update has
    // stopped scoring them — v2.4's first capture showed green rings 3+4
    // against a "RINGS 2/4" HUD. Rings past the scored count go back to
    // unpassed (orange, next-ring pulsing), so the frame and the HUD agree.
    const scored = missions.getMissionProgress().objectives.ringsPassed;
    game.rings.forEach((r, i) => { if (i >= scored) r.passed = false; });
    // Rebuild the minimap trail from the scored path — the failed sim's
    // wandering trail read as a scribble. The staged path is the ring path.
    game.trail = game.rings.filter((r) => r.passed).map((r) => ({ x: r.x, y: r.y }));
    // Freeze a clean landing frame: LEVEL ~3° nose-up flare, threading the
    // next ring on final, gear/flaps down, damage 0. Westbound heading PI
    // used to invert the sprite (the v2.3 crash read); the mirror fix keeps
    // it upright now — verify in pixels, never by trusting the heading value.
    plane.repair();
    syncPlaneView();
    planeView.x = 500;
    planeView.y = 400;
    planeView.heading = Math.PI;
    planeView.roll = 0;
    planeView.pitch = 0.05;
    planeView.throttle = 0.5;
    planeView.flaps = true;
    planeView.speed = 150;
    game.trail.push({ x: planeView.x, y: planeView.y });
    // Camera: plane at screen (640, 415), next ring just ahead-left at
    // (560, 430), runway strip at y ≈ 650 leading in from bottom-centre,
    // dawn sky filling the top two thirds.
    game.camera.x = 500;
    game.camera.y = 345;
    game.camera.vx = 0;
    game.camera.vy = 0;
    return { time: game.time, screen, screenData, rings: game.rings, camera: game.camera, trail: game.trail };
  }

  // Default: cover
  startMission(0);
  const cap = SHOT_SCENES.play;
  for (let t = 0; t < cap / STEP; t++) {
    const next = getNextRing(game.rings);
    if (!next) break;
    const input = autopilot(game, next, 280, STEP);
    stepScene(game, input, STEP);
    if (missions.getMissionProgress().objectives.ringsPassed >= 3) break;
  }
  return { time: game.time, screen, screenData, rings: game.rings, camera: game.camera, trail: game.trail };
}