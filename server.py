"""
Server script for hosting games
"""

import socket
import json
import time
import random
import threading
import subprocess
import urllib.request
try:
    import psutil
except ImportError:
    psutil = None
from art import *

try:
    from colorama import Fore, Style, init
    init(autoreset=True)
    RED = Fore.RED + Style.BRIGHT
    BLUE = Fore.BLUE + Style.BRIGHT
    RESET = Style.RESET_ALL
except ImportError:
    RED = ""
    BLUE = ""
    RESET = ""

PORT = 8888  # Port matching game domain / firewall
ADDR = "0.0.0.0"
GAME_DOMAIN = "game.24x7stream.shop"
MAX_PLAYERS = 10
MAX_HEALTH = 250
MSG_SIZE = 4096

players = {}
players_lock = threading.Lock()


def safe_send(sock: socket.socket, data: bytes, lock: threading.Lock = None) -> bool:
    """Send data safely to a socket without blocking indefinitely or crashing on closed sockets."""
    try:
        if lock:
            with lock:
                sock.sendall(data)
        else:
            sock.sendall(data)
        return True
    except Exception:
        return False


def generate_id(player_list: dict, max_players: int) -> str:
    """Generate a unique identifier among active players."""
    for i in range(1, max_players + 1):
        s_id = str(i)
        if s_id not in player_list:
            return s_id
    while True:
        unique_id = str(random.randint(1, max_players * 10))
        if unique_id not in player_list:
            return unique_id


def get_vps_public_ip():
    """Get public IP address of the VPS for players connecting over the internet."""
    services = [
        'https://api.ipify.org',
        'https://icanhazip.com',
        'https://ifconfig.me/ip',
    ]
    for url in services:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'curl/7.68.0'})
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                ip = resp.read().decode('utf-8').strip()
                if ip and all(part.isdigit() and 0 <= int(part) <= 255 for part in ip.split('.')) and len(ip.split('.')) == 4:
                    return ip
        except Exception:
            continue
    return None


def get_local_ip():
    """Get local network IPv4 address."""
    try:
        s_test = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s_test.settimeout(0.5)
        s_test.connect(('8.8.8.8', 80))
        ip = s_test.getsockname()[0]
        s_test.close()
        if ip and not ip.startswith('127.'):
            return ip
    except Exception:
        pass
    try:
        return socket.gethostbyname(socket.gethostname())
    except Exception:
        return '127.0.0.1'


