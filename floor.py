import math
import os
import ursina


class FloorCube(ursina.Entity):
    """Legacy FloorCube class preserved for backward compatibility."""
    def __init__(self, position):
        super().__init__(
            position=position,
            scale=2,
            model="cube",
            texture="assets/floor.png",
            collider="box"
        )
        if self.texture:
            self.texture.filtering = None


class FloorSlab(ursina.Entity):
    def __init__(self, position, scale):
        # Calculate texture tiling based on 2x2 unit tile size to match ground floor
        t_x = max(1.0, float(scale[0]) / 2.0)
        t_z = max(1.0, float(scale[2]) / 2.0)

        super().__init__(
            position=position,
            scale=scale,
            model="cube",
            texture="assets/floor.png",
            texture_scale=(t_x, t_z),
            collider="box"
        )
        if self.texture:
            self.texture.filtering = None


class Floor:
    def __init__(self):
        """
        Multi-level arena floor system:
        - Ground Floor: Optimized combined mesh with identical checkerboard appearance and 1 box collider
        - 1st Floor (Upper Deck): Scaled floor slabs overlooking the central combat arena
        - Dual Staircases: Smooth stairs (East & West) to go up and down with ramp colliders
        - Support Pillars, Railings, and Tactical Cover
        Keeps entity count minimal to completely eliminate lag while providing high FPS.
        """
        self.build_ground_floor()
        self.build_first_floor()
        self.build_stairs()
        self.build_pillars_and_railings()

    def build_ground_floor(self):
        # Build ground floor checkerboard and combine into 1 single entity with 1 box collider
        ground_parent = ursina.Entity()
        dark1 = True
        for z in range(-20, 20, 2):
            dark2 = not dark1
            for x in range(-20, 20, 2):
                cube = ursina.Entity(
                    parent=ground_parent,
                    position=ursina.Vec3(x, 0, z),
                    scale=2,
                    model="cube"
                )
                if dark2:
                    cube.color = ursina.color.hsv(0, 0.2, 0.8)
                else:
                    cube.color = ursina.color.hsv(0, 0.2, 1)
                dark2 = not dark2
            dark1 = not dark1

        ground_parent.combine(auto_destroy=True)
        ground_parent.texture = "assets/floor.png"
        if ground_parent.texture:
            ground_parent.texture.filtering = None
        ground_parent.collider = "box"
        self.ground = ground_parent

    def build_first_floor(self):
        # 1st Floor standing height is at y = 6.0 (slab center at y = 5.75, thickness 0.5)
        floor_y = 5.75
        slab_thick = 0.5

        # 4 large scaled slabs covering the 40x40 footprint with an open central mezzanine/atrium
        self.first_floor_slabs = [
            # North platform: X: [-20, 20], Z: [6, 20]
            FloorSlab(ursina.Vec3(0, floor_y, 13), ursina.Vec3(40, slab_thick, 14)),
            # South platform: X: [-20, 20], Z: [-20, -6]
            FloorSlab(ursina.Vec3(0, floor_y, -13), ursina.Vec3(40, slab_thick, 14)),
            # East walkway: X: [12, 20], Z: [-6, 6]
            FloorSlab(ursina.Vec3(16, floor_y, 0), ursina.Vec3(8, slab_thick, 12)),
            # West walkway: X: [-20, -12], Z: [-6, 6]
            FloorSlab(ursina.Vec3(-16, floor_y, 0), ursina.Vec3(8, slab_thick, 12)),
        ]

    def build_stairs(self):
        delta_z = 10.0
        delta_y = 5.0
        angle = math.degrees(math.atan2(delta_y, delta_z))
        hypot_len = math.hypot(delta_z, delta_y)

        # Stair 1 (East flank at x = 8.5): climbs +Z from ground (z = -4, y = 1.0) to 1st floor (z = 6, y = 6.0)
        stair1_parent = ursina.Entity()
        for i in range(10):
            ursina.Entity(
                parent=stair1_parent,
                model="cube",
                position=ursina.Vec3(8.5, 1.25 + i * 0.5, -3.5 + i * 1.0),
                scale=ursina.Vec3(3.5, 0.5, 1.0),
            )
        stair1_parent.combine(auto_destroy=True)
        stair1_parent.texture = "assets/floor.png"
        if stair1_parent.texture:
            stair1_parent.texture.filtering = None
        stair1_parent.color = ursina.color.hsv(0, 0.2, 0.9)

        # Smooth ramp collider for seamless running up and down without collision snagging
        self.stair1_ramp = ursina.Entity(
            model="cube",
            visible=False,
            position=ursina.Vec3(8.5, 3.5 + 0.12, 1.0 + 0.25),
            scale=ursina.Vec3(3.5, 0.2, hypot_len + 0.5),
            rotation_x=-angle,
            collider="box"
        )
        self.stair1_rail_l = ursina.Entity(
            model="cube",
            position=ursina.Vec3(6.65, 3.9, 1.0),
            scale=ursina.Vec3(0.2, 0.8, hypot_len),
            rotation_x=-angle,
            texture="assets/wall.png",
            collider="box"
        )
        self.stair1_rail_r = ursina.Entity(
            model="cube",
            position=ursina.Vec3(10.35, 3.9, 1.0),
            scale=ursina.Vec3(0.2, 0.8, hypot_len),
            rotation_x=-angle,
            texture="assets/wall.png",
            collider="box"
        )

        # Stair 2 (West flank at x = -8.5): climbs -Z from ground (z = 4, y = 1.0) to 1st floor (z = -6, y = 6.0)
        stair2_parent = ursina.Entity()
        for i in range(10):
            ursina.Entity(
                parent=stair2_parent,
                model="cube",
                position=ursina.Vec3(-8.5, 1.25 + i * 0.5, 3.5 - i * 1.0),
                scale=ursina.Vec3(3.5, 0.5, 1.0),
            )
        stair2_parent.combine(auto_destroy=True)
        stair2_parent.texture = "assets/floor.png"
        if stair2_parent.texture:
            stair2_parent.texture.filtering = None
        stair2_parent.color = ursina.color.hsv(0, 0.2, 0.9)

        self.stair2_ramp = ursina.Entity(
            model="cube",
            visible=False,
            position=ursina.Vec3(-8.5, 3.5 + 0.12, -1.0 - 0.25),
            scale=ursina.Vec3(3.5, 0.2, hypot_len + 0.5),
            rotation_x=angle,
            collider="box"
        )
        self.stair2_rail_l = ursina.Entity(
            model="cube",
            position=ursina.Vec3(-6.65, 3.9, -1.0),
            scale=ursina.Vec3(0.2, 0.8, hypot_len),
            rotation_x=angle,
            texture="assets/wall.png",
            collider="box"
        )
        self.stair2_rail_r = ursina.Entity(
            model="cube",
            position=ursina.Vec3(-10.35, 3.9, -1.0),
            scale=ursina.Vec3(0.2, 0.8, hypot_len),
            rotation_x=angle,
            texture="assets/wall.png",
            collider="box"
        )

    def build_pillars_and_railings(self):
        # 4 Architectural Support Pillars
        self.pillars = [
            ursina.Entity(model="cube", position=ursina.Vec3(12, 3.5, 6), scale=ursina.Vec3(1, 5, 1), texture="assets/wall.png", collider="box"),
            ursina.Entity(model="cube", position=ursina.Vec3(12, 3.5, -6), scale=ursina.Vec3(1, 5, 1), texture="assets/wall.png", collider="box"),
            ursina.Entity(model="cube", position=ursina.Vec3(-12, 3.5, 6), scale=ursina.Vec3(1, 5, 1), texture="assets/wall.png", collider="box"),
            ursina.Entity(model="cube", position=ursina.Vec3(-12, 3.5, -6), scale=ursina.Vec3(1, 5, 1), texture="assets/wall.png", collider="box"),
        ]

        # Safety railings along the edge of the open 1st floor atrium
        self.railings = [
            # East & West atrium perimeter railings
            ursina.Entity(model="cube", position=ursina.Vec3(12, 6.5, 0), scale=ursina.Vec3(0.4, 1.0, 12), texture="assets/wall.png", collider="box"),
            ursina.Entity(model="cube", position=ursina.Vec3(-12, 6.5, 0), scale=ursina.Vec3(0.4, 1.0, 12), texture="assets/wall.png", collider="box"),
            # North atrium railings (leaving stair opening at x = 8.5)
            ursina.Entity(model="cube", position=ursina.Vec3(-2.625, 6.5, 6), scale=ursina.Vec3(18.75, 1.0, 0.4), texture="assets/wall.png", collider="box"),
            ursina.Entity(model="cube", position=ursina.Vec3(11.125, 6.5, 6), scale=ursina.Vec3(1.75, 1.0, 0.4), texture="assets/wall.png", collider="box"),
            # South atrium railings (leaving stair opening at x = -8.5)
            ursina.Entity(model="cube", position=ursina.Vec3(2.625, 6.5, -6), scale=ursina.Vec3(18.75, 1.0, 0.4), texture="assets/wall.png", collider="box"),
            ursina.Entity(model="cube", position=ursina.Vec3(-11.125, 6.5, -6), scale=ursina.Vec3(1.75, 1.0, 0.4), texture="assets/wall.png", collider="box"),
        ]

        # 1st Floor Tactical Cover Barricades
        self.cover_barricades = [
            ursina.Entity(model="cube", position=ursina.Vec3(0, 7.5, 15), scale=ursina.Vec3(4, 3.0, 1.0), texture="assets/wall.png", collider="box"),
            ursina.Entity(model="cube", position=ursina.Vec3(0, 7.5, -15), scale=ursina.Vec3(4, 3.0, 1.0), texture="assets/wall.png", collider="box"),
        ]
