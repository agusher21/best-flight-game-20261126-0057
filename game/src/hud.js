// HUD (Heads Up Display) rendering for Jakarta Night Courier.
// Draws all flight instruments, gauges, and UI panels with glowing night-vision aesthetic.

import { FIELD, HUD, PALETTE, PLANE, MISSIONS, SCREENS } from './config.js';

/** Cache for text measurements to avoid allocations. */
const textCache = new Map();

function getCachedText(ctx, font, text, color, align) {
  const key = `${font}|${text}|${color}|${align}`;
  return key;
}

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
  // Glow
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

/** Draw a vertical tape gauge (speed, altimeter style). */
function drawTapeGauge(ctx, x, y, width, height, value, maxValue, label, unit, color, glowColor, majorStep, minorStep) {
  const pct = Math.max(0, Math.min(1, value / maxValue));
  const visibleRange = height * 0.8;
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

  // Tick marks and numbers
  const steps = Math.ceil(maxValue / majorStep);
  for (let i = 0; i <= steps; i++) {
    const tickValue = i * majorStep;
    const tickPct = tickValue / maxValue;
    const tickY = y + height - tickPct * height;

    // Only draw ticks near visible area
    if (tickY < y - 20 || tickY > y + height + 20) continue;

    const isMajor = tickValue % majorStep === 0;
    const tickLen = isMajor ? 20 : 10;
    const tickX = x + width;

    ctx.beginPath();
    ctx.moveTo(tickX, tickY);
    ctx.lineTo(tickX + tickLen, tickY);
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.strokeStyle = isMajor ? color : HUD.textMuted;
    ctx.stroke();

    if (isMajor) {
      drawText(ctx, `${tickValue}${unit}`, tickX + tickLen + 4, tickY + 4, 11, HUD.textMuted, 'left');
    }
  }

  // Current value indicator (triangle on right)
  const indicatorY = y + height - pct * height;
  ctx.beginPath();
  ctx.moveTo(x + width + 2, indicatorY);
  ctx.lineTo(x + width + 14, indicatorY - 6);
  ctx.lineTo(x + width + 14, indicatorY + 6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Digital readout at top
  drawGlowText(ctx, `${Math.round(value)}${unit}`, x + width / 2, y + 22, 18, color, glowColor, 'center');
  drawText(ctx, label, x + width / 2, y + height - 18, 11, HUD.textMuted, 'center');
}

/** Draw compass/heading indicator. */
function drawCompass(ctx, cx, cy, radius, heading, color, glowColor) {
  // Heading in degrees, 0 = North, 90 = East, etc.
  // Our heading: 0 = East (right), -PI/2 = North (up)
  const headingDeg = ((heading * 180 / Math.PI) + 450) % 360; // Convert to 0=N, 90=E
  const cardinal = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(headingDeg / 45) % 8];

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = HUD.instrumentBorder;
  ctx.stroke();

  // Glow ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = glowColor;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Cardinal marks
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI / 4) - Math.PI / 2;
    const isCardinal = i % 2 === 0;
    const markLen = isCardinal ? 16 : 10;
    const x1 = cx + Math.cos(angle) * (radius - 4);
    const y1 = cy + Math.sin(angle) * (radius - 4);
    const x2 = cx + Math.cos(angle) * (radius - 4 - markLen);
    const y2 = cy + Math.sin(angle) * (radius - 4 - markLen);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = isCardinal ? 2 : 1;
    ctx.strokeStyle = isCardinal ? color : HUD.textMuted;
    ctx.stroke();

    if (isCardinal) {
      const label = ['N', 'E', 'S', 'W'][i / 2];
      const lx = cx + Math.cos(angle) * (radius - 28);
      const ly = cy + Math.sin(angle) * (radius - 28) + 5;
      drawText(ctx, label, lx, ly, 12, HUD.textMuted, 'center');
    }
  }

  // Heading bug (triangle at top)
  const bugAngle = -heading - Math.PI / 2; // Our heading 0=E, compass 0=N
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(bugAngle);
  ctx.beginPath();
  ctx.moveTo(0, -radius + 10);
  ctx.lineTo(-6, -radius + 22);
  ctx.lineTo(6, -radius + 22);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // Digital heading
  drawGlowText(ctx, `${Math.round(headingDeg).toString().padStart(3, '0')}°`, cx, cy + radius + 24, 16, color, glowColor, 'center');
  drawText(ctx, cardinal, cx, cy + radius + 42, 11, HUD.textMuted, 'center');
}

