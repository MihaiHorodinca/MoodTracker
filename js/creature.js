/* creature.js — reusable Creature class + single-loop orchestrator
 *
 * To add more creatures, push an entry into CREATURE_DEFS below.
 * Each instance manages its own SVG elements, animation state, and blink timer.
 * One shared requestAnimationFrame loop drives all instances.
 */
(function () {
  'use strict';

  /* ── config ───────────────────────────────────────────────────────────────── */

  const CREATURE_DEFS = [
    {
      name:           'Fernwick',
      color:          '#f97316',   // --clr-primary
      rootXFrac:      0.68,        // horizontal root position within the column (0=left edge)
      rootYFrac:      1.0,         // vertical root (1.0 = bottom edge of column)
      stemHeightFrac: 0.72,        // stem reaches this fraction of column height
      timeOffset:     0,           // phase offset so multiple creatures don't sync
    },
    // add more here, e.g.:
    // { name: 'Mossling', color: '#86efac', rootXFrac: 0.4, rootYFrac: 0.95, stemHeightFrac: 0.45, timeOffset: 4 },
  ];

  /* ── constants ────────────────────────────────────────────────────────────── */

  const SVG_NS  = 'http://www.w3.org/2000/svg';
  const SAMPLES = 30;   // stem sample count — determines segment count

  /* ── shared helpers ───────────────────────────────────────────────────────── */

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  }

  function rand(min, max) { return min + Math.random() * (max - min); }
  function lerp(a, b, t)  { return a + (b - a) * t; }
  function f(n)            { return n.toFixed(2); }

  /* Ensures exactly one <defs><filter id="cGlow"> exists in the SVG */
  function ensureGlowFilter(svg) {
    if (svg.querySelector('#cGlow')) return;
    let defs = svg.querySelector('defs');
    if (!defs) { defs = svgEl('defs', {}); svg.prepend(defs); }
    const filter = svgEl('filter', {
      id: 'cGlow', x: '-60%', y: '-60%', width: '220%', height: '220%',
    });
    const blur = svgEl('feGaussianBlur', { stdDeviation: '3', result: 'glow' });
    const merge = svgEl('feMerge', {});
    merge.appendChild(svgEl('feMergeNode', { in: 'glow' }));
    merge.appendChild(svgEl('feMergeNode', { in: 'SourceGraphic' }));
    filter.appendChild(blur);
    filter.appendChild(merge);
    defs.appendChild(filter);
  }

  /* ── Creature class ───────────────────────────────────────────────────────── */

  class Creature {
    constructor(svg, opts, idx) {
      this._svg           = svg;
      this.name           = opts.name           ?? 'Unnamed';
      this.color          = opts.color          ?? '#f97316';
      this._rootXFrac     = opts.rootXFrac      ?? 0.65;
      this._rootYFrac     = opts.rootYFrac      ?? 1.0;
      this._stemHFrac     = opts.stemHeightFrac ?? 0.70;
      this._timeOffset    = opts.timeOffset     ?? 0;
      this._id            = `cr${idx}`;

      /* animation state */
      this._isBlinking    = false;
      this._blinkTimer    = null;

      /* SVG element refs (populated by _build) */
      this._segments      = [];   // <line> elements for tapered stem
      this._leaves        = [];   // { el, sFrac, side }
      this._eyeGroup      = null; // outer <g>: receives translate+rotate each tick
      this._eyeContent    = null; // inner <g>: scaleY-animated for blink
      this._pupilEl       = null;
      this._specEl        = null;
      this._labelEl       = null;

      this._build();
      this._scheduleBlink();
    }

    /* ── build (runs once) ──────────────────────────────────────────────────── */

    _build() {
      const svg   = this._svg;
      const color = this.color;

      /* root <g> for this creature — keeps z-order: segments → leaves → eye → label */
      const root = svgEl('g', { id: this._id });
      svg.appendChild(root);

      /* stem: SAMPLES pre-created <line> segments, width set per-tick */
      for (let i = 0; i < SAMPLES; i++) {
        const seg = svgEl('line', {
          stroke:         color,
          'stroke-linecap': 'round',
          filter:         'url(#cGlow)',
          opacity:        '0.88',
        });
        root.appendChild(seg);
        this._segments.push(seg);
      }

      /* leaves: 3 pairs (left + right) at s = 0.28, 0.52, 0.70 */
      /* leaf shape: pointed almond, base at (0,0), tip at (0,-26) */
      const LEAF_D = 'M 0 0 C 10 -6 10 -20 0 -26 C -10 -20 -10 -6 0 0 Z';
      for (const sFrac of [0.28, 0.52, 0.70]) {
        for (const side of [-1, 1]) {
          const leaf = svgEl('path', {
            d:       LEAF_D,
            fill:    color,
            opacity: '0.48',
          });
          root.appendChild(leaf);
          this._leaves.push({ el: leaf, sFrac, side });
        }
      }

      /* eye: outer group (translate + rotate), inner group (scaleY blink) */
      const eyeGroup = svgEl('g', {});

      const eyeContent = svgEl('g', {});
      Object.assign(eyeContent.style, {
        transformBox:    'fill-box',
        transformOrigin: 'center',
        transform:       'scaleY(1)',
      });

      const sclera = svgEl('ellipse', {
        rx: 18, ry: 14,
        fill:   '#f0ebe0',
        filter: 'url(#cGlow)',
      });

      const iris = svgEl('ellipse', {
        rx: 10, ry: 10,
        fill:    color,
        opacity: '0.92',
      });

      const pupil = svgEl('circle', {
        r:    5,
        fill: '#0a0a0a',
      });

      const spec = svgEl('circle', {
        r:    1.8,
        fill: 'rgba(255,255,255,0.85)',
      });

      eyeContent.appendChild(sclera);
      eyeContent.appendChild(iris);
      eyeContent.appendChild(pupil);
      eyeContent.appendChild(spec);
      eyeGroup.appendChild(eyeContent);
      root.appendChild(eyeGroup);

      /* name label: floats just below the eye, updated per tick */
      const label = svgEl('text', {
        'font-family':    'Nunito, system-ui, sans-serif',
        'font-size':      '10.5',
        'font-style':     'italic',
        'letter-spacing': '1.2',
        fill:             color,
        opacity:          '0.52',
        'text-anchor':    'middle',
      });
      label.textContent = this.name;
      root.appendChild(label);

      this._eyeGroup   = eyeGroup;
      this._eyeContent = eyeContent;
      this._pupilEl    = pupil;
      this._specEl     = spec;
      this._labelEl    = label;
    }

    /* ── tick (called every rAF frame) ─────────────────────────────────────── */

    tick(t, W, H) {
      const T       = t + this._timeOffset;
      const rootX   = W * this._rootXFrac;
      const rootY   = H * this._rootYFrac;
      const stemH   = H * this._stemHFrac;

      /* sample stem points: s=0 at root, s=1 at tip */
      const pts = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const s = i / SAMPLES;
        const y = rootY - s * stemH;

        /* two sine waves with different frequencies produce organic winding */
        const A1 = W * 0.16, f1 = 1.3, spd1 = 0.24;
        const A2 = W * 0.07, f2 = 3.1, spd2 = 0.47;
        const waveX = A1 * Math.sin(f1 * s * Math.PI * 2 + T * spd1)
                    + A2 * Math.sin(f2 * s * Math.PI * 2 + T * spd2);
        pts.push({ x: rootX + waveX, y });
      }

      /* update tapered stem segments */
      for (let i = 0; i < SAMPLES; i++) {
        const s  = i / SAMPLES;
        const sw = lerp(5.5, 1.1, s);
        const seg = this._segments[i];
        seg.setAttribute('x1', f(pts[i].x));
        seg.setAttribute('y1', f(pts[i].y));
        seg.setAttribute('x2', f(pts[i + 1].x));
        seg.setAttribute('y2', f(pts[i + 1].y));
        seg.setAttribute('stroke-width', f(sw));
      }

      /* update leaves */
      for (const { el, sFrac, side } of this._leaves) {
        const si    = Math.min(Math.round(sFrac * SAMPLES), SAMPLES - 1);
        const pt    = pts[si];
        const ptN   = pts[Math.min(si + 1, SAMPLES)];
        /* stem tangent angle at this position */
        const stemAngle = Math.atan2(ptN.y - pt.y, ptN.x - pt.x) * 180 / Math.PI;
        /* leaf grows 45° outward from the perpendicular to the stem */
        const leafAngle = stemAngle + 90 + side * 45;
        const scale     = lerp(1.1, 0.52, sFrac);
        el.setAttribute('transform',
          `translate(${f(pt.x)},${f(pt.y)}) rotate(${f(leafAngle)}) scale(${scale.toFixed(3)})`
        );
      }

      /* tip tangent for eye orientation */
      const tip  = pts[SAMPLES];
      const prev = pts[SAMPLES - 1];
      const dx   = tip.x - prev.x;
      const dy   = tip.y - prev.y;
      const eyeAngle  = Math.atan2(dy, dx) * 180 / Math.PI + 90;

      /* pupil drifts in the tangent direction + slow Lissajous wander */
      const normLen = Math.hypot(dx, dy) || 1;
      const pOffX   = (dx / normLen) * 5.5 + 3.2 * Math.sin(T * 0.38);
      const pOffY   = (dy / normLen) * 5.5 + 2.4 * Math.cos(T * 0.55);

      this._eyeGroup.setAttribute('transform',
        `translate(${f(tip.x)},${f(tip.y)}) rotate(${f(eyeAngle)})`
      );
      this._pupilEl.setAttribute('cx', f(pOffX));
      this._pupilEl.setAttribute('cy', f(pOffY));
      this._specEl.setAttribute('cx',  f(pOffX + 1.8));
      this._specEl.setAttribute('cy',  f(pOffY - 1.8));

      /* name label floats just below the eye, stays upright */
      this._labelEl.setAttribute('x', f(tip.x));
      this._labelEl.setAttribute('y', f(tip.y + 30));
    }

    /* ── blink ──────────────────────────────────────────────────────────────── */

    _scheduleBlink() {
      clearTimeout(this._blinkTimer);
      this._blinkTimer = setTimeout(() => this._doBlink(), rand(3000, 7500));
    }

    _doBlink() {
      if (this._isBlinking) return;
      this._isBlinking = true;

      const CLOSE_MS = 150;
      const HOLD_MS  = 85;
      const OPEN_MS  = 120;
      const STEPS    = 10;

      const setScale = (progress) => {
        /* progress 0 = fully open (scaleY 1), progress 1 = fully closed (scaleY 0.04) */
        const sy = lerp(1, 0.04, progress);
        this._eyeContent.style.transform = `scaleY(${sy.toFixed(4)})`;
      };

      let step = 0;

      const closeStep = () => {
        setScale(Math.sin((step / STEPS) * Math.PI / 2));
        if (step >= STEPS) {
          setScale(1);
          setTimeout(openPhase, HOLD_MS);
        } else {
          step++;
          setTimeout(closeStep, CLOSE_MS / STEPS);
        }
      };

      const openPhase = () => {
        step = STEPS;
        const openStep = () => {
          setScale(Math.sin((step / STEPS) * Math.PI / 2));
          if (step <= 0) {
            setScale(0);
            this._isBlinking = false;
            this._scheduleBlink();
          } else {
            step--;
            setTimeout(openStep, OPEN_MS / STEPS);
          }
        };
        openStep();
      };

      closeStep();
    }
  }

  /* ── orchestrator ─────────────────────────────────────────────────────────── */

  function init() {
    const wrap = document.getElementById('creature-wrap');
    const svg  = document.getElementById('creature-svg');
    if (!wrap || !svg) return;

    ensureGlowFilter(svg);

    const instances = CREATURE_DEFS.map((def, i) => new Creature(svg, def, i));

    let startTime = null;

    function loop(ts) {
      if (!startTime) startTime = ts;
      const t = (ts - startTime) / 1000;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      if (W >= 60 && H >= 100) {
        for (const c of instances) c.tick(t, W, H);
      }
      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
