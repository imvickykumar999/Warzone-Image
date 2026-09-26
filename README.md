# Ursina TCP Deathmatch - Browser Client

Browser-playable 3D client for **Ursina TCP Deathmatch**, rendering via WebGL (Three.js) with 100% protocol compatibility with the Python Ursina server and desktop clients.

Features the **exact same UI/UX** as the original desktop game:
- **Lobby Launcher Screen**: Exact replica of the Tkinter fullscreen launcher with dark blue dialog, username color picker (`Blue`, `Green`, `Orange`, `Purple`, `Yellow`, `Red`, etc.), server candidate selector (`Tailscale`, `Local LAN`, `Localhost`), port input, and looping background music (`assets/music.mp3`).
- **In-Game HUD**: Centered top health bar with green fill, health text (`250 / 250 HP`), ammo counter (`15 / 15`), reloading countdown (`Reloading... 2.0s`), center red reticle (`rgba(255, 0, 0, 122)`), and first-person colored 3D gun model with recoil and reload animations.
- **3D Arena & Graphics**: Exact reproduction of Ursina arena featuring `assets/sky.png` sky sphere, checkerboard ground floor with `assets/floor.png`, 1st floor upper mezzanine deck, dual staircases with smooth ramp physics, support pillars, railings, and tactical cover walls from `client/map.py`.
- **Audio & SFX**: Gunshot sound effects on firing (`assets/bullet.mp3`) and looping lobby soundtrack (`assets/music.mp3`).
- **Death & Respawn Screen**: Fullscreen `assets/background.jpg` death overlay, "YOU DIED", 5-second countdown timer, quick respawn via `R`, `Space`, `Enter`, or click.

---

## Quick Start

### 1. Ensure TCP Server is Running
Start the game server from the `server/` folder:
```powershell
cd ..\server
python main.py
```
*(As seen in your terminal, the server listens on `0.0.0.0:8888`)*

---

### 2. Start the Browser Bridge & Web Server
From the `webClient/` folder, run:
```powershell
python bridge.py
```
> [!TIP]
> `bridge.py` automatically serves the web client on **`http://localhost:8080`** AND runs the WebSocket bridge on **`ws://0.0.0.0:8765`**, while discovering your Tailscale and Local LAN IPs.

---

### 3. Open in Any Browser
Open your browser to:
- **Local:** `http://localhost:8080`
- **Same Wi-Fi (LAN):** `http://192.168.1.2:8080`
- **Tailscale:** `http://100.121.132.98:8080`

Click **Play** (or press `Enter`) to enter Fullscreen with Pointer Lock!

---

## Controls

### Desktop / Laptop (Keyboard & Mouse)
| Action | Control |
| :--- | :--- |
| **Move** | `W`, `A`, `S`, `D` or Arrow Keys |
| **Aim / Look** | Mouse Movement (Pointer Lock & Drag Look) |
| **Fire** | Left Mouse Button (`LMB`, click or hold) |
| **Jump** | `Space` |
| **ADS Zoom** | Right Mouse Button (`RMB`) or `C` key |
| **Reload** | `R` or `E` |
| **Respawn** | `R`, `Space`, `Enter`, or click `RESPAWN` / screen |
| **Toggle View (1st/3rd)** | Top-left `👤 1st View [V]` button or `V` / `F5` key |
| **Toggle Controls Mode** | Top-left `🎮 On-Screen [T]` button or `T` key |
| **Toggle Fullscreen** | Top-right `⛶ Fullscreen` button |
| **Toggle Music** | Top-right `🎵` button |

### Mobile Browser (Touch Screen Landscape)
| Action | Touch Control |
| :--- | :--- |
| **Move** | Dynamic Virtual Joystick (left side) |
| **Aim / Look** | Touch & swipe anywhere on right side / drag fire button |
| **Fire** | Tap or hold `FIRE` button (auto-fire cadence) |
| **Jump** | Tap `JUMP` button |
| **ADS Zoom** | Tap `AIM` button (toggles scope precision) |
| **Reload** | Tap `RELOAD` button |
| **Respawn** | Tap `RESPAWN` button or tap screen |
| **Orientation** | Optimized for mobile landscape with orientation guidance |
