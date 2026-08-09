import test from 'node:test';
import assert from 'node:assert/strict';

import {
  camberValues,
  toeAzimuths,
  casterSolutions,
  sessionReport,
  completeness,
  reportToCsv,
} from '../js/core/compute.js';
import { RAD } from '../js/math/quat.js';

const close = (a, b, eps = 1e-6, msg) =>
  assert.ok(Math.abs(a - b) < eps, msg || `${a} !~= ${b} (tolerance ${eps})`);

const T0 = 1_700_000_000_000;

function makeSession(over = {}) {
  return {
    id: 's1',
    vehicleId: 'v1',
    startedAt: T0,
    label: 'test',
    floor: { crossFront: 0, crossRear: 0, pitch: 0 },
    camber: {},
    toe: { captures: [], tape: null, thrustOffset: null },
    caster: {},
    ...over,
  };
}

const vehicle = {
  id: 'v1',
  name: 'Test car',
  rimDiameterIn: 17,
  specs: {
    frontCamber: { target: -0.5, tol: 0.5 },
    rearCamber: { target: -1, tol: 0.5 },
    frontTotalToe: { target: 0.1, tol: 0.1 },
    rearTotalToe: { target: 0.2, tol: 0.1 },
    caster: { target: 4, tol: 0.5 },
    crossCamber: { target: 0, tol: 0.5 },
    crossCaster: { target: 0, tol: 0.5 },
    thrust: { target: 0, tol: 0.15 },
  },
  tieRod: { perTurn: null, pitchMm: 1.5, armMm: 140, threads: 1 },
};

const camberRec = (values) => ({ passes: values.map((value) => ({ value, wobble: 0.05 })) });

/* ------------------------------------------------------------------ camber */

test('runout passes are averaged and the spread is reported', () => {
  const s = makeSession({ camber: { FL: camberRec([-1.2, -0.8]) } });
  const cam = camberValues(s);
  close(cam.value.FL, -1.0);
  close(cam.runout.FL, 0.2);
});

test('the ground slope is applied per axle and per side', () => {
  const s = makeSession({
    camber: {
      FL: camberRec([-1]),
      FR: camberRec([-1]),
      RL: camberRec([-1]),
      RR: camberRec([-1]),
    },
    floor: { crossFront: 0.4, crossRear: 0, pitch: 0 },
  });
  const cam = camberValues(s);
  close(cam.value.FL, -1.4);
  close(cam.value.FR, -0.6);
  close(cam.value.RL, -1); // rear axle has its own slope, left at zero
  close(cam.value.RR, -1);
  close(cam.raw.FL, -1); // raw stays untouched so corrections stay reversible
});

/* --------------------------------------------------------------------- toe */

/** A walk with no drift and a level bar: azimuths come straight through. */
function walk(azByWheel, { driftPerStep = 0, spacingMs = 10_000 } = {}) {
  const order = ['FL', 'RL', 'RR', 'FR', 'FL'];
  return order.map((wheel, i) => ({
    wheel,
    t: T0 + i * spacingMs,
    azRaw: azByWheel[wheel] + driftPerStep * i,
    barElevation: 0,
    wobble: 0.05,
  }));
}

test('a clean walk gives total toe and thrust-referenced individual toe', () => {
  const s = makeSession({ toe: { captures: walk({ FL: -0.15, FR: 0.15, RL: 0.05, RR: 0.15 }) } });
  const r = sessionReport(s, vehicle);
  close(r.toe.frontTotal, 0.3, 1e-9);
  close(r.toe.rearTotal, 0.1, 1e-9);
  close(r.thrustHeading, 0.1, 1e-6);
  close(r.toe.FL, 0.25, 1e-6);
  close(r.toe.FR, 0.05, 1e-6);
  assert.equal(r.toeReference, 'thrust');
  assert.equal(r.grades.frontTotalToe, 'fail'); // target 0.10 +/- 0.10
  assert.equal(r.grades.rearTotalToe, 'marginal'); // 0.10 against 0.20 +/- 0.10
});

test('drift during the walk is measured by the closing capture and removed', () => {
  const truth = { FL: -0.15, FR: 0.15, RL: 0.05, RR: 0.15 };
  const s = makeSession({ toe: { captures: walk(truth, { driftPerStep: 0.1 }) } });
  const { azimuth, drift } = toeAzimuths(s, {});
  close(drift.residual, 0.4, 1e-9);
  close(drift.rateDegPerMin, 0.6, 1e-9);
  for (const w of ['FL', 'FR', 'RL', 'RR']) close(azimuth[w], truth[w], 1e-9);
});

test('without a closing capture the walk is used as-is', () => {
  const captures = walk({ FL: -0.15, FR: 0.15, RL: 0.05, RR: 0.15 }).slice(0, 4);
  const { drift } = toeAzimuths(makeSession({ toe: { captures } }), {});
  assert.equal(drift, null);
});

