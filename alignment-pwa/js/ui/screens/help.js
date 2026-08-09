import { h } from '../dom.js';
import { card, banner, stepList, button } from '../components.js';

export function helpScreen(ctx) {
  const node = h('div.screen');

  node.appendChild(
    card(
      'What you need',
      stepList([
        'A phone with a gyroscope — almost anything from the last ten years.',
        'A straight-edge a bit longer than your rims: a 600 mm spirit level, a length of aluminium angle, or a flat board. Only toe needs it.',
        'Tape or a rubber band to hold the phone on the straight-edge, and something to keep it there for the whole toe walk.',
        'Ground that is flat-ish. It does not have to be level — the app can measure and subtract the slope.',
        'Optional: a tape measure, for the no-gyro toe method and the thrust angle.',
      ]),
      banner('info', 'No purpose-made adapter, no dongle, no subscription. If you own a spirit level you already own the hardware.'),
    ),
  );

  node.appendChild(
    card(
      'Camber — the easy one',
      h('p', 'Camber is how far the top of the wheel leans in or out. It is pure gravity: stand the phone against the rim lip, and the accelerometer tells you how far the wheel plane is off vertical.'),
      camberDiagram(),
      h('p', 'The phone only has to touch the rim at two points on the same vertical line — twelve and six o’clock. Rotating it about that line changes nothing in the reading, so you can hold it however is comfortable. What does matter is that the rim lip is clean: a lump of brake dust under one corner is a real angle error.'),
      banner('good', 'Turn on the two-pass option and the app will ask you to roll the car half a wheel turn and measure again. Averaging the two cancels a bent or dirty rim almost completely.'),
    ),
  );

  node.appendChild(
    card(
      'Toe — the interesting one',
      h('p', 'Toe is the angle between two wheels, and no single sensor can see two wheels at once. A magnetic compass is useless here: a car is a large steel object and it bends the earth’s field by whole degrees.'),
      h('p', 'So the app uses the gyroscope as a memory instead. Lay the straight-edge across a rim so it touches the lip at the front and the back of the wheel, put the phone on it, and capture. The heading of that bar is the heading of the wheel plane. Then carry the phone to the next wheel: the gyroscope keeps count of every degree you turn on the way, so the second heading is measured in the same frame as the first. The difference between them is the toe.'),
      toeDiagram(),
      h('p', 'Two things make that trustworthy. First, the phone never leaves the bar, so however crooked it sits on the bar, that error is identical at all four wheels and cancels when the app subtracts one heading from another. Second, the walk ends back at the wheel it started on: whatever heading has quietly leaked away in between is measured directly and spread back over the captures in proportion to time.'),
      banner('warn', 'Do not adjust the phone on the bar mid-walk, and do not touch the steering wheel. Both quietly break the assumptions above.'),
    ),
  );

  node.appendChild(
    card(
      'Caster — measured, not seen',
      h('p', 'Caster is the backwards lean of the steering axis, and nothing on the outside of the car points along it. Every alignment machine gets it the same indirect way: steer the wheel one way, then the other, and watch what the camber does. A wheel on a leaning axis tips as it turns, and how much it tips tells you the lean.'),
      casterDiagram(),
      h('p', 'The phone stays on the rim exactly as for camber, so it sees both things at once — how far the wheel has steered, and what the camber is doing at that angle. Most tools demand exactly twenty degrees each way; this one fits the curve to whatever angles you actually reached, so “about twenty, near enough” is fine, and a third point makes it better rather than being ignored.'),
      h('p', 'The same fit gives steering axis inclination and the included angle for free. Comparing the included angle left to right is the standard way to spot a bent knuckle: if camber differs between the sides but the included angles match, the parts are straight and something is merely adjusted wrong.'),
    ),
  );

  node.appendChild(
    card(
      'Sloping ground',
      h('p', 'Camber and caster are angles against gravity, so a driveway that falls away sideways adds itself straight into every reading. Lay the phone flat on the ground between a pair of wheels with the top edge pointing at the car’s right-hand side, capture, and the app subtracts that slope from that axle. A second capture with the top edge pointing forwards does the same for caster.'),
      banner('info', 'Toe is not affected by ground slope, which is why it is worth measuring even on a bad surface.'),
    ),
  );

  node.appendChild(
    card(
      'The thrust line, and what the phone cannot know',
      h('p', 'Front toe should be measured against the direction the rear axle actually points — the thrust line — not against the car’s centreline. Get that wrong and the car tracks straight with the steering wheel off centre. Because the walk includes both rear wheels, the app has the thrust line and reports front toe against it.'),
      h('p', 'What wheel headings alone cannot give you is the angle between that thrust line and the car’s geometric centreline, because nothing in the measurement knows where the body is. If you want that number, measure it with a tape:'),
      stepList([
        'Drop a plumb line from the same reference point on each side of the car — a jacking point or a suspension pivot — front and rear, and mark the floor.',
        'Measure diagonally: front-left mark to rear-right mark, and front-right to rear-left.',
        'A difference between the two diagonals means the rear axle is not square to the body.',
        'Thrust angle ≈ (difference between the diagonals) ÷ (2 × wheelbase), in radians — multiply by 57.3 for degrees. Type the result into the Report screen.',
      ]),
    ),
  );

  node.appendChild(
    card(
      'How accurate is this really',
      h('p', 'The honest answer is that repeatability is easy to check and you should check it: measure a wheel, take the phone away, put it back, measure again. The spread you see is what the number is worth on your car, your rims and your phone.'),
      stepList([
        'Camber typically repeats within a few hundredths of a degree — the accelerometer is the good sensor in a phone.',
        'Toe depends on gyro drift and on how square the bar sits. The drift test on the Setup screen tells you which half of that you are dealing with.',
        'Caster is the noisiest, because it is inferred from small camber changes. Bigger sweeps and a third point help.',
        'A proper rack still wins on speed, on repeatability, and on knowing where the car’s body is. This gets you close enough to set toe properly, to check camber after a suspension change, and to know whether a shop’s printout is plausible.',
      ]),
      banner('warn', 'Chock the wheels, work on solid ground, and never get under a car held up by a jack. Re-torque anything you loosen, and re-check the alignment after the first few miles.'),
    ),
  );

  node.appendChild(
    card(
      'Where this came from',
      h('p', 'The idea of using a phone as an alignment head is not new — Gyraline built a product around it with a rim adapter and, in its newer version, a dedicated sensor board. This app takes the same physics in a different direction: no hardware to buy, corrections for the things a garage floor actually does to a measurement, a loop closure that measures its own drift instead of hoping there is none, and a tie-rod calculator that learns your car rather than assuming a thread pitch.'),
      button('Back to the start', { kind: 'primary', onclick: () => ctx.go('') }),
    ),
  );

  return node;
}

