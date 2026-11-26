// Night Jakarta terrain generation and rendering.
// Pure data generation: creates the static cityscape once at startup.
// Includes buildings with lit windows, Monas tower, sea, coastline, stars, and hills.

import { FIELD, TERRAIN, PALETTE } from './config.js';

/** Create the complete terrain data for the game. */
export function createTerrain(random) {
  const buildings = [];
  const stars = [];
  const hills = [];
  const seaWaves = [];

  // Generate stars
  for (let i = 0; i < TERRAIN.starCount; i++) {
    stars.push({
      x: random() * FIELD.width,
      y: random() * FIELD.horizonY,
      size: 0.5 + random() * 1.5,
      brightness: 0.3 + random() * 0.7,
      twinkleSpeed: 0.5 + random() * 2.0,
      twinklePhase: random() * Math.PI * 2,
    });
  }

  // Generate far background hills (parallax)
  for (let i = 0; i < TERRAIN.hillCount; i++) {
    hills.push({
      x: (i / TERRAIN.hillCount) * FIELD.width * 1.5 + random() * 100 - 50,
      baseY: FIELD.horizonY + 20 + random() * 40,
      height: 60 + random() * 80,
      width: 200 + random() * 300,
      color: `hsl(220, 30%, ${8 + random() * 6}%)`,
      parallax: 0.15 + random() * 0.1,
    });
  }

  // Generate buildings across the city
  // City spans from x=0 to x=TERRAIN.coastX (coastline)
  const cityWidth = TERRAIN.coastX;
  const buildingZoneStart = 50;
  const buildingZoneEnd = cityWidth - 50;

  // Runway strip (x 40-340) is kept clear of buildings so a landing roll
  // never meets a tower.
  const runwayClearStart = 30;
  const runwayClearEnd = 350;
  for (let i = 0; i < TERRAIN.buildingCount; i++) {
    const width = TERRAIN.buildingWidth.min + random() * (TERRAIN.buildingWidth.max - TERRAIN.buildingWidth.min);
    const height = TERRAIN.buildingHeight.min + random() * (TERRAIN.buildingHeight.max - TERRAIN.buildingHeight.min);
    const x = buildingZoneStart + random() * (buildingZoneEnd - buildingZoneStart - width);
    if (x + width > runwayClearStart && x < runwayClearEnd) continue;
    const groundY = FIELD.height - TERRAIN.seaLevel;
    const y = groundY - height;

    // Window grid
    const windows = [];
    const cols = Math.floor(width / TERRAIN.windowSpacing.x);
    const rows = Math.floor(height / TERRAIN.windowSpacing.y);
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if (random() < TERRAIN.windowLitProbability) {
          windows.push({
            x: cx * TERRAIN.windowSpacing.x + TERRAIN.windowSpacing.x * 0.2,
            y: cy * TERRAIN.windowSpacing.y + TERRAIN.windowSpacing.y * 0.2,
            w: TERRAIN.windowSpacing.x * 0.5,
            h: TERRAIN.windowSpacing.y * 0.5,
            brightness: 0.6 + random() * 0.4,
            colorVariation: random(),
            flickerSpeed: 0.5 + random() * 3.0,
            flickerPhase: random() * Math.PI * 2,
          });
        }
      }
    }

    // Building type influences color
    const typeRoll = random();
    let baseColor, accentColor;
    if (typeRoll < 0.4) {
      // Residential - warmer
      baseColor = PALETTE.buildingDark;
      accentColor = PALETTE.buildingMid;
    } else if (typeRoll < 0.75) {
      // Office - cooler
      baseColor = PALETTE.buildingMid;
      accentColor = PALETTE.buildingLight;
    } else {
      // Industrial - darker
      baseColor = PALETTE.buildingDark;
      accentColor = PALETTE.buildingDark;
    }

    buildings.push({
      x, y, width, height,
      baseColor, accentColor,
      windows,
      groundY,
      // Roof details
      roofType: Math.floor(random() * 4), // 0=flat, 1=antenna, 2=helipad, 3=ac units
      roofColor: `hsl(0, 0%, ${15 + random() * 10}%)`,
    });
  }

  // Sort buildings by x for rendering order (back to front)
  buildings.sort((a, b) => a.x - b.x);

  // Sudirman Tower: the dedicated parcel-drop tower at x=800. It stands clear
  // of its neighbours so the pad approach is a clean descent, and its roof
  // (y=380) is where the parcel pad sits.
  const groundY = FIELD.height - TERRAIN.seaLevel;
  const padTower = {
    x: 765,
    y: 380,
    width: 70,
    height: 260,
    isPadTower: true, // The parcel pad sits on this roof — see checkTerrainCollision.
    baseColor: PALETTE.buildingMid,
    accentColor: PALETTE.buildingLight,
    windows: [],
    groundY,
    roofType: 2, // helipad
    roofColor: 'hsl(0, 0%, 20%)',
  };
  const padCols = Math.floor(padTower.width / TERRAIN.windowSpacing.x);
  const padRows = Math.floor(padTower.height / TERRAIN.windowSpacing.y);
  for (let cx = 0; cx < padCols; cx++) {
    for (let cy = 0; cy < padRows; cy++) {
      if (random() < TERRAIN.windowLitProbability) {
        padTower.windows.push({
          x: cx * TERRAIN.windowSpacing.x + TERRAIN.windowSpacing.x * 0.2,
          y: cy * TERRAIN.windowSpacing.y + TERRAIN.windowSpacing.y * 0.2,
          w: TERRAIN.windowSpacing.x * 0.5,
          h: TERRAIN.windowSpacing.y * 0.5,
          brightness: 0.6 + random() * 0.4,
          colorVariation: random(),
          flickerSpeed: 0.5 + random() * 3.0,
          flickerPhase: random() * Math.PI * 2,
        });
      }
    }
  }
  // Clear any random building that would crowd the tower, then add it.
  for (let i = buildings.length - 1; i >= 0; i--) {
    const b = buildings[i];
    if (b.x + b.width > 740 && b.x < 890) buildings.splice(i, 1);
  }
  buildings.push(padTower);
  buildings.sort((a, b) => a.x - b.x);

  // Monas tower (National Monument) - landmark at TERRAIN.monasX
  const monasGroundY = FIELD.height - TERRAIN.seaLevel;
  const monas = {
    x: TERRAIN.monasX,
    y: monasGroundY - TERRAIN.monasHeight,
    width: 24,
    height: TERRAIN.monasHeight,
    baseY: monasGroundY,
    // Flame at top
    flame: {
      particles: [],
      maxParticles: 30,
    },
    // Observation deck windows
    deckWindows: [],
    // Base structure
    baseWidth: 60,
    baseHeight: 40,
  };

  // Generate Monas observation deck windows
  const deckY = monas.y + 60;
  for (let wx = 0; wx < 8; wx++) {
    for (let wy = 0; wy < 3; wy++) {
      monas.deckWindows.push({
        x: -20 + wx * 6,
        y: deckY + wy * 8,
        lit: random() > 0.2,
      });
    }
  }

  // Sea waves (for animation)
  for (let i = 0; i < 20; i++) {
    seaWaves.push({
      x: TERRAIN.coastX + (i / 20) * (FIELD.width - TERRAIN.coastX),
      amplitude: 3 + random() * 5,
      frequency: 0.01 + random() * 0.02,
      phase: random() * Math.PI * 2,
      speed: 0.3 + random() * 0.5,
      color: random() > 0.5 ? PALETTE.seaMid : PALETTE.seaSurface,
    });
  }

  // Coastline detail points
  const coastline = [];
  for (let x = TERRAIN.coastX; x < FIELD.width; x += 8) {
    coastline.push({
      x,
      y: FIELD.height - TERRAIN.seaLevel + (Math.sin(x * 0.02) * 6 + random() * 4 - 2),
    });
  }

  // Runway position (on reclaimed land near coast)
  const runwayY = FIELD.height - TERRAIN.seaLevel - 5; // Slightly above sea

  return {
    buildings,
    stars,
    hills,
    seaWaves,
    coastline,
    monas,
    runwayY,
    groundY: FIELD.height - TERRAIN.seaLevel,
    seaLevel: TERRAIN.seaLevel,
    coastX: TERRAIN.coastX,
  };
}

