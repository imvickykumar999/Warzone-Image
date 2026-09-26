import random
import ursina
from enemy import Enemy


class Bullet(ursina.Entity):
    def __init__(self, position: ursina.Vec3, direction: float, x_direction: float, network, damage: int = None, slave=False, ignore_entity=None):
        if damage is None:
            damage = random.randint(5, 20)
        speed = 40
        dir_rad = ursina.math.radians(direction)
        x_dir_rad = ursina.math.radians(x_direction)

        self.velocity = ursina.Vec3(
            ursina.math.sin(dir_rad) * ursina.math.cos(x_dir_rad),
            ursina.math.sin(x_dir_rad),
            ursina.math.cos(dir_rad) * ursina.math.cos(x_dir_rad)
        ) * speed

        # Spawn slightly forward to prevent hitting shooter's own collider
        spawn_pos = position + self.velocity.normalized() * 0.8

        super().__init__(
            position=spawn_pos,
            model="sphere",
            collider="box",
            scale=0.2
        )

        self.damage = damage
        self.direction = direction
        self.x_direction = x_direction
        self.slave = slave
        self.network = network
        self.ignore_entity = ignore_entity
        self.lifetime = 2.0
        self.is_destroyed = False

    def update(self):
        if getattr(self, 'is_destroyed', False):
            return

        self.lifetime -= ursina.time.dt
        if self.lifetime <= 0:
            self.safe_destroy()
            return

        self.position += self.velocity * ursina.time.dt

        try:
            ignore = [self]
            if self.ignore_entity:
                ignore.append(self.ignore_entity)
            hit_info = self.intersects(ignore=ignore)
        except Exception:
            self.safe_destroy()
            return

        if hit_info.hit:
            self.is_destroyed = True
            if not self.slave:
                for entity in hit_info.entities:
                    if isinstance(entity, Enemy) and getattr(entity, 'health', 0) > 0:
                        entity.health = max(0, entity.health - self.damage)
                        if self.network:
                            self.network.send_health(entity)
                        break
            self.safe_destroy()

    def safe_destroy(self):
        if not getattr(self, 'is_destroyed', False):
            self.is_destroyed = True
        self.collision = False
        self.enabled = False
        self.visible = False
        try:
            ursina.destroy(self, delay=0.001)
        except Exception:
            pass



