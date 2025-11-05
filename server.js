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
const zombies = [
  { x: ZOMBIE_SPAWN.x, y: ZOMBIE_SPAWN.y, hp: 100, id: 1,speed: 0.2 }
];

// Игровой тик
const TICK_MS = 50;
const PLAYER_SPEED = 0.08; // подбирай: чем больше — тем быстрее
const BULLET_DAMAGE = 34;

setInterval(() => {
  // 1) Обновляем позиции игроков по их input (нормализация вектора)
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
  }

  // 2) Обновляем пули
  for (const b of bullets) {
    b.x += Math.cos(b.angle) * b.speed;
    b.y += Math.sin(b.angle) * b.speed;
    b.life--;
	 // Проверяем столкновение пули с зомби
	for (const z of zombies) {
		if (z.dead) continue;
		const dist = Math.hypot(b.x - z.x, b.y - z.y);
		if (dist < 20) { // радиус попадания
			z.hp -= 20;
			b.dead = true;
			if (z.hp <= 0) {
				z.dead = true;
				io.emit('zombie_dead', { id: z.id });

				setTimeout(() => {
				z.hp = 100;
				z.x = Math.max(20, Math.min(MAP_WIDTH - 20, ZOMBIE_SPAWN.x));
				z.y = Math.max(20, Math.min(MAP_HEIGHT - 20, ZOMBIE_SPAWN.y));
				z.dead = false;
				io.emit('zombie_respawn', { id: z.id, x: z.x, y: z.y });
				}, 5000);
			}
		break;
		}
	}
  }

  // 3) Коллизии: пуля <-> игрок
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    // проверяем по всем игрокам кроме владельца
    for (const [pid, pl] of Object.entries(players)) {
      if (pid === b.ownerId) continue;
      const dx = pl.x - b.x;
      const dy = pl.y - b.y;
      const dist2 = dx*dx + dy*dy;
      const hitRadius = 0.6; // порог попадания в мировых единицах — подбери
      if (dist2 <= hitRadius * hitRadius) {
        // попал
        pl.hp = (pl.hp || 100) - (b.damage || BULLET_DAMAGE);
        // удаляем пулю
        bullets.splice(bi, 1);
        // если игрок умер — убираем его (или помечаем)
        if (pl.hp <= 0) {
          // можно удалить или пометить для респауна
          delete players[pid];
          // уведомим всех о смерти (опционально)
          io.emit('playerDeath', { id: pid, killer: b.ownerId });
        }
        break; // выйти по этой пуле (она уже удалена)
      }
    }
  }
  
  //Добавляем движение зомби
for (const z of zombies) {
    if (z.dead) continue;
    
    // Находим ближайшего живого игрока
    let closestPlayer = null;
    let minDist = Infinity;
    
    for (const player of Object.values(players)) {
        if (player.dead) continue;
        const dist = Math.hypot(player.x - z.x, player.y - z.y);
        if (dist < minDist) {
            minDist = dist;
            closestPlayer = player;
        }
    }
    
    if (!closestPlayer) continue;

    const dx = closestPlayer.x - z.x;
    const dy = closestPlayer.y - z.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist > 1) {
        z.x += (dx / dist) * z.speed;
        z.y += (dy / dist) * z.speed;
    }

    // Проверка на столкновение с игроком
    if (dist < 1.5) { // Увеличил радиус столкновения
        closestPlayer.hp = Math.max(0, (closestPlayer.hp || 100) - 0.5);
        
        if (closestPlayer.hp <= 0 && !closestPlayer.dead) {
            closestPlayer.dead = true;
            closestPlayer.deathMsg = 'You\'ve been eaten by a Zombie';
            io.emit('death', { id: Object.keys(players).find(key => players[key] === closestPlayer), msg: closestPlayer.deathMsg });
        }
    }
}

  // 4) Удаляем старые пули по life
  for (let i = bullets.length - 1; i >= 0; i--) {
    if (bullets[i].life <= 0) bullets.splice(i, 1);
  }

  // 5) Рассылаем состояние (players и bullets и zombies)
  io.emit('state', { players, bullets, zombies });
}, TICK_MS);

// Игроки подключаются
io.on('connection', (socket) => {
  console.log('Игрок подключился:', socket.id);

players[socket.id] = {
  x: Math.random() * 10,
  y: Math.random() * 10,
  color: `hsl(${Math.random() * 360}, 80%, 60%)`,
  angle: 0,
  hp: 100,                // добавлено HP
  input: { x: 0, y: 0 }   // сюда будем писать последнее направление
};

  socket.emit('init', socket.id);

	socket.on('move', (dir) => {
	const p = players[socket.id];
	if (!p) return;
	p.input = dir; // просто сохраняем направление
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
    life: 80,           // ticks
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
  const p = players[socket.id];
  if (!p) return;
  p.hp = 100;
  p.dead = false;
  p.x = Math.random() * 500;
  p.y = Math.random() * 500;
});
});



const PORT = 3000;
server.listen(PORT, () => console.log(`Сервер запущен: http://localhost:${PORT}`));
