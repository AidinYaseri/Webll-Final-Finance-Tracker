/**
 * Turns the raw captures stored in a session into a finished report.
 *
 * Raw readings are what gets saved; every correction is applied here, so
 * editing the floor slope or a spec later re-derives the whole report without
 * needing to re-measure anything.
 */

import {
  WHEELS,
  wheelSide,
  wheelAxle,
  levelCamber,
  levelCaster,
  correctBarAzimuth,
  closeLoop,
  solveSweep,
  buildReport,
  mean,
  circMeanDeg,
  gradeSpec,
  toeDegToMm,
  inchToMm,
  AXLE,
} from '../math/align.js';

/** Camber per wheel, floor-levelled, averaged over the runout passes. */
export function camberValues(session) {
  const out = {};
  const raw = {};
  const spread = {};
  for (const w of WHEELS) {
    const rec = session.camber?.[w];
    if (!rec || !rec.passes?.length) continue;
    const passes = rec.passes.map((p) => p.value).filter(Number.isFinite);
    if (!passes.length) continue;
    const m = mean(passes);
    raw[w] = m;
    spread[w] = passes.length > 1 ? (Math.max(...passes) - Math.min(...passes)) / 2 : 0;
    const cross = wheelAxle(w) === AXLE.F ? session.floor?.crossFront : session.floor?.crossRear;
    out[w] = levelCamber(m, wheelSide(w), cross || 0);
  }
  return { value: out, raw, runout: spread };
}

/**
 * Wheel-plane azimuths, in one common frame.
 * Applies the bar-tilt correction, then the loop closure, then averages any
 * repeat captures of the same wheel.
 */
export function toeAzimuths(session, camber = {}) {
  const captures = (session.toe?.captures || []).slice().sort((a, b) => a.t - b.t);
  if (!captures.length) return { azimuth: {}, drift: null, captures: [] };

  const corrected = captures.map((c) => ({
    ...c,
    az: correctBarAzimuth(c.azRaw, c.barElevation, camber[c.wheel], wheelSide(c.wheel)),
  }));

  // A loop closure only makes sense when the walk ends back where it started.
  const first = corrected[0];
  const last = corrected[corrected.length - 1];
  let drift = null;
  let series = corrected;
  if (corrected.length > 2 && last.wheel === first.wheel) {
    drift = closeLoop(corrected.map((c) => ({ t: c.t, az: c.az })));
    series = corrected.map((c, i) => ({ ...c, az: drift.corrected[i] }));
  }

  const byWheel = {};
  for (const c of series) (byWheel[c.wheel] ||= []).push(c.az);
  const azimuth = {};
  for (const [w, list] of Object.entries(byWheel)) azimuth[w] = circMeanDeg(list);
  return { azimuth, drift, captures: series };
}

/**
 * Caster / SAI / included angle per front wheel from its sweep.
 *
 * The sweep is solved entirely in raw against-gravity angles, because the
 * sweep points themselves are raw. A sideways floor slope shifts every camber
 * reading of one wheel by the same amount, which the fit dumps into the
 * included angle and leaves caster and SAI untouched — so only the included
 * angle is rebuilt from the levelled camber afterwards. A fore/aft slope does
 * bias caster, and that is corrected directly.
 */
export function casterSolutions(session) {
  const cam = camberValues(session);
  const out = {};
  for (const w of ['FL', 'FR']) {
    const rec = session.caster?.[w];
    if (!rec || !(rec.points || []).length) continue;
    const c0 = Number.isFinite(rec.camber0) ? rec.camber0 : cam.raw[w];
    if (!Number.isFinite(c0)) continue;
    const sol = solveSweep(c0, rec.points, wheelSide(w));
    if (!sol) continue;
    const camberLevelled = Number.isFinite(cam.value[w]) ? cam.value[w] : c0;
    out[w] = {
      ...sol,
      caster: levelCaster(sol.caster, session.floor?.pitch || 0),
      includedAngle: sol.sai + camberLevelled,
    };
  }
  return out;
}

