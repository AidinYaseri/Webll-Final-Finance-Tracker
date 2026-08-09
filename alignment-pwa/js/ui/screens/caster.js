import { h } from '../dom.js';
import { card, button, banner, bigReading, levelBar, progressBar, kv, field, stepList } from '../components.js';
import { sensorGate, live, capture } from '../live.js';
import { engine } from '../../sensors/orientation.js';
import { store } from '../../core/store.js';
import {
  azimuthOf,
  elevationOf,
  camberFromNormal,
  wrapDeg,
  wheelLabel,
  fmt,
  ackermann,
} from '../../math/align.js';
import { casterSolutions } from '../../core/compute.js';
import { buzz, chimeOk, chimeBad, speak, sayAngle } from '../../core/feedback.js';

export function casterScreen(ctx) {
  const session = store.session;
  const settings = store.state.settings;
  let active = ctx.params[0] === 'FR' ? 'FR' : 'FL';
  let centerAz = null;
  let busy = false;
  let armed = true;
  let liveSteer = NaN;
  let liveCamber = NaN;

  const node = h('div.screen');
  const gate = sensorGate(() => ctx.refresh());
  if (gate) node.appendChild(gate);

  const readingEl = h('div.reading-host', bigReading('—', '°', 'camber — start the sensors'));
  const dialHost = h('div.dial-host');
  const hintEl = h('p.hint');
  const progressHost = h('div.progress-host');
  const pointHost = h('div.stack');
  const resultHost = h('div.stack');
  const ackHost = h('div.stack');

  const sideBtns = h(
    'div.segmented',
    ...['FL', 'FR'].map((w) =>
      h(
        'button.seg',
        {
          type: 'button',
          class: active === w ? 'active' : null,
          onclick: () => {
            active = w;
            centerAz = null;
            paintAll();
          },
        },
        wheelLabel(w),
      ),
    ),
  );

  const centerBtn = button('Set centre', { kind: 'primary', sub: 'wheels straight ahead', onclick: () => setCentre() });
  const pointBtn = button('Capture sweep point', { onclick: () => capturePoint() });

  const rec = () => (session.caster[active] ||= { camber0: null, points: [] });

  async function setCentre() {
    if (busy) return;
    busy = true;
    const res = await capture({}, (p) =>
      progressHost.replaceChildren(p.phase === 'waiting' ? h('p.hint.warn', 'Hold still…') : progressBar(p.progress)),
    );
    progressHost.replaceChildren();
    busy = false;
    if (!res.ok || res.wobble > 0.6) return chimeBad();
    const az = azimuthOf(res.normal);
    if (!Number.isFinite(az)) {
      chimeBad();
      progressHost.replaceChildren(h('p.hint.warn', 'Stand the phone against the rim first.'));
      return;
    }
    centerAz = az;
    const r = rec();
    r.camber0 = camberFromNormal(res.normal, settings.screenFacesOut);
    r.points = [];
    store.save();
    chimeOk();
    buzz(30);
    speak('Centre set. Now steer left.');
    paintAll();
  }

  async function capturePoint() {
    if (busy) return;
    if (centerAz == null) {
      progressHost.replaceChildren(h('p.hint.warn', 'Set the centre first.'));
      return;
    }
    busy = true;
    armed = false;
    const res = await capture({}, (p) =>
      progressHost.replaceChildren(p.phase === 'waiting' ? h('p.hint.warn', 'Hold the wheel steady…') : progressBar(p.progress)),
    );
    progressHost.replaceChildren();
    busy = false;
    if (!res.ok || res.wobble > 0.7) return chimeBad();
    const steer = wrapDeg(azimuthOf(res.normal) - centerAz);
    if (!Number.isFinite(steer) || Math.abs(steer) < 8) {
      chimeBad();
      progressHost.replaceChildren(h('p.hint.warn', 'Steer at least 8° away from centre — 20° is the sweet spot.'));
      return;
    }
    const camber = camberFromNormal(res.normal, settings.screenFacesOut);
    const r = rec();
    const near = r.points.findIndex((p) => Math.abs(p.steer - steer) < 4);
    const point = { steer, camber, at: Date.now() };
    if (near >= 0) r.points[near] = point;
    else r.points.push(point);
    r.points.sort((a, b) => a.steer - b.steer);
    store.save();
    chimeOk();
    buzz([20, 40, 20]);
    paintAll();
    const sol = casterSolutions(session)[active];
    if (sol) sayAngle(`${wheelLabel(active)} caster`, sol.caster);
    else speak(steer > 0 ? 'Got it. Now steer the other way.' : 'Got it. Now steer the other way.');
  }

  function paintPoints() {
    const r = rec();
    pointHost.replaceChildren(
      h('div.row', h('span.muted', centerAz == null ? 'Centre not set in this visit' : `Centre camber ${fmt(r.camber0)}`)),
      r.points.length
        ? h(
            'div.pass-list',
            ...r.points.map((p, i) =>
              h(
                'div.pass',
                h('span.pass-n', `${p.steer >= 0 ? 'left' : 'right'} ${Math.abs(p.steer).toFixed(1)}°`),
                h('span.pass-v', fmt(p.camber)),
                h('button.link', { type: 'button', onclick: () => { r.points.splice(i, 1); store.save(); paintAll(); } }, 'remove'),
              ),
            ),
          )
        : h('p.muted', 'No sweep points yet.'),
    );
  }

  function paintResult() {
    const sols = casterSolutions(session);
    const sol = sols[active];
    const kids = [];
    if (!sol) {
      kids.push(h('p.muted', 'Capture one point steering left and one steering right to get a result.'));
    } else {
      const sameSide = rec().points.every((p) => p.steer > 0) || rec().points.every((p) => p.steer < 0);
      kids.push(
        h(
          'div.kvs',
          kv('Caster', fmt(sol.caster)),
          kv('SAI', fmt(sol.sai)),
          kv('Included angle', fmt(sol.includedAngle)),
          kv('Fit error', `${sol.rms.toFixed(3)}°`),
        ),
      );
      if (sameSide) kids.push(banner('warn', 'All the sweep points are on one side of centre. Capture one the other way — caster and SAI cannot be separated reliably otherwise.'));
      if (sol.maxSweep < 15) kids.push(banner('warn', `Largest sweep is only ${sol.maxSweep.toFixed(0)}°. Small sweeps magnify noise; aim for 20° each way.`));
    }
    if (sols.FL && sols.FR) {
      kids.push(
        h(
          'div.kvs',
          kv('Caster L / R', `${fmt(sols.FL.caster)} / ${fmt(sols.FR.caster)}`),
          kv('Cross caster', fmt(sols.FL.caster - sols.FR.caster)),
          kv('Included angle L / R', `${fmt(sols.FL.includedAngle)} / ${fmt(sols.FR.includedAngle)}`),
          kv('Cross included angle', fmt(sols.FL.includedAngle - sols.FR.includedAngle)),
        ),
      );
      kids.push(banner('info', 'A big cross included angle with matching camber points at a bent knuckle or strut rather than an adjustment problem.'));
    }
    resultHost.replaceChildren(...kids);
  }

  /* ---------------------------------------------------------- ackermann */

  function paintAckermann() {
    const a = (session.ackermann ||= { zeroFL: null, zeroFR: null, lockFL: null, lockFR: null });
    const slot = (key, label) =>
      button(`${label}: ${Number.isFinite(a[key]) ? `${a[key].toFixed(1)}°` : 'empty'}`, {
        kind: 'ghost',
        onclick: async () => {
          if (busy) return;
          busy = true;
          const res = await capture({}, (p) =>
            progressHost.replaceChildren(p.phase === 'waiting' ? h('p.hint.warn', 'Hold still…') : progressBar(p.progress)),
          );
          progressHost.replaceChildren();
          busy = false;
          if (!res.ok) return chimeBad();
          const az = azimuthOf(res.normal);
          if (!Number.isFinite(az)) return chimeBad();
          a[key] = az;
          store.save();
          chimeOk();
          paintAckermann();
        },
      });
    const inner = Number.isFinite(a.zeroFL) && Number.isFinite(a.lockFL) ? wrapDeg(a.lockFL - a.zeroFL) : NaN;
    const outer = Number.isFinite(a.zeroFR) && Number.isFinite(a.lockFR) ? wrapDeg(a.lockFR - a.zeroFR) : NaN;
    ackHost.replaceChildren(
      h('p.muted', 'Keep the gyro running the whole time: capture both wheels straight ahead, steer to a lock without letting go, then capture both wheels again. The difference between the two steer angles is the Ackermann effect.'),
      h('div.grid2', slot('zeroFL', 'FL straight'), slot('zeroFR', 'FR straight'), slot('lockFL', 'FL at lock'), slot('lockFR', 'FR at lock')),
      h('div.kvs', kv('FL steer', Number.isFinite(inner) ? `${inner.toFixed(1)}°` : '--'), kv('FR steer', Number.isFinite(outer) ? `${outer.toFixed(1)}°` : '--'), kv('Ackermann difference', Number.isFinite(ackermann(inner, outer)) ? `${ackermann(inner, outer).toFixed(1)}°` : '--')),
      button('Clear', { kind: 'ghost', onclick: () => { session.ackermann = null; store.save(); paintAckermann(); } }),
    );
  }

  /* --------------------------------------------------------------- live */

  function dial(steer, targetDeg) {
    const size = 180;
    const cx = size / 2;
    const cy = size / 2;
    const r = 66;
    const ang = (deg) => (deg - 90) * (Math.PI / 180);
    const pt = (deg, rad) => [cx + Math.cos(ang(deg)) * rad, cy + Math.sin(ang(deg)) * rad];
    const svg = h('svg.dial', { viewBox: `0 0 ${size} ${size}` });
    svg.appendChild(h('circle.dial-ring', { cx, cy, r }));
    for (const t of [-targetDeg, targetDeg]) {
      const [x1, y1] = pt(-t, r - 10);
      const [x2, y2] = pt(-t, r + 10);
      svg.appendChild(h('line.dial-target', { x1, y1, x2, y2 }));
    }
    const [x1, y1] = pt(0, r - 10);
    const [x2, y2] = pt(0, r + 10);
    svg.appendChild(h('line.dial-zero', { x1, y1, x2, y2 }));
    if (Number.isFinite(steer)) {
      const clamped = Math.max(-60, Math.min(60, steer));
      const [nx, ny] = pt(-clamped, r);
      svg.appendChild(h('line.dial-needle', { x1: cx, y1: cy, x2: nx, y2: ny }));
      const near = Math.abs(Math.abs(steer) - targetDeg) < 2;
      svg.appendChild(h('circle.dial-hub', { cx, cy, r: 6, class: near ? 'near' : null }));
    }
    return svg;
  }

  live(ctx, (frame) => {
    const n = engine.screenNormal();
    liveCamber = camberFromNormal(n, settings.screenFacesOut);
    const az = azimuthOf(n);
    liveSteer = centerAz != null && Number.isFinite(az) ? wrapDeg(az - centerAz) : NaN;
    readingEl.replaceChildren(
      bigReading(
        Number.isFinite(liveSteer) ? fmt(liveSteer, 1, '') : fmt(liveCamber, 2, ''),
        '°',
        Number.isFinite(liveSteer) ? `steer angle · camber ${fmt(liveCamber)}` : 'camber — set the centre to start the sweep',
      ),
    );
    dialHost.replaceChildren(dial(liveSteer, settings.sweepTarget), levelBar(frame.rateMag, 12, 1.4));
    const flat = Math.abs(elevationOf(n)) > 35;
    hintEl.textContent = flat
      ? 'Stand the phone against the rim, same as for camber.'
      : centerAz == null
        ? 'Wheels dead ahead, phone on the rim, then set the centre.'
        : `Steer until the needle reaches a marker (${settings.sweepTarget}°), hold, and capture.`;
    hintEl.className = flat ? 'hint warn' : 'hint';

    if (settings.autoCapture && !busy && centerAz != null && !flat) {
      if (!armed && frame.rateMag > 25) armed = true;
      const onTarget = Number.isFinite(liveSteer) && Math.abs(Math.abs(liveSteer) - settings.sweepTarget) < 2.5;
      if (armed && onTarget && frame.still && frame.stillMs > 700) capturePoint();
    }
  });

  function paintAll() {
    sideBtns.querySelectorAll('.seg').forEach((b, i) => b.classList.toggle('active', ['FL', 'FR'][i] === active));
    centerBtn.querySelector('.btn-label').textContent = centerAz == null ? 'Set centre' : 'Re-set centre';
    pointBtn.disabled = centerAz == null;
    paintPoints();
    paintResult();
  }

  node.appendChild(card(null, sideBtns, readingEl, dialHost, hintEl, progressHost, h('div.row', centerBtn, pointBtn)));
  node.appendChild(card('Sweep points', pointHost));
  node.appendChild(card('Result', resultHost));
  node.appendChild(
    card(
      'How the sweep works',
      stepList([
        'Front wheels straight ahead, phone standing on the rim like a camber reading. Tap “Set centre”.',
        'Steer one way until the needle hits the marker. Hold still — it captures itself.',
        'Steer the other way to the other marker and hold still again.',
        'The app fits caster and steering axis inclination to the camber it saw at each angle, so the lock angles do not have to be exact or symmetric.',
      ]),
      field({
        label: 'Sweep target each way',
        value: settings.sweepTarget,
        suffix: '°',
        step: '1',
        min: 10,
        max: 30,
        onchange: (v) => store.setSetting('sweepTarget', Math.max(10, Math.min(30, v || 20))),
      }),
    ),
  );
  node.appendChild(card('Ackermann (optional)', ackHost));

  dialHost.replaceChildren(dial(NaN, settings.sweepTarget));
  paintAll();
  paintAckermann();
  return node;
}