def handle_new_connection(conn: socket.socket, addr):
    """
    Handle initial handshake for new connections in an isolated thread.
    Prevents any slow client, scanner, or probe from blocking the server accept loop.
    """
    try:
        # Handshake timeout so half-open probes or slow clients disconnect quickly
        conn.settimeout(10.0)
        conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        conn.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        if hasattr(socket, "TCP_KEEPIDLE"):
            conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 60)
        if hasattr(socket, "TCP_KEEPINTVL"):
            conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 10)
        if hasattr(socket, "TCP_KEEPCNT"):
            conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 5)

        with players_lock:
            if len(players) >= MAX_PLAYERS:
                print(f"{RED}[!] Player capacity ({MAX_PLAYERS}) reached. Rejecting connection from {addr}{RESET}")
                try:
                    conn.close()
                except Exception:
                    pass
                return

            new_id = generate_id(players, MAX_PLAYERS)

        # Send ID with newline delimiter
        if not safe_send(conn, f"{new_id}\n".encode("utf8")):
            try:
                conn.close()
            except Exception:
                pass
            return

        # Receive username
        try:
            raw_username = conn.recv(MSG_SIZE)
        except (socket.timeout, ConnectionResetError, OSError):
            conn.close()
            return

        if not raw_username:
            conn.close()
            return

        username_raw = raw_username.decode("utf8", errors="ignore").strip()

        # Handle HTTP browser probes cleanly without corrupting player list
        if username_raw.startswith(("GET ", "POST ", "HEAD ", "OPTIONS ", "CONNECT ", "PRI ")):
            http_body = (
                f"🎮 DeathMatch3D Game Server is ONLINE!\r\n"
                f"Domain: {GAME_DOMAIN}:{PORT}\r\n"
                f"Connect using your DeathMatch3D game client.\r\n"
            )
            http_response = (
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: text/plain; charset=utf-8\r\n"
                f"Content-Length: {len(http_body.encode('utf8'))}\r\n"
                "Connection: close\r\n\r\n"
                + http_body
            )
            safe_send(conn, http_response.encode("utf8"))
            try:
                conn.close()
            except Exception:
                pass
            return

        # Handle internet scanners / non-client garbage
        if username_raw.startswith("AMSNIFF") or "\x00" in username_raw:
            try:
                conn.close()
            except Exception:
                pass
            return

        # Sanitize username
        username = username_raw.split("\n")[0].strip()[:32]
        if not username or username.startswith("{"):
            username = f"Player_{new_id}"

        # Setup socket for active gameplay: disable timeout so stationary/idle players are not disconnected
        conn.settimeout(None)

        new_player_info = {
            "socket": conn,
            "username": username,
            "position": (0, 1, 0),
            "rotation": 0,
            "health": MAX_HEALTH,
            "visible": True,
            "lock": threading.Lock()
        }

        # Thread-safe registration and snapshot retrieval
        with players_lock:
            players[new_id] = new_player_info
            existing_players = [
                (
                    pid,
                    p["socket"],
                    p["lock"],
                    p["username"],
                    p["position"],
                    p["health"]
                )
                for pid, p in players.items()
                if pid != new_id
            ]

        # Tell existing players about new player
        join_msg = (json.dumps({
            "id": new_id,
            "object": "player",
            "username": username,
            "position": new_player_info["position"],
            "health": new_player_info["health"],
            "joined": True,
            "left": False
        }) + "\n").encode("utf8")

        for pid, p_sock, p_lock, _, _, _ in existing_players:
            safe_send(p_sock, join_msg, p_lock)

        # Tell new player about existing players
        for pid, _, _, p_user, p_pos, p_health in existing_players:
            existing_msg = (json.dumps({
                "id": pid,
                "object": "player",
                "username": p_user,
                "position": p_pos,
                "health": p_health,
                "joined": True,
                "left": False
            }) + "\n").encode("utf8")
            safe_send(conn, existing_msg, new_player_info["lock"])

        print(f"{BLUE}[+] New connection from {RED}{addr}{BLUE}, assigned ID: {RED}{new_id} ({username}){RESET}")

        # Handle player messages directly in this thread
        handle_messages(new_id, conn, username, new_player_info["lock"])

    except Exception as e:
        print(f"{RED}[!] Error handling connection from {addr}: {e}{RESET}")
        try:
            conn.close()
        except Exception:
            pass


def handle_messages(identifier: str, conn: socket.socket, username: str, sock_lock: threading.Lock):
    """
    Receive, parse, and broadcast messages for an active player.
    Uses stream parsing to handle coalesced and fragmented TCP packets.
    """
    recv_buffer = ""
    decoder = json.JSONDecoder()

    try:
        while True:
            # Parse all complete JSON objects in recv_buffer
            while True:
                idx = 0
                while idx < len(recv_buffer) and recv_buffer[idx] in ' \t\r\n':
                    idx += 1
                if idx >= len(recv_buffer):
                    recv_buffer = ""
                    break
                try:
                    msg_json, end_idx = decoder.raw_decode(recv_buffer, idx)
                    recv_buffer = recv_buffer[end_idx:]
                except json.JSONDecodeError:
                    recv_buffer = recv_buffer[idx:]
                    break

                if not isinstance(msg_json, dict) or "object" not in msg_json:
                    continue

                obj_type = msg_json.get("object")

                if obj_type == "player":
                    with players_lock:
                        if identifier in players:
                            players[identifier]["position"] = msg_json.get("position", (0, 1, 0))
                            players[identifier]["rotation"] = msg_json.get("rotation", 0)
                            health = msg_json.get("health", MAX_HEALTH)
                            players[identifier]["health"] = health
                            players[identifier]["visible"] = (health > 0)

                elif obj_type == "respawn":
                    with players_lock:
                        if identifier in players:
                            players[identifier]["position"] = msg_json.get("position", (0, 1, 0))
                            players[identifier]["health"] = msg_json.get("health", MAX_HEALTH)
                            players[identifier]["visible"] = True

                    respawn_message = (json.dumps({
                        "object": "player_respawn",
                        "id": identifier,
                        "position": msg_json.get("position", (0, 1, 0)),
                        "health": msg_json.get("health", MAX_HEALTH)
                    }) + "\n").encode("utf8")

                    with players_lock:
                        recipients = [(pid, p["socket"], p["lock"]) for pid, p in players.items() if pid != identifier]

                    for pid, p_sock, p_lock in recipients:
                        safe_send(p_sock, respawn_message, p_lock)
                    continue

                elif obj_type == "health_update":
                    target_id = str(msg_json.get("id"))
                    with players_lock:
                        if target_id in players:
                            health = msg_json.get("health", MAX_HEALTH)
                            players[target_id]["health"] = health
                            players[target_id]["visible"] = (health > 0)

                # Broadcast player move / visibility / bullet / health_update to other players
                outgoing_bytes = (json.dumps(msg_json) + "\n").encode("utf8")
                with players_lock:
                    recipients = [(pid, p["socket"], p["lock"]) for pid, p in players.items() if pid != identifier]

                for pid, p_sock, p_lock in recipients:
                    safe_send(p_sock, outgoing_bytes, p_lock)

            # Read more data from socket
            try:
                data = conn.recv(MSG_SIZE)
            except socket.timeout:
                continue
            except (ConnectionResetError, OSError):
                break

            if not data:
                break

            recv_buffer += data.decode("utf8", errors="ignore")

    finally:
        # Cleanup player on disconnect
        with players_lock:
            players.pop(identifier, None)
            recipients = [(pid, p["socket"], p["lock"]) for pid, p in players.items()]

        try:
            conn.close()
        except Exception:
            pass

        # Broadcast player leaving
        leave_bytes = (json.dumps({
            "id": identifier,
            "object": "player",
            "joined": False,
            "left": True
        }) + "\n").encode("utf8")

        for pid, p_sock, p_lock in recipients:
            safe_send(p_sock, leave_bytes, p_lock)

        print(f"{RED}[-] Player {BLUE}{username}{RED} with ID {BLUE}{identifier}{RED} has left the game...{RESET}")