/** Update animated terrain elements (stars twinkle, Monas flame, sea waves). */
export function updateTerrain(terrain, dt, time) {
  // Twinkle stars
  for (const star of terrain.stars) {
    star.brightness = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinklePhase));
  }

  // Update Monas flame particles
  const flame = terrain.monas.flame;
  // Add new particles
  if (flame.particles.length < flame.maxParticles && Math.random() < 0.8) {
    flame.particles.push({
      x: terrain.monas.x + (Math.random() - 0.5) * 8,
      y: terrain.monas.y + 10 + Math.random() * 15,
      vx: (Math.random() - 0.5) * 10,
      vy: -30 - Math.random() * 40,
      life: 0.5 + Math.random() * 0.8,
      age: 0,
      size: 4 + Math.random() * 6,
      color: Math.random() > 0.5 ? PALETTE.monasGlow : PALETTE.monasTop,
    });
  }
  // Update particles
  for (let i = flame.particles.length - 1; i >= 0; i--) {
    const p = flame.particles[i];
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 20 * dt; // Gravity pulls flame up? No, flame goes up, so negative gravity
    if (p.age >= p.life) flame.particles.splice(i, 1);
  }

  // Update sea waves
  for (const wave of terrain.seaWaves) {
    wave.phase += wave.speed * dt;
  }

  // Flicker building windows
  for (const building of terrain.buildings) {
    for (const window of building.windows) {
      window.brightness = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(time * window.flickerSpeed + window.flickerPhase));
      // Occasional random flicker
      if (Math.random() < 0.001) {
        window.flickerPhase += Math.PI;
      }
    }
  }

  // Monas deck window occasional flicker
  for (const dw of terrain.monas.deckWindows) {
    if (Math.random() < 0.002) {
      dw.lit = !dw.lit;
    }
  }
}

