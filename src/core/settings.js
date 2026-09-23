// Player preferences. Saved in the browser when possible; the game still
// works if storage is blocked (private browsing etc.).
const KEY = 'firvale.settings.v1';

const DEFAULTS = {
  sensitivity: 1.0,
  aimAssist: true,
  autoFire: false,
  gyro: false,
  leftHanded: false,
  invertY: false,
  quality: 'medium',
  volume: 0.8,
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* storage unavailable */ }
  return { ...DEFAULTS };
}

export const settings = load();

const listeners = new Set();
export function onSettingsChange(fn) { listeners.add(fn); }

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  listeners.forEach((fn) => fn(settings));
}
