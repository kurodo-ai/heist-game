// The screenshot scenes behind ?shot=start|play|alert|escape. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot that
// weighs every direction by how close it gets to the target and whether the next step would
// be seen, so the frame is what a short game really looks like and the same seed always
// gives the same frame.
import { FIELD, PLAYER, STEP } from './config.js';
import { EVENT_CAUGHT, EVENT_ESCAPED, EVENT_TIMEOUT } from './world.js';
import { SCREEN_ESCAPED, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 15;
const ESCAPE_LIMIT_SECONDS = 145;
const HEAT_ALERT = 78;
const SAMPLE = STEP;

/** Eight compass directions plus standing still, as unit-ish steps. */
const DIRECTIONS = [
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
  { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
  { x: 0, y: 0 },
];

/** The broken wall's doorway: the gap in the wall at y=196..220 is x=424..856. */
const GAP_X = 640;
const WALL_LINE = 208;

/**
 * A greedy pilot walks into the wall's dead end: the upper gallery's side paintings sit
 * behind the broken wall, and the shortest line to them runs straight into it. Route
 * through the doorway first — stage above or below the gap — and the direct line from
 * there is open.
 */
function routeTarget(state, target) {
  const player = state.player;
  if (target.y < WALL_LINE && player.y > WALL_LINE) return { x: GAP_X, y: 150 };
  if (target.y > WALL_LINE && player.y < WALL_LINE) return { x: GAP_X, y: 270 };
  return target;
}

/** The nearest loot not yet pocketed, or null when the gallery is empty. */
function nearestLoot(state) {
  let best = null;
  let bestDist = Infinity;
  for (const item of state.loot) {
    if (item.taken) continue;
    const dist = Math.hypot(item.x - state.player.x, item.y - state.player.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  }
  return best;
}

/**
 * Pick the next step: among the directions that do not run into a wall, the one that gets
 * closest to the target without stepping into a cone wins; a seen step costs far more than
 * any detour, and stepping within arm's reach of a guard costs almost as much. When every
 * step is seen — a guard is walking straight at the thief — the pilot stops chasing the
 * target and instead takes the step that gets farthest from the nearest guard: walking
 * into a guard's arms is worse than any detour. With `ignoreDanger` the pilot walks
 * straight at the target: the alert scene needs a thief who stands in the camera's sweep
 * on purpose.
 */
function autopilot(world, target, sneaking, ignoreDanger) {
  const state = world.state;
  const player = state.player;
  const speed = sneaking ? PLAYER.sneakSpeed : PLAYER.speed;
  let safe = DIRECTIONS[8];
  let safeDist = Infinity;
  let flee = DIRECTIONS[8];
  let fleeGap = -1;
  for (const dir of DIRECTIONS) {
    const nx = player.x + dir.x * speed * SAMPLE;
    const ny = player.y + dir.y * speed * SAMPLE;
    if (world.blockedAt(nx, ny, PLAYER.radius)) continue;
    const dist = Math.hypot(target.x - nx, target.y - ny);
    // Standing still is never the way out of a corner: charge it a little, so a step that
    // barely lengthens the trip still beats waiting where a plinth pins the thief.
    const stepDist = dir.x === 0 && dir.y === 0 ? dist + 3 : dist;
    let guardGap = Infinity;
    for (const guard of state.guards) {
      guardGap = Math.min(guardGap, Math.hypot(guard.x - nx, guard.y - ny));
    }
    let danger = 0;
    if (!ignoreDanger) {
      if (world.seenFrom(nx, ny, sneaking)) danger += 10000;
      if (guardGap < 48) danger += 5000;
    }
    if (danger === 0) {
      if (stepDist < safeDist) {
        safeDist = stepDist;
        safe = dir;
      }
    } else if (guardGap > fleeGap) {
      fleeGap = guardGap;
      flee = dir;
    }
  }
  return safeDist === Infinity ? flee : safe;
}

/**
 * Set `world` to the named scene (start, play, alert or escape; any other name is start) and
 * return the screen to draw over it and the best take to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'alert' && name !== 'escape') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { x: 0, y: 0 }, false, false, false, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }

  if (name === 'alert') {
    // Walk into the left camera's sweep and stand there until the alarm is hot, then slip
    // away toward the nearest loot: the frame shows the alarm bar burning red.
    const ambush = { x: 300, y: 300 };
    let hot = false;
    for (let index = 0; index < 40 / STEP; index += 1) {
      const target = hot ? nearestLoot(world.state) ?? { x: 640, y: 500 } : ambush;
      const dir = autopilot(world, target, false, !hot);
      const events = world.step(STEP, dir, false, false, false, false);
      if (world.state.heat >= HEAT_ALERT) hot = true;
      if (events & (EVENT_CAUGHT | EVENT_TIMEOUT)) break;
      if (hot) {
        // A short slip away once the alarm is hot: the frame keeps the bar burning red.
        for (let extra = 0; extra < 0.75 / STEP; extra += 1) {
          const away = nearestLoot(world.state) ?? { x: 640, y: 500 };
          const step = autopilot(world, away, true, false);
          const more = world.step(STEP, step, true, false, false, false);
          if (more & (EVENT_CAUGHT | EVENT_TIMEOUT)) break;
        }
        break;
      }
    }
    return { screen: world.state.status === 'playing' ? SCREEN_PLAY : SCREEN_OVER, best: world.state.score };
  }

  // 'play' and 'escape': collect the loot, sneaking past the top gallery's guard, then run.
  // On the escape run the thief only sneaks where it matters — near a guard, spotted, or
  // hot — and runs full speed on open floor, or the night runs out before the door.
  //
  // A greedy pilot can jitter forever on one spot: directly above the exit, east and west
  // both lengthen the trip by a hair while south is a wall, so it steps east, steps west,
  // and never leaves. Watch the net displacement over a second: under four pixels means
  // stuck, and the pilot takes a detour around the central block's near end instead.
  const escapeMode = name === 'escape';
  const limit = escapeMode ? ESCAPE_LIMIT_SECONDS : PLAY_SECONDS;
  let anchorX = 0;
  let anchorY = 0;
  let anchorStep = -60;
  let detour = null;
  let detourSteps = 0;
  for (let index = 0; index < limit / STEP; index += 1) {
    const state = world.state;
    const loot = nearestLoot(state);
    const nearTop = state.player.y < 240;
    const rawTarget = loot ?? { x: 640, y: 690 };
    let target = routeTarget(state, rawTarget);
    if (detour !== null) {
      target = detour;
      detourSteps += 1;
      if (Math.hypot(detour.x - state.player.x, detour.y - state.player.y) < 24 || detourSteps > 600) {
        detour = null;
      }
    }
    let nearestGuard = Infinity;
    for (const guard of state.guards) {
      nearestGuard = Math.min(nearestGuard, Math.hypot(guard.x - state.player.x, guard.y - state.player.y));
    }
    const dangerNear = nearestGuard < 280 || state.spotted || state.heat > 10;
    const sneaking = escapeMode ? dangerNear : nearTop;
    const dir = autopilot(world, target, sneaking);
    const grab = loot !== null && Math.hypot(loot.x - state.player.x, loot.y - state.player.y) < PLAYER.grabRange;
    const smoke = state.spotted && state.smokes > 0 && state.heat > 15;
    const events = world.step(STEP, dir, sneaking, grab, smoke, false);
    if (index - anchorStep >= 60) {
      const moved = Math.hypot(state.player.x - anchorX, state.player.y - anchorY);
      if (anchorStep >= 0 && moved < 4 && detour === null) {
        detour = { x: state.player.x < 640 ? 460 : 820, y: 300 };
        detourSteps = 0;
      }
      anchorX = state.player.x;
      anchorY = state.player.y;
      anchorStep = index;
    }
    if (events & (EVENT_CAUGHT | EVENT_TIMEOUT | EVENT_ESCAPED)) break;
    if (!escapeMode && state.elapsed >= PLAY_SECONDS) break;
  }
  if (world.state.status === 'escaped') return { screen: SCREEN_ESCAPED, best: world.state.score };
  return { screen: world.state.status === 'playing' ? SCREEN_PLAY : SCREEN_OVER, best: world.state.score };
}
