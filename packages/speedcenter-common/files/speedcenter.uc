#!/usr/bin/env ucode
// SpeedCenter ubus backend. Long running work is delegated to the detached
// /usr/libexec/speedcenter-run helper; rpcd itself only reads small JSON files.
'use strict';

import { readfile, writefile } from 'fs';
import { cursor } from 'uci';

const STATE_DIR = '/tmp/speedcenter';
const STATE = `${STATE_DIR}/state.json`;
const RESULT = `${STATE_DIR}/result.json`;
const PING = `${STATE_DIR}/ping.json`;
const HISTORY = `${STATE_DIR}/history.jsonl`;
const STOP = `${STATE_DIR}/stop`;
const RUN = '/usr/libexec/speedcenter-run';
const ENGINES = [ 'ookla', 'librespeed', 'speedtestcpp' ];
const REGIONS = [ 'cn', 'global', 'both' ];
const SOURCES = [ 'auto', 'cn', 'global' ];

function ensure_dir() {
	system(`mkdir -p ${STATE_DIR} 2>/dev/null`);
}

function read_json(path) {
	const text = readfile(path);
	if (text == null || text == '')
		return null;
	try {
		return json(text);
	}
	catch (e) {
		return null;
	}
}

function decode_obj(text) {
	if (!text)
		return null;
	try {
		return json(text);
	}
	catch (e) {
		return null;
	}
}

function pgid_of(pid) {
	const st = readfile(`/proc/${pid}/stat`);
	if (!st)
		return 0;
	const f = split(trim(substr(st, rindex(st, ')') + 1)), ' ');
	return int(f[2] ?? 0);
}

function pid_alive(pid) {
	if (!pid)
		return false;
	return system(`kill -0 ${int(pid)} 2>/dev/null`) == 0;
}

function default_config() {
	return {
		engine: 'ookla',
		region: 'cn',
		server_source: 'auto',
		cn_server_list: '/usr/share/speedcenter/servers-cn.example.json',
		global_server_list: '/usr/share/speedcenter/servers-global.example.json',
		retention: 30,
		schedule: 'off',
		theme: 'auto',
		baseline_mbps: 0
	};
}

function get_config() {
	const uci = cursor();
	const out = default_config();
	const main = uci.get('speedcenter', 'main') ?? {};
	for (let k in out)
		if (main[k] != null)
			out[k] = main[k];
	const targets = [];
	uci.foreach('speedcenter', 'target', function (s) {
		push(targets, {
			name: s.name ?? s['.name'],
			host: s.host ?? '',
			ip: s.ip ?? '',
			mode: s.mode ?? 'icmp',
			region: s.region ?? 'cn'
		});
	});
	uci.unload('speedcenter');
	out.targets = targets;
	return out;
}

function launch(args) {
	system(`start-stop-daemon -S -b -x ${RUN} -- ${args} >/dev/null 2>&1 || ( setsid ${RUN} ${args} >/dev/null 2>&1 & )`);
}

function start(args) {
	const engine = args.engine ?? 'ookla';
	const region = args.region ?? 'both';
	const source = args.server_source ?? 'auto';
	if (index(ENGINES, engine) < 0 || index(REGIONS, region) < 0)
		return { ok: false, error: 'invalid engine or region' };
	if (index(SOURCES, source) < 0)
		return { ok: false, error: 'invalid server source' };

	ensure_dir();
	const st = read_json(STATE) ?? {};
	if ((st.running === true || int(st.running ?? 0) === 1) && pid_alive(int(st.pid ?? 0)))
		return { ok: false, error: 'a measurement is already running' };

	system(`rm -f ${STOP}`);
	launch(`--start --engine ${engine} --region ${region} --server-source ${source}`);
	return { ok: true };
}

function stop() {
	ensure_dir();
	writefile(STOP, `${time()}\n`);
	const st = read_json(STATE) ?? {};
	const pid = int(st.pid ?? 0);
	if (pid_alive(pid)) {
		const pg = pgid_of(pid);
		if (pg > 0)
			system(`kill -TERM -${pg} 2>/dev/null`);
		else
			system(`kill -TERM ${pid} 2>/dev/null`);
	}
	const cn = st.live?.cn ?? (st.live_cn ?? '{}');
	const global = st.live?.global ?? (st.live_global ?? '{}');
	writefile(STATE,
		`{"running":false,"progress":100,"phase":"stopped","last_error":"","updated":${time()},"pid":0,` +
		`"live_cn":${type(cn) == 'string' ? cn : '{}'},` +
		`"live_global":${type(global) == 'string' ? global : '{}'}}`);
	return { ok: true };
}

function decode_live(v) {
	if (v == null)
		return {};
	if (type(v) == 'object')
		return v;
	if (type(v) == 'string')
		return decode_obj(v) ?? {};
	return {};
}