/** Check collision between plane and terrain. */
export function checkTerrainCollision(plane, terrain) {
  // Ground/sea collision
  if (plane.y >= terrain.groundY) {
    return { hit: true, type: plane.x > terrain.coastX ? 'sea' : 'ground', y: terrain.groundY };
  }

  // Building collision
  for (const building of terrain.buildings) {
    const bx1 = building.x;
    const bx2 = building.x + building.width;
    const by1 = building.y;
    const by2 = building.groundY;

    // The pad tower's roof IS the delivery pad: a plane descending onto it
    // from above (centre above the roof, inside the tower's span) is
    // landing, not crashing — the delivery check scores it. The 12 px
    // slack is the plane's half-height: its belly may touch the roof on the
    // delivery frame. A plane at or below roof level, or outside the span,
    // still collides normally.
    if (building.isPadTower && plane.y < by1 + 12 && plane.x > bx1 - 10 && plane.x < bx2 + 10) {
      continue;
    }

    // Plane bounding box (approximate)
    const px1 = plane.x - 20;
    const px2 = plane.x + 20;
    const py1 = plane.y - 12;
    const py2 = plane.y + 12;

    if (px2 > bx1 && px1 < bx2 && py2 > by1 && py1 < by2) {
      return { hit: true, type: 'building', building, x: plane.x, y: plane.y };
    }
  }

  // Monas collision
  const monas = terrain.monas;
  const mx1 = monas.x - monas.width / 2;
  const mx2 = monas.x + monas.width / 2;
  const my1 = monas.y;
  const my2 = monas.baseY;

  const px1 = plane.x - 20;
  const px2 = plane.x + 20;
  const py1 = plane.y - 12;
  const py2 = plane.y + 12;

  if (px2 > mx1 && px1 < mx2 && py2 > my1 && py1 < my2) {
    return { hit: true, type: 'monas', x: plane.x, y: plane.y };
  }

  return { hit: false };
}

/** Check if plane is on runway for landing. The runway lies along the ground
 *  (a horizontal strip centred at runwayX, runwayLength long); landing means
 *  touching down inside that strip, slow, level and descending gently. */
export function checkRunwayLanding(plane, terrain) {
  const runwayX = 190;
  const runwayY = terrain.runwayY;
  const runwayWidth = 80;
  const runwayLength = 300;

  const onRunwayX = plane.x >= runwayX - runwayLength / 2 && plane.x <= runwayX + runwayLength / 2;
  const onRunwayY = Math.abs(plane.y - runwayY) < 25;
  const lowSpeed = plane.speed < 140;
  const lowDescent = Math.abs(plane.vy) < 80;
  const levelAttitude = Math.abs(plane.pitch) < 0.15 && Math.abs(plane.roll) < 0.15;

  return {
    onRunway: onRunwayX && onRunwayY,
    goodApproach: lowSpeed && lowDescent && levelAttitude,
    runwayX,
    runwayY,
    runwayWidth,
    runwayLength,
  };
}

/** Rooftop pad position: the roof of the building under padX (or a default roof). */
export function getPadPosition(terrain) {
  const padX = 800;
  let padY = terrain.groundY - 150; // Default rooftop height

  for (const building of terrain.buildings) {
    if (padX >= building.x && padX <= building.x + building.width) {
      padY = building.y;
      break;
    }
  }

  return { padX, padY, padWidth: 60 };
}

/** Check if plane is over parcel drop pad. A parcel DROP only needs the
 *  plane over the pad, at pad height, slow enough to place the cargo — the
 *  descent rate does not matter (unlike a runway landing, the plane never
 *  has to touch down). */
export function checkPadDrop(plane, terrain) {
  const { padX, padY, padWidth } = getPadPosition(terrain);

  const overPad = plane.x >= padX - padWidth / 2 && plane.x <= padX + padWidth / 2;
  const atPadHeight = Math.abs(plane.y - padY) < 60;
  const lowSpeed = plane.speed < 140;

  return {
    overPad,
    atPadHeight,
    goodApproach: lowSpeed,
    padX,
    padY,
    padWidth,
  };
}