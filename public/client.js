const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const socket = io();

const bgImage = new Image();
bgImage.src = '/zombiehanter/images/grass.png';
const playerImg = new Image();
playerImg.src = '/zombiehanter/images/player.png';
const zombieImg = new Image();
zombieImg.src = '/zombiehanter/images/zombie.png';

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

let playerId = null;
let players = {};
let bullets = [];
let zombies = [];
let dead = false;
let deathMsg = '';
let respawnTimer = 0;
let killLog = [];

const TILE = 32;

function iso(x, y) {
  return {
    x: (x - y) * TILE,
    y: (x + y) * TILE / 2
  };
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (bgImage.complete) {
  const pattern = ctx.createPattern(bgImage, 'repeat');
  ctx.fillStyle = '#654321';
ctx.fillRect(-100, -100, canvas.width + 200, 100);        // Верх
ctx.fillRect(-100, -100, 100, canvas.height + 200);       // Лево
ctx.fillRect(canvas.width - 100, -100, 100, canvas.height + 200); // Право
ctx.fillRect(-100, canvas.height - 100, canvas.width + 200, 100); // Низ
  ctx.save();
  ctx.fillStyle = pattern;

  // Объявляем размер карты в изометрии
  const mapIso = iso(MAP_WIDTH, MAP_HEIGHT);

  ctx.fillRect(-mapIso.x / 2, -mapIso.y / 2, mapIso.x, mapIso.y);
  ctx.restore();
}

  // ✅ ФИКСИРОВАННАЯ КАМЕРА — вся карта видна
  ctx.save();
  ctx.translate(canvas.width / 2, 150);
  
  // Игроки
  for (const [id, p] of Object.entries(players)) {
    const { x: sx, y: sy } = iso(p.x, p.y);
    ctx.fillStyle = p.color || '#0f0';
    ctx.drawImage(playerImg, sx - 16, sy - 16, 32, 32);
    if (id === playerId) {
      ctx.strokeStyle = 'yellow';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    
    // ✅ ИМЯ ИГРОКА
    ctx.fillStyle = 'white';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name || id.slice(0, 4), sx, sy - 30);
    
    // HP-bar
    const barW = 36, barH = 6;
    const hp = p.hp ?? 100, hpPct = Math.max(0, Math.min(1, hp / 100));
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx - barW / 2, sy - 22, barW, barH);
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(sx - barW / 2 + 1, sy - 22 + 1, (barW - 2) * hpPct, barH - 2);
    ctx.strokeStyle = '#222';
    ctx.strokeRect(sx - barW / 2, sy - 22, barW, barH);
  }

  // Зомби
  for (const z of zombies) {
    if (!z || z.dead) continue;
    const { x: sx, y: sy } = iso(z.x, z.y);
    const size = 40;
    if (zombieImg.complete) 
      ctx.drawImage(zombieImg, sx - size / 2, sy - size / 2, size, size);
    else {
      ctx.fillStyle = '#f44336';
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
    }
    // Зомби HP
    const barW = 36, barH = 6, hp = z.hp ?? 100;
    const hpPct = Math.max(0, Math.min(1, hp / 100));
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx - barW / 2, sy - 22, barW, barH);
    ctx.fillStyle = '#f44336';
    ctx.fillRect(sx - barW / 2 + 1, sy - 22 + 1, (barW - 2) * hpPct, barH - 2);
    ctx.strokeStyle = '#222';
    ctx.strokeRect(sx - barW / 2, sy - 22, barW, barH);
  }

  // Пули
  for (const b of bullets) {
    const { x: sx, y: sy } = iso(b.x, b.y);
    ctx.fillStyle = b.color || '#ff0';
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Death screen
  if (dead) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(deathMsg, canvas.width / 2, canvas.height / 2 - 20);
    ctx.font = '20px sans-serif';
    //ctx.fillText(`Respawning in ${respawnTimer.toFixed(0)}...`, canvas.width / 2, canvas.height / 2 + 20);
  }

  // ✅ KILL LOG
  const logElem = document.getElementById('kill-log');
  if (logElem) {
    logElem.innerHTML = killLog.slice(-10).reverse().map(entry => {
      const killer = players[entry.killer]?.name || entry.killer;
      const victim = players[entry.victim]?.name || entry.victim;
      if (entry.type === "player_kills_player")
        return `<span style="color:#90ff90;font-weight:bold">${killer}</span> убил <span style="color:#ff9090;font-weight:bold">${victim}</span>`;
      if (entry.type === "zombie_kills_player")
        return `<span style="color:#90e0ff;font-weight:bold">Зомби</span> съел <span style="color:#ff9090;font-weight:bold">${victim}</span>`;
      if (entry.type === "player_kills_zombie")
        return `<span style="color:#90ff90;font-weight:bold">${killer}</span> убил <span style="color:#aa3333">Зомби</span>`;
      return "???";
    }).join('<br>');
  }

  requestAnimationFrame(draw);
}

