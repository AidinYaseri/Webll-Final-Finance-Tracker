/**
 * Orientation engine.
 *
 * Produces a device -> world rotation (world +z = up) at sensor rate, plus
 * stillness detection and gyro-bias tracking.
 *
 * Two back ends:
 *   1. `RelativeOrientationSensor` (Generic Sensor API, Chrome/Android).
 *      Gyro+accel fusion done by the platform, no magnetometer, so the heading
 *      is relative and free of the magnetic distortion a car body creates.
 *   2. `devicemotion` + `deviceorientation` with our own Mahony filter
 *      (iOS Safari and anything else). Tilt is corrected against gravity;
 *      heading comes from integrating the gyro, with bias learned every time
 *      the phone is put down.
 *
 * Heading drift is unavoidable without a magnetic reference, so the app never
 * trusts an absolute heading: it only uses differences taken inside one short
 * session, and closes the loop on the first wheel to cancel what is left.
 */

import {
  qIdentity,
  qMul,
  qNorm,
  qRotate,
  qRotateInv,
  qFromRotationVector,
  qFromEuler,
  qFromXYZW,
  qYawWorld,
  vCross,
  vNorm,
  vLen,
  RAD,
  DEG,
} from '../math/quat.js';

export const SOURCE = {
  GENERIC: 'generic',
  MOTION: 'motion',
  ORIENTATION: 'orientation',
  NONE: 'none',
};

const STILL_RATE = 1.4; // deg/s, below this we call the phone still
const STILL_ACC = 0.45; // m/s^2 away from 1g still counts as still
const STILL_MS = 350; // how long before stillness is trusted
const KP = 1.6; // Mahony proportional gain (tilt)
const KI = 0.06; // Mahony integral gain (bias on the tilt axes)

export function sensorSupport() {
  const secure = typeof isSecureContext === 'undefined' ? true : isSecureContext;
  return {
    secure,
    generic: typeof window !== 'undefined' && 'RelativeOrientationSensor' in window,
    motion: typeof window !== 'undefined' && 'DeviceMotionEvent' in window,
    orientation: typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
    needsPermission:
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function',
  };
}

export class OrientationEngine {
  constructor() {
    this.q = qIdentity();
    this.up = [0, 0, 1]; // world "up" expressed in device axes
    this.rate = [0, 0, 0]; // deg/s, bias corrected, device axes
    this.bias = [0, 0, 0]; // deg/s
    this.integral = [0, 0, 0];
    this.still = false;
    this.stillSince = 0;
    this.running = false;
    this.source = SOURCE.NONE;
    this.accelSign = 1;
    this.accelSignKnown = false;
    this._seeded = false;
    this.lastT = 0;
    this.frames = 0;
    this.hz = 0;
    this.headingOffset = 0;
    this.zeroedAt = 0;
    this.calibration = { samples: 0, quality: 0 };
    this._subs = new Set();
    this._handlers = [];
    this._eulerUp = null;
    this._accMag = 9.81;
  }

  subscribe(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }

  async requestPermission() {
    const results = [];
    for (const Ctor of [
      typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : null,
      typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null,
    ]) {
      if (Ctor && typeof Ctor.requestPermission === 'function') {
        try {
          results.push(await Ctor.requestPermission());
        } catch (err) {
          results.push('error');
        }
      }
    }
    if (!results.length) return 'granted';
    return results.every((r) => r === 'granted') ? 'granted' : 'denied';
  }

  async start() {
    if (this.running) return this.source;
    const support = sensorSupport();
    this.running = true;

    if (support.generic && (await this._startGeneric())) {
      this.source = SOURCE.GENERIC;
    } else if (support.motion) {
      this._startMotion();
      this.source = SOURCE.MOTION;
    } else if (support.orientation) {
      this._startOrientationOnly();
      this.source = SOURCE.ORIENTATION;
    } else {
      this.running = false;
      this.source = SOURCE.NONE;
    }
    return this.source;
  }

