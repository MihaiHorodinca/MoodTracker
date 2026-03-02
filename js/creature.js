/* creature.js — animated stem-eye creature for the left desktop sidebar */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SAMPLES = 32;          // points along the stem
  const STEM_COLOR = '#f97316'; // --clr-primary

  let svg, stemPath, eyeGroup, scleraEl, irisEl, pupilEl, specEl;
  let lidTop, lidBot;
  let startTime = null;
  let blinkTimer = null;
  let isBlinking = false;

  /* ── helpers ─────────────────────────────────────────────── */

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  /* Catmull-Rom → cubic bezier, returns SVG path d string */
  function catmullRomPath(pts) {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(i + 2, pts.length - 1)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  }

  /* ── init ────────────────────────────────────────────────── */

  function init() {
    const wrap = document.getElementById('creature-wrap');
    if (!wrap) return;
    svg = document.getElementById('creature-svg');
    if (!svg) return;

    /* glow filter */
    const defs = svgEl('defs', {});
    const filter = svgEl('filter', { id: 'stemGlow', x: '-50%', y: '-50%', width: '200%', height: '200%' });
    const blur = svgEl('feGaussianBlur', { stdDeviation: '3', result: 'blur' });
    const merge = svgEl('feMerge', {});
    const mn1 = svgEl('feMergeNode', { in: 'blur' });
    const mn2 = svgEl('feMergeNode', { in: 'SourceGraphic' });
    merge.appendChild(mn1);
    merge.appendChild(mn2);
    filter.appendChild(blur);
    filter.appendChild(merge);
    defs.appendChild(filter);
    svg.appendChild(defs);

    /* stem path */
    stemPath = svgEl('path', {
      fill: 'none',
      stroke: STEM_COLOR,
      'stroke-width': '3.5',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      filter: 'url(#stemGlow)',
      opacity: '0.9',
    });
    svg.appendChild(stemPath);

    /* eye group */
    eyeGroup = svgEl('g', { id: 'creature-eye' });

    scleraEl = svgEl('ellipse', {
      rx: '18', ry: '14',
      fill: '#f5efe0',
      filter: 'url(#stemGlow)',
    });

    irisEl = svgEl('ellipse', {
      rx: '10', ry: '10',
      fill: STEM_COLOR,
      opacity: '0.9',
    });

    pupilEl = svgEl('circle', {
      r: '5',
      fill: '#0a0a0a',
    });

    specEl = svgEl('circle', {
      r: '2',
      fill: 'rgba(255,255,255,0.75)',
      cx: '2', cy: '-2',
    });

    /* eyelids — drawn as filled arcs that slide to cover the eye */
    lidTop = svgEl('ellipse', {
      rx: '18', ry: '14',
      fill: '#141414',       /* matches --clr-surface */
      'transform-origin': '0 -14',
      style: 'transform: scaleY(0);',
    });

    lidBot = svgEl('ellipse', {
      rx: '18', ry: '14',
      fill: '#141414',
      'transform-origin': '0 14',
      style: 'transform: scaleY(0);',
    });

    pupilEl.appendChild(specEl);
    irisEl.appendChild(pupilEl);
    eyeGroup.appendChild(scleraEl);
    eyeGroup.appendChild(irisEl);
    eyeGroup.appendChild(lidTop);
    eyeGroup.appendChild(lidBot);
    svg.appendChild(eyeGroup);

    scheduleBlink();
    requestAnimationFrame(tick);
  }

  /* ── animation loop ──────────────────────────────────────── */

  function tick(ts) {
    if (!startTime) startTime = ts;
    const t = (ts - startTime) / 1000; // seconds

    const wrap = document.getElementById('creature-wrap');
    if (!wrap) return;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;

    if (W < 60 || H < 100) {
      requestAnimationFrame(tick);
      return;
    }

    /* stem parameters */
    const stemHeight = H * 0.72;
    const rootX = W * 0.62;   // root near right edge (leans toward app)
    const rootY = H;

    /* sample stem points from root (s=0) to tip (s=1) */
    const pts = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const s = i / SAMPLES;           // 0 = root, 1 = tip
      const y = rootY - s * stemHeight;

      /* two sine waves create the winding */
      const A1 = W * 0.28, f1 = 1.4, spd1 = 0.28;
      const A2 = W * 0.12, f2 = 3.1, spd2 = 0.51;
      const waveX = A1 * Math.sin(f1 * s * Math.PI * 2 + t * spd1)
                  + A2 * Math.sin(f2 * s * Math.PI * 2 + t * spd2);

      pts.push({ x: rootX + waveX, y });
    }

    stemPath.setAttribute('d', catmullRomPath(pts));

    /* tip & tangent */
    const tip = pts[SAMPLES];
    const prev = pts[SAMPLES - 1];
    const dx = tip.x - prev.x;
    const dy = tip.y - prev.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI + 90; // rotate so "up" aligns

    /* pupil offset follows stem tangent + slow wander */
    const wanderX = 3.5 * Math.sin(t * 0.37);
    const wanderY = 2.5 * Math.cos(t * 0.53);
    const normLen = Math.sqrt(dx * dx + dy * dy) || 1;
    const pupilMaxOffset = 6;
    const pOffX = (dx / normLen) * pupilMaxOffset + wanderX;
    const pOffY = (dy / normLen) * pupilMaxOffset + wanderY;

    /* position eye group at tip */
    eyeGroup.setAttribute('transform', `translate(${tip.x}, ${tip.y}) rotate(${angle})`);
    pupilEl.setAttribute('cx', pOffX);
    pupilEl.setAttribute('cy', pOffY);
    specEl.setAttribute('cx', pOffX + 2);
    specEl.setAttribute('cy', pOffY - 2);

    requestAnimationFrame(tick);
  }

  /* ── blinking ────────────────────────────────────────────── */

  function doBlink() {
    if (isBlinking) return;
    isBlinking = true;

    const DUR = 200; // ms for one lid to close
    const HOLD = 80;
    const steps = 12;

    let frame = 0;
    function closeStep() {
      if (frame > steps) {
        // hold closed briefly then open
        setTimeout(openLids, HOLD);
        return;
      }
      const progress = frame / steps;
      const s = Math.sin(progress * Math.PI / 2); // ease in
      lidTop.style.transform = `scaleY(${s})`;
      lidBot.style.transform = `scaleY(${s})`;
      frame++;
      setTimeout(closeStep, DUR / steps);
    }

    function openLids() {
      let f = steps;
      function openStep() {
        if (f < 0) {
          lidTop.style.transform = 'scaleY(0)';
          lidBot.style.transform = 'scaleY(0)';
          isBlinking = false;
          scheduleBlink();
          return;
        }
        const progress = f / steps;
        const s = Math.sin(progress * Math.PI / 2);
        lidTop.style.transform = `scaleY(${s})`;
        lidBot.style.transform = `scaleY(${s})`;
        f--;
        setTimeout(openStep, DUR / steps);
      }
      openStep();
    }

    closeStep();
  }

  function scheduleBlink() {
    if (blinkTimer) clearTimeout(blinkTimer);
    blinkTimer = setTimeout(doBlink, rand(3000, 7500));
  }

  /* ── bootstrap ───────────────────────────────────────────── */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
