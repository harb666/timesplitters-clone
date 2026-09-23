// Unified input: touch (virtual joystick + look + buttons), keyboard/mouse,
// and optional gyro. Game code only reads the `input` object below.
import { settings } from './settings.js';

export const input = {
  moveX: 0, moveY: 0,       // joystick / WASD, -1..1 (moveY +1 = forward)
  lookX: 0, lookY: 0,       // accumulated look delta in "pixels" since last frame
  fire: false,              // held
  firePressed: false,       // true on the frame fire went down
  aim: false,               // aim down sights (toggle on touch, hold right mouse)
  sprint: false,            // Shift, or joystick pushed hard forward
  jump: false, reload: false, use: false, swap: false, inspect: false, // one-shot presses
  isTouch: false,
  pointerLocked: false,
};

let fireWas = false;
export function beginFrame() {
  input.firePressed = input.fire && !fireWas;
  fireWas = input.fire;
  if (input.isTouch && stickTouch !== null) input.sprint = input.moveY > 0.92 && Math.abs(input.moveX) < 0.45;
}
export function consumeFrame() {
  input.lookX = 0; input.lookY = 0;
  input.jump = false; input.reload = false; input.use = false; input.swap = false; input.inspect = false;
}

const keys = new Set();
let canvasEl = null;
let enabled = false;

export function setInputEnabled(v) {
  enabled = v;
  if (!v) { input.fire = false; input.moveX = 0; input.moveY = 0; input.sprint = false; keys.clear(); }
}

function updateKeyMove() {
  if (input.isTouch && stickTouch !== null) return;
  let x = 0, y = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  const len = Math.hypot(x, y) || 1;
  input.moveX = x / len; input.moveY = y / len;
}

// ---------------- touch ----------------
let stickTouch = null, stickCX = 0, stickCY = 0;
let lookTouch = null, lookLX = 0, lookLY = 0;
let fireTouch = null, fireLX = 0, fireLY = 0;
const STICK_R = 52;

function setupTouch(stickEl, knobEl) {
  const zoneStick = document.getElementById('stick-zone');
  const zoneLook = document.getElementById('look-zone');

  const placeStick = (x, y) => { stickEl.style.left = x + 'px'; stickEl.style.top = y + 'px'; };
  const resetStick = () => {
    stickEl.classList.remove('active'); knobEl.style.transform = '';
    stickEl.style.left = ''; stickEl.style.top = '';
    input.moveX = 0; input.moveY = 0;
  };

  zoneStick.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!enabled || stickTouch !== null) return;
    const t = e.changedTouches[0];
    stickTouch = t.identifier; stickCX = t.clientX; stickCY = t.clientY;
    placeStick(stickCX, stickCY); stickEl.classList.add('active');
  }, { passive: false });

  zoneLook.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!enabled || lookTouch !== null) return;
    const t = e.changedTouches[0];
    lookTouch = t.identifier; lookLX = t.clientX; lookLY = t.clientY;
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (!enabled) return;
    for (const t of e.changedTouches) {
      if (t.identifier === stickTouch) {
        let dx = t.clientX - stickCX, dy = t.clientY - stickCY;
        const d = Math.hypot(dx, dy);
        if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
        knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
        // small dead zone, then full speed near the edge
        const m = Math.min(1, Math.max(0, (d - 6) / (STICK_R - 6)));
        const a = Math.atan2(dy, dx);
        input.moveX = Math.cos(a) * m; input.moveY = -Math.sin(a) * m;
      } else if (t.identifier === lookTouch) {
        input.lookX += t.clientX - lookLX; input.lookY += t.clientY - lookLY;
        lookLX = t.clientX; lookLY = t.clientY;
      } else if (t.identifier === fireTouch) {
        // Dragging your thumb off the fire button still aims: very handy.
        input.lookX += t.clientX - fireLX; input.lookY += t.clientY - fireLY;
        fireLX = t.clientX; fireLY = t.clientY;
      }
    }
  }, { passive: true });

  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickTouch) { stickTouch = null; resetStick(); input.sprint = false; }
      if (t.identifier === lookTouch) lookTouch = null;
      if (t.identifier === fireTouch) { fireTouch = null; input.fire = false; document.getElementById('btn-fire').classList.remove('pressed'); }
    }
  };
  window.addEventListener('touchend', end);
  window.addEventListener('touchcancel', end);

  const bindBtn = (id, onDown) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!enabled) return;
      el.classList.add('pressed');
      onDown(e.changedTouches[0]);
    }, { passive: false });
    const up = () => { if (id !== 'btn-fire') el.classList.remove('pressed'); };
    el.addEventListener('touchend', up); el.addEventListener('touchcancel', up);
  };
  bindBtn('btn-fire', (t) => { fireTouch = t.identifier; fireLX = t.clientX; fireLY = t.clientY; input.fire = true; });
  bindBtn('btn-jump', () => { input.jump = true; });
  bindBtn('btn-reload', () => { input.reload = true; });
  bindBtn('btn-switch', () => { input.swap = true; });
  bindBtn('btn-use', () => { input.use = true; });
  bindBtn('btn-aim', () => { input.aim = !input.aim; document.getElementById('btn-aim').classList.toggle('on', input.aim); });
}

