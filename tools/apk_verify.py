#!/usr/bin/env python3
"""Independent APK v2 signature + integrity verifier.

Unlike apk_sign.py's self-check (which uses the same cryptography library that
created the signature), this tool extracts the raw segments and verifies with
OpenSSL via the CLI -- the same RSA_verify path apk-tools uses on the device.
It also checks the .PKGINFO datahash against the data gzip stream, so a package
that is correctly signed but internally inconsistent is still caught.

Usage:  python tools/apk_verify.py dist/*.apk
"""
import gzip
import hashlib
import io
import os
import subprocess
import sys
import tarfile
import tempfile

from apk_sign import split_gzip_members, PUB_NAME

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PUB = os.path.join(ROOT, "dist", PUB_NAME)


def _extract_control_files(control_seg_bytes):
    raw = gzip.decompress(control_seg_bytes)
    tf = tarfile.open(fileobj=io.BytesIO(raw), mode="r:")
    out = {}
    for m in tf.getmembers():
        f = tf.extractfile(m)
        if f:
            out[m.name] = f.read()
    return out


def verify(apk_path, pub_path=PUB):
    name = os.path.basename(apk_path)
    res = {"package": name, "ok": False, "checks": []}

    with open(apk_path, "rb") as f:
        data = f.read()
    members = split_gzip_members(data)
    res["checks"].append(("gzip_streams>=3", len(members) >= 3, "%d streams" % len(members)))
    if len(members) < 3:
        return res

    sig_seg, control_seg, data_seg = members[0][1], members[1][0], members[2][0]

    # 1) signature segment structure
    sigtar = tarfile.open(fileobj=io.BytesIO(sig_seg), mode="r:")
    sigs = {m.name: sigtar.extractfile(m).read() for m in sigtar.getmembers()
            if m.name.startswith(".SIGN.")}
    expected = [".SIGN.RSA." + PUB_NAME, ".SIGN.RSA256." + PUB_NAME]
    res["checks"].append(("signature_entries", all(e in sigs for e in expected),
                          ", ".join(sigs.keys())))

    # 2) PKGINFO datahash must match the data gzip stream (sha256)
    ctl = _extract_control_files(control_seg)
    pkginfo = ctl.get(".PKGINFO", b"").decode("utf-8", "replace")
    declared = None
    for line in pkginfo.splitlines():
        if line.strip().startswith("datahash"):
            declared = line.split("=", 1)[1].strip()
    actual = hashlib.sha256(data_seg).hexdigest()
    res["checks"].append(("datahash_matches", declared == actual,
                          "declared=%s actual=%s" % (declared, actual)))

    # 3) OpenSSL cross-verification of each signature over the control stream
    with tempfile.TemporaryDirectory() as td:
        ctl_file = os.path.join(td, "control.tar.gz")
        with open(ctl_file, "wb") as f:
            f.write(control_seg)
        for sig_name, digest_flag in [
            (".SIGN.RSA." + PUB_NAME, "-sha1"),
            (".SIGN.RSA256." + PUB_NAME, "-sha256"),
        ]:
            if sig_name not in sigs:
                res["checks"].append((digest_flag + "_sig", False, "missing"))
                continue
            sig_file = os.path.join(td, "sig.bin")
            with open(sig_file, "wb") as f:
                f.write(sigs[sig_name])
            proc = subprocess.run(
                ["openssl", "dgst", digest_flag, "-verify", pub_path,
                 "-signature", sig_file, ctl_file],
                capture_output=True, text=True,
            )
            ok = proc.returncode == 0 and "Verified OK" in proc.stdout
            res["checks"].append((digest_flag + "_openssl_verify", ok,
                                  proc.stdout.strip() or proc.stderr.strip()))

    res["ok"] = all(ok for _, ok, _ in res["checks"])
    return res


if __name__ == "__main__":
    if not os.path.exists(PUB):
        print("[!] public key missing:", PUB)
        sys.exit(1)
    paths = [p for p in sys.argv[1:] if p.endswith(".apk")]
    if not paths:
        paths = [os.path.join(ROOT, "dist", n) for n in (
            "speedcenter-common_0.1.0-r1_all.apk",
            "luci-app-speedcenter_0.1.0-r1_all.apk",
        )]
    all_ok = True
    for p in paths:
        r = verify(p)
        print("\n===", r["package"], "===")
        for label, ok, detail in r["checks"]:
            print("  [%s] %-26s %s" % ("OK" if ok else "!!", label, detail))
        print("  RESULT:", "PASS" if r["ok"] else "FAIL")
        all_ok = all_ok and r["ok"]
    sys.exit(0 if all_ok else 1)
