/* SpeedCenter / views.js — the four screens. Each view is `fn(ctx) -> { node, update() }`.
   ctx.state is the single shared state object; ctx.actions are the only way views change anything. */
(function (root) {
  'use strict';
  var SC = root.SC, U = SC.util, C = SC.charts, h = U.el;

  var REGION_LABEL = { cn: '国内', global: '国际' };

  function nonEmpty(o) { return o && Object.keys(o).length ? o : null; }

  /** Best available result for a region: live run → last run → latest history row. */
  function regionData(S, key) {
    var st = S.status || {};
    return nonEmpty(st.live && st.live[key]) || nonEmpty(st.lastResult && st.lastResult[key]) ||
      (!st.running && nonEmpty(S.lastHist && S.lastHist[key])) || {};
  }

  /* =========================================================================
     Overview — stage (gauge + one region selector + one CTA) → compare → trend
     ========================================================================= */
  function overview(ctx) {
    var S = ctx.state, A = ctx.actions;
    var gauge = new SC.Gauge();
    var prevRunning = false, sparkSig = '', lastSample = 0;

    // --- region selector & domestic node selector
    var segBtns = {};
    var seg = h('div', { class: 'sc-seg', role: 'tablist' }, [['cn', '国内'], ['global', '国际']].map(function (r) {
      var b = h('button', { class: 'sc-seg-btn', 'data-region': r[0], text: r[1], onclick: function () { A.setRegion(r[0]); } });
      segBtns[r[0]] = b;
      return b;
    }));
    var cnNodeSel = h('select', { class: 'sc-node-select', id: 'sc-cn-node', title: '国内测速节点', onchange: function () { A.setCnNode(cnNodeSel.value); } }, [
      ['auto', '节点：自动选择'],
      ['tencent', '腾讯云 · 骨干节点'],
      ['tsinghua', '清华大学 · TUNA 节点'],
      ['aliyun', '阿里云 · 多线节点']
    ].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));

    var phaseChip = h('span', { class: 'sc-chip', text: '' });
    var serverChip = h('span', { class: 'sc-chip', text: '节点：自动选择' });
    var ipChip = h('span', { class: 'sc-chip sc-chip-ip', id: 'sc-ip-chip', text: '' });
    var gaugeBox = h('div', { class: 'sc-gauge', id: 'sc-gauge', 'data-gauge': 'main' }, [gauge.svg]);

    var progress = h('i', { id: 'sc-prog' });

    var startBtn = h('button', { class: 'sc-btn primary sc-cta-btn', id: 'sc-start', text: '开始测速', onclick: A.startSpeed });
    var stopBtn = h('button', { class: 'sc-btn sc-cta-btn', id: 'sc-stop', text: '停止', onclick: A.stopSpeed });
    stopBtn.disabled = true;

    // --- result cells
    var dlNum = h('strong', { text: '--' }), ulNum = h('strong', { text: '--' });
    var dlUnit = h('small', { text: U.unitLabel(S.unit) }), ulUnit = h('small', { text: U.unitLabel(S.unit) });
    var dlDelta = h('em', { class: 'sc-delta' }), ulDelta = h('em', { class: 'sc-delta' });
    var dlSpark = h('div', { class: 'sc-cell-spark' }), ulSpark = h('div', { class: 'sc-cell-spark' });
    var pingNum = h('strong', { id: 'sc-q-ping', text: '--' }), jitNum = h('strong', { id: 'sc-q-jitter', text: '--' });
    var lossNum = h('strong', { id: 'sc-q-loss', text: '--' });

    function cell(cls, label, num, unitNode, extra, spark) {
      var u = typeof unitNode === 'string' ? h('small', { text: unitNode }) : unitNode;
      return h('div', { class: 'sc-cell ' + cls }, [
        h('div', { class: 'sc-cell-head' }, [h('span', { text: label }), extra || null]),
        h('div', { class: 'sc-cell-num' }, [num, u]),
        spark || null
      ]);
    }

    var stage = h('div', { class: 'sc-card sc-stage sc-animate-in' }, [
      h('div', { class: 'sc-stage-top' }, [
        h('div', { class: 'sc-stage-controls' }, [seg, cnNodeSel]),
        h('div', { class: 'sc-chips' }, [phaseChip, serverChip, ipChip])
      ]),
      h('div', { class: 'sc-stage-main' }, [
        gaugeBox,
        h('div', { class: 'sc-stage-side' }, [
          h('div', { class: 'sc-progress' }, [progress]),
          h('div', { class: 'sc-cta' }, [startBtn, stopBtn]),
          h('div', { class: 'sc-last', id: 'sc-last-tested', text: '尚未测速' })
        ])
      ]),
      h('div', { class: 'sc-quad' }, [
        cell('dl', '↓ 下载', dlNum, dlUnit, dlDelta, dlSpark),
        cell('ul', '↑ 上传', ulNum, ulUnit, ulDelta, ulSpark),
        cell('', '延迟', pingNum, 'ms'),
        cell('', '抖动', jitNum, 'ms'),
        cell('', '丢包', lossNum, '%')
      ])
    ]);

    // --- compare strip (read-only summary; no controls)
    var rows = {};
    function compareRow(key) {
      var r = rows[key] = {
        dl: h('b', { id: 'sc-dl-' + key, text: '--' }), ul: h('b', { id: 'sc-up-' + key, text: '--' }),
        dlUnit: h('small', { text: U.unitLabel(S.unit) }), ulUnit: h('small', { text: U.unitLabel(S.unit) }),
        ping: h('b', { id: 'sc-ping-' + key, text: '--' }),
        server: h('span', { class: 'sc-row-server', id: 'sc-server-' + key, text: '尚未测速' }),
        base: h('span', { class: 'sc-baseline', id: 'sc-baseline-' + key })
      };
      r.node = h('div', { class: 'sc-region ' + key }, [
        h('span', { class: 'tag ' + key, text: REGION_LABEL[key] }),
        h('span', { class: 'sc-rv dl' }, ['↓ ', r.dl, r.dlUnit]),
        h('span', { class: 'sc-rv ul' }, ['↑ ', r.ul, r.ulUnit]),
        h('span', { class: 'sc-rv' }, ['⏱ ', r.ping, h('small', { text: 'ms' })]),
        r.server, r.base
      ]);
      return r.node;
    }
    var compare = h('div', { class: 'sc-card sc-compare sc-animate-in' }, [
      h('div', { class: 'sc-card-title' }, [h('h2', { text: '国内 vs 国际' }), h('span', { class: 'hint', text: '最近一次结果' })]),
      compareRow('cn'), compareRow('global')
    ]);

    var node = h('div', { class: 'sc-view' }, [stage, compare]);

    function activeKey() {
      return S.region === 'global' ? 'global' : 'cn';
    }

    function drawSparks(key) {
      var s = S.series[key];
      dlSpark.innerHTML = ''; ulSpark.innerHTML = '';
      dlSpark.appendChild(C.spark(s.dl, 'var(--sc-accent)', 40));
      ulSpark.appendChild(C.spark(s.ul, 'var(--sc-up)', 40));
    }

    // per-frame: keep the cell numbers glued to the gauge + sample the live waveform
    gauge.onFrame = function (v, t, now) {
      if (!t.running) return;
      dlNum.textContent = t.hasDl ? U.speedText(v.dl, t.unit) : '--';
      ulNum.textContent = t.hasUl ? U.speedText(v.ul, t.unit) : '--';
      if (now - lastSample > 250) {
        lastSample = now;
        var s = S.series[activeKey()];
        if (t.focus === 'dl' && v.dl > 0) { s.dl.push(+v.dl.toFixed(1)); if (s.dl.length > 40) s.dl.shift(); }
        if (t.focus === 'ul' && v.ul > 0) { s.ul.push(+v.ul.toFixed(1)); if (s.ul.length > 40) s.ul.shift(); }
        drawSparks(activeKey());
      }
    };

    function update() {
      var st = S.status || {}, running = !!st.running, ph = String(st.phase || '');
      var key = activeKey(), d = regionData(S, key), uLabel = U.unitLabel(S.unit);
      var base = Number(S.config.baselineMbps) || 0;
      var peak = Math.max(Number(d.download) || 0, Number(d.upload) || 0);
      var focusUl = running && ph.indexOf('上传') >= 0;
      var hasDl = typeof d.download === 'number', hasUl = typeof d.upload === 'number';

      if (running && !prevRunning) gauge.reset();
      prevRunning = running;
      gauge.set({
        dl: hasDl ? d.download : 0, ul: hasUl ? d.upload : 0, hasDl: hasDl, hasUl: hasUl, running: running,
        unit: S.unit,
        focus: focusUl ? 'ul' : 'dl', max: peak > 0 ? Math.max(base ? U.dialMax(base) : 100, U.dialMax(peak)) : U.dialMax(base)
      });
      dlUnit.textContent = uLabel;
      ulUnit.textContent = uLabel;
      if (!running) {
        dlNum.textContent = hasDl ? U.speedText(d.download, S.unit) : '--';
        ulNum.textContent = hasUl ? U.speedText(d.upload, S.unit) : '--';
      }

      stage.classList.toggle('running', running);
      node.classList.toggle('focus', running);
      Object.keys(segBtns).forEach(function (k) {
        segBtns[k].classList.toggle('active', S.region === k);
        segBtns[k].disabled = running;
      });
      cnNodeSel.style.display = key === 'cn' ? '' : 'none';
      cnNodeSel.value = S.cnNode || 'auto';
      cnNodeSel.disabled = running;
      startBtn.disabled = running;
      stopBtn.disabled = !running;
      progress.style.width = (running ? st.progress || 0 : hasDl ? 100 : 0) + '%';

      var showPhase = running || (hasDl && d.download > 0);
      phaseChip.style.display = showPhase ? '' : 'none';
      phaseChip.textContent = running ? (ph || '正在测速…') : '✓ ' + REGION_LABEL[key] + '测速完成';
      phaseChip.classList.toggle('running', running);
      var cnLabelMap = { auto: '自动选择', tencent: '腾讯云节点', tsinghua: '清华大学节点', aliyun: '阿里云节点' };
      serverChip.textContent = '节点：' + (d.server || (key === 'cn' ? (cnLabelMap[S.cnNode] || '自动选择') : '自动选择'));
      var ipTxt = d.ip || '';
      if (d.exit_ip && d.exit_ip !== ipTxt) ipTxt = ipTxt ? ipTxt + ' · 出口 ' + d.exit_ip : d.exit_ip;
      ipChip.style.display = ipTxt ? '' : 'none';
      ipChip.textContent = ipTxt ? '连接 IP：' + ipTxt : '';

      pingNum.textContent = d.ping ? U.fmt(d.ping, 0) : '--';
      jitNum.textContent = d.jitter ? U.fmt(d.jitter, 0) : '--';
      lossNum.textContent = d.loss != null && hasDl ? U.fmt(d.loss, 0) : '--';

      // change vs. previous run of the same region (only meaningful once a run finished)
      var hist = S.history.filter(function (r) { return r.region === key; });
      function delta(node, cur, prevVal) {
        if (running || !(prevVal > 0) || typeof cur !== 'number') { node.textContent = ''; node.className = 'sc-delta'; return; }
        var p = (cur - prevVal) / prevVal * 100;
        node.textContent = (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p).toFixed(0) + '%';
        node.className = 'sc-delta ' + (p >= 0 ? 'up' : 'down');
      }
      var prev = hist.length > 1 && hasDl && Math.abs(hist[0].download - d.download) < 0.5 ? hist[1] : null;
      delta(dlDelta, d.download, prev && prev.download);
      delta(ulDelta, d.upload, prev && prev.upload);

      // compare strip
      ['cn', 'global'].forEach(function (k) {
        var x = regionData(S, k), r = rows[k];
        r.dl.textContent = U.speedText(x.download, S.unit);
        r.ul.textContent = U.speedText(x.upload, S.unit);
        r.dlUnit.textContent = uLabel;
        r.ulUnit.textContent = uLabel;
        r.ping.textContent = x.ping ? U.fmt(x.ping, 0) : '--';
        r.server.textContent = (x.server || '尚未测速') + (x.ip ? ' · ' + x.ip : '');
        r.node.classList.toggle('active', k === key);
        r.base.innerHTML = '';
        if (base > 0 && typeof x.download === 'number' && x.download > 0) {
          var pct = Math.round(x.download / base * 100);
          r.base.appendChild(h('span', { class: 'sc-baseline-tag ' + (pct >= 90 ? 'good' : pct >= 60 ? 'warn' : 'bad'), text: '达标率 ' + pct + '% / ' + base + ' Mbps' }));
        }
      });

      var last = document.getElementById('sc-last-tested');
      if (last) last.textContent = S.lastEpoch ? '上次测速：' + U.relTime(S.lastEpoch) : '尚未测速';

      var sig = key + ':' + S.series[key].dl.length + ':' + S.series[key].ul.length + ':' + running;
      if (!running && sig !== sparkSig) { sparkSig = sig; drawSparks(key); }
    }

    return { node: node, update: update };
  }

  /* =========================================================================
     Latency — compact 3-column site cards showing ONLY icon, site & delay
     ========================================================================= */
  function latency(ctx) {
    var S = ctx.state, A = ctx.actions;
    var lists = {}, sums = {}, sig = '';

    function group(key, title) {
      lists[key] = h('div', { class: 'sc-ping-list', id: 'sc-ping-list-' + key });
      sums[key] = h('span', { class: 'sc-ping-sum-pill', id: 'sc-ping-summary-' + key });
      return h('div', { class: 'sc-card sc-pingpanel ' + key + ' sc-animate-in', id: 'sc-ping-card-' + key }, [
        h('div', { class: 'sc-panel-head' }, [
          h('div', { class: 'sc-title-row' }, [h('i', { class: 'sc-dot ' + key }), h('h3', { text: title })]),
          sums[key]
        ]),
        lists[key]
      ]);
    }

    var probeBtn = h('button', { class: 'sc-btn primary sm', id: 'sc-ping-all', text: '全部探测', onclick: A.startPing });
    var node = h('div', { class: 'sc-view' }, [
      h('div', { class: 'sc-toolbar sc-animate-in' }, [
        h('div', {}, [h('h2', { class: 'sc-toolbar-title', text: '常用网站延迟' }), h('span', { class: 'hint', text: '国内直连 · 海外按路由并发探测' })]),
        probeBtn
      ]),
      group('cn', '国内常用网站'),
      group('global', '海外常用网站')
    ]);

    function row(it, key) {
      var ok = typeof it.current === 'number' && it.current > 0, g = U.pingGrade(ok ? it.current : null);
      return h('div', { class: 'sc-ping-row ' + g.cls }, [
        h('div', { class: 'sc-ping-ident' }, [U.siteIcon(it.name, it.host, key), h('div', { class: 'sc-ping-meta' }, [
          h('div', { class: 'sc-ping-name', text: it.name }),
          h('div', { class: 'sc-ping-host', text: it.host })
        ])]),
        h('span', { class: 'sc-ping-val ' + g.cls, text: ok ? U.fmt(it.current, 0) + ' ms' : '--' })
      ]);
    }

    function update() {
      var s = JSON.stringify(S.ping) + S.probing;
      if (s === sig) return;
      sig = s;
      probeBtn.disabled = !!S.probing;
      probeBtn.textContent = S.probing ? '探测中…' : '全部探测';
      ['cn', 'global'].forEach(function (k) {
        var rows = S.ping[k] || [];
        lists[k].innerHTML = '';
        if (!rows.length) lists[k].appendChild(h('div', { class: 'sc-empty', text: '尚未探测，点击右上角「全部探测」' }));
        rows.forEach(function (it) { lists[k].appendChild(row(it, k)); });
        var v = rows.map(function (r) { return r.current; }).filter(function (x) { return typeof x === 'number' && x > 0; });
        var avg = v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
        sums[k].textContent = (avg == null ? '--' : '均值 ' + U.fmt(avg, 0) + ' ms') + ' · ' + v.length + '/' + rows.length;
      });
    }
    return { node: node, update: update };
  }

  /* =========================================================================
     History
     ========================================================================= */
  var RANGES = [['24h', 86400], ['7d', 604800], ['30d', 2592000], ['all', 0]];

  function filtered(S) {
    var sec = 0;
    RANGES.forEach(function (r) { if (r[0] === S.historyRange) sec = r[1]; });
    if (!sec) return S.history.slice();
    var cut = Date.now() - sec * 1000;
    return S.history.filter(function (r) { var t = U.rowEpoch(r); return !t || t >= cut; });
  }

  function exportRows(S, type) {
    var rows = filtered(S), text;
    if (type === 'json') {
      text = JSON.stringify({ exported: new Date().toISOString(), range: S.historyRange, entries: rows }, null, 2);
    } else {
      var keys = ['time', 'region', 'engine', 'server', 'download', 'upload', 'ping', 'jitter', 'loss'];
      text = '\ufeff' + ['时间', '区域', '引擎', '节点', '下载(Mbps)', '上传(Mbps)', '延迟(ms)', '抖动(ms)', '丢包(%)'].map(U.csvCell).join(',') + '\n' +
        rows.map(function (r) { return keys.map(function (k) { return U.csvCell(r[k]); }).join(','); }).join('\n');
    }
    var url = URL.createObjectURL(new Blob([text], { type: type === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }));
    var a = h('a', { href: url, download: 'speedcenter-' + new Date().toISOString().slice(0, 10) + '.' + type });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    U.toast('已导出 ' + rows.length + ' 条记录');
  }

  function history(ctx) {
    var S = ctx.state, A = ctx.actions;
    var node = h('div', { class: 'sc-view' });
    var sig = '';

    function bwCell(cls, arrow, v, max) {
      var pct = typeof v === 'number' ? Math.max(4, Math.min(100, Math.round(v / max * 100))) : 0;
      return h('td', { class: 'sc-td-bw' }, [
        h('div', { class: 'sc-hist-bw ' + cls }, [h('span', { text: arrow }), h('strong', { text: U.speedText(v, S.unit) }), h('small', { text: U.unitLabel(S.unit) })]),
        h('div', { class: 'sc-hist-bar' }, [h('i', { class: cls, style: { width: pct + '%' } })])
      ]);
    }

    function render() {
      var rows = filtered(S), sp = [], uLabel = U.unitLabel(S.unit);
      rows.forEach(function (r) { if (typeof r.download === 'number') sp.push(r.download); if (typeof r.upload === 'number') sp.push(r.upload); });
      var max = sp.length ? Math.max.apply(null, sp) : 1000;
      var dl = rows.map(function (r) { return r.download; }).filter(function (v) { return typeof v === 'number'; });
      var ul = rows.map(function (r) { return r.upload; }).filter(function (v) { return typeof v === 'number'; });
      var avg = function (a) {
        if (!a.length) return '--';
        var mean = a.reduce(function (x, y) { return x + y; }, 0) / a.length;
        return U.speedText(mean, S.unit) + ' ' + uLabel;
      };
      var stat = function (l, v, c) { return h('div', { class: 'sc-summary-item ' + (c || '') }, [h('span', { text: l }), h('strong', { text: v })]); };

      var bar = h('div', { class: 'sc-range' }, RANGES.map(function (r) {
        return h('button', { class: 'sc-range-btn' + (S.historyRange === r[0] ? ' active' : ''), text: r[0] === 'all' ? '全部' : r[0].toUpperCase(), onclick: function () { S.historyRange = r[0]; sig = ''; render(); } });
      }));
      var body = h('tbody');
      if (!rows.length) body.appendChild(h('tr', {}, [h('td', { colspan: 9, class: 'sc-empty', text: '该时间范围内暂无测速记录' })]));
      rows.forEach(function (r) {
        body.appendChild(h('tr', {}, [
          h('td', { text: r.time }),
          h('td', {}, [h('span', { class: 'tag ' + (r.region === 'cn' ? 'cn' : 'global'), text: r.region === 'cn' ? '国内' : '国际' })]),
          h('td', { text: r.engine || '-' }), h('td', { text: (r.server || '-') + (r.ip ? ' (' + r.ip + ')' : '') }),
          bwCell('dl', '↓', r.download, max), bwCell('ul', '↑', r.upload, max),
          h('td', { class: 'sc-num', text: r.ping == null ? '--' : U.fmt(r.ping, 0) + ' ms' }),
          h('td', { class: 'sc-num', text: r.jitter == null ? '--' : U.fmt(r.jitter, 0) + ' ms' }),
          h('td', { class: 'sc-num', text: r.loss == null ? '--' : U.fmt(r.loss, 0) + '%' })
        ]));
      });

      node.innerHTML = '';
      node.appendChild(h('div', { class: 'sc-card sc-animate-in' }, [
        h('div', { class: 'sc-card-title' }, [h('h2', { text: '趋势与统计' }), h('span', { class: 'hint', text: '下载 ↓ / 上传 ↑ 历史曲线' })]),
        h('div', { class: 'sc-summary sc-hist-summary' }, [stat('记录总数', String(rows.length)), stat('↓ 平均下载', avg(dl), 'dl'), stat('↑ 平均上传', avg(ul), 'ul'), stat('★ 峰值下载', dl.length ? U.speedText(Math.max.apply(null, dl), S.unit) + ' ' + uLabel : '--', 'dl')]),
        C.trend(rows, S.unit)
      ]));
      node.appendChild(h('div', { class: 'sc-card sc-animate-in' }, [
        h('div', { class: 'sc-card-title' }, [h('h2', { text: '全部记录' }), h('span', { class: 'hint', text: '显示 ' + rows.length + ' / ' + S.history.length + ' 条' })]),
        h('div', { class: 'sc-table-toolbar' }, [bar, h('div', { class: 'sc-row' }, [
          h('button', { class: 'sc-btn sm', text: '导出 CSV', onclick: function () { exportRows(S, 'csv'); } }),
          h('button', { class: 'sc-btn sm', text: '导出 JSON', onclick: function () { exportRows(S, 'json'); } })
        ])]),
        h('div', { class: 'sc-table-wrap' }, [h('table', { class: 'sc-table' }, [
          h('thead', {}, [h('tr', {}, ['时间', '区域', '引擎', '节点', '↓ 下载带宽', '↑ 上传带宽', '延迟', '抖动', '丢包'].map(function (t) { return h('th', { text: t }); }))]), body
        ])])
      ]));
    }

    function update() {
      var s = S.history.length + ':' + (S.history[0] && S.history[0].epoch) + ':' + S.historyRange + ':' + S.unit;
      if (s !== sig) { sig = s; render(); }
    }
    return { node: node, update: update };
  }

  var PRESET_TARGETS = [
    { region: 'cn', name: '京东', host: 'www.jd.com', ip: '', mode: 'https' },
    { region: 'cn', name: '知乎', host: 'www.zhihu.com', ip: '', mode: 'https' },
    { region: 'cn', name: '抖音', host: 'www.douyin.com', ip: '', mode: 'https' },
    { region: 'global', name: 'Steam', host: 'store.steampowered.com', ip: '', mode: 'https' },
    { region: 'global', name: 'Netflix', host: 'www.netflix.com', ip: '', mode: 'https' },
    { region: 'global', name: 'Discord', host: 'discord.com', ip: '', mode: 'https' },
    { region: 'global', name: 'X', host: 'x.com', ip: '', mode: 'https' }
  ];

  function parseTargetsText(txt) {
    return String(txt || '').split('\n').map(function (l) {
      var p = l.trim().split(',');
      if (p.length < 3 || !p[2].trim()) return null;
      return {
        region: p[0].trim() === 'global' ? 'global' : 'cn',
        name: p[1].trim() || p[2].trim(),
        host: p[2].trim(),
        ip: (p[3] || '').trim(),
        mode: (p[4] || '').trim() === 'https' ? 'https' : 'icmp'
      };
    }).filter(Boolean);
  }

  function formatTargetsText(list) {
    return list.filter(function (t) { return t.host && t.host.trim(); }).map(function (t) {
      return [t.region === 'global' ? 'global' : 'cn', (t.name || t.host).replace(/,/g, ' '), t.host.trim(), (t.ip || '').trim(), t.mode === 'https' ? 'https' : 'icmp'].join(',');
    }).join('\n');
  }

  /* =========================================================================
     Settings — everything "set once": engine, node source, visual targets, schedule…
     ========================================================================= */
  function settings(ctx) {
    var S = ctx.state, A = ctx.actions, cfg = S.config;
    function sel(opts, val) {
      var s = h('select', {}, opts.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      s.value = val;
      return s;
    }
    function field(label, input, wide) { return h('div', { class: 'sc-field' + (wide ? ' wide' : '') }, [h('label', { text: label }), input]); }

    var engine = sel([['ookla', 'Ookla / Speedtest.net（自动选用 speedtest-go）'], ['librespeed', 'LibreSpeed CLI'], ['speedtestcpp', 'SpeedTest++ CLI']], cfg.engine || 'ookla');
    var source = sel([['auto', '自动（按区域）'], ['cn', '国内节点列表'], ['global', '海外节点列表']], cfg.serverSource || 'auto');
    var cnList = h('input', { type: 'text', value: cfg.cnServerList || '', placeholder: '留空使用内置国内骨干直连节点' });
    var glList = h('input', { type: 'text', value: cfg.globalServerList || '', placeholder: '留空自动选择最佳节点' });

    var targetRows = parseTargetsText(cfg.targets);
    var targets = h('textarea', { oninput: function () { targetRows = parseTargetsText(targets.value); renderTargetList(); } });
    targets.value = cfg.targets || '';

    var targetListEl = h('div', { class: 'sc-target-list', id: 'sc-target-list' });
    function syncTextarea() { targets.value = formatTargetsText(targetRows); }

    function renderTargetList() {
      targetListEl.innerHTML = '';
      if (!targetRows.length) targetListEl.appendChild(h('div', { class: 'sc-empty', text: '暂无监控站点，点击下方按钮或预设模板添加' }));
      targetRows.forEach(function (it, idx) {
        var rSel = sel([['cn', '国内'], ['global', '海外']], it.region);
        rSel.className = 'sc-t-region';
        rSel.onchange = function () { it.region = rSel.value; syncTextarea(); };
        var nInp = h('input', { type: 'text', value: it.name, placeholder: '站点名称', oninput: function () { it.name = nInp.value; syncTextarea(); } });
        var hInp = h('input', { type: 'text', value: it.host, placeholder: '域名 (如 www.baidu.com)', oninput: function () { it.host = hInp.value; syncTextarea(); } });
        var ipInp = h('input', { type: 'text', value: it.ip, placeholder: '固定 IP（可选）', oninput: function () { it.ip = ipInp.value; syncTextarea(); } });
        var mSel = sel([['icmp', 'ICMP'], ['https', 'HTTPS']], it.mode);
        mSel.className = 'sc-t-mode';
        mSel.onchange = function () { it.mode = mSel.value; syncTextarea(); };
        var delBtn = h('button', { class: 'sc-btn sm sc-t-del', title: '删除站点', text: '✕', onclick: function () {
          targetRows.splice(idx, 1); syncTextarea(); renderTargetList();
        } });
        targetListEl.appendChild(h('div', { class: 'sc-target-row' }, [rSel, nInp, hInp, ipInp, mSel, delBtn]));
      });
    }
    renderTargetList();

    var presetsBar = h('div', { class: 'sc-preset-bar' }, [
      h('span', { class: 'sc-preset-label', text: '常用预设：' })
    ].concat(PRESET_TARGETS.map(function (p) {
      return h('button', { class: 'sc-preset-chip', text: '+ ' + p.name, onclick: function () {
        if (targetRows.some(function (t) { return t.host === p.host; })) { U.toast(p.name + ' 已在列表中'); return; }
        targetRows.push({ region: p.region, name: p.name, host: p.host, ip: p.ip, mode: p.mode });
        syncTextarea(); renderTargetList();
      } });
    })));

    var addTargetBtn = h('button', { class: 'sc-btn sm', id: 'sc-add-target', text: '+ 添加自定义站点', onclick: function () {
      targetRows.push({ region: 'cn', name: '', host: '', ip: '', mode: 'icmp' });
      renderTargetList();
    } });

    var schedule = sel([['off', '关闭'], ['6h', '每 6 小时'], ['12h', '每 12 小时'], ['1d', '每天'], ['7d', '每周']], cfg.schedule || 'off');
    var retention = h('input', { type: 'number', min: '1', max: '365', value: String(cfg.retention || 30) });
    var baseline = h('input', { type: 'number', min: '0', max: '100000', value: String(cfg.baselineMbps || 0) });

    var saveBtn = h('button', { class: 'sc-btn primary', text: '保存设置', onclick: function () {
      saveBtn.disabled = true;
      A.saveConfig({
        engine: engine.value, serverSource: source.value, cnServerList: cnList.value, globalServerList: glList.value,
        targets: targets.value, schedule: schedule.value, retention: Number(retention.value) || 30, baselineMbps: Number(baseline.value) || 0
      }).then(function () { saveBtn.disabled = false; U.toast('设置已保存'); })
        .catch(function (e) { saveBtn.disabled = false; U.toast('保存失败: ' + e, true); });
    } });

    function sec(title, hint, body) {
      return h('div', { class: 'sc-card sc-animate-in' }, [h('div', { class: 'sc-card-title' }, [h('h2', { text: title }), h('span', { class: 'hint', text: hint })]), body]);
    }

    var node = h('div', { class: 'sc-view' }, [
      sec('测速引擎', '一般无需修改', h('div', {}, [
        h('div', { class: 'sc-controls' }, [field('测速引擎', engine), field('节点来源', source)]),
        h('div', { class: 'sc-controls' }, [field('国内节点 JSON', cnList), field('海外节点 JSON', glList)]),
        h('p', { class: 'sc-note', text: '国内线路默认直连国内骨干节点（绕过透明代理）；海外线路经系统默认路由。' })
      ])),
      sec('延迟站点管理', '可视化增删站点，或点击预设一键添加', h('div', { class: 'sc-target-editor' }, [
        presetsBar,
        h('div', { class: 'sc-target-head' }, ['区域', '名称', '域名', '固定 IP (可选)', '模式', ''].map(function (t) { return h('span', { text: t }); })),
        targetListEl,
        h('div', { class: 'sc-row', style: { marginTop: '12px', justifyContent: 'space-between' } }, [addTargetBtn]),
        h('details', { class: 'sc-adv-raw' }, [h('summary', { text: '高级：批量文本编辑（CSV）' }), targets])
      ])),
      sec('计划任务与基线', '历史记录持久化保存在路由器 /etc/speedcenter', h('div', {}, [
        h('div', { class: 'sc-controls' }, [field('定时测速', schedule), field('历史保留天数', retention), field('套餐带宽 Mbps（0=不显示达标率）', baseline)]),
        h('div', { class: 'sc-row end', style: { marginTop: '16px' } }, [saveBtn])
      ]))
    ]);
    return { node: node, update: function () {} };
  }

  SC.views = { overview: overview, latency: latency, history: history, settings: settings };
})(typeof window !== 'undefined' ? window : this);
