/** App shell: routing, header status, bottom navigation. */

import { h, render, clear } from './ui/dom.js';
import { store } from './core/store.js';
import { engine } from './sensors/orientation.js';
import { sensorState } from './ui/live.js';
import { keepAwake } from './core/feedback.js';

import { homeScreen } from './ui/screens/home.js';
import { camberScreen } from './ui/screens/camber.js';
import { toeScreen } from './ui/screens/toe.js';
import { casterScreen } from './ui/screens/caster.js';
import { reportScreen } from './ui/screens/report.js';
import { adjustScreen } from './ui/screens/adjust.js';
import { vehicleScreen } from './ui/screens/vehicle.js';
import { setupScreen } from './ui/screens/setup.js';
import { helpScreen } from './ui/screens/help.js';

const ROUTES = {
  '': homeScreen,
  camber: camberScreen,
  toe: toeScreen,
  caster: casterScreen,
  report: reportScreen,
  adjust: adjustScreen,
  vehicle: vehicleScreen,
  setup: setupScreen,
  help: helpScreen,
};

const TABS = [
  ['', 'Home', 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z'],
  ['camber', 'Camber', 'M4 18h16M8 6l3 12M16 6l-3 12'],
  ['toe', 'Toe', 'M7 20V7l3-3M17 20V7l-3-3M4 20h16'],
  ['caster', 'Caster', 'M12 4v16M6 8a8 8 0 0 0 0 8M18 8a8 8 0 0 1 0 8'],
  ['report', 'Report', 'M6 3h9l5 5v13H6zM14 3v6h6M9 13h7M9 17h5'],
];

let leaveFns = [];
let main;
let statusEl;

function currentPath() {
  return location.hash.replace(/^#\/?/, '').split('/');
}

export function go(hash) {
  location.hash = hash.startsWith('#') ? hash : `#/${hash}`;
}

function navigate() {
  for (const fn of leaveFns) {
    try {
      fn();
    } catch (err) {
      /* ignore */
    }
  }
  leaveFns = [];

  const [path, ...params] = currentPath();
  const screen = ROUTES[path] || homeScreen;
  const ctx = {
    go,
    params,
    onLeave: (fn) => leaveFns.push(fn),
    refresh: () => navigate(),
  };
  try {
    render(main, screen(ctx));
  } catch (err) {
    console.error(err);
    render(
      main,
      h('div.card', h('h2.card-title', 'Something went wrong'), h('pre.pre', String(err && err.stack ? err.stack : err))),
    );
  }
  for (const el of document.querySelectorAll('.tab')) {
    el.classList.toggle('active', el.dataset.path === path);
  }
  keepAwake(['camber', 'toe', 'caster'].includes(path));
  document.title = path ? `TrueLine — ${path}` : 'TrueLine Alignment';
}

function buildShell() {
  const app = document.getElementById('app');
  clear(app);

  statusEl = h('button.status', {
    type: 'button',
    onclick: () => go('setup'),
    title: 'Sensor status',
  });

  const header = h(
    'header.top',
    h(
      'div.top-left',
      h('span.logo', 'TRUE', h('span.logo-accent', 'LINE')),
      h('button.vehicle-pill', { type: 'button', onclick: () => go('vehicle') }, store.vehicle?.name || 'Vehicle'),
    ),
    statusEl,
  );

  main = h('main#view.view');

  const nav = h(
    'nav.tabs',
    ...TABS.map(([path, label, d]) =>
      h(
        'button.tab',
        { type: 'button', dataset: { path }, onclick: () => go(path || '') },
        h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d })),
        h('span', label),
      ),
    ),
  );

  app.append(header, main, nav);

  store.subscribe(() => {
    const pill = document.querySelector('.vehicle-pill');
    if (pill) pill.textContent = store.vehicle?.name || 'Vehicle';
  });
}

function statusText(frame) {
  if (!sensorState.started) return ['Sensors off', 'warn'];
  if (!frame) return ['Starting…', 'warn'];
  if (frame.still) return ['Still', 'good'];
  if (frame.rateMag > 60) return ['Moving fast', 'warn'];
  return [`${frame.rateMag.toFixed(0)}°/s`, 'idle'];
}

function wireStatus() {
  let last = 0;
  engine.subscribe((frame) => {
    if (frame.t - last < 120) return;
    last = frame.t;
    const [text, kind] = statusText(frame);
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = `status status-${kind}`;
  });
  const paint = () => {
    if (!statusEl) return;
    const [text, kind] = statusText(null);
    if (!sensorState.started) {
      statusEl.textContent = text;
      statusEl.className = `status status-${kind}`;
    }
  };
  paint();
  setInterval(paint, 1500);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW failed', err));
  });
}

buildShell();
wireStatus();
window.addEventListener('hashchange', navigate);
navigate();
registerServiceWorker();
