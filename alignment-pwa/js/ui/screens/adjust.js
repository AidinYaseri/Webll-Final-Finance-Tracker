import { h } from '../dom.js';
import { card, button, banner, kv, field, selectRow, stepList, toggleRow } from '../components.js';
import { store } from '../../core/store.js';
import { sessionReport } from '../../core/compute.js';
import { fmt, toePerTurn, turnsFor, describeTurns, toeDegToMm, inchToMm } from '../../math/align.js';

export function adjustScreen(ctx) {
  const vehicle = store.vehicle;
  const session = store.session;
  const report = sessionReport(session, vehicle);
  const tie = vehicle.tieRod;
  const node = h('div.screen');

  const targetTotal = vehicle.specs.frontTotalToe?.target ?? 0;
  const targetEach = targetTotal / 2;
  const perTurn = Number.isFinite(tie.perTurn) ? tie.perTurn : null;
  const estimate = toePerTurn(tie.pitchMm, tie.armMm, tie.threads);

  /* ------------------------------------------------------------- current */

  const rows = [];
  for (const w of ['FL', 'FR']) {
    const cur = report.toe[w];
    const err = Number.isFinite(cur) ? targetEach - cur : NaN;
    const turns = perTurn ? turnsFor(cur, targetEach, perTurn) : NaN;
    rows.push(
      h(
        'div.block',
        h('div.block-head', h('span', w === 'FL' ? 'Front left' : 'Front right'), h('span.muted', `target ${fmt(targetEach)}`)),
        h(
          'div.kvs',
          kv('Now', fmt(cur)),
          kv('Out by', fmt(err)),
          kv('Turns needed', perTurn ? describeTurns(turns) : 'learn first'),
        ),
      ),
    );
  }

  node.appendChild(
    card(
      'Front toe adjustment',
      Number.isFinite(report.toe.FL)
        ? h(
            'div.stack',
            h(
              'div.kvs',
              kv('Front total now', fmt(report.toe.frontTotal)),
              kv('Target total', fmt(targetTotal)),
              kv('In mm now', Number.isFinite(report.toe.frontTotal) ? `${toeDegToMm(report.toe.frontTotal, inchToMm(vehicle.rimDiameterIn)).toFixed(1)} mm` : '--'),
              kv('Reference', report.toeReference === 'thrust' ? 'rear thrust line' : 'front axle'),
            ),
            ...rows,
            report.toeReference === 'thrust'
              ? banner('good', 'Because both sides are measured against the rear thrust line, hitting these two targets also puts the steering wheel straight.')
              : banner('warn', 'Only the front axle was measured, so the app is splitting total toe evenly. Measure the rear wheels too if you also want the steering wheel centred.'),
          )
        : banner('info', 'Measure front toe first — the walk on the Toe screen takes about a minute.'),
    ),
  );

  /* --------------------------------------------------------------- learn */

  const learnHost = h('div.stack');
  function paintLearn() {
    const learn = vehicle.learn;
    const kids = [
      h('p.muted', 'Every car turns a different amount of toe per turn of the adjuster. Measure it once and the app will tell you exactly how far to turn from then on.'),
    ];
    if (perTurn) {
      kids.push(
        kv('Learned sensitivity', `${perTurn > 0 ? '+' : '−'}${Math.abs(perTurn).toFixed(3)}° of toe per turn`),
        h('p.muted', tie.learnedAt ? `Learned ${new Date(tie.learnedAt).toLocaleDateString()} on the ${learnSideName(tie.learnedSide)}.` : ''),
      );
    }
    if (!learn) {
      kids.push(
        selectRow('Side to learn on', 'FL', [
          { value: 'FL', label: 'Front left' },
          { value: 'FR', label: 'Front right' },
        ], (v) => {
          vehicle.learnSide = v;
          store.save();
        }),
        button('Step 1 — record where it is now', {
          kind: 'primary',
          disabled: !Number.isFinite(report.toe.FL),
          onclick: () => {
            const side = vehicle.learnSide || 'FL';
            vehicle.learn = { side, baseToe: report.toe[side], turns: 1, at: Date.now() };
            store.save();
            paintLearn();
          },
        }),
      );
    } else {
      kids.push(
        kv('Baseline', `${learnSideName(learn.side)} at ${fmt(learn.baseToe)}`),
        field({
          label: 'Turns you made on that adjuster',
          value: learn.turns,
          step: '0.25',
          suffix: 'turns',
          onchange: (v) => {
            learn.turns = v;
            store.save();
          },
          hint: 'Count them out loud. Anticlockwise counts as negative if you prefer.',
        }),
        stepList([
          'Turn that one adjuster by the number of turns above.',
          'Roll the car back and forward a couple of metres to settle it.',
          'Re-run the toe walk on the Toe screen.',
          'Come back here and press Finish.',
        ]),
        h(
          'div.row',
          button('Step 2 — finish learning', {
            kind: 'primary',
            onclick: () => {
              const now = report.toe[learn.side];
              if (!Number.isFinite(now) || !learn.turns) return;
              const delta = now - learn.baseToe;
              if (Math.abs(delta) < 0.01) {
                learnHost.appendChild(banner('warn', 'The toe barely moved. Either the adjuster did not turn or the re-measurement is the same one as before.'));
                return;
              }
              tie.perTurn = delta / learn.turns;
              tie.learnedAt = Date.now();
              tie.learnedSide = learn.side;
              vehicle.learn = null;
              store.save();
              ctx.refresh();
            },
          }),
          button('Cancel', {
            kind: 'ghost',
            onclick: () => {
              vehicle.learn = null;
              store.save();
              paintLearn();
            },
          }),
        ),
      );
    }
    learnHost.replaceChildren(...kids);
  }

  node.appendChild(card('Learn this car', learnHost));

  /* ------------------------------------------------------------ estimate */

  node.appendChild(
    card(
      'Or estimate it from the hardware',
      field({ label: 'Thread pitch', value: tie.pitchMm, suffix: 'mm', step: '0.05', onchange: (v) => { tie.pitchMm = v; store.save(); ctx.refresh(); }, hint: 'M12×1.5 → 1.5. Imperial: 25.4 ÷ TPI.' }),
      field({ label: 'Steering arm length', value: tie.armMm, suffix: 'mm', step: '1', onchange: (v) => { tie.armMm = v; store.save(); ctx.refresh(); }, hint: 'Steering axis to the outer tie-rod ball joint' }),
      toggleRow('Double-ended sleeve (both ends threaded)', tie.threads === 2, (v) => { tie.threads = v ? 2 : 1; store.save(); ctx.refresh(); }, 'One turn moves the rod twice as far'),
      kv('Estimated', Number.isFinite(estimate) ? `${estimate.toFixed(3)}° of toe per turn` : '--'),
      button(perTurn ? 'Replace the learned value with this estimate' : 'Use this estimate', {
        kind: 'ghost',
        disabled: !Number.isFinite(estimate),
        onclick: () => {
          tie.perTurn = estimate;
          tie.learnedAt = null;
          store.save();
          ctx.refresh();
        },
      }),
      banner('info', 'The estimate gives the size of the change but not its direction. Lengthening a tie rod toes the wheel out when the rack sits behind the axle line, and in when it sits ahead of it. If the first correction goes the wrong way, flip the sign below.'),
      perTurn
        ? button('Flip the direction', {
            kind: 'ghost',
            onclick: () => {
              tie.perTurn = -tie.perTurn;
              store.save();
              ctx.refresh();
            },
          })
        : null,
    ),
  );

  /* --------------------------------------------------------- other angles */

  node.appendChild(
    card(
      'Camber & caster',
      h('p.muted', 'These are not turn-countable the way toe is, but the report tells you where to aim:'),
      stepList([
        `Camber is out by ${fmt(safeErr(report.camber.FL, vehicle.specs.frontCamber?.target))} on the front left and ${fmt(safeErr(report.camber.FR, vehicle.specs.frontCamber?.target))} on the front right. Slotted strut holes, eccentric bolts, camber plates or shims, depending on the car.`,
        'Cross camber matters more than either side on its own — a car pulls towards the more positive side.',
        'Caster is rarely adjustable on a road car. If one side is out by more than half a degree, look for a tired or shifted control-arm bush before reaching for shims.',
        'Re-measure after every change: settle the suspension by rolling the car back and forward before you believe a reading.',
      ]),
    ),
  );

  paintLearn();
  return node;
}

const learnSideName = (s) => (s === 'FR' ? 'front right' : 'front left');
const safeErr = (v, t) => (Number.isFinite(v) && Number.isFinite(t) ? t - v : NaN);
