#!/usr/bin/env python3
"""APK v2 package signing for SpeedCenter (pure Python + cryptography).

OpenWrt 25.12 uses apk-tools v3, which refuses unsigned local packages with
``UNTRUSTED signature``.  Signing the package with a key whose public half is
installed in /etc/apk/keys makes LuCI's Web upload ("System -> Software ->
Upload Package") work without ``--allow-untrusted``.

APK v2 layout is three concatenated gzip streams:

    [ signature tar segment ][ control tar segment ][ data tar ]

Per the Alpine apk spec / abuild-sign, the signature is a DER PKCS#1 v1.5 RSA
signature over the SHA-1 digest of the *control gzip stream bytes*.  Because
our .PKGINFO carries a ``datahash`` line, apk verifies the signature against
the control segment only (abuild does exactly this: ``abuild-sign control.tar.gz``).

We emit two signature files to maximise apk-tools v2/v3 compatibility:
    .SIGN.RSA.speedcenter.rsa.pub      (RSA + SHA1, abuild default)
    .SIGN.RSA256.speedcenter.rsa.pub   (RSA + SHA256)

The public key must be installed as /etc/apk/keys/speedcenter.rsa.pub.

Standard library + ``cryptography`` (already available in the build env).
"""
import gzip
import hashlib
import io
import os
import tarfile

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

HERE = os.path.dirname(os.path.abspath(__file__))
KEYS_DIR = os.path.join(HERE, "keys")
PRIV_PATH = os.path.join(KEYS_DIR, "speedcenter.rsa")
PUB_PATH = os.path.join(KEYS_DIR, "speedcenter.rsa.pub")
PUB_NAME = "speedcenter.rsa.pub"          # basename apk looks up in /etc/apk/keys


def ensure_keypair():
    """Create a stable RSA keypair once and reuse it on later builds.

    Keeping the same private key across builds means users install the public
    key a single time and every future update verifies automatically.
    """
    os.makedirs(KEYS_DIR, exist_ok=True)
    if os.path.exists(PRIV_PATH) and os.path.exists(PUB_PATH):
        return PRIV_PATH, PUB_PATH

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    with open(PRIV_PATH, "wb") as f:
        f.write(priv_pem)
    with open(PUB_PATH, "wb") as f:
        f.write(pub_pem)
    return PRIV_PATH, PUB_PATH


def load_private_key(path=PRIV_PATH):
    with open(path, "rb") as f:
        return serialization.load_pem_private_key(f.read(), password=None)


def load_public_key(path=PUB_PATH):
    with open(path, "rb") as f:
        return serialization.load_pem_public_key(f.read())


def _sig_for(control_gz, priv, hash_alg):
    """DER PKCS#1 v1.5 RSA signature over hash(control gzip bytes).

    Equivalent to ``openssl dgst -sha1 -sign key.pem control.tar.gz``:
    cryptography hashes the data and wraps the DigestInfo itself.
    """
    return priv.sign(control_gz, padding.PKCS1v15(), hash_alg)


def make_signature_segment(control_gz, priv=None, pub_name=PUB_NAME):
    """Build the gzipped signature tar segment (no EOF records).

    ``control_gz`` is the complete bytes of control.tar.gz.  Returns the gzip
    stream to prepend to the apk.
    """
    if priv is None:
        priv = load_private_key()

    sigs = [
        (".SIGN.RSA." + pub_name, _sig_for(control_gz, priv, hashes.SHA1())),
        (".SIGN.RSA256." + pub_name, _sig_for(control_gz, priv, hashes.SHA256())),
    ]

    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w", format=tarfile.GNU_FORMAT) as tf:
        for name, data in sigs:
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o644
            info.uid = 0
            info.gid = 0
            info.uname = ""
            info.gname = ""
            info.mtime = 0
            tf.addfile(info, io.BytesIO(data))
        valid_len = tf.offset          # exclude the two EOF null records
    return gzip.compress(raw.getvalue()[:valid_len], mtime=0)


def split_gzip_members(data):
    """Split concatenated gzip streams into (raw_bytes, decompressed_bytes)."""
    members = []
    pos = 0
    total = len(data)
    while pos < total:
        dec = zlib_decompressor()
        out = bytearray()
        consumed = pos
        while consumed < total:
            chunk = data[consumed:consumed + 65536]
            out += dec.decompress(chunk)
            consumed += len(chunk)
            if dec.eof:
                unused = dec.unused_data
                consumed -= len(unused)
                break
        members.append((data[pos:consumed], bytes(out)))
        pos = consumed
    return members


def zlib_decompressor():
    import zlib
    return zlib.decompressobj(16 + zlib.MAX_WBITS)


def verify_signed_apk(apk_bytes, pub=None):
    """Local cryptographic self-check.  Returns a report dict.

    Parses the three gzip segments, extracts the .SIGN.* payloads, and verifies
    each against the control segment with the public key.  This is not a
    substitute for a real ``apk add`` on OpenWrt, but guarantees the signature
    bytes/structure are mathematically correct per the APK v2 spec.
    """
    if pub is None:
        pub = load_public_key()
    report = {"ok": False, "members": 0, "control_len": 0, "signatures": []}

    members = split_gzip_members(apk_bytes)
    report["members"] = len(members)
    if len(members) < 3:
        report["error"] = "expected >=3 gzip streams, got %d" % len(members)
        return report

    sig_raw = members[0][1]
    control_raw = members[1][0]        # verify against the gzip stream bytes
    report["control_len"] = len(control_raw)

    try:
        tf = tarfile.open(fileobj=io.BytesIO(sig_raw), mode="r:")
        sign_files = {}
        for m in tf.getmembers():
            if m.name.startswith(".SIGN."):
                sign_files[m.name] = tf.extractfile(m).read()
    except Exception as e:
        report["error"] = "signature segment not a tar: %s" % e
        return report

    if not sign_files:
        report["error"] = "no .SIGN.* entries"
        return report

    alg_map = {
        ".SIGN.RSA.": hashes.SHA1(),
        ".SIGN.RSA256.": hashes.SHA256(),
        ".SIGN.RSA512.": hashes.SHA512(),
    }
    all_ok = True
    for name, sig in sign_files.items():
        alg = None
        for prefix, h in alg_map.items():
            if name.startswith(prefix):
                alg = h
                break
        entry = {"name": name, "bytes": len(sig), "alg": getattr(alg, "name", None)}
        if alg is None:
            entry["ok"] = False
            entry["error"] = "unknown signature type"
            all_ok = False
        else:
            try:
                pub.verify(sig, control_raw, padding.PKCS1v15(), alg)
                entry["ok"] = True
            except Exception as e:
                entry["ok"] = False
                entry["error"] = str(e)
                all_ok = False
        report["signatures"].append(entry)

    report["ok"] = all_ok
    return report


if __name__ == "__main__":
    import sys
    priv, pubp = ensure_keypair()
    print("[+] key pair:", priv, pubp)
    if len(sys.argv) > 1:
        with open(sys.argv[1], "rb") as f:
            rep = verify_signed_apk(f.read())
        import json
        print(json.dumps(rep, indent=2))
        sys.exit(0 if rep.get("ok") else 1)