function shaped(raw) {
	const live = raw.live ?? {};
	const nestedCn = type(live) == 'object' ? live.cn : null;
	const nestedGlobal = type(live) == 'object' ? live.global : null;
	let cn = decode_live(nestedCn != null ? nestedCn : raw.live_cn);
	let global = decode_live(nestedGlobal != null ? nestedGlobal : raw.live_global);
	let last = raw.lastResult;
	if (last == null && (raw.last_cn || raw.last_global)) {
		last = {
			cn: decode_live(raw.last_cn),
			global: decode_live(raw.last_global)
		};
	}
	return {
		running: (raw.running === true || int(raw.running ?? 0) === 1),
		progress: int(raw.progress ?? 0),
		phase: raw.phase ?? '',
		last_error: raw.last_error ?? '',
		updated: int(raw.updated ?? 0),
		pid: int(raw.pid ?? 0),
		live: { cn: cn, global: global },
		lastResult: last ?? null
	};
}

function status() {
	ensure_dir();
	const st = shaped(read_json(STATE) ?? {});
	if (st.running && !pid_alive(st.pid)) {
		st.running = false;
		st.phase = 'idle';
		st.progress = 100;
		if (!st.last_error)
			st.last_error = 'measurement process exited unexpectedly';
	}
	return st;
}

function result() {
	ensure_dir();
	return shaped(read_json(RESULT) ?? {});
}

function history(args) {
	ensure_dir();
	const text = readfile(HISTORY);
	let all = [];
	if (text != null && text != '') {
		for (let line in split(trim(text), '\n')) {
			if (line == '')
				continue;
			try {
				push(all, json(line));
			}
			catch (e) {}
		}
	}
	const from = int(args.from ?? 0);
	const to = int(args.to ?? 0);
	const limit = int(args.limit ?? 200) || 200;
	all = sort(all, (a, b) => int(b.epoch ?? 0) - int(a.epoch ?? 0));
	if (from || to) {
		const out = [];
		for (let e in all) {
			const t = int(e.epoch ?? 0);
			if ((!from || t >= from) && (!to || t <= to))
				push(out, e);
		}
		all = out;
	}
	return { entries: all.slice(0, limit) };
}

function ping_start(args) {
	ensure_dir();
	const region = args.region ?? 'both';
	if (index(REGIONS, region) < 0)
		return { ok: false, error: 'invalid region' };
	launch(`--ping --region ${region}`);
	return { ok: true };
}

function ping() {
	ensure_dir();
	const data = read_json(PING);
	if (!data) {
		const cfg = get_config();
		const cn = [], global = [];
		for (let t in (cfg.targets ?? [])) {
			const item = {
				name: t.name,
				host: t.host,
				ip: t.ip,
				mode: t.mode,
				current: null,
				loss: null,
				samples: []
			};
			if (t.region == 'global')
				push(global, item);
			else
				push(cn, item);
		}
		launch('--ping --region both');
		return { cn: cn, global: global };
	}
	const normalize = (v) => type(v) == 'array' ? v : (type(v) == 'object' ? v : (decode_obj(v) ?? []));
	return { cn: normalize(data.cn), global: normalize(data.global) };
}

function config() {
	return get_config();
}

function save(args) {
	const uci = cursor();
	const fields = [ 'engine', 'region', 'server_source', 'cn_server_list', 'global_server_list', 'theme' ];
	for (let k in fields)
		uci.set('speedcenter', 'main', fields[k], args[fields[k]] ?? '');
	uci.set('speedcenter', 'main', 'retention', int(args.retention ?? 30));
	uci.set('speedcenter', 'main', 'schedule', args.schedule ?? 'off');
	uci.set('speedcenter', 'main', 'baseline_mbps', int(args.baseline_mbps ?? 0));
	if (args.targets != null) {
		const old = [];
		uci.foreach('speedcenter', 'target', function (s) { push(old, s['.name']); });
		for (let n in old)
			uci.delete('speedcenter', n);
		const lines = split(args.targets, '\n');
		let i = 0;
		for (let line in lines) {
			const parts = split(trim(line), ',');
			if (length(parts) < 3 || trim(parts[2]) == '')
				continue;
			const name = `target${i++}`;
			uci.set('speedcenter', name, 'target');
			uci.set('speedcenter', name, 'region', trim(parts[0]) == 'global' ? 'global' : 'cn');
			uci.set('speedcenter', name, 'name', trim(parts[1]));
			uci.set('speedcenter', name, 'host', trim(parts[2]));
			uci.set('speedcenter', name, 'ip', parts[3] ? trim(parts[3]) : '');
			uci.set('speedcenter', name, 'mode', parts[4] && trim(parts[4]) == 'https' ? 'https' : 'icmp');
		}
	}
	uci.commit('speedcenter');
	uci.unload('speedcenter');
	system('/etc/init.d/speedcenter reload >/dev/null 2>&1');
	return { ok: true };
}

const methods = {
	start: { args: { engine: '', region: '', server_source: '' }, call: start },
	stop: { call: stop },
	status: { call: status },
	result: { call: result },
	history: { args: { from: 0, limit: 0, to: 0 }, call: history },
	ping_start: { args: { region: '' }, call: ping_start },
	ping: { call: ping },
	config: { call: config },
	save: {
		args: {
			engine: '', region: '', server_source: '', cn_server_list: '',
			global_server_list: '', retention: 0, schedule: '', theme: '', baseline_mbps: 0, targets: ''
		},
		call: save
	}
};

return { speedcenter: methods };
