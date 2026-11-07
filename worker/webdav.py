"""Readest 用的 WebDAV 书库端点。"""
import hashlib
import os
import sys

from cheroot import wsgi
from wsgidav.dc.simple_dc import SimpleDomainController
from wsgidav.wsgidav_app import WsgiDAVApp

USER = os.environ.get("WEBDAV_USER", "")
PWD = os.environ.get("WEBDAV_PASSWORD", "")
if not USER or not PWD:
    sys.exit("WEBDAV_USER / WEBDAV_PASSWORD 未设置")

ROOT = os.environ.get("WEBDAV_ROOT", "/home/gxwtf/reading-books")
PORT = int(os.environ.get("WEBDAV_PORT", "3010"))
REALM = "readest"
os.makedirs(ROOT, exist_ok=True)

digest = hashlib.md5(f"{USER}:{REALM}:{PWD}".encode()).hexdigest()

config = {
    "host": "127.0.0.1",
    "port": PORT,
    "provider_mapping": {"/dav": ROOT, "/": ROOT},
    "http_authenticator": {
        "domain_controller": SimpleDomainController,
        "accept_basic": True,
        "accept_digest": False,
        "default_to_digest": False,
        "realm": REALM,
    },
    "simple_dc": {"user_mapping": {"*": {USER: {"password": PWD}}}},
    "verbose": 1,
    "dir_browser": {"enable": True},
    "property_manager": True,
    "lock_storage": True,
}

if __name__ == "__main__":
    print(f"WebDAV on 127.0.0.1:{PORT} root={ROOT} user={USER}", flush=True)
    wsgi.Server((config["host"], config["port"]), WsgiDAVApp(config)).start()
