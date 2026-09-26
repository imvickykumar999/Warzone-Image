"""
WebSocket-to-TCP Bridge and Web Server for Ursina Deathmatch Browser Client.

Features:
- Dual server: Serves the Web Client files over HTTP on port 8080, and relays
  WebSocket connections on port 8765 to the raw TCP game server (port 8888).
- Automatically discovers Tailscale IP and Local LAN IP for multi-device play.
"""

import os
import sys
import json
import time
import socket
import asyncio
import threading
import subprocess
from urllib.parse import parse_qs, urlparse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

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

try:
    import psutil
except ImportError:
    psutil = None

try:
    from colorama import Fore, Style, init
    init(autoreset=True)
    RED = Fore.RED + Style.BRIGHT
    BLUE = Fore.BLUE + Style.BRIGHT
    GREEN = Fore.GREEN + Style.BRIGHT
    CYAN = Fore.CYAN + Style.BRIGHT
    RESET = Style.RESET_ALL
except ImportError:
    RED = ""
    BLUE = ""
    GREEN = ""
    CYAN = ""
    RESET = ""

import websockets

HTTP_PORT = 8080
WS_PORT = 8765
DEFAULT_TCP_PORT = 8888
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def get_tailscale_ip():
    """Detect Tailscale IPv4 address if Tailscale is running."""
    if psutil:
        try:
            for iface, addrs in psutil.net_if_addrs().items():
                if "tailscale" in iface.lower():
                    for a in addrs:
                        if getattr(a, "family", None) == socket.AF_INET and not a.address.startswith("127."):
                            return a.address
        except Exception:
            pass

    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            parts = [int(p) for p in ip.split(".") if p.isdigit()]
            if len(parts) == 4 and parts[0] == 100 and (64 <= parts[1] <= 127):
                return ip
    except Exception:
        pass

    try:
        res = subprocess.run(["tailscale", "ip", "-4"], capture_output=True, text=True, timeout=2)
        if res.returncode == 0:
            ip = res.stdout.strip().splitlines()[0].strip()
            if ip:
                return ip
    except Exception:
        pass

    return None


def get_local_ip():
    """Get local network IPv4 address."""
    try:
        s_test = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s_test.settimeout(0.5)
        s_test.connect(("8.8.8.8", 80))
        ip = s_test.getsockname()[0]
        s_test.close()
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass
    try:
        return socket.gethostbyname(socket.gethostname())
    except Exception:
        return "127.0.0.1"


class QuietHTTPHandler(SimpleHTTPRequestHandler):
    """Serve files from BASE_DIR quietly."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, format, *args):
        # Suppress routine GET request noise
        pass


def start_http_server():
    """Start static file HTTP server in a background daemon thread."""
    try:
        server = ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), QuietHTTPHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        return True
    except OSError as e:
        print(f"{RED}[!] HTTP port {HTTP_PORT} already in use or unavailable ({e}). Continuing with WebSocket bridge only...{RESET}")
        return False


async def relay(websocket):
    """Relays between browser WebSocket and game server TCP socket."""
    request_path = getattr(getattr(websocket, "request", None), "path", None)
    request_path = request_path or getattr(websocket, "path", "/")
    query = parse_qs(urlparse(request_path).query)
    server_host = query.get("server", ["127.0.0.1"])[0]
    server_port = int(query.get("port", [str(DEFAULT_TCP_PORT)])[0])

    client_ip = getattr(websocket.remote_address, "0", "browser_client")
    print(f"{BLUE}[+] New WebSocket client connected from {RED}{client_ip}{BLUE} -> TCP {RED}{server_host}:{server_port}{RESET}")

    try:
        tcp_reader, tcp_writer = await asyncio.open_connection(server_host, server_port)
    except Exception as e:
        print(f"{RED}[!] Failed to connect to TCP server {server_host}:{server_port}: {e}{RESET}")
        await websocket.close(1011, f"TCP connect failed: {e}")
        return

    try:
        raw_msg = await websocket.recv()
        identify = json.loads(raw_msg)
        username = str(identify.get("username", "Player"))[:18].strip()

        # Server sends assigned player ID first
        player_id_bytes = await tcp_reader.read(64)
        player_id = player_id_bytes.decode("utf-8", errors="ignore").strip()

        # Send username to server
        tcp_writer.write(f"{username}\n".encode("utf-8"))
        await tcp_writer.drain()

        # Inform browser client of welcome and assigned ID
        await websocket.send(json.dumps({"type": "welcome", "id": player_id}))
        print(f"{GREEN}[OK] Handshake complete for player {username} (ID: {player_id}){RESET}")
    except Exception as e:
        print(f"{RED}[!] Handshake error: {e}{RESET}")
        tcp_writer.close()
        await tcp_writer.wait_closed()
        return

    async def browser_to_tcp():
        try:
            async for message in websocket:
                if isinstance(message, str):
                    clean_msg = message.rstrip("\n")
                    tcp_writer.write(f"{clean_msg}\n".encode("utf-8"))
                    await tcp_writer.drain()
        except Exception:
            pass

    async def tcp_to_browser():
        buffer = ""
        decoder = json.JSONDecoder()
        try:
            while True:
                data = await tcp_reader.read(4096)
                if not data:
                    break
                buffer += data.decode("utf-8", errors="ignore")

                while True:
                    buffer = buffer.lstrip()
                    if not buffer:
                        break
                    # Find opening brace
                    start = buffer.find("{")
                    if start == -1:
                        buffer = ""
                        break
                    if start > 0:
                        buffer = buffer[start:]

                    try:
                        value, end = decoder.raw_decode(buffer)
                        await websocket.send(json.dumps(value))
                        buffer = buffer[end:]
                    except json.JSONDecodeError:
                        break
        except Exception:
            pass

    try:
        await asyncio.gather(browser_to_tcp(), tcp_to_browser())
    finally:
        try:
            tcp_writer.close()
            await tcp_writer.wait_closed()
        except Exception:
            pass
        print(f"{RED}[-] Player {username} disconnected.{RESET}")


async def main():
    tailscale_ip = get_tailscale_ip()
    local_ip = get_local_ip()

    http_running = start_http_server()

    print(f"\n{BLUE}{'=' * 56}{RESET}")
    print(f"{GREEN}[*] Browser Client Bridge & Web Server Started!{RESET}")
    print(f"{BLUE}{'=' * 56}{RESET}")
    if http_running:
        print(f"{CYAN}[*] Local Web URL     : {GREEN}http://localhost:{HTTP_PORT}{RESET}")
        print(f"{CYAN}[*] LAN Web URL       : {GREEN}http://{local_ip}:{HTTP_PORT}{RESET}")
        if tailscale_ip:
            print(f"{CYAN}[*] Tailscale Web URL : {GREEN}http://{tailscale_ip}:{HTTP_PORT}{RESET}")
    print(f"{BLUE}[*] WebSocket Bridge  : {RED}ws://0.0.0.0:{WS_PORT}{RESET}")
    print(f"{BLUE}[*] Forwarding to TCP : {RED}0.0.0.0:{DEFAULT_TCP_PORT}{RESET}")
    print(f"{BLUE}{'=' * 56}\n{RESET}")

    async with websockets.serve(relay, "0.0.0.0", WS_PORT, max_size=2 ** 20):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print(f"\n{RED}[!] Bridge stopped.{RESET}")
