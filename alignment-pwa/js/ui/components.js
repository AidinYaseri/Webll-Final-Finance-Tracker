/** Shared widgets. Everything here returns a DOM node. */

import { h } from './dom.js';
import { fmt, gradeSpec, wheelLabel, WHEELS } from '../math/align.js';

export function card(title, ...children) {
  return h('section.card', title ? h('h2.card-title', title) : null, ...children);
}

export function row(...children) {
  return h('div.row', ...children);
}

export function banner(kind, ...content) {
  return h(`div.banner.banner-${kind}`, ...content);
}

export function statusChip(text, kind = 'idle') {
  return h(`span.chip.chip-${kind}`, text);
}

export function button(label, opts = {}) {
  const { kind = 'default', onclick, disabled, sub } = opts;
  return h(
    `button.btn.btn-${kind}`,
    { onclick, disabled, type: 'button' },
    h('span.btn-label', label),
    sub ? h('span.btn-sub', sub) : null,
  );
}

export function bigReading(value, unit = '°', sub = '') {
  return h(
    'div.reading',
    h('div.reading-value', value),
    h('div.reading-unit', unit),
    sub ? h('div.reading-sub', sub) : null,
  );
}

/**
 * Horizontal bubble: shows how far a live value is from its target.
 * `span` is the half-width of the scale in the same units as `error`.
 */
export function levelBar(error, span = 5, tol = 0.5) {
  const clamped = Math.max(-1, Math.min(1, (error || 0) / span));
  const pct = 50 + clamped * 50;
  const tolPct = Math.min(50, (tol / span) * 50);
  const ok = Math.abs(error) <= tol;
  const el = h(
    'div.level',
    h('div.level-track', {
      style: {
        background: `linear-gradient(90deg, var(--track) 0 ${50 - tolPct}%, var(--good-dim) ${
          50 - tolPct
        }% ${50 + tolPct}%, var(--track) ${50 + tolPct}% 100%)`,
      },
    }),
    h('div.level-center'),
    h('div.level-bubble', { class: ok ? 'good' : '', style: { left: `${pct}%` } }),
  );
  return el;
}

export function progressBar(progress) {
  return h('div.progress', h('div.progress-fill', { style: { width: `${Math.round(progress * 100)}%` } }));
}

export function field({ label, value, onchange, type = 'number', step = '0.01', suffix, hint, min, max }) {
  const input = h('input.input', {
    type,
    step,
    min,
    max,
    value: value ?? '',
    inputmode: type === 'number' ? 'decimal' : undefined,
    onchange: (e) => onchange(type === 'number' ? parseFloat(e.target.value) : e.target.value),
  });
  return h(
    'label.field',
    h('span.field-label', label),
    h('span.field-input', input, suffix ? h('span.field-suffix', suffix) : null),
    hint ? h('span.field-hint', hint) : null,
  );
}

export function toggleRow(label, checked, onchange, hint) {
  const input = h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked) });
  return h(
    'label.toggle',
    h('span.toggle-text', h('span.toggle-label', label), hint ? h('span.toggle-hint', hint) : null),
    h('span.toggle-switch', input, h('span.toggle-slider')),
  );
}

export function selectRow(label, value, options, onchange) {
  const sel = h(
    'select.input',
    { onchange: (e) => onchange(e.target.value) },
    ...options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)),
  );
  return h('label.field', h('span.field-label', label), h('span.field-input', sel));
}

/** Value against its tolerance band. */
export function specMeter(value, spec, digits = 2) {
  const grade = gradeSpec(value, spec);
  if (!spec || !Number.isFinite(value)) {
    return h('div.meter', h('div.meter-value', fmt(value, digits)));
  }
  const span = Math.max(Math.abs(spec.tol) * 3, Math.abs(value - spec.target) * 1.2, 0.2);
  const pos = 50 + Math.max(-1, Math.min(1, (value - spec.target) / span)) * 50;
  const tolPct = Math.min(50, (Math.abs(spec.tol) / span) * 50);
  return h(
    'div.meter',
    h(
      'div.meter-bar',
      h('div.meter-band', { style: { left: `${50 - tolPct}%`, width: `${tolPct * 2}%` } }),
      h('div.meter-target'),
      h(`div.meter-mark.grade-${grade}`, { style: { left: `${pos}%` } }),
    ),
    h('div.meter-foot', h(`span.meter-value.grade-${grade}`, fmt(value, digits)), h('span.meter-spec', `target ${fmt(spec.target, 2)} ±${Math.abs(spec.tol).toFixed(2)}`)),
  );
}

