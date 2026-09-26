import ursina
from PIL import Image

# Palette of distinct colors for players entering the lobby
COLOR_PALETTE = {
    "Blue": (52, 152, 219),
    "Green": (46, 204, 113),
    "Orange": (230, 126, 34),
    "Purple": (155, 89, 182),
    "Yellow": (241, 196, 15),
    "Red": (231, 76, 60),
    "Turquoise": (26, 188, 156),
    "Pink": (236, 64, 122),
    "Cyan": (0, 188, 212),
    "Lime": (139, 195, 74),
}

COLOR_NAMES = list(COLOR_PALETTE.keys())
PLAYER_COLORS = list(COLOR_PALETTE.values())

_texture_cache = {}


def get_player_color(identifier, username=None):
    """
    Map player identifier or username to a distinct color from the palette.
    If username matches a known color name, that color is prioritized.
    """
    if username:
        clean_name = str(username).strip().title()
        if clean_name in COLOR_PALETTE:
            return COLOR_PALETTE[clean_name]
        for cname, rgb in COLOR_PALETTE.items():
            if cname.lower() in str(username).lower():
                return rgb

    try:
        idx = (int(identifier) - 1) % len(PLAYER_COLORS)
    except (ValueError, TypeError):
        key = str(username or identifier or "player")
        idx = abs(hash(key)) % len(PLAYER_COLORS)
    return PLAYER_COLORS[idx]


def create_player_texture(color_rgb):
    """
    Generate a 64x64 procedural colored cube texture with border shading,
    providing visual depth instead of using assets/DP.jpg.
    Cached by color to avoid recreating identical textures.
    """
    key = tuple(color_rgb[:3])
    if key in _texture_cache:
        return _texture_cache[key]

    width, height = 64, 64
    border_color = tuple(max(0, int(c * 0.65)) for c in key) + (255,)
    inner_color = tuple(key) + (255,)
    img = Image.new("RGBA", (width, height), inner_color)

    for x in range(width):
        for b in (0, 1, height - 2, height - 1):
            img.putpixel((x, b), border_color)
    for y in range(height):
        for b in (0, 1, width - 2, width - 1):
            img.putpixel((b, y), border_color)

    tex = ursina.Texture(img)
    _texture_cache[key] = tex
    return tex


MAX_HEALTH = 250


class Enemy(ursina.Entity):
    def __init__(self, position: ursina.Vec3, identifier: str, username: str, color_rgb=None):
        # Initialize attributes early to prevent race condition crashes if update() is called during creation
        self.max_health = MAX_HEALTH
        self.health = self.max_health
        self.id = str(identifier)
        self.username = username
        self.gun = None
        self.name_tag = None
        self.is_dead = False

        if color_rgb is None:
            self.color_rgb = get_player_color(identifier, username)
        else:
            self.color_rgb = color_rgb

        player_texture = create_player_texture(self.color_rgb)

        super().__init__(
            position=position,
            model="cube",
            origin_y=-0.5,
            collider="box",
            texture=player_texture,
            color=ursina.color.hsv(0, 0, 1),
            scale=ursina.Vec3(1, 2, 1)
        )

        self.gun = ursina.Entity(
            parent=self,
            position=ursina.Vec3(0.55, 0.5, 0.6),
            scale=ursina.Vec3(0.1, 0.2, 0.65),
            model="cube",
            texture="white_cube",
            color=ursina.color.rgb32(self.color_rgb[0], self.color_rgb[1], self.color_rgb[2])
        )

        self.name_tag = ursina.Text(
            parent=self,
            text=f"{username} [{int(self.health)}/{self.max_health}]",
            position=ursina.Vec3(0, 1.3, 0),
            scale=ursina.Vec2(5, 3),
            billboard=True,
            origin=ursina.Vec2(0, 0)
        )

    def update(self):
        if not hasattr(self, 'health') or self.health is None:
            return

        if self.health <= 0:
            if not self.is_dead:
                self.is_dead = True
                self.visible = False
                if self.gun:
                    self.gun.visible = False
                if self.name_tag:
                    self.name_tag.visible = False
                self.collision = False
        else:
            if self.is_dead:
                self.is_dead = False
                self.visible = True
                if self.gun:
                    self.gun.visible = True
                if self.name_tag:
                    self.name_tag.visible = True
                self.collision = True

            try:
                color_saturation = max(0.0, min(1.0, 1.0 - self.health / float(self.max_health)))
            except (AttributeError, TypeError, ZeroDivisionError):
                self.health = self.max_health
                color_saturation = 0.0

            self.color = ursina.color.hsv(0, color_saturation, 1)

            if hasattr(self, 'name_tag') and self.name_tag:
                self.name_tag.text = f"{self.username} [{int(max(0, self.health))}/{self.max_health}]"

    def respawn(self, position: ursina.Vec3, health: int = MAX_HEALTH):
        self.world_position = position
        self.health = health
        self.is_dead = False
        self.visible = True
        if hasattr(self, 'gun') and self.gun:
            self.gun.visible = True
        if hasattr(self, 'name_tag') and self.name_tag:
            self.name_tag.visible = True
            self.name_tag.text = f"{self.username} [{int(max(0, self.health))}/{self.max_health}]"
        self.collision = True
        self.color = ursina.color.hsv(0, 0, 1)

    def cleanup(self):
        self.collision = False
        self.enabled = False
        if hasattr(self, 'gun') and self.gun:
            self.gun.enabled = False
        if hasattr(self, 'name_tag') and self.name_tag:
            self.name_tag.enabled = False


