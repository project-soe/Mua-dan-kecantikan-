#!/usr/bin/env python3
"""Server lokal untuk pengembangan: melayani folder public/ TANPA cache,
sehingga perubahan file langsung terlihat saat halaman dimuat ulang.

Pakai (dari folder nasi-kebuli):
    python3 dev-server.py          -> http://localhost:8080
    python3 dev-server.py 9000     -> http://localhost:9000
"""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), NoCacheHandler) as server:
    print(f"Server berjalan di http://localhost:{PORT}  (Ctrl+C untuk berhenti)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer dihentikan.")
