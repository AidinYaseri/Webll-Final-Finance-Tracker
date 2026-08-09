import { h } from '../dom.js';
import { card, button, banner, carDiagram, specMeter, kv, field } from '../components.js';
import { store } from '../../core/store.js';
import { sessionReport, reportToCsv, download } from '../../core/compute.js';
import { fmt, fmtPlain, WHEELS, wheelLabel, toeDegToMm, inchToMm } from '../../math/align.js';

export function reportScreen(ctx) {
  const vehicle = store.vehicle;
  const session = store.session;
  const report = sessionReport(session, vehicle);
  const specs = vehicle?.specs || {};
  const node = h('div.screen');

  node.appendChild(
    card(
      null,
      h(
        'div.session-head',
        h('div', h('h2.card-title', vehicle?.name || 'Vehicle'), h('p.muted', session?.label || '')),
        button('New session', { kind: 'ghost', onclick: () => { store.startSession(); ctx.refresh(); } }),
      ),
      carDiagram({ toe: report.toe, camber: report.camber, thrust: report.thrustAngle }),
    ),
  );

  /* --------------------------------------------------------------- toe */

  const dia = inchToMm(vehicle?.rimDiameterIn || 17);
  node.appendChild(
    card(
      'Toe',
      h('h3.sub', 'Front axle'),
      specMeter(report.toe.frontTotal, specs.frontTotalToe),
      h(
        'div.kvs',
        kv('Front left', fmt(report.toe.FL)),
        kv('Front right', fmt(report.toe.FR)),
        kv('Total in mm', Number.isFinite(report.toe.frontTotal) ? `${toeDegToMm(report.toe.frontTotal, dia).toFixed(1)} mm` : '--'),
        kv('Reference', report.toeReference === 'thrust' ? 'rear thrust line' : 'own axle'),
      ),
      h('h3.sub', 'Rear axle'),
      specMeter(report.toe.rearTotal, specs.rearTotalToe),
      h(
        'div.kvs',
        kv('Rear left', fmt(report.toe.RL)),
        kv('Rear right', fmt(report.toe.RR)),
        kv('Total in mm', Number.isFinite(report.toe.rearTotal) ? `${toeDegToMm(report.toe.rearTotal, dia).toFixed(1)} mm` : '--'),
      ),
      report.tapeUsed ? banner('info', 'One or both axles are using your tape-measure numbers instead of the gyro walk.') : null,
      report.drift
        ? h('p.muted', `Gyro drift over the walk: ${fmtPlain(report.drift.residual, 2, '°')} in ${report.drift.spanSec.toFixed(0)}s (${fmtPlain(report.drift.rateDegPerMin, 2, '°/min')}), removed from every capture.`)
        : null,
      button('Work out the tie-rod turns', { kind: 'primary', onclick: () => ctx.go('adjust') }),
    ),
  );

  /* ------------------------------------------------------------ camber */

  node.appendChild(
    card(
      'Camber',
      ...WHEELS.map((w) =>
        h(
          'div.block',
          h('div.block-head', h('span', wheelLabel(w)), report.runout?.[w] ? h('span.muted', `runout ±${report.runout[w].toFixed(2)}°`) : null),
          specMeter(report.camber[w], w[0] === 'F' ? specs.frontCamber : specs.rearCamber),
        ),
      ),
      h(
        'div.kvs',
        kv('Cross camber front', fmt(report.cross.frontCamber), report.grades?.crossCamber),
        kv('Cross camber rear', fmt(report.cross.rearCamber)),
      ),
      session.floor && (session.floor.crossFront || session.floor.crossRear)
        ? h('p.muted', `Ground slope removed: front ${fmt(session.floor.crossFront)}, rear ${fmt(session.floor.crossRear)} (positive = the car's right-hand side is higher).`)
        : h('p.muted', 'No ground-slope correction recorded — these are angles against gravity.'),
    ),
  );

  /* ------------------------------------------------------------ caster */

  if (report.caster.FL != null || report.caster.FR != null) {
    node.appendChild(
      card(
        'Caster, SAI & included angle',
        h('div.block', h('div.block-head', h('span', 'Front left')), specMeter(report.caster.FL, specs.caster)),
        h('div.block', h('div.block-head', h('span', 'Front right')), specMeter(report.caster.FR, specs.caster)),
        h(
          'div.kvs',
          kv('Cross caster', fmt(report.cross.caster), report.grades?.crossCaster),
          kv('SAI L / R', `${fmt(report.sai.FL)} / ${fmt(report.sai.FR)}`),
          kv('Included angle L / R', `${fmt(report.includedAngle.FL)} / ${fmt(report.includedAngle.FR)}`),
          kv('Cross included angle', fmt(report.cross.includedAngle)),
        ),
      ),
    );
  }

  /* ------------------------------------------------------------ thrust */

  node.appendChild(
    card(
      'Thrust line',
      Number.isFinite(report.toe.rearTotal)
        ? h(
            'div.stack',
            h('p.muted', 'Front toe above is measured against the rear axle’s thrust line, which is what keeps the steering wheel straight. The angle between that thrust line and the car’s geometric centreline needs one tape measurement, because wheel headings alone cannot see the car’s body.'),
            field({
              label: 'Thrust angle vs centreline (optional)',
              value: session.toe.thrustOffset ?? '',
              suffix: '°',
              step: '0.01',
              onchange: (v) => {
                session.toe.thrustOffset = Number.isFinite(v) ? v : null;
                store.save();
                ctx.refresh();
              },
              hint: 'Positive = the rear axle steers the car to the right. See Help for how to measure it with a tape.',
            }),
            Number.isFinite(report.thrustAngle) ? specMeter(report.thrustAngle, specs.thrust) : null,
          )
        : h('p.muted', 'Measure both rear wheels in the toe walk to get a thrust line.'),
    ),
  );

  /* ------------------------------------------------------------- export */

  node.appendChild(
    card(
      'Save & share',
      h(
        'div.stack',
        button('Export this report as CSV', {
          onclick: () => download(`trueline-${slug(vehicle?.name)}-${stamp()}.csv`, reportToCsv(report, vehicle, session), 'text/csv'),
        }),
        button('Export raw session as JSON', {
          onclick: () => download(`trueline-session-${stamp()}.json`, JSON.stringify({ vehicle, session, report }, null, 2)),
        }),
        navigator.share
          ? button('Share summary', {
              onclick: () => navigator.share({ title: 'Alignment', text: shareText(report, vehicle) }).catch(() => {}),
            })
          : null,
        button('Print', { kind: 'ghost', onclick: () => window.print() }),
      ),
    ),
  );

  /* ------------------------------------------------------------ history */

  const sessions = store.sessionsFor(vehicle?.id);
  node.appendChild(
    card(
      'Sessions',
      h(
        'div.stack',
        ...sessions.slice(0, 12).map((s) => {
          const r = sessionReport(s, vehicle);
          return h(
            'button.session-row',
            {
              type: 'button',
              class: s.id === session.id ? 'active' : null,
              onclick: () => {
                store.selectSession(s.id);
                ctx.refresh();
              },
            },
            h('span.session-when', s.label),
            h('span.session-vals', `${fmt(r.toe.frontTotal)} front toe · ${fmt(r.camber.FL)}/${fmt(r.camber.FR)} camber`),
            sessions.length > 1
              ? h(
                  'span.link',
                  {
                    onclick: (e) => {
                      e.stopPropagation();
                      store.removeSession(s.id);
                      ctx.refresh();
                    },
                  },
                  'delete',
                )
              : null,
          );
        }),
      ),
    ),
  );

  return node;
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const slug = (s) => (s || 'car').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function shareText(report, vehicle) {
  return [
    `${vehicle?.name || 'Car'} alignment`,
    `Front total toe ${fmt(report.toe.frontTotal)}, rear ${fmt(report.toe.rearTotal)}`,
    `Camber FL ${fmt(report.camber.FL)} FR ${fmt(report.camber.FR)} RL ${fmt(report.camber.RL)} RR ${fmt(report.camber.RR)}`,
    Number.isFinite(report.caster.FL) ? `Caster ${fmt(report.caster.FL)} / ${fmt(report.caster.FR)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
