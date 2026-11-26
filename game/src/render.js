// World rendering for Jakarta Night Courier: night sky, stars, moon, hills, sea,
// coastline, neon city with lit windows, Monas, runway, parcel pad, glowing rings,
// the cargo plane, contrails and storm rain. Everything is drawn from the
// generated terrain data — no images, no network.

import { FIELD, TERRAIN, PALETTE, RINGS } from './config.js';
import { getPadPosition } from './terrain.js';
import { getNextRing } from './rings.js';

/** Draw the whole world (sky to ground) plus the plane. */
export function drawWorld(ctx, terrain, rings, plane, time, missionId, storm) {
  drawSky(ctx, terrain, time);
  drawSea(ctx, terrain, time);
  drawGround(ctx, terrain);
  drawBuildings(ctx, terrain);
  drawMonas(ctx, terrain, time);
  drawRunway(ctx, terrain, time);
  drawPad(ctx, terrain, missionId, time);
  drawRings(ctx, rings, plane, time);
  drawContrails(ctx, plane);
  drawPlane(ctx, plane, time);
  if (storm) drawRain(ctx, time);
  drawVignette(ctx);
}

function drawSky(ctx, terrain, time) {
  const grad = ctx.createLinearGradient(0, 0, 0, FIELD.horizonY + 120);
  grad.addColorStop(0, PALETTE.skyTop);
  grad.addColorStop(0.55, PALETTE.skyMid);
  grad.addColorStop(1, PALETTE.skyHorizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, FIELD.width, FIELD.horizonY + 120);

  // Stars
  for (const star of terrain.stars) {
    const tw = 0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinklePhase);
    ctx.globalAlpha = star.brightness * tw;
    ctx.fillStyle = '#dfe8ff';
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
  ctx.globalAlpha = 1;

  // Moon with halo
  const mx = 1120;
  const my = 84;
  const halo = ctx.createRadialGradient(mx, my, 8, mx, my, 90);
  halo.addColorStop(0, 'rgba(220, 230, 255, 0.35)');
  halo.addColorStop(1, 'rgba(220, 230, 255, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 90, my - 90, 180, 180);
  ctx.beginPath();
  ctx.arc(mx, my, 26, 0, Math.PI * 2);
  ctx.fillStyle = '#e8eeff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(mx - 8, my - 5, 5, 0, Math.PI * 2);
  ctx.arc(mx + 7, my + 8, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(160, 175, 210, 0.5)';
  ctx.fill();

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

function drawSea(ctx, terrain, time) {
  const seaTop = terrain.groundY;
  const grad = ctx.createLinearGradient(0, seaTop, 0, FIELD.height);
  grad.addColorStop(0, PALETTE.seaTop);
  grad.addColorStop(0.5, PALETTE.seaMid);
  grad.addColorStop(1, PALETTE.seaSurface);
  ctx.fillStyle = grad;
  ctx.fillRect(terrain.coastX, seaTop, FIELD.width - terrain.coastX, FIELD.height - seaTop);

  // Moon glitter on the water
  ctx.save();
  ctx.beginPath();
  ctx.rect(terrain.coastX, seaTop, FIELD.width - terrain.coastX, FIELD.height - seaTop);
  ctx.clip();
  for (let i = 0; i < 26; i += 1) {
    const x = 1060 + Math.sin(i * 12.9898) * 60 + Math.sin(time * 0.7 + i) * 8;
    const y = seaTop + 6 + i * 2.4;
    ctx.globalAlpha = 0.12 + 0.1 * Math.sin(time * 1.3 + i * 2.1);
    ctx.fillStyle = '#cdd8ff';
    ctx.fillRect(x, y, 26 - i * 0.5, 1.6);
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // Wave lines
  ctx.strokeStyle = 'rgba(120, 160, 220, 0.25)';
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
  ctx.strokeStyle = 'rgba(0, 255, 204, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < terrain.coastline.length; i += 1) {
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

function drawBuildings(ctx, terrain) {
  for (const b of terrain.buildings) {
    // Body
    ctx.fillStyle = b.baseColor;
    ctx.fillRect(b.x, b.y, b.width, b.height);
    // Neon roof edge
    ctx.fillStyle = b.accentColor;
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
    // Lit windows
    for (const w of b.windows) {
      const warm = w.colorVariation > 0.6;
      ctx.globalAlpha = Math.max(0.15, Math.min(1, w.brightness));
      ctx.fillStyle = warm ? '#ffd27a' : PALETTE.windowLit;
      ctx.fillRect(b.x + w.x, b.y + w.y, w.w, w.h);
    }
    ctx.globalAlpha = 1;
  }
}

function drawMonas(ctx, terrain, time) {
  const m = terrain.monas;
  // Halo
  const halo = ctx.createRadialGradient(m.x, m.y + 40, 10, m.x, m.y + 40, 260);
  halo.addColorStop(0, 'rgba(255, 215, 0, 0.16)');
  halo.addColorStop(1, 'rgba(255, 215, 0, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(m.x - 260, m.y - 220, 520, 520);

  // Base
  ctx.fillStyle = '#101828';
  ctx.fillRect(m.x - m.baseWidth / 2, m.baseY - m.baseHeight, m.baseWidth, m.baseHeight);
  ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
  ctx.fillRect(m.x - m.baseWidth / 2, m.baseY - m.baseHeight, m.baseWidth, 2);

  // Shaft
  const shaft = ctx.createLinearGradient(m.x - m.width / 2, 0, m.x + m.width / 2, 0);
  shaft.addColorStop(0, '#0e1626');
  shaft.addColorStop(0.5, PALETTE.monasBody);
  shaft.addColorStop(1, '#0a101d');
  ctx.fillStyle = shaft;
  ctx.fillRect(m.x - m.width / 2, m.y, m.width, m.height);

  // Observation deck windows
  for (const dw of m.deckWindows) {
    if (!dw.lit) continue;
    ctx.fillStyle = 'rgba(255, 235, 150, 0.9)';
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

function drawRunway(ctx, terrain, time) {
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
  for (let i = 0; i < 4; i += 1) {
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
  // Runway label
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(230, 240, 255, 0.8)';
  ctx.fillText('RUNWAY 18', 190, y + 24);
}

function drawPad(ctx, terrain, missionId, time) {
  if (missionId !== 1) return;
  const { padX, padY, padWidth } = getPadPosition(terrain);
  const pulse = 0.55 + 0.45 * Math.sin(time * 3);
  ctx.save();
  ctx.strokeStyle = `rgba(0, 255, 136, ${pulse})`;
  ctx.lineWidth = 3;
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur = 16;
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
  ctx.fillStyle = `rgba(0, 255, 136, ${pulse})`;
  ctx.fillText('DROP PAD', padX, padY - padWidth / 2 - 10);
  ctx.restore();
}

function drawRings(ctx, rings, plane, time) {
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

    ctx.save();
    ctx.globalAlpha = pulse;
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

function drawContrails(ctx, plane) {
  for (const c of plane.contrails || []) {
    ctx.globalAlpha = Math.max(0, c.alpha * 0.5);
    ctx.fillStyle = '#cfe4ff';
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.size * (0.5 + c.age * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** The cargo plane, drawn pointing along its heading, with bank and nav lights. */
export function drawPlane(ctx, plane, time) {
  const { x, y, heading, roll, throttle, flaps } = plane;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading + roll * 0.35);

  // Engine exhaust glow
  if (throttle > 0.15) {
    const glow = ctx.createLinearGradient(-34, 0, -62, 0);
    glow.addColorStop(0, `rgba(120, 200, 255, ${0.25 + throttle * 0.45})`);
    glow.addColorStop(1, 'rgba(120, 200, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(-32, -4);
    ctx.lineTo(-62 - throttle * 22, 0);
    ctx.lineTo(-32, 4);
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

  // Wings (far wing darker)
  ctx.fillStyle = '#1d2f4a';
  ctx.beginPath();
  ctx.moveTo(-6, -4);
  ctx.lineTo(-16, -30);
  ctx.lineTo(-4, -30);
  ctx.lineTo(6, -4);
  ctx.closePath();
  ctx.fill();
  // Tail fin
  ctx.fillStyle = '#27405f';
  ctx.beginPath();
  ctx.moveTo(-30, 0);
  ctx.lineTo(-40, -16);
  ctx.lineTo(-32, -16);
  ctx.lineTo(-24, 0);
  ctx.closePath();
  ctx.fill();
  // Fuselage
  const body = ctx.createLinearGradient(0, -9, 0, 9);
  body.addColorStop(0, '#5b7ba6');
  body.addColorStop(0.5, '#33507a');
  body.addColorStop(1, '#1c3352');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(38, 0);
  ctx.quadraticCurveTo(28, -9, 4, -9);
  ctx.lineTo(-32, -7);
  ctx.quadraticCurveTo(-38, 0, -32, 7);
  ctx.lineTo(4, 9);
  ctx.quadraticCurveTo(28, 9, 38, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(180, 220, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Cockpit window (lit)
  ctx.fillStyle = '#bfe9ff';
  ctx.shadowColor = '#7fd4ff';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(30, -4);
  ctx.lineTo(20, -6);
  ctx.lineTo(14, -3);
  ctx.lineTo(22, 0);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  // Cargo door line + "BNZ" courier mark
  ctx.strokeStyle = 'rgba(200, 225, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(-6, -8);
  ctx.lineTo(-6, 8);
  ctx.stroke();
  ctx.font = '700 8px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd700';
  ctx.fillText('BNZ', 8, -11);
  // Near wing
  ctx.fillStyle = '#3a5c8a';
  ctx.beginPath();
  ctx.moveTo(-2, 4);
  ctx.lineTo(-14, 30);
  ctx.lineTo(-2, 30);
  ctx.lineTo(10, 4);
  ctx.closePath();
  ctx.fill();
  // Flaps indicator (brake)
  if (flaps) {
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(-16, 26, 12, 3);
  }
  // Nav lights: red port, green starboard, white strobe
  const blink = Math.sin(time * 6) > 0;
  ctx.fillStyle = '#ff3333';
  ctx.beginPath();
  ctx.arc(-14, -30, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#33ff66';
  ctx.beginPath();
  ctx.arc(-14, 30, 2.5, 0, Math.PI * 2);
  ctx.fill();
  if (blink) {
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(-38, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawRain(ctx, time) {
  ctx.save();
  ctx.strokeStyle = 'rgba(160, 190, 255, 0.28)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 90; i += 1) {
    const x = ((i * 137.5 + time * 420) % 1400) - 60;
    const y = ((i * 89.3 + time * 640) % 760) - 20;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 9, y + 22);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVignette(ctx) {
  const grad = ctx.createRadialGradient(640, 360, 320, 640, 360, 780);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
}
