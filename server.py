#!/usr/bin/env python3
"""
ClipboardAI - Lightweight Production-Ready HTTP Server
Optimized for Google Cloud Run, local development, and container deployments.
Uses Python 3 standard library with zero external dependencies.
"""

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", 2080))
HOST = os.environ.get("HOST", "127.0.0.1")
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

class CustomHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS and standard security headers
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer-when-downgrade")
        # Ensure modern JavaScript modules (.js) have correct MIME type
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def guess_type(self, path):
        # Ensure JavaScript modules and SVGs are correctly typed
        if path.endswith(".js"):
            return "application/javascript"
        if path.endswith(".svg"):
            return "image/svg+xml"
        if path.endswith(".css"):
            return "text/css"
        return super().guess_type(path)

    def log_message(self, format, *args):
        # Clean logging output
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

ThreadingHTTPServer.allow_reuse_address = True

def check_server_running(host, port):
    """Check if our server is already responding on this port."""
    import urllib.request
    try:
        url = f"http://{host}:{port}/"
        with urllib.request.urlopen(url, timeout=1) as resp:
            return resp.status == 200
    except Exception:
        return False

def run():
    port = PORT
    bind_host = HOST

    # If already running on this port, inform the user cleanly without error
    if check_server_running("127.0.0.1", port):
        print(f"==================================================")
        print(f" ✅ Clipboard Copilot is ALREADY running!")
        print(f" 🌐 Open in your browser: http://localhost:{port}")
        print(f" 💡 (The server is already active in background)")
        print(f"==================================================")
        return

    server = None
    try:
        server = ThreadingHTTPServer((bind_host, port), CustomHTTPHandler)
    except OSError:
        if bind_host != "127.0.0.1":
            try:
                bind_host = "127.0.0.1"
                server = ThreadingHTTPServer((bind_host, port), CustomHTTPHandler)
            except OSError:
                pass

    if not server:
        # Port is busy with another app, try next available port
        for alt_port in [port + 1, 8080, 8000]:
            try:
                bind_host = "127.0.0.1"
                server = ThreadingHTTPServer((bind_host, alt_port), CustomHTTPHandler)
                port = alt_port
                print(f" ⚠️ Port {PORT} is busy, switched to alternative port: {port}")
                break
            except OSError:
                continue

    if not server:
        print(f"❌ Error: Port {PORT} and fallback ports are currently in use.")
        print(f"👉 You can open the standalone file directly without any server:")
        print(f"   clipboard-copilot-standalone.html")
        return

    print(f"==================================================")
    print(f" 🚀 ClipboardAI Server Started")
    print(f" 📍 Serving files from: {DIRECTORY}")
    print(f" 🌐 Listening on: http://localhost:{port}")
    print(f" ☁️  Google Cloud Run Ready (Port: {port})")
    print(f"==================================================")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server gracefully...")
        server.server_close()

if __name__ == "__main__":
    run()
