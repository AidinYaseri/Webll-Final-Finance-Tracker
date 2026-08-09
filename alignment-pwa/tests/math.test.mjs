import test from 'node:test';
import assert from 'node:assert/strict';

import {
  qFromEuler,
  qRotate,
  qRotateInv,
  qYawWorld,
  qMul,
  qConj,
  vNorm,
  vCross,
  RAD,
  DEG,
} from '../js/math/quat.js';

import {
  wrapDeg,
  circMeanDeg,
  azimuthOf,
  elevationOf,
  camberFromNormal,
  levelCamber,
  levelCaster,
  correctBarAzimuth,
  totalToe,
  individualToe,
  thrustHeading,
  closeLoop,
  toeFromTape,
  toeDegToMm,
  toeMmToDeg,
  inchToMm,
  solveSweep,
  casterFromSymmetricSweep,
  toePerTurn,
  turnsFor,
  describeTurns,
  gradeSpec,
  buildReport,
  ackermann,
} from '../js/math/align.js';

const close = (a, b, eps = 1e-6, msg) =>
  assert.ok(Math.abs(a - b) < eps, msg || `${a} !~= ${b} (tolerance ${eps})`);

/* ------------------------------------------------------------------- quat */

test('rotating by identity leaves a vector alone', () => {
  const v = [0.3, -0.5, 0.81];
  const out = qRotate([1, 0, 0, 0], v);
  v.forEach((c, i) => close(out[i], c));
});

test('device orientation Euler angles reproduce the gravity direction', () => {
  // Lying flat, screen up: world "up" is the device +z axis.
  let up = qRotateInv(qFromEuler(0, 0, 0), [0, 0, 1]);
  close(up[2], 1, 1e-9);

  // beta = 90: standing upright facing you, so the device +y axis points up.
  up = qRotateInv(qFromEuler(0, 90, 0), [0, 0, 1]);
  close(up[1], 1, 1e-9);

  // gamma = 90: tipped onto its right edge, so up is the device -x axis.
  up = qRotateInv(qFromEuler(0, 0, 90), [0, 0, 1]);
  close(up[0], -1, 1e-9);

  // Halfway cases keep the magnitude sensible.
  up = qRotateInv(qFromEuler(0, 30, 0), [0, 0, 1]);
  close(Math.hypot(...up), 1, 1e-9);
  close(up[1], Math.sin(30 * RAD), 1e-9);
  close(up[2], Math.cos(30 * RAD), 1e-9);
});

test('a world yaw offset rotates headings but not tilt', () => {
  const q = qFromEuler(0, 70, 0);
  const before = qRotate(q, [0, 1, 0]);
  const after = qRotate(qYawWorld(q, 30 * RAD), [0, 1, 0]);
  close(elevationOf(after), elevationOf(before), 1e-9);
  close(wrapDeg(azimuthOf(after) - azimuthOf(before)), 30, 1e-6);
});

test('quaternion multiplication composes rotations', () => {
  const a = qFromEuler(20, 10, 5);
  const out = qMul(a, qConj(a));
  close(out[0], 1, 1e-9);
});

/* ------------------------------------------------------------- angle tools */

test('wrapDeg folds onto (-180, 180]', () => {
  close(wrapDeg(370), 10);
  close(wrapDeg(-190), 170);
  close(wrapDeg(180), 180);
  close(wrapDeg(-180), 180);
});

test('circular mean survives the seam', () => {
  close(circMeanDeg([179, -179]), 180, 1e-6);
  close(circMeanDeg([10, 20]), 15, 1e-6);
});

test('azimuth is undefined for a vertical vector', () => {
  assert.ok(Number.isNaN(azimuthOf([0, 0, 1])));
  close(azimuthOf([0, 1, 0]), 90);
});

/* ---------------------------------------------------------------- camber */

test('camber reads zero for a vertical wheel plane and signs the lean', () => {
  close(camberFromNormal([1, 0, 0], true), 0, 1e-9);
  // Screen normal tilted up by 2 degrees => 2 degrees of negative camber.
  const n = vNorm([Math.cos(2 * RAD), 0, Math.sin(2 * RAD)]);
  close(camberFromNormal(n, true), -2, 1e-6);
  close(camberFromNormal(n, false), 2, 1e-6);
});

test('a sideways slope is removed from camber with opposite signs per side', () => {
  // Right-hand side of the car 1 degree higher: the car rolls left, so the
  // left wheel reads 1 degree too positive and the right wheel too negative.
  close(levelCamber(-0.5, 'L', 1), -1.5);
  close(levelCamber(-0.5, 'R', 1), 0.5);
});

