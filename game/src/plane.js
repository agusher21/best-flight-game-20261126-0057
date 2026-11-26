// Aircraft physics and state for Jakarta Night Courier.
// Pure simulation: no drawing, no browser APIs. step() advances one fixed step and returns
// collision info so the world can react without the plane knowing about terrain or rings.

import { PLANE, STEP, FIELD } from './config.js';

/** Aircraft state returned by createPlane. */
export function createPlane(random) {
  // Position and velocity
  let x = 200;          // Horizontal position (pixels from left)
  let y = 300;          // Vertical position (pixels from top, 0 = top)
  let vx = 200;         // Horizontal velocity (pixels/sec)
  let vy = 0;           // Vertical velocity (pixels/sec, positive = down)
  let heading = 0;      // Heading in radians (0 = right/east, -PI/2 = up/north)
  let speed = 200;      // Forward speed (pixels/sec)
  let roll = 0;         // Roll angle in radians (visual only, affects turn)
  let pitch = 0;        // Pitch angle in radians (visual only)
  let throttle = 0.5;   // Throttle position 0-1
  let flaps = false;    // Flaps/brake deployed
  let fuel = PLANE.startingFuel;
  let damage = PLANE.startingDamage;
  let altitude = 0;     // Altitude above sea level (feet, for display)
  let contrails = [];   // Contrail particles for visual effect

  // Engine sound state
  let enginePitch = 0.5;

  function reset(missionId = 0) {
    x = 200;
    y = 220;
    vx = 260;
    vy = 0;
    heading = 0;
    speed = 260;
    roll = 0;
    pitch = 0;
    throttle = 0.5;
    flaps = false;
    fuel = PLANE.startingFuel;
    damage = PLANE.startingDamage;
    altitude = 1500;
    contrails = [];
    enginePitch = 0.5;
  }

  /**
   * Advance the plane by one fixed step.
   * @param {number} dt - Time step in seconds (STEP).
   * @param {number} throttleInput - Throttle input: -1 (down), 0, 1 (up).
   * @param {number} turnInput - Turn input: -1 (left), 0, 1 (right).
   * @param {boolean} brakeInput - Brake/flaps held.
   * @param {object} wind - Wind vector { x, y } in pixels/sec^2.
   * @returns {object} Collision info: { hitGround, hitBuilding, hitRingPost, stall, overspeed }
   */
  function step(dt, throttleInput, turnInput, brakeInput, wind = { x: 0, y: 0 }) {
    const collisions = {
      hitGround: false,
      hitBuilding: false,
      hitRingPost: false,
      stall: false,
      overspeed: false,
    };

    // Update throttle (smooth)
    const throttleRate = 0.8; // Throttle change per second
    throttle = Math.max(0, Math.min(1, throttle + throttleInput * throttleRate * dt));
    flaps = brakeInput;

    // Engine thrust (nothing when the tank is dry — forced glide)
    const thrustForce = fuel > 0 ? PLANE.thrust * throttle : 0;
    const dragForce = PLANE.drag * (flaps ? PLANE.flapsDragMult : 1) * (speed / PLANE.maxSpeed);

    // Speed change from thrust and drag
    const accel = thrustForce - dragForce;
    speed += accel * dt;

    // Clamp speed
    if (speed > PLANE.maxSpeed) {
      speed = PLANE.maxSpeed;
      collisions.overspeed = true;
    }
    if (speed < PLANE.minSpeed) {
      speed = PLANE.minSpeed;
      collisions.stall = true;
    }

    // Turn rate depends on speed (slower = less responsive)
    const speedRatio = (speed - PLANE.minSpeed) / (PLANE.maxSpeed - PLANE.minSpeed);
    const turnRate = PLANE.turnRateMax * (PLANE.turnRateMinMult + (1 - PLANE.turnRateMinMult) * speedRatio);
    // Bank into the turn: right input (+1) banks right and turns the nose
    // clockwise on screen (heading grows); left input does the opposite.
    const targetRoll = turnInput * PLANE.rollPerTurn;
    roll += (targetRoll - roll) * PLANE.rollReturn * dt;

    // Heading change from roll (banked turn)
    heading += roll * turnRate * dt;

    // Pitch follows throttle changes (visual)
    const targetPitch = (throttle - 0.5) * PLANE.pitchPerThrottle * 2;
    pitch += (targetPitch - pitch) * 4 * dt;

    // Forward velocity vector
    const forwardX = Math.cos(heading);
    const forwardY = Math.sin(heading);

    // Apply forward speed
    vx = forwardX * speed;
    vy = forwardY * speed;

    // Gravity and lift
    const liftForce = speed * speed * PLANE.liftCoeff * (flaps ? PLANE.flapsLiftMult : 1);
    const gravityForce = PLANE.gravity;
    const netVerticalForce = gravityForce - liftForce;

    // Apply vertical acceleration (in world space, not body space)
    vy += netVerticalForce * dt;

    // Apply wind
    vx += wind.x * dt;
    vy += wind.y * dt;

    // Update position
    x += vx * dt;
    y += vy * dt;

    // Stay inside the field: bounce off the sky and the side edges (the ground
    // is handled by terrain collision in the game loop).
    if (x < 30) {
      x = 30;
      heading = Math.PI - heading;
    } else if (x > FIELD.width - 30) {
      x = FIELD.width - 30;
      heading = Math.PI - heading;
    }
    if (y < 30) {
      y = 30;
      heading = -heading;
    }
    // Never sink below ground level (the runway roll / crash is decided by the
    // game loop, not by falling through the floor).
    if (y > FIELD.height - 80) y = FIELD.height - 80;
    heading = Math.atan2(Math.sin(heading), Math.cos(heading));

    // Update altitude (feet, approximate: 1 pixel ≈ 5 feet at this scale)
    // Sea level is at y = FIELD.height - TERRAIN.seaLevel
    altitude = Math.max(0, Math.round((640 - y) * 5));

    // Fuel consumption
    const fuelRate = PLANE.fuelPerSecond * (throttle * 0.85 + PLANE.fuelIdleMult * 0.15);
    fuel = Math.max(0, fuel - fuelRate * dt);

    // Engine sound pitch follows throttle and speed
    enginePitch = 0.3 + 0.7 * throttle + 0.2 * (speed / PLANE.maxSpeed);

    // Add contrail particles occasionally
    if (Math.random() < 0.3 && speed > 150) {
      contrails.push({
        x: x - forwardX * 40,
        y: y - forwardY * 40,
        age: 0,
        life: 1.5 + Math.random() * 1.0,
        size: 8 + Math.random() * 12,
        alpha: 0.3 + Math.random() * 0.2,
      });
    }

    // Update contrails
    for (let i = contrails.length - 1; i >= 0; i--) {
      const c = contrails[i];
      c.age += dt;
      c.alpha *= 0.95;
      if (c.age >= c.life) contrails.splice(i, 1);
    }

    return { collisions, contrails: [...contrails] };
  }

  /**
   * Apply damage from a collision.
   * @param {number} amount - Damage amount (0-100).
   * @returns {boolean} True if damage reached crash threshold.
   */
  function applyDamage(amount) {
    damage = Math.min(PLANE.crashDamage, damage + amount);
    return damage >= PLANE.crashDamage;
  }

  /**
   * Place the plane at a position with a heading (mission starts, screenshot scenes).
   */
  function place(nx, ny, nheading) {
    x = nx;
    y = ny;
    heading = nheading;
    vx = Math.cos(nheading) * speed;
    vy = Math.sin(nheading) * speed;
  }

  /**
   * Collision kick: turn away from the obstacle and bleed speed.
   * @param {number} angleDelta - Heading change in radians.
   */
  function kick(angleDelta) {
    heading += angleDelta;
    speed = Math.max(PLANE.minSpeed, speed * 0.6);
  }

  /**
   * Refuel (for mission transitions).
   */
  function refuel() {
    fuel = PLANE.startingFuel;
  }

  /**
   * Repair (for mission transitions).
   */
  function repair() {
    damage = 0;
  }

  // Getters for current state
  function getState() {
    return {
      x, y, vx, vy, heading, speed, roll, pitch, throttle, flaps,
      fuel, damage, altitude, contrails, enginePitch,
    };
  }

  return { reset, step, applyDamage, refuel, repair, getState, place, kick };
}