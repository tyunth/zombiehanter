import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;
const WALL_THICKNESS = 40;
const PLAY_WIDTH = MAP_WIDTH - WALL_THICKNESS * 2;
const PLAY_HEIGHT = MAP_HEIGHT - WALL_THICKNESS * 2;
const ZOMBIE_SPAWN = { 
  x: WALL_THICKNESS + PLAY_WIDTH / 2, 
  y: WALL_THICKNESS + PLAY_HEIGHT / 2 
};
const PLAYER_SPAWNS = [
  { x: WALL_THICKNESS + PLAY_WIDTH / 4, WALL_THICKNESS + PLAY_HEIGHT / 4 },
  { x: WALL_THICKNESS + PLAY_WIDTH / 4 * 3, WALL_THICKNESS + PLAY_HEIGHT / 4 },
  { x: WALL_THICKNESS + PLAY_WIDTH / 4, WALL_THICKNESS + PLAY_HEIGHT / 4 * 3 },
  { x: WALL_THICKNESS + PLAY_WIDTH / 4 * 3, WALL_THICKNESS + PLAY_HEIGHT / 4 * 3 },
];

app.use(express.static('public'));

const players = {};
const bullets = [];
let nextZombieId = 1;
let zombies = [{ x: ZOMBIE_SPAWN.x, y: ZOMBIE_SPAWN.y, hp: 100, id: nextZombieId++, speed: 0.2, dead: false }];
const killLog = [];
const KILL_LOG_LIMIT = 10;
const TICK_MS = 50;
const PLAYER_SPEED = 1000;
const BULLET_DAMAGE = 34;
const BULLET_SPEED = 1500;
const ZOMBIE_SPEED = 1;

app.get('/debug-spawn-zombie', (req, res) => {
  const id = nextZombieId++;
  zombies.push({ x: ZOMBIE_SPAWN.x, y: ZOMBIE_SPAWN.y, hp: 100, id, speed: 0.2, dead: false });
  io.emit('zombie_respawn', { id, x: ZOMBIE_SPAWN.x, y: ZOMBIE_SPAWN.y });
  console.log(`DEBUG: Зомби ${id} заспавнился!`);
  res.send(`Зомби ${id} заспавнился!`);
});

function clamp(pos) {
  return Math.max(WALL_THICKNESS, Math.min(MAP_WIDTH - WALL_THICKNESS, pos));
}

function ensureZombie() {
  if (!zombies.some(z => !z.dead)) {
    const id = nextZombieId++;
    zombies.push({ x: ZOMBIE_SPAWN.x, y: ZOMBIE_SPAWN.y, hp: 100, id, speed: 0.2, dead: false });
    io.emit('zombie_respawn', { id, x: ZOMBIE_SPAWN.x, y: ZOMBIE_SPAWN.y });
    console.log(`Зомби ${id} заспавнился автоматически!`);
  }
}