/** Everything a session knows, ready for the report screen. */
export function sessionReport(session, vehicle) {
  const cam = camberValues(session);
  const toe = toeAzimuths(session, cam.value);
  const caster = casterSolutions(session);
  const report = buildReport({
    camber: cam.value,
    azimuth: toe.azimuth,
    caster,
    thrustOffset: session.toe?.thrustOffset,
  });

  report.rawCamber = cam.raw;
  report.runout = cam.runout;
  report.drift = toe.drift;
  report.captures = toe.captures;
  report.sweeps = caster;

  // Tape-measure toe overrides the gyro result for that axle when present.
  const tape = session.toe?.tape;
  if (tape) {
    if (Number.isFinite(tape.front)) {
      report.toe.frontTotal = tape.front;
      report.toe.FL = tape.front / 2;
      report.toe.FR = tape.front / 2;
      report.toeReference = 'axle';
      report.tapeUsed = true;
    }
    if (Number.isFinite(tape.rear)) {
      report.toe.rearTotal = tape.rear;
      report.toe.RL = tape.rear / 2;
      report.toe.RR = tape.rear / 2;
      report.tapeUsed = true;
    }
  }

  const dia = inchToMm(vehicle?.rimDiameterIn || 17);
  report.toeMm = {
    frontTotal: toeDegToMm(report.toe.frontTotal, dia),
    rearTotal: toeDegToMm(report.toe.rearTotal, dia),
  };

  report.grades = gradeReport(report, vehicle?.specs);
  report.completeness = completeness(session);
  return report;
}

export function gradeReport(report, specs) {
  if (!specs) return {};
  return {
    FL: gradeSpec(report.camber.FL, specs.frontCamber),
    FR: gradeSpec(report.camber.FR, specs.frontCamber),
    RL: gradeSpec(report.camber.RL, specs.rearCamber),
    RR: gradeSpec(report.camber.RR, specs.rearCamber),
    frontTotalToe: gradeSpec(report.toe.frontTotal, specs.frontTotalToe),
    rearTotalToe: gradeSpec(report.toe.rearTotal, specs.rearTotalToe),
    casterFL: gradeSpec(report.caster.FL, specs.caster),
    casterFR: gradeSpec(report.caster.FR, specs.caster),
    crossCamber: gradeSpec(report.cross.frontCamber, specs.crossCamber),
    crossCaster: gradeSpec(report.cross.caster, specs.crossCaster),
  };
}

export function completeness(session) {
  const camberDone = WHEELS.filter((w) => session.camber?.[w]?.passes?.length).length;
  const toeWheels = new Set((session.toe?.captures || []).map((c) => c.wheel));
  const casterDone = ['FL', 'FR'].filter((w) => (session.caster?.[w]?.points || []).length >= 2)
    .length;
  return {
    camber: camberDone,
    toe: toeWheels.size,
    caster: casterDone,
    anything: camberDone + toeWheels.size + casterDone > 0,
  };
}

/* --------------------------------------------------------------- exporting */

export function reportToCsv(report, vehicle, session) {
  const lines = [
    ['TrueLine alignment report'],
    ['Vehicle', vehicle?.name || ''],
    ['Session', session?.label || ''],
    ['Exported', new Date().toISOString()],
    [],
    ['Measurement', 'Front left', 'Front right', 'Rear left', 'Rear right'],
    ['Camber (deg)', ...WHEELS.map((w) => num(report.camber[w]))],
    ['Individual toe (deg)', ...WHEELS.map((w) => num(report.toe[w]))],
    ['Caster (deg)', num(report.caster.FL), num(report.caster.FR), '', ''],
    ['SAI (deg)', num(report.sai.FL), num(report.sai.FR), '', ''],
    ['Included angle (deg)', num(report.includedAngle.FL), num(report.includedAngle.FR), '', ''],
    [],
    ['Front total toe (deg)', num(report.toe.frontTotal)],
    ['Rear total toe (deg)', num(report.toe.rearTotal)],
    ['Front total toe (mm)', num(report.toeMm.frontTotal)],
    ['Rear total toe (mm)', num(report.toeMm.rearTotal)],
    ['Cross camber front (deg)', num(report.cross.frontCamber)],
    ['Cross caster (deg)', num(report.cross.caster)],
    ['Toe reference', report.toeReference || ''],
    ['Gyro drift over the walk (deg)', num(report.drift?.residual, 3)],
  ];
  return lines.map((l) => l.map(csvCell).join(',')).join('\n');
}

const num = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '');
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
