// Mission logic for Jakarta Night Courier.
// Manages mission state, objectives, scoring, and win/lose conditions.

import { MISSIONS, PLANE, RUNWAY, PAD, STORM } from './config.js';
import { checkRunwayLanding, checkPadDrop } from './terrain.js';
import { getNextRing, getDistanceToNextRing } from './rings.js';

export const MISSION_STATE = {
  NOT_STARTED: 'not_started',
  BRIEFING: 'briefing',
  IN_PROGRESS: 'in_progress',
  COMPLETE: 'complete',
  FAILED: 'failed',
};

export function createMissionManager(random) {
  let currentMissionId = 0;
  let state = MISSION_STATE.NOT_STARTED;
  let score = 0;
  let missionTimer = 0;
  let missionStartTime = 0;
  let objectives = {};
  let completedMissions = new Set();

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
    missionStartTime = 0; // Will be set by world
    score = 0;
    objectives = {
      ringsPassed: 0,
      ringsTotal: mission.ringCount,
      parcelDelivered: false,
      landed: false,
      fuelEmpty: false,
      crashed: false,
      timeUp: false,
    };
    // Reset plane for mission
    plane.refuel();
    plane.repair();
    return mission;
  }

  function enterBriefing() {
    state = MISSION_STATE.BRIEFING;
  }

  function update(plane, rings, terrain, dt, wind) {
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

    // Mission-specific logic
    if (currentMissionId === 0) { // Ring Run
      results.score += updateRingRun(plane, rings, mission, results, dt);
    } else if (currentMissionId === 1) { // Parcel Drop
      results.score += updateParcelDrop(plane, rings, terrain, mission, results);
    } else if (currentMissionId === 2) { // Storm Return
      results.score += updateStormReturn(plane, rings, terrain, mission, results);
    }

    // Update wind for storm mission
    if (mission.hasStorm) {
      updateStormWind(wind, dt);
    }

    // Check mission completion
    if (checkMissionComplete(mission, objectives)) {
      results.complete = true;
      results.score += mission.completionBonus;
      results.events.push({ type: 'complete', message: `MISSION COMPLETE — ${mission.name}` });
      state = MISSION_STATE.COMPLETE;
      completedMissions.add(currentMissionId);
    }

    // Bank the frame's score so the HUD (and the mission summary) shows it.
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
      }
    }

    // Speed bonus for maintaining good speed through rings
    const nextRing = getNextRing(rings);
    if (nextRing) {
      const dist = getDistanceToNextRing(plane, rings);
      if (dist < 300 && plane.speed > 280 && plane.speed < 400) {
        addedScore += 5 * dt; // Small continuous bonus
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
          // Hard landing - damage but counts
          objectives.landed = true;
          plane.applyDamage(20);
          addedScore += Math.floor(mission.landingBonus * 0.5);
          results.events.push({ type: 'hard_landing', message: `HARD LANDING — +${Math.floor(mission.landingBonus * 0.5)} (damage +20)` });
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
    }
    return false;
  }

  /** Update storm wind for mission 3. */
  function updateStormWind(wind, dt) {
    wind.gustTimer = (wind.gustTimer || 0) - dt;
    if (wind.gustTimer <= 0) {
      wind.gustTimer = STORM.gustInterval;
      wind.gustAngle = Math.random() * Math.PI * 2;
      wind.gustStrength = STORM.windStrength + (Math.random() - 0.5) * STORM.windVariation * 2;
    }
    wind.x = Math.cos(wind.gustAngle) * wind.gustStrength;
    wind.y = Math.sin(wind.gustAngle) * wind.gustStrength;
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
    };
  }

  function getTotalScore() {
    // Sum of best scores for each completed mission
    let total = 0;
    for (const mid of completedMissions) {
      // In a real game, we'd store best per mission
      // For now, just return current session score
    }
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