draw();

const keys = {};
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function updateInput() {
  if (!playerId) return;
  const dir = { x: 0, y: 0 };
  if (keys['w'] || keys['ц']) dir.y -= 1;
  if (keys['s'] || keys['ы']) dir.y += 1;
  if (keys['a'] || keys['ф']) dir.x -= 1;
  if (keys['d'] || keys['в']) dir.x += 1;
  const len = Math.hypot(dir.x, dir.y) || 0;
  if (len > 0) {
    dir.x /= len;
    dir.y /= len;
    socket.emit('move', dir);
  } else {
    socket.emit('move', { x: 0, y: 0 });
  }
  if (dead && respawnTimer > 0) {
    respawnTimer -= 1 / 60;
  }
}
setInterval(updateInput, 50);

canvas.addEventListener('click', (e) => {
  if (!playerId) return;
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left - canvas.width / 2;
  const cy = e.clientY - rect.top - 150;
  const me = players[playerId];
  if (!me) return;
  const dx = cx / TILE + cy / (TILE / 2);
  const dy = -cx / TILE + cy / (TILE / 2);
  const target = { x: me.x + dx / 50, y: me.y + dy / 50 };
  socket.emit('shoot', target);
});

socket.on('init', id => playerId = id);

socket.on('death', ({ id, msg }) => {
  if (id === playerId) {
    dead = true;
    deathMsg = msg;
    respawnTimer = 5;
    if (window.respawnInterval) clearInterval(window.respawnInterval);
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.style.display = 'block';
    window.respawnInterval = setInterval(() => {
      respawnTimer = Math.max(0, respawnTimer - 1);  // ← УБРАЛ .toFixed()
      if (timerEl) timerEl.textContent = Math.floor(respawnTimer);  // ← ОКРУГЛЕНИЕ
      if (respawnTimer <= 0) {
        clearInterval(window.respawnInterval);
      if (timerEl) timerEl.style.display = 'none';
    socket.emit('respawn');
  }
}, 1000);
  }
});

socket.on('zombie_dead', ({ id }) => {
  const z = zombies.find(z => z && z.id === id);
  if (z) z.dead = true;
});

socket.on('zombie_respawn', ({ id, x, y }) => {
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
    players[id] = { x, y, hp, color: `hsl(${Math.random()*360},80%,60%)`, name: `Игрок${id.slice(-2)}`, input: { x:0, y:0 }, dead: false };
  } else {
    const p = players[id];
    p.dead = false;
    p.hp = hp;
    p.x = x;
    p.y = y;
  }
  if (id === playerId) {
    dead = false;
    respawnTimer = 0;
    deathMsg = '';
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.style.display = 'none';
  }
});

socket.on('state', state => {
  players = state.players || {};
  bullets = state.bullets || [];
  zombies = state.zombies || [];
  killLog = state.killLog || [];
});
