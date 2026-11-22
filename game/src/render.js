// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. The gallery reads at a glance: gold frames are loot, yellow wedges are guard sight,
// blue wedges are cameras, the green door at the bottom is the way out, and the red bar at
// the top is the alarm. Text that holds a number is rebuilt only when the number changes.
import { CAMERA, EXIT, FIELD, FONT, GUARD, HEAT, PALETTE, PLINTHS, SMOKE, TIME_LIMIT, WALLS } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_ESCAPED = 'escaped';

const PANEL = { width: 640, top: 150, line: 32, bottom: 76 };
const TWO_PI = Math.PI * 2;

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function heatColor(heat) {
  if (heat < 40) return PALETTE.heatCalm;
  if (heat < 70) return PALETTE.heatWarm;
  return PALETTE.heatHot;
}

function heatWord(heat) {
  if (heat < 40) return 'CALM';
  if (heat < 70) return 'SUSPICIOUS';
  return 'HUNTED';
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const takeLabel = cachedLabel('$');
  const bestLabel = cachedLabel('Best take $');
  const timeLabel = cachedLabel('');
  const smokeLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function wedge(x, y, facing, range, halfAngle, color) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(x, y);
    context.arc(x, y, range, facing - halfAngle, facing + halfAngle);
    context.closePath();
    context.fill();
  }

  function drawFloor() {
    context.fillStyle = PALETTE.floor;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Checkerboard floor tiles, faint enough to read as a gallery floor.
    context.fillStyle = PALETTE.floorAlt;
    for (let ty = 0; ty < 9; ty += 1) {
      for (let tx = 0; tx < 16; tx += 1) {
        if ((tx + ty) % 2 === 0) context.fillRect(tx * 80, ty * 80, 80, 80);
      }
    }
    // The red carpet runner from the door to the upper gallery.
    context.fillStyle = PALETTE.carpet;
    context.fillRect(600, 220, 80, 476);
    context.fillStyle = PALETTE.wallTop;
    context.fillRect(600, 220, 80, 4);
  }

  function drawWalls() {
    for (const wall of WALLS) {
      context.fillStyle = PALETTE.wall;
      context.fillRect(wall.x, wall.y, wall.w, wall.h);
      context.fillStyle = PALETTE.wallTop;
      context.fillRect(wall.x, wall.y, wall.w, 4);
    }
    // The exit door: a green-lit gap in the bottom wall.
    context.fillStyle = PALETTE.exit;
    context.fillRect(EXIT.x, EXIT.y, EXIT.w, EXIT.h);
    context.fillStyle = '#0c0a12';
    context.font = `bold 15px ${FONT}`;
    context.textAlign = 'center';
    context.fillText('EXIT', EXIT.x + EXIT.w / 2, EXIT.y + 17);
  }

  function drawPlinths() {
    for (const plinth of PLINTHS) {
      context.fillStyle = PALETTE.plinth;
      context.fillRect(plinth.x, plinth.y, plinth.w, plinth.h);
      context.fillStyle = PALETTE.plinthTop;
      context.fillRect(plinth.x, plinth.y, plinth.w, 8);
      context.fillRect(plinth.x, plinth.y, 8, plinth.h);
    }
  }

  function drawLoot(state) {
    context.textBaseline = 'alphabetic';
    for (const item of state.loot) {
      if (item.taken) continue;
      if (item.kind === 'painting') {
        context.fillStyle = PALETTE.frame;
        context.fillRect(item.x - 42, item.y - 26, 84, 52);
        context.fillStyle = PALETTE.painting;
        context.fillRect(item.x - 36, item.y - 20, 72, 40);
        context.fillStyle = '#e8d27a';
        context.beginPath();
        context.arc(item.x - 12, item.y - 6, 9, 0, TWO_PI);
        context.fill();
        context.fillStyle = '#3d2b5c';
        context.fillRect(item.x - 36, item.y + 8, 72, 12);
        text(`$${item.value}`, item.x, item.y + 46, 15, PALETTE.frame, 'center');
      } else if (item.kind === 'gem') {
        context.fillStyle = PALETTE.frame;
        context.fillRect(item.x - 22, item.y - 22, 44, 44);
        context.fillStyle = PALETTE.gem;
        context.beginPath();
        context.moveTo(item.x, item.y - 16);
        context.lineTo(item.x + 14, item.y);
        context.lineTo(item.x, item.y + 16);
        context.lineTo(item.x - 14, item.y);
        context.closePath();
        context.fill();
        text(`$${item.value}`, item.x, item.y + 40, 15, PALETTE.gem, 'center');
      } else {
        context.fillStyle = PALETTE.coin;
        for (let i = 0; i < 3; i += 1) {
          context.beginPath();
          context.arc(item.x - 12 + i * 12, item.y - 4 + (i % 2) * 8, 8, 0, TWO_PI);
          context.fill();
        }
        text(`$${item.value}`, item.x, item.y + 32, 15, PALETTE.coin, 'center');
      }
    }
  }

  function drawCones(state) {
    for (const camera of state.cameras) {
      wedge(camera.x, camera.y, camera.angle, CAMERA.sightRange, CAMERA.halfAngle, state.spotted ? PALETTE.cameraConeHot : PALETTE.cameraCone);
    }
    for (const guard of state.guards) {
      wedge(guard.x, guard.y, guard.facing, GUARD.sightRange, GUARD.halfAngle, guard.hunting || state.spotted ? PALETTE.guardConeHot : PALETTE.guardCone);
    }
  }

  function drawActors(state) {
    for (const camera of state.cameras) {
      context.fillStyle = '#1c2436';
      context.fillRect(camera.x - 12, camera.y - 8, 24, 16);
      context.fillStyle = '#7db4ff';
      context.beginPath();
      context.arc(camera.x, camera.y, 5, 0, TWO_PI);
      context.fill();
    }
    for (const guard of state.guards) {
      context.fillStyle = PALETTE.guard;
      context.beginPath();
      context.arc(guard.x, guard.y, 15, 0, TWO_PI);
      context.fill();
      // The guard's torch: a short bright line where he is looking.
      context.strokeStyle = '#f6e27a';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(guard.x, guard.y);
      context.lineTo(guard.x + Math.cos(guard.facing) * 24, guard.y + Math.sin(guard.facing) * 24);
      context.stroke();
      if (guard.hunting || state.spotted) {
        text('!', guard.x, guard.y - 24, 26, PALETTE.heatHot, 'center');
      }
    }
    const player = state.player;
    // Blink while sneaking: the thief crouches low and is harder to see at a glance.
    context.fillStyle = PALETTE.playerCloak;
    context.beginPath();
    context.arc(player.x, player.y, player.r, 0, TWO_PI);
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(player.x, player.y, player.r - 5, 0, TWO_PI);
    context.fill();
    // The mask: two dark eyes in the direction of travel.
    context.fillStyle = '#14101c';
    const ex = Math.cos(player.facing);
    const ey = Math.sin(player.facing);
    const px = -ey;
    const py = ex;
    context.beginPath();
    context.arc(player.x + ex * 4 + px * 4, player.y + ey * 4 + py * 4, 2.4, 0, TWO_PI);
    context.arc(player.x + ex * 4 - px * 4, player.y + ey * 4 - py * 4, 2.4, 0, TWO_PI);
    context.fill();
    if (player.sneaking) {
      context.strokeStyle = PALETTE.muted;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(player.x, player.y, player.r + 5, 0, TWO_PI);
      context.stroke();
    }
  }

  function drawSmoke(state) {
    if (!state.smoke.active) return;
    context.fillStyle = PALETTE.smoke;
    context.beginPath();
    context.arc(state.smoke.x, state.smoke.y, SMOKE.radius, 0, TWO_PI);
    context.fill();
  }

  function drawPopups(state) {
    context.textBaseline = 'alphabetic';
    for (const popup of state.popups) {
      context.globalAlpha = Math.min(1, popup.t);
      text(popup.text, popup.x, popup.y - (1.4 - popup.t) * 24, 20, PALETTE.coin, 'center');
    }
    context.globalAlpha = 1;
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    text(takeLabel(state.score), 28, 16, 30, PALETTE.text, 'left');
    const minutes = Math.floor(state.timeLeft / 60);
    const seconds = Math.floor(state.timeLeft % 60);
    const timeText = `${minutes}:${String(seconds).padStart(2, '0')}`;
    text(timeLabel(timeText), FIELD.width / 2, 16, 30, state.timeLeft < 30 ? PALETTE.heatHot : PALETTE.text, 'center');
    // Alarm meter, top right: the bar, its stage word, and the smoke count under it.
    const barX = FIELD.width - 268;
    const barY = 20;
    const barW = 240;
    const barH = 20;
    context.fillStyle = '#0c0a12';
    context.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    context.fillStyle = heatColor(state.heat);
    context.fillRect(barX, barY, barW * (state.heat / HEAT.max), barH);
    text(`ALARM ${heatWord(state.heat)}`, barX + barW / 2, barY + 30, 16, heatColor(state.heat), 'center');
    text(smokeLabel(`Smoke x${state.smokes}  [Q]`), barX + barW / 2, barY + 52, 15, PALETTE.muted, 'center');
  }

  function drawField(state) {
    drawFloor();
    drawWalls();
    drawPlinths();
    drawLoot(state);
    drawCones(state);
    drawSmoke(state);
    drawActors(state);
    drawPopups(state);
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(12, 10, 18, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.frame;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 48, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 40, 24, PALETTE.coin, 'center');
  }

  const TITLE_LINES = [
    'One thief. One gallery. Three guards, two cameras,',
    'eight treasures worth $3,050 — and 150 seconds of night.',
    'WASD / arrows to move · Shift to sneak · E to pocket loot',
    'Q to drop smoke · P to pause · reach the green EXIT door.',
    '',
  ];
  const PAUSED_LINES = ['The guards keep their beat while you think.'];
  const ESCAPED_LINES = ['', '', ''];
  const CAUGHT_LINES = ['', ''];
  const TIMEOUT_LINES = ['', ''];

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawField(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[5] = bestLabel(best);
      drawPanel('VELVET VAULT', TITLE_LINES, 'Press Space or click to start the heist');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_ESCAPED) {
      ESCAPED_LINES[0] = `You slipped out with ${takeLabel(state.score)} of loot.`;
      ESCAPED_LINES[1] = `Time to spare: ${Math.ceil(state.timeLeft)}s · ${bestLabel(best)}`;
      ESCAPED_LINES[2] = state.score >= 3050 ? 'A clean sweep. The gallery will never know.' : 'The vault still holds more — next time, take it all.';
      drawPanel('CLEAN GETAWAY', ESCAPED_LINES, 'Press Space or click to run it again');
    } else if (screen === SCREEN_OVER) {
      if (state.status === 'timeout') {
        TIMEOUT_LINES[0] = `Dawn broke with ${takeLabel(state.score)} in your pockets.`;
        TIMEOUT_LINES[1] = bestLabel(best);
        drawPanel('THE SUN ROSE', TIMEOUT_LINES, 'Press Space or click to try again');
      } else {
        CAUGHT_LINES[0] = `Caught with ${takeLabel(state.score)} of loot.`;
        CAUGHT_LINES[1] = bestLabel(best);
        drawPanel('BUSTED', CAUGHT_LINES, 'Press Space or click to try again');
      }
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
