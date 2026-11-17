'use strict';
'require view';
'require rpc';
'require ui';

const SC_BASE = 'speedcenter/';

const callStatus = rpc.declare({ object: 'speedcenter', method: 'status', expect: { '': {} } });
const callResult = rpc.declare({ object: 'speedcenter', method: 'result', expect: { '': {} } });
const callHistory = rpc.declare({ object: 'speedcenter', method: 'history', params: [ 'from', 'to', 'limit' ], expect: { '': {} } });
const callPing = rpc.declare({ object: 'speedcenter', method: 'ping', expect: { '': {} } });
const callConfig = rpc.declare({ object: 'speedcenter', method: 'config', expect: { '': {} } });
const callStart = rpc.declare({ object: 'speedcenter', method: 'start', params: [ 'engine', 'region', 'server_source' ], expect: { '': {} } });
const callStop = rpc.declare({ object: 'speedcenter', method: 'stop', expect: { '': {} } });
const callPingStart = rpc.declare({ object: 'speedcenter', method: 'ping_start', params: [ 'region' ], expect: { '': {} } });
const callSave = rpc.declare({
	object: 'speedcenter',
	method: 'save',
	params: [ 'engine', 'region', 'server_source', 'cn_server_list', 'global_server_list', 'retention', 'schedule', 'theme', 'baseline_mbps', 'targets' ],
	expect: { '': {} }
});

function loadScript(src) {
	return new Promise((resolve, reject) => {
		const s = document.createElement('script');
		s.src = src;
		s.onload = resolve;
		s.onerror = () => reject(new Error('failed to load ' + src));
		document.head.appendChild(s);
	});
}

function loadStyle(href) {
	return new Promise((resolve) => {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = href;
		link.onload = resolve;
		link.onerror = resolve;
		document.head.appendChild(link);
	});
}

function toTargets(text) {
	return text;
}

return view.extend({
	load() {
		return Promise.all([
			loadStyle(L.resource(SC_BASE + 'style.css')),
			loadScript(L.resource(SC_BASE + 'app.js'))
		]);
	},

	render() {
		const root = E('div', { 'id': 'speedcenter-app' });

		const adapter = {
			getConfig: () => callConfig().then((c) => ({
				engine: c.engine || 'ookla',
				region: c.region || 'cn',
				serverSource: c.server_source || 'auto',
				cnServerList: c.cn_server_list || '',
				globalServerList: c.global_server_list || '',
				retention: c.retention || 30,
				schedule: c.schedule || 'off',
				theme: c.theme || 'auto',
				baselineMbps: Number(c.baseline_mbps) || 0,
				targets: (c.targets || []).map((t) => [ t.region, t.name, t.host, t.ip, t.mode ].join(',')).join('\n')
			})),
			saveConfig: (cfg) => callSave(
				cfg.engine || 'ookla', cfg.region || 'cn', cfg.serverSource || 'auto',
				cfg.cnServerList || '', cfg.globalServerList || '',
				cfg.retention || 30, cfg.schedule || 'off', cfg.theme || 'auto',
				Number(cfg.baselineMbps) || 0,
				toTargets(cfg.targets)
			),
			getStatus: () => callStatus().then((st) => st && {
				running: !!st.running,
				progress: st.progress || 0,
				phase: st.phase || '',
				last_error: st.last_error || '',
				updated: st.updated || 0,
				live: st.live || {},
				lastResult: st.lastResult || null
			}),
			getResult: () => callResult(),
			getHistory: () => callHistory(0, 0, 300).then((r) => r.entries || []),
			getPing: () => callPing(),
			startSpeed: (opts) => callStart(opts.engine, opts.region, opts.serverSource || 'auto'),
			stopSpeed: () => callStop(),
			startPing: (region) => callPingStart(region)
		};

		setTimeout(() => {
			if (!window.SpeedCenterUI) {
				root.appendChild(E('div', { class: 'sc-empty', text: '界面资源加载失败' }));
				return;
			}
			window.SpeedCenterUI.createApp(root, adapter);
		}, 0);

		return root;
	}
});
