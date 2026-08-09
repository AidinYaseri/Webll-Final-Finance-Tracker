import { h } from '../dom.js';
import { card, button, banner, wheelPicker, bigReading, levelBar, progressBar, toggleRow, kv } from '../components.js';
import { sensorGate, live, capture } from '../live.js';
import { engine } from '../../sensors/orientation.js';
import { store } from '../../core/store.js';
import { camberFromNormal, elevationOf, levelCamber, wheelSide, wheelAxle, wheelLabel, fmt, WHEELS, AXLE } from '../../math/align.js';
import { camberValues } from '../../core/compute.js';
import { buzz, chimeOk, chimeBad, sayAngle } from '../../core/feedback.js';

export function camberScreen(ctx) {
  const settings = store.state.settings;
  const session = store.session;
  let active = ctx.params[0] && WHEELS.includes(ctx.params[0]) ? ctx.params[0] : nextWheel(session);
  let busy = false;
  let armed = true;

  const node = h('div.screen');
  const gate = sensorGate(() => ctx.refresh());
  if (gate) node.appendChild(gate);

  const readingEl = h('div.reading-host', bigReading('—', '°', 'camber — start the sensors'));
  const hintEl = h('p.hint');
  const barHost = h('div.level-host');
  const progressHost = h('div.progress-host');
  const capturedHost = h('div.captured');
  const pickerHost = h('div.picker-host');

  const captureBtn = button('Capture', {
    kind: 'primary',
    sub: 'hold the phone still',
    onclick: () => doCapture(),
  });

  function paintPicker() {
    const done = {};
    for (const w of WHEELS) done[w] = (session.camber?.[w]?.passes || []).length > 0;
    pickerHost.replaceChildren(
      wheelPicker(done, active, (w) => {
        active = w;
        paintPicker();
        paintCaptured();
      }),
    );
  }

  function paintCaptured() {
    const rec = session.camber?.[active];
    const passes = rec?.passes || [];
    const cam = camberValues(session);
    const kids = [
      h('h3.sub', `${wheelLabel(active)}`),
      passes.length
        ? h(
            'div.pass-list',
            ...passes.map((p, i) =>
              h(
                'div.pass',
                h('span.pass-n', `pass ${i + 1}`),
                h('span.pass-v', fmt(p.value)),
                h('span.pass-q', `±${p.wobble.toFixed(2)}°`),
                h('button.link', { type: 'button', onclick: () => removePass(i) }, 'remove'),
              ),
            ),
          )
        : h('p.muted', 'No capture yet.'),
    ];
    if (passes.length) {
      kids.push(kv('Levelled camber', fmt(cam.value[active])));
      if (passes.length > 1) kids.push(kv('Runout spread', `±${cam.runout[active].toFixed(2)}°`));
    }
    if (settings.runoutPasses > 1 && passes.length === 1) {
      kids.push(
        banner('info', 'Roll the car forward half a wheel turn, put the phone back on the same spot on the rim, and capture again. The average of the two cancels rim runout.'),
      );
    }
    capturedHost.replaceChildren(...kids);
    paintSummary();
  }

  const summaryHost = h('div.kvs');
  function paintSummary() {
    const cam = camberValues(session).value;
    summaryHost.replaceChildren(
      kv('FL', fmt(cam.FL)),
      kv('FR', fmt(cam.FR)),
      kv('Cross front', fmt(Number.isFinite(cam.FL) && Number.isFinite(cam.FR) ? cam.FL - cam.FR : NaN)),
      kv('RL', fmt(cam.RL)),
      kv('RR', fmt(cam.RR)),
      kv('Cross rear', fmt(Number.isFinite(cam.RL) && Number.isFinite(cam.RR) ? cam.RL - cam.RR : NaN)),
    );
  }

  function removePass(i) {
    const rec = session.camber[active];
    rec.passes.splice(i, 1);
    if (!rec.passes.length) delete session.camber[active];
    store.save();
    paintPicker();
    paintCaptured();
  }

  async function doCapture() {
    if (busy) return;
    busy = true;
    armed = false;
    captureBtn.disabled = true;
    const res = await capture({}, (p) => {
      progressHost.replaceChildren(
        p.phase === 'waiting'
          ? h('p.hint.warn', 'Waiting for the phone to be still…')
          : progressBar(p.progress),
      );
    });
    progressHost.replaceChildren();
    busy = false;
    captureBtn.disabled = false;
    if (!res.ok) {
      chimeBad();
      progressHost.replaceChildren(h('p.hint.warn', 'Could not get a steady reading. Try again.'));
      return;
    }
    if (res.wobble > 0.6) {
      chimeBad();
      progressHost.replaceChildren(
        h('p.hint.warn', `Too much movement (±${res.wobble.toFixed(2)}°). Press the phone firmly against the rim and try again.`),
      );
      return;
    }
    const value = camberFromNormal(res.normal, settings.screenFacesOut);
    const rec = (session.camber[active] ||= { passes: [] });
    if (rec.passes.length >= settings.runoutPasses) rec.passes.length = 0;
    rec.passes.push({ value, wobble: res.wobble, samples: res.samples, at: Date.now() });
    store.save();
    buzz([20, 40, 20]);
    chimeOk();
    const cross = wheelAxle(active) === AXLE.F ? session.floor.crossFront : session.floor.crossRear;
    sayAngle(`${wheelLabel(active)} camber`, levelCamber(value, wheelSide(active), cross));
    paintPicker();
    paintCaptured();
    if (rec.passes.length >= settings.runoutPasses) {
      const nxt = nextWheel(session, active);
      if (nxt) {
        active = nxt;
        paintPicker();
        paintCaptured();
      }
    }
  }

  /* ------------------------------------------------------------- floor */

  const floorHost = h('div.stack');
  function paintFloor() {
    const f = session.floor;
    floorHost.replaceChildren(
      h('p.muted', 'Optional. Lay the phone flat on the ground between the two wheels of an axle, top edge pointing at the driver’s right, then capture. The app subtracts the slope so a sloping driveway stops lying to you.'),
      h(
        'div.floor-row',
        button(`Front axle: ${fmt(f.crossFront)}`, { onclick: () => captureFloor('crossFront') }),
        button(`Rear axle: ${fmt(f.crossRear)}`, { onclick: () => captureFloor('crossRear') }),
      ),
      h(
        'div.floor-row',
        button(`Fore/aft slope: ${fmt(f.pitch)}`, { onclick: () => captureFloor('pitch'), sub: 'top edge towards the front' }),
        button('Clear', { kind: 'ghost', onclick: () => { session.floor = { crossFront: 0, crossRear: 0, pitch: 0 }; store.save(); paintFloor(); paintCaptured(); } }),
      ),
    );
  }

  async function captureFloor(key) {
    if (busy) return;
    busy = true;
    const res = await capture({ durationMs: 900 }, (p) => {
      progressHost.replaceChildren(
        p.phase === 'waiting' ? h('p.hint.warn', 'Put the phone down and let it settle…') : progressBar(p.progress),
      );
    });
    progressHost.replaceChildren();
    busy = false;
    if (!res.ok) return chimeBad();
    session.floor[key] = elevationOf(res.top);
    store.save();
    chimeOk();
    paintFloor();
    paintCaptured();
  }

  /* -------------------------------------------------------------- live */

  live(ctx, (frame) => {
    const n = engine.screenNormal();
    const raw = camberFromNormal(n, settings.screenFacesOut);
    const cross = wheelAxle(active) === AXLE.F ? session.floor.crossFront : session.floor.crossRear;
    const value = levelCamber(raw, wheelSide(active), cross);
    readingEl.replaceChildren(bigReading(fmt(value, 2, ''), '°', `${wheelLabel(active)} · ${frame.still ? 'still' : 'moving'}`));
    barHost.replaceChildren(levelBar(frame.rateMag, 12, 1.4));
    const flat = Math.abs(elevationOf(n)) > 35;
    hintEl.textContent = flat
      ? 'That looks like the phone is lying flat — stand it against the rim lip.'
      : 'Phone against the rim lip at 12 and 6 o’clock. Twisting it about that line does not change the reading.';
    hintEl.className = flat ? 'hint warn' : 'hint';

    if (settings.autoCapture && !busy) {
      if (!armed && frame.rateMag > 25) armed = true;
      if (armed && frame.still && frame.stillMs > 700 && !flat) doCapture();
    }
  });

  node.appendChild(pickerHost);
  node.appendChild(card(null, readingEl, barHost, hintEl, progressHost, captureBtn, capturedHost));
  node.appendChild(card('All four', summaryHost));
  node.appendChild(card('Ground slope', floorHost));
  node.appendChild(
    card(
      'Options',
      toggleRow('Screen faces away from the car', settings.screenFacesOut, (v) => {
        store.setSetting('screenFacesOut', v);
        ctx.refresh();
      }, 'Turn off if you rest the screen against the rim and read it blind'),
      toggleRow('Auto capture when still', settings.autoCapture, (v) => store.setSetting('autoCapture', v)),
      toggleRow('Two passes per wheel (runout cancelling)', settings.runoutPasses > 1, (v) => {
        store.setSetting('runoutPasses', v ? 2 : 1);
        ctx.refresh();
      }, 'Measure, roll the car half a turn, measure again'),
    ),
  );

  paintPicker();
  paintCaptured();
  paintFloor();
  return node;
}

function nextWheel(session, after) {
  const order = after ? [...WHEELS.slice(WHEELS.indexOf(after) + 1), ...WHEELS.slice(0, WHEELS.indexOf(after) + 1)] : WHEELS;
  const passes = store.state.settings.runoutPasses;
  return order.find((w) => (session.camber?.[w]?.passes || []).length < passes) || order[0];
}
