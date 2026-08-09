/**
 * End-to-end smoke test: boots the real app in Chromium, feeds it synthetic
 * motion events, and checks that a known phone attitude comes out of the other
 * end as the right camber reading.
 *
 * Skips itself when Playwright is not installed.
 *
 *   npm run test:browser
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;

async function loadChromium() {
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const req = createRequire(import.meta.url);
  for (const spec of ['playwright', 'playwright-core']) {
    for (const load of [
      () => import(spec),
      () => import(pathToFileURL(req.resolve(spec)).href), // npm -g / NODE_PATH
    ]) {
      try {
        const mod = await load();
        const browser = mod.chromium || mod.default?.chromium;
        if (browser) return browser;
      } catch {
        /* try the next candidate */
      }
    }
  }
  return null;
}

const chromium = await loadChromium();
if (!chromium) console.log('playwright not installed — skipping browser tests');

const opts = { skip: chromium ? false : 'playwright is not installed' };

async function withApp(run) {
  const server = spawn(process.execPath, [join(ROOT, 'tools', 'serve.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  const browser = await chromium.launch();
  try {
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`${BASE}/index.html`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await run(page, errors);
    await context.close();
  } finally {
    await browser.close();
    server.kill();
  }
}

/**
 * Pump synthetic deviceorientation/devicemotion at ~60 Hz for `ms`.
 * `yawRate` (deg/s about the device z axis) is fed as a real gyro signal,
 * because that is the only thing the app lets change its heading.
 */
async function feedAttitude(page, { beta = 90, gamma = 0, yawRate = 0 }, ms) {
  await page.evaluate(
    async ([beta, gamma, yawRate, ms]) => {
      const { qFromEuler, qRotateInv } = await import('/js/math/quat.js');
      const up = qRotateInv(qFromEuler(0, beta, gamma), [0, 0, 1]);
      const end = performance.now() + ms;
      return new Promise((resolve) => {
        const tick = () => {
          window.dispatchEvent(
            new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta, gamma }),
          );
          window.dispatchEvent(
            new DeviceMotionEvent('devicemotion', {
              rotationRate: { alpha: yawRate, beta: 0, gamma: 0 },
              accelerationIncludingGravity: {
                x: up[0] * 9.81,
                y: up[1] * 9.81,
                z: up[2] * 9.81,
              },
              interval: 16,
            }),
          );
          if (performance.now() < end) requestAnimationFrame(tick);
          else resolve();
        };
        tick();
      });
    },
    [beta, gamma, yawRate, ms],
  );
}

test('the shell boots and every tab renders without errors', opts, async () => {
  await withApp(async (page, errors) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    assert.ok(await page.locator('.logo').count(), 'header did not render');
    for (const route of ['camber', 'toe', 'caster', 'report', 'adjust', 'vehicle', 'setup', 'help', '']) {
      await page.goto(`${BASE}/#/${route}`);
      await page.waitForTimeout(120);
      assert.ok(await page.locator('.screen').count(), `route ${route} rendered nothing`);
    }
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
  });
});

test('a known attitude produces the matching camber reading', opts, async () => {
  await withApp(async (page, errors) => {
    await page.goto(`${BASE}/#/camber`, { waitUntil: 'networkidle' });
    const enable = page.getByRole('button', { name: /enable motion sensors/i });
    if (await enable.count()) await enable.click();

    // beta = 92 stands the phone up and leans it 2 degrees away: with the
    // screen facing out of the car that is +2.00 degrees of camber.
    await feedAttitude(page, { beta: 92 }, 3000);

    const shown = await page.locator('.reading-value').first().textContent();
    const value = parseFloat(String(shown).replace('−', '-').replace('+', ''));
    assert.ok(Number.isFinite(value), `no numeric reading, saw "${shown}"`);
    assert.ok(Math.abs(value - 2) < 0.25, `expected about +2.00 deg of camber, got ${value}`);

    // Auto-capture should have banked it against the front-left wheel.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('trueline.v1')));
    const passes = stored.sessions[0].camber?.FL?.passes || [];
    assert.ok(passes.length >= 1, 'auto capture did not store a pass');
    assert.ok(Math.abs(passes[0].value - 2) < 0.25, `stored ${passes[0].value}`);
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
  });
});

test('a toe walk records five captures and closes the loop', opts, async () => {
  await withApp(async (page, errors) => {
    await page.goto(`${BASE}/#/toe`, { waitUntil: 'networkidle' });
    const enable = page.getByRole('button', { name: /enable motion sensors/i });
    if (await enable.count()) await enable.click();

    const count = () =>
      page.evaluate(
        () =>
          (JSON.parse(localStorage.getItem('trueline.v1') || '{}').sessions?.[0]?.toe?.captures || [])
            .length,
      );
    /** Feed stillness until auto-capture has banked `want` captures. */
    const settleUntil = async (want) => {
      for (let i = 0; i < 20; i++) {
        await feedAttitude(page, { beta: 0 }, 500);
        if ((await count()) >= want) return;
      }
    };

    await settleUntil(1); // lying flat and still: wheel 1 lands on its own
    for (let i = 2; i <= 5; i++) {
      await feedAttitude(page, { beta: 0, yawRate: 60 }, 700); // walk to the next wheel
      await settleUntil(i);
    }

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('trueline.v1')));
    const captures = stored.sessions[0].toe.captures;
    assert.equal(captures.length, 5, `expected a full walk, got ${captures.length} captures`);
    assert.deepEqual(
      captures.map((c) => c.wheel),
      ['FL', 'RL', 'RR', 'FR', 'FL'],
      'walk order',
    );
    // Each leg turned roughly 60 deg/s for 0.7 s. Timing in a browser is loose,
    // so this only checks the integration is live and in the right ballpark.
    for (let i = 1; i < captures.length; i++) {
      const step = Math.abs(captures[i].azRaw - captures[i - 1].azRaw);
      assert.ok(step > 10 && step < 90, `leg ${i} moved ${step.toFixed(1)} deg`);
    }
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
  });
});
