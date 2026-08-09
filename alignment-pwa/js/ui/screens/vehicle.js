import { h } from '../dom.js';
import { card, button, banner, field, kv } from '../components.js';
import { store } from '../../core/store.js';
import { DEFAULT_SPECS, toeDegToMm, toeMmToDeg, inchToMm } from '../../math/align.js';

const SPEC_ROWS = [
  ['frontCamber', 'Front camber', '°'],
  ['rearCamber', 'Rear camber', '°'],
  ['frontTotalToe', 'Front total toe', '°'],
  ['rearTotalToe', 'Rear total toe', '°'],
  ['caster', 'Caster', '°'],
  ['crossCamber', 'Cross camber', '°'],
  ['crossCaster', 'Cross caster', '°'],
  ['thrust', 'Thrust angle', '°'],
];

export function vehicleScreen(ctx) {
  const v = store.vehicle;
  const node = h('div.screen');

  node.appendChild(
    card(
      'Vehicles',
      h(
        'div.stack',
        ...store.state.vehicles.map((veh) =>
          h(
            'button.session-row',
            {
              type: 'button',
              class: veh.id === v.id ? 'active' : null,
              onclick: () => {
                store.selectVehicle(veh.id);
                ctx.refresh();
              },
            },
            h('span.session-when', veh.name),
            h('span.session-vals', `${store.sessionsFor(veh.id).length} session(s) · ${veh.rimDiameterIn}" rims`),
          ),
        ),
        h(
          'div.row',
          button('Add a vehicle', {
            onclick: () => {
              store.addVehicle(`Car ${store.state.vehicles.length + 1}`);
              ctx.refresh();
            },
          }),
          store.state.vehicles.length > 1
            ? button('Delete this one', {
                kind: 'ghost',
                onclick: () => {
                  if (confirm(`Delete ${v.name} and all of its sessions?`)) {
                    store.removeVehicle(v.id);
                    ctx.refresh();
                  }
                },
              })
            : null,
        ),
      ),
    ),
  );

  node.appendChild(
    card(
      'Details',
      field({ label: 'Name', value: v.name, type: 'text', onchange: (val) => { store.updateVehicle(v.id, { name: val }); } }),
      field({
        label: 'Rim diameter',
        value: v.rimDiameterIn,
        suffix: 'inch',
        step: '0.5',
        onchange: (val) => { store.updateVehicle(v.id, { rimDiameterIn: val }); ctx.refresh(); },
        hint: 'Used to convert toe between degrees and millimetres',
      }),
      field({ label: 'Notes', value: v.notes, type: 'text', onchange: (val) => store.updateVehicle(v.id, { notes: val }) }),
    ),
  );

  /* --------------------------------------------------------------- specs */

  const specHost = h('div.stack');
  function paintSpecs() {
    const dia = inchToMm(v.rimDiameterIn || 17);
    specHost.replaceChildren(
      h('p.muted', 'Target values from the workshop manual. Anything inside the tolerance passes; the report colours everything against these.'),
      ...SPEC_ROWS.map(([key, label]) => {
        const spec = (v.specs[key] ||= { ...DEFAULT_SPECS[key] });
        const isToe = key.includes('Toe');
        return h(
          'div.block',
          h('div.block-head', h('span', label), isToe ? h('span.muted', `${toeDegToMm(spec.target, dia).toFixed(1)} mm`) : null),
          h(
            'div.grid2',
            field({
              label: 'Target',
              value: spec.target,
              suffix: '°',
              step: '0.01',
              onchange: (val) => {
                spec.target = val;
                store.save();
                paintSpecs();
              },
            }),
            field({
              label: 'Tolerance ±',
              value: spec.tol,
              suffix: '°',
              step: '0.01',
              onchange: (val) => {
                spec.tol = Math.abs(val);
                store.save();
                paintSpecs();
              },
            }),
          ),
          isToe
            ? field({
                label: 'Target in mm (same thing, converted)',
                value: Number(toeDegToMm(spec.target, dia).toFixed(2)),
                suffix: 'mm',
                step: '0.1',
                onchange: (val) => {
                  spec.target = toeMmToDeg(val, dia);
                  store.save();
                  paintSpecs();
                },
              })
            : null,
        );
      }),
      button('Reset to the generic defaults', {
        kind: 'ghost',
        onclick: () => {
          store.updateVehicle(v.id, { specs: structuredClone(DEFAULT_SPECS) });
          paintSpecs();
        },
      }),
      banner('warn', 'The defaults are a sensible road-car starting point, not your car’s spec. Look yours up before you trust the pass/fail colours.'),
    );
  }

  node.appendChild(card('Target specs', specHost));

  const sessions = store.sessionsFor(v.id);
  node.appendChild(
    card(
      'History',
      h(
        'div.kvs',
        kv('Sessions', String(sessions.length)),
        kv('First', sessions.length ? new Date(sessions[sessions.length - 1].startedAt).toLocaleDateString() : '--'),
        kv('Latest', sessions.length ? new Date(sessions[0].startedAt).toLocaleDateString() : '--'),
        kv('Toe per turn', Number.isFinite(v.tieRod.perTurn) ? `${v.tieRod.perTurn.toFixed(3)}°` : 'not learned'),
      ),
      button('Open the report', { kind: 'primary', onclick: () => ctx.go('report') }),
    ),
  );

  paintSpecs();
  return node;
}
