#!/usr/bin/env python3
"""Build installable OpenWrt packages (ipk + apk) for SpeedCenter without a
full OpenWrt toolchain. All shipped files are scripts/config (Architecture=all),
so no cross-compilation is needed.

Usage:  python tools/build_packages.py
Output: dist/*.ipk  and  dist/*.apk
"""
import io
import os
import tarfile
import gzip
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DIST = os.path.join(ROOT, "dist")
os.makedirs(DIST, exist_ok=True)

VERSION = "0.1.0"
RELEASE = "1"
PKGVER = f"{VERSION}-r{RELEASE}"         # apk style; ipk accepts it too
MAINTAINER = "SpeedCenter contributors <speedcenter@example.com>"


def tar_gz_from_entries(entries):
    """entries: list of (arcname, data_bytes, mode). Returns gzip tar bytes."""
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w", format=tarfile.GNU_FORMAT) as tf:
        for arcname, data, mode in entries:
            info = tarfile.TarInfo(arcname)
            info.size = len(data)
            info.mode = mode
            info.uid = 0
            info.gid = 0
            info.uname = "root"
            info.gname = "root"
            info.mtime = 0
            tf.addfile(info, io.BytesIO(data))
    return gzip.compress(raw.getvalue(), mtime=0)


def build_ar(pkg_name, control_entries, data_entries):
    """Build an opkg .ipk: ar archive with debian-binary, control.tar.gz, data.tar.gz."""
    control_gz = tar_gz_from_entries(control_entries)
    data_gz = tar_gz_from_entries(data_entries)
    debian = b"2.0\n"

    def ar_header(name, size, mode=0o644):
        # POSIX ar header: 16 name / 12 mtime / 6 uid / 6 gid / 8 mode / 10 size / 2 fmag
        h = (name.ljust(16)[:16] + "0".ljust(12) + "0".ljust(6) + "0".ljust(6)
             + oct(mode)[2:].ljust(8) + str(size).ljust(10) + "`\n")
        return h.encode("ascii")

    out = io.BytesIO()
    out.write(b"!<arch>\n")
    for name, data, mode in [
        ("debian-binary", debian, 0o644),
        ("control.tar.gz", control_gz, 0o644),
        ("data.tar.gz", data_gz, 0o644),
    ]:
        out.write(ar_header(name, len(data), mode))
        out.write(data)
        if len(data) % 2:      # ar members are 2-byte aligned
            out.write(b"\n")
    return out.getvalue()


def control_file(cfg, with_post=True):
    lines = [
        f"Package: {cfg['name']}",
        f"Version: {PKGVER}",
        f"Depends: {cfg['depends']}",
        f"License: {cfg.get('license','Apache-2.0')}",
        f"Architecture: all",
        f"Maintainer: {MAINTAINER}",
        f"Description: {cfg['description']}",
    ]
    return "\n".join(lines).encode("utf-8") + b"\n"


def postinst():
    return (b"#!/bin/sh\n"
            b'[ -n "${IPKG_INSTROOT}" ] && exit 0\n'
            b"rm -f /tmp/luci-indexcache* /tmp/luci-modulecache/* 2>/dev/null\n"
            b"/etc/init.d/rpcd restart >/dev/null 2>&1\n"
            b"/etc/init.d/uhttpd restart >/dev/null 2>&1\n"
            b"exit 0\n")


def postrm():
    return (b"#!/bin/sh\n"
            b'[ -n "${IPKG_INSTROOT}" ] && exit 0\n'
            b"rm -f /tmp/luci-indexcache* /tmp/luci-modulecache/* 2>/dev/null\n"
            b"/etc/init.d/rpcd restart >/dev/null 2>&1\n"
            b"/etc/init.d/uhttpd restart >/dev/null 2>&1\n"
            b"exit 0\n")


def read(rel):
    with open(os.path.join(ROOT, rel), "rb") as f:
        return f.read().replace(b"\r\n", b"\n")


