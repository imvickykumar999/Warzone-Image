import os
import ursina


class Wall(ursina.Entity):
    def __init__(self, position, scale=(2, 4, 2)):
        # Calculate texture tiling based on wall dimensions
        t_x = max(1.0, float(max(scale[0], scale[2])) / 2.0)
        t_y = max(1.0, float(scale[1]) / 2.0)

        super().__init__(
            position=position,
            scale=scale,
            model="cube",
            texture="assets/wall.png",
            texture_scale=(t_x, t_y),
            origin_y=-0.5,
            collider="box"
        )
        if self.texture:
            self.texture.filtering = None


class Map:
    def __init__(self):
        """
        Corner hiding walls and tactical cover spots.
        Uses scaled blocks to minimize total entity count (12 blocks total instead of 50+),
        eliminating game lag while providing solid cover at each corner of the arena.
        """
        walls_data = [
            # Top-Right (+X, +Z) corner hiding bunker
            {"pos": ursina.Vec3(16, 1, 13), "scale": ursina.Vec3(1.5, 4, 6)},
            {"pos": ursina.Vec3(13, 1, 16), "scale": ursina.Vec3(6, 4, 1.5)},

            # Top-Left (-X, +Z) corner hiding bunker
            {"pos": ursina.Vec3(-16, 1, 13), "scale": ursina.Vec3(1.5, 4, 6)},
            {"pos": ursina.Vec3(-13, 1, 16), "scale": ursina.Vec3(6, 4, 1.5)},

            # Bottom-Left (-X, -Z) corner hiding bunker
            {"pos": ursina.Vec3(-16, 1, -13), "scale": ursina.Vec3(1.5, 4, 6)},
            {"pos": ursina.Vec3(-13, 1, -16), "scale": ursina.Vec3(6, 4, 1.5)},

            # Bottom-Right (+X, -Z) corner hiding bunker
            {"pos": ursina.Vec3(16, 1, -13), "scale": ursina.Vec3(1.5, 4, 6)},
            {"pos": ursina.Vec3(13, 1, -16), "scale": ursina.Vec3(6, 4, 1.5)},

            # Perimeter mid-lane cover
            {"pos": ursina.Vec3(-15, 1, 0), "scale": ursina.Vec3(1.5, 3.5, 4)},
            {"pos": ursina.Vec3(0, 1, -15), "scale": ursina.Vec3(4, 3.5, 1.5)},

            # Center tactical barricades
            {"pos": ursina.Vec3(-4, 1, 3), "scale": ursina.Vec3(3.5, 3, 1.2)},
            {"pos": ursina.Vec3(4, 1, -3), "scale": ursina.Vec3(3.5, 3, 1.2)},
        ]

        self.walls = [Wall(w["pos"], w["scale"]) for w in walls_data]