// ---------------- gyro ----------------
let gyroListening = false;
function onMotion(e) {
  if (!enabled || !settings.gyro || !e.rotationRate) return;
  const r = e.rotationRate;
  const angle = (screen.orientation && typeof screen.orientation.angle === 'number')
    ? screen.orientation.angle : (window.orientation || 0);
  let yaw, pitch;
  if (angle === 90) { yaw = r.beta; pitch = -r.gamma; }
  else if (angle === -90 || angle === 270) { yaw = -r.beta; pitch = r.gamma; }
  else { yaw = r.gamma; pitch = r.beta; }
  const dt = (e.interval && e.interval < 1 ? e.interval : (e.interval || 16) / 1000);
  // Convert deg/s into our pixel-ish look units (negative: yaw left = look left)
  const k = 7.5;
  input.lookX -= (yaw || 0) * dt * k;
  input.lookY -= (pitch || 0) * dt * k;
}

export async function requestGyro() {
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const res = await DeviceMotionEvent.requestPermission();
      if (res !== 'granted') return false;
    }
    if (!gyroListening) { window.addEventListener('devicemotion', onMotion); gyroListening = true; }
    return true;
  } catch (e) { return false; }
}

// ---------------- keyboard & mouse ----------------
function setupDesktop() {
  window.addEventListener('keydown', (e) => {
    if (!enabled) return;
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') input.jump = true;
    if (e.code === 'KeyR') input.reload = true;
    if (e.code === 'KeyE' || e.code === 'KeyF') input.use = true;
    if (e.code === 'KeyQ' || e.code.startsWith('Digit')) input.swap = true;
    if (e.code === 'KeyV') input.inspect = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = true;
    updateKeyMove();
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code.startsWith('Shift')) input.sprint = false; updateKeyMove(); });
  window.addEventListener('blur', () => { keys.clear(); updateKeyMove(); input.fire = false; });

  canvasEl.addEventListener('mousedown', (e) => {
    if (!enabled || input.isTouch) return;
    if (!input.pointerLocked) { canvasEl.requestPointerLock?.(); return; }
    if (e.button === 0) input.fire = true;
    if (e.button === 2) input.aim = true;
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; if (e.button === 2) input.aim = false; });
  canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => {
    if (!enabled || !input.pointerLocked) return;
    input.lookX += e.movementX; input.lookY += e.movementY;
  });
  document.addEventListener('pointerlockchange', () => {
    input.pointerLocked = document.pointerLockElement === canvasEl;
    if (!input.pointerLocked) input.fire = false;
  });
}

export function initInput(canvas) {
  canvasEl = canvas;
  input.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  setupDesktop();
  setupTouch(document.getElementById('stick'), document.getElementById('stick-knob'));
  // Block iOS pinch-zoom / double-tap zoom gestures.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) =>
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('dblclick', (e) => e.preventDefault());
}
