import { h } from '../dom.js';
import { card, button, banner, bigReading, levelBar, progressBar, kv, field, selectRow, stepList } from '../components.js';
import { sensorGate, live, capture } from '../live.js';
import { engine } from '../../sensors/orientation.js';
import { store } from '../../core/store.js';
import {
  azimuthOf,
  elevationOf,
  wrapDeg,
  wheelLabel,
  fmt,
  toeFromTape,
  toeDegToMm,
  inchToMm,
} from '../../math/align.js';
import { toeAzimuths, camberValues } from '../../core/compute.js';
import { buzz, chimeOk, chimeBad, speak, sayAngle } from '../../core/feedback.js';

const PLANS = {
  full: { label: 'All four wheels', order: ['FL', 'RL', 'RR', 'FR', 'FL'] },
  front: { label: 'Front axle only', order: ['FL', 'FR', 'FL'] },
  rear: { label: 'Rear axle only', order: ['RL', 'RR', 'RL'] },
};

export function toeScreen(ctx) {
  const session = store.session;
  const vehicle = store.vehicle;
  const settings = store.state.settings;
  session.toe.plan ||= 'full';
  let busy = false;
  let armed = true;

  const node = h('div.screen');
  const gate = sensorGate(() => ctx.refresh());
  if (gate) node.appendChild(gate);

  const readingEl = h('div.reading-host', bigReading('—', '°', 'heading — start the sensors'));
  const levelHost = h('div.level-host');
  const hintEl = h('p.hint');
  const progressHost = h('div.progress-host');
  const stepHost = h('div.stack');
  const resultHost = h('div.stack');

  const plan = () => PLANS[session.toe.plan] || PLANS.full;
  const captures = () => session.toe.captures || (session.toe.captures = []);
  const stepIndex = () => Math.min(captures().length, plan().order.length - 1);
  const target = () => plan().order[stepIndex()];
  const isClosing = () => captures().length === plan().order.length - 1;
  const finished = () => captures().length >= plan().order.length;

  const captureBtn = button('Capture', { kind: 'primary', onclick: () => doCapture() });

  function paintSteps() {
    const list = plan().order;
    const done = captures();
    stepHost.replaceChildren(
      h(
        'ol.walk',
        ...list.map((w, i) =>
          h(
            'li.walk-step',
            {
              class: [i < done.length ? 'done' : '', i === done.length ? 'current' : ''].filter(Boolean).join(' ') || null,
            },
            h('span.walk-n', i + 1),
            h('span.walk-w', i === list.length - 1 ? `${wheelLabel(w)} again — closes the loop` : wheelLabel(w)),
            i < done.length ? h('span.walk-v', fmt(done[i].azRaw, 2)) : null,
          ),
        ),
      ),
      h(
        'div.row',
        button('Undo last', {
          kind: 'ghost',
          disabled: !done.length,
          onclick: () => {
            captures().pop();
            store.save();
            paintSteps();
            paintResult();
          },
        }),
        button('Restart walk', {
          kind: 'ghost',
          disabled: !done.length,
          onclick: () => {
            session.toe.captures = [];
            store.save();
            paintSteps();
            paintResult();
          },
        }),
      ),
    );
    captureBtn.querySelector('.btn-label').textContent = finished()
      ? 'Walk complete'
      : `Capture ${wheelLabel(target())}${isClosing() ? ' (close the loop)' : ''}`;
    captureBtn.disabled = finished();
  }

  function paintResult() {
    const cam = camberValues(session).value;
    const { azimuth, drift } = toeAzimuths(session, cam);
    const kids = [];

    if (drift) {
      const bad = Math.abs(drift.residual) > 0.6;
      kids.push(
        kv('Drift over the walk', `${drift.residual >= 0 ? '+' : '−'}${Math.abs(drift.residual).toFixed(2)}° in ${drift.spanSec.toFixed(0)}s`),
        kv('Drift rate', `${drift.rateDegPerMin.toFixed(2)}°/min`),
      );
      kids.push(
        banner(
          bad ? 'warn' : 'good',
          bad
            ? 'That is a lot of drift. It has been spread out over the captures, but walk faster or re-do the loop for a tighter result.'
            : 'Drift was small and has been removed from every capture.',
        ),
      );
    } else if (captures().length) {
      kids.push(banner('info', 'Finish the walk back at the first wheel and the app will cancel the gyro drift for you.'));
    }

    const fr = Number.isFinite(azimuth.FL) && Number.isFinite(azimuth.FR) ? wrapDeg(azimuth.FR - azimuth.FL) : NaN;
    const rr = Number.isFinite(azimuth.RL) && Number.isFinite(azimuth.RR) ? wrapDeg(azimuth.RR - azimuth.RL) : NaN;
    const dia = inchToMm(vehicle?.rimDiameterIn || 17);
    kids.push(
      h(
        'div.kvs',
        kv('Front total toe', fmt(fr)),
        kv('Front in mm', Number.isFinite(fr) ? `${toeDegToMm(fr, dia).toFixed(1)} mm` : '--'),
        kv('Rear total toe', fmt(rr)),
        kv('Rear in mm', Number.isFinite(rr) ? `${toeDegToMm(rr, dia).toFixed(1)} mm` : '--'),
      ),
    );
    if (Number.isFinite(fr) && Number.isFinite(rr)) {
      kids.push(button('See individual toe & thrust line', { kind: 'primary', onclick: () => ctx.go('report') }));
    }
    resultHost.replaceChildren(...kids);
  }

  async function doCapture() {
    if (busy || finished()) return;
    busy = true;
    armed = false;
    captureBtn.disabled = true;
    if (!captures().length) engine.zeroHeading([0, 1, 0]);

    const res = await capture({}, (p) => {
      progressHost.replaceChildren(
        p.phase === 'waiting' ? h('p.hint.warn', 'Hold the bar against the rim and keep still…') : progressBar(p.progress),
      );
    });
    progressHost.replaceChildren();
    busy = false;
    captureBtn.disabled = false;

    if (!res.ok || res.wobble > 0.5) {
      chimeBad();
      progressHost.replaceChildren(h('p.hint.warn', 'Too much movement for a toe reading. Press the bar onto the rim and try again.'));
      return;
    }
    const az = azimuthOf(res.top);
    if (!Number.isFinite(az)) {
      chimeBad();
      progressHost.replaceChildren(h('p.hint.warn', 'The phone is nearly vertical — lay it flat along the bar.'));
      return;
    }
    const w = target();
    captures().push({
      wheel: w,
      t: Date.now(),
      azRaw: az,
      barElevation: elevationOf(res.top),
      wobble: res.wobble,
    });
    store.save();
    buzz([20, 40, 20]);
    chimeOk();
    paintSteps();
    paintResult();
    if (finished()) {
      const cam = camberValues(session).value;
      const { azimuth } = toeAzimuths(session, cam);
      if (Number.isFinite(azimuth.FL) && Number.isFinite(azimuth.FR)) {
        sayAngle('Front total toe', wrapDeg(azimuth.FR - azimuth.FL));
      } else if (Number.isFinite(azimuth.RL) && Number.isFinite(azimuth.RR)) {
        sayAngle('Rear total toe', wrapDeg(azimuth.RR - azimuth.RL));
      }
    } else {
      speak(`Now ${wheelLabel(target())}`);
    }
  }

  /* -------------------------------------------------------------- live */

  live(ctx, (frame) => {
    const top = engine.topAxis();
    const az = azimuthOf(top);
    const elev = elevationOf(top);
    const ref = captures()[0]?.azRaw;
    const delta = Number.isFinite(ref) && Number.isFinite(az) ? wrapDeg(az - ref) : NaN;
    readingEl.replaceChildren(
      bigReading(
        Number.isFinite(az) ? (Number.isFinite(delta) ? fmt(delta, 2, '') : az.toFixed(2)) : '—',
        '°',
        Number.isFinite(delta) ? 'heading vs the first wheel' : 'heading — capture wheel 1 to set the zero',
      ),
    );
    levelHost.replaceChildren(levelBar(elev, 8, 1.5));
    const tilted = Math.abs(elev) > 4;
    hintEl.textContent = tilted
      ? `Bar is ${Math.abs(elev).toFixed(1)}° off level — it still works, the tilt is corrected using this wheel's camber, but level is better.`
      : 'Bar level, pressed on the rim lip front and rear, phone top edge pointing at the front of the car.';
    hintEl.className = tilted ? 'hint warn' : 'hint';

    if (settings.autoCapture && !busy && !finished()) {
      if (!armed && frame.rateMag > 25) armed = true;
      if (armed && frame.still && frame.stillMs > 800) doCapture();
    }
  });

  /* -------------------------------------------------------------- tape */

  const tapeHost = h('div.stack');
  function paintTape() {
    const t = (session.toe.tape ||= { frontA: null, frontB: null, rearA: null, rearB: null, span: 430, front: null, rear: null });
    const calc = () => {
      t.front = Number.isFinite(t.frontA) && Number.isFinite(t.frontB) ? toeFromTape(t.frontA, t.frontB, t.span) : null;
      t.rear = Number.isFinite(t.rearA) && Number.isFinite(t.rearB) ? toeFromTape(t.rearA, t.rearB, t.span) : null;
      store.save();
      paintTape();
    };
    tapeHost.replaceChildren(
      h('p.muted', 'No straight-edge? Measure the gap between the rims at the front of the wheels and at the back, at hub height, and let the app do the trigonometry.'),
      field({ label: 'Span between the two measuring points', value: t.span, suffix: 'mm', step: '1', onchange: (v) => { t.span = v; calc(); }, hint: 'Usually the rim diameter — 17" = 432 mm' }),
      h('div.grid2',
        field({ label: 'Front axle — front gap', value: t.frontA, suffix: 'mm', step: '0.5', onchange: (v) => { t.frontA = v; calc(); } }),
        field({ label: 'Front axle — rear gap', value: t.frontB, suffix: 'mm', step: '0.5', onchange: (v) => { t.frontB = v; calc(); } }),
        field({ label: 'Rear axle — front gap', value: t.rearA, suffix: 'mm', step: '0.5', onchange: (v) => { t.rearA = v; calc(); } }),
        field({ label: 'Rear axle — rear gap', value: t.rearB, suffix: 'mm', step: '0.5', onchange: (v) => { t.rearB = v; calc(); } }),
      ),
      h('div.kvs', kv('Front total toe', fmt(t.front)), kv('Rear total toe', fmt(t.rear))),
      banner('info', 'Tape values, when filled in, replace the gyro result for that axle in the report.'),
      button('Clear tape values', { kind: 'ghost', onclick: () => { session.toe.tape = null; store.save(); paintTape(); } }),
    );
  }

  /* ------------------------------------------------------------- layout */

  node.appendChild(
    card(
      null,
      readingEl,
      levelHost,
      hintEl,
      progressHost,
      captureBtn,
    ),
  );
  node.appendChild(
    card(
      'The walk',
      selectRow(
        'Wheels to measure',
        session.toe.plan,
        Object.entries(PLANS).map(([value, p]) => ({ value, label: p.label })),
        (v) => {
          session.toe.plan = v;
          session.toe.captures = [];
          store.save();
          ctx.refresh();
        },
      ),
      stepHost,
    ),
  );
  node.appendChild(card('Result', resultHost));
  node.appendChild(
    card(
      'Before you start',
      stepList([
        'Roll the car straight back and then forward a couple of metres so the suspension settles.',
        'Steering wheel centred and left alone for the whole walk.',
        'Clamp or tape the phone to the straight-edge and do not move it on the bar until the walk is finished — a fixed mounting error cancels out, a changed one does not.',
        'Same spot on each rim: bar on the rim lip at the front and back of the wheel, at hub height.',
        'Walk the loop briskly. Every extra minute is extra gyro drift.',
      ]),
    ),
  );
  node.appendChild(card('Tape-measure mode', tapeHost));

  paintSteps();
  paintResult();
  paintTape();
  return node;
}
