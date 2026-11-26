// Mission logic for Jakarta Night Courier — Storm Run.
// Manages mission state, objectives, scoring, and win/lose conditions.

import { MISSIONS, PLANE, RUNWAY, PAD, STORM, LIGHTNING, MISSION_STATE } from './config.js';
import { checkRunwayLanding, checkPadDrop } from './terrain.js';
import { getNextRing, getDistanceToNextRing } from './rings.js';

export function createMissionManager(random) {
  let currentMissionId = 0;
  let state = MISSION_STATE.NOT_STARTED;
  let score = 0;
  let missionTimer = 0;
  let missionStartTime = 0;
  let objectives = {};
  let completedMissions = new Set();
  let ringCombo = 0;          // Consecutive rings without hitting posts
  let lastRingTime = 0;       // Time since last ring for combo
  let stormWind = { x: 0, y: 0, gustTimer: 0, gustAngle: 0, gustStrength: 0 };
  let lightningTimer = 0;

  function getMission() {
    return MISSIONS[currentMissionId];
  }

  function selectMission(missionId) {
    if (missionId >= 0 && missionId < MISSIONS.length) {
      currentMissionId = missionId;
    }
  }

  function startMission(plane) {
    const mission = getMission();
    state = MISSION_STATE.IN_PROGRESS;
    missionTimer = mission.timeLimit;
    missionStartTime = 0;
    score = 0;
    ringCombo = 0;
    lastRingTime = 0;
    objectives = {
      ringsPassed: 0,
      ringsTotal: mission.ringCount,
      parcelDelivered: false,
      landed: false,
      fuelEmpty: false,
      crashed: false,
      timeUp: false,
    };
    plane.refuel();
    plane.repair();
    stormWind = { x: 0, y: 0, gustTimer: 0, gustAngle: 0, gustStrength: 0 };
    lightningTimer = 0;
    return mission;
  }

  function enterBriefing() {
    state = MISSION_STATE.BRIEFING;
  }

  function update(plane, rings, terrain, dt, camera) {
    if (state !== MISSION_STATE.IN_PROGRESS) return { state, score: 0, complete: false, failed: false, reason: null };

    const mission = getMission();
    missionTimer -= dt;
    missionStartTime += dt;

    const results = {
      state,
      score: 0,
      complete: false,
      failed: false,
      reason: null,
      events: [],
      wind: { x: 0, y: 0 },
      lightning: false,
      thunderIntensity: 0,
    };

    // Check fuel
    if (plane.fuel <= 0) {
      objectives.fuelEmpty = true;
      results.failed = true;
      results.reason = 'Fuel exhausted — forced landing';
      results.events.push({ type: 'fuel_empty', message: 'FUEL EXHAUSTED — FORCED LANDING' });
      state = MISSION_STATE.FAILED;
      return results;
    }

    // Check damage
    if (plane.damage >= PLANE.crashDamage) {
      objectives.crashed = true;
      results.failed = true;
      results.reason = 'Aircraft destroyed';
      results.events.push({ type: 'crash', message: 'AIRCRAFT DESTROYED' });
      state = MISSION_STATE.FAILED;
      return results;
    }

    // Check time limit
    if (missionTimer <= 0) {
      objectives.timeUp = true;
      results.failed = true;
      results.reason = 'Time limit exceeded';
      results.events.push({ type: 'timeout', message: 'MISSION TIME EXPIRED' });
      state = MISSION_STATE.FAILED;
      return results;
    }

    // Update storm wind and lightning for storm missions
    if (mission.hasStorm) {
      updateStormWind(stormWind, dt);
      results.wind = { x: stormWind.x, y: stormWind.y };

      // Lightning timer
      lightningTimer -= dt;
      if (lightningTimer <= 0) {
        lightningTimer = LIGHTNING.flashInterval.min + Math.random() * (LIGHTNING.flashInterval.max - LIGHTNING.flashInterval.min);
        results.lightning = true;
        // Thunder will be handled by camera, but we can signal intensity here
        results.thunderIntensity = 0.5 + Math.random() * 0.5;
      }
    }

    // Mission-specific logic
    if (currentMissionId === 0) { // Ring Run
      results.score += updateRingRun(plane, rings, mission, results, dt);
    } else if (currentMissionId === 1) { // Parcel Drop
      results.score += updateParcelDrop(plane, rings, terrain, mission, results);
    } else if (currentMissionId === 2) { // Storm Return
      results.score += updateStormReturn(plane, rings, terrain, mission, results);
    } else if (currentMissionId === 3) { // Dawn Landing
      results.score += updateDawnLanding(plane, rings, terrain, mission, results);
    }

    // Check mission completion
    if (checkMissionComplete(mission, objectives)) {
      results.complete = true;
      results.score += mission.completionBonus;
      results.events.push({ type: 'complete', message: `MISSION COMPLETE — ${mission.name}` });
      state = MISSION_STATE.COMPLETE;
      completedMissions.add(currentMissionId);
    }

    score += results.score;
    results.state = state;
    return results;
  }

  function updateRingRun(plane, rings, mission, results, dt) {
    let addedScore = 0;

    // Score for passing rings
    for (const ring of rings) {
      if (ring.passed && !ring.scored) {
        ring.scored = true;
        addedScore += mission.scorePerRing;
        objectives.ringsPassed++;
        results.events.push({ type: 'ring', message: `RING ${objectives.ringsPassed}/${objectives.ringsTotal} — +${mission.scorePerRing}` });

        // Combo system: consecutive rings within 10 seconds
        const now = missionStartTime;
        if (now - lastRingTime < 10) {
          ringCombo++;
          addedScore += ringCombo * 50;
          results.events.push({ type: 'combo', message: `COMBO x${ringCombo} — +${ringCombo * 50}` });
        } else {
          ringCombo = 1;
        }
        lastRingTime = now;
      }
    }

    // Speed bonus for maintaining good speed through rings
    const nextRing = getNextRing(rings);
    if (nextRing) {
      const dist = getDistanceToNextRing(plane, rings);
      if (dist < 300 && plane.speed > 280 && plane.speed < 400) {
        addedScore += 5 * dt;
      }
    }

    return addedScore;
  }

  function updateParcelDrop(plane, rings, terrain, mission, results) {
    let addedScore = 0;

    // Score for passing rings
    for (const ring of rings) {
      if (ring.passed && !ring.scored) {
        ring.scored = true;
        addedScore += mission.scorePerRing;
        objectives.ringsPassed++;
        results.events.push({ type: 'ring', message: `RING ${objectives.ringsPassed}/${objectives.ringsTotal} — +${mission.scorePerRing}` });

        const now = missionStartTime;
        if (now - lastRingTime < 10) {
          ringCombo++;
          addedScore += ringCombo * 50;
          results.events.push({ type: 'combo', message: `COMBO x${ringCombo} — +${ringCombo * 50}` });
        } else {
          ringCombo = 1;
        }
        lastRingTime = now;
      }
    }

    // Check parcel drop
    if (!objectives.parcelDelivered) {
      const pad = checkPadDrop(plane, terrain);
      if (pad.overPad && pad.atPadHeight && pad.goodApproach) {
        objectives.parcelDelivered = true;
        addedScore += mission.deliveryBonus;
        results.events.push({ type: 'delivery', message: `PARCEL DELIVERED — +${mission.deliveryBonus}` });
      }
    }

    return addedScore;
  }

  function updateStormReturn(plane, rings, terrain, mission, results) {
    let addedScore = 0;

    // Score for passing rings
    for (const ring of rings) {
      if (ring.passed && !ring.scored) {
        ring.scored = true;
        addedScore += mission.scorePerRing;
        objectives.ringsPassed++;
        results.events.push({ type: 'ring', message: `RING ${objectives.ringsPassed}/${objectives.ringsTotal} — +${mission.scorePerRing}` });

        const now = missionStartTime;
        if (now - lastRingTime < 10) {
          ringCombo++;
          addedScore += ringCombo * 50;
          results.events.push({ type: 'combo', message: `COMBO x${ringCombo} — +${ringCombo * 50}` });
        } else {
          ringCombo = 1;
        }
        lastRingTime = now;
      }
    }

    // Check landing
    if (!objectives.landed) {
      const landing = checkRunwayLanding(plane, terrain);
      if (landing.onRunway) {
        if (landing.goodApproach) {
          objectives.landed = true;
          addedScore += mission.landingBonus;
          results.events.push({ type: 'landing', message: `PERFECT LANDING — +${mission.landingBonus}` });
        } else {
          objectives.landed = true;
          plane.applyDamage(20);
          addedScore += Math.floor(mission.landingBonus * 0.5);
          results.events.push({ type: 'hard_landing', message: `HARD LANDING — +${Math.floor(mission.landingBonus * 0.5)} (damage +20)` });
        }
      }
    }

    return addedScore;
  }

  function updateDawnLanding(plane, rings, terrain, mission, results) {
    let addedScore = 0;

    // Score for passing rings
    for (const ring of rings) {
      if (ring.passed && !ring.scored) {
        ring.scored = true;
        addedScore += mission.scorePerRing;
        objectives.ringsPassed++;
        results.events.push({ type: 'ring', message: `RING ${objectives.ringsPassed}/${objectives.ringsTotal} — +${mission.scorePerRing}` });

        const now = missionStartTime;
        if (now - lastRingTime < 10) {
          ringCombo++;
          addedScore += ringCombo * 50;
          results.events.push({ type: 'combo', message: `COMBO x${ringCombo} — +${ringCombo * 50}` });
        } else {
          ringCombo = 1;
        }
        lastRingTime = now;
      }
    }

    // Check landing (stricter for dawn landing — bonus for perfection)
    if (!objectives.landed) {
      const landing = checkRunwayLanding(plane, terrain);
      if (landing.onRunway) {
        if (landing.goodApproach) {
          objectives.landed = true;
          // Perfect landing bonus: speed < 110, descent < 30, level
          const perfect = plane.speed < 110 && Math.abs(plane.vy) < 30 && Math.abs(plane.pitch) < 0.08 && Math.abs(plane.roll) < 0.08;
          if (perfect) {
            addedScore += mission.landingBonus + 2000;
            results.events.push({ type: 'perfect_landing', message: `PERFECT DAWN LANDING — +${mission.landingBonus + 2000}` });
          } else {
            addedScore += mission.landingBonus;
            results.events.push({ type: 'landing', message: `GOOD LANDING — +${mission.landingBonus}` });
          }
        } else {
          objectives.landed = true;
          plane.applyDamage(25);
          addedScore += Math.floor(mission.landingBonus * 0.4);
          results.events.push({ type: 'hard_landing', message: `ROUGH LANDING — +${Math.floor(mission.landingBonus * 0.4)} (damage +25)` });
        }
      }
    }

    return addedScore;
  }

  function checkMissionComplete(mission, objectives) {
    if (currentMissionId === 0) {
      return objectives.ringsPassed >= objectives.ringsTotal;
    } else if (currentMissionId === 1) {
      return objectives.parcelDelivered && objectives.ringsPassed >= objectives.ringsTotal;
    } else if (currentMissionId === 2) {
      return objectives.landed && objectives.ringsPassed >= objectives.ringsTotal;
    } else if (currentMissionId === 3) {
      return objectives.landed && objectives.ringsPassed >= objectives.ringsTotal;
    }
    return false;
  }

  function updateStormWind(wind, dt) {
    wind.gustTimer -= dt;
    if (wind.gustTimer <= 0) {
      wind.gustTimer = STORM.gustInterval;
      wind.gustAngle = Math.random() * Math.PI * 2;
      wind.gustStrength = STORM.windStrength + (Math.random() - 0.5) * STORM.windVariation * 2;
    }
    wind.x = Math.cos(wind.gustAngle) * wind.gustStrength;
    wind.y = Math.sin(wind.gustAngle) * wind.gustStrength;
    // Add turbulence
    wind.x += (Math.random() - 0.5) * STORM.turbulence * 1000 * dt;
    wind.y += (Math.random() - 0.5) * STORM.turbulence * 1000 * dt;
  }

  function getMissionProgress() {
    const mission = getMission();
    return {
      missionId: currentMissionId,
      missionName: mission.name,
      briefing: mission.briefing,
      state,
      score,
      timeRemaining: Math.max(0, missionTimer),
      objectives: { ...objectives },
      completed: completedMissions.has(currentMissionId),
      hasStorm: mission.hasStorm,
      hasDawn: mission.hasDawn,
    };
  }

  function getTotalScore() {
    return score;
  }

  return {
    getMission,
    selectMission,
    startMission,
    enterBriefing,
    update,
    getMissionProgress,
    getTotalScore,
    get completedMissions() { return completedMissions; },
  };
}