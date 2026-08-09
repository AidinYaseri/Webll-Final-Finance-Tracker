import { h } from '../dom.js';
import { card, button, carDiagram, banner, kv } from '../components.js';
import { sensorGate, sourceLabel, sensorState } from '../live.js';
import { store } from '../../core/store.js';
import { sessionReport } from '../../core/compute.js';
import { fmt } from '../../math/align.js';

const TILES = [
  ['camber', 'Camber', 'Phone flat on the rim. 4 wheels, 30 seconds.', '◨'],
  ['toe', 'Toe', 'One walk around the car with the straight-edge.', '⟋⟍'],
  ['caster', 'Caster & SAI', 'Steer left, steer right, done.', '↻'],
];

export function homeScreen(ctx) {
  const vehicle = store.vehicle;
  const session = store.session;
  const report = sessionReport(session, vehicle);
  const c = report.completeness;

  const node = h('div.screen');

  const gate = sensorGate(() => ctx.refresh());
  if (gate) node.appendChild(gate);

  node.appendChild(
    card(
      null,
      h(
        'div.session-head',
        h('div', h('h2.card-title', vehicle?.name || 'Vehicle'), h('p.muted', session?.label || '')),
        button('New session', { kind: 'ghost', onclick: () => { store.startSession(); ctx.refresh(); } }),
      ),
      carDiagram({
        toe: report.toe,
        camber: report.camber,
        thrust: report.toe.rearTotal != null ? report.thrustAngle : null,
        onPick: () => ctx.go('report'),
      }),
      h(
        'div.kvs',
        kv('Front total toe', fmt(report.toe.frontTotal), report.grades?.frontTotalToe),
        kv('Rear total toe', fmt(report.toe.rearTotal), report.grades?.rearTotalToe),
        kv('Cross camber', fmt(report.cross.frontCamber), report.grades?.crossCamber),
        kv('Caster L / R', `${fmt(report.caster.FL)} / ${fmt(report.caster.FR)}`),
      ),
      button('Open full report', { kind: 'primary', onclick: () => ctx.go('report') }),
    ),
  );

  node.appendChild(
    h(
      'div.tiles',
      ...TILES.map(([route, title, sub, glyph]) =>
        h(
          'button.tile',
          { type: 'button', onclick: () => ctx.go(route) },
          h('span.tile-glyph', glyph),
          h('span.tile-title', title),
          h('span.tile-sub', sub),
          h('span.tile-progress', progressText(route, c)),
        ),
      ),
    ),
  );

  node.appendChild(
    card(
      'Then',
      h(
        'div.stack',
        button('Adjust — how many turns on the tie rods', { onclick: () => ctx.go('adjust') }),
        button('Vehicle & target specs', { onclick: () => ctx.go('vehicle') }),
        button('Sensors, calibration & data', { onclick: () => ctx.go('setup') }),
        button('How this works / what you need', { onclick: () => ctx.go('help') }),
      ),
    ),
  );

  if (!c.anything) {
    node.appendChild(
      banner(
        'info',
        h('strong', 'Nothing measured yet. '),
        'Start with camber — it needs nothing but the phone. Toe wants a straight-edge; ',
        h('a', { href: '#/help' }, 'see what you need'),
        '.',
      ),
    );
  }

  node.appendChild(
    h('p.foot', `Sensor: ${sensorState.started ? sourceLabel(sensorState.source) : 'not started'} · all data stays on this phone`),
  );

  return node;
}

function progressText(route, c) {
  if (route === 'camber') return c.camber ? `${c.camber}/4 wheels` : 'not started';
  if (route === 'toe') return c.toe ? `${c.toe}/4 wheels` : 'not started';
  return c.caster ? `${c.caster}/2 wheels` : 'not started';
}
