/**
 * Minimal quaternion / vector helpers.
 *
 * Conventions used everywhere in this app:
 *   Device frame (W3C): +x = right edge of screen, +y = top of screen,
 *                       +z = out of the screen towards the user.
 *   World frame:        +z = up (opposite gravity). +x/+y horizontal with an
 *                       arbitrary azimuth origin -- we only ever use azimuth
 *                       *differences*, never an absolute compass bearing.
 *   Quaternion q = [w, x, y, z] rotates device -> world:  v_world = q v_device q*
 */

export const DEG = 180 / Math.PI;
export const RAD = Math.PI / 180;

/* ------------------------------------------------------------------ vectors */

export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];

export function vAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vSub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vScale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function vDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function vLen(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

export function vNorm(a) {
  const l = vLen(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

/* -------------------------------------------------------------- quaternions */

export const qIdentity = () => [1, 0, 0, 0];

export function qMul(a, b) {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

export function qConj(q) {
  return [q[0], -q[1], -q[2], -q[3]];
}

export function qNorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return l > 1e-12 ? [q[0] / l, q[1] / l, q[2] / l, q[3] / l] : qIdentity();
}

/** Rotate a device-frame vector into the world frame. */
export function qRotate(q, v) {
  const [w, x, y, z] = q;
  // t = 2 * (q_vec x v); v' = v + w*t + q_vec x t
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

/** Rotate a world-frame vector into the device frame. */
export function qRotateInv(q, v) {
  return qRotate(qConj(q), v);
}

/** Small-angle quaternion from a body-frame rotation vector (radians). */
export function qFromRotationVector(r) {
  const theta = vLen(r);
  if (theta < 1e-9) return [1, r[0] / 2, r[1] / 2, r[2] / 2];
  const half = theta / 2;
  const s = Math.sin(half) / theta;
  return [Math.cos(half), r[0] * s, r[1] * s, r[2] * s];
}

/**
 * Quaternion from the W3C DeviceOrientationEvent Euler angles (degrees).
 * The spec's rotation order is Z(alpha) -> X'(beta) -> Y''(gamma), intrinsic.
 */
export function qFromEuler(alphaDeg, betaDeg, gammaDeg) {
  const a = (alphaDeg || 0) * RAD;
  const b = (betaDeg || 0) * RAD;
  const g = (gammaDeg || 0) * RAD;
  const [ca, sa] = [Math.cos(a / 2), Math.sin(a / 2)];
  const [cb, sb] = [Math.cos(b / 2), Math.sin(b / 2)];
  const [cg, sg] = [Math.cos(g / 2), Math.sin(g / 2)];
  return qNorm([
    ca * cb * cg - sa * sb * sg,
    ca * sb * cg - sa * cb * sg,
    ca * cb * sg + sa * sb * cg,
    sa * cb * cg + ca * sb * sg,
  ]);
}

/** Generic Sensor API quaternions are [x, y, z, w]; ours are [w, x, y, z]. */
export function qFromXYZW(a) {
  return qNorm([a[3], a[0], a[1], a[2]]);
}

/**
 * Rotate `q` about the world +z axis by `angle` radians.
 * Used to re-zero heading without touching the (gravity-locked) tilt.
 */
export function qYawWorld(q, angle) {
  const h = angle / 2;
  return qNorm(qMul([Math.cos(h), 0, 0, Math.sin(h)], q));
}
