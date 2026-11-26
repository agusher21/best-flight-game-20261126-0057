// World rendering for Jakarta Night Courier — Storm Run: night sky, stars, moon, hills, sea,
// coastline, neon city with lit windows, Monas, runway, parcel pad, glowing rings,
// the cargo plane, contrails, storm rain, lightning, and dawn transition.
// Everything is drawn from generated terrain data — no images, no network.

import { FIELD, TERRAIN, PALETTE, RINGS, CAMERA, LIGHTNING } from './config.js';
import { getPadPosition } from './terrain.js';
import { getNextRing } from './rings.js';

/** Camera state for smooth chase view. */
export function createCamera() {
  return {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    shakeX: 0,
    shakeY: 0,
    shakeUntil: 0,
    shakeMag: 0,
    lightningFlash: 0,      // 0-1 intensity of current lightning flash
    lightningBolts: [],     // Active lightning bolts to draw
    thunderQueue: [],       // Pending thunder sounds { time, intensity }
    dawnProgress: 0,        // 0 = night, 1 = full dawn
    rainDrops: [],          // Rain streaks on "lens"
  };
}

/** Update camera to follow plane with smoothing. */
export function updateCamera(camera, plane, dt, storm, hasDawn) {
  // Target position: behind and slightly below the plane
  const behindX = -Math.cos(plane.heading) * CAMERA.chaseDistance;
  const behindY = -Math.sin(plane.heading) * CAMERA.chaseDistance;
  const verticalOffset = CAMERA.verticalOffset;
  const lookAheadX = Math.cos(plane.heading) * CAMERA.lookAhead;
  const lookAheadY = Math.sin(plane.heading) * CAMERA.lookAhead;

  camera.targetX = plane.x + behindX + lookAheadX;
  camera.targetY = plane.y + behindY + lookAheadY + verticalOffset;

  // Smooth follow
  const s = CAMERA.smoothing;
  camera.x += (camera.targetX - camera.x) * s * 60 * dt;
  camera.y += (camera.targetY - camera.y) * s * 60 * dt;

  // Screen shake decay
  if (camera.shakeUntil > 0) {
    camera.shakeUntil -= dt;
    if (camera.shakeUntil <= 0) {
      camera.shakeMag = 0;
    } else {
      camera.shakeX = (Math.random() - 0.5) * camera.shakeMag;
      camera.shakeY = (Math.random() - 0.5) * camera.shakeMag;
    }
  }

  // Lightning flash decay
  if (camera.lightningFlash > 0) {
    camera.lightningFlash = Math.max(0, camera.lightningFlash - dt / LIGHTNING.flashDuration);
  }

  // Spawn lightning bolts during storm
  if (storm && camera.lightningFlash === 0) {
    camera.lightningTimer = (camera.lightningTimer || 0) - dt;
    if (camera.lightningTimer <= 0) {
      // Trigger a flash
      camera.lightningFlash = 1;
      camera.lightningTimer = LIGHTNING.flashInterval.min + Math.random() * (LIGHTNING.flashInterval.max - LIGHTNING.flashInterval.min);

      // Generate bolts
      const boltCount = 1 + Math.floor(Math.random() * LIGHTNING.maxBolts);
      camera.lightningBolts = [];
      for (let i = 0; i < boltCount; i++) {
        camera.lightningBolts.push(generateLightningBolt());
      }

      // Schedule thunder
      const delay = LIGHTNING.thunderDelay.min + Math.random() * (LIGHTNING.thunderDelay.max - LIGHTNING.thunderDelay.min);
      camera.thunderQueue.push({ time: delay, intensity: 0.5 + Math.random() * 0.5 });
    }
  }

  // Update existing bolts (they fade quickly)
  for (let i = camera.lightningBolts.length - 1; i >= 0; i--) {
    camera.lightningBolts[i].age += dt;
    if (camera.lightningBolts[i].age > camera.lightningBolts[i].life) {
      camera.lightningBolts.splice(i, 1);
    }
  }

  // Process thunder queue
  for (let i = camera.thunderQueue.length - 1; i >= 0; i--) {
    camera.thunderQueue[i].time -= dt;
    if (camera.thunderQueue[i].time <= 0) {
      camera.thunderQueue[i].ready = true;
    }
  }

  // Dawn progress for mission 3
  if (hasDawn) {
    camera.dawnProgress = Math.min(1, camera.dawnProgress + dt / 120); // 2 minutes to full dawn
  }

  // Rain drops on lens (storm only)
  if (storm) {
    camera.rainTimer = (camera.rainTimer || 0) - dt;
    while (camera.rainTimer <= 0) {
      camera.rainDrops.push({
        x: Math.random() * FIELD.width,
        y: -20,
        length: 15 + Math.random() * 25,
        speed: 400 + Math.random() * 300,
        alpha: 0.3 + Math.random() * 0.4,
      });
      camera.rainTimer = 0.02; // Spawn ~50 drops per second
    }

    for (let i = camera.rainDrops.length - 1; i >= 0; i--) {
      const drop = camera.rainDrops[i];
      drop.y += drop.speed * dt;
      if (drop.y > FIELD.height + 20) camera.rainDrops.splice(i, 1);
    }
  } else {
    camera.rainDrops = [];
  }
}

