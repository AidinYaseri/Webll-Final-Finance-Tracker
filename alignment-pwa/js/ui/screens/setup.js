import { h } from '../dom.js';
import { card, button, banner, kv, field, toggleRow, progressBar, stepList } from '../components.js';
import { sensorGate, live, sourceLabel, sensorState, enableSensors } from '../live.js';
import { engine, sensorSupport, SOURCE } from '../../sensors/orientation.js';
import { store } from '../../core/store.js';
import { azimuthOf, elevationOf, wrapDeg, fmt } from '../../math/align.js';
import { download } from '../../core/compute.js';
import { chimeOk, speak } from '../../core/feedback.js';

export function setupScreen(ctx) {
  const settings = store.state.settings;
  const support = sensorSupport();
  const node = h('div.screen');

  const gate = sensorGate(() => ctx.refresh());
  if (gate) node.appendChild(gate);

  /* ------------------------------------------------------------- status */

  const statusHost = h('div.kvs');
  const driftHost = h('div.stack');

  node.appendChild(
    card(
      'Sensors',
      statusHost,
      h(
        'div.kvs',
        kv('Back end', sourceLabel(sensorState.source)),
        kv('Secure context', support.secure ? 'yes' : 'no — sensors blocked'),
        kv('Permission prompt', support.needsPermission ? 'required (iOS)' : 'not needed'),
      ),
      !sensorState.started
        ? button('Start sensors', { kind: 'primary', onclick: async () => { await enableSensors(); ctx.refresh(); } })
        : null,
      sensorState.source === SOURCE.ORIENTATION
        ? banner('warn', 'This device exposes tilt but no usable gyroscope. Camber and caster still work; toe needs the tape-measure mode.')
        : null,
      sensorState.source === SOURCE.GENERIC
        ? banner('good', 'Using the platform’s own gyro/accelerometer fusion — the best case. Heading is relative, so the car’s steel does not affect it.')
        : null,
    ),
  );

  /* -------------------------------------------------------- calibration */

  let calibrating = false;
  const calHost = h('div.stack');
  function paintCal() {
    calHost.replaceChildren(
      h('p.muted', 'Put the phone flat on something solid and leave it alone. The app watches the gyro at rest and learns its zero offset, which is what stops toe readings from creeping while you walk around the car.'),
      kv('Bias learned from', `${engine.calibration.samples} still samples`),
      kv('Current bias', `${engine.bias.map((b) => b.toFixed(3)).join(', ')} °/s`),
      button(calibrating ? 'Calibrating…' : 'Calibrate for 6 seconds', {
        kind: 'primary',
        disabled: calibrating,
        onclick: () => runCalibration(),
      }),
    );
  }

  function runCalibration() {
    calibrating = true;
    paintCal();
    const bar = h('div');
    calHost.appendChild(bar);
    const t0 = performance.now();
    const timer = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / 6000);
      bar.replaceChildren(progressBar(p), h('p.hint', engine.still ? 'Still — learning…' : 'Movement detected, keep the phone down.'));
      if (p >= 1) {
        clearInterval(timer);
        calibrating = false;
        chimeOk();
        speak('Calibrated');
        paintCal();
      }
    }, 100);
    ctx.onLeave(() => clearInterval(timer));
  }

  node.appendChild(card('Gyro calibration', calHost));

  /* --------------------------------------------------------- drift test */

  let drift = null;
  function paintDrift() {
    driftHost.replaceChildren(
      h('p.muted', 'How much heading does this phone invent per minute while sitting still? Under about 0.5°/min a four-wheel walk is comfortably accurate; above 3°/min, keep the walk short and always close the loop.'),
      drift?.running
        ? h(
            'div.stack',
            progressBar(drift.progress),
            h('p.hint', `${Math.max(0, 30 - Math.round(drift.elapsed))}s left — do not touch the phone`),
          )
        : null,
      drift && !drift.running
        ? h(
            'div.kvs',
            kv('Heading moved', `${drift.total.toFixed(2)}°`),
            kv('Drift rate', `${drift.rate.toFixed(2)}°/min`),
            kv('Verdict', drift.rate < 0.5 ? 'excellent' : drift.rate < 3 ? 'usable — close the loop' : 'poor — use tape mode for toe'),
          )
        : null,
      button(drift?.running ? 'Measuring…' : 'Run a 30-second drift test', {
        disabled: !sensorState.started || drift?.running,
        onclick: () => runDrift(),
      }),
    );
  }

  function runDrift() {
    const start = azimuthOf(engine.topAxis());
    if (!Number.isFinite(start)) {
      driftHost.appendChild(banner('warn', 'Lay the phone flat first — a phone on its edge has no meaningful heading.'));
      return;
    }
    drift = { running: true, progress: 0, elapsed: 0, total: 0, rate: 0 };
    const t0 = performance.now();
    const timer = setInterval(() => {
      const elapsed = (performance.now() - t0) / 1000;
      const now = azimuthOf(engine.topAxis());
      drift.elapsed = elapsed;
      drift.progress = Math.min(1, elapsed / 30);
      drift.total = wrapDeg(now - start);
      drift.rate = (drift.total / Math.max(1, elapsed)) * 60;
      if (elapsed >= 30) {
        clearInterval(timer);
        drift.running = false;
        chimeOk();
      }
      paintDrift();
    }, 500);
    ctx.onLeave(() => clearInterval(timer));
    paintDrift();
  }

  node.appendChild(card('Drift test', driftHost));

  /* ---------------------------------------------------------- settings */

  node.appendChild(
    card(
      'Behaviour',
      toggleRow('Auto capture when the phone is still', settings.autoCapture, (v) => store.setSetting('autoCapture', v)),
      toggleRow('Speak the readings', settings.voice, (v) => store.setSetting('voice', v), 'Useful when the phone is face-down on a rim'),
      toggleRow('Vibrate on capture', settings.haptics, (v) => store.setSetting('haptics', v)),
      toggleRow('Screen faces away from the car', settings.screenFacesOut, (v) => store.setSetting('screenFacesOut', v)),
      toggleRow('Two camber passes per wheel', settings.runoutPasses > 1, (v) => store.setSetting('runoutPasses', v ? 2 : 1)),
      field({
        label: 'Averaging window per capture',
        value: settings.captureMs,
        suffix: 'ms',
        step: '100',
        min: 400,
        max: 5000,
        onchange: (v) => store.setSetting('captureMs', Math.max(400, Math.min(5000, v || 1200))),
        hint: 'Longer averages are steadier but slower',
      }),
    ),
  );

  /* -------------------------------------------------------------- data */

  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json',
    style: { display: 'none' },
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        store.import(await file.text());
        ctx.refresh();
      } catch (err) {
        alert(`Import failed: ${err.message}`);
      }
    },
  });

  node.appendChild(
    card(
      'Your data',
      h('p.muted', 'Everything is stored in this browser only. Clearing site data or uninstalling the app removes it, so export a backup if a session matters.'),
      h(
        'div.stack',
        button('Export everything as JSON', { onclick: () => download(`trueline-backup-${Date.now()}.json`, store.export()) }),
        button('Import a backup', { onclick: () => fileInput.click() }),
        button('Delete everything', {
          kind: 'ghost',
          onclick: () => {
            if (confirm('Delete every vehicle, session and setting on this device?')) {
              store.reset();
              ctx.refresh();
            }
          },
        }),
        fileInput,
      ),
    ),
  );

  node.appendChild(
    card(
      'Install it',
      stepList([
        'iPhone: Share → Add to Home Screen. Motion access has to be granted again the first time you open it from the home screen.',
        'Android: the browser menu → Install app / Add to Home screen.',
        'Once installed it works with no signal at all — handy in a garage.',
      ]),
    ),
  );

  /* -------------------------------------------------------------- live */

  live(ctx, (frame) => {
    statusHost.replaceChildren(
      kv('State', frame.still ? 'still' : 'moving'),
      kv('Rotation rate', `${frame.rateMag.toFixed(2)} °/s`),
      kv('Tilt of the top edge', fmt(elevationOf(engine.topAxis()), 1)),
      kv('Heading', fmt(azimuthOf(engine.topAxis()), 1)),
    );
  });

  paintCal();
  paintDrift();
  return node;
}
