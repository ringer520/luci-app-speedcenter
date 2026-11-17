#!/usr/bin/env python3
"""Assert installed file paths in built ipk/apk packages are correct for OpenWrt.

Guards the regression where LuCI static assets were packed under htdocs/...
instead of www/... — the browser requests /luci-static/... from the /www web
root, so a htdocs/ prefix makes the view JS 404 and the page never renders.

Usage: python tools/package_layout_check.py
"""
import gzip
import io
import os
import sys
import tarfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DIST = os.path.join(ROOT, "dist")
PKGVER = "0.1.0-r1"

STATIC = [
    "www/luci-static/resources/speedcenter/app.js",
    "www/luci-static/resources/speedcenter/style.css",
    "www/luci-static/resources/view/speedcenter/main.js",
]
OTHER_LUCI = [
    "usr/share/luci/menu.d/luci-app-speedcenter.json",
    "usr/share/rpcd/acl.d/luci-app-speedcenter.json",
]


def ipk_data_paths(path):
    with open(path, "rb") as f:
        blob = f.read()
    pos = 8
    members = {}
    while pos < len(blob):
        hdr = blob[pos:pos + 60].decode("ascii", "replace")
        name = hdr[:16].strip()
        size = int(hdr[48:58].strip())
        payload = blob[pos + 60:pos + 60 + size]
        members[name] = payload
        pos += 60 + size + (size % 2)
    tf = tarfile.open(fileobj=io.BytesIO(gzip.decompress(members["data.tar.gz"])), mode="r:")
    return set(m.name for m in tf.getmembers())


def apk_data_paths(path):
    sys.path.insert(0, HERE)
    from apk_sign import split_gzip_members
    with open(path, "rb") as f:
        members = split_gzip_members(f.read())
    data_seg = members[2][1]           # third gzip stream = data tar
    tf = tarfile.open(fileobj=io.BytesIO(data_seg), mode="r:")
    return set(m.name for m in tf.getmembers())


def check(paths, label):
    problems = []
    for p in STATIC + OTHER_LUCI:
        if p not in paths:
            problems.append("missing: " + p)
    if any(n.startswith("htdocs/") for n in paths):
        problems.append("WRONG prefix htdocs/ present (must be www/)")
    ok = not problems
    print("  [%s] %s" % ("OK" if ok else "!!", label))
    for pr in problems:
        print("       - " + pr)
    return ok


if __name__ == "__main__":
    all_ok = True
    ipk = os.path.join(DIST, "luci-app-speedcenter_%s_all.ipk" % PKGVER)
    apk = os.path.join(DIST, "luci-app-speedcenter_%s_all.apk" % PKGVER)
    print("=== package layout check ===")
    all_ok &= check(ipk_data_paths(ipk), "ipk: " + os.path.basename(ipk))
    all_ok &= check(apk_data_paths(apk), "apk: " + os.path.basename(apk))
    # menu.d must not hide the view behind depends
    menu = os.path.join(ROOT, "applications/luci-app-speedcenter/root/usr/share/luci/menu.d/luci-app-speedcenter.json")
    with open(menu, encoding="utf-8") as f:
        menu_text = f.read()
    no_depends = "depends" not in menu_text
    print("  [%s] menu.d has no visibility-blocking depends" % ("OK" if no_depends else "!!"))
    all_ok &= no_depends
    print("RESULT:", "PASS" if all_ok else "FAIL")
    sys.exit(0 if all_ok else 1)