/* ------------------------------------------------------------- diagrams */

function svg(viewBox, ...kids) {
  return h('div.diagram', h('svg', { viewBox, role: 'img' }, ...kids));
}

function camberDiagram() {
  return svg(
    '0 0 300 170',
    h('line.dg-ground', { x1: 20, y1: 150, x2: 280, y2: 150 }),
    h('g', { transform: 'rotate(-6 150 100)' },
      h('ellipse.dg-tyre', { cx: 150, cy: 95, rx: 34, ry: 56 }),
      h('ellipse.dg-rim', { cx: 150, cy: 95, rx: 20, ry: 38 }),
      h('rect.dg-phone', { x: 176, y: 62, width: 12, height: 66, rx: 3 }),
      h('line.dg-plane', { x1: 150, y1: 25, x2: 150, y2: 165 }),
    ),
    h('line.dg-vert', { x1: 150, y1: 20, x2: 150, y2: 160 }),
    h('text.dg-label', { x: 196, y: 60 }, 'phone'),
    h('text.dg-label', { x: 158, y: 30 }, 'camber'),
    h('text.dg-label', { x: 24, y: 145 }, 'ground'),
  );
}

function toeDiagram() {
  return svg(
    '0 0 300 190',
    h('text.dg-label', { x: 150, y: 14, 'text-anchor': 'middle' }, 'seen from above · front of car at the top'),
    ...[
      [70, 'L', 3],
      [230, 'R', -3],
    ].flatMap(([x, side, toe]) => [
      h('g', { transform: `rotate(${toe * 4} ${x} 100)` },
        h('rect.dg-tyre-top', { x: x - 14, y: 45, width: 28, height: 110, rx: 8 }),
        h('line.dg-bar', { x1: x - 4, y1: 40, x2: x - 4, y2: 160 }),
        h('rect.dg-phone', { x: x - 12, y: 88, width: 16, height: 28, rx: 3 }),
        h('line.dg-heading', { x1: x, y1: 45, x2: x, y2: 18 }),
      ),
      h('text.dg-label', { x, y: 178, 'text-anchor': 'middle' }, side === 'L' ? 'left wheel' : 'right wheel'),
    ]),
    h('line.dg-vert', { x1: 150, y1: 20, x2: 150, y2: 170 }),
    h('text.dg-label', { x: 150, y: 100, 'text-anchor': 'middle' }, 'toe = the angle between the two headings'),
  );
}

function casterDiagram() {
  return svg(
    '0 0 300 170',
    h('line.dg-ground', { x1: 20, y1: 150, x2: 280, y2: 150 }),
    h('circle.dg-tyre', { cx: 150, cy: 100, r: 48 }),
    h('line.dg-axis', { x1: 176, y1: 36, x2: 138, y2: 152 }),
    h('line.dg-vert', { x1: 150, y1: 30, x2: 150, y2: 155 }),
    h('text.dg-label', { x: 182, y: 32 }, 'steering axis'),
    h('text.dg-label', { x: 156, y: 26 }, 'caster'),
    h('text.dg-label', { x: 24, y: 145 }, 'side view'),
  );
}
