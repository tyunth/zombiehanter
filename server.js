import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;
const ZOMBIE_SPAWN = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };

app.use(express.static('public'));

const players = {};
const bullets = [];
let nextZombieId = 2; // у первого зомби id=1
let zombies = [
  { x: ZOMBIE_SPAWN.x, y: ZOMBIE_SPAWN.y, hp: 100, id: 1, speed: 0.2, dead: false }
];

const killLog = [];
const KILL_LOG_LIMIT = 10;

const TICK_MS = 50;
const PLAYER_SPEED = 0.08;
const BULLET_DAMAGE = 34;

function ensureZombie() {
  // Если живых зомби нет, респаун
  if (!zombies.some(z => !z.dead)) {
    const id = nextZombieId++;
    zombies.push({
      x: ZOMBIE_SPAWN.x,
      y: ZOMBIE_SPAWN.y,
      hp: 100,
      id, speed: 0.2, dead: false
    });
    io.emit('zombie_respawn', { id, x: ZOMBIE_SPAWN.x, y: ZOMBIE_SPAWN.y });
  }
}

setInterval(() => {
  // Двигаем игроков
  for (const id of Object.keys(players)) {
    const p = players[id];
    const ix = p.input?.x || 0;
    const iy = p.input?.y || 0;
    if (ix === 0 && iy === 0) continue;
    const len = Math.hypot(ix, iy) || 1;
    const nx = ix / len;
    const ny = iy / len;
    p.x += nx * PLAYER_SPEED * (TICK_MS / 50);
    p.y += ny * PLAYER_SPEED * (TICK_MS / 50);
    // Ограничение координат по карте
    p.x = Math.max(0, Math.min(MAP_WIDTH, p.x));
    p.y = Math.max(0, Math.min(MAP_HEIGHT, p.y));
  }

  // Обновляем пули
  for (const b of bullets) {
    b.x += Math.cos(b.angle) * b.speed;
    b.y += Math.sin(b.angle) * b.speed;
    b.life--;
    // Столкновение пули с зомби
    for (const z of zombies) {
      if (z.dead) continue;
      const dist = Math.hypot(b.x - z.x, b.y - z.y);
      if (dist < 20) {
        z.hp -= 20;
        b.dead = true;
        if (z.hp <= 0) {
          z.dead = true;
          io.emit('zombie_dead', { id: z.id });
          killLog.push({
            victim: "Zombie",
            killer: b.ownerId,
            type: "player_kills_zombie"
          });
          while (killLog.length > KILL_LOG_LIMIT) killLog.shift();

    const zombieId = z.id;
    setTimeout(() => {
      const zz = zombies.find(zz => zz.id === zombieId);
      if (zz) {
        zz.hp = 100;
        zz.x = ZOMBIE_SPAWN.x;
        zz.y = ZOMBIE_SPAWN.y;
        zz.dead = false;
        io.emit('zombie_respawn', { id: zz.id, x: zz.x, y: zz.y });
  }
}, 5000);
        }
        break;
      }
    }
  }

  // Пуля <-> игрок
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    for (const [pid, pl] of Object.entries(players)) {
      if (pid === b.ownerId) continue;
      const dx = pl.x - b.x;
      const dy = pl.y - b.y;
      const dist2 = dx * dx + dy * dy;
      const hitRadius = 0.6;
      if (dist2 <= hitRadius * hitRadius) {
        pl.hp = (pl.hp || 100) - (b.damage || BULLET_DAMAGE);
        bullets.splice(bi, 1);
        if (pl.hp <= 0 && !pl.dead) {
          pl.dead = true;
          pl.hp = 0;
          killLog.push({
            victim: pid,
            killer: b.ownerId,
            type: "player_kills_player"
          });
          while (killLog.length > KILL_LOG_LIMIT) killLog.shift();
          io.emit('death', { id: pid, msg: `You've been shot by a Player`, killer: b.ownerId });
        }
        break;
      }
    }
  }

  // Зомби атакует игрока
  for (const z of zombies) {
    if (z.dead) continue;
    let closestPlayer = null;
    let minDist = Infinity;
    for (const [pid, player] of Object.entries(players)) {
      if (player.dead) continue;
      const dist = Math.hypot(player.x - z.x, player.y - z.y);
      if (dist < minDist) {
        minDist = dist;
        closestPlayer = { player, pid };
      }
    }
    if (!closestPlayer) continue;
    const dx = closestPlayer.player.x - z.x;
    const dy = closestPlayer.player.y - z.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      z.x += (dx / dist) * z.speed;
      z.y += (dy / dist) * z.speed;
      // --- Clamp zombie по карте ---
      z.x = Math.max(0, Math.min(MAP_WIDTH, z.x));
      z.y = Math.max(0, Math.min(MAP_HEIGHT, z.y));
    }
    if (dist < 1.5) {
      closestPlayer.player.hp = Math.max(0, (closestPlayer.player.hp || 100) - 0.5);
      if (closestPlayer.player.hp <= 0 && !closestPlayer.player.dead) {
        closestPlayer.player.dead = true;
        closestPlayer.player.deathMsg = "You've been eaten by a Zombie";
        killLog.push({
          victim: closestPlayer.pid,
          killer: z.id,
          type: "zombie_kills_player"
        });
        while (killLog.length > KILL_LOG_LIMIT) killLog.shift();
        io.emit('death', { id: closestPlayer.pid, msg: closestPlayer.player.deathMsg, killer: z.id });
      }
    }
  }

  // Удаляем старые пули
  for (let i = bullets.length - 1; i >= 0; i--) {
    if (bullets[i].life <= 0 || bullets[i].dead) bullets.splice(i, 1);
  }

  // Гарантировать, чтобы хотя бы один живой зомби был на поле
  if (zombies.length === 0 || zombies.every(z => z.dead)) {
    ensureZombie();
  }

  // Передаем состояние + killLog последним 10 событий
  io.emit('state', { players, bullets, zombies, killLog });

}, TICK_MS);

