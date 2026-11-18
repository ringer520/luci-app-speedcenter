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

  function speedText(v, unit) {
    if (typeof v !== 'number' || !isFinite(v)) return '--';
    var n = unit === 'mbs' ? v / 8 : v;
    return fmt(n, n >= 100 ? 1 : 2);
  }

  function unitLabel(unit) { return unit === 'mbs' ? 'MB/s' : 'Mbps'; }

  function scaleLabel(mbps, unit) {
    if (unit !== 'mbs') return String(mbps);
    var n = mbps / 8;
    return n % 1 === 0 ? String(n) : n.toFixed(1);
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

  var SITE_ICONS = [
    [/baidu/i, '#2932e1', 'rgba(41,50,225,.12)', 'M8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4m4-2a2 2 0 1 1 0-4 2 2 0 0 1 0 4m4 2a2 2 0 1 1 0-4 2 2 0 0 1 0 4m-8 4c0-2 2-3.5 4-3.5s4 1.5 4 3.5v2.5c0 1.1-.9 2-2 2h-4a2 2 0 0 1-2-2V14z'],
    [/qq|tencent/i, '#12b7f5', 'rgba(18,183,245,.13)', 'M12 3c-3.3 0-5.5 2.5-5.5 6 0 1.4-.9 2.7-1.5 4-.4.9.3 1.7 1.2 1.4l1.1-.4c.6 1.5 1.9 2.6 3.5 2.9-.8.5-1.8 1.2-1.8 2 0 .6.8 1.1 3 1.1s3-.5 3-1.1c0-.8-1-1.5-1.8-2 1.6-.3 2.9-1.4 3.5-2.9l1.1.4c.9.3 1.6-.5 1.2-1.4-.6-1.3-1.5-2.6-1.5-4 0-3.5-2.2-6-5.5-6z'],
    [/aliyun|ali/i, '#ff6a00', 'rgba(255,106,0,.13)', 'M6 7h4v2H7v6h3v2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm8 0h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4v-2h3V9h-3V7zm-5 4h6v2H9v-2z'],
    [/taobao/i, '#ff5000', 'rgba(255,80,0,.13)', 'M7 7V6a5 5 0 0 1 10 0v1h2a1 1 0 0 1 1 1v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a1 1 0 0 1 1-1h2zm2 0h6V6a3 3 0 0 0-6 0v1zm3 4v6m-3-3h6'],
    [/bilibili|b站/i, '#fb7299', 'rgba(251,114,153,.14)', 'M8 4l2.5 2.5M16 4l-2.5 2.5M6 7h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3zm3 5v2m6-2v2'],
    [/163|netease|网易/i, '#d43c33', 'rgba(212,60,51,.13)', 'M12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-6-6V4zm0 4a4 4 0 1 0 4 4h-2a2 2 0 1 1-2-2V8z'],
    [/google/i, '#4285f4', 'rgba(66,133,244,.13)', 'M20.5 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h4.8c-.2 1.1-.8 2-1.8 2.6v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.5zM12 21c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H3.9v2.3C5.4 19 8.5 21 12 21zM6.9 13.7c-.2-.5-.3-1.1-.3-1.7s.1-1.2.3-1.7V8H3.9C3.3 9.2 3 10.6 3 12s.3 2.8.9 4l3-2.3zM12 6.5c1.3 0 2.5.5 3.4 1.3l2.6-2.6C16.5 3.8 14.4 3 12 3 8.5 3 5.4 5 3.9 8l3 2.3C7.6 8.1 9.6 6.5 12 6.5z'],
    [/youtube/i, '#ff0033', 'rgba(255,0,51,.12)', 'M21 8.5a2.8 2.8 0 0 0-2-2C17.2 6 12 6 12 6s-5.2 0-7 .5a2.8 2.8 0 0 0-2 2C2.5 10.3 2.5 12 2.5 12s0 1.7.5 3.5a2.8 2.8 0 0 0 2 2c1.8.5 7 .5 7 .5s5.2 0 7-.5a2.8 2.8 0 0 0 2-2c.5-1.8.5-3.5.5-3.5s0-1.7-.5-3.5zM10 14.8V9.2l4.8 2.8-4.8 2.8z'],
    [/github/i, '#6e7681', 'rgba(110,118,129,.15)', 'M12 3a9 9 0 0 0-2.85 17.54c.45.08.62-.2.62-.43v-1.5c-2.5.54-3.03-1.2-3.03-1.2-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.06 1.38.93 1.38.93.8 1.38 2.1.98 2.62.75.08-.58.31-.98.57-1.2-2-.23-4.1-1-4.1-4.44 0-.98.35-1.78.93-2.4-.1-.23-.4-1.15.09-2.4 0 0 .76-.24 2.48.92a8.6 8.6 0 0 1 4.5 0c1.72-1.16 2.48-.92 2.48-.92.49 1.25.19 2.17.1 2.4.57.62.92 1.42.92 2.4 0 3.45-2.1 4.21-4.11 4.44.32.28.61.82.61 1.66v2.46c0 .24.16.52.62.43A9 9 0 0 0 12 3z'],
    [/cloudflare/i, '#f38020', 'rgba(243,128,32,.14)', 'M17.5 17H7a3.5 3.5 0 0 1-.4-6.98A5 5 0 0 1 16.3 9a3.5 3.5 0 0 1 1.2 8z'],
    [/openai|chatgpt/i, '#10a37f', 'rgba(16,163,127,.14)', 'M12 3l2.4 4.2L19 8.5l-2.3 4.2L19 17l-4.6 1.3L12 21l-2.4-2.7L5 17l2.3-4.3L5 8.5l4.6-1.3L12 3zm0 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z'],
    [/apple/i, '#64748b', 'rgba(100,116,139,.14)', 'M16.4 12.8c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.7-2.7-.7-1.4 0-2.7.8-3.4 2.1-1.5 2.5-.4 6.3 1 8.3.7 1 1.5 2.1 2.6 2 1 0 1.4-.7 2.7-.7 1.3 0 1.6.7 2.7.7 1.1 0 1.8-1 2.5-2 .8-1.1 1.1-2.2 1.1-2.3-.1 0-2.2-.8-2.2-3.3zM14.3 6.5c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.6 1 .1 2-.5 2.5-1.2z'],
    [/steam/i, '#1b2838', 'rgba(27,40,56,.14)', 'M12 3a9 9 0 0 0-8.8 7l4.7 1.9a2.5 2.5 0 0 1 1.4-.4l2.2-3.2a3.3 3.3 0 1 1 3.3 3.3h-.1l-3.1 2.2a2.5 2.5 0 0 1-4.8 1L3.3 13.4A9 9 0 1 0 12 3z'],
    [/netflix/i, '#e50914', 'rgba(229,9,20,.13)', 'M7 4h3l4 9.5V4h3v16h-3l-4-9.5V20H7V4z'],
    [/discord/i, '#5865f2', 'rgba(88,101,242,.13)', 'M18.5 6.5A13 13 0 0 0 15 5.4l-.4.8a11.5 11.5 0 0 0-5.2 0L9 5.4A13 13 0 0 0 5.5 6.5C3.4 9.7 2.8 12.8 3.1 15.9a13.5 13.5 0 0 0 4 2l.8-1.3c-.6-.2-1.1-.5-1.6-.8l.4-.3a9.5 9.5 0 0 0 10.6 0l.4.3c-.5.3-1 .6-1.6.8l.8 1.3a13.5 13.5 0 0 0 4-2c.3-3.5-.6-6.6-2.4-9.4zM9.2 14c-.8 0-1.4-.7-1.4-1.5S8.4 11 9.2 11s1.4.7 1.4 1.5S10 14 9.2 14zm5.6 0c-.8 0-1.4-.7-1.4-1.5s.6-1.5 1.4-1.5 1.4.7 1.4 1.5-.6 1.5-1.4 1.5z'],
    [/twitter|x\.com/i, '#111827', 'rgba(17,24,39,.12)', 'M4 4h3.5l4.2 5.9L16.8 4H19l-6.1 7L20 20h-3.5l-4.5-6.3L6.4 20H4.2l6.4-7.4L4 4z'],
    [/jd\.com|京东/i, '#e1251b', 'rgba(225,37,27,.13)', 'M6 5h12l-1.2 12.5a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 5zm4.5 4.5a1.5 1.5 0 1 0 3 0'],
    [/zhihu|知乎/i, '#0066ff', 'rgba(0,102,255,.12)', 'M5 6h5v12H5V6zm9 0h5v8l-2.5 2-2.5-2V6z'],
    [/douyin|抖音/i, '#111827', 'rgba(17,24,39,.12)', 'M14 4v10.2a3.2 3.2 0 1 1-2.5-3.1V8.5a5.8 5.8 0 1 0 5 5.7V8.7a6.5 6.5 0 0 0 3.5 1.1V7.2A4 4 0 0 1 16.5 4H14z']
  ];

  function siteIcon(name, host, key) {
    var hay = (name || '') + ' ' + (host || ''), hit = null;
    for (var i = 0; i < SITE_ICONS.length; i++) if (SITE_ICONS[i][0].test(hay)) { hit = SITE_ICONS[i]; break; }
    var color = hit ? hit[1] : (key === 'global' ? 'var(--sc-good)' : 'var(--sc-accent)');
    var bg = hit ? hit[2] : (key === 'global' ? 'var(--sc-good-soft)' : 'var(--sc-accent-soft)');
    var d = hit ? hit[3] : 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 0 1 6.7 5H5.3A7 7 0 0 1 12 5zm-6.7 7h13.4a7 7 0 0 1-13.4 0z';
    var box = el('div', { class: 'sc-avatar ' + key, style: { background: bg, color: color } });
    var s = svg('svg', { viewBox: '0 0 24 24', width: 20, height: 20 });
    var isStroke = /taobao|bilibili|b站|jd\.com|京东/i.test(hay);
    s.appendChild(svg('path', isStroke
      ? { d: d, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
      : { d: d, fill: 'currentColor' }));
    box.appendChild(s);
    return box;
  }

  function brandIcon(size) {
    var sz = size || 38;
    var s = svg('svg', { viewBox: '0 0 40 40', width: sz, height: sz, class: 'sc-brand-svg' });
    var defs = svg('defs', {});
    var g = svg('linearGradient', { id: 'sc-brand-grad', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    var s1 = svg('stop', { offset: '0%', 'stop-color': '#18181b' });
    var s2 = svg('stop', { offset: '100%', 'stop-color': '#27272a' });
    g.appendChild(s1); g.appendChild(s2);
    defs.appendChild(g);
    s.appendChild(defs);
    s.appendChild(svg('rect', { x: 1, y: 1, width: 38, height: 38, rx: 10, fill: 'url(#sc-brand-grad)' }));
    s.appendChild(svg('rect', { x: 1.5, y: 1.5, width: 37, height: 37, rx: 9.5, fill: 'none', stroke: 'rgba(255,255,255,0.14)', 'stroke-width': 1 }));
    // subtle gauge track arc
    s.appendChild(svg('path', { d: 'M10.5 26.5 A12 12 0 1 1 29.5 26.5', fill: 'none', stroke: 'rgba(255,255,255,0.18)', 'stroke-width': 2.8, 'stroke-linecap': 'round' }));
    // active precision cobalt arc
    s.appendChild(svg('path', { d: 'M10.5 26.5 A12 12 0 0 1 28.8 14.5', fill: 'none', stroke: '#3b82f6', 'stroke-width': 2.8, 'stroke-linecap': 'round' }));
    // crisp silver needle pointing toward peak
    s.appendChild(svg('path', { d: 'M20 22 L27.5 14.2', stroke: '#f8fafc', 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
    s.appendChild(svg('circle', { cx: 20, cy: 22, r: 2.4, fill: '#3b82f6' }));
    // subtle slate chevron at bottom
    s.appendChild(svg('path', { d: 'M15 30.5 L20 27.4 L25 30.5', fill: 'none', stroke: 'rgba(255,255,255,0.65)', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return s;
  }

  SC.util = {
    svg: svg, el: el, fmt: fmt, speedText: speedText, unitLabel: unitLabel, scaleLabel: scaleLabel,
    pingGrade: pingGrade, dialMax: dialMax, csvCell: csvCell, relTime: relTime, rowEpoch: rowEpoch,
    polar: polar, smoothPath: smoothPath, toast: toast, siteIcon: siteIcon, brandIcon: brandIcon
  };
})(typeof window !== 'undefined' ? window : this);
