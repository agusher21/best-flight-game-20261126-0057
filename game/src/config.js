// All tuning numbers, colours, and fixed constants in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the window.

export const FIELD = { width: 1280, height: 720, horizonY: 180 };

/** Fixed simulation step in seconds: 60 updates per second regardless of display rate. */
export const STEP = 1 / 60;

/** The longest frame the loop catches up on; a longer stall (hidden tab) is dropped, not replayed. */
export const MAX_FRAME = 0.25;

/** Aircraft physics constants. */
export const PLANE = {
  /** Maximum forward speed (pixels per second). */
  maxSpeed: 420,
  /** Minimum forward speed before stall (pixels per second). */
  minSpeed: 80,
  /** Thrust acceleration per second at full throttle. */
  thrust: 320,
  /** Drag deceleration per second at zero throttle. */
  drag: 120,
  /** Turn rate at max speed (radians per second). */
  turnRateMax: 2.6,
  /** Turn rate multiplier at min speed. */
  turnRateMinMult: 0.6,
  /** Roll angle per turn input (radians). */
  rollPerTurn: 0.9,
  /** Roll return speed (radians per second). */
  rollReturn: 3.0,
  /** Pitch angle per throttle change (radians). */
  pitchPerThrottle: 0.15,
  /** Gravity acceleration (pixels per second squared). */
  gravity: 150,
  /** Lift coefficient: lift = speed^2 * liftCoeff. */
  liftCoeff: 0.002,
  /** Flaps drag multiplier when space held. */
  flapsDragMult: 2.5,
  /** Flaps lift multiplier when space held. */
  flapsLiftMult: 1.4,
  /** Fuel consumption per second at full throttle (0-100 fuel). */
  fuelPerSecond: 0.7,
  /** Fuel consumption multiplier at zero throttle. */
  fuelIdleMult: 0.15,
  /** Starting fuel (0-100). */
  startingFuel: 100,
  /** Starting damage (0-100). */
  startingDamage: 0,
  /** Damage per building/ground hit. */
  damagePerHit: 15,
  /** Damage per ring post clip. */
  damagePerRingClip: 5,
  /** Crash damage threshold. */
  crashDamage: 100,
};

/** Mission definitions. */
export const MISSIONS = [
  {
    id: 0,
    name: 'Ring Run',
    briefing: 'Fly through all 8 glowing rings in order. Keep your speed up and turn precisely.',
    ringCount: 8,
    hasParcel: false,
    hasStorm: false,
    timeLimit: 120,
    scorePerRing: 500,
    completionBonus: 2000,
  },
  {
    id: 1,
    name: 'Parcel Drop',
    briefing: 'Deliver the parcel to the rooftop pad. Slow down, line up, and drop at low altitude.',
    ringCount: 4,
    hasParcel: true,
    hasStorm: false,
    timeLimit: 180,
    scorePerRing: 300,
    deliveryBonus: 3000,
    completionBonus: 2000,
  },
  {
    id: 2,
    name: 'Storm Return',
    briefing: 'Land on the runway before fuel runs out. The storm pushes you — correct constantly.',
    ringCount: 6,
    hasParcel: false,
    hasStorm: true,
    timeLimit: 300,
    scorePerRing: 400,
    landingBonus: 5000,
    completionBonus: 3000,
  },
];

/** Terrain generation constants. */
export const TERRAIN = {
  /** Building count. */
  buildingCount: 120,
  /** Building width range. */
  buildingWidth: { min: 30, max: 80 },
  /** Building height range (from ground up). */
  buildingHeight: { min: 60, max: 300 },
  /** Window grid spacing. */
  windowSpacing: { x: 18, y: 16 },
  /** Window lit probability at night. */
  windowLitProbability: 0.7,
  /** Monas tower position (x from left). */
  monasX: 640,
  /** Monas tower height. */
  monasHeight: 420,
  /** Sea level Y (from bottom). */
  seaLevel: 80,
  /** Coastline X position. */
  coastX: 900,
  /** Far background hill count. */
  hillCount: 8,
  /** Star count. */
  starCount: 120,
};