io.on('connection', (socket) => {
  console.log('Игрок подключился:', socket.id);

  players[socket.id] = {
    x: Math.random() * (MAP_WIDTH - 40) + 20,
    y: Math.random() * (MAP_HEIGHT - 40) + 20,
    color: `hsl(${Math.random() * 360}, 80%, 60%)`,
    angle: 0,
    hp: 100,
    input: { x: 0, y: 0 },
    dead: false
  };

// Гарантируем хотя бы 1 зомби при старте
if (zombies.length === 0 || zombies.every(z => z.dead)) {
  const id = nextZombieId++;
  zombies.push({ x: ZOMBIE_SPAWN.x, y: ZOMBIE_SPAWN.y, hp: 100, id, speed: 0.2, dead: false });
}

  socket.emit('init', socket.id);
  zombies.forEach(z => {
  if (!z.dead) {
    socket.emit('zombie_respawn', { id: z.id, x: z.x, y: z.y });
  }
});
  socket.on('move', (dir) => {
    const p = players[socket.id];
    if (!p) return;
    p.input = dir;
  });

  socket.on('shoot', (target) => {
    const p = players[socket.id];
    if (!p) return;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const angle = Math.atan2(dy, dx);
    bullets.push({
      x: p.x,
      y: p.y,
      angle,
      speed: 0.6,
      life: 80,
      color: p.color,
      ownerId: socket.id,
      damage: 34
    });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    console.log('Игрок вышел:', socket.id);
  });

  socket.on('respawn', () => {
    let p = players[socket.id];
    if (!p) {
      players[socket.id] = {
        x: Math.random() * (MAP_WIDTH - 40) + 20,
        y: Math.random() * (MAP_HEIGHT - 40) + 20,
        color: `hsl(${Math.random() * 360}, 80%, 60%)`,
        angle: 0,
        hp: 100,
        input: { x: 0, y: 0 },
        dead: false
      };
      p = players[socket.id];
      console.log('Respawn: recreated player object for', socket.id);
    } else {
      p.hp = 100;
      p.dead = false;
      p.x = Math.random() * (MAP_WIDTH - 40) + 20;
      p.y = Math.random() * (MAP_HEIGHT - 40) + 20;
      console.log('Respawn: revived existing player', socket.id);
    }
    io.emit('player_respawn', { id: socket.id, x: p.x, y: p.y, hp: p.hp });
  });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Сервер запущен: http://localhost:${PORT}`));
