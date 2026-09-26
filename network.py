import socket
import json
import threading
import queue


class Network:
    """
    A client class to abstract away socket functions and make communication with server less of a headache.

    Args:
        server_addr (str): IPv4 address of the server
        server_port (int): Port at which server is running
        username (str): Username of this client's player
    """

    def __init__(self, server_addr: str, server_port: int, username: str):
        self.client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.addr = server_addr
        self.port = server_port
        self.username = username
        self.recv_size = 4096
        self.id = 0
        self.recv_buffer = ""
        self.decoder = json.JSONDecoder()
        self.outgoing_queue = queue.Queue()
        self.running = True
        self.send_thread = None

    def settimeout(self, value):
        self.client.settimeout(value)

    def connect(self):
        """
        Connect to the server, negotiate ID/username, and start background send thread.
        """
        self.client.connect((self.addr, self.port))
        raw = self.client.recv(self.recv_size).decode("utf8", errors="ignore")
        if "\n" in raw:
            parts = raw.split("\n", 1)
            self.id = parts[0].strip()
            self.recv_buffer += parts[1]
        else:
            self.id = raw.strip()

        self.client.sendall(f"{self.username}\n".encode("utf8"))

        # Start non-blocking send worker thread so main game loop never hangs on socket I/O
        self.send_thread = threading.Thread(target=self._send_loop, daemon=True)
        self.send_thread.start()

    def _send_loop(self):
        while self.running:
            try:
                data = self.outgoing_queue.get(timeout=0.2)
            except queue.Empty:
                continue

            try:
                self.client.sendall(data)
            except (socket.error, OSError) as e:
                print(f"[Network] Send error: {e}")
                self.running = False
                break

    def queue_send(self, data_dict):
        if not self.running:
            return
        try:
            payload = (json.dumps(data_dict) + "\n").encode("utf8")
            self.outgoing_queue.put_nowait(payload)
        except Exception as e:
            print(f"[Network] Error queuing message: {e}")

    def receive_info(self):
        """
        Stream parser for incoming JSON messages over TCP.
        Handles coalesced and fragmented packets without dropping messages.
        """
        while self.running:
            # First parse any complete JSON object already in buffer
            idx = 0
            while idx < len(self.recv_buffer) and self.recv_buffer[idx] in ' \t\r\n':
                idx += 1
            if idx < len(self.recv_buffer):
                try:
                    msg_json, end_idx = self.decoder.raw_decode(self.recv_buffer, idx)
                    self.recv_buffer = self.recv_buffer[end_idx:]
                    return msg_json
                except json.JSONDecodeError:
                    self.recv_buffer = self.recv_buffer[idx:]

            try:
                data = self.client.recv(self.recv_size)
            except (socket.error, OSError):
                return None

            if not data:
                return None

            self.recv_buffer += data.decode("utf8", errors="ignore")
        return None

    def send_player(self, player):
        pos = (player.world_x, player.world_y, player.world_z)
        self.queue_send({
            "object": "player",
            "id": self.id,
            "position": pos,
            "rotation": player.rotation_y,
            "health": player.health,
            "joined": False,
            "left": False
        })

    def send_bullet(self, bullet):
        self.queue_send({
            "object": "bullet",
            "position": (bullet.world_x, bullet.world_y, bullet.world_z),
            "damage": bullet.damage,
            "direction": bullet.direction,
            "x_direction": bullet.x_direction
        })

    def send_health(self, player):
        self.queue_send({
            "object": "health_update",
            "id": player.id,
            "health": player.health
        })

    def send_respawn(self, position=(0, 1, 0), health=250):
        if hasattr(position, "x"):
            pos = (position.x, position.y, position.z)
        else:
            pos = (position[0], position[1], position[2])

        self.queue_send({
            "object": "respawn",
            "id": self.id,
            "position": pos,
            "health": health
        })

    def close(self):
        self.running = False
        try:
            self.client.close()
        except Exception:
            pass