  stop() {
    for (const off of this._handlers) off();
    this._handlers = [];
    this.running = false;
    this._seeded = false;
  }

  /* ------------------------------------------------------------- back ends */

  async _startGeneric() {
    try {
      // eslint-disable-next-line no-undef
      const sensor = new RelativeOrientationSensor({
        frequency: 60,
        referenceFrame: 'device',
      });
      let ok = false;
      await new Promise((resolve, reject) => {
        const onReading = () => {
          ok = true;
          this._pushQuaternion(qFromXYZW(sensor.quaternion), performance.now());
          resolve();
        };
        sensor.addEventListener('reading', onReading, { once: true });
        sensor.addEventListener('error', (e) => reject(e.error || new Error('sensor')), {
          once: true,
        });
        sensor.start();
        setTimeout(() => (ok ? resolve() : reject(new Error('timeout'))), 1500);
      });
      sensor.addEventListener('reading', () =>
        this._pushQuaternion(qFromXYZW(sensor.quaternion), performance.now()),
      );
      // A raw gyroscope alongside gives us a proper stillness signal.
      if ('Gyroscope' in window) {
        try {
          // eslint-disable-next-line no-undef
          const gyro = new Gyroscope({ frequency: 60 });
          gyro.addEventListener('reading', () => {
            this.rate = [gyro.x * DEG, gyro.y * DEG, gyro.z * DEG];
          });
          gyro.start();
          this._handlers.push(() => gyro.stop());
        } catch (err) {
          /* optional */
        }
      }
      this._handlers.push(() => sensor.stop());
      return true;
    } catch (err) {
      return false;
    }
  }

  _startMotion() {
    const onOrient = (e) => {
      if (e.beta === null && e.gamma === null) return;
      const q = qFromEuler(e.alpha, e.beta, e.gamma);
      this._eulerUp = vNorm(qRotateInv(q, [0, 0, 1]));
    };
    const onMotion = (e) => {
      const now = performance.now();
      const rr = e.rotationRate;
      const acc = e.accelerationIncludingGravity;
      if (!rr) return;
      // W3C: alpha about z, beta about x, gamma about y (deg/s).
      const raw = [rr.beta || 0, rr.gamma || 0, rr.alpha || 0];
      let up = this._eulerUp;
      if (acc && Number.isFinite(acc.x)) {
        const a = [acc.x, acc.y, acc.z];
        this._accMag = vLen(a);
        if (!this.accelSignKnown && this._eulerUp && this._accMag > 5) {
          // The sign of accelerationIncludingGravity is not consistent across
          // platforms; settle it once against the (well specified) Euler angles.
          const dot =
            a[0] * this._eulerUp[0] + a[1] * this._eulerUp[1] + a[2] * this._eulerUp[2];
          this.accelSign = dot >= 0 ? 1 : -1;
          this.accelSignKnown = true;
        }
        if (!up && this._accMag > 5) up = vNorm(a.map((v) => v * this.accelSign));
      }
      this._integrate(raw, up, now, this._accMag);
    };

    window.addEventListener('deviceorientation', onOrient, true);
    window.addEventListener('devicemotion', onMotion, true);
    this._handlers.push(
      () => window.removeEventListener('deviceorientation', onOrient, true),
      () => window.removeEventListener('devicemotion', onMotion, true),
    );
  }

  /** No gyro at all: tilt still works, heading does not. */
  _startOrientationOnly() {
    const onOrient = (e) => {
      if (e.beta === null && e.gamma === null) return;
      this.q = qFromEuler(e.alpha, e.beta, e.gamma);
      this.up = vNorm(qRotateInv(this.q, [0, 0, 1]));
      this.rate = [0, 0, 0];
      this.still = true;
      this._emit(performance.now());
    };
    window.addEventListener('deviceorientation', onOrient, true);
    this._handlers.push(() => window.removeEventListener('deviceorientation', onOrient, true));
  }

  /* ------------------------------------------------------------- filtering */

