/**
 * Wheel-alignment geometry.
 *
 * Every angle in this module is in DEGREES unless the name says otherwise.
 *
 * Sign conventions (the same ones an alignment rack printout uses):
 *   camber  positive = top of the wheel leans OUT (away from the vehicle)
 *   toe     positive = TOE-IN (leading edges of the wheels point together)
 *   caster  positive = top of the steering axis leans towards the REAR
 *   SAI     positive = top of the steering axis leans INboard
 *   thrust  positive = the rear axle steers the car to the RIGHT
 *   azimuth increases counter-clockwise seen from above (world +z is up)
 */

import { RAD, DEG, vNorm } from './quat.js';

export const SIDE = { L: 'L', R: 'R' };
export const AXLE = { F: 'F', R: 'R' };
export const WHEELS = ['FL', 'FR', 'RL', 'RR'];

export const wheelSide = (w) => (w[1] === 'L' ? SIDE.L : SIDE.R);
export const wheelAxle = (w) => (w[0] === 'F' ? AXLE.F : AXLE.R);
export const wheelLabel = (w) =>
  ({ FL: 'Front left', FR: 'Front right', RL: 'Rear left', RR: 'Rear right' }[w] || w);

/* --------------------------------------------------------------- angle util */

/** Wrap to (-180, 180]. */
export function wrapDeg(a) {
  let x = ((a + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

/** Mean of angles that may straddle the +/-180 seam. */
export function circMeanDeg(angles) {
  if (!angles.length) return NaN;
  let s = 0;
  let c = 0;
  for (const a of angles) {
    s += Math.sin(a * RAD);
    c += Math.cos(a * RAD);
  }
  return Math.atan2(s / angles.length, c / angles.length) * DEG;
}

export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/* ------------------------------------------------- readings from a rotation */

/**
 * Azimuth (heading) of a world-frame vector, in degrees, CCW positive.
 * Returns NaN when the vector is (near) vertical and has no meaningful heading.
 */
export function azimuthOf(vWorld) {
  const h = Math.hypot(vWorld[0], vWorld[1]);
  if (h < 0.08) return NaN; // < ~4.6 deg from vertical: heading is ill-defined
  return Math.atan2(vWorld[1], vWorld[0]) * DEG;
}

/** Elevation of a world-frame vector above the horizontal plane, degrees. */
export function elevationOf(vWorld) {
  const v = vNorm(vWorld);
  return Math.asin(Math.max(-1, Math.min(1, v[2]))) * DEG;
}

/**
 * Camber from the wheel-plane normal.
 * @param {number[]} nWorld  world-frame normal of the phone's screen
 * @param {boolean}  screenFacesOut true when the screen looks away from the car
 */
export function camberFromNormal(nWorld, screenFacesOut = true) {
  const e = elevationOf(nWorld);
  return screenFacesOut ? -e : e;
}

/**
 * Remove the lateral slope of the ground from a camber reading.
 * @param {number} camber    measured against gravity
 * @param {string} side      'L' | 'R'
 * @param {number} crossSlope elevation of the "towards the right of the car"
 *                            direction, i.e. positive when the right-hand side
 *                            of the car sits higher than the left.
 */
export function levelCamber(camber, side, crossSlope = 0) {
  if (!crossSlope) return camber;
  return camber - (side === SIDE.L ? 1 : -1) * crossSlope;
}

/* ------------------------------------------------------------------- toe */

/**
 * Total toe of one axle from the two wheel-plane azimuths.
 * Both captures must use the same device pose with the reference axis
 * pointing towards the FRONT of the car.
 */
export function totalToe(azLeft, azRight) {
  return wrapDeg(azRight - azLeft);
}

/** Individual toe of one wheel against a reference heading. */
export function individualToe(az, side, refHeading) {
  return side === SIDE.L ? wrapDeg(refHeading - az) : wrapDeg(az - refHeading);
}

/**
 * Take the tilt of the straight-edge out of a toe capture.
 *
 * The bar lies in the wheel plane, but the wheel plane is tilted by the camber
 * angle, so a bar that is not level reads a heading that is rotated by roughly
 * (bar tilt) x (camber). At 5 degrees of bar tilt and 2 degrees of camber that
 * is 0.17 degrees of toe error, which matters. Because the app has already
 * measured the camber of that wheel it can simply undo it.
 *
 * @param {number} az   measured azimuth of the bar
 * @param {number} barElevation  elevation of the bar's forward end, degrees
 * @param {number} camber  camber of that wheel, degrees (+ = top out)
 * @param {string} side 'L' | 'R'
 */
export function correctBarAzimuth(az, barElevation, camber, side) {
  if (!Number.isFinite(az)) return az;
  if (!Number.isFinite(barElevation) || !Number.isFinite(camber) || !camber) return az;
  const g = camber * RAD;
  const sinPhi = Math.min(1, Math.max(-1, Math.sin(barElevation * RAD) / Math.cos(g)));
  const phi = Math.asin(sinPhi);
  const err = Math.atan(Math.tan(phi) * Math.sin(g)) * DEG;
  return wrapDeg(az - (side === SIDE.L ? 1 : -1) * err);
}

/**
 * Take the fore/aft slope of the ground out of a caster reading.
 * A nose-up car has its steering axis rotated towards vertical, so it measures
 * less caster than it really has.
 * @param {number} caster measured against gravity
 * @param {number} floorPitch elevation of the "towards the front" direction
 */
export function levelCaster(caster, floorPitch = 0) {
  return Number.isFinite(caster) ? caster + (floorPitch || 0) : caster;
}

/** Thrust line heading: the bisector of the two rear wheel planes. */
export function thrustHeading(azRL, azRR) {
  return circMeanDeg([azRL, azRR]);
}

/**
 * Correct a set of timestamped azimuth captures for gyro drift using a
 * loop closure: the first and last capture are the same physical reference,
 * so any difference between them is drift, spread linearly over time.
 *
 * @param {{t:number, az:number}[]} captures  chronological, >= 2 entries
 * @returns {{corrected:number[], residual:number, rateDegPerMin:number,
 *            spanSec:number}}
 */
export function closeLoop(captures) {
  const n = captures.length;
  const out = {
    corrected: captures.map((c) => c.az),
    residual: 0,
    rateDegPerMin: 0,
    spanSec: 0,
  };
  if (n < 2) return out;
  const t0 = captures[0].t;
  const t1 = captures[n - 1].t;
  const span = (t1 - t0) / 1000;
  if (span <= 0) return out;
  const residual = wrapDeg(captures[n - 1].az - captures[0].az);
  out.residual = residual;
  out.spanSec = span;
  out.rateDegPerMin = (residual / span) * 60;
  out.corrected = captures.map((c) =>
    wrapDeg(c.az - (residual * ((c.t - t0) / 1000)) / span),
  );
  return out;
}

/* ---------------------------------------------------------- tape-measure toe */

/**
 * Total toe from the classic two-tape-measure method.
 * @param {number} front  distance between the wheels at the FRONT of the rims
 * @param {number} rear   distance at the REAR of the rims (same units)
 * @param {number} span   fore/aft distance between the two measuring points
 */
export function toeFromTape(front, rear, span) {
  if (!(span > 0)) return NaN;
  return Math.atan((rear - front) / span) * DEG;
}

/** Total toe in mm measured across a given rim/tyre diameter. */
export function toeDegToMm(toeDeg, diameterMm) {
  return Math.tan(toeDeg * RAD) * diameterMm;
}

export function toeMmToDeg(toeMm, diameterMm) {
  if (!(diameterMm > 0)) return NaN;
  return Math.atan(toeMm / diameterMm) * DEG;
}

/** Rim diameter in mm from the nominal inch size (17 -> 431.8). */
export const inchToMm = (inch) => inch * 25.4;

/* --------------------------------------------------------------- caster sweep */

/**
 * Solve a caster/SAI sweep.
 *
 * The camber of a steered wheel follows
 *     camber(d) = camber0 * cos d  +/- caster * sin d  +  IA * (1 - cos d)
 * where IA (included angle) = SAI + camber0, the sign of the caster term is
 * + for a left-hand wheel and - for a right-hand wheel, and d is the steer
 * angle, positive counter-clockwise seen from above (a left turn).
 *
 * Any number of sweep points >= 2 is accepted and solved by least squares, so
 * the lock angles do not have to be symmetric or land on exactly 20 degrees.
 *
 * @param {number} camber0 camber with the wheels straight ahead
 * @param {{steer:number, camber:number}[]} points
 * @param {string} side 'L' | 'R'
 */
export function solveSweep(camber0, points, side) {
  const s = side === SIDE.L ? 1 : -1;
  const usable = points.filter(
    (p) => Number.isFinite(p.steer) && Number.isFinite(p.camber) && Math.abs(p.steer) > 2,
  );
  if (usable.length < 2) return null;

  // Normal equations for [caster, IA].
  let a11 = 0;
  let a12 = 0;
  let a22 = 0;
  let b1 = 0;
  let b2 = 0;
  for (const p of usable) {
    const d = p.steer * RAD;
    const r1 = s * Math.sin(d);
    const r2 = 1 - Math.cos(d);
    const y = p.camber - camber0 * Math.cos(d);
    a11 += r1 * r1;
    a12 += r1 * r2;
    a22 += r2 * r2;
    b1 += r1 * y;
    b2 += r2 * y;
  }
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-9) return null;
  const caster = (b1 * a22 - b2 * a12) / det;
  const includedAngle = (a11 * b2 - a12 * b1) / det;

  let ss = 0;
  for (const p of usable) {
    const d = p.steer * RAD;
    const pred =
      camber0 * Math.cos(d) + s * caster * Math.sin(d) + includedAngle * (1 - Math.cos(d));
    ss += (p.camber - pred) ** 2;
  }
  return {
    caster,
    includedAngle,
    sai: includedAngle - camber0,
    rms: Math.sqrt(ss / usable.length),
    points: usable.length,
    maxSweep: Math.max(...usable.map((p) => Math.abs(p.steer))),
  };
}

/** Two-point shortcut, kept for reference and for the unit tests. */
export function casterFromSymmetricSweep(camberLeftLock, camberRightLock, sweep, side) {
  const s = side === SIDE.L ? 1 : -1;
  return (s * (camberLeftLock - camberRightLock)) / (2 * Math.sin(sweep * RAD));
}

/* ------------------------------------------------------------- tie-rod maths */

/**
 * Toe change per full turn of an adjuster, estimated from the hardware.
 * @param {number} pitchMm   thread pitch (1.5 for M12x1.5, 25.4/TPI for UNF)
 * @param {number} armMm     steering arm length: steering axis -> outer ball joint
 * @param {number} threads   1 for a rod that threads into one end, 2 for a
 *                           double-ended sleeve with opposite-hand threads
 */
export function toePerTurn(pitchMm, armMm, threads = 1) {
  if (!(armMm > 0)) return NaN;
  return Math.atan((pitchMm * threads) / armMm) * DEG;
}

/**
 * Turns needed on one side to move that wheel's individual toe to target.
 * `perTurn` is signed: it is the toe change produced by one turn in the
 * direction the user recorded during the learn step.
 */
export function turnsFor(currentToe, targetToe, perTurn) {
  if (!perTurn) return NaN;
  return (targetToe - currentToe) / perTurn;
}

/** Human phrasing for a turn count, e.g. 1.42 -> "1 turn + 5 flats". */
export function describeTurns(turns) {
  if (!Number.isFinite(turns)) return '--';
  const dir = turns >= 0 ? 'forward' : 'back';
  const abs = Math.abs(turns);
  const whole = Math.floor(abs + 1e-9);
  const flats = Math.round((abs - whole) * 6);
  const parts = [];
  if (whole) parts.push(`${whole} turn${whole === 1 ? '' : 's'}`);
  if (flats) parts.push(`${flats} flat${flats === 1 ? '' : 's'}`);
  if (!parts.length) parts.push('no change');
  return `${parts.join(' + ')} ${dir}`;
}

/* ------------------------------------------------------------------ specs */

export const DEFAULT_SPECS = {
  frontCamber: { target: -0.5, tol: 0.5 },
  rearCamber: { target: -1.0, tol: 0.5 },
  frontTotalToe: { target: 0.1, tol: 0.1 },
  rearTotalToe: { target: 0.2, tol: 0.1 },
  caster: { target: 4.0, tol: 0.5 },
  crossCamber: { target: 0, tol: 0.5 },
  crossCaster: { target: 0, tol: 0.5 },
  thrust: { target: 0, tol: 0.15 },
};

/** 'pass' | 'marginal' | 'fail' | 'unknown' */
export function gradeSpec(value, spec) {
  if (!spec || !Number.isFinite(value) || !Number.isFinite(spec.target)) return 'unknown';
  const tol = Math.abs(spec.tol ?? 0);
  const err = Math.abs(value - spec.target);
  if (!tol) return err < 1e-6 ? 'pass' : 'fail';
  if (err <= tol * 0.7) return 'pass';
  if (err <= tol) return 'marginal';
  return 'fail';
}

/* ------------------------------------------------------- report assembly */

/**
 * Build the full report from a session's per-wheel values.
 *
 * @param {Object} m
 * @param {Object} m.camber   { FL, FR, RL, RR } degrees, already levelled
 * @param {Object} m.azimuth  { FL, FR, RL, RR } degrees, already drift-corrected
 * @param {Object} m.caster   { FL, FR } sweep solutions
 * @param {number} [m.thrustOffset] measured thrust angle vs the geometric
 *        centreline, when the user has measured it with a tape
 */
export function buildReport(m = {}) {
  const camber = m.camber || {};
  const az = m.azimuth || {};
  const caster = m.caster || {};
  const r = { camber: { ...camber }, toe: {}, caster: {}, sai: {}, includedAngle: {}, cross: {} };

  const has = (a, b) => Number.isFinite(a) && Number.isFinite(b);

  if (has(az.RL, az.RR)) {
    r.toe.rearTotal = totalToe(az.RL, az.RR);
    r.thrustHeading = thrustHeading(az.RL, az.RR);
    r.toe.RL = r.toe.rearTotal / 2;
    r.toe.RR = r.toe.rearTotal / 2;
  }
  if (has(az.FL, az.FR)) {
    r.toe.frontTotal = totalToe(az.FL, az.FR);
    if (Number.isFinite(r.thrustHeading)) {
      r.toe.FL = individualToe(az.FL, SIDE.L, r.thrustHeading);
      r.toe.FR = individualToe(az.FR, SIDE.R, r.thrustHeading);
      r.toeReference = 'thrust';
    } else {
      r.toe.FL = r.toe.frontTotal / 2;
      r.toe.FR = r.toe.frontTotal / 2;
      r.toeReference = 'axle';
    }
  }
  // The thrust angle against the geometric centreline is not observable from
  // wheel-plane headings alone; it comes from the optional tape measurement.
  if (Number.isFinite(m.thrustOffset)) r.thrustAngle = m.thrustOffset;

  for (const w of ['FL', 'FR']) {
    const c = caster[w];
    if (c) {
      r.caster[w] = c.caster;
      r.sai[w] = c.sai;
      r.includedAngle[w] = c.includedAngle;
    }
  }

  if (has(camber.FL, camber.FR)) r.cross.frontCamber = camber.FL - camber.FR;
  if (has(camber.RL, camber.RR)) r.cross.rearCamber = camber.RL - camber.RR;
  if (has(r.caster.FL, r.caster.FR)) r.cross.caster = r.caster.FL - r.caster.FR;
  if (has(r.includedAngle.FL, r.includedAngle.FR))
    r.cross.includedAngle = r.includedAngle.FL - r.includedAngle.FR;

  return r;
}

/** Ackermann: how much more the inner wheel turns than the outer one. */
export function ackermann(innerSteer, outerSteer) {
  if (!Number.isFinite(innerSteer) || !Number.isFinite(outerSteer)) return NaN;
  return Math.abs(innerSteer) - Math.abs(outerSteer);
}

export const fmt = (v, d = 2, unit = '°') =>
  Number.isFinite(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}${unit}` : '--';

export const fmtPlain = (v, d = 2, unit = '') =>
  Number.isFinite(v) ? `${v.toFixed(d)}${unit}` : '--';