test('a tilted bar is corrected using that wheel’s camber', () => {
  const captures = walk({ FL: 0, FR: 0, RL: 0, RR: 0 });
  captures[0].barElevation = 8;
  captures[4].barElevation = 8;
  const cam = { FL: 3, FR: 0, RL: 0, RR: 0 };
  const withCamber = toeAzimuths(makeSession({ toe: { captures } }), cam);
  const withoutCamber = toeAzimuths(makeSession({ toe: { captures } }), {});
  assert.ok(
    Math.abs(withCamber.azimuth.FL - withoutCamber.azimuth.FL) > 0.005,
    'the correction should actually move the number',
  );
});

test('tape values replace the gyro result for that axle', () => {
  const s = makeSession({
    toe: {
      captures: walk({ FL: -0.15, FR: 0.15, RL: 0.05, RR: 0.15 }),
      tape: { front: 0.4, rear: null },
    },
  });
  const r = sessionReport(s, vehicle);
  close(r.toe.frontTotal, 0.4, 1e-9);
  close(r.toe.rearTotal, 0.1, 1e-9); // still from the walk
  assert.equal(r.tapeUsed, true);
});

test('toe is also reported in millimetres at the rim diameter', () => {
  const s = makeSession({ toe: { captures: walk({ FL: -0.25, FR: 0.25, RL: 0, RR: 0 }) } });
  const r = sessionReport(s, vehicle);
  close(r.toeMm.frontTotal, Math.tan(0.5 * RAD) * 17 * 25.4, 1e-6);
});

/* ------------------------------------------------------------------ caster */

const sweepCamber = (camber0, caster, ia, steer, side) => {
  const d = steer * RAD;
  const s = side === 'L' ? 1 : -1;
  return camber0 * Math.cos(d) + s * caster * Math.sin(d) + ia * (1 - Math.cos(d));
};

test('caster comes back out of a sweep, with the floor pitch added back', () => {
  const camber0 = -0.5;
  const caster = 4.2;
  const ia = 9;
  const s = makeSession({
    floor: { crossFront: 0, crossRear: 0, pitch: 0.3 },
    caster: {
      FL: {
        camber0,
        points: [-20, 20].map((steer) => ({ steer, camber: sweepCamber(camber0, caster, ia, steer, 'L') })),
      },
    },
  });
  const sol = casterSolutions(s).FL;
  close(sol.caster, caster + 0.3, 1e-6);
  close(sol.sai, ia - camber0, 1e-6);
});

test('a sideways slope moves the included angle but leaves caster and SAI alone', () => {
  const camber0 = -0.5;
  const caster = 4.2;
  const ia = 9;
  const points = [-20, 20].map((steer) => ({
    steer,
    camber: sweepCamber(camber0, caster, ia, steer, 'L'),
  }));
  const flat = casterSolutions(makeSession({ caster: { FL: { camber0, points } } })).FL;
  const sloped = casterSolutions(
    makeSession({
      caster: { FL: { camber0, points } },
      camber: { FL: camberRec([camber0]) },
      floor: { crossFront: 0.4, crossRear: 0, pitch: 0 },
    }),
  ).FL;
  close(sloped.caster, flat.caster, 1e-9);
  close(sloped.sai, flat.sai, 1e-9);
  close(sloped.includedAngle, flat.sai + (camber0 - 0.4), 1e-9);
});

/* ------------------------------------------------------------------ report */

test('completeness counts what has actually been measured', () => {
  const s = makeSession({
    camber: { FL: camberRec([-1]), FR: camberRec([-1]) },
    toe: { captures: walk({ FL: 0, FR: 0, RL: 0, RR: 0 }) },
    caster: { FL: { camber0: 0, points: [{ steer: 20, camber: 1 }, { steer: -20, camber: -1 }] } },
  });
  const c = completeness(s);
  assert.equal(c.camber, 2);
  assert.equal(c.toe, 4);
  assert.equal(c.caster, 1);
  assert.equal(c.anything, true);
  assert.equal(completeness(makeSession()).anything, false);
});

test('an empty session produces a report instead of throwing', () => {
  const r = sessionReport(makeSession(), vehicle);
  assert.ok(Number.isNaN(r.toe.frontTotal) || r.toe.frontTotal === undefined);
  assert.equal(r.completeness.anything, false);
  assert.ok(reportToCsv(r, vehicle, makeSession()).includes('TrueLine alignment report'));
});

test('cross values follow the left-minus-right convention', () => {
  const s = makeSession({
    camber: { FL: camberRec([-0.4]), FR: camberRec([-1.1]), RL: camberRec([-1]), RR: camberRec([-1.2]) },
  });
  const r = sessionReport(s, vehicle);
  close(r.cross.frontCamber, 0.7, 1e-9);
  close(r.cross.rearCamber, 0.2, 1e-9);
  assert.equal(r.grades.crossCamber, 'fail');
});