/** Ring constants. */
export const RINGS = {
  /** Ring outer radius. */
  outerRadius: 70,
  /** Ring inner radius (hole). */
  innerRadius: 44,
  /** Ring segment count for glow effect. */
  segments: 24,
  /** Ring pulse speed. */
  pulseSpeed: 2.5,
  /** Ring colors by mission. */
  colors: [
    { primary: '#00ffff', glow: '#0088ff' },    // Mission 0 - cyan
    { primary: '#ffcc00', glow: '#ff8800' },    // Mission 1 - gold
    { primary: '#ff4488', glow: '#ff0066' },    // Mission 2 - magenta
  ],
  /** Ring vertical variation range. */
  yVariation: 120,
  /** Ring horizontal spacing. */
  xSpacing: 125,
};

/** Runway constants. */
export const RUNWAY = {
  width: 80,
  length: 300,
  x: 190,
  y: 0, // Will be set to ground level
  thresholdX: 190,
  thresholdWidth: 80,
};

/** Parcel drop pad constants. */
export const PAD = {
  width: 60,
  height: 10,
  x: 800,
  y: 0, // Will be set to rooftop level
  glowColor: '#00ff88',
};

/** Storm/wind constants. */
export const STORM = {
  windStrength: 28,       // Base wind force (pixels per second squared)
  windVariation: 18,      // Random gust variation
  gustInterval: 1.5,      // Seconds between gust changes
  turbulence: 0.02,       // Random angular perturbation per second
};

/** HUD and UI constants. */
export const HUD = {
  font: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  monoFont: '"SF Mono", "Fira Code", "Consolas", monospace',
  instrumentGlow: '#00ffcc',
  instrumentBg: '#0a1418',
  instrumentBorder: '#004455',
  textPrimary: '#e8fff8',
  textMuted: '#6aa898',
  warningColor: '#ff4444',
  cautionColor: '#ffcc00',
  safeColor: '#00ff88',
};

/** Color palette for the night scene. */
export const PALETTE = {
  skyTop: '#050814',
  skyMid: '#0a1020',
  skyHorizon: '#101830',
  seaTop: '#030612',
  seaMid: '#060c1a',
  seaSurface: '#081224',
  buildingDark: '#0d1420',
  buildingMid: '#141e30',
  buildingLight: '#1a2840',
  windowLit: '#ffeb3b',
  windowDim: '#3a3010',
  windowDark: '#1a1810',
  monasBody: '#1a2438',
  monasGlow: '#ffd700',
  monasTop: '#ffaa00',
  ringGlowBase: '#00ffff',
  runwayLight: '#ffffff',
  runwayEdge: '#ff4444',
  padGlow: '#00ff88',
  contrailColor: 'rgba(255,255,255,0.15)',
};

/** Where the best scores are kept between visits (this browser only). */
export const STORAGE_KEY = 'jakarta-night-courier.best';

/** Screenshot seed for reproducibility. */
export const SHOT_SEED = 424242;

/** Screenshot scene durations in seconds. */
export const SHOT_SCENES = {
  start: 4,   // Title screen with animated backdrop
  play: 18,   // Mid-mission gameplay
  end: 35,    // Landing or mission complete
};

/** Autopilot constants for screenshots. */
export const AUTOPILOT = {
  horizon: 1.2,
  sampleStep: 1 / 30,
  directions: [-1, 0, 1],
  margin: 40,
  targetSpeed: 320,
  approachSpeed: 160,
  landingSpeed: 110,
};

export const SCREENS = {
  TITLE: 'title',
  MISSION_SELECT: 'mission_select',
  BRIEFING: 'briefing',
  PLAY: 'play',
  PAUSED: 'paused',
  MISSION_COMPLETE: 'mission_complete',
  GAME_OVER: 'game_over',
};