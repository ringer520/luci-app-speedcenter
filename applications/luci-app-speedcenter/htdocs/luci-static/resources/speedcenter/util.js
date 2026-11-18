/* SpeedCenter / util.js — DOM helpers & pure formatting functions (no state). */
(function (root) {
  'use strict';
  var SC = root.SC = root.SC || {};
  var NS = 'http://www.w3.org/2000/svg';

  function svg(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : children != null ? [children] : []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    });
    return n;
  }

  function fmt(v, d) {
    return typeof v === 'number' && isFinite(v) ? v.toFixed(d == null ? 1 : d) : '--';
  }

  function speedText(v) {
    return typeof v === 'number' && isFinite(v) ? fmt(v, v >= 100 ? 1 : 2) : '--';
  }

  function pingGrade(v) {
    if (typeof v !== 'number' || v <= 0) return { text: '待测', cls: 'idle' };
    if (v < 45) return { text: '极速', cls: 'good' };
    if (v < 110) return { text: '流畅', cls: 'ok' };
    if (v < 200) return { text: '一般', cls: 'warn' };
    return { text: '缓慢', cls: 'bad' };
  }

  // Round up to a friendly dial ceiling; 1000 when there is no data yet.
  function dialMax(value) {
    var v = Number(value) || 0;
    if (v <= 0) return 1000;
    var steps = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    for (var i = 0; i < steps.length; i++) if (v <= steps[i]) return steps[i];
    return Math.ceil(v / 10000) * 10000;
  }

  function csvCell(v) {
    return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  }

  function relTime(ms) {
    if (!ms) return '';
    var s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return s + ' 秒前';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    return Math.floor(s / 86400) + ' 天前';
  }

  function rowEpoch(r) {
    if (r && typeof r.epoch === 'number') return r.epoch * 1000;
    if (r && r.time) {
      var t = Date.parse(String(r.time).replace(/-/g, '/'));
      return isNaN(t) ? 0 : t;
    }
    return 0;
  }

  function polar(cx, cy, deg, r) {
    var a = deg * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  // Catmull-Rom → cubic bezier path through [x,y] points.
  function smoothPath(p) {
    if (!p.length) return '';
    var d = 'M ' + p[0][0].toFixed(1) + ' ' + p[0][1].toFixed(1);
    for (var i = 0; i < p.length - 1; i++) {
      var p0 = p[i ? i - 1 : 0], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2 < p.length ? i + 2 : i + 1];
      d += ' C ' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + ', ' +
        (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + ', ' +
        p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d;
  }

  var toastTimer = 0;
  function toast(msg, isError) {
    var box = document.querySelector('.sc-toast');
    if (!box) {
      box = el('div', { class: 'sc-toast' });
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.className = 'sc-toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.className = 'sc-toast'; }, 3000);
  }

  SC.util = {
    svg: svg, el: el, fmt: fmt, speedText: speedText, pingGrade: pingGrade, dialMax: dialMax,
    csvCell: csvCell, relTime: relTime, rowEpoch: rowEpoch, polar: polar, smoothPath: smoothPath, toast: toast
  };
})(typeof window !== 'undefined' ? window : this);
