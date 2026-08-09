/** Glue between the orientation engine and a screen. */

import { h } from './dom.js';
import { banner, button } from './components.js';
import { engine, sensorSupport, SOURCE } from '../sensors/orientation.js';
import { Averager } from '../sensors/orientation.js';
import { store } from '../core/store.js';
import { primeAudio } from '../core/feedback.js';

export const sensorState = {
  started: false,
  denied: false,
  source: SOURCE.NONE,
};

export async function enableSensors() {
  primeAudio();
  const support = sensorSupport();
  if (!support.secure) {
    sensorState.denied = true;
    return { ok: false, reason: 'insecure' };
  }
  if (support.needsPermission) {
    const res = await engine.requestPermission();
    if (res !== 'granted') {
      sensorState.denied = true;
      return { ok: false, reason: 'denied' };
    }
  }
  const source = await engine.start();
  sensorState.started = source !== SOURCE.NONE;
  sensorState.source = source;
  sensorState.denied = !sensorState.started;
  return { ok: sensorState.started, source };
}

/**
 * A banner that asks for motion access, explains a missing sensor, or
 * disappears once everything is live.
 */
export function sensorGate(onReady) {
  const support = sensorSupport();
  if (sensorState.started) return null;

  if (!support.secure) {
    return banner(
      'bad',
      h('strong', 'Needs a secure page. '),
      'Motion sensors only work over https:// or on localhost. Open the app from a secure address and reload.',
    );
  }
  if (!support.motion && !support.generic && !support.orientation) {
    return banner('bad', h('strong', 'No motion sensors found. '), 'This device cannot measure angles. You can still use tape-measure toe mode and read past results.');
  }
  return banner(
    'info',
    h('p', 'Motion access is off. The app reads the phone’s own gyroscope and accelerometer — nothing leaves the device.'),
    button('Enable motion sensors', {
      kind: 'primary',
      onclick: async () => {
        const res = await enableSensors();
        onReady?.(res);
      },
    }),
  );
}

/** Subscribe for the lifetime of a screen. */
export function live(ctx, fn) {
  const off = engine.subscribe(fn);
  ctx.onLeave(off);
  return off;
}

export function capture({ durationMs, requireStill = true } = {}, onProgress) {
  const ms = durationMs ?? store.state.settings.captureMs;
  return new Averager(engine, { durationMs: ms, requireStill }).run(onProgress);
}

export function sourceLabel(source) {
  return (
    {
      [SOURCE.GENERIC]: 'Fused gyro (platform)',
      [SOURCE.MOTION]: 'Gyro + accelerometer',
      [SOURCE.ORIENTATION]: 'Tilt only — no gyro',
      [SOURCE.NONE]: 'No sensors',
    }[source] || 'Unknown'
  );
}
