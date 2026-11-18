'use strict';
'require view';
'require rpc';
'require ui';

const SC_BASE = 'speedcenter/';
const SC_VER = '5.3.0';

function verUrl(file) {
	const u = L.resource(SC_BASE + file);
	return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'sc=' + SC_VER;
}

const callStatus = rpc.declare({ object: 'speedcenter', method: 'status', expect: { '': {} } });
const callResult = rpc.declare({ object: 'speedcenter', method: 'result', expect: { '': {} } });
const callHistory = rpc.declare({ object: 'speedcenter', method: 'history', params: [ 'from', 'to', 'limit' ], expect: { '': {} } });
const callPing = rpc.declare({ object: 'speedcenter', method: 'ping', expect: { '': {} } });
const callConfig = rpc.declare({ object: 'speedcenter', method: 'config', expect: { '': {} } });
const callStart = rpc.declare({ object: 'speedcenter', method: 'start', params: [ 'engine', 'region', 'server_source', 'cn_node' ], expect: { '': {} } });
const callStop = rpc.declare({ object: 'speedcenter', method: 'stop', expect: { '': {} } });
const callPingStart = rpc.declare({ object: 'speedcenter', method: 'ping_start', params: [ 'region' ], expect: { '': {} } });
const callSave = rpc.declare({
	object: 'speedcenter',
	method: 'save',
	params: [ 'engine', 'region', 'cn_node', 'server_source', 'cn_server_list', 'global_server_list', 'retention', 'schedule', 'theme', 'baseline_mbps', 'targets' ],
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

const SC_SCRIPTS = [ 'util.js', 'charts.js', 'views.js', 'app.js' ];

return view.extend({
	load() {
		// scripts depend on each other → load strictly in order with version cache-buster
		return loadStyle(verUrl('style.css')).then(() =>
			SC_SCRIPTS.reduce((p, f) => p.then(() => loadScript(verUrl(f))), Promise.resolve()));
	},

	render() {
		const root = E('div', { 'id': 'speedcenter-app' });

		const adapter = {
			getConfig: () => callConfig().then((c) => ({
				engine: c.engine || 'ookla',
				region: c.region || 'cn',
				cnNode: c.cn_node || 'auto',
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
				cfg.engine || 'ookla', cfg.region || 'cn', cfg.cnNode || 'auto', cfg.serverSource || 'auto',
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
			startSpeed: (opts) => callStart(opts.engine, opts.region, opts.serverSource || 'auto', opts.cnNode || 'auto'),
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
