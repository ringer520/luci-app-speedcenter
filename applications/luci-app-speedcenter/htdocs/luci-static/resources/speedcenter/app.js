/* SpeedCenter / app.js — shell, single state tree, polling and actions.
   Load order: util.js → charts.js → views.js → app.js  */
(function (root) {
  'use strict';
  var SC = root.SC, U = SC.util, h = U.el;

  var TABS = [['overview', '测速概览'], ['latency', '网站延迟'], ['history', '历史记录'], ['settings', '设置']];

  function createApp(host, adapter) {
    /* ---------------------------------------------------------------- state */
    var S = {
      tab: 'overview', region: 'cn', theme: 'auto', config: {},
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
        S.region = r;
        S.config.region = r;
        adapter.saveConfig(Object.assign({}, S.config, { theme: S.theme })).catch(function () {});
        rerenderView();
      },

      startSpeed: function () {
        if (S.status.running) return;
        var regions = S.region === 'both' ? ['cn', 'global'] : [S.region];
        regions.forEach(function (k) { S.series[k] = { dl: [], ul: [] }; });
        var prev = S.status.lastResult;
        S.status = { running: true, progress: 4, phase: (S.region === 'global' ? '国际节点' : '国内节点') + ' · 延迟探测', live: {}, lastResult: prev };
        rerenderView();
        adapter.startSpeed({ region: S.region, engine: S.config.engine || 'ookla', serverSource: S.config.serverSource || 'auto' })
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
        S.config = Object.assign({}, S.config, patch, { region: S.region, theme: S.theme });
        return adapter.saveConfig(S.config);
      }
    };

    /* -------------------------------------------------------------- polling */
    // Poll fast while measuring, slowly when idle, and not at all while the tab is hidden.
    function schedulePoll(delay) {
      clearTimeout(pollTimer);
      if (document.hidden) return;
      pollTimer = setTimeout(poll, delay != null ? delay : S.status.running ? 800 : 3000);
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
    var themeBtn = h('button', { class: 'sc-icon-btn', title: '主题：自动 / 浅色 / 深色', text: 'A', onclick: function () {
      S.theme = S.theme === 'light' ? 'dark' : S.theme === 'dark' ? 'auto' : 'light';
      applyTheme();
      adapter.saveConfig(Object.assign({}, S.config, { theme: S.theme, region: S.region })).catch(function () {});
    } });
    var pill = h('div', { class: 'sc-pill ok' }, [h('i', { class: 'dot' }), h('span', { text: '空闲' })]);
    var tabsBox = h('nav', { class: 'sc-tabs', role: 'tablist' });
    var main = h('div', { class: 'sc-content' });

    function applyTheme() {
      if (S.theme === 'auto') host.removeAttribute('data-theme'); else host.setAttribute('data-theme', S.theme);
      themeBtn.textContent = S.theme === 'dark' ? 'D' : S.theme === 'light' ? 'L' : 'A';
    }

    function updatePill() {
      var st = S.status, err = st.last_error && st.last_error !== 'stopped' ? st.last_error : '';
      pill.className = 'sc-pill' + (st.running ? ' running' : err ? ' bad' : ' ok');
      pill.lastChild.textContent = st.running ? '测速中 ' + Math.round(st.progress || 0) + '%' : err ? '异常：' + err : '空闲';
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
    host.innerHTML = '';
    host.appendChild(h('div', { class: 'sc-header' }, [h('div', { class: 'sc-header-inner' }, [
      h('div', { class: 'sc-brand-group' }, [
        h('div', { class: 'sc-logo', text: 'SC' }),
        h('div', { class: 'sc-brand' }, [h('h1', { text: 'SpeedCenter' }), h('p', { text: '国内外双线测速 · 全球延迟观测' })])
      ]),
      tabsBox,
      h('div', { class: 'sc-header-right' }, [pill, themeBtn])
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
      S.region = S.config.region === 'global' || S.config.region === 'both' ? S.config.region : 'cn';
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