setInterval(() => {
  // Игроки двигаются
  for (const [id, p] of Object.entries(players)) {
    if (p.dead) continue;
    const speed = PLAYER_SPEED * (TICK_MS / 16);
    p.x += p.input?.x * speed || 0;
    p.y += p.input?.y * speed || 0;
    p.x = clamp(p.x);
    p.y = clamp(p.y);
    p.angle = Math.atan2(p.input?.y || 0, p.input?.x || 0);
  }

  // Пули
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += Math.cos(b.angle) * BULLET_SPEED * (TICK_MS / 16);
    b.y += Math.sin(b.angle) * BULLET_SPEED * (TICK_MS / 16);
    b.life--;

    // Пули в стены
    if (b.x < WALL_THICKNESS || b.x > MAP_WIDTH - WALL_THICKNESS || 
        b.y < WALL_THICKNESS || b.y > MAP_HEIGHT - WALL_THICKNESS) {
      bullets.splice(i, 1);
      continue;
    }

    // Пули в зомби
    for (const z of zombies) {
      if (z.dead) continue;
      const dist = Math.hypot(b.x - z.x, b.y - z.y);
      if (dist < 25) {
        z.hp -= 25;
        bullets.splice(i, 1);
        if (z.hp <= 0) {
          z.dead = true;
          io.emit('zombie_dead', { id: z.id });
          killLog.push({ killer: b.ownerId, victim: 'Zombie', type: 'player_kills_zombie' });
      console.log(`KILLLOG: player ${b.ownerId} killed zombie ${z.id}`);
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
          }, 3000);
        }
        break;
      }
    }
  }

  // Пули в игроков
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    for (const [pid, p] of Object.entries(players)) {
      if (pid === b.ownerId || p.dead) continue;
      const dist = Math.hypot(b.x - p.x, b.y - p.y);
      if (dist < 20) {
        p.hp = Math.max(0, (p.hp || 100) - BULLET_DAMAGE);
        bullets.splice(i, 1);
if (p.hp <= 0) {
  p.dead = true;
  // стандартный формат: killer — либо socket id строки (игрок), либо строка 'Zombie'
  killLog.push({ killer: b.ownerId, victim: pid, type: 'player_kills_player' });
  while (killLog.length > KILL_LOG_LIMIT) killLog.shift();

  console.log(`DEATH: player ${pid} killed by player ${b.ownerId}`);
  io.emit('death', { id: pid, msg: 'Убит игроком!', killer: b.ownerId });
}
        break;
      }
    }
  }

  // Зомби двигаются и атакуют
  for (const z of zombies) {
    if (z.dead) continue;
    
    let closest = null;
    let minDist = Infinity;
    for (const [pid, p] of Object.entries(players)) {
      if (p.dead) continue;
      const dist = Math.hypot(p.x - z.x, p.y - z.y);
      if (dist < minDist) {
        minDist = dist;
        closest = { id: pid, player: p };
      }
    }
    
    if (closest) {
      const dx = closest.player.x - z.x;
      const dy = closest.player.y - z.y;
      const dist = Math.hypot(dx, dy);
      z.angle = Math.atan2(dy, dx);
      
      if (dist > 30) {
        z.x += (dx / dist) * ZOMBIE_SPEED * 60 * (TICK_MS / 1000);
        z.y += (dy / dist) * ZOMBIE_SPEED * 60 * (TICK_MS / 1000);
      }
      
      if (dist < 35) {
        closest.player.hp = Math.max(0, closest.player.hp - 1);
if (closest.player.hp <= 0) {
  closest.player.dead = true;

  // Для удобства клиента указываем killer как строку 'Zombie' (чтобы не путать с socket id)
  killLog.push({ killer: 'Zombie', victim: closest.id, type: 'zombie_kills_player' });
  while (killLog.length > KILL_LOG_LIMIT) killLog.shift();

  console.log(`DEATH: player ${closest.id} eaten by zombie ${z.id}`);
  io.emit('death', { id: closest.id, msg: 'Съеден зомби!', killer: 'Zombie' });
}
      }
    }
    
    z.x = clamp(z.x);
    z.y = clamp(z.y);
  }

  // Удаляем пули
  bullets = bullets.filter(b => b.life > 0);

  ensureZombie();
  io.emit('state', { players, bullets, zombies, killLog });
}, TICK_MS);

io.on('connection', (socket) => {
  console.log('Подключился:', socket.id);
  console.log(`SPAWN: ${socket.id} at`, players[socket.id].x, players[socket.id].y);
  const playerNum = Object.keys(players).length + 1;
  const spawn = PLAYER_SPAWNS[Math.floor(Math.random() * PLAYER_SPAWNS.length)];
  players[socket.id] = {
  x: spawn.x,
  y: spawn.y,
  hp: 100,
  color: getRandomColor(),
  dead: false,
  };

  socket.emit('init', socket.id);

  // Всех зомби новому игроку
  zombies.filter(z => !z.dead).forEach(z => {
    socket.emit('zombie_respawn', { id: z.id, x: z.x, y: z.y });
  });

  socket.on('move', dir => {
    const p = players[socket.id];
    if (p && !p.dead) p.input = dir;
  });

  socket.on('shoot', target => {
    const p = players[socket.id];
    if (!p || p.dead) return;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const angle = Math.atan2(dy, dx);
    bullets.push({
      x: p.x, y: p.y, angle,
      speed: BULLET_SPEED, life: 100,
      color: p.color, ownerId: socket.id,
      damage: BULLET_DAMAGE
    });
  });

socket.on('respawn', () => {
  const p = players[socket.id];
  if (!p) return;
  const spawn = PLAYER_SPAWNS[Math.floor(Math.random() * PLAYER_SPAWNS.length)];
  p.hp = 100;
  p.dead = false;
  p.x = spawn.x;
  p.y = spawn.y;
  io.emit('player_respawn', { id: socket.id, x: p.x, y: p.y });
});

  socket.on('disconnect', () => {
    delete players[socket.id];
    console.log('Отключился:', socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Сервер: http://localhost:${PORT}`);
  console.log(`🔧 Зомби: http://localhost:${PORT}/debug-spawn-zombie`);
});
