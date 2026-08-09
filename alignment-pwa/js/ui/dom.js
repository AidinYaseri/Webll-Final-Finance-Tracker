/** Tiny hyperscript. No framework, no build step. */

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'circle', 'rect', 'line', 'text', 'polygon', 'polyline',
  'ellipse', 'defs', 'linearGradient', 'stop', 'tspan', 'use', 'clipPath',
]);

/**
 * h('div.card#main', { onclick }, child, [child, ...])
 * Strings become text nodes; null/false/undefined are skipped.
 */
export function h(spec, props, ...children) {
  const m = /^([a-zA-Z][a-zA-Z0-9]*)?([.#][^\s]*)?$/.exec(spec) || [];
  const tag = m[1] || 'div';
  const el = SVG_TAGS.has(tag)
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);

  const rest = m[2] || '';
  const classes = [];
  let idPart = '';
  for (const token of rest.split(/(?=[.#])/)) {
    if (token.startsWith('.')) classes.push(token.slice(1));
    else if (token.startsWith('#')) idPart = token.slice(1);
  }
  if (classes.length) el.setAttribute('class', classes.join(' '));
  if (idPart) el.id = idPart;

  if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') {
        el.setAttribute('class', [...classes, v].join(' '));
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else if (k === 'dataset') {
        Object.assign(el.dataset, v);
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2), v);
      } else if (k === 'html') {
        el.innerHTML = v;
      } else if (k in el && !SVG_TAGS.has(tag) && typeof v !== 'object') {
        el[k] = v;
      } else {
        el.setAttribute(k, v === true ? '' : v);
      }
    }
  } else if (props != null) {
    children.unshift(props);
  }

  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(4)) {
    if (c == null || c === false || c === '') continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

/** Replace the contents of `host` with `node`, scrolled back to the top. */
export function render(host, node) {
  clear(host);
  host.appendChild(node);
  host.scrollTop = 0;
  return node;
}
