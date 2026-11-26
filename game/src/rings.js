// Glowing ring system for Jakarta Night Courier.
// Rings are the primary navigation targets for missions.

import { RINGS, FIELD, MISSIONS } from './config.js';

/** Create rings for a specific mission. */
export function createRings(missionId, random) {
  const mission = MISSIONS[missionId];
  const rings = [];
  const colorSet = RINGS.colors[missionId % RINGS.colors.length];

  // Base Y position for ring path (varies by mission)
  let baseY;
  if (missionId === 0) {
    // Ring Run: varied altitude path through city
    baseY = 280;
  } else if (missionId === 1) {
    // Parcel Drop: approach path to rooftop
    baseY = 220;
  } else {
    // Storm Return: approach to runway
    baseY = 300;
  }

  const startX = 300;
  const spacing = RINGS.xSpacing;

  for (let i = 0; i < mission.ringCount; i++) {
    // Add variation to create interesting flight path
    let x = startX + i * spacing;
    let y = baseY;

    if (missionId === 0) {
      // Ring Run: zigzag through the city. Rings 3 and 4 (either side of Monas,
      // x 559/684) fly HIGH, over the tower's flame, so the course never asks
      // the pilot to thread the monument itself.
      const YS = [172, 244, 160, 170, 316, 388, 244, 316];
      y = YS[i % YS.length];
      x += (random() - 0.5) * 40;
    } else if (missionId === 1) {
      // Parcel Drop: descending approach to the pad tower roof (y=380).
      y += i * 15; // Gradual descent
      if (i >= mission.ringCount - 2) {
        // Last rings lead down to the pad: high and well short of the tower,
        // so the pilot has room to slow to delivery speed before the roof.
        // (Ring 4 used to sit at (760, 320) — 72 px from the pad — and the
        // plane arrived at 285 px/s with no room to brake, diving into the
        // roof for 60 damage before it could deliver.)
        x = 640 + (i - (mission.ringCount - 2)) * 60;
        y = 240 + (i - (mission.ringCount - 2)) * 40;
      }
    } else {
      // Storm Return: westbound descent to the runway. The first three rings
      // stay ABOVE Monas tower (top y=220) so the approach never threads the
      // monument; the last two set up a shallow final to the runway (190, 626).
      const PATH = [
        { x: 880, y: 220 },
        { x: 720, y: 190 },
        { x: 560, y: 180 },
        { x: 430, y: 280 },
        { x: 330, y: 400 },
        { x: 280, y: 580 },
      ];
      const p = PATH[i % PATH.length];
      x = p.x;
      y = p.y;
    }

    // Clamp to valid bounds (rings may sit low on a final approach)
    x = Math.max(100, Math.min(FIELD.width - 100, x));
    y = Math.max(100, Math.min(FIELD.height - 60, y));

    rings.push({
      x,
      y,
      radius: RINGS.outerRadius,
      innerRadius: RINGS.innerRadius,
      passed: false,
      active: i === 0, // Only first ring active initially
      index: i,
      colorPrimary: colorSet.primary,
      colorGlow: colorSet.glow,
      pulsePhase: random() * Math.PI * 2,
      // Ring posts (the vertical supports) for collision
      posts: [
        { x: x - RINGS.outerRadius, y: y, radius: 6, hit: false },
        { x: x + RINGS.outerRadius, y: y, radius: 6, hit: false },
      ],
      // Particle trail for visual effect
      particles: [],
    });
  }

  return rings;
}

/** Update ring animations and check collisions. */
export function updateRings(rings, plane, dt, time, missionId) {
  let ringsPassedThisFrame = 0;
  let ringPostHits = 0;
  let currentRingIndex = -1;

  // Find current active ring
  for (let i = 0; i < rings.length; i++) {
    if (!rings[i].passed) {
      currentRingIndex = i;
      rings[i].active = true;
      break;
    }
  }

  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];

    // Pulse animation
    ring.pulsePhase += dt * RINGS.pulseSpeed;

    // Update particles
    if (ring.active && !ring.passed) {
      // Add particles at ring perimeter
      if (Math.random() < 0.4) {
        const angle = Math.random() * Math.PI * 2;
        ring.particles.push({
          x: ring.x + Math.cos(angle) * ring.radius,
          y: ring.y + Math.sin(angle) * ring.radius,
          vx: Math.cos(angle) * 20,
          vy: Math.sin(angle) * 20,
          life: 0.5 + Math.random() * 0.5,
          age: 0,
          size: 2 + Math.random() * 3,
          alpha: 0.6,
        });
      }
    }

    for (let pi = ring.particles.length - 1; pi >= 0; pi--) {
      const p = ring.particles[pi];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = 1 - p.age / p.life;
      if (p.age >= p.life) ring.particles.splice(pi, 1);
    }

    // Check ring passage (plane flies through the ring hoop).
    // A pass is the plane centre coming within the hoop's radius while the
    // ring is active — at 60 steps per second the plane cannot tunnel past a
    // 140 px wide hoop without a frame inside it.
    if (ring.active && !ring.passed) {
      const dx = plane.x - ring.x;
      const dy = plane.y - ring.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < ring.radius) {
        ring.passed = true;
        ring.active = false;
        ringsPassedThisFrame++;

        // Activate next ring
        if (i + 1 < rings.length) {
          rings[i + 1].active = true;
        }
      }

      // Check ring post collisions
      for (const post of ring.posts) {
        if (!post.hit) {
          const pdx = plane.x - post.x;
          const pdy = plane.y - post.y;
          const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
          if (pdist < post.radius + 20) { // Plane radius ~20
            post.hit = true;
            ringPostHits++;
          }
        }
      }
    }
  }

  // Store current position for next frame's crossing detection
  plane.prevX = plane.x;
  plane.prevY = plane.y;

  return {
    ringsPassed: ringsPassedThisFrame,
    ringPostHits,
    currentRingIndex,
    allPassed: rings.every(r => r.passed),
  };
}

/** Get the next ring the player should fly through. */
export function getNextRing(rings) {
  for (const ring of rings) {
    if (!ring.passed) return ring;
  }
  return null;
}

/** Get distance to next ring. */
export function getDistanceToNextRing(plane, rings) {
  const next = getNextRing(rings);
  if (!next) return null;
  const dx = next.x - plane.x;
  const dy = next.y - plane.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Get bearing to next ring (degrees, 0 = right/east, 90 = down/south). */
export function getBearingToNextRing(plane, rings) {
  const next = getNextRing(rings);
  if (!next) return plane.heading * 180 / Math.PI;
  const dx = next.x - plane.x;
  const dy = next.y - plane.y;
  return Math.atan2(dy, dx) * 180 / Math.PI;
}