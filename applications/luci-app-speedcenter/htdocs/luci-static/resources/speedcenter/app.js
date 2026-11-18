/* SpeedCenter / app.js — shell, single state tree, polling and actions.
   Load order: util.js → charts.js → views.js → app.js  */
(function (root) {
  'use strict';
  var SC = root.SC, U = SC.util, h = U.el;

  var TABS = [['overview', '测速概览'], ['latency', '网站延迟'], ['history', '历史记录'], ['settings', '设置']];

  function createApp(host, adapter) {
    /* ---------------------------------------------------------------- state */
    var initUnit = 'mbps';
    try { if (root.localStorage && root.localStorage.getItem('sc-unit') === 'mbs') initUnit = 'mbs'; } catch (e) {}
    var S = {
      tab: 'overview', region: 'cn', cnNode: 'auto', unit: initUnit, theme: 'auto', config: {},
      status: { running: false, progress: 0, phase: '', live: {}, lastResult: null },
      ping: { cn: [], global: [] }, probing: false,
      history: [], historyRange: 'all', lastHist: { cn: null, global: null }, lastEpoch: 0,
      series: { cn: { dl: [], ul: [] }, global: { dl: [], ul: [] } }
    };
    var view = null, wasRunning = false, pollTimer = 0;

    /* -------------------------------------------------------------- helpers */
    // refreshing the view also refreshes the header status pill
    function rerenderView() { updatePill(); if (view) view.update(); }

    function setHistory(rows) {
      S.history = rows || [];
      S.lastHist = {
        cn: S.history.find(function (r) { return r.region === 'cn'; }) || null,
        global: S.history.find(function (r) { return r.region === 'global'; }) || null
      };
      if (S.history.length) S.lastEpoch = U.rowEpoch(S.history[0]) || S.lastEpoch;
      ['cn', 'global'].forEach(function (k) {
        var pts = S.history.filter(function (r) { return r.region === k; }).slice(0, 20).reverse();
        if (!S.series[k].dl.length) S.series[k].dl = pts.map(function (r) { return Number(r.download) || 0; });
        if (!S.series[k].ul.length) S.series[k].ul = pts.map(function (r) { return Number(r.upload) || 0; });
      });
    }

    /* -------------------------------------------------------------- actions */
    var A = {
      setRegion: function (r) {
        if (S.status.running) return;
        S.region = r === 'global' ? 'global' : 'cn';
        S.config.region = S.region;
        adapter.saveConfig(Object.assign({}, S.config, { theme: S.theme, cnNode: S.cnNode })).catch(function () {});
        rerenderView();
      },

      setCnNode: function (n) {
        if (S.status.running) return;
        S.cnNode = n || 'auto';
        S.config.cnNode = S.cnNode;
        adapter.saveConfig(Object.assign({}, S.config, { theme: S.theme, region: S.region, cnNode: S.cnNode })).catch(function () {});
        rerenderView();
      },

      setUnit: function (u) {
        S.unit = u === 'mbs' ? 'mbs' : 'mbps';
        try { if (root.localStorage) root.localStorage.setItem('sc-unit', S.unit); } catch (e) {}
        renderUnitToggle();
        rerenderView();
      },

      startSpeed: function () {
        if (S.status.running) return;
        var region = S.region === 'global' ? 'global' : 'cn';
        S.series[region] = { dl: [], ul: [] };
        var prev = S.status.lastResult;
        S.status = { running: true, progress: 4, phase: (region === 'global' ? '国际节点' : '国内节点') + ' · 延迟探测', live: {}, lastResult: prev };
        rerenderView();
        adapter.startSpeed({ region: region, engine: S.config.engine || 'ookla', serverSource: S.config.serverSource || 'auto', cnNode: S.cnNode || 'auto' })
          .then(function () { schedulePoll(300); })
          .catch(function (e) {
            S.status.running = false;
            rerenderView();
            U.toast('启动失败: ' + e, true);
          });
      },

      stopSpeed: function () {
        adapter.stopSpeed().then(function () { S.status.running = false; rerenderView(); }).catch(function () {});
      },

      startPing: function () {
        if (S.probing) return;
        S.probing = true;
        rerenderView();
        adapter.startPing('both').then(function () {
          U.toast('已开始探测全部站点');
          [1200, 2600, 4200].forEach(function (ms) { setTimeout(A.refreshPing, ms); });
          setTimeout(function () { S.probing = false; rerenderView(); }, 4300);
        }).catch(function (e) { S.probing = false; rerenderView(); U.toast('探测失败: ' + e, true); });
      },

      refreshPing: function () {
        adapter.getPing().then(function (d) {
          d = d || { cn: [], global: [] };
          if (JSON.stringify(d) !== JSON.stringify(S.ping)) { S.ping = d; rerenderView(); }
        }).catch(function () {});
      },

      refreshHistory: function () {
        return adapter.getHistory().then(function (rows) { setHistory(rows); rerenderView(); }).catch(function () {});
      },

      saveConfig: function (patch) {
        S.config = Object.assign({}, S.config, patch, { region: S.region, cnNode: S.cnNode, theme: S.theme });
        return adapter.saveConfig(S.config);
      }
    };

    /* -------------------------------------------------------------- polling */
    // Poll fast while measuring, slowly when idle, and not at all while the tab is hidden.
    function schedulePoll(delay) {
      clearTimeout(pollTimer);
      if (document.hidden) return;
      pollTimer = setTimeout(poll, delay != null ? delay : S.status.running ? 500 : 3000);
    }

    function poll() {
      adapter.getStatus().then(function (st) {
        S.status = st || S.status;
        if (wasRunning && !S.status.running) { S.lastEpoch = Date.now(); A.refreshHistory(); }
        wasRunning = !!S.status.running;
        rerenderView();
      }).catch(function () {}).then(function () { schedulePoll(); });
    }

    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); else clearTimeout(pollTimer); });

    /* ---------------------------------------------------------------- shell */
    function themeSvg(mode) {
      var s = U.svg('svg', { viewBox: '0 0 20 20', width: 16, height: 16 });
      if (mode === 'dark') {
        s.appendChild(U.svg('path', { d: 'M15.8 12.6A6.5 6.5 0 0 1 7.4 4.2a6.5 6.5 0 1 0 8.4 8.4z', fill: 'currentColor' }));
      } else if (mode === 'light') {
        s.appendChild(U.svg('circle', { cx: 10, cy: 10, r: 4, fill: 'currentColor' }));
        s.appendChild(U.svg('path', { d: 'M10 2v2m0 12v2M2 10h2m12 0h2m-2.3-5.7-1.4 1.4M5.7 14.3l-1.4 1.4m0-11.4 1.4 1.4m8.6 8.6 1.4 1.4', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
      } else {
        s.appendChild(U.svg('circle', { cx: 10, cy: 10, r: 6.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }));
        s.appendChild(U.svg('path', { d: 'M10 3.5a6.5 6.5 0 0 1 0 13z', fill: 'currentColor' }));
      }
      return s;
    }

    var themeBtn = h('button', { class: 'sc-icon-btn', title: '主题：自动 / 浅色 / 深色', onclick: function () {
      S.theme = S.theme === 'light' ? 'dark' : S.theme === 'dark' ? 'auto' : 'light';
      applyTheme();
      adapter.saveConfig(Object.assign({}, S.config, { theme: S.theme, region: S.region, cnNode: S.cnNode })).catch(function () {});
    } });
    var unitBtn = h('button', { class: 'sc-unit-btn', id: 'sc-unit-toggle', title: '切换网速单位 (Mbps / MB/s)', onclick: function () {
      A.setUnit(S.unit === 'mbps' ? 'mbs' : 'mbps');
    } });
    function renderUnitToggle() {
      unitBtn.innerHTML = '';
      unitBtn.appendChild(h('span', { class: S.unit === 'mbps' ? 'active' : '', text: 'Mbps' }));
      unitBtn.appendChild(h('span', { class: S.unit === 'mbs' ? 'active' : '', text: 'MB/s' }));
    }
    renderUnitToggle();

    var pill = h('div', { class: 'sc-pill' }, [h('i', { class: 'dot' }), h('span', { text: '' })]);
    var tabsBox = h('nav', { class: 'sc-tabs', role: 'tablist' });
    var main = h('div', { class: 'sc-content' });

    function applyTheme() {
      if (S.theme === 'auto') host.removeAttribute('data-theme'); else host.setAttribute('data-theme', S.theme);
      themeBtn.innerHTML = '';
      themeBtn.appendChild(themeSvg(S.theme));
      themeBtn.title = '当前主题：' + (S.theme === 'dark' ? '深色' : S.theme === 'light' ? '浅色' : '跟随系统') + '（点击切换）';
    }

    function updatePill() {
      var st = S.status, err = st.last_error && st.last_error !== 'stopped' ? st.last_error : '';
      if (!st.running && !err) { pill.style.display = 'none'; return; }
      pill.style.display = '';
      pill.className = 'sc-pill' + (st.running ? ' running' : ' bad');
      pill.lastChild.textContent = st.running ? '测速中 ' + Math.round(st.progress || 0) + '%' : '异常：' + err;
    }

    function renderTabs() {
      tabsBox.innerHTML = '';
      TABS.forEach(function (t) {
        tabsBox.appendChild(h('button', { class: 'sc-tab' + (S.tab === t[0] ? ' active' : ''), text: t[1], onclick: function () { go(t[0]); } }));
      });
    }

    function go(tab) {
      S.tab = tab;
      renderTabs();
      view = SC.views[tab]({ state: S, actions: A });
      main.innerHTML = '';
      main.appendChild(view.node);
      var cards = main.querySelectorAll('.sc-animate-in');
      for (var i = 0; i < cards.length; i++) cards[i].style.animationDelay = (i * 0.04) + 's';
      view.update();
      if (tab === 'latency') A.refreshPing();
      if (tab === 'history') A.refreshHistory();
    }

    host.classList.add('sc-app');
    if (host.id !== 'speedcenter-app') host.classList.add('sc-app--standalone');
    if (document.head && !document.querySelector('link[data-sc-icon]')) {
      var fav = document.createElement('link');
      fav.rel = 'icon'; fav.type = 'image/svg+xml'; fav.setAttribute('data-sc-icon', '1');
      fav.href = 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString(U.brandIcon(64)));
      document.head.appendChild(fav);
    }
    host.innerHTML = '';
    host.appendChild(h('div', { class: 'sc-header' }, [h('div', { class: 'sc-header-inner' }, [
      h('div', { class: 'sc-brand-group' }, [
        h('div', { class: 'sc-logo' }, [U.brandIcon(38)]),
        h('div', { class: 'sc-brand' }, [h('h1', { text: 'SpeedCenter' }), h('p', { text: '分线带宽测速 · 全球延迟观测' })])
      ]),
      tabsBox,
      h('div', { class: 'sc-header-right' }, [pill, unitBtn, themeBtn])
    ])]));
    host.appendChild(h('div', { class: 'sc-wrap' }, [main]));

    /* ----------------------------------------------------------------- boot */
    Promise.all([
      adapter.getConfig().catch(function () { return {}; }),
      adapter.getHistory().catch(function () { return []; }),
      adapter.getPing().catch(function () { return { cn: [], global: [] }; }),
      adapter.getStatus().catch(function () { return S.status; })
    ]).then(function (d) {
      S.config = d[0] || {};
      S.theme = S.config.theme || 'auto';
      S.region = S.config.region === 'global' ? 'global' : 'cn';
      S.cnNode = S.config.cnNode || 'auto';
      setHistory(d[1]);
      S.ping = d[2] || S.ping;
      S.status = d[3] || S.status;
      wasRunning = !!S.status.running;
      applyTheme();
      go('overview');
      updatePill();
      // first boot: nothing probed yet → kick one off so the monitor page is not empty
      var any = (S.ping.cn || []).concat(S.ping.global || []);
      if (any.length && any.every(function (p) { return p.current == null; })) setTimeout(A.refreshPing, 2200);
      schedulePoll(500);
    });
    setInterval(function () { if (!document.hidden && S.tab === 'latency') A.refreshPing(); }, 6000);

    return { refresh: function () { go(S.tab); } };
  }

  root.SpeedCenterUI = { createApp: createApp };
})(typeof window !== 'undefined' ? window : this);