test('a nose-up floor hides caster and the correction gives it back', () => {
  close(levelCaster(3.2, 0.8), 4.0, 1e-9);
});

/* -------------------------------------------------------------------- toe */

test('toe-in is positive and total toe is reference free', () => {
  // Left wheel pointing 0.2 deg right of straight, right wheel 0.3 deg left.
  const azL = -0.2;
  const azR = 0.3;
  close(totalToe(azL, azR), 0.5, 1e-9);
  // Same answer whatever heading the car happens to sit at.
  close(totalToe(azL + 137, azR + 137), 0.5, 1e-9);
  close(individualToe(azL, 'L', 0), 0.2, 1e-9);
  close(individualToe(azR, 'R', 0), 0.3, 1e-9);
});

test('the thrust line bisects the rear wheels', () => {
  close(thrustHeading(-0.1, 0.3), 0.1, 1e-6);
});

test('front toe is reported against the thrust line', () => {
  const report = buildReport({
    azimuth: { FL: -0.15, FR: 0.15, RL: 0.1, RR: 0.3 },
    camber: {},
  });
  close(report.toe.rearTotal, 0.2, 1e-9);
  close(report.thrustHeading, 0.2, 1e-6);
  close(report.toe.frontTotal, 0.3, 1e-9);
  // Thrust line is 0.2 deg to the left, so the front wheels are asymmetric
  // about it even though their total is symmetric about the axle.
  close(report.toe.FL, 0.35, 1e-6);
  close(report.toe.FR, -0.05, 1e-6);
  close(report.toe.FL + report.toe.FR, report.toe.frontTotal, 1e-9);
  assert.equal(report.toeReference, 'thrust');
});

test('loop closure spreads the drift over time', () => {
  const t0 = 1_700_000_000_000;
  const captures = [
    { t: t0, az: 0 },
    { t: t0 + 10_000, az: 1.0 },
    { t: t0 + 20_000, az: 2.0 },
    { t: t0 + 40_000, az: 0.4 }, // back at wheel 1: 0.4 deg of drift
  ];
  const out = closeLoop(captures);
  close(out.residual, 0.4, 1e-9);
  close(out.spanSec, 40, 1e-9);
  close(out.rateDegPerMin, 0.6, 1e-9);
  close(out.corrected[0], 0, 1e-9);
  close(out.corrected[1], 0.9, 1e-9);
  close(out.corrected[2], 1.8, 1e-9);
  close(out.corrected[3], 0, 1e-9);
});

test('tape measure toe matches the angle it came from', () => {
  const span = inchToMm(17);
  const deg = toeFromTape(1500, 1500 + toeDegToMm(0.25, span), span);
  close(deg, 0.25, 1e-6);
  close(toeMmToDeg(toeDegToMm(0.4, span), span), 0.4, 1e-9);
});

/* -------------------------------------------------- bar tilt vs wheel plane */

/** Build a bar lying in a real wheel plane and read it the way the app does. */
function barReading(planeAz, camber, barPitchDeg, side) {
  const A = planeAz * RAD;
  const g = camber * RAD;
  const t = [Math.cos(A), Math.sin(A), 0]; // horizontal forward line in the plane
  const outward =
    side === 'L' ? [-Math.sin(A), Math.cos(A), 0] : [Math.sin(A), -Math.cos(A), 0];
  // Outward normal, tilted down by the camber angle.
  const n = vNorm([
    outward[0] * Math.cos(g),
    outward[1] * Math.cos(g),
    -Math.sin(g),
  ]);
  let up = vCross(t, n);
  if (up[2] < 0) up = up.map((v) => -v);
  const phi = barPitchDeg * RAD;
  const b = vNorm([
    t[0] * Math.cos(phi) + up[0] * Math.sin(phi),
    t[1] * Math.cos(phi) + up[1] * Math.sin(phi),
    t[2] * Math.cos(phi) + up[2] * Math.sin(phi),
  ]);
  return { az: azimuthOf(b), elevation: elevationOf(b), normalElevation: elevationOf(n) };
}

test('the synthetic wheel plane really has the camber we asked for', () => {
  for (const side of ['L', 'R']) {
    const r = barReading(12, 2.5, 0, side);
    close(-r.normalElevation, 2.5, 1e-9); // camber = minus the normal's elevation
    close(r.az, 12, 1e-9); // a level bar reads the plane heading directly
  }
});