def package_common():
    base = "packages/speedcenter-common/files"
    cfg = {
        "name": "speedcenter-common",
        "depends": ("rpcd-mod-ucode, ucode, ucode-mod-fs, ucode-mod-uci, "
                    "jsonfilter, jshn, curl, coreutils-timeout"),
        "description": ("SpeedCenter measurement engine - router-side domestic and "
                        "international speed test plus website latency probing, "
                        "exposed over ubus with bounded JSONL history."),
    }
    # destination path -> (source rel path, executable?)
    files = {
        "usr/libexec/speedcenter-run": (f"{base}/speedcenter-run", True),
        "usr/share/rpcd/ucode/speedcenter.uc": (f"{base}/speedcenter.uc", False),
        "etc/config/speedcenter": (f"{base}/speedcenter.config", False),
        "etc/init.d/speedcenter": (f"{base}/speedcenter.init", True),
        "usr/share/speedcenter/servers-cn.example.json": (f"{base}/servers-cn.example.json", False),
        "usr/share/speedcenter/servers-global.example.json": (f"{base}/servers-global.example.json", False),
    }
    data_entries = [(dst, read(src), 0o755 if exe else 0o644)
                    for dst, (src, exe) in files.items()]
    control_entries = [
        ("./control", control_file(cfg), 0o644),
        ("./postinst", postinst(), 0o755),
        ("./postrm", postrm(), 0o755),
        ("./conffiles", b"/etc/config/speedcenter\n", 0o644),
    ]
    return build_ar("speedcenter-common", control_entries, data_entries)


def package_luci():
    base = "applications/luci-app-speedcenter"
    cfg = {
        "name": "luci-app-speedcenter",
        "depends": "luci-base, speedcenter-common",
        "description": ("SpeedCenter LuCI dashboard - modern embedded UI for domestic "
                        "and international speed tests with Chinese and global website "
                        "latency monitoring."),
    }
    files = {
        "www/luci-static/resources/speedcenter/app.js": (f"{base}/htdocs/luci-static/resources/speedcenter/app.js", False),
        "www/luci-static/resources/speedcenter/style.css": (f"{base}/htdocs/luci-static/resources/speedcenter/style.css", False),
        "www/luci-static/resources/view/speedcenter/main.js": (f"{base}/htdocs/luci-static/resources/view/speedcenter/main.js", False),
        "usr/share/luci/menu.d/luci-app-speedcenter.json": (f"{base}/root/usr/share/luci/menu.d/luci-app-speedcenter.json", False),
        "usr/share/rpcd/acl.d/luci-app-speedcenter.json": (f"{base}/root/usr/share/rpcd/acl.d/luci-app-speedcenter.json", False),
    }
    data_entries = [(dst, read(src), 0o755 if exe else 0o644)
                    for dst, (src, exe) in files.items()]
    control_entries = [
        ("./control", control_file(cfg), 0o644),
        ("./postinst", postinst(), 0o755),
    ]
    return build_ar("luci-app-speedcenter", control_entries, data_entries)


def build_converter_input(control_entries, data_entries):
    """The bundled ipk2apk.py expects a gzip tar containing control.tar.gz and
    data.tar.gz as top-level members. Build that intermediate container."""
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w", format=tarfile.GNU_FORMAT) as tf:
        for name, entries in [("control.tar.gz", control_entries),
                              ("data.tar.gz", data_entries)]:
            data = tar_gz_from_entries(entries)
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o644
            info.mtime = 0
            tf.addfile(info, io.BytesIO(data))
    return gzip.compress(raw.getvalue(), mtime=0)


