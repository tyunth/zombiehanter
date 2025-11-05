const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const socket = io();
const bgImage = new Image();
bgImage.src = 'images/grass.png';
const playerImg = new Image();
playerImg.src = 'images/player.png';
const zombieImg = new Image();
zombieImg.src = 'images/zombie.png';
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
let playerId = null;
let players = {};
let bullets = [];
let zombies = [];
let dead = false;
let deathMsg = '';
let respawnTimer = 0;

const TILE = 32;

function iso(x, y) {
  return {
    x: (x - y) * TILE,
    y: (x + y) * TILE / 2
  };
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);


	// --- Рисуем фон ---
	if (bgImage.complete) {
    const pattern = ctx.createPattern(bgImage, 'repeat');
    ctx.save();
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(canvas.width / 2, 150);

  // --- Рисуем игроков ---
  for (const [id, p] of Object.entries(players)) {
    const { x: sx, y: sy } = iso(p.x, p.y);

    // Игрок
    ctx.fillStyle = p.color || '#0f0';
	ctx.drawImage(playerImg, sx - 16, sy - 16, 32, 32);
	
    // Выделение своего персонажа
    if (id === playerId) {
      ctx.strokeStyle = 'yellow';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // HP bar над игроком
    const barW = 36;
    const barH = 6;
    const hp = p.hp ?? 100;
    const hpPct = Math.max(0, Math.min(1, hp / 100));

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx - barW / 2, sy - 22, barW, barH);

    ctx.fillStyle = '#4caf50';
    ctx.fillRect(sx - barW / 2 + 1, sy - 22 + 1, (barW - 2) * hpPct, barH - 2);

    ctx.strokeStyle = '#222';
    ctx.strokeRect(sx - barW / 2, sy - 22, barW, barH);
  }
for (const z of zombies) {
    if (!z) continue;
	if (z.dead) continue; // Пропускаем мертвых зомби
    
    const { x: sx, y: sy } = iso(z.x, z.y);
    const size = 40;
    
    // Проверяем загрузилась ли картинка
    if (zombieImg.complete) {
        ctx.drawImage(zombieImg, sx - size / 2, sy - size / 2, size, size);
    } else {
        // Fallback - рисуем красный квадрат если картинка не загрузилась
        ctx.fillStyle = '#f44336';
        ctx.fillRect(sx - size/2, sy - size/2, size, size);
    }

    // HP bar над зомби
    const barW = 36;
    const barH = 6;
    const hp = z.hp ?? 100;
    const hpPct = Math.max(0, Math.min(1, hp / 100));

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx - barW / 2, sy - 22, barW, barH);

    ctx.fillStyle = '#f44336';
    ctx.fillRect(sx - barW / 2 + 1, sy - 22 + 1, (barW - 2) * hpPct, barH - 2);

    ctx.strokeStyle = '#222';
    ctx.strokeRect(sx - barW / 2, sy - 22, barW, barH);
}

  // --- Рисуем пули ---
  for (const b of bullets) {
    const { x: sx, y: sy } = iso(b.x, b.y);
    ctx.fillStyle = b.color || '#ff0';
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  if (dead) {
	ctx.fillStyle = 'rgba(0,0,0,0.6)';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = 'white';
	ctx.font = '28px sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText(deathMsg, canvas.width / 2, canvas.height / 2 - 20);
	ctx.font = '20px sans-serif';
	ctx.fillText(`Respawning in ${respawnTimer.toFixed(0)}...`, canvas.width / 2, canvas.height / 2 + 20);
  }
  requestAnimationFrame(draw);
}


draw();

// Управление
const keys = {};
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function updateInput() {
  if (!playerId) return;
  const dir = { x: 0, y: 0 };
  if (keys['w'] || keys['ц']) dir.y -= 1;
  if (keys['s']|| keys['ы']) dir.y += 1;
  if (keys['a']|| keys['ф']) dir.x -= 1;
  if (keys['d']|| keys['в']) dir.x += 1;

  // нормализация (опционально)
  const len = Math.hypot(dir.x, dir.y) || 0;
  if (len > 0) {
    dir.x /= len;
    dir.y /= len;
    socket.emit('move', dir);
  } else {
    socket.emit('move', { x: 0, y: 0 });
  }
  if (dead && respawnTimer > 0) {
  respawnTimer -= 1 / 60; // если 60 fps
}
}
setInterval(updateInput, 50);

// Стрельба
canvas.addEventListener('click', (e) => {
  if (!playerId) return;
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left - canvas.width / 2;
  const cy = e.clientY - rect.top - 150;

  const me = players[playerId];
  if (!me) return;

  // переведем координаты в "игровые"
  const dx = cx / TILE + cy / (TILE / 2);
  const dy = -cx / TILE + cy / (TILE / 2);
  const target = { x: me.x + dx / 50, y: me.y + dy / 50 };

  socket.emit('shoot', target);
});

// Слушаем сервер
socket.on('init', id => playerId = id);
socket.on('death', ({ id, msg }) => {
  if (id === playerId) {
    dead = true;
    deathMsg = msg;
respawnTimer = 5;
const interval = setInterval(() => {
  respawnTimer--;
  if (respawnTimer <= 0) {
    clearInterval(interval);
    socket.emit('respawn');
  }
  const t = Math.max(0, respawnTimer);
  document.getElementById('timer').textContent = t;
}, 1000);
  }
});
socket.on('zombie_dead', ({ id }) => {
  if (zombies[id]) zombies[id].dead = true;
});
socket.on('zombie_respawn', ({ id, x, y }) => {
  // ищем зомби по id
  let found = false;
  for (let i = 0; i < zombies.length; i++) {
    if (zombies[i] && zombies[i].id === id) {
      zombies[i].x = x;
      zombies[i].y = y;
      zombies[i].hp = 100;
      zombies[i].dead = false;
      found = true;
      break;
    }
  }
  if (!found) {
    zombies.push({ id, x, y, hp: 100, dead: false, speed: 0.2 });
  }
});
socket.on('player_respawn', data => {
  const { id, x, y, hp } = data;
  if (!players[id]) {
    players[id] = { x, y, hp, color: `hsl(${Math.random()*360},80%,60%)`, input: { x:0,y:0 }, dead: false };
  } else {
    const p = players[id];
    p.dead = false;
    p.hp = hp;
    p.x = x;
    p.y = y;
  }

  if (id === playerId) {
    //showMessage('You are back!');
    dead = false;
    respawnTimer = 0;
  }
});
socket.on('state', state => {
  players = state.players || {};
  bullets = state.bullets || [];
  zombies = state.zombies || [];
});