/** Generate a procedural lightning bolt. */
function generateLightningBolt() {
  const startX = Math.random() * FIELD.width;
  const startY = 0;
  const segments = [];
  let x = startX;
  let y = startY;
  const targetY = FIELD.height * 0.7 + Math.random() * FIELD.height * 0.3;

  while (y < targetY) {
    const segLength = 20 + Math.random() * 40;
    const angle = (Math.random() - 0.5) * 0.8 + Math.PI / 2; // Mostly down
    const nextX = x + Math.cos(angle) * segLength;
    const nextY = y + Math.sin(angle) * segLength;
    segments.push({ x1: x, y1: y, x2: nextX, y2: nextY });
    x = nextX;
    y = nextY;

    // Branches
    if (Math.random() < LIGHTNING.branchProbability) {
      const branchAngle = angle + (Math.random() - 0.5) * 1.5;
      const branchLength = segLength * 0.4;
      segments.push({
        x1: x,
        y1: y,
        x2: x + Math.cos(branchAngle) * branchLength,
        y2: y + Math.sin(branchAngle) * branchLength,
        isBranch: true,
      });
    }
  }

  return {
    segments,
    age: 0,
    life: 0.08 + Math.random() * 0.07, // 80-150ms
    intensity: 0.7 + Math.random() * 0.3,
  };
}

/** Apply camera shake. */
export function shakeCamera(camera, magnitude, duration) {
  camera.shakeMag = Math.max(camera.shakeMag, magnitude);
  camera.shakeUntil = Math.max(camera.shakeUntil, duration);
}

/** Check if thunder is ready to play and consume it. */
export function consumeThunder(camera) {
  for (let i = 0; i < camera.thunderQueue.length; i++) {
    if (camera.thunderQueue[i].ready) {
      const intensity = camera.thunderQueue[i].intensity;
      camera.thunderQueue.splice(i, 1);
      return intensity;
    }
  }
  return 0;
}

/** Get the camera transform for rendering. */
export function getCameraTransform(camera) {
  return {
    x: -camera.x + FIELD.width / 2 + (camera.shakeX || 0),
    y: -camera.y + FIELD.height / 2 + (camera.shakeY || 0),
  };
}

/** Draw the whole world (sky to ground) plus the plane. */
export function drawWorld(ctx, camera, terrain, rings, plane, time, missionId, storm, hasDawn) {
  const transform = getCameraTransform(camera);

  ctx.save();
  ctx.translate(transform.x, transform.y);

  drawSky(ctx, terrain, time, camera, hasDawn);
  drawSea(ctx, terrain, time, camera, hasDawn);
  drawGround(ctx, terrain);
  drawBuildings(ctx, terrain, camera, hasDawn);
  drawMonas(ctx, terrain, time, camera);
  drawRunway(ctx, terrain, time, camera);
  drawPad(ctx, terrain, missionId, time, camera);
  drawRings(ctx, rings, plane, time, camera);
  drawContrails(ctx, plane, camera);
  drawPlane(ctx, plane, time, camera);

  if (storm) drawRain(ctx, camera, time);
  if (camera.lightningFlash > 0 || camera.lightningBolts.length > 0) {
    drawLightning(ctx, camera);
  }
  if (hasDawn) drawDawnGlow(ctx, camera);

  drawVignette(ctx);

  ctx.restore();

  // Rain on lens (drawn in screen space, not world space)
  if (storm && camera.rainDrops.length > 0) {
    drawRainOnLens(ctx, camera);
  }
}

