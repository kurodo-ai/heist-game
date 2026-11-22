// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between five screens: title, play, paused, caught (or dawn) and escaped.
//
// ?seed=N fixes the night. ?shot=start|play|alert|escape (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP, TIME_LIMIT } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_CAUGHT, EVENT_ESCAPED, EVENT_PICKUP, EVENT_SMOKE, EVENT_SPOTTED, EVENT_TIMEOUT,
  createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_GRAB, ACTION_PAUSE, ACTION_SMOKE, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_ESCAPED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best take then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each catch.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.setAlarm(false);
    announce(`Playing. ${TIME_LIMIT} seconds on the clock.`);
  }

  function endGame(nextScreen, message) {
    screen = nextScreen;
    audio.setAlarm(false);
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(message);
  }

  function handleEvents(events) {
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_SPOTTED) audio.spotted();
    if (events & EVENT_SMOKE) audio.smoke();
    if (events & EVENT_CAUGHT) {
      audio.caught();
      endGame(SCREEN_OVER, `Caught. Take $${world.state.score}. Best $${best}.`);
    } else if (events & EVENT_TIMEOUT) {
      audio.caught();
      endGame(SCREEN_OVER, `Dawn broke. Take $${world.state.score}. Best $${best}.`);
    } else if (events & EVENT_ESCAPED) {
      audio.escaped();
      endGame(SCREEN_ESCAPED, `Clean getaway. Take $${world.state.score}. Best $${best}.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    accumulator += elapsed;
    const steering = input.steering();
    const sneaking = input.sneaking();
    let actions = input.takeActions();
    if (actions & (ACTION_CONFIRM | ACTION_GRAB | ACTION_SMOKE)) audio.unlock();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_ESCAPED)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.setAlarm(false);
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    if (screen === SCREEN_PLAY) {
      let steps = 0;
      while (accumulator >= STEP && steps < 8) {
        const events = world.step(STEP, steering, sneaking, Boolean(actions & ACTION_GRAB), Boolean(actions & ACTION_SMOKE), false);
        actions &= ~(ACTION_GRAB | ACTION_SMOKE);
        accumulator -= STEP;
        steps += 1;
        handleEvents(events);
        if (screen !== SCREEN_PLAY) break;
      }
      if (steps === 8) accumulator = 0;
      audio.setAlarm(world.state.heat >= 60 && screen === SCREEN_PLAY);
    } else if (screen === SCREEN_TITLE) {
      // The title screen's backdrop is a live, harmless gallery: guards walk, nobody is caught.
      let steps = 0;
      while (accumulator >= STEP && steps < 8) {
        world.step(STEP, { x: 0, y: 0 }, false, false, false, true);
        accumulator -= STEP;
        steps += 1;
      }
      if (steps === 8) accumulator = 0;
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  requestAnimationFrame(frame);
}

if (shot !== null) runShot(shot);
else runGame();
