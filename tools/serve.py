#!/usr/bin/env python3
"""HUSH dev server: static files, but *never* cached.

python -m http.server lets browsers keep JS modules in the disk cache, so a
normal launch could silently run yesterday's build while Ctrl+F5 ran today's.
That mismatch is exactly the "bug disappears after a hard reload" report, so
this server marks everything no-store and disables directory listings.
"""
import functools
import http.server
import socketserver
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, "Not found")
        return None

    def log_message(self, fmt, *args):
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    root = sys.argv[2] if len(sys.argv) > 2 else "."
    handler = functools.partial(Handler, directory=root)
    # A browser opens several sockets at once for ES modules; a single-threaded
    # server overflows the accept backlog and some modules come back refused
    # (which looks like a stale/broken build). Thread it.
    socketserver.ThreadingTCPServer.allow_reuse_address = False
    socketserver.ThreadingTCPServer.daemon_threads = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", port), handler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()
