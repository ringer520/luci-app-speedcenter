#!/usr/bin/env python3
"""Minimal mock of uhttpd's /ubus JSON-RPC + static file hosting, to exercise
standalone/index.html against a realistic rpcd-like backend."""
import http.server
import json
import os
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8765
SESSION = "a" * 32

STATE = {"running": False, "progress": 0, "live": {}, "lastResult": None}
HISTORY = [
    {"epoch": int(time.time()) - 3600 * i, "time": "sample", "region": "cn" if i % 3 else "global",
     "engine": "ookla", "server": "node", "download": 300 + i * 20, "upload": 120 + i * 5,
     "ping": 12, "jitter": 3, "loss": 0}
    for i in range(6)
]
PING = {"cn": [], "global": []}
CONFIG = {
    "engine": "ookla", "region": "cn", "cn_node": "auto", "server_source": "auto",
    "cn_server_list": "", "global_server_list": "", "retention": 30,
    "schedule": "off", "theme": "auto", "baseline_mbps": 500,
    "targets": [
        {"region": "cn", "name": "百度", "host": "www.baidu.com", "ip": "", "mode": "icmp"},
        {"region": "global", "name": "Google", "host": "www.google.com", "ip": "142.250.196.68", "mode": "https"},
    ],
}


def method_result(method, params):
    if method == "config":
        return CONFIG
    if method == "status":
        return STATE
    if method == "history":
        return {"entries": HISTORY[-int(params.get("limit", 300)):]}
    if method == "ping":
        return PING
    if method == "result":
        return STATE
    if method == "start":
        STATE.update(running=True, progress=0, live={}, lastResult=None)
        return {"ok": True}
    if method == "stop":
        STATE.update(running=False, progress=100)
        return {"ok": True}
    if method == "ping_start":
        PING["cn"] = [{"name": "百度", "host": "www.baidu.com", "ip": "", "mode": "icmp",
                       "current": 11, "loss": 0, "samples": [12, 11, 10, 11]}]
        PING["global"] = [{"name": "Google", "host": "www.google.com", "ip": "142.250.196.68",
                           "mode": "https", "current": 188, "loss": 2, "samples": [190, 188, 185, 188]}]
        return {"ok": True}
    if method == "save":
        for k in ("engine", "region", "server_source", "cn_server_list", "global_server_list", "theme"):
            if k in params:
                CONFIG[k] = params[k]
        if "retention" in params:
            CONFIG["retention"] = params["retention"]
        if "schedule" in params:
            CONFIG["schedule"] = params["schedule"]
        if "baseline_mbps" in params:
            CONFIG["baseline_mbps"] = params["baseline_mbps"]
        if "targets" in params:
            CONFIG["targets"] = []
        return {"ok": True}
    return None


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def translate_path(self, path):
        # On a real router luci.mk installs htdocs into /www, so the page
        # requests /luci-static/... . Map that to the source tree here.
        if path.startswith("/luci-static/"):
            path = "/applications/luci-app-speedcenter/htdocs" + path
        return super().translate_path(path)

    def do_POST(self):
        if self.path != "/ubus":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(length) or b"{}")
        method = req.get("method")
        params = req.get("params", [])
        rid = req.get("id", 1)
        resp = None
        if method == "call" and len(params) >= 3:
            session, obj, m = params[0], params[1], params[2]
            if session == "0" * 32 and obj == "session" and m == "login":
                resp = {"ubus_rpc_session": SESSION, "code": 0, "message": "ok"}
            elif session == SESSION and obj == "speedcenter":
                result = method_result(m, params[3] if len(params) > 3 else {})
                resp = result if result is not None else {"ok": True}
            else:
                resp = {"ubus_rpc_session": "", "code": 1}
        elif method == "list":
            resp = {"speedcenter": {}}
        out = json.dumps({"jsonrpc": "2.0", "id": rid, "result": [0, resp]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"mock ubus at http://127.0.0.1:{PORT}", flush=True)
    srv.serve_forever()
