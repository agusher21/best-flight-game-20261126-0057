// HUD (Heads Up Display) rendering for Jakarta Night Courier — Storm Run.
// Draws all flight instruments, gauges, and UI panels with glowing night-vision aesthetic.

import { FIELD, HUD, PALETTE, PLANE, MISSIONS, SCREENS, CAMERA, MINIMAP, ILS } from './config.js';

/** Draw text helper. */
function drawText(ctx, text, x, y, size, color, align = 'left', baseline = 'alphabetic', font = HUD.font) {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
}

function drawGlowText(ctx, text, x, y, size, color, glowColor, align = 'left') {
  ctx.font = `${size}px ${HUD.font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

/** Draw a glowing circular gauge (altitude, fuel, damage). */
function drawCircularGauge(ctx, cx, cy, radius, value, maxValue, label, color, glowColor, bgColor, segments = 12) {
  const pct = Math.max(0, Math.min(1, value / maxValue));
  const startAngle = -Math.PI * 0.75;
  const endAngle = Math.PI * 0.75;
  const sweep = endAngle - startAngle;

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.lineWidth = 8;
  ctx.strokeStyle = bgColor;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Value arc
  if (pct > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, startAngle + sweep * pct);
    ctx.lineWidth = 8;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Tick marks
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + (sweep * i / segments);
    const isMajor = i % 3 === 0;
    const tickLen = isMajor ? 12 : 6;
    const x1 = cx + Math.cos(angle) * (radius - 4);
    const y1 = cy + Math.sin(angle) * (radius - 4);
    const x2 = cx + Math.cos(angle) * (radius - 4 - tickLen);
    const y2 = cy + Math.sin(angle) * (radius - 4 - tickLen);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.strokeStyle = isMajor ? color : HUD.textMuted;
    ctx.stroke();
  }

  // Center value text
  drawGlowText(ctx, Math.round(value).toString(), cx, cy + radius * 0.3, radius * 0.6, color, glowColor, 'center');
  drawText(ctx, label, cx, cy + radius * 0.9, 11, HUD.textMuted, 'center');
}

/** Small dark backing plate so a label never fights the world behind it. */
function drawPlate(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(4, 8, 16, 0.78)';
  ctx.fillRect(x, y, w, h);
}

/** Draw a vertical tape gauge (speed, altimeter style).
 *  v2.4: tick labels flip outward — ALT (left column) labels to the right,
 *  SPD (right column) labels to the left, so no label is ever clipped by the
 *  frame edge; every label sits on a backing plate. */
function drawTapeGauge(ctx, x, y, width, height, value, maxValue, label, unit, color, glowColor, majorStep, minorStep, flip = false) {
  const pct = Math.max(0, Math.min(1, value / maxValue));
  const centerY = y + height / 2;

  // Background
  ctx.fillStyle = HUD.instrumentBg;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = HUD.instrumentBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  // Center line
  ctx.beginPath();
  ctx.moveTo(x, centerY);
  ctx.lineTo(x + width, centerY);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Tick marks and numbers (outward, on plates)
  const steps = Math.ceil(maxValue / majorStep);
  for (let i = 0; i <= steps; i++) {
    const tickValue = i * majorStep;
    const tickPct = tickValue / maxValue;
    const tickY = y + height - tickPct * height;

    if (tickY < y - 20 || tickY > y + height + 20) continue;

    const tickLen = 20;
    const tickX = flip ? x : x + width;

    ctx.beginPath();
    ctx.moveTo(tickX, tickY);
    ctx.lineTo(flip ? tickX - tickLen : tickX + tickLen, tickY);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();

    const text = `${tickValue}${unit}`;
    ctx.font = `12px ${HUD.font}`;
    const tw = ctx.measureText(text).width;
    if (flip) {
      drawPlate(ctx, tickX - tickLen - tw - 8, tickY - 8, tw + 8, 16);
      drawText(ctx, text, tickX - tickLen - 4, tickY + 4, 12, HUD.textMuted, 'right');
    } else {
      drawPlate(ctx, tickX + tickLen, tickY - 8, tw + 8, 16);
      drawText(ctx, text, tickX + tickLen + 4, tickY + 4, 12, HUD.textMuted, 'left');
    }
  }

  // Current value indicator (triangle on the outward side)
  const indicatorY = y + height - pct * height;
  ctx.beginPath();
  if (flip) {
    ctx.moveTo(x - 2, indicatorY);
    ctx.lineTo(x - 14, indicatorY - 6);
    ctx.lineTo(x - 14, indicatorY + 6);
  } else {
    ctx.moveTo(x + width + 2, indicatorY);
    ctx.lineTo(x + width + 14, indicatorY - 6);
    ctx.lineTo(x + width + 14, indicatorY + 6);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Digital readout at top, on a plate; label plate at the bottom.
  const valueText = `${Math.round(value)}${unit}`;
  ctx.font = `700 18px ${HUD.font}`;
  const vw = ctx.measureText(valueText).width;
  drawPlate(ctx, x + width / 2 - vw / 2 - 4, y + 4, vw + 8, 24);
  drawGlowText(ctx, valueText, x + width / 2, y + 22, 18, color, glowColor, 'center');
  drawPlate(ctx, x + width / 2 - 18, y + height - 20, 36, 16);
  drawText(ctx, label, x + width / 2, y + height - 8, 11, HUD.textMuted, 'center');
}

/** Heading tape (top centre) — replaces the old compass disc, whose digits
 *  sat inside the face mashed against the cardinal letters ("W079°E").
 *  A scrolling strip with cardinal letters, 15° ticks, a centre bug, and the
 *  digits in their own pill BELOW the tape, never inside it. */
function drawHeadingTape(ctx, cx, y, width, heading, color, glowColor) {
  const headingDeg = ((heading * 180 / Math.PI) + 450) % 360;
  const h = 28;
  const x0 = cx - width / 2;
  drawPlate(ctx, x0, y, width, h);
  ctx.strokeStyle = HUD.instrumentBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y, width, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y, width, h);
  ctx.clip();
  // 30° of heading visible each side of centre; 15° per 40 px.
  const pxPerDeg = 40 / 15;
  for (let d = -45; d <= 45; d += 5) {
    const deg = Math.round((headingDeg + d + 360) % 360);
    const px = cx + d * pxPerDeg;
    const isCardinal = deg % 90 === 0;
    const isMajor = deg % 15 === 0;
    const len = isCardinal ? 14 : isMajor ? 10 : 5;
    ctx.beginPath();
    ctx.moveTo(px, y + h);
    ctx.lineTo(px, y + h - len);
    ctx.lineWidth = isCardinal ? 2 : 1;
    ctx.strokeStyle = isCardinal ? color : HUD.textMuted;
    ctx.stroke();
    if (isCardinal) {
      const label = ['N', 'E', 'S', 'W'][deg / 90];
      drawText(ctx, label, px, y + 12, 12, color, 'center');
    } else if (isMajor) {
      drawText(ctx, `${deg}`, px, y + 12, 9, HUD.textMuted, 'center');
    }
  }
  ctx.restore();
  // Centre bug.
  ctx.beginPath();
  ctx.moveTo(cx, y + h - 2);
  ctx.lineTo(cx - 7, y + h + 8);
  ctx.lineTo(cx + 7, y + h + 8);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;
  // Digits in their own pill below the tape.
  const text = `${Math.round(headingDeg).toString().padStart(3, '0')}°`;
  ctx.font = `700 16px ${HUD.font}`;
  const tw = ctx.measureText(text).width;
  drawPlate(ctx, cx - tw / 2 - 10, y + h + 12, tw + 20, 24);
  ctx.strokeStyle = HUD.instrumentBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - tw / 2 - 10, y + h + 12, tw + 20, 24);
  drawGlowText(ctx, text, cx, y + h + 29, 16, color, glowColor, 'center');
}

/** Horizontal bar gauge (fuel / damage) — a labelled bar, never a clipped disc. */
function drawBarGauge(ctx, x, y, width, value, maxValue, label, color, glowColor) {
  const pct = Math.max(0, Math.min(1, value / maxValue));
  const labelW = 52;
  drawPlate(ctx, x, y, width + labelW + 46, 22);
  drawText(ctx, label, x + 4, y + 16, 12, HUD.textMuted, 'left');
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(x + labelW, y + 4, width, 14);
  if (pct > 0) {
    ctx.fillStyle = color;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 6;
    ctx.fillRect(x + labelW, y + 4, width * pct, 14);
    ctx.shadowBlur = 0;
  }
  ctx.strokeStyle = HUD.instrumentBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + labelW, y + 4, width, 14);
  drawText(ctx, `${Math.round(value)}`, x + labelW + width + 6, y + 16, 12, color, 'left');
}

/** Draw artificial horizon (attitude indicator). */
function drawAttitudeIndicator(ctx, cx, cy, radius, pitch, roll, color, glowColor) {
  const maxPitch = Math.PI / 3;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(roll);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();

  // Sky
  const skyGradient = ctx.createLinearGradient(0, -radius, 0, radius);
  skyGradient.addColorStop(0, '#1a2a4a');
  skyGradient.addColorStop(0.5, '#0a1424');
  skyGradient.addColorStop(1, '#050814');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  // Ground
  const groundGradient = ctx.createLinearGradient(0, 0, 0, radius);
  groundGradient.addColorStop(0, '#1a140a');
  groundGradient.addColorStop(1, '#0a0805');
  ctx.fillStyle = groundGradient;
  ctx.fillRect(-radius, 0, radius * 2, radius);

  // Pitch ladder lines
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let p = -maxPitch; p <= maxPitch; p += Math.PI / 18) {
    const y = p * radius / maxPitch * 1.2;
    if (Math.abs(y) > radius) continue;
    const width = 0.4 * radius * (1 - Math.abs(p) / maxPitch);
    ctx.beginPath();
    ctx.moveTo(-width / 2, y);
    ctx.lineTo(width / 2, y);
    ctx.stroke();
    if (Math.abs(p * 180 / Math.PI) % 20 < 0.01) {
      drawText(ctx, `${Math.round(-p * 180 / Math.PI)}`, width / 2 + 8, y + 4, 9, HUD.textMuted, 'left');
    }
  }

  ctx.restore();

  // Roll indicator (outer ring with triangle)
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 8, -Math.PI * 0.6, Math.PI * 0.6);
  ctx.lineWidth = 2;
  ctx.strokeStyle = HUD.instrumentBorder;
  ctx.stroke();

  // Roll markers
  for (const angle of [-60, -30, -15, 0, 15, 30, 60]) {
    const rad = angle * Math.PI / 180;
    const x1 = cx + Math.cos(rad - Math.PI / 2) * (radius + 2);
    const y1 = cy + Math.sin(rad - Math.PI / 2) * (radius + 2);
    const x2 = cx + Math.cos(rad - Math.PI / 2) * (radius + 14);
    const y2 = cy + Math.sin(rad - Math.PI / 2) * (radius + 14);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = angle === 0 ? 2 : 1;
    ctx.strokeStyle = angle === 0 ? color : HUD.textMuted;
    ctx.stroke();
  }

  // Roll pointer (triangle at top) — it must sit at 12 o'clock when level
  // and tilt with the bank. (The old code rotated it by -roll - PI/2, which
  // parked it at 9 o'clock even in level flight — a stray arrow on the disc.)
  const pointerAngle = roll;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(pointerAngle);
  ctx.beginPath();
  ctx.moveTo(0, -radius - 4);
  ctx.lineTo(-8, -radius - 18);
  ctx.lineTo(8, -radius - 18);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** Compact horizontal throttle bar (bottom-left) — replaces the tall
 *  mostly-empty vertical column. Flaps ride beside it as a labelled pill. */
function drawThrottleBar(ctx, x, y, width, throttle, flaps, color, glowColor) {
  const h = 16;
  drawPlate(ctx, x - 4, y - 20, width + 108, 42);
  drawText(ctx, 'THR', x, y - 6, 11, HUD.textMuted, 'left');
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(x, y, width, h);
  const grad = ctx.createLinearGradient(x, y, x + width, y);
  grad.addColorStop(0, glowColor);
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 6;
  ctx.fillRect(x, y, width * throttle, h);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = HUD.instrumentBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, h);
  drawText(ctx, `${Math.round(throttle * 100)}%`, x + width + 8, y + 13, 12, color, 'left');
  // Flaps pill, labelled — never a stray empty circle again.
  const fx = x + width + 52;
  ctx.fillStyle = flaps ? 'rgba(255, 204, 0, 0.25)' : 'rgba(255, 255, 255, 0.06)';
  ctx.fillRect(fx, y - 2, 52, 20);
  ctx.strokeStyle = flaps ? HUD.cautionColor : HUD.instrumentBorder;
  ctx.strokeRect(fx, y - 2, 52, 20);
  drawText(ctx, 'FLAPS', fx + 26, y + 12, 11, flaps ? HUD.cautionColor : HUD.textMuted, 'center');
}

/** Moving-map minimap: coastline, runway, rings, the flown trail and the
 *  plane marker — every shot shows a journey, not a dot in a void. */
function drawMinimap(ctx, plane, rings, terrain, trail, box) {
  const { x, y, width, height } = box;
  const sx = width / FIELD.width;
  const sy = height / FIELD.height;
  drawPlate(ctx, x, y, width, height);
  ctx.strokeStyle = HUD.instrumentBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  // Ground / sea.
  ctx.fillStyle = '#0b1120';
  ctx.fillRect(x, y, terrain.coastX * sx, height);
  ctx.fillStyle = '#081224';
  ctx.fillRect(x + terrain.coastX * sx, y, width - terrain.coastX * sx, height);
  // Runway strip.
  ctx.fillStyle = '#e8f0ff';
  ctx.fillRect(x + 40 * sx, y + (terrain.runwayY - 4) * sy, 300 * sx, 8 * sy);
  // Monas dot.
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(x + terrain.monas.x * sx, y + terrain.monas.y * sy, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Flown trail.
  if (trail && trail.length > 1) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < trail.length; i++) {
      const px = x + trail[i].x * sx;
      const py = y + trail[i].y * sy;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  // Rings: passed green, next pulsing gold, the rest dim.
  const next = rings.find((r) => !r.passed);
  for (const ring of rings) {
    const px = x + ring.x * sx;
    const py = y + ring.y * sy;
    ctx.beginPath();
    ctx.arc(px, py, ring === next ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = ring.passed ? '#00ff88' : ring === next ? '#ffd700' : 'rgba(0, 255, 255, 0.6)';
    ctx.fill();
  }
  // Plane marker.
  const px = x + plane.x * sx;
  const py = y + plane.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(plane.heading);
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.restore();
  ctx.restore();
  drawText(ctx, 'MAP', x + 6, y + 12, 10, HUD.textMuted, 'left');
}

/** Flight-plan strip (bottom centre): DEPART → RINGS n/N → LAND, current
 *  step lit — mission depth in one glance, no duplicated numbers. */
function drawFlightPlan(ctx, cx, y, mission, progress) {
  const steps = [
    { label: 'DEPART RWY 18', done: true },
    { label: `RINGS ${progress.objectives.ringsPassed}/${progress.objectives.ringsTotal}`, done: progress.objectives.ringsPassed >= progress.objectives.ringsTotal },
    { label: mission.hasParcel ? 'DROP PAD' : 'LAND RWY 18', done: progress.objectives.parcelDelivered || progress.objectives.landed },
  ];
  ctx.font = `600 12px ${HUD.font}`;
  const widths = steps.map((s) => ctx.measureText(s.label).width + 24);
  const gap = 22; // room for the › separator between steps
  const total = widths.reduce((a, b) => a + b, 0) + gap * (steps.length - 1);
  let x = cx - total / 2;
  drawPlate(ctx, x, y, total, 24);
  ctx.strokeStyle = HUD.instrumentBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, total, 24);
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    drawText(ctx, s.label, x + 12, y + 17, 12, s.done ? HUD.safeColor : HUD.textPrimary, 'left');
    x += widths[i];
    if (i < steps.length - 1) {
      drawText(ctx, '›', x + gap / 2, y + 17, 14, HUD.instrumentGlow, 'center');
      x += gap;
    }
  }
}

/** ILS localizer + glideslope needles (dawn landing): the approach reads as
 *  a precision approach, not a plane over a lit strip. */
function drawILS(ctx, plane, terrain, box) {
  const { x, y, width, height } = box;
  drawPlate(ctx, x, y, width, height);
  ctx.strokeStyle = HUD.instrumentBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
  drawText(ctx, 'ILS RWY 18', x + 8, y + 16, 11, HUD.instrumentGlow, 'left');
  const cx = x + width / 2;
  const cy = y + height / 2 + 6;
  // Cross hairs.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(cx - 34, cy);
  ctx.lineTo(cx + 34, cy);
  ctx.moveTo(cx, cy - 24);
  ctx.lineTo(cx, cy + 24);
  ctx.stroke();
  // Localizer: lateral deviation from the runway centreline.
  const locDev = Math.max(-1, Math.min(1, (plane.x - 190) / 220));
  // Glideslope: height above/below a 3° slope from the threshold.
  const dist = Math.max(40, Math.abs(plane.x - 190));
  const glideY = terrain.runwayY - dist * 0.055;
  const gsDev = Math.max(-1, Math.min(1, (plane.y - glideY) / 120));
  ctx.strokeStyle = '#ffaa00';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx + locDev * 30, cy - 24);
  ctx.lineTo(cx + locDev * 30, cy + 24);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 34, cy + gsDev * 20);
  ctx.lineTo(cx + 34, cy + gsDev * 20);
  ctx.stroke();
  ctx.lineWidth = 1;
}

/** Edge-pinned NEXT-RING marker: when the objective is off-screen (or far),
 *  a glass badge pins to the screen edge with a chevron pointing the way and
 *  a LIVE distance. Hysteresis: it only appears beyond 260 m, so it never
 *  flickers at the boundary. */
function drawEdgeMarker(ctx, plane, ring, camera, dist) {
  if (!camera || !ring || dist < 260) return;
  const sx = ring.x - camera.x + FIELD.width / 2;
  const sy = ring.y - camera.y + FIELD.height / 2;
  if (sx > 150 && sx < 1130 && sy > 90 && sy < 640) return;
  const bx = Math.max(90, Math.min(FIELD.width - 90, sx));
  const by = Math.max(110, Math.min(620, sy));
  const label = `RING ${ring.index + 1} · ${Math.round(dist)} m`;
  ctx.font = `700 13px ${HUD.font}`;
  const tw = ctx.measureText(label).width;
  const w = tw + 44;
  const x = bx - w / 2;
  ctx.fillStyle = 'rgba(4, 12, 18, 0.82)';
  ctx.fillRect(x, by - 17, w, 34);
  ctx.strokeStyle = ring.colorGlow;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, by - 17, w, 34);
  // Chevron pointing toward the ring.
  const dirX = Math.sign(sx - bx) || (sx >= FIELD.width / 2 ? 1 : -1);
  const dirY = Math.sign(sy - by) || 0;
  ctx.fillStyle = ring.colorPrimary;
  ctx.beginPath();
  if (Math.abs(sx - bx) > Math.abs(sy - by)) {
    const cxp = dirX > 0 ? x + w - 6 : x + 6;
    ctx.moveTo(cxp + dirX * 8, by);
    ctx.lineTo(cxp, by - 7);
    ctx.lineTo(cxp, by + 7);
  } else {
    const cyp = dirY > 0 ? by + 17 - 6 : by - 17 + 6;
    ctx.moveTo(bx, cyp + dirY * 8);
    ctx.lineTo(bx - 7, cyp);
    ctx.lineTo(bx + 7, cyp);
  }
  ctx.closePath();
  ctx.fill();
  drawText(ctx, label, x + w / 2 - (dirX > 0 && sx > FIELD.width ? 8 : 0), by + 5, 13, ring.colorPrimary, 'center');
}

/** One objective line under the mission name — the goal, in words. */
function objectiveLine(missionId, progress, nextRing, plane) {
  const p = progress.objectives;
  const dist = nextRing ? Math.round(Math.hypot(nextRing.x - plane.x, nextRing.y - plane.y)) : 0;
  if (missionId === 0) return `Ring ${p.ringsPassed + 1} of ${p.ringsTotal} — next ring ${dist} m ahead`;
  if (missionId === 1) return p.parcelDelivered ? 'Parcel delivered — fly the last rings home' : `Ring ${p.ringsPassed + 1}/${p.ringsTotal} — then drop on the green pad`;
  if (missionId === 2) return `Storm return — ring ${p.ringsPassed + 1}/${p.ringsTotal}, land Runway 18`;
  return `Dawn approach — ring ${p.ringsPassed + 1}/${p.ringsTotal}, land Runway 18`;
}

/** Draw mission objective panel. */
function drawMissionPanel(ctx, mission, objectives, timeRemaining, x, y, width, missionId) {
  let objectiveText = '';
  if (missionId === 0) {
    objectiveText = `RINGS: ${objectives.ringsPassed}/${objectives.ringsTotal}`;
  } else if (missionId === 1) {
    objectiveText = `RINGS: ${objectives.ringsPassed}/${objectives.ringsTotal}  |  PARCEL: ${objectives.parcelDelivered ? 'DELIVERED' : 'PENDING'}`;
  } else if (missionId === 2) {
    objectiveText = `RINGS: ${objectives.ringsPassed}/${objectives.ringsTotal}  |  LAND: ${objectives.landed ? 'YES' : 'NO'}  |  STORM ACTIVE`;
  } else if (missionId === 3) {
    objectiveText = `RINGS: ${objectives.ringsPassed}/${objectives.ringsTotal}  |  LAND: ${objectives.landed ? 'YES' : 'NO'}  |  DAWN APPROACH`;
  }

  const lines = [
    `MISSION: ${mission.name}`,
    `TIME: ${Math.ceil(timeRemaining)}s`,
    '',
    objectiveText,
  ];

  const lineHeight = 22;
  const padding = 16;
  const height = padding * 2 + lines.length * lineHeight;

  // Panel background
  ctx.fillStyle = HUD.instrumentBg;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = HUD.instrumentBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  // Top accent line
  ctx.fillStyle = HUD.instrumentGlow;
  ctx.fillRect(x + 2, y + 2, width - 4, 3);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let color = HUD.textPrimary;
    if (line.startsWith('MISSION:')) color = HUD.instrumentGlow;
    else if (line.startsWith('TIME:') && timeRemaining < 30) color = HUD.warningColor;
    else if (line.includes('DELIVERED') || line.includes('YES')) color = HUD.safeColor;
    else if (line.includes('PENDING') || line.includes('STORM') || line.includes('DAWN')) color = HUD.cautionColor;
    drawText(ctx, line, x + padding, y + padding + i * lineHeight, 14, color, 'left');
  }
}

/** Draw screen overlay (title, briefing, paused, game over, mission complete).
 *  v2.4 title: NO full-screen black dim — the attract-mode world stays fully
 *  lit behind translucent panels, so the menu shot reads as a game, not a
 *  black rectangle. Title band top-left, controls panel top-right, four
 *  readable mission cards along the bottom. */
function drawScreenOverlay(ctx, canvasWidth, canvasHeight, screen, data = {}) {
  // Every screen except the title dims the world (the title keeps the world
  // lit behind its panels — see the TITLE case).
  if (screen !== SCREENS.TITLE) {
    ctx.fillStyle = 'rgba(5, 8, 20, 0.92)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  switch (screen) {
    case SCREENS.TITLE: {
      // Title band (top-left, translucent — the skyline stays visible).
      ctx.fillStyle = 'rgba(4, 8, 16, 0.62)';
      ctx.fillRect(24, 24, 640, 118);
      ctx.strokeStyle = 'rgba(0, 255, 204, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, 640, 118);
      drawGlowText(ctx, 'JAKARTA NIGHT COURIER', 44, 78, 40, HUD.textPrimary, HUD.instrumentGlow, 'left');
      drawText(ctx, 'Storm Run  —  fly the neon skyline. Deliver the cargo. Survive the storm. Land at dawn.', 44, 112, 15, HUD.textMuted, 'left');

      // Controls panel (top-right, compact two-column, translucent).
      ctx.fillStyle = 'rgba(4, 8, 16, 0.62)';
      ctx.fillRect(940, 24, 316, 118);
      ctx.strokeStyle = HUD.instrumentBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(940, 24, 316, 118);
      drawText(ctx, 'CONTROLS', 958, 52, 13, HUD.instrumentGlow, 'left');
      drawText(ctx, 'W/S — Throttle', 958, 76, 13, HUD.textPrimary, 'left');
      drawText(ctx, 'A/D — Turn', 1130, 76, 13, HUD.textPrimary, 'left');
      drawText(ctx, 'SPACE — Flaps / Brake', 958, 98, 13, HUD.textPrimary, 'left');
      drawText(ctx, 'P — Photo Mode', 1130, 98, 13, HUD.textPrimary, 'left');
      drawText(ctx, 'ESC — Pause', 958, 120, 13, HUD.textPrimary, 'left');
      drawText(ctx, 'Arrows — Pan', 1130, 120, 13, HUD.textPrimary, 'left');

      // Mission cards along the bottom — readable at thumbnail size.
      const cards = [
        { n: '01', name: 'Ring Run', meta: '8 rings  ·  120 s' },
        { n: '02', name: 'Parcel Drop', meta: '4 rings  ·  parcel  ·  180 s' },
        { n: '03', name: 'Storm Return', meta: '6 rings  ·  storm  ·  300 s' },
        { n: '04', name: 'Dawn Landing', meta: '4 rings  ·  dawn  ·  180 s' },
      ];
      const cardW = 300;
      const cardH = 96;
      const gap = 12;
      const totalW = cards.length * cardW + (cards.length - 1) * gap;
      let cx = centerX - totalW / 2;
      const cy = canvasHeight - cardH - 24;
      for (const card of cards) {
        ctx.fillStyle = 'rgba(4, 8, 16, 0.66)';
        ctx.fillRect(cx, cy, cardW, cardH);
        ctx.strokeStyle = HUD.instrumentBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, cy, cardW, cardH);
        ctx.fillStyle = HUD.instrumentGlow;
        ctx.fillRect(cx, cy, cardW, 3);
        drawText(ctx, card.n, cx + 16, cy + 34, 15, HUD.instrumentGlow, 'left');
        drawText(ctx, card.name, cx + 52, cy + 34, 19, HUD.textPrimary, 'left');
        drawText(ctx, card.meta, cx + 16, cy + 66, 13, HUD.textMuted, 'left');
        cx += cardW + gap;
      }

      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
      ctx.globalAlpha = pulse;
      drawText(ctx, 'PRESS SPACE OR CLICK TO BEGIN', centerX, centerY + 180, 20, HUD.instrumentGlow, 'center');
      ctx.globalAlpha = 1;
      break;
    }

    case SCREENS.MISSION_SELECT: {
      drawGlowText(ctx, 'SELECT MISSION', centerX, centerY - 160, 36, HUD.textPrimary, HUD.instrumentGlow, 'center');
      for (let i = 0; i < MISSIONS.length; i++) {
        const m = MISSIONS[i];
        const sel = i === data.selectedMission;
        const y = centerY - 60 + i * 85;
        const w = 640;
        const h = 70;
        const x = centerX - w / 2;

        ctx.fillStyle = sel ? 'rgba(0, 255, 204, 0.15)' : 'rgba(20, 30, 50, 0.8)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = sel ? HUD.instrumentGlow : HUD.instrumentBorder;
        ctx.lineWidth = sel ? 3 : 2;
        ctx.strokeRect(x, y, w, h);

        // Plain numbers, never emoji (emoji renders as tofu in canvas text).
        drawText(ctx, `${i + 1}. ${m.name}`, centerX, y + 24, sel ? 22 : 18, sel ? HUD.instrumentGlow : HUD.textPrimary, 'center');
        drawText(ctx, m.briefing, centerX, y + 48, 13, HUD.textMuted, 'center');
      }
      drawText(ctx, 'TAB / SHIFT+TAB to select  •  SPACE to confirm', centerX, centerY + 220, 14, HUD.textMuted, 'center');
      break;
    }

    case SCREENS.BRIEFING: {
      const mission = data.mission;
      drawGlowText(ctx, `MISSION ${data.missionId + 1}: ${mission.name}`, centerX, centerY - 150, 32, HUD.textPrimary, HUD.instrumentGlow, 'center');
      drawText(ctx, mission.briefing, centerX, centerY - 80, 18, HUD.textPrimary, 'center');

      drawText(ctx, 'OBJECTIVES:', centerX, centerY - 30, 16, HUD.instrumentGlow, 'center');
      if (data.missionId === 0) {
        drawText(ctx, '• Fly through all 8 rings in order', centerX, centerY + 5, 15, HUD.textPrimary, 'center');
        drawText(ctx, '• Maintain speed and precision for combo bonus', centerX, centerY + 30, 15, HUD.textPrimary, 'center');
      } else if (data.missionId === 1) {
        drawText(ctx, '• Pass 4 rings to reach the drop zone', centerX, centerY + 5, 15, HUD.textPrimary, 'center');
        drawText(ctx, '• Slow down and align with rooftop pad', centerX, centerY + 30, 15, HUD.textPrimary, 'center');
        drawText(ctx, '• Drop parcel at low altitude', centerX, centerY + 55, 15, HUD.textPrimary, 'center');
      } else if (data.missionId === 2) {
        drawText(ctx, '• Navigate 6 rings through the storm', centerX, centerY + 5, 15, HUD.textPrimary, 'center');
        drawText(ctx, '• Correct for crosswinds and turbulence', centerX, centerY + 30, 15, HUD.textPrimary, 'center');
        drawText(ctx, '• Lightning reveals the city — use it', centerX, centerY + 55, 15, HUD.textPrimary, 'center');
        drawText(ctx, '• Land on runway before fuel runs out', centerX, centerY + 80, 15, HUD.textPrimary, 'center');
      } else if (data.missionId === 3) {
        drawText(ctx, '• Final approach: 4 rings to the runway', centerX, centerY + 5, 15, HUD.textPrimary, 'center');
        drawText(ctx, '• Storm clears, dawn breaks — visibility improves', centerX, centerY + 30, 15, HUD.textPrimary, 'center');
        drawText(ctx, '• Perfect landing bonus for precision', centerX, centerY + 55, 15, HUD.textPrimary, 'center');
        drawText(ctx, '• Land on Runway 18 to complete the campaign', centerX, centerY + 80, 15, HUD.textPrimary, 'center');
      }

      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
      ctx.globalAlpha = pulse;
      drawText(ctx, 'PRESS SPACE TO LAUNCH', centerX, centerY + 140, 20, HUD.instrumentGlow, 'center');
      ctx.globalAlpha = 1;
      break;
    }

    case SCREENS.PAUSED: {
      drawGlowText(ctx, 'PAUSED', centerX, centerY - 40, 48, HUD.textPrimary, HUD.instrumentGlow, 'center');
      drawText(ctx, 'P / ESC to resume', centerX, centerY + 20, 18, HUD.textMuted, 'center');
      break;
    }

    case SCREENS.MISSION_COMPLETE: {
      drawGlowText(ctx, 'MISSION COMPLETE', centerX, centerY - 80, 42, HUD.safeColor, HUD.safeColor, 'center');
      drawText(ctx, `${data.missionName}`, centerX, centerY - 30, 22, HUD.textPrimary, 'center');
      drawText(ctx, `SCORE: ${data.score.toLocaleString()}`, centerX, centerY + 10, 28, HUD.instrumentGlow, 'center');
      drawText(ctx, `BEST: ${data.totalScore.toLocaleString()}`, centerX, centerY + 50, 18, HUD.textMuted, 'center');

      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
      ctx.globalAlpha = pulse;
      drawText(ctx, 'PRESS SPACE TO CONTINUE', centerX, centerY + 110, 18, HUD.instrumentGlow, 'center');
      ctx.globalAlpha = 1;
      break;
    }

    case SCREENS.GAME_OVER: {
      drawGlowText(ctx, data.reason || 'MISSION FAILED', centerX, centerY - 60, 42, HUD.warningColor, HUD.warningColor, 'center');
      drawText(ctx, `FINAL SCORE: ${data.score.toLocaleString()}`, centerX, centerY + 10, 28, HUD.textPrimary, 'center');
      drawText(ctx, `BEST: ${data.totalScore.toLocaleString()}`, centerX, centerY + 50, 18, HUD.textMuted, 'center');

      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
      ctx.globalAlpha = pulse;
      drawText(ctx, 'PRESS SPACE TO TRY AGAIN', centerX, centerY + 110, 18, HUD.instrumentGlow, 'center');
      ctx.globalAlpha = 1;
      break;
    }
  }
}

/** Main HUD draw function.
 *  v2.4 safe-zone layout — every value once, nothing overlapping:
 *  top-left mission panel (name + objective line) · top-centre heading tape
 *  with its digits in a pill below · top-right score + RING n/N pill ·
 *  ALT tape left / SPD tape right (labels flipped outward, plated) ·
 *  attitude disc moved inward/down, fuel + damage as labelled bars (no more
 *  "/DMG") · compact horizontal throttle bottom-left with a labelled FLAPS
 *  pill · flight-plan strip bottom-centre · moving-map minimap bottom-right ·
 *  ILS needles on the dawn approach. The old bottom-centre duplicated
 *  speed/heading readouts and the banner-overlapping bearing arrow are gone.
 *  extra: { camera, trail } — camera feeds the edge-pinned next-ring marker,
 *  trail feeds the minimap. */
export function drawHUD(ctx, canvasWidth, canvasHeight, plane, terrain, rings, missionManager, screen, screenData, extra = {}) {
  const scale = Math.min(canvasWidth / FIELD.width, canvasHeight / FIELD.height);
  const offsetX = (canvasWidth - FIELD.width * scale) / 2;
  const offsetY = (canvasHeight - FIELD.height * scale) / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  if (screen === SCREENS.PLAY || screen === SCREENS.BRIEFING) {
    const mission = missionManager.getMission();
    const progress = missionManager.getMissionProgress();
    const nextRing = rings.find(r => !r.passed);
    const missionId = progress.missionId;

    // TOP-LEFT: mission panel — name + objective line, on a backing plate.
    drawPlate(ctx, 16, 12, 400, 62);
    ctx.strokeStyle = HUD.instrumentBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 12, 400, 62);
    ctx.fillStyle = HUD.instrumentGlow;
    ctx.fillRect(18, 14, 396, 3);
    drawText(ctx, mission.name.toUpperCase(), 32, 36, 16, HUD.instrumentGlow, 'left');
    drawText(ctx, objectiveLine(missionId, progress, nextRing, plane), 32, 58, 12, HUD.textPrimary, 'left');

    // TOP-CENTRE: heading tape + digits pill below it (never inside the face).
    drawHeadingTape(ctx, FIELD.width / 2, 12, 300, plane.heading, HUD.instrumentGlow, HUD.instrumentGlow);

    // Storm / dawn flag under the heading pill — a coloured dot, never emoji
    // (emoji renders as tofu squares in the canvas font).
    if (mission.hasStorm || mission.hasDawn) {
      const label = mission.hasStorm ? 'STORM ACTIVE' : 'DAWN APPROACH';
      const ly = 100;
      ctx.fillStyle = HUD.cautionColor;
      ctx.beginPath();
      ctx.arc(FIELD.width / 2 - 62, ly - 4, 5, 0, Math.PI * 2);
      ctx.fill();
      drawGlowText(ctx, label, FIELD.width / 2 - 50, ly, 14, HUD.cautionColor, HUD.cautionColor, 'left');
    }

    // TOP-RIGHT: score once, then the glanceable RING n/N + live distance pill.
    drawGlowText(ctx, `SCORE ${Math.round(progress.score).toLocaleString()}`, FIELD.width - 16, 34, 20, HUD.instrumentGlow, HUD.instrumentGlow, 'right');
    if (nextRing) {
      const ringsPassed = rings.filter(r => r.passed).length;
      const dist = Math.round(Math.hypot(nextRing.x - plane.x, nextRing.y - plane.y));
      const pillText = `RING ${ringsPassed + 1}/${mission.ringCount}  ·  ${dist} m`;
      ctx.font = `700 15px ${HUD.font}`;
      const tw = ctx.measureText(pillText).width;
      const px = FIELD.width - 16 - tw - 24;
      drawPlate(ctx, px, 44, tw + 24, 36);
      ctx.strokeStyle = nextRing.colorGlow;
      ctx.lineWidth = 2;
      ctx.strokeRect(px, 44, tw + 24, 36);
      drawText(ctx, pillText, px + 12, 67, 15, nextRing.colorPrimary, 'left');
    }

    // LEFT: altimeter tape. RIGHT: airspeed tape (labels flipped outward).
    drawTapeGauge(ctx, 16, 100, 56, 230, plane.altitude, 10000, 'ALT', ' FT', HUD.instrumentGlow, HUD.instrumentGlow, 1000, 500, false);
    drawTapeGauge(ctx, FIELD.width - 72, 100, 56, 230, plane.speed, PLANE.maxSpeed, 'SPD', ' KT', HUD.instrumentGlow, HUD.instrumentGlow, 50, 10, true);

    // RIGHT-MIDDLE: attitude indicator, moved inward and down so no ring
    // can sit behind it (old position hid the SPD label and the 0 KT tick).
    drawAttitudeIndicator(ctx, 1110, 425, 50, plane.pitch, plane.roll, HUD.instrumentGlow, HUD.instrumentGlow);

    // RIGHT-LOWER: fuel + damage as labelled horizontal bars.
    drawBarGauge(ctx, 1000, 490, 150, plane.fuel, PLANE.startingFuel, 'FUEL', HUD.safeColor, HUD.safeColor);
    const dmgColor = plane.damage > 60 ? HUD.warningColor : plane.damage > 30 ? HUD.cautionColor : HUD.safeColor;
    drawBarGauge(ctx, 1000, 522, 150, plane.damage, PLANE.crashDamage, 'DMG', dmgColor, dmgColor);

    // BOTTOM-LEFT: compact horizontal throttle + labelled FLAPS pill.
    drawThrottleBar(ctx, 16, 660, 180, plane.throttle, plane.flaps, HUD.instrumentGlow, HUD.instrumentGlow);

    // BOTTOM-CENTRE: flight-plan strip.
    drawFlightPlan(ctx, FIELD.width / 2, 668, mission, progress);

    // BOTTOM-RIGHT: moving-map minimap with the flown trail.
    drawMinimap(ctx, plane, rings, terrain, extra.trail, MINIMAP);

    // ILS needles on the dawn approach (and storm return's landing leg).
    if (mission.hasDawn || missionId === 2) {
      drawILS(ctx, plane, terrain, ILS);
    }

    // Edge-pinned next-ring marker (only when the ring is off-screen/far).
    if (nextRing) {
      const dist = Math.hypot(nextRing.x - plane.x, nextRing.y - plane.y);
      drawEdgeMarker(ctx, plane, nextRing, extra.camera, dist);
    }

    // WARNING INDICATORS (below the heading area, clear of every pill).
    const shownTime = screen === SCREENS.BRIEFING ? mission.timeLimit : progress.timeRemaining;
    let warnY = 140;
    if (plane.fuel < 20) {
      drawGlowText(ctx, `FUEL LOW: ${Math.round(plane.fuel)}%`, FIELD.width / 2, warnY, 18, HUD.warningColor, HUD.warningColor, 'center');
      warnY += 26;
    }
    if (plane.damage > 50) {
      drawGlowText(ctx, `DAMAGE CRITICAL: ${Math.round(plane.damage)}%`, FIELD.width / 2, warnY, 18, HUD.warningColor, HUD.warningColor, 'center');
      warnY += 26;
    }
    if (plane.speed < PLANE.minSpeed + 10) {
      drawGlowText(ctx, `STALL WARNING: ${Math.round(plane.speed)} KT`, FIELD.width / 2, warnY, 18, HUD.warningColor, HUD.warningColor, 'center');
      warnY += 26;
    }
    if (plane.speed > PLANE.maxSpeed - 10) {
      drawGlowText(ctx, `OVERSPEED: ${Math.round(plane.speed)} KT`, FIELD.width / 2, warnY, 18, HUD.cautionColor, HUD.cautionColor, 'center');
      warnY += 26;
    }
    // Timer lives in the mission panel's corner — small, once.
    const timeColor = shownTime < 30 && screen === SCREENS.PLAY ? HUD.warningColor : HUD.textMuted;
    drawText(ctx, `${Math.ceil(shownTime)}s`, 400, 36, 14, timeColor, 'right');
  }

  ctx.restore();

  // Screen overlays (drawn in screen space, not scaled)
  if (screen !== SCREENS.PLAY) {
    drawScreenOverlay(ctx, canvasWidth, canvasHeight, screen, screenData);
  }
}