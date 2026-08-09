/** Hands-free feedback: you are crouched by a wheel and cannot see the screen. */

import { store } from './store.js';

let audioCtx = null;

function ctx() {
  if (!audioCtx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (C) audioCtx = new C();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/** Must be called from a user gesture once, so iOS lets us make noise later. */
export function primeAudio() {
  const c = ctx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  g.gain.value = 0.0001;
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.01);
}

export function beep(freq = 880, ms = 90, gain = 0.15) {
  const c = ctx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ms / 1000);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + ms / 1000 + 0.02);
}

export const chimeOk = () => {
  beep(880, 70);
  setTimeout(() => beep(1320, 110), 80);
};

export const chimeBad = () => {
  beep(320, 160, 0.18);
};

export function buzz(pattern = 20) {
  if (!store.state.settings.haptics) return;
  if (navigator.vibrate) navigator.vibrate(pattern);
}

export function speak(text) {
  if (!store.state.settings.voice) return;
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 1;
    speechSynthesis.speak(u);
  } catch (err) {
    /* speech is a nicety */
  }
}

/** Spoken form of an angle: "minus zero point four five degrees". */
export function sayAngle(prefix, value, unit = 'degrees') {
  if (!Number.isFinite(value)) return;
  const sign = value < 0 ? 'minus ' : '';
  speak(`${prefix} ${sign}${Math.abs(value).toFixed(2)} ${unit}`);
}

/* ------------------------------------------------------------- wake lock */

let wakeLock = null;
let wakeWanted = false;

export async function keepAwake(on) {
  wakeWanted = on;
  try {
    if (on) {
      if (!wakeLock && 'wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      }
    } else if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (err) {
    /* not fatal */
  }
}

document.addEventListener('visibilitychange', () => {
  if (wakeWanted && document.visibilityState === 'visible' && wakeLock === null) keepAwake(true);
});
