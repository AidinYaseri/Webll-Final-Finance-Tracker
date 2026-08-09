/**
 * Local-only persistence. Everything lives in localStorage: no account, no
 * network, no telemetry. Export/import gives the user their data as a file.
 */

import { DEFAULT_SPECS } from '../math/align.js';

const KEY = 'trueline.v1';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const DEFAULT_SETTINGS = {
  screenFacesOut: true, // phone back against the rim, screen readable
  autoCapture: true,
  voice: true,
  haptics: true,
  sweepTarget: 20, // degrees of steer each way for a caster sweep
  toeUnit: 'deg', // 'deg' | 'mm'
  captureMs: 1200,
  runoutPasses: 1, // 2 = measure, roll 180 degrees, measure again
};

function blankState() {
  return { version: 1, vehicles: [], sessions: [], activeVehicle: null, settings: { ...DEFAULT_SETTINGS } };
}

function migrate(raw) {
  const s = { ...blankState(), ...raw };
  s.settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
  s.vehicles = (raw.vehicles || []).map((v) => ({
    ...newVehicle(v.name),
    ...v,
    specs: { ...DEFAULT_SPECS, ...(v.specs || {}) },
  }));
  // Imported or older sessions may be missing whole branches; fill them in so
  // the screens can read them without defensive checks everywhere.
  s.sessions = (raw.sessions || []).map((sess) => {
    const base = newSession(sess.vehicleId);
    return {
      ...base,
      ...sess,
      floor: { ...base.floor, ...(sess.floor || {}) },
      camber: sess.camber || {},
      toe: { ...base.toe, ...(sess.toe || {}) },
      caster: sess.caster || {},
    };
  });
  return s;
}

export function newVehicle(name = 'My car') {
  return {
    id: uid(),
    name,
    notes: '',
    rimDiameterIn: 17,
    specs: structuredClone(DEFAULT_SPECS),
    tieRod: { perTurn: null, pitchMm: 1.5, armMm: 140, threads: 1, learnedAt: null },
    createdAt: Date.now(),
  };
}

export function newSession(vehicleId) {
  return {
    id: uid(),
    vehicleId,
    startedAt: Date.now(),
    label: new Date().toLocaleString(),
    note: '',
    floor: { crossFront: 0, crossRear: 0, pitch: 0 },
    camber: {}, // wheel -> { value, raw, wobble, passes: [] }
    toe: { captures: [], azimuth: {}, drift: null, tape: null, thrustOffset: null },
    caster: {}, // wheel -> { camber0, points: [], solution }
    ackermann: null,
  };
}

class Store {
  constructor() {
    this.state = blankState();
    this._subs = new Set();
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.state = migrate(JSON.parse(raw));
    } catch (err) {
      console.warn('Could not read saved data, starting fresh.', err);
      this.state = blankState();
    }
    if (!this.state.vehicles.length) {
      const v = newVehicle('My car');
      this.state.vehicles.push(v);
      this.state.activeVehicle = v.id;
      this.save();
    }
    if (!this.state.activeVehicle) this.state.activeVehicle = this.state.vehicles[0].id;
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch (err) {
      console.warn('Save failed', err);
    }
    for (const fn of this._subs) fn(this.state);
  }

  subscribe(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }

  /* ------------------------------------------------------------- vehicles */

  get vehicle() {
    return this.state.vehicles.find((v) => v.id === this.state.activeVehicle) || null;
  }

  addVehicle(name) {
    const v = newVehicle(name);
    this.state.vehicles.push(v);
    this.state.activeVehicle = v.id;
    this.save();
    return v;
  }

  updateVehicle(id, patch) {
    const v = this.state.vehicles.find((x) => x.id === id);
    if (!v) return null;
    Object.assign(v, patch);
    this.save();
    return v;
  }

  removeVehicle(id) {
    this.state.vehicles = this.state.vehicles.filter((v) => v.id !== id);
    this.state.sessions = this.state.sessions.filter((s) => s.vehicleId !== id);
    if (this.state.activeVehicle === id)
      this.state.activeVehicle = this.state.vehicles[0]?.id || null;
    if (!this.state.vehicles.length) this.addVehicle('My car');
    this.save();
  }

  selectVehicle(id) {
    this.state.activeVehicle = id;
    this.save();
  }

  /* ------------------------------------------------------------- sessions */

  get session() {
    const v = this.vehicle;
    if (!v) return null;
    let s = this.state.sessions.find((x) => x.id === this.state.activeSession);
    if (!s || s.vehicleId !== v.id) {
      s = this.sessionsFor(v.id)[0];
      if (!s) s = this.startSession();
      this.state.activeSession = s.id;
    }
    return s;
  }

  startSession() {
    const v = this.vehicle;
    if (!v) return null;
    const s = newSession(v.id);
    this.state.sessions.unshift(s);
    this.state.activeSession = s.id;
    this.save();
    return s;
  }

  selectSession(id) {
    this.state.activeSession = id;
    this.save();
  }

  sessionsFor(vehicleId) {
    return this.state.sessions
      .filter((s) => s.vehicleId === vehicleId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  removeSession(id) {
    this.state.sessions = this.state.sessions.filter((s) => s.id !== id);
    if (this.state.activeSession === id) this.state.activeSession = null;
    this.save();
  }

  patchSession(patch) {
    const s = this.session;
    if (!s) return null;
    Object.assign(s, patch);
    this.save();
    return s;
  }

  /* ------------------------------------------------------------- settings */

  setSetting(key, value) {
    this.state.settings[key] = value;
    this.save();
  }

  /* --------------------------------------------------------- import/export */

  export() {
    return JSON.stringify(this.state, null, 2);
  }

  import(json) {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.vehicles))
      throw new Error('That file is not a TrueLine backup.');
    this.state = migrate(parsed);
    this.save();
  }

  reset() {
    this.state = blankState();
    this.load();
    this.save();
  }
}

export const store = new Store();
