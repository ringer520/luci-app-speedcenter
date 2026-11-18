/* SpeedCenter / charts.js — dual-ring gauge (60fps spring animation), sparklines, trend chart. */
(function (root) {
  'use strict';
  var SC = root.SC, U = SC.util, svg = U.svg, polar = U.polar;

  var D = { cx: 120, cy: 128, rO: 90, rI: 73, start: 135, sweep: 270 };
  D.arcO = 2 * Math.PI * D.rO * 0.75;
  D.arcI = 2 * Math.PI * D.rI * 0.75;
  var TICKS = 40;

  function ang(r) { return D.start + D.sweep * Math.max(0, Math.min(1, r || 0)); }

  function arcPath(r) {
    var a = polar(D.cx, D.cy, D.start, r), b = polar(D.cx, D.cy, D.start + D.sweep, r);
    return 'M ' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) + ' A ' + r + ' ' + r + ' 0 1 1 ' + b[0].toFixed(2) + ' ' + b[1].toFixed(2);
  }

  function stop(parent, off, color, op) {
    var s = svg('stop', { offset: off });
    s.style.stopColor = color;
    if (op != null) s.style.stopOpacity = op;
    parent.appendChild(s);
  }

  function text(attrs, str) {
    var t = svg('text', attrs);
    t.textContent = str;
    return t;
  }

  /**
   * Gauge: outer ring = download, inner ring = upload.
   * Call set({dl, ul, max, focus:'dl'|'ul', running, hasDl, hasUl}); the internal rAF loop
   * eases the displayed values toward the targets and stops itself once detached from the DOM.
   */
  function Gauge() {
    var self = this;
    var node = this.svg = svg('svg', { viewBox: '0 0 240 240', class: 'sc-gauge-svg', role: 'img' });
    var defs = svg('defs', {});
    var g1 = svg('linearGradient', { id: 'scg-dl', x1: '0%', y1: '100%', x2: '100%', y2: '0%' });
    stop(g1, '0%', '#38bdf8'); stop(g1, '100%', '#6366f1');
    var g2 = svg('linearGradient', { id: 'scg-ul', x1: '0%', y1: '100%', x2: '100%', y2: '0%' });
    stop(g2, '0%', '#10b981'); stop(g2, '100%', '#2dd4bf');
    var g3 = svg('linearGradient', { id: 'scg-nd', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    stop(g3, '0%', '#38bdf8'); stop(g3, '100%', '#6366f1');
    defs.appendChild(g1); defs.appendChild(g2); defs.appendChild(g3);
    node.appendChild(defs);

    node.appendChild(svg('circle', { cx: D.cx, cy: D.cy, r: 62, fill: 'var(--sc-dial-inner)', stroke: 'var(--sc-border)', 'stroke-width': 1 }));
    node.appendChild(svg('path', { d: arcPath(D.rO), fill: 'none', stroke: 'var(--sc-track)', 'stroke-width': 11, 'stroke-linecap': 'round' }));
    var fgO = svg('path', { d: arcPath(D.rO), fill: 'none', stroke: 'url(#scg-dl)', 'stroke-width': 11, 'stroke-linecap': 'round', class: 'sc-arc-fg', 'stroke-dasharray': '0 ' + D.arcO.toFixed(1) });
    node.appendChild(svg('path', { d: arcPath(D.rI), fill: 'none', stroke: 'var(--sc-track)', 'stroke-width': 5.5, 'stroke-linecap': 'round', 'stroke-opacity': 0.7 }));
    var fgI = svg('path', { d: arcPath(D.rI), fill: 'none', stroke: 'url(#scg-ul)', 'stroke-width': 5.5, 'stroke-linecap': 'round', class: 'sc-arc-ul-fg', 'stroke-dasharray': '0 ' + D.arcI.toFixed(1) });
    node.appendChild(fgO);
    node.appendChild(fgI);

    var ticks = [];
    var tg = svg('g', { 'stroke-linecap': 'round' });
    for (var i = 0; i <= TICKS; i++) {
      var major = i % 10 === 0, mid = i % 5 === 0 && !major;
      var a = polar(D.cx, D.cy, D.start + D.sweep * i / TICKS, major ? 100 : mid ? 102 : 103.5);
      var b = polar(D.cx, D.cy, D.start + D.sweep * i / TICKS, major ? 108 : 106.5);
      var ln = svg('line', {
        x1: a[0].toFixed(2), y1: a[1].toFixed(2), x2: b[0].toFixed(2), y2: b[1].toFixed(2),
        stroke: 'var(--sc-muted)', 'stroke-width': major ? 2.2 : mid ? 1.4 : 0.9, 'stroke-opacity': major ? 0.6 : 0.25
      });
      ln._major = major;
      ticks.push(ln);
      tg.appendChild(ln);
    }
    node.appendChild(tg);

    var comet = svg('circle', { cx: 0, cy: 0, r: 4.5, fill: '#fff', stroke: 'var(--sc-accent)', 'stroke-width': 2.5, opacity: 0 });
    node.appendChild(comet);

    var needle = svg('g', { class: 'sc-needle' });
    needle.appendChild(svg('polygon', { points: '120,40 117.2,128 120,140 122.8,128', fill: 'url(#scg-nd)' }));
    node.appendChild(needle);
    node.appendChild(svg('circle', { cx: D.cx, cy: D.cy, r: 10, fill: 'var(--sc-surface-solid)', stroke: 'var(--sc-accent)', 'stroke-width': 3 }));
    node.appendChild(svg('circle', { cx: D.cx, cy: D.cy, r: 3.8, fill: 'var(--sc-accent)' }));

    // NOTE: the first <text> node is the live value (relied on by the test-suite).
    var valT = text({ x: D.cx, y: 180, 'text-anchor': 'middle', fill: 'var(--sc-text)', 'font-size': 28, 'font-weight': 800, class: 'sc-val' }, '--');
    var modeT = text({ x: D.cx, y: 157, 'text-anchor': 'middle', fill: 'var(--sc-accent)', 'font-size': 9.5, 'font-weight': 700, 'letter-spacing': '0.08em' }, '↓ DOWNLOAD');
    node.appendChild(valT);
    node.appendChild(modeT);
    node.appendChild(text({ x: D.cx, y: 196, 'text-anchor': 'middle', fill: 'var(--sc-muted)', 'font-size': 11, 'font-weight': 700 }, 'Mbps'));
    node.appendChild(text({ x: 52, y: 220, 'text-anchor': 'middle', fill: 'var(--sc-faint)', 'font-size': 10.5, 'font-weight': 700 }, '0'));
    var midT = text({ x: D.cx, y: 12, 'text-anchor': 'middle', fill: 'var(--sc-faint)', 'font-size': 10, 'font-weight': 700 }, '500');
    var maxT = text({ x: 188, y: 220, 'text-anchor': 'middle', fill: 'var(--sc-faint)', 'font-size': 10.5, 'font-weight': 700 }, '1000');
    node.appendChild(midT);
    node.appendChild(maxT);

    this.t = { dl: 0, ul: 0, max: 1000, focus: 'dl', running: false, hasDl: false, hasUl: false };
    this.v = { dl: 0, ul: 0 };
    this.onFrame = null;
    var born = performance.now(), lit = -1, lastMax = 0, lastMode = '';

    this.set = function (p) { Object.assign(self.t, p); };
    this.reset = function () { self.v.dl = 0; self.v.ul = 0; };

    function frame(now) {
      if (!node.isConnected && now - born > 1500) return;       // detached view → stop the loop
      var t = self.t, v = self.v;
      var flutter = function (x) { return x > 0 ? Math.sin(now / 95) * x * 0.012 + Math.cos(now / 160) * x * 0.007 : 0; };
      var gDl = Math.max(0, t.dl + (t.running && t.focus === 'dl' ? flutter(t.dl) : 0));
      var gUl = Math.max(0, t.ul + (t.running && t.focus === 'ul' ? flutter(t.ul) : 0));
      v.dl += (gDl - v.dl) * 0.16;
      v.ul += (gUl - v.ul) * 0.16;
      if (Math.abs(gDl - v.dl) < 0.05) v.dl = gDl;
      if (Math.abs(gUl - v.ul) < 0.05) v.ul = gUl;

      var max = t.max || 1000;
      var rDl = Math.min(1, v.dl / max), rUl = Math.min(1, v.ul / max);
      var ulFocus = t.running && t.focus === 'ul';
      var rN = ulFocus ? rUl : rDl;

      fgO.setAttribute('stroke-dasharray', (D.arcO * rDl).toFixed(1) + ' ' + D.arcO.toFixed(1));
      fgI.setAttribute('stroke-dasharray', (D.arcI * rUl).toFixed(1) + ' ' + D.arcI.toFixed(1));
      var c = polar(D.cx, D.cy, ang(rDl), D.rO);
      comet.setAttribute('cx', c[0].toFixed(1));
      comet.setAttribute('cy', c[1].toFixed(1));
      comet.setAttribute('opacity', rDl > 0.008 ? 1 : 0);
      needle.style.transform = 'rotate(' + (ang(rN) + 90).toFixed(2) + 'deg)';

      var nLit = rN > 0.005 ? Math.round(rN * TICKS) : -1;
      if (nLit !== lit || ulFocus !== (lastMode === 'ul')) {
        var col = ulFocus ? 'var(--sc-up)' : 'var(--sc-accent)';
        for (var i = 0; i < ticks.length; i++) {
          var on = i <= nLit;
          ticks[i].setAttribute('stroke', on ? col : 'var(--sc-muted)');
          ticks[i].setAttribute('stroke-opacity', on ? 0.95 : ticks[i]._major ? 0.6 : 0.25);
        }
        lit = nLit;
      }

      valT.textContent = ulFocus && t.hasUl ? U.speedText(v.ul) : t.hasDl ? U.speedText(v.dl) : '--';
      var mode = ulFocus ? 'ul' : 'dl';
      if (mode !== lastMode) {
        modeT.textContent = ulFocus ? '↑ UPLOAD LIVE' : '↓ DOWNLOAD';
        modeT.setAttribute('fill', ulFocus ? 'var(--sc-up)' : 'var(--sc-accent)');
        lastMode = mode;
      }
      if (max !== lastMax) {
        maxT.textContent = String(max);
        midT.textContent = String(Math.round(max / 2));
        lastMax = max;
      }
      if (self.onFrame) self.onFrame(v, t, now);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /** Smooth area sparkline. `color` is any CSS colour / var(). */
  function spark(values, color, h) {
    var W = 200;
    h = h || 40;
    var node = svg('svg', { viewBox: '0 0 ' + W + ' ' + h, preserveAspectRatio: 'none', class: 'sc-spark' });
    var raw = (values || []).filter(function (v) { return typeof v === 'number' && isFinite(v) && v >= 0; }).slice(-32);
    var has = raw.some(function (v) { return v > 0; });
    var arr = raw.length >= 2 ? raw : raw.length === 1 ? [raw[0], raw[0]] : [0, 0];
    var max = Math.max.apply(null, arr.concat([10]));
    var id = 'scs-' + Math.random().toString(36).slice(2, 8);
    var defs = svg('defs', {});
    var lg = svg('linearGradient', { id: id, x1: 0, y1: 0, x2: 0, y2: 1 });
    stop(lg, '0%', color, has ? 0.32 : 0.05);
    stop(lg, '100%', color, 0);
    defs.appendChild(lg);
    node.appendChild(defs);
    var pts = arr.map(function (v, i) {
      return [i / (arr.length - 1) * W, has ? h - 4 - v / max * (h - 10) : h - 5];
    });
    var line = U.smoothPath(pts);
    node.appendChild(svg('path', { d: line + ' L ' + W + ' ' + h + ' L 0 ' + h + ' Z', fill: 'url(#' + id + ')' }));
    node.appendChild(svg('path', {
      d: line, fill: 'none', stroke: color, 'stroke-width': has ? 2 : 1.2, 'stroke-opacity': has ? 0.95 : 0.3,
      'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': has ? 'none' : '4 4'
    }));
    return node;
  }

  /** Download/upload history chart. Rows are newest-first. */
  function trend(rows) {
    var W = 1000, H = 200, L = 46, R = 16, T = 14, B = 26, pw = W - L - R, ph = H - T - B;
    var ord = rows.slice().reverse(), vals = [];
    ord.forEach(function (r) {
      if (typeof r.download === 'number') vals.push(r.download);
      if (typeof r.upload === 'number') vals.push(r.upload);
    });
    var wrap = U.el('div', { class: 'sc-trend' });
    if (!vals.length) return wrap;
    var max = Math.max.apply(null, vals) * 1.15 || 100;
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'sc-trend-svg' });
    var defs = svg('defs', {});
    [['scd', 'var(--sc-accent)'], ['scu', 'var(--sc-up)']].forEach(function (p) {
      var lg = svg('linearGradient', { id: 'trend-' + p[0], x1: 0, y1: 0, x2: 0, y2: 1 });
      stop(lg, '0%', p[1], 0.28); stop(lg, '100%', p[1], 0);
      defs.appendChild(lg);
    });
    s.appendChild(defs);
    for (var g = 0; g <= 4; g++) {
      var gy = T + ph * (1 - g / 4);
      s.appendChild(svg('line', { x1: L, y1: gy, x2: W - R, y2: gy, stroke: 'var(--sc-border)', 'stroke-dasharray': g ? '4 4' : 'none' }));
      s.appendChild(text({ x: L - 8, y: gy + 3.5, 'text-anchor': 'end', fill: 'var(--sc-muted)', 'font-size': 10.5, 'font-weight': 600 }, U.fmt(max * g / 4, 0)));
    }
    function series(key, color, grad) {
      var a = ord.filter(function (r) { return typeof r[key] === 'number'; });
      if (!a.length) return;
      var pts = a.map(function (r, i) {
        return [a.length === 1 ? L + pw / 2 : L + i / (a.length - 1) * pw, T + ph - r[key] / max * ph];
      });
      var line = U.smoothPath(pts);
      s.appendChild(svg('path', { d: line + ' L ' + pts[pts.length - 1][0].toFixed(1) + ' ' + (T + ph) + ' L ' + pts[0][0].toFixed(1) + ' ' + (T + ph) + ' Z', fill: 'url(#trend-' + grad + ')' }));
      s.appendChild(svg('path', { d: line, fill: 'none', stroke: color, 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
      s.appendChild(svg('polyline', { points: pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '), fill: 'none', stroke: color, 'stroke-width': 0.1, opacity: 0.01 }));
      pts.forEach(function (p) {
        s.appendChild(svg('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 3, fill: 'var(--sc-surface-solid)', stroke: color, 'stroke-width': 2 }));
      });
    }
    series('download', 'var(--sc-accent)', 'scd');
    series('upload', 'var(--sc-up)', 'scu');
    s.appendChild(text({ x: L, y: H - 6, fill: 'var(--sc-muted)', 'font-size': 10.5 }, String(ord[0].time || '').slice(-8)));
    s.appendChild(text({ x: W - R, y: H - 6, 'text-anchor': 'end', fill: 'var(--sc-muted)', 'font-size': 10.5 }, String(ord[ord.length - 1].time || '').slice(-8)));
    wrap.appendChild(s);
    wrap.appendChild(U.el('div', { class: 'sc-trend-legend' }, [
      U.el('span', {}, [U.el('i', { class: 'dot dl' }), '↓ 下载']),
      U.el('span', {}, [U.el('i', { class: 'dot ul' }), '↑ 上传']),
      U.el('span', { class: 'sc-trend-max', text: '峰值 ' + U.fmt(Math.max.apply(null, vals), 1) + ' Mbps' })
    ]));
    return wrap;
  }

  SC.Gauge = Gauge;
  SC.charts = { spark: spark, trend: trend };
})(typeof window !== 'undefined' ? window : this);
