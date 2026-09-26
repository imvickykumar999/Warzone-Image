# Warzone Docker Guide

Image: [`imvickykumar999/warzone`](https://hub.docker.com/r/imvickykumar999/warzone)

The container runs:

| Service | Port | Role |
| :--- | :--- | :--- |
| `bridge.py` | **8080** | Web client (open this in the browser) |
| `bridge.py` | **8765** | WebSocket bridge (browser ↔ game server) |
| `server.py` | **8888** | TCP game server |

---

## 1. Pull the image

```bash
docker pull imvickykumar999/warzone:latest
```

---

## 2. Run the container

Expose all three ports:

```bash
docker run -d --name warzone \
  -p 8080:8080 \
  -p 8765:8765 \
  -p 8888:8888 \
  imvickykumar999/warzone:latest
```

Useful commands:

```bash
docker logs -f warzone   # watch startup logs
docker stop warzone      # stop
docker start warzone     # start again
docker rm -f warzone     # remove container
```

---

## 3. Play in the browser

Open the **web client on port 8080**. That is the URL players use.

### On your laptop (local)

| Where you play | URL |
| :--- | :--- |
| Same machine | [http://localhost:8080](http://localhost:8080) |
| Phone / other device on same Wi‑Fi | `http://<YOUR_LAN_IP>:8080` |

Find your LAN IP:

- **Windows:** `ipconfig` → look for IPv4 (e.g. `192.168.1.10`)
- **Linux / macOS:** `hostname -I` or `ip addr`

Example: `http://192.168.1.10:8080`

### On a VPS

| Where you play | URL |
| :--- | :--- |
| Anyone on the internet | `http://<VPS_PUBLIC_IP>:8080` |

Example: `http://203.0.113.45:8080`

On the VPS firewall / cloud security group, allow inbound TCP:

- **8080** — browser game UI  
- **8765** — WebSocket bridge (required for multiplayer)  
- **8888** — game server (needed if desktop clients connect directly)

---

## Quick checklist

1. Pull → `docker pull imvickykumar999/warzone:latest`
2. Run → map `8080`, `8765`, `8888`
3. Open → `http://localhost:8080` (laptop) or `http://<public-or-lan-ip>:8080` (VPS / LAN)
4. Enter a username and click **Play**
