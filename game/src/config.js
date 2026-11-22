// Every tuning number, colour and floor-plan fact in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below depends on
// the screen size. The gallery is one room: an upper gallery behind a broken wall, a central
// island of display plinths, two side aisles, and the exit door at the bottom centre.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Seconds on the clock when a heist starts; at zero the sun rises and the night is over. */
export const TIME_LIMIT = 150;

export const PLAYER = {
  radius: 14,
  speed: 195,
  sneakSpeed: 96,
  grabRange: 52,
  touchCaught: 26,
};

export const HEAT = {
  max: 100,
  guardRate: 55,
  cameraRate: 42,
  decay: 11,
  /** At this heat the guards stop patrolling and hunt the last place they saw you. */
  huntAt: 60,
  /** Sneaking halves how fast the alarm climbs and shrinks every cone that can see you. */
  sneakGain: 0.5,
  sneakRange: 0.62,
};

export const GUARD = {
  patrolSpeed: 72,
  huntSpeed: 132,
  sightRange: 235,
  halfAngle: 0.61,
};

export const CAMERA = {
  sightRange: 265,
  halfAngle: 0.52,
  sweep: 0.55,
};

export const SMOKE = { charges: 3, radius: 150, seconds: 6 };

/** Walls and plinths block movement and line of sight. {x, y, w, h} in field coordinates. */
export const WALLS = [
  { x: 0, y: 0, w: 1280, h: 24 },
  { x: 0, y: 696, w: 600, h: 24 },
  { x: 680, y: 696, w: 600, h: 24 },
  { x: 0, y: 0, w: 24, h: 720 },
  { x: 1256, y: 0, w: 24, h: 720 },
  // The broken wall into the upper gallery: one doorway in the middle.
  { x: 24, y: 196, w: 400, h: 24 },
  { x: 856, y: 196, w: 400, h: 24 },
];

/** Display plinths: cover to hide behind, and loot sits on or beside them. One solid
 * central block, not two cases with a slot between them: a slot is a dead end a greedy
 * pilot — and a hurried thief — walks into and cannot get out of. */
export const PLINTHS = [
  { x: 500, y: 330, w: 280, h: 120 },
  { x: 300, y: 520, w: 100, h: 60 },
  { x: 880, y: 520, w: 100, h: 60 },
];

/** Everything solid: walls plus plinths, used for movement and for sight lines. */
export const SOLIDS = [...WALLS, ...PLINTHS];

export const EXIT = { x: 600, y: 696, w: 80, h: 24 };

export const LOOT = [
  { kind: 'painting', name: 'Moonlit Harbor', value: 600, x: 140, y: 90 },
  { kind: 'painting', name: 'The Gilded Hour', value: 800, x: 640, y: 90 },
  { kind: 'painting', name: 'Velvet Nocturne', value: 600, x: 900, y: 90 },
  { kind: 'gem', name: 'Star Sapphire', value: 300, x: 350, y: 380 },
  { kind: 'gem', name: 'Emerald Tear', value: 300, x: 930, y: 380 },
  { kind: 'coins', name: 'Coin Stack', value: 150, x: 200, y: 610 },
  { kind: 'coins', name: 'Coin Stack', value: 150, x: 640, y: 600 },
  { kind: 'coins', name: 'Coin Stack', value: 150, x: 1080, y: 610 },
];

export const GUARDS = [
  { waypoints: [[200, 300], [200, 600]], start: 0 },
  { waypoints: [[1080, 300], [1080, 600]], start: 0 },
  { waypoints: [[500, 120], [780, 120]], start: 0 },
];

export const CAMERAS = [
  { x: 40, y: 300, base: 0, phase: 0 },
  { x: 1240, y: 300, base: Math.PI, phase: 1.7 },
];

export const PALETTE = {
  backdrop: '#0c0a12',
  floor: '#241d2e',
  floorAlt: '#2a2236',
  carpet: '#4a1f2e',
  wall: '#3a3247',
  wallTop: '#574a6b',
  plinth: '#332b40',
  plinthTop: '#4a3f5c',
  frame: '#c9a227',
  painting: '#7d5ba6',
  gem: '#37d3c2',
  coin: '#f2c94c',
  player: '#e8e4f0',
  playerCloak: '#23202e',
  guard: '#c94f43',
  guardCone: 'rgba(242, 201, 76, 0.16)',
  guardConeHot: 'rgba(233, 69, 55, 0.28)',
  cameraCone: 'rgba(120, 180, 255, 0.13)',
  cameraConeHot: 'rgba(233, 69, 55, 0.26)',
  smoke: 'rgba(200, 200, 210, 0.30)',
  exit: '#39d98a',
  text: '#efeaf6',
  muted: '#a49bb5',
  heatCalm: '#39d98a',
  heatWarm: '#f2c94c',
  heatHot: '#e94537',
  panel: '#171221',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best take is kept between visits (this browser only). */
export const BEST_KEY = 'velvet-vault.best';