/** Draw artificial horizon (attitude indicator). */
function drawAttitudeIndicator(ctx, cx, cy, radius, pitch, roll, color, glowColor) {
  // Pitch: positive = nose up, negative = nose down
  // Roll: positive = right wing down
  const maxPitch = Math.PI / 3; // 60 degrees max display

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
  for (let p = -maxPitch; p <= maxPitch; p += Math.PI / 18) { // 10 degree steps
    const y = p * radius / maxPitch * 1.2;
    if (Math.abs(y) > radius) continue;
    const width = 0.4 * radius * (1 - Math.abs(p) / maxPitch);
    ctx.beginPath();
    ctx.moveTo(-width / 2, y);
    ctx.lineTo(width / 2, y);
    ctx.stroke();
    // Label every 20 degrees
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

  // Roll pointer (triangle at top)
  const pointerAngle = -roll - Math.PI / 2;
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

/** Draw throttle indicator. */
function drawThrottleIndicator(ctx, x, y, width, height, throttle, color, glowColor) {
  const pct = throttle;
  const fillHeight = height * pct;

  // Background
  ctx.fillStyle = HUD.instrumentBg;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = HUD.instrumentBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  // Fill
  const grad = ctx.createLinearGradient(x, y, x, y + height);
  grad.addColorStop(0, color);
  grad.addColorStop(1, glowColor);
  ctx.fillStyle = grad;
  ctx.fillRect(x + 2, y + height - fillHeight - 2, width - 4, fillHeight);

  // Glow on fill
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 10;
  ctx.fillRect(x + 2, y + height - fillHeight - 2, width - 4, fillHeight);
  ctx.shadowBlur = 0;

  // Label
  drawText(ctx, 'THR', x + width / 2, y - 6, 11, HUD.textMuted, 'center');
  drawText(ctx, `${Math.round(pct * 100)}%`, x + width / 2, y + height + 18, 11, HUD.textMuted, 'center');
}

/** Draw flaps indicator. */
function drawFlapsIndicator(ctx, x, y, size, flaps, color, glowColor) {
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = flaps ? color : HUD.instrumentBorder;
  ctx.stroke();

  if (flaps) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    drawText(ctx, 'FLAPS', x, y + size + 18, 11, color, 'center');
  }
}

/** Draw mission objective panel. */
function drawMissionPanel(ctx, mission, objectives, timeRemaining, x, y, width, missionId) {
  const lines = [
    `MISSION: ${mission.name}`,
    `TIME: ${Math.ceil(timeRemaining)}s`,
    '',
    missionId === 0 ? `RINGS: ${objectives.ringsPassed}/${objectives.ringsTotal}` :
    missionId === 1 ? `RINGS: ${objectives.ringsPassed}/${objectives.ringsTotal}  |  PARCEL: ${objectives.parcelDelivered ? 'DELIVERED' : 'PENDING'}` :
    `RINGS: ${objectives.ringsPassed}/${objectives.ringsTotal}  |  LAND: ${objectives.landed ? 'YES' : 'NO'}`,
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
    const color = line.startsWith('MISSION:') ? HUD.instrumentGlow :
                  line.startsWith('TIME:') && timeRemaining < 30 ? HUD.warningColor :
                  line.includes('DELIVERED') ? HUD.safeColor :
                  line.includes('PENDING') ? HUD.cautionColor :
                  HUD.textPrimary;
    drawText(ctx, line, x + padding, y + padding + i * lineHeight, 14, color, 'left');
  }
}

/** Draw screen overlay (title, briefing, paused, game over, mission complete). */
function drawScreenOverlay(ctx, canvasWidth, canvasHeight, screen, data = {}) {
  // Semi-transparent backdrop (lighter on the title so the night city glows through)
  ctx.fillStyle = screen === SCREENS.TITLE ? 'rgba(5, 8, 20, 0.78)' : 'rgba(5, 8, 20, 0.92)';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  switch (screen) {
    case SCREENS.TITLE: {
      // Title
      drawGlowText(ctx, 'JAKARTA NIGHT COURIER', centerX, centerY - 120, 48, HUD.textPrimary, HUD.instrumentGlow, 'center');
      drawText(ctx, 'A Night Ring-Run Flight Game', centerX, centerY - 70, 20, HUD.textMuted, 'center');
      drawText(ctx, 'Fly the neon skyline. Deliver the cargo. Land before dawn.', centerX, centerY - 40, 16, HUD.textMuted, 'center');

      // Controls hint (two columns, separately aligned so they never collide)
      drawText(ctx, 'CONTROLS', centerX, centerY + 30, 18, HUD.instrumentGlow, 'center');
      drawText(ctx, 'W / Up — Throttle Up', centerX - 30, centerY + 60, 14, HUD.textPrimary, 'right');
      drawText(ctx, 'A / Left — Turn Left', centerX + 30, centerY + 60, 14, HUD.textPrimary, 'left');
      drawText(ctx, 'S / Down — Throttle Down', centerX - 30, centerY + 82, 14, HUD.textPrimary, 'right');
      drawText(ctx, 'D / Right — Turn Right', centerX + 30, centerY + 82, 14, HUD.textPrimary, 'left');
      drawText(ctx, 'SPACE — Flaps / Brake', centerX - 30, centerY + 104, 14, HUD.textPrimary, 'right');
      drawText(ctx, 'P / ESC — Pause', centerX + 30, centerY + 104, 14, HUD.textPrimary, 'left');

      // Press to start
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
      ctx.globalAlpha = pulse;
      drawText(ctx, 'PRESS SPACE OR CLICK TO BEGIN', centerX, centerY + 160, 20, HUD.instrumentGlow, 'center');
      ctx.globalAlpha = 1;
      break;
    }

    case SCREENS.MISSION_SELECT: {
      drawGlowText(ctx, 'SELECT MISSION', centerX, centerY - 140, 36, HUD.textPrimary, HUD.instrumentGlow, 'center');
      const missions = MISSIONS;
      for (let i = 0; i < missions.length; i++) {
        const m = missions[i];
        const sel = i === data.selectedMission;
        const y = centerY - 40 + i * 80;
        const w = 600;
        const h = 65;
        const x = centerX - w / 2;

        // Mission card
        ctx.fillStyle = sel ? 'rgba(0, 255, 204, 0.15)' : 'rgba(20, 30, 50, 0.8)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = sel ? HUD.instrumentGlow : HUD.instrumentBorder;
        ctx.lineWidth = sel ? 3 : 2;
        ctx.strokeRect(x, y, w, h);

        drawText(ctx, `${i + 1}. ${m.name}`, centerX, y + 24, sel ? 22 : 18, sel ? HUD.instrumentGlow : HUD.textPrimary, 'center');
        drawText(ctx, m.briefing, centerX, y + 48, 13, HUD.textMuted, 'center');
      }
      drawText(ctx, 'TAB / SHIFT+TAB to select  •  SPACE to confirm', centerX, centerY + 200, 14, HUD.textMuted, 'center');
      break;
    }

    case SCREENS.BRIEFING: {
      const mission = data.mission;
      drawGlowText(ctx, `MISSION ${data.missionId + 1}: ${mission.name}`, centerX, centerY - 140, 32, HUD.textPrimary, HUD.instrumentGlow, 'center');
      drawText(ctx, mission.briefing, centerX, centerY - 70, 18, HUD.textPrimary, 'center');

      drawText(ctx, 'OBJECTIVES:', centerX, centerY - 20, 16, HUD.instrumentGlow, 'center');
      if (data.missionId === 0) {
        drawText(ctx, '• Fly through all 8 rings in order', centerX, centerY + 10, 15, HUD.textPrimary, 'center');
        drawText(ctx, '• Maintain speed and precision', centerX, centerY + 35, 15, HUD.textPrimary, 'center');
      } else if (data.missionId === 1) {
        drawText(ctx, '• Pass 4 rings to reach the drop zone', centerX, centerY + 10, 15, HUD.textPrimary, 'center');
        drawText(ctx, '• Slow down and align with rooftop pad', centerX, centerY + 35, 15, HUD.textPrimary, 'center');
        drawText(ctx, '• Drop parcel at low altitude', centerX, centerY + 60, 15, HUD.textPrimary, 'center');
      } else {
        drawText(ctx, '• Navigate 6 rings through the storm', centerX, centerY + 10, 15, HUD.textPrimary, 'center');
        drawText(ctx, '• Correct for crosswinds constantly', centerX, centerY + 35, 15, HUD.textPrimary, 'center');
        drawText(ctx, '• Land on runway before fuel runs out', centerX, centerY + 60, 15, HUD.textPrimary, 'center');
      }

      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
      ctx.globalAlpha = pulse;
      drawText(ctx, 'PRESS SPACE TO LAUNCH', centerX, centerY + 130, 20, HUD.instrumentGlow, 'center');
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
      drawText(ctx, `TOTAL: ${data.totalScore.toLocaleString()}`, centerX, centerY + 50, 18, HUD.textMuted, 'center');

      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
      ctx.globalAlpha = pulse;
      drawText(ctx, 'PRESS SPACE TO CONTINUE', centerX, centerY + 110, 18, HUD.instrumentGlow, 'center');
      ctx.globalAlpha = 1;
      break;
    }

    case SCREENS.GAME_OVER: {
      drawGlowText(ctx, data.reason || 'MISSION FAILED', centerX, centerY - 60, 42, HUD.warningColor, HUD.warningColor, 'center');
      drawText(ctx, `FINAL SCORE: ${data.score.toLocaleString()}`, centerX, centerY + 10, 28, HUD.textPrimary, 'center');
      drawText(ctx, `TOTAL: ${data.totalScore.toLocaleString()}`, centerX, centerY + 50, 18, HUD.textMuted, 'center');

      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
      ctx.globalAlpha = pulse;
      drawText(ctx, 'PRESS SPACE TO TRY AGAIN', centerX, centerY + 110, 18, HUD.instrumentGlow, 'center');
      ctx.globalAlpha = 1;
      break;
    }
  }
}

/** Main HUD draw function. */
export function drawHUD(ctx, canvasWidth, canvasHeight, plane, terrain, rings, missionManager, screen, screenData) {
  // Scale from logical 1280x720 to canvas
  const scale = Math.min(canvasWidth / FIELD.width, canvasHeight / FIELD.height);
  const offsetX = (canvasWidth - FIELD.width * scale) / 2;
  const offsetY = (canvasHeight - FIELD.height * scale) / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  if (screen === SCREENS.PLAY || screen === SCREENS.BRIEFING) {
    // --- LEFT SIDE: Altitude tape, Compass, Throttle ---
    const leftX = 20;

    // Altimeter tape (vertical, left)
    drawTapeGauge(ctx, leftX, 40, 60, 300, plane.altitude, 10000, 'ALT', ' FT', HUD.instrumentGlow, HUD.instrumentGlow, 1000, 500);

    // Compass (below altimeter)
    drawCompass(ctx, leftX + 30, 380, 50, plane.heading, HUD.instrumentGlow, HUD.instrumentGlow);

    // Throttle indicator (below compass)
    drawThrottleIndicator(ctx, leftX + 10, 450, 40, 180, plane.throttle, HUD.instrumentGlow, HUD.instrumentGlow);

    // Flaps indicator (right of the throttle bar, clear of its % readout)
    drawFlapsIndicator(ctx, leftX + 90, 610, 20, plane.flaps, HUD.cautionColor, HUD.cautionColor);

    // --- RIGHT SIDE: Speed tape, Artificial Horizon, Fuel, Damage ---
    const rightX = FIELD.width - 100;

    // Airspeed tape (vertical, right)
    drawTapeGauge(ctx, rightX - 60, 40, 60, 300, plane.speed, PLANE.maxSpeed, 'SPD', ' KT', HUD.instrumentGlow, HUD.instrumentGlow, 50, 10);

    // Artificial Horizon (center-right)
    drawAttitudeIndicator(ctx, rightX - 30, 380, 60, plane.pitch, plane.roll, HUD.instrumentGlow, HUD.instrumentGlow);

    // Fuel gauge (circular, below horizon)
    drawCircularGauge(ctx, rightX - 30, 500, 50, plane.fuel, PLANE.startingFuel, 'FUEL', HUD.safeColor, HUD.safeColor, HUD.instrumentBg);

    // Damage gauge (circular, below fuel)
    const dmgColor = plane.damage > 60 ? HUD.warningColor : plane.damage > 30 ? HUD.cautionColor : HUD.safeColor;
    const dmgGlow = plane.damage > 60 ? HUD.warningColor : plane.damage > 30 ? HUD.cautionColor : HUD.safeColor;
    drawCircularGauge(ctx, rightX - 30, 590, 50, plane.damage, PLANE.crashDamage, 'DMG', dmgColor, dmgGlow, HUD.instrumentBg);

    // --- TOP CENTER: Mission info, Ring counter ---
    const mission = missionManager.getMission();
    const progress = missionManager.getMissionProgress();
    const nextRing = rings.find(r => !r.passed);

    // Mission name and timer (before launch the briefing shows the full limit)
    const shownTime = screen === SCREENS.BRIEFING ? mission.timeLimit : progress.timeRemaining;
    ctx.fillStyle = HUD.instrumentBg;
    ctx.fillRect(FIELD.width / 2 - 150, 10, 300, 50);
    ctx.strokeStyle = HUD.instrumentBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(FIELD.width / 2 - 150, 10, 300, 50);

    drawText(ctx, mission.name, FIELD.width / 2, 32, 16, HUD.instrumentGlow, 'center');
    const timeColor = shownTime < 30 && screen === SCREENS.PLAY ? HUD.warningColor : HUD.textMuted;
    drawText(ctx, `${Math.ceil(shownTime)}s`, FIELD.width / 2, 52, 14, timeColor, 'center');

    // Score (top-right)
    drawGlowText(ctx, `SCORE ${progress.score.toLocaleString()}`, FIELD.width - 20, 36, 20, HUD.instrumentGlow, HUD.instrumentGlow, 'right');

    // Ring counter (below mission)
    if (nextRing) {
      const ringsPassed = rings.filter(r => r.passed).length;
      const ringText = `RING ${ringsPassed + 1}/${mission.ringCount}`;
      const dist = Math.sqrt((nextRing.x - plane.x) ** 2 + (nextRing.y - plane.y) ** 2);
      ctx.fillStyle = HUD.instrumentBg;
      ctx.fillRect(FIELD.width / 2 - 120, 65, 240, 36);
      ctx.strokeStyle = nextRing.colorGlow;
      ctx.lineWidth = 2;
      ctx.strokeRect(FIELD.width / 2 - 120, 65, 240, 36);
      drawText(ctx, ringText, FIELD.width / 2, 83, 14, nextRing.colorPrimary, 'center');
      drawText(ctx, `${Math.round(dist)}m`, FIELD.width / 2, 97, 12, HUD.textMuted, 'center');
    }

    // --- BOTTOM CENTER: Speed/Heading digital readouts ---
    drawGlowText(ctx, `${Math.round(plane.speed)} KT`, 120, FIELD.height - 40, 24, HUD.instrumentGlow, HUD.instrumentGlow, 'center');
    drawGlowText(ctx, `${Math.round(((plane.heading * 180 / Math.PI) + 450) % 360).toString().padStart(3, '0')}°`, FIELD.width - 120, FIELD.height - 40, 24, HUD.instrumentGlow, HUD.instrumentGlow, 'center');

    // --- WARNING INDICATORS ---
    let warnY = 120;
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

    // Next ring bearing indicator (small arrow at top)
    if (nextRing) {
      const bearing = Math.atan2(nextRing.y - plane.y, nextRing.x - plane.x);
      const relBearing = bearing - plane.heading;
      const arrowX = FIELD.width / 2 + Math.sin(relBearing) * 200;
      const arrowY = 100 - Math.cos(relBearing) * 50;
      ctx.save();
      ctx.translate(arrowX, arrowY);
      ctx.rotate(relBearing + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(-10, 5);
      ctx.lineTo(10, 5);
      ctx.closePath();
      ctx.fillStyle = nextRing.colorPrimary;
      ctx.shadowColor = nextRing.colorGlow;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  ctx.restore();

  // Screen overlays (drawn in screen space, not scaled)
  if (screen !== SCREENS.PLAY) {
    drawScreenOverlay(ctx, canvasWidth, canvasHeight, screen, screenData);
  }
}