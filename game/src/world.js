// The game's rules and state, with no drawing and no browser in it: the thief, the patrolling
// guards and sweeping cameras, the loot, the alarm heat, the clock and the smoke bombs. step()
// advances one fixed step and returns what happened as bit flags, so the caller can react
// without the world knowing about screens or sound. Nothing here allocates after createWorld
// returns, except the small popup list, which is capped.
import {
  CAMERA, CAMERAS, EXIT, FIELD, GUARD, GUARDS, HEAT, LOOT, PLAYER, SMOKE, SOLIDS,
  TIME_LIMIT,
} from './config.js';

export const EVENT_PICKUP = 1;
export const EVENT_SPOTTED = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_ESCAPED = 8;
export const EVENT_TIMEOUT = 16;
export const EVENT_SMOKE = 32;

const TWO_PI = Math.PI * 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** Shortest angle between two headings, in (-PI, PI]. */
function angleDelta(from, to) {
  let delta = (to - from) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta <= -Math.PI) delta += TWO_PI;
  return delta;
}

/** Does the segment (x1,y1)-(x2,y2) cross the rectangle? */
function segmentHitsRect(x1, y1, x2, y2, rect) {
  if (x1 >= rect.x && x1 <= rect.x + rect.w && y1 >= rect.y && y1 <= rect.y + rect.h) return true;
  if (x2 >= rect.x && x2 <= rect.x + rect.w && y2 >= rect.y && y2 <= rect.y + rect.h) return true;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const edges = [
    [rect.x, rect.y, rect.x + rect.w, rect.y],
    [rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h, rect.x, rect.y + rect.h],
    [rect.x, rect.y + rect.h, rect.x, rect.y],
  ];
  for (let i = 0; i < edges.length; i += 1) {
    const [ex1, ey1, ex2, ey2] = edges[i];
    const denom = dx * (ey2 - ey1) - dy * (ex2 - ex1);
    if (denom === 0) continue;
    const t = ((ex1 - x1) * (ey2 - ey1) - (ey1 - y1) * (ex2 - ex1)) / denom;
    const u = ((ex1 - x1) * dy - (ey1 - y1) * dx) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}

/** Is the sight line from (x1,y1) to (x2,y2) clear of every solid? */
function lineClear(x1, y1, x2, y2) {
  for (let i = 0; i < SOLIDS.length; i += 1) {
    if (segmentHitsRect(x1, y1, x2, y2, SOLIDS[i])) return false;
  }
  return true;
}

/** Circle (x,y,r) against one rectangle: push the circle out and say whether it hit. */
function pushOutOfRect(circle, rect) {
  const nearestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const nearestY = clamp(circle.y, rect.y, rect.y + rect.h);
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= circle.r * circle.r) return false;
  if (distSq === 0) {
    // Centre inside the rectangle: push out through the nearest face.
    const left = circle.x - rect.x;
    const right = rect.x + rect.w - circle.x;
    const top = circle.y - rect.y;
    const bottom = rect.y + rect.h - circle.y;
    const min = Math.min(left, right, top, bottom);
    if (min === left) circle.x = rect.x - circle.r;
    else if (min === right) circle.x = rect.x + rect.w + circle.r;
    else if (min === top) circle.y = rect.y - circle.r;
    else circle.y = rect.y + rect.h + circle.r;
    return true;
  }
  const dist = Math.sqrt(distSq);
  circle.x = nearestX + (dx / dist) * circle.r;
  circle.y = nearestY + (dy / dist) * circle.r;
  return true;
}

export function createWorld(random) {
  const player = { x: 640, y: 640, r: PLAYER.radius, facing: -Math.PI / 2, sneaking: false };
  const guards = GUARDS.map((def) => ({
    waypoints: def.waypoints,
    target: def.start === 0 ? 1 : 0,
    x: def.waypoints[def.start][0],
    y: def.waypoints[def.start][1],
    facing: 0,
    hunting: false,
    lastSeenX: 0,
    lastSeenY: 0,
  }));
  const cameras = CAMERAS.map((def) => ({
    x: def.x, y: def.y, base: def.base, phase: def.phase, angle: def.base,
  }));
  const loot = LOOT.map((def) => ({ ...def, taken: false }));
  const popups = [];
  const smoke = { active: false, x: 0, y: 0, t: 0 };
  const state = {
    player, guards, cameras, loot, popups, smoke,
    score: 0, heat: 0, timeLeft: TIME_LIMIT, smokes: SMOKE.charges,
    status: 'playing', elapsed: 0, spotted: false, escaped: false,
    spottedX: 0, spottedY: 0,
  };

  function reset() {
    player.x = 640;
    player.y = 640;
    player.facing = -Math.PI / 2;
    player.sneaking = false;
    for (let i = 0; i < guards.length; i += 1) {
      const def = GUARDS[i];
      guards[i].x = def.waypoints[def.start][0];
      guards[i].y = def.waypoints[def.start][1];
      guards[i].target = def.start === 0 ? 1 : 0;
      guards[i].facing = 0;
      guards[i].hunting = false;
    }
    for (let i = 0; i < cameras.length; i += 1) cameras[i].angle = CAMERAS[i].base;
    for (const item of loot) item.taken = false;
    popups.length = 0;
    smoke.active = false;
    smoke.t = 0;
    state.score = 0;
    state.heat = 0;
    state.timeLeft = TIME_LIMIT;
    state.smokes = SMOKE.charges;
    state.status = 'playing';
    state.elapsed = 0;
    state.spotted = false;
    state.escaped = false;
  }

  /** Would a thief standing at (x, y) be seen right now? Used by the screenshot autopilot. */
  function seenFrom(x, y, sneaking) {
    if (smoke.active && distance(x, y, smoke.x, smoke.y) < SMOKE.radius) return false;
    const rangeScale = sneaking ? HEAT.sneakRange : 1;
    for (let i = 0; i < guards.length; i += 1) {
      const guard = guards[i];
      const dist = distance(x, y, guard.x, guard.y);
      if (dist > GUARD.sightRange * rangeScale) continue;
      if (Math.abs(angleDelta(guard.facing, Math.atan2(y - guard.y, x - guard.x))) > GUARD.halfAngle) continue;
      if (lineClear(guard.x, guard.y, x, y)) return true;
    }
    for (let i = 0; i < cameras.length; i += 1) {
      const camera = cameras[i];
      const dist = distance(x, y, camera.x, camera.y);
      if (dist > CAMERA.sightRange * rangeScale) continue;
      if (Math.abs(angleDelta(camera.angle, Math.atan2(y - camera.y, x - camera.x))) > CAMERA.halfAngle) continue;
      if (lineClear(camera.x, camera.y, x, y)) return true;
    }
    return false;
  }

  /** Can a circle of radius r stand at (x, y) without touching a solid? */
  function blockedAt(x, y, r) {
    if (x < 24 + r || x > FIELD.width - 24 - r || y < 24 + r || y > FIELD.height - 24 - r) {
      // The exit gap in the bottom wall is open: standing in the doorway is allowed.
      if (!(y > FIELD.height - 24 - r && x > EXIT.x && x < EXIT.x + EXIT.w)) return true;
    }
    const probe = { x, y, r };
    for (let i = 0; i < SOLIDS.length; i += 1) {
      if (i === 1 || i === 2) continue; // the bottom wall has the exit gap; handled above
      if (pushOutOfRect(probe, SOLIDS[i])) return true;
    }
    return false;
  }

  function moveCircle(circle, dx, dy) {
    circle.x += dx;
    circle.y += dy;
    for (let i = 0; i < SOLIDS.length; i += 1) {
      // The bottom wall is two pieces with the exit gap between them; solids already encode it.
      pushOutOfRect(circle, SOLIDS[i]);
    }
    circle.x = clamp(circle.x, 24 + circle.r, FIELD.width - 24 - circle.r);
    circle.y = clamp(circle.y, 24 + circle.r, FIELD.height - 24 - circle.r);
  }

  /**
   * One fixed step. `move` is {x, y} steering (-1..1 each), `sneaking` slows the thief and
   * shrinks the cones, `grab` pockets nearby loot, `smokeBomb` drops a smoke cloud.
   * With `harmless` set (the title screen's backdrop) the clock and the alarm do not run and
   * nothing can catch the thief.
   */
  function step(dt, move, sneaking, grab, smokeBomb, harmless) {
    let events = 0;
    state.elapsed += dt;
    player.sneaking = sneaking;

    // Smoke cloud ticks down whether or not the heist is live.
    if (smoke.active) {
      smoke.t -= dt;
      if (smoke.t <= 0) smoke.active = false;
    }
    for (let i = popups.length - 1; i >= 0; i -= 1) {
      popups[i].t -= dt;
      if (popups[i].t <= 0) popups.splice(i, 1);
    }

    // Cameras sweep back and forth, guards walk their beat.
    for (let i = 0; i < cameras.length; i += 1) {
      const camera = cameras[i];
      camera.angle = camera.base + Math.sin(state.elapsed * CAMERA.sweep + camera.phase) * 0.85;
    }

    const speed = sneaking ? PLAYER.sneakSpeed : PLAYER.speed;
    const length = Math.hypot(move.x, move.y);
    if (length > 0) {
      const nx = move.x / length;
      const ny = move.y / length;
      moveCircle(player, nx * speed * dt, ny * speed * dt);
      player.facing = Math.atan2(ny, nx);
    }

    if (smokeBomb && state.smokes > 0 && !smoke.active && state.status === 'playing') {
      smoke.active = true;
      smoke.x = player.x;
      smoke.y = player.y;
      smoke.t = SMOKE.seconds;
      state.smokes -= 1;
      events |= EVENT_SMOKE;
    }

    if (grab && state.status === 'playing') {
      let best = null;
      let bestDist = PLAYER.grabRange;
      for (const item of loot) {
        if (item.taken) continue;
        const dist = distance(player.x, player.y, item.x, item.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = item;
        }
      }
      if (best !== null) {
        best.taken = true;
        state.score += best.value;
        popups.push({ x: best.x, y: best.y - 18, text: `+$${best.value}`, t: 1.4 });
        if (popups.length > 8) popups.shift();
        events |= EVENT_PICKUP;
      }
    }

    // Guards: patrol, or hunt the last seen spot once the alarm is hot.
    const hunting = state.heat >= HEAT.huntAt;
    for (let i = 0; i < guards.length; i += 1) {
      const guard = guards[i];
      guard.hunting = hunting;
      let tx;
      let ty;
      if (hunting && state.spotted) {
        tx = state.spottedX;
        ty = state.spottedY;
      } else {
        const waypoint = guard.waypoints[guard.target];
        tx = waypoint[0];
        ty = waypoint[1];
      }
      const dx = tx - guard.x;
      const dy = ty - guard.y;
      const dist = Math.hypot(dx, dy);
      const guardSpeed = hunting ? GUARD.huntSpeed : GUARD.patrolSpeed;
      if (dist > 2) {
        const stepX = (dx / dist) * guardSpeed * dt;
        const stepY = (dy / dist) * guardSpeed * dt;
        const probe = { x: guard.x + stepX, y: guard.y + stepY, r: 14 };
        let blocked = false;
        for (let j = 0; j < SOLIDS.length; j += 1) {
          if (pushOutOfRect(probe, SOLIDS[j])) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          guard.x = probe.x;
          guard.y = probe.y;
          guard.facing = Math.atan2(dy, dx);
        }
      }
      if (!hunting && dist <= 4) guard.target = (guard.target + 1) % guard.waypoints.length;
    }

    if (harmless || state.status !== 'playing') {
      state.spotted = false;
      return events;
    }

    // The clock.
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      state.status = 'timeout';
      return events | EVENT_TIMEOUT;
    }

    // Who can see the thief?
    const wasSpotted = state.spotted;
    const rangeScale = sneaking ? HEAT.sneakRange : 1;
    const gainScale = sneaking ? HEAT.sneakGain : 1;
    let seen = false;
    let gain = 0;
    if (!(smoke.active && distance(player.x, player.y, smoke.x, smoke.y) < SMOKE.radius)) {
      for (let i = 0; i < guards.length; i += 1) {
        const guard = guards[i];
        const dist = distance(player.x, player.y, guard.x, guard.y);
        if (dist > GUARD.sightRange * rangeScale) continue;
        if (Math.abs(angleDelta(guard.facing, Math.atan2(player.y - guard.y, player.x - guard.x))) > GUARD.halfAngle) continue;
        if (!lineClear(guard.x, guard.y, player.x, player.y)) continue;
        seen = true;
        gain = Math.max(gain, HEAT.guardRate);
        state.spottedX = player.x;
        state.spottedY = player.y;
        break;
      }
      if (!seen) {
        for (let i = 0; i < cameras.length; i += 1) {
          const camera = cameras[i];
          const dist = distance(player.x, player.y, camera.x, camera.y);
          if (dist > CAMERA.sightRange * rangeScale) continue;
          if (Math.abs(angleDelta(camera.angle, Math.atan2(player.y - camera.y, player.x - camera.x))) > CAMERA.halfAngle) continue;
          if (!lineClear(camera.x, camera.y, player.x, player.y)) continue;
          seen = true;
          gain = Math.max(gain, HEAT.cameraRate);
          state.spottedX = player.x;
          state.spottedY = player.y;
          break;
        }
      }
    }
    state.spotted = seen;
    if (seen) {
      state.heat = Math.min(HEAT.max, state.heat + gain * gainScale * dt);
      if (!wasSpotted) events |= EVENT_SPOTTED;
    } else {
      state.heat = Math.max(0, state.heat - HEAT.decay * dt);
    }

    // A guard close enough to grab you ends the night.
    for (let i = 0; i < guards.length; i += 1) {
      if (distance(player.x, player.y, guards[i].x, guards[i].y) < PLAYER.touchCaught) {
        state.status = 'caught';
        state.heat = HEAT.max;
        return events | EVENT_CAUGHT;
      }
    }
    if (state.heat >= HEAT.max) {
      state.status = 'caught';
      return events | EVENT_CAUGHT;
    }

    // The exit door: step into the gap in the bottom wall and the night is yours.
    if (player.y + player.r >= FIELD.height - 24 && player.x > EXIT.x && player.x < EXIT.x + EXIT.w) {
      state.status = 'escaped';
      state.escaped = true;
      return events | EVENT_ESCAPED;
    }
    return events;
  }

  reset();
  return { state, reset, step, seenFrom, blockedAt };
}