/* --------------------------------------------------------------- car view */

const TOE_EXAGGERATION = 14;

/**
 * Top view of the car, nose up, driver's left on the left.
 * @param {Object} o
 * @param {Object} o.toe      per-wheel individual toe, degrees (+ = toe-in)
 * @param {Object} o.camber   per-wheel camber, degrees
 * @param {number} o.thrust   thrust angle, degrees (+ = rear steers right)
 * @param {string} o.active   wheel key to highlight
 */
export function carDiagram({ toe = {}, camber = {}, thrust = null, active = null, onPick } = {}) {
  const W = 340;
  const H = 300;
  const CX = W / 2;
  const REAR_Y = 214;
  const pos = {
    FL: [94, 100],
    FR: [246, 100],
    RL: [94, REAR_Y],
    RR: [246, REAR_Y],
  };
  const svg = h('svg.car', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Alignment overview' });

  svg.appendChild(
    h('path.car-body', {
      d: 'M78 44 q52 -20 104 0 l10 62 v128 q0 44 -18 62 q-44 12 -88 0 q-18 -18 -18 -62 v-128 z',
      transform: 'translate(40 0) scale(1 0.85)',
    }),
  );
  svg.appendChild(h('line.car-axis', { x1: CX, y1: 22, x2: CX, y2: H - 14 }));

  if (Number.isFinite(thrust)) {
    const a = Math.max(-12, Math.min(12, -thrust * TOE_EXAGGERATION));
    svg.appendChild(
      h('line.thrust', {
        x1: CX,
        y1: REAR_Y,
        x2: CX,
        y2: 52,
        transform: `rotate(${a} ${CX} ${REAR_Y})`,
      }),
    );
  }

  for (const w of WHEELS) {
    const [x, y] = pos[w];
    const t = toe[w];
    const side = w[1];
    const rot = Number.isFinite(t)
      ? Math.max(-14, Math.min(14, (side === 'L' ? 1 : -1) * t * TOE_EXAGGERATION))
      : 0;
    const g = h('g.wheel-group', {
      class: active === w ? 'active' : null,
      transform: `rotate(${rot} ${x} ${y})`,
      onclick: onPick ? () => onPick(w) : null,
    });
    g.appendChild(h('rect.wheel', { x: x - 11, y: y - 26, width: 22, height: 52, rx: 6 }));
    svg.appendChild(g);

    const labelX = side === 'L' ? x - 17 : x + 17;
    const anchor = side === 'L' ? 'end' : 'start';
    svg.appendChild(
      h(
        'text.wheel-label',
        { x: labelX, y: y - 4, 'text-anchor': anchor },
        Number.isFinite(t) ? `${t >= 0 ? '+' : '−'}${Math.abs(t).toFixed(2)}°` : '—',
      ),
    );
    svg.appendChild(
      h(
        'text.wheel-sub',
        { x: labelX, y: y + 12, 'text-anchor': anchor },
        Number.isFinite(camber[w])
          ? `cam ${camber[w] >= 0 ? '+' : '−'}${Math.abs(camber[w]).toFixed(2)}°`
          : 'cam —',
      ),
    );
  }

  svg.appendChild(h('text.car-note', { x: CX, y: 16, 'text-anchor': 'middle' }, 'FRONT'));
  return h('div.car-wrap', svg, h('p.car-caption', `Toe shown ×${TOE_EXAGGERATION} for clarity`));
}

/* ------------------------------------------------------------ wheel picker */

export function wheelPicker(done = {}, active, onPick) {
  return h(
    'div.wheelpick',
    ...WHEELS.map((w) =>
      h(
        'button.wheelpick-btn',
        {
          type: 'button',
          class: [active === w ? 'active' : '', done[w] ? 'done' : ''].filter(Boolean).join(' ') || null,
          onclick: () => onPick(w),
        },
        h('span.wheelpick-key', w),
        h('span.wheelpick-name', wheelLabel(w).replace('Front ', 'F ').replace('Rear ', 'R ')),
        done[w] ? h('span.wheelpick-tick', '✓') : null,
      ),
    ),
  );
}

export function kv(label, value, grade) {
  return h('div.kv', h('span.kv-label', label), h(`span.kv-value${grade ? `.grade-${grade}` : ''}`, value));
}

export function stepList(steps) {
  return h('ol.steps', ...steps.map((s) => h('li', s)));
}
