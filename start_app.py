#!/usr/bin/env python3
"""
Instagram Export Message Reader — Launcher Script

This script starts the Instagram Export Message Reader server.
It checks for Node.js and npm, installs dependencies if needed,
and opens the viewer in your default web browser.

Usage:
    python start_app.py
    
The viewer will open at http://localhost:3000
"""

import subprocess
import sys
import os
import time
import webbrowser
import shutil

# Set stdout and stderr to UTF-8 to prevent UnicodeEncodeError on Windows command prompt
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Path to the message reader app directory (relative to this script)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Robustly resolve the app directory: check if server.js is in the same folder as this script,
# or in a subfolder named 'instagram_chat_viewer'
if os.path.exists(os.path.join(SCRIPT_DIR, "server.js")):
    APP_DIR = SCRIPT_DIR
else:
    APP_DIR = os.path.join(SCRIPT_DIR, "instagram_chat_viewer")

SERVER_FILE = os.path.join(APP_DIR, "server.js")
PACKAGE_JSON = os.path.join(APP_DIR, "package.json")
NODE_MODULES = os.path.join(APP_DIR, "node_modules")

PORT = 3000
URL = f"http://localhost:{PORT}"


def check_node():
    """Check if Node.js is installed."""
    node_path = shutil.which("node")
    if not node_path:
        print("❌ Node.js is not installed or not in your PATH.")
        print("   Please install Node.js from: https://nodejs.org/")
        sys.exit(1)

    result = subprocess.run(["node", "--version"], capture_output=True, text=True)
    version = result.stdout.strip()
    print(f"✅ Node.js found: {version}")
    return True


def check_npm():
    """Check if npm is installed."""
    npm_path = shutil.which("npm")
    if not npm_path:
        print("❌ npm is not installed or not in your PATH.")
        print("   It usually comes with Node.js. Reinstall Node.js from: https://nodejs.org/")
        sys.exit(1)

    result = subprocess.run(["npm", "--version"], capture_output=True, text=True, shell=True)
    version = result.stdout.strip()
    print(f"✅ npm found: v{version}")
    return True


def install_dependencies():
    """Install npm dependencies if node_modules doesn't exist."""
    if os.path.exists(NODE_MODULES):
        print("✅ Dependencies already installed.")
        return

    print("📦 Installing dependencies (first-time setup)...")
    result = subprocess.run(
        ["npm", "install"],
        cwd=APP_DIR,
        shell=True,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"❌ Failed to install dependencies:")
        print(result.stderr)
        sys.exit(1)

    print("✅ Dependencies installed successfully!")


def start_server():
    """Start the Node.js server and open browser."""
    print()
    print("=" * 55)
    print("🚀 Starting Instagram Export Message Reader...")
    print(f"👉 Opening: {URL}")
    print("=" * 55)
    print()
    print("📌 Press Ctrl+C to stop the server.")
    print()

    # Open browser after a short delay
    def open_browser():
        time.sleep(1.5)
        webbrowser.open(URL)

    import threading
    browser_thread = threading.Thread(target=open_browser, daemon=True)
    browser_thread.start()

    # Start the server (this blocks until Ctrl+C)
    try:
        process = subprocess.run(
            ["node", "server.js"],
            cwd=APP_DIR,
            shell=False
        )
    except KeyboardInterrupt:
        print("\n\n👋 Server stopped. Goodbye!")
        sys.exit(0)


def main():
    print()
    print("╔════════════════════════════════════════════════════╗")
    print("║   📸 Instagram Export Message Reader — Launcher    ║")
    print("╚════════════════════════════════════════════════════╝")
    print()

    # Verify the app directory exists
    if not os.path.exists(APP_DIR):
        print(f"❌ Could not find the app directory at:")
        print(f"   {APP_DIR}")
        print(f"   Make sure this script is in the same folder as 'instagram_chat_viewer/'")
        sys.exit(1)

    if not os.path.exists(SERVER_FILE):
        print(f"❌ Could not find server.js at:")
        print(f"   {SERVER_FILE}")
        sys.exit(1)

    # Pre-flight checks
    check_node()
    check_npm()
    install_dependencies()
    
    # Launch!
    start_server()


if __name__ == "__main__":
    main()