function drawSky(ctx, terrain, time, camera, hasDawn) {
  // Base night sky
  const grad = ctx.createLinearGradient(0, 0, 0, FIELD.horizonY + 120);
  if (hasDawn && camera.dawnProgress > 0) {
    const p = camera.dawnProgress;
    grad.addColorStop(0, lerpColor(PALETTE.skyTop, PALETTE.skyDawn, p));
    grad.addColorStop(0.55, lerpColor(PALETTE.skyMid, '#1a102a', p));
    grad.addColorStop(1, lerpColor(PALETTE.skyHorizon, PALETTE.skyDawnHorizon, p));
  } else {
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.55, PALETTE.skyMid);
    grad.addColorStop(1, PALETTE.skyHorizon);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(-FIELD.width, -FIELD.height, FIELD.width * 3, FIELD.horizonY + 120);

  // Lightning flash brightens the whole sky
  if (camera.lightningFlash > 0) {
    const flashAlpha = camera.lightningFlash * 0.6;
    ctx.fillStyle = `rgba(180, 220, 255, ${flashAlpha})`;
    ctx.fillRect(-FIELD.width, -FIELD.height, FIELD.width * 3, FIELD.height * 2);
  }

  // Stars (fade at dawn)
  const starAlpha = hasDawn ? 1 - camera.dawnProgress : 1;
  for (const star of terrain.stars) {
    const tw = 0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinklePhase);
    ctx.globalAlpha = star.brightness * tw * starAlpha;
    ctx.fillStyle = '#dfe8ff';
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
  ctx.globalAlpha = 1;

  // Moon (sets at dawn)
  if (!hasDawn || camera.dawnProgress < 0.8) {
    const mx = 1120;
    const my = 84;
    const moonAlpha = hasDawn ? 1 - camera.dawnProgress / 0.8 : 1;
    const halo = ctx.createRadialGradient(mx, my, 8, mx, my, 90);
    halo.addColorStop(0, `rgba(220, 230, 255, ${0.35 * moonAlpha})`);
    halo.addColorStop(1, 'rgba(220, 230, 255, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(mx - 90, my - 90, 180, 180);
    ctx.globalAlpha = moonAlpha;
    ctx.beginPath();
    ctx.arc(mx, my, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#e8eeff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mx - 8, my - 5, 5, 0, Math.PI * 2);
    ctx.arc(mx + 7, my + 8, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(160, 175, 210, 0.5)';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Dawn sun rising
  if (hasDawn && camera.dawnProgress > 0.3) {
    const sunProgress = (camera.dawnProgress - 0.3) / 0.7;
    const sunX = 1120;
    const sunY = 100 + (1 - sunProgress) * 120; // Rises from horizon
    const sunAlpha = Math.min(1, sunProgress * 2);

    const sunHalo = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 150);
    sunHalo.addColorStop(0, `rgba(255, 150, 80, ${0.4 * sunAlpha})`);
    sunHalo.addColorStop(1, 'rgba(255, 150, 80, 0)');
    ctx.fillStyle = sunHalo;
    ctx.fillRect(sunX - 150, sunY - 150, 300, 300);

    ctx.globalAlpha = sunAlpha;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 35, 0, Math.PI * 2);
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 35);
    sunGrad.addColorStop(0, '#fff8e0');
    sunGrad.addColorStop(0.5, '#ffaa40');
    sunGrad.addColorStop(1, '#ff6b35');
    ctx.fillStyle = sunGrad;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Far hills on the horizon
  for (const hill of terrain.hills) {
    ctx.fillStyle = hill.color;
    ctx.beginPath();
    ctx.moveTo(hill.x - hill.width / 2, hill.baseY);
    ctx.quadraticCurveTo(hill.x, hill.baseY - hill.height, hill.x + hill.width / 2, hill.baseY);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSea(ctx, terrain, time, camera, hasDawn) {
  const seaTop = terrain.groundY;

  if (hasDawn && camera.dawnProgress > 0) {
    const p = camera.dawnProgress;
    const grad = ctx.createLinearGradient(0, seaTop, 0, FIELD.height);
    grad.addColorStop(0, lerpColor(PALETTE.seaTop, PALETTE.seaDawn, p));
    grad.addColorStop(0.5, lerpColor(PALETTE.seaMid, '#2a1a3a', p));
    grad.addColorStop(1, lerpColor(PALETTE.seaSurface, '#1a1020', p));
    ctx.fillStyle = grad;
  } else {
    const grad = ctx.createLinearGradient(0, seaTop, 0, FIELD.height);
    grad.addColorStop(0, PALETTE.seaTop);
    grad.addColorStop(0.5, PALETTE.seaMid);
    grad.addColorStop(1, PALETTE.seaSurface);
    ctx.fillStyle = grad;
  }
  ctx.fillRect(terrain.coastX, seaTop, FIELD.width - terrain.coastX, FIELD.height - seaTop);

  // Moon/sun glitter on the water
  ctx.save();
  ctx.beginPath();
  ctx.rect(terrain.coastX, seaTop, FIELD.width - terrain.coastX, FIELD.height - seaTop);
  ctx.clip();

  if (hasDawn && camera.dawnProgress > 0.3) {
    // Sun reflection
    const sunProgress = (camera.dawnProgress - 0.3) / 0.7;
    const sunX = 1120;
    const sunY = 100 + (1 - sunProgress) * 120;
    for (let i = 0; i < 30; i++) {
      const x = sunX + Math.sin(i * 12.9898) * 80 + Math.sin(time * 0.7 + i) * 12;
      const y = seaTop + 20 + i * 3;
      ctx.globalAlpha = (0.15 + 0.1 * Math.sin(time * 1.3 + i * 2.1)) * Math.min(1, sunProgress * 2);
      ctx.fillStyle = '#ffcc88';
      ctx.fillRect(x, y, 30 - i * 0.6, 2);
    }
  } else {
    // Moon reflection
    for (let i = 0; i < 26; i++) {
      const x = 1060 + Math.sin(i * 12.9898) * 60 + Math.sin(time * 0.7 + i) * 8;
      const y = seaTop + 6 + i * 2.4;
      ctx.globalAlpha = 0.12 + 0.1 * Math.sin(time * 1.3 + i * 2.1);
      ctx.fillStyle = '#cdd8ff';
      ctx.fillRect(x, y, 26 - i * 0.5, 1.6);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // Lightning reflection on water
  if (camera.lightningFlash > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(terrain.coastX, seaTop, FIELD.width - terrain.coastX, FIELD.height - seaTop);
    ctx.clip();
    ctx.fillStyle = `rgba(180, 220, 255, ${camera.lightningFlash * 0.4})`;
    ctx.fillRect(terrain.coastX, seaTop, FIELD.width - terrain.coastX, FIELD.height - seaTop);
    ctx.restore();
  }

  // Wave lines
  ctx.strokeStyle = hasDawn ? 'rgba(180, 140, 100, 0.2)' : 'rgba(120, 160, 220, 0.25)';
  ctx.lineWidth = 1;
  for (const wave of terrain.seaWaves) {
    ctx.beginPath();
    for (let x = terrain.coastX + 10; x < FIELD.width - 10; x += 14) {
      const y = seaTop + 14 + Math.sin(x * wave.frequency + wave.phase) * wave.amplitude * 0.4;
      if (x === terrain.coastX + 10) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Coastline glow
  ctx.strokeStyle = hasDawn ? 'rgba(255, 150, 80, 0.3)' : 'rgba(0, 255, 204, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < terrain.coastline.length; i++) {
    const p = terrain.coastline[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function drawGround(ctx, terrain) {
  // City ground: dark strip under the skyline, with a faint street glow.
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, terrain.groundY, terrain.coastX, FIELD.height - terrain.groundY);
  ctx.fillStyle = 'rgba(255, 200, 90, 0.10)';
  ctx.fillRect(0, terrain.groundY, terrain.coastX, 3);
}

function drawBuildings(ctx, terrain, camera, hasDawn) {
  for (const b of terrain.buildings) {
    // Body
    let baseColor = b.baseColor;
    let accentColor = b.accentColor;

    // Dawn tint
    if (hasDawn && camera.dawnProgress > 0) {
      const p = camera.dawnProgress * 0.5;
      baseColor = lerpColor(baseColor, '#2a2030', p);
      accentColor = lerpColor(accentColor, '#4a3040', p);
    }

    // Lightning illumination
    if (camera.lightningFlash > 0) {
      const flash = camera.lightningFlash;
      baseColor = lerpColor(baseColor, '#3a5a8a', flash * 0.8);
      accentColor = lerpColor(accentColor, '#5a8acc', flash * 0.8);
    }

    ctx.fillStyle = baseColor;
    ctx.fillRect(b.x, b.y, b.width, b.height);

    // Neon roof edge
    ctx.fillStyle = accentColor;
    ctx.fillRect(b.x, b.y, b.width, 3);

    // Antenna / roof details
    if (b.roofType === 1) {
      ctx.strokeStyle = b.roofColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x + b.width / 2, b.y);
      ctx.lineTo(b.x + b.width / 2, b.y - 16);
      ctx.stroke();
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(b.x + b.width / 2, b.y - 18, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.roofType === 2) {
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(b.x + b.width / 2, b.y + 6, 7, 0, Math.PI * 2);
      ctx.stroke();
    } else if (b.roofType === 3) {
      ctx.fillStyle = b.roofColor;
      ctx.fillRect(b.x + 4, b.y - 5, 8, 5);
      ctx.fillRect(b.x + b.width - 12, b.y - 5, 8, 5);
    }

    // Lit windows (brighten during lightning)
    const flashBoost = camera.lightningFlash * 0.5;
    for (const w of b.windows) {
      const warm = w.colorVariation > 0.6;
      const brightness = Math.max(0.15, Math.min(1, w.brightness + flashBoost));
      ctx.globalAlpha = brightness;
      ctx.fillStyle = warm ? '#ffd27a' : PALETTE.windowLit;
      ctx.fillRect(b.x + w.x, b.y + w.y, w.w, w.h);
    }
    ctx.globalAlpha = 1;

    // Building reflections on wet streets during storm
    if (camera.lightningFlash > 0) {
      ctx.globalAlpha = camera.lightningFlash * 0.15;
      ctx.fillStyle = '#88ccff';
      ctx.fillRect(b.x, terrain.groundY - 2, b.width, 2);
      ctx.globalAlpha = 1;
    }
  }
}

function drawMonas(ctx, terrain, time, camera) {
  const m = terrain.monas;

  // Lightning illuminates Monas dramatically
  const flashBoost = camera.lightningFlash;

  // Halo
  const halo = ctx.createRadialGradient(m.x, m.y + 40, 10, m.x, m.y + 40, 260);
  halo.addColorStop(0, `rgba(255, 215, 0, ${0.16 + flashBoost * 0.2})`);
  halo.addColorStop(1, 'rgba(255, 215, 0, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(m.x - 260, m.y - 220, 520, 520);

  // Base
  ctx.fillStyle = '#101828';
  ctx.fillRect(m.x - m.baseWidth / 2, m.baseY - m.baseHeight, m.baseWidth, m.baseHeight);
  ctx.fillStyle = `rgba(255, 215, 0, ${0.5 + flashBoost * 0.3})`;
  ctx.fillRect(m.x - m.baseWidth / 2, m.baseY - m.baseHeight, m.baseWidth, 2);

  // Shaft
  const shaft = ctx.createLinearGradient(m.x - m.width / 2, 0, m.x + m.width / 2, 0);
  shaft.addColorStop(0, '#0e1626');
  shaft.addColorStop(0.5, PALETTE.monasBody);
  shaft.addColorStop(1, '#0a101d');
  ctx.fillStyle = shaft;
  ctx.fillRect(m.x - m.width / 2, m.y, m.width, m.height);

  // Lightning highlight on Monas shaft
  if (flashBoost > 0) {
    ctx.fillStyle = `rgba(180, 220, 255, ${flashBoost * 0.4})`;
    ctx.fillRect(m.x - m.width / 2, m.y, m.width, m.height);
  }

  // Observation deck windows
  for (const dw of m.deckWindows) {
    if (!dw.lit) continue;
    ctx.fillStyle = `rgba(255, 235, 150, ${0.9 + flashBoost * 0.1})`;
    ctx.fillRect(m.x + dw.x, dw.y, 3, 4);
  }

  // Golden flame (cup + flickering particles)
  ctx.fillStyle = PALETTE.monasTop;
  ctx.beginPath();
  ctx.moveTo(m.x - 14, m.y + 4);
  ctx.lineTo(m.x + 14, m.y + 4);
  ctx.lineTo(m.x + 8, m.y - 12);
  ctx.lineTo(m.x - 8, m.y - 12);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = PALETTE.monasGlow;
  ctx.shadowBlur = 18;
  ctx.fillStyle = PALETTE.monasGlow;
  ctx.beginPath();
  ctx.arc(m.x, m.y - 16, 7 + Math.sin(time * 6) * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  for (const p of m.flame.particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Label
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 215, 0, 0.85)';
  ctx.fillText('MONAS', m.x, m.baseY + 16);
}

function drawRunway(ctx, terrain, time, camera) {
  const y = terrain.runwayY;
  const x0 = 190 - 150;
  const x1 = 190 + 150;

  // Asphalt strip
  ctx.fillStyle = '#141a26';
  ctx.fillRect(x0, y - 6, 600, 12);

  // Centreline dashes
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  for (let x = x0 + 12; x < x1 - 12; x += 40) {
    ctx.fillRect(x, y - 1, 20, 2);
  }

  // Threshold bars
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(x0 + 6 + i * 10, y - 5, 5, 10);
    ctx.fillRect(x1 - 30 + i * 10, y - 5, 5, 10);
  }

  // Edge lights (blinking softly)
  const blink = 0.6 + 0.4 * Math.sin(time * 2.4);
  ctx.fillStyle = `rgba(255, 255, 255, ${blink})`;
  for (let x = x0 + 10; x <= x1 - 10; x += 50) {
    ctx.beginPath();
    ctx.arc(x, y - 8, 2.5, 0, Math.PI * 2);
    ctx.arc(x, y + 8, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Approach lights (strobing toward the runway)
  ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + 0.3 * Math.sin(time * 10)})`;
  for (let i = 0; i < 6; i++) {
    const lx = x0 - 30 - i * 40;
    ctx.beginPath();
    ctx.arc(lx, y - 5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx, y + 5, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // PAPI lights (precision approach)
  ctx.fillStyle = '#ff4444';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(x0 - 60, y - 25 + i * 8, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Runway label
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(230, 240, 255, 0.8)';
  ctx.fillText('RUNWAY 18', 190, y + 24);
}

function drawPad(ctx, terrain, missionId, time, camera) {
  if (missionId !== 1) return;
  const { padX, padY, padWidth } = getPadPosition(terrain);
  const pulse = 0.55 + 0.45 * Math.sin(time * 3);

  // Lightning boost
  const flashBoost = camera.lightningFlash * 0.5;

  ctx.save();
  ctx.strokeStyle = `rgba(0, 255, 136, ${pulse + flashBoost})`;
  ctx.lineWidth = 3;
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur = 16 + flashBoost * 20;
  ctx.beginPath();
  ctx.arc(padX, padY - 4, padWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(padX - 10, padY - 4);
  ctx.lineTo(padX + 10, padY - 4);
  ctx.moveTo(padX, padY - 14);
  ctx.lineTo(padX, padY + 6);
  ctx.stroke();
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(0, 255, 136, ${pulse + flashBoost})`;
  ctx.fillText('DROP PAD', padX, padY - padWidth / 2 - 10);
  ctx.restore();
}

function drawRings(ctx, rings, plane, time, camera) {
  const next = getNextRing(rings);
  // Guide line from the plane to the next ring
  if (next) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(plane.x, plane.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    ctx.restore();
  }

  for (const ring of rings) {
    if (ring.passed) continue;
    const pulse = 0.75 + 0.25 * Math.sin(time * RINGS.pulseSpeed + ring.pulsePhase);
    const isNext = ring === next;
    const radius = ring.radius * (isNext ? 1 + 0.04 * Math.sin(time * 4) : 1);

    // Light beam for the next ring
    if (isNext) {
      const beam = ctx.createLinearGradient(ring.x, ring.y - 260, ring.x, ring.y + 40);
      beam.addColorStop(0, 'rgba(0, 255, 255, 0)');
      beam.addColorStop(1, 'rgba(0, 255, 255, 0.14)');
      ctx.fillStyle = beam;
      ctx.fillRect(ring.x - 5, ring.y - 260, 10, 300);
    }

    // Lightning makes rings glow brighter
    const flashBoost = camera.lightningFlash * 0.5;
    const effectivePulse = Math.min(1, pulse + flashBoost);

    ctx.save();
    ctx.globalAlpha = effectivePulse;
    ctx.strokeStyle = ring.colorPrimary;
    ctx.lineWidth = isNext ? 7 : 5;
    ctx.shadowColor = ring.colorGlow;
    ctx.shadowBlur = isNext ? 26 : 16;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.innerRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Ring posts
    for (const post of ring.posts) {
      ctx.fillStyle = post.hit ? '#ff5544' : ring.colorPrimary;
      ctx.beginPath();
      ctx.arc(post.x, post.y, post.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ring number + label
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = ring.colorPrimary;
    ctx.shadowColor = ring.colorGlow;
    ctx.shadowBlur = 10;
    ctx.fillText(`${ring.index + 1}`, ring.x, ring.y - radius - 10);
    ctx.shadowBlur = 0;

    // Particles
    for (const p of ring.particles) {
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = ring.colorPrimary;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawContrails(ctx, plane, camera) {
  for (const c of plane.contrails || []) {
    ctx.globalAlpha = Math.max(0, c.alpha * 0.5);
    ctx.fillStyle = '#cfe4ff';
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.size * (0.5 + c.age * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** The cargo plane, drawn larger for closer chase camera. */
export function drawPlane(ctx, plane, time, camera) {
  const { x, y, heading, roll, throttle, flaps } = plane;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading + roll * 0.35);

  // Engine exhaust glow (larger for closer view)
  if (throttle > 0.15) {
    const glow = ctx.createLinearGradient(-40, 0, -80, 0);
    glow.addColorStop(0, `rgba(120, 200, 255, ${0.3 + throttle * 0.5})`);
    glow.addColorStop(1, 'rgba(120, 200, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(-38, -5);
    ctx.lineTo(-80 - throttle * 30, 0);
    ctx.lineTo(-38, 5);
    ctx.closePath();
    ctx.fill();
  }

  // Shadow under the plane (on the ground far below, faint)
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(x + 14, 640, 46, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading + roll * 0.35);

  // Wings (far wing darker) — SCALED UP ~2.5x
  ctx.fillStyle = '#1d2f4a';
  ctx.beginPath();
  ctx.moveTo(-8, -6);
  ctx.lineTo(-40, -75);
  ctx.lineTo(-10, -75);
  ctx.lineTo(8, -6);
  ctx.closePath();
  ctx.fill();

  // Tail fin
  ctx.fillStyle = '#27405f';
  ctx.beginPath();
  ctx.moveTo(-75, 0);
  ctx.lineTo(-100, -40);
  ctx.lineTo(-80, -40);
  ctx.lineTo(-60, 0);
  ctx.closePath();
  ctx.fill();

  // Fuselage
  const body = ctx.createLinearGradient(0, -22, 0, 22);
  body.addColorStop(0, '#5b7ba6');
  body.addColorStop(0.5, '#33507a');
  body.addColorStop(1, '#1c3352');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(95, 0);
  ctx.quadraticCurveTo(70, -22, 10, -22);
  ctx.lineTo(-80, -18);
  ctx.quadraticCurveTo(-95, 0, -80, 18);
  ctx.lineTo(10, 22);
  ctx.quadraticCurveTo(70, 22, 95, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(180, 220, 255, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cockpit window (lit) — larger
  ctx.fillStyle = '#bfe9ff';
  ctx.shadowColor = '#7fd4ff';
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.moveTo(75, -10);
  ctx.lineTo(50, -15);
  ctx.lineTo(35, -8);
  ctx.lineTo(55, 0);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // Cargo door line + "BNZ" courier mark — larger text
  ctx.strokeStyle = 'rgba(200, 225, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(-15, -20);
  ctx.lineTo(-15, 20);
  ctx.stroke();
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd700';
  ctx.fillText('BNZ', 20, -28);

  // Near wing
  ctx.fillStyle = '#3a5c8a';
  ctx.beginPath();
  ctx.moveTo(-3, 10);
  ctx.lineTo(-35, 75);
  ctx.lineTo(-5, 75);
  ctx.lineTo(25, 10);
  ctx.closePath();
  ctx.fill();

  // Flaps indicator (brake) — larger
  if (flaps) {
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(-40, 65, 30, 8);
  }

  // Nav lights: red port, green starboard, white strobe
  const blink = Math.sin(time * 6) > 0;
  ctx.fillStyle = '#ff3333';
  ctx.beginPath();
  ctx.arc(-35, -75, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#33ff66';
  ctx.beginPath();
  ctx.arc(-35, 75, 6, 0, Math.PI * 2);
  ctx.fill();
  if (blink) {
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(-95, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawRain(ctx, camera, time) {
  ctx.save();
  ctx.strokeStyle = 'rgba(160, 190, 255, 0.28)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 150; i++) {
    const x = ((i * 137.5 + time * 420) % 1400) - 60;
    const y = ((i * 89.3 + time * 640) % 760) - 20;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 12, y + 30);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLightning(ctx, camera) {
  // Full-screen flash
  if (camera.lightningFlash > 0) {
    const flashAlpha = camera.lightningFlash * 0.5;
    const flashGrad = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    flashGrad.addColorStop(0, `rgba(200, 230, 255, ${flashAlpha})`);
    flashGrad.addColorStop(0.5, `rgba(150, 200, 255, ${flashAlpha * 0.5})`);
    flashGrad.addColorStop(1, `rgba(100, 150, 220, ${flashAlpha * 0.2})`);
    ctx.fillStyle = flashGrad;
    ctx.fillRect(-FIELD.width, -FIELD.height, FIELD.width * 3, FIELD.height * 2);
  }

  // Draw bolts
  for (const bolt of camera.lightningBolts) {
    const ageRatio = bolt.age / bolt.life;
    const alpha = bolt.intensity * (1 - ageRatio) * (1 - ageRatio); // Quadratic fade
    if (alpha <= 0) continue;

    for (const seg of bolt.segments) {
      const width = (seg.isBranch ? LIGHTNING.boltWidth * 0.5 : LIGHTNING.boltWidth) * (1 - ageRatio * 0.5);

      // Glow
      ctx.shadowColor = PALETTE.lightningGlow;
      ctx.shadowBlur = 20 * alpha;
      ctx.strokeStyle = `rgba(180, 220, 255, ${alpha})`;
      ctx.lineWidth = width + 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();

      // Core
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;
}

function drawDawnGlow(ctx, camera) {
  if (camera.dawnProgress <= 0) return;

  // Horizon glow
  const p = camera.dawnProgress;
  const horizonY = FIELD.horizonY + 120;

  const glow = ctx.createLinearGradient(0, horizonY - 100, 0, horizonY + 50);
  glow.addColorStop(0, `rgba(255, 107, 53, ${0.0})`);
  glow.addColorStop(0.5, `rgba(255, 150, 80, ${0.15 * p})`);
  glow.addColorStop(1, `rgba(255, 80, 40, ${0.3 * p})`);
  ctx.fillStyle = glow;
  ctx.fillRect(-FIELD.width, horizonY - 100, FIELD.width * 3, 150);

  // Crepuscular rays (god rays)
  if (p > 0.4) {
    ctx.save();
    ctx.globalAlpha = (p - 0.4) * 0.15;
    ctx.strokeStyle = '#ffaa40';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + (i - 2) * 0.15;
      const x = 640 + Math.cos(angle) * 400;
      const y = horizonY;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(640, horizonY - 200);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawRainOnLens(ctx, camera) {
  ctx.save();
  for (const drop of camera.rainDrops) {
    ctx.globalAlpha = drop.alpha;
    ctx.strokeStyle = 'rgba(200, 230, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(drop.x, drop.y);
    ctx.lineTo(drop.x - 8, drop.y + drop.length);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVignette(ctx) {
  const grad = ctx.createRadialGradient(0, 0, 320, 0, 0, 780);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = grad;
  ctx.fillRect(-FIELD.width, -FIELD.height, FIELD.width * 3, FIELD.height * 3);
}

/** Linear interpolation between two hex colors. */
function lerpColor(a, b, t) {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b_ = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b_.toString(16).padStart(2, '0')}`;
}
