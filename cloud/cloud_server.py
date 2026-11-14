# -*- coding: utf-8 -*-
"""Cloud online relay for 与大肥鱼一起下象棋.

A single-process HTTP server:
- serves the static game;
- keeps battle rooms in memory;
- exposes the same /api/online/* polling protocol as the desktop server.

Deploy behind any HTTPS reverse proxy (Render/Koyeb/Fly/VPS), set PUBLIC_URL
to the public HTTPS origin, and open /war.html on that origin.
"""
import ipaddress
import json
import os
import secrets
import socket
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib import parse as urlparse

ROOT = os.environ.get("APP_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_URL = (os.environ.get("PUBLIC_URL") or "").rstrip("/")
PORT = int(os.environ.get("PORT") or 8080)
ONLINE_LOCK = threading.RLock()
ONLINE_COND = threading.Condition(ONLINE_LOCK)
ROOMS = {}
TTL = 2 * 60 * 60
MAX_EVENTS = 400


def now():
    return time.time()


def cleanup():
    t = now()
    for code, room in list(ROOMS.items()):
        if t - room["touched"] > TTL:
            ROOMS.pop(code, None)


def code():
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        c = "".join(secrets.choice(chars) for _ in range(5))
        if c not in ROOMS:
            return c


def push(room, role, data):
    room["seq"] += 1
    ev = {"id": room["seq"], "data": data}
    q = room["queues"][role]
    q.append(ev)
    if len(q) > MAX_EVENTS:
        del q[: len(q) - MAX_EVENTS]
    room["touched"] = now()
    ONLINE_COND.notify_all()


def auth(room, token):
    if not room or not token:
        return None
    if secrets.compare_digest(str(room["host_token"]), str(token)):
        return "host"
    if secrets.compare_digest(str(room.get("guest_token") or ""), str(token)):
        return "guest"
    return None


def public_origin(handler):
    if PUBLIC_URL:
        return PUBLIC_URL
    host = handler.headers.get("Host") or "localhost"
    proto = handler.headers.get("X-Forwarded-Proto") or "http"
    return "%s://%s" % (proto, host)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
        except Exception:
            return {}

    def do_OPTIONS(self):
        if self.path.startswith("/api/online/"):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "86400")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_error(404)

    def do_GET(self):
        parsed = urlparse.urlparse(self.path)
        if parsed.path == "/api/online/health":
            return self.send_json(200, {"ok": True, "service": "dfy-online", "time": now()})
        if parsed.path == "/api/online/events":
            qs = urlparse.parse_qs(parsed.query)
            room_code = (qs.get("room") or [""])[0].strip().upper()
            token = (qs.get("token") or [""])[0]
            since = int((qs.get("since") or ["0"])[0] or 0)
            deadline = now() + 20
            with ONLINE_COND:
                room = ROOMS.get(room_code)
                role = auth(room, token)
                if not room or not role:
                    return self.send_json(404, {"ok": False, "error": "房间不存在或身份失效"})
                while True:
                    events = [e for e in room["queues"][role] if e["id"] > since]
                    if events or room.get("closed") or now() >= deadline:
                        break
                    ONLINE_COND.wait(min(5, max(0.2, deadline - now())))
                if role == "host":
                    room["host_seen"] = now()
                else:
                    room["guest_seen"] = now()
                out = {
                    "ok": True,
                    "events": events,
                    "guestJoined": bool(room.get("guest_joined")),
                    "hostPresent": (now() - float(room.get("host_seen") or 0)) < 20,
                    "guestPresent": (now() - float(room.get("guest_seen") or 0)) < 20,
                    "closed": bool(room.get("closed")),
                }
                return self.send_json(200, out)
        return super().do_GET()

    def do_POST(self):
        path = urlparse.urlparse(self.path).path
        if path == "/api/online/create":
            body = self.body() or {}
            with ONLINE_COND:
                cleanup()
                c = code()
                r = {
                    "host_token": secrets.token_urlsafe(24), "guest_token": None,
                    "host_seen": now(), "guest_seen": 0.0, "guest_joined": False,
                    "queues": {"host": [], "guest": []}, "seq": 0,
                    "created": now(), "touched": now(), "closed": False,
                    "host_name": str(body.get("name") or "房主")[:24], "guest_name": "",
                }
                ROOMS[c] = r
                origin = public_origin(self)
                return self.send_json(200, {
                    "ok": True, "room": c, "token": r["host_token"], "role": "host",
                    "server": {"url": origin, "urls": [origin], "public": True},
                })
        if path == "/api/online/join":
            body = self.body() or {}
            c = str(body.get("room") or "").strip().upper()
            with ONLINE_COND:
                cleanup()
                r = ROOMS.get(c)
                if not r:
                    return self.send_json(404, {"ok": False, "error": "房间不存在或已过期"})
                if r.get("guest_token") and now() - float(r.get("guest_seen") or 0) < 20:
                    return self.send_json(409, {"ok": False, "error": "房间已有玩家"})
                token = secrets.token_urlsafe(24)
                r["guest_token"] = token
                r["guest_seen"] = now()
                r["guest_joined"] = True
                r["closed"] = False
                r["touched"] = now()
                r["guest_name"] = str(body.get("name") or "玩家")[:24]
                push(r, "host", {"type": "join"})
                origin = public_origin(self)
                return self.send_json(200, {
                    "ok": True, "room": c, "token": token, "role": "guest",
                    "server": {"url": origin, "urls": [origin], "public": True},
                    "hostPresent": (now() - float(r.get("host_seen") or 0)) < 20,
                })
        if path == "/api/online/send":
            body = self.body() or {}
            c = str(body.get("room") or "").strip().upper()
            token = str(body.get("token") or "")
            with ONLINE_COND:
                r = ROOMS.get(c)
                role = auth(r, token)
                if not r or not role:
                    return self.send_json(404, {"ok": False, "error": "房间不存在或身份失效"})
                target = "guest" if role == "host" else "host"
                push(r, target, body.get("data"))
                return self.send_json(200, {"ok": True})
        if path == "/api/online/leave":
            body = self.body() or {}
            c = str(body.get("room") or "").strip().upper()
            token = str(body.get("token") or "")
            with ONLINE_COND:
                r = ROOMS.get(c)
                role = auth(r, token)
                if r and role:
                    target = "guest" if role == "host" else "host"
                    push(r, target, {"type": "leave", "role": role})
                    if role == "host":
                        r["closed"] = True
                    else:
                        r["guest_joined"] = False
                        r["guest_seen"] = 0.0
                        r["guest_token"] = None
                return self.send_json(200, {"ok": True})
        return self.send_error(404)


def main():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("DFY cloud online listening on 0.0.0.0:%d, public=%s" % (PORT, PUBLIC_URL or "(auto)"), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