test('a tilted straight-edge biases toe, and the correction removes it', () => {
  for (const side of ['L', 'R']) {
    for (const camber of [-2.5, 0.8, 3]) {
      for (const pitch of [-8, -3, 4, 9]) {
        const r = barReading(17, camber, pitch, side);
        const naive = Math.abs(wrapDeg(r.az - 17));
        const fixed = Math.abs(wrapDeg(correctBarAzimuth(r.az, r.elevation, camber, side) - 17));
        assert.ok(fixed < 1e-6, `correction left ${fixed} deg on ${side} ${camber} ${pitch}`);
        if (Math.abs(camber) > 1 && Math.abs(pitch) > 5) {
          assert.ok(naive > 0.05, `expected a meaningful uncorrected error, got ${naive}`);
        }
      }
    }
  }
});

test('the bar correction does nothing when the bar is level', () => {
  close(correctBarAzimuth(30, 0, 2.5, 'L'), 30, 1e-9);
});

/* ----------------------------------------------------------- caster sweep */

/** Forward model: what camber a wheel shows at a given steer angle. */
const sweepCamber = (camber0, caster, includedAngle, steer, side) => {
  const d = steer * RAD;
  const s = side === 'L' ? 1 : -1;
  return camber0 * Math.cos(d) + s * caster * Math.sin(d) + includedAngle * (1 - Math.cos(d));
};

test('the sweep solver recovers caster, SAI and included angle', () => {
  for (const side of ['L', 'R']) {
    const camber0 = -0.6;
    const caster = 4.3;
    const sai = 12.4;
    const ia = sai + camber0;
    const points = [-19, 21].map((steer) => ({
      steer,
      camber: sweepCamber(camber0, caster, ia, steer, side),
    }));
    const sol = solveSweep(camber0, points, side);
    close(sol.caster, caster, 1e-6);
    close(sol.includedAngle, ia, 1e-6);
    close(sol.sai, sai, 1e-6);
    close(sol.rms, 0, 1e-6);
    close(sol.maxSweep, 21, 1e-9);
  }
});

test('asymmetric and three-point sweeps still solve', () => {
  const camber0 = 0.2;
  const caster = 6.1;
  const ia = 9.8;
  const points = [-24, -11, 18].map((steer) => ({
    steer,
    camber: sweepCamber(camber0, caster, ia, steer, 'L'),
  }));
  const sol = solveSweep(camber0, points, 'L');
  close(sol.caster, caster, 1e-6);
  close(sol.includedAngle, ia, 1e-6);
  assert.equal(sol.points, 3);
});

test('the classic symmetric formula agrees with the solver when SAI is zero', () => {
  const camber0 = -1;
  const caster = 3.5;
  const ia = camber0; // SAI = 0
  const cL = sweepCamber(camber0, caster, ia, 20, 'L');
  const cR = sweepCamber(camber0, caster, ia, -20, 'L');
  close(casterFromSymmetricSweep(cL, cR, 20, 'L'), caster, 1e-6);
});

test('a sweep needs two usable points', () => {
  assert.equal(solveSweep(0, [{ steer: 20, camber: 1 }], 'L'), null);
  assert.equal(solveSweep(0, [{ steer: 1, camber: 0.1 }, { steer: -1, camber: -0.1 }], 'L'), null);
});

/* ------------------------------------------------------------- tie rods */

test('toe per turn follows the thread pitch and the arm length', () => {
  close(toePerTurn(1.5, 140, 1), Math.atan(1.5 / 140) * DEG, 1e-9);
  close(toePerTurn(1.5, 140, 2), Math.atan(3 / 140) * DEG, 1e-9);
  assert.ok(Number.isNaN(toePerTurn(1.5, 0)));
});

test('turn counts point at the target and read back in flats', () => {
  close(turnsFor(-0.2, 0.05, 0.5), 0.5, 1e-9);
  assert.equal(describeTurns(1.5), '1 turn + 3 flats forward');
  assert.equal(describeTurns(-2), '2 turns back');
  assert.equal(describeTurns(0), 'no change forward');
  assert.equal(describeTurns(NaN), '--');
});

/* ---------------------------------------------------------------- specs */

test('grading respects the tolerance band', () => {
  const spec = { target: 0.1, tol: 0.1 };
  assert.equal(gradeSpec(0.12, spec), 'pass');
  assert.equal(gradeSpec(0.19, spec), 'marginal');
  assert.equal(gradeSpec(0.3, spec), 'fail');
  assert.equal(gradeSpec(NaN, spec), 'unknown');
});

test('ackermann is the extra angle the inner wheel turns', () => {
  close(ackermann(32, -28), 4, 1e-9);
});