def main():
    ipk_common = os.path.join(DIST, f"speedcenter-common_{PKGVER}_all.ipk")
    ipk_luci = os.path.join(DIST, f"luci-app-speedcenter_{PKGVER}_all.ipk")
    with open(ipk_common, "wb") as f:
        f.write(package_common())
    with open(ipk_luci, "wb") as f:
        f.write(package_luci())
    print(f"[+] wrote {ipk_common}")
    print(f"[+] wrote {ipk_luci}")

    converter = os.path.join(HERE, "ipk2apk.py")
    if os.path.exists(converter):
        # Generate/reuse the stable signing key and export the public half so
        # users can install it once into /etc/apk/keys and use LuCI Web upload.
        sys.path.insert(0, HERE)
        import apk_sign
        priv_key, pub_key = apk_sign.ensure_keypair()
        pub_out = os.path.join(DIST, apk_sign.PUB_NAME)
        with open(pub_key, "rb") as _pf, open(pub_out, "wb") as _of:
            _of.write(_pf.read())
        print(f"[+] exported public key -> {pub_out}")

        jobs = [
            ("speedcenter-common", ipk_common, "packages/speedcenter-common/files", {
                "usr/libexec/speedcenter-run": ("speedcenter-run", True),
                "usr/share/rpcd/ucode/speedcenter.uc": ("speedcenter.uc", False),
                "etc/config/speedcenter": ("speedcenter.config", False),
                "etc/init.d/speedcenter": ("speedcenter.init", True),
                "usr/share/speedcenter/servers-cn.example.json": ("servers-cn.example.json", False),
                "usr/share/speedcenter/servers-global.example.json": ("servers-global.example.json", False),
            }, {
                "name": "speedcenter-common",
                "depends": "rpcd-mod-ucode, ucode, ucode-mod-fs, ucode-mod-uci, jsonfilter, jshn, curl, coreutils-timeout",
                "description": "SpeedCenter measurement engine - router-side speed test and latency probing over ubus.",
            }),
            ("luci-app-speedcenter", ipk_luci, "applications/luci-app-speedcenter", {}, {
                "name": "luci-app-speedcenter",
                "depends": "luci-base, speedcenter-common",
                "description": "SpeedCenter LuCI dashboard - modern embedded speed test and latency UI.",
            }),
        ]
        for name, ipk, base, files, cfg in jobs:
            data_entries = [(dst, read(f"{base}/{src}"), 0o755 if exe else 0o644)
                            for dst, (src, exe) in files.items()] if files else [
                ("www/luci-static/resources/speedcenter/app.js", read(f"{base}/htdocs/luci-static/resources/speedcenter/app.js"), 0o644),
                ("www/luci-static/resources/speedcenter/style.css", read(f"{base}/htdocs/luci-static/resources/speedcenter/style.css"), 0o644),
                ("www/luci-static/resources/view/speedcenter/main.js", read(f"{base}/htdocs/luci-static/resources/view/speedcenter/main.js"), 0o644),
                ("usr/share/luci/menu.d/luci-app-speedcenter.json", read(f"{base}/root/usr/share/luci/menu.d/luci-app-speedcenter.json"), 0o644),
                ("usr/share/rpcd/acl.d/luci-app-speedcenter.json", read(f"{base}/root/usr/share/rpcd/acl.d/luci-app-speedcenter.json"), 0o644),
            ]
            control_entries = [
                ("./control", control_file(cfg), 0o644),
                ("./postinst", postinst(), 0o755),
            ]
            interm = os.path.join(DIST, f"._{name}.conv.tar.gz")
            with open(interm, "wb") as f:
                f.write(build_converter_input(control_entries, data_entries))
            apk = ipk[:-4] + ".apk"
            print(f"[*] converting -> {apk} (signed)")
            subprocess.run([sys.executable, converter, interm, "-o", apk,
                            "--sign", "--pub-name", apk_sign.PUB_NAME],
                           cwd=HERE, check=True)
            os.remove(interm)

        # Verify both signed packages are cryptographically valid APK v2.
        for name, _, _, _, _ in jobs:
            apk = os.path.join(DIST, f"{name}_{PKGVER}_all.apk")
            with open(apk, "rb") as _af:
                rep = apk_sign.verify_signed_apk(_af.read())
            status = "OK" if rep.get("ok") else "FAIL"
            print(f"[verify] {name}: {status} "
                  f"(streams={rep['members']}, "
                  f"sigs={[s['name'].split('.')[1] for s in rep['signatures']]})")
            if not rep.get("ok"):
                raise RuntimeError(f"APK signature self-check failed for {name}: {rep}")
    print("[+] done")


if __name__ == "__main__":
    main()
