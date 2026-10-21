#!/usr/bin/env python3
"""
ClipboardAI - Lightweight Production-Ready HTTP Server
Optimized for Google Cloud Run, local development, and container deployments.
Uses Python 3 standard library with zero external dependencies.
"""

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", 8080))
HOST = "0.0.0.0"
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

def run():
    print(f"==================================================")
    print(f" 🚀 ClipboardAI Server Started")
    print(f" 📍 Serving files from: {DIRECTORY}")
    print(f" 🌐 Listening on: http://localhost:{PORT}")
    print(f" ☁️  Google Cloud Run Ready (Port: {PORT})")
    print(f"==================================================")
    
    server = ThreadingHTTPServer((HOST, PORT), CustomHTTPHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server gracefully...")
        server.server_close()

if __name__ == "__main__":
    run()
