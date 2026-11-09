"""Readest 用的 WebDAV 书库端点（单用户实例）。

一个进程只服务一个账号，根目录固定为该用户的 u<id>/：
    python3 worker/webdav.py --user reader --port 3011
账号表：/home/gxwtf/reading-books/.dav-users.json
    { "reader": { "userId": 2691, "password": "xxx" } }
"""
import argparse
import json
import os
import sys

from cheroot import wsgi
from wsgidav.dc.simple_dc import SimpleDomainController
from wsgidav.wsgidav_app import WsgiDAVApp

BOOKS = os.environ.get("READEST_BOOKS_DIR", "/home/gxwtf/reading-books")
USERS_FILE = os.environ.get("DAV_USERS_FILE", os.path.join(BOOKS, ".dav-users.json"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", default=os.environ.get("DAV_USER", "reader"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("WEBDAV_PORT", "3011")))
    args = ap.parse_args()

    if not os.path.exists(USERS_FILE):
        sys.exit(f"缺少账号表：{USERS_FILE}")

    with open(USERS_FILE, encoding="utf-8") as f:
        users = json.load(f)

    info = users.get(args.user)
    if not info:
        sys.exit(f"账号表里没有 {args.user}")

    root = os.path.join(BOOKS, f"u{info['userId']}")
    os.makedirs(root, exist_ok=True)

    config = {
        "host": "127.0.0.1",
        "port": args.port,
        "provider_mapping": {"/": root},
        "http_authenticator": {
            "domain_controller": SimpleDomainController,
            "accept_basic": True,
            "accept_digest": False,
            "default_to_digest": False,
        },
        "simple_dc": {"user_mapping": {"*": {args.user: {"password": info["password"]}}}},
        "verbose": 1,
        "dir_browser": {"enable": True},
        "property_manager": True,
        "lock_storage": True,
    }

    print(f"WebDAV {args.user} → {root} on 127.0.0.1:{args.port}", flush=True)
    wsgi.Server((config["host"], config["port"]), WsgiDAVApp(config)).start()


if __name__ == "__main__":
    main()
