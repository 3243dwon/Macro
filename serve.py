"""
Macro Pulse — Local Development Server
Serves the dashboard and provides a /refresh endpoint to pull fresh data.

Usage:
    python serve.py          # starts on http://localhost:8050
"""
import os
import shutil
import sys
import json
from datetime import datetime, timezone

from flask import Flask, send_file, send_from_directory, jsonify

# Ensure project root is on sys.path so we can import refresh_macro
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(PROJECT_DIR, "static")
OUTPUT_DIR = os.path.join(PROJECT_DIR, "output")

app = Flask(__name__)


def _sync_pwa_assets():
    """Copy PWA assets from static/ into output/ so relative paths work."""
    for fname in ("manifest.json", "sw.js", "icon-192.png", "icon-512.png"):
        src = os.path.join(STATIC_DIR, fname)
        dst = os.path.join(OUTPUT_DIR, fname)
        if os.path.exists(src):
            shutil.copy2(src, dst)


@app.route("/")
def index():
    """Serve the dashboard HTML."""
    _sync_pwa_assets()
    html_path = os.path.join(PROJECT_DIR, config.HTML_OUTPUT)
    if not os.path.exists(html_path):
        return (
            "<h1>Dashboard not generated yet</h1>"
            "<p>Run <code>python refresh_macro.py</code> first, "
            "or hit the <b>/refresh</b> endpoint.</p>"
        ), 404
    return send_file(html_path, mimetype="text/html")


@app.route("/manifest.json")
def manifest():
    return send_from_directory(OUTPUT_DIR, "manifest.json", mimetype="application/manifest+json")


@app.route("/sw.js")
def service_worker():
    resp = send_from_directory(OUTPUT_DIR, "sw.js", mimetype="application/javascript")
    resp.headers["Service-Worker-Allowed"] = "/"
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.route("/icon-192.png")
def icon_192():
    return send_from_directory(OUTPUT_DIR, "icon-192.png", mimetype="image/png")


@app.route("/icon-512.png")
def icon_512():
    return send_from_directory(OUTPUT_DIR, "icon-512.png", mimetype="image/png")


@app.route("/refresh", methods=["POST", "GET"])
def refresh():
    """Run the full refresh pipeline and return status JSON."""
    try:
        import refresh_macro
        # Re-import to pick up any code changes during development
        import importlib
        importlib.reload(refresh_macro)

        refresh_macro.main()
        _sync_pwa_assets()

        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        return jsonify({"status": "ok", "timestamp": ts})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


if __name__ == "__main__":
    _sync_pwa_assets()
    print("\n⚡ Macro Pulse — Local server starting on http://localhost:8050\n")
    app.run(host="127.0.0.1", port=8050, debug=False)