  _pushQuaternion(q, now) {
    const prev = this.q;
    this.q = qNorm(q);
    this.up = vNorm(qRotateInv(this.q, [0, 0, 1]));
    if (!this.rate.some(Boolean) && prev) {
      // Fall back to a quaternion-difference rate when no Gyroscope exists.
      const dt = Math.max(1, now - this.lastT) / 1000;
      const dq = qMul(qNorm([prev[0], -prev[1], -prev[2], -prev[3]]), this.q);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(dq[0]))) * DEG;
      const m = ang / dt;
      this.rate = [m, 0, 0];
    }
    this._updateStill(now, Math.hypot(...this.rate), 9.81);
    this.lastT = now;
    this._emit(now);
  }

  _integrate(rawRate, up, now, accMag) {
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 0;
    this.lastT = now;
    if (dt <= 0) return;

    const corrected = [
      rawRate[0] - this.bias[0],
      rawRate[1] - this.bias[1],
      rawRate[2] - this.bias[2],
    ];
    this.rate = corrected;
    this._updateStill(now, Math.hypot(...corrected), accMag);

    if (up && vLen(up) > 0.5 && !this._seeded) {
      // Start from the measured attitude instead of spending a second or two
      // rotating there from the identity.
      this._seed(vNorm(up));
    }

    const omega = corrected.slice();

    if (this.still) {
      // Zero-rate update: learn the bias and stop the heading creeping. Only
      // the gyro term is damped — the gravity correction below still runs at
      // full strength, or a phone that is put down never settles.
      const a = 0.02;
      for (let i = 0; i < 3; i++) this.bias[i] += a * (rawRate[i] - this.bias[i]);
      this.calibration.samples++;
      for (let i = 0; i < 3; i++) omega[i] *= 0.05;
    }

    if (up && vLen(up) > 0.5) {
      // Mahony: pull the estimated "up" towards the measured one. This only
      // constrains tilt; heading stays a pure integral, which is why the toe
      // walk closes its own loop.
      const predicted = vNorm(qRotateInv(this.q, [0, 0, 1]));
      const err = vCross(predicted, vNorm(up)); // device frame, radians-ish
      const trust = Math.abs(accMag - 9.81) < 1.5 ? 1 : 0.15;
      for (let i = 0; i < 3; i++) {
        this.integral[i] += err[i] * KI * dt * trust * DEG;
        this.integral[i] = Math.max(-8, Math.min(8, this.integral[i]));
        omega[i] += err[i] * KP * trust * DEG + this.integral[i];
      }
    }

    const dq = qFromRotationVector(omega.map((v) => v * RAD * dt));
    this.q = qNorm(qMul(this.q, dq));
    this.up = vNorm(qRotateInv(this.q, [0, 0, 1]));
    this._emit(now);
  }

  /**
   * Shortest-arc rotation that takes the measured up vector (device frame)
   * onto world +z. Heading is left wherever it lands: it is relative anyway.
   */
  _seed(up) {
    const dot = up[2]; // up . (0,0,1)
    if (dot < -0.999999) {
      this.q = [0, 1, 0, 0]; // exactly upside down: any perpendicular axis
    } else {
      const axis = vCross(up, [0, 0, 1]);
      this.q = qNorm([1 + dot, axis[0], axis[1], axis[2]]);
    }
    this.integral = [0, 0, 0];
    this._seeded = true;
  }

  _updateStill(now, rateMag, accMag) {
    const quiet = rateMag < STILL_RATE && Math.abs(accMag - 9.81) < STILL_ACC;
    if (quiet) {
      if (!this.stillSince) this.stillSince = now;
      this.still = now - this.stillSince > STILL_MS;
    } else {
      this.stillSince = 0;
      this.still = false;
    }
  }

  _emit(now) {
    this.frames++;
    const frame = {
      t: now,
      q: this.q,
      up: this.up,
      rate: this.rate,
      rateMag: Math.hypot(...this.rate),
      still: this.still,
      stillMs: this.stillSince ? now - this.stillSince : 0,
      source: this.source,
      biasMag: Math.hypot(...this.bias),
      headingOffset: this.headingOffset,
      sinceZero: this.zeroedAt ? (now - this.zeroedAt) / 1000 : 0,
    };
    for (const fn of this._subs) fn(frame);
  }

  /* ---------------------------------------------------------------- helpers */

  /** World-frame direction of a device axis, with the heading zero applied. */
  world(vDevice) {
    return qRotate(qYawWorld(this.q, this.headingOffset * RAD), vDevice);
  }

  /** Screen normal (points out of the glass) in world coordinates. */
  screenNormal() {
    return this.world([0, 0, 1]);
  }

  /** Long axis of the phone (points out of the top edge) in world coordinates. */
  topAxis() {
    return this.world([0, 1, 0]);
  }

  /** Re-zero the heading so the current `vDevice` azimuth reads 0. */
  zeroHeading(vDevice = [0, 1, 0]) {
    const w = qRotate(this.q, vDevice);
    const az = Math.atan2(w[1], w[0]) * DEG;
    this.headingOffset = -az;
    this.zeroedAt = performance.now();
    return this.headingOffset;
  }

  /** Rough gyro quality: how long we have been able to watch a still phone. */
  quality() {
    if (this.source === SOURCE.GENERIC) return 1;
    if (this.source === SOURCE.NONE || this.source === SOURCE.ORIENTATION) return 0;
    return Math.min(1, this.calibration.samples / 120);
  }
}