_keepalive_started = False


def keepalive_worker():
    """
    Periodically sends lightweight keepalive ping to all connected players.
    Prevents aggressive home router / NAT firewall timeouts from dropping idle players.
    """
    keepalive_bytes = (json.dumps({"object": "keepalive"}) + "\n").encode("utf8")
    while True:
        time.sleep(15)
        try:
            with players_lock:
                recipients = [(pid, p["socket"], p["lock"]) for pid, p in players.items()]
            for pid, p_sock, p_lock in recipients:
                safe_send(p_sock, keepalive_bytes, p_lock)
        except Exception:
            pass


def start_keepalive_if_needed():
    global _keepalive_started
    if not _keepalive_started:
        _keepalive_started = True
        threading.Thread(target=keepalive_worker, daemon=True).start()


def main():
    start_keepalive_if_needed()

    vps_ip = get_vps_public_ip()
    local_ip = get_local_ip()

    server_addr = GAME_DOMAIN

    print(f"\n{BLUE}{'=' * 50}{RESET}")
    print(f"{BLUE}[*] Server started, listening on 0.0.0.0:{PORT}...{RESET}")
    print(f"{BLUE}[*] Game Domain   = {RED}{GAME_DOMAIN}{RESET} (Use this for players to connect)")
    if vps_ip:
        print(f"{BLUE}[*] VPS Public IP = {RED}{vps_ip}{RESET}")
        if local_ip and local_ip != vps_ip:
            print(f"{BLUE}[*] Internal IP   = {RED}{local_ip}{RESET}")
    else:
        print(f"{BLUE}[*] Local IP      = {RED}{local_ip}{RESET}")
    print(f"{BLUE}{'=' * 50}\n{RESET}")
    for i, line in enumerate(text2art(server_addr).splitlines()):
        color = BLUE if i % 2 == 0 else RED
        print(f"{color}{line}{RESET}")
    print()

    # Setup server socket
    server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server_sock.bind((ADDR, PORT))
    server_sock.listen(128)

    try:
        while True:
            try:
                conn, addr = server_sock.accept()
            except (KeyboardInterrupt, SystemExit):
                break
            except Exception as e:
                print(f"{RED}[!] Accept error: {e}{RESET}")
                time.sleep(0.1)
                continue

            worker = threading.Thread(target=handle_new_connection, args=(conn, addr), daemon=True)
            worker.start()
    finally:
        server_sock.close()


if __name__ == "__main__":
    while True:
        try:
            main()
        except KeyboardInterrupt:
            print(f"\n{RED}[!] Server stopped manually.{RESET}")
            break  # Allow graceful shutdown on Ctrl+C
        except SystemExit:
            print(f"\n{RED}[!] System exit triggered.{RESET}")
            break
        except Exception as e:
            print(f"\n{RED}[!] Server crashed with error: {e}{RESET}")
            print(f"{RED}[!] Restarting server in 5 seconds...\n{RESET}")
            time.sleep(5)