/**
 * Average a derived reading over a short window, rejecting the sample if the
 * phone moves. Vector quantities are averaged as vectors so that wrap-around
 * can never bite.
 */
export class Averager {
  constructor(engine, { durationMs = 1200, requireStill = true } = {}) {
    this.engine = engine;
    this.durationMs = durationMs;
    this.requireStill = requireStill;
  }

  run(onProgress) {
    const { engine } = this;
    return new Promise((resolve) => {
      const normals = [];
      const tops = [];
      const rates = [];
      let started = 0;
      let disturbed = false;

      const off = engine.subscribe((frame) => {
        if (this.requireStill && !frame.still) {
          // Moving: throw away a part-finished window and wait for calm again.
          if (started) disturbed = true;
          started = 0;
          normals.length = 0;
          tops.length = 0;
          rates.length = 0;
          onProgress?.({ phase: 'waiting', progress: 0, frame, disturbed });
          return;
        }
        if (!started) started = frame.t;
        normals.push(engine.screenNormal());
        tops.push(engine.topAxis());
        rates.push(frame.rateMag);
        const progress = Math.min(1, (frame.t - started) / this.durationMs);
        onProgress?.({ phase: 'sampling', progress, frame });
        if (progress >= 1) {
          off();
          resolve(finish(normals, tops, rates, disturbed));
        }
      });

      // Hard stop so a wobbly hand cannot hang the UI forever.
      setTimeout(() => {
        off();
        resolve(
          normals.length > 5
            ? finish(normals, tops, rates, true)
            : { ok: false, reason: 'timeout' },
        );
      }, Math.max(6000, this.durationMs * 5));
    });
  }
}

function finish(normals, tops, rates, disturbed) {
  const avg = (list) => {
    const s = list.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]);
    return vNorm(s);
  };
  const normal = avg(normals);
  const top = avg(tops);
  const spread = (list, ref) => {
    let worst = 0;
    for (const v of list) {
      const d = Math.acos(Math.max(-1, Math.min(1, v[0] * ref[0] + v[1] * ref[1] + v[2] * ref[2])));
      worst = Math.max(worst, d * DEG);
    }
    return worst;
  };
  return {
    ok: true,
    normal,
    top,
    samples: normals.length,
    wobble: Math.max(spread(normals, normal), spread(tops, top)),
    meanRate: rates.reduce((a, b) => a + b, 0) / Math.max(1, rates.length),
    disturbed,
  };
}

export const engine = new OrientationEngine();
