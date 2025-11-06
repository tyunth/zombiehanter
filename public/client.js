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

const WALL_THICKNESS = 40;

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 🪨 СТЕНЫ (булыжники)
  ctx.fillStyle = '#654321';
  ctx.fillRect(0, 0, canvas.width, WALL_THICKNESS);                    // Верх
  ctx.fillRect(0, 0, WALL_THICKNESS, canvas.height);                   // Лево
  ctx.fillRect(canvas.width - WALL_THICKNESS, 0, WALL_THICKNESS, canvas.height); // Право
  ctx.fillRect(0, canvas.height - WALL_THICKNESS, canvas.width, WALL_THICKNESS); // Низ

  // 🌿 ТРАВА (внутри стен)
  if (bgImage.complete) {
    const pattern = ctx.createPattern(bgImage, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(WALL_THICKNESS, WALL_THICKNESS, 
                 canvas.width - WALL_THICKNESS * 2, 
                 canvas.height - WALL_THICKNESS * 2);
  }

  // Игроки
  for (const [id, p] of Object.entries(players)) {
    if (p.dead) continue;
    const x = (p.x / MAP_WIDTH) * (canvas.width - WALL_THICKNESS * 2) + WALL_THICKNESS;
    const y = (p.y / MAP_HEIGHT) * (canvas.height - WALL_THICKNESS * 2) + WALL_THICKNESS;
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.angle || 0);
    ctx.drawImage(playerImg, -16, -16, 32, 32);
    ctx.restore();

    if (id === playerId) {
      ctx.strokeStyle = 'yellow';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Имя
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name || id.slice(0, 4), x, y - 25);

    // HP
    const barW = 40, barH = 6;
    const hpPct = Math.max(0, Math.min(1, (p.hp || 100) / 100));
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - barW / 2, y - 40, barW, barH);
    ctx.fillStyle = hpPct > 0.5 ? '#4caf50' : '#f44336';
    ctx.fillRect(x - barW / 2 + 1, y - 40 + 1, (barW - 2) * hpPct, barH - 2);
  }

  // Зомби
  for (const z of zombies) {
    if (z.dead) continue;
    const x = (z.x / MAP_WIDTH) * (canvas.width - WALL_THICKNESS * 2) + WALL_THICKNESS;
    const y = (z.y / MAP_HEIGHT) * (canvas.height - WALL_THICKNESS * 2) + WALL_THICKNESS;
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(z.angle || 0);
    if (zombieImg.complete) {
      ctx.drawImage(zombieImg, -20, -20, 40, 40);
    } else {
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(-20, -20, 40, 40);
    }
    ctx.restore();

    // Зомби HP
    const barW = 40, barH = 6;
    const hpPct = Math.max(0, Math.min(1, (z.hp || 100) / 100));
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - barW / 2, y - 35, barW, barH);
    ctx.fillStyle = '#f44336';
    ctx.fillRect(x - barW / 2 + 1, y - 35 + 1, (barW - 2) * hpPct, barH - 2);
  }

  // Пули
  for (const b of bullets) {
    const x = (b.x / MAP_WIDTH) * (canvas.width - WALL_THICKNESS * 2) + WALL_THICKNESS;
    const y = (b.y / MAP_HEIGHT) * (canvas.height - WALL_THICKNESS * 2) + WALL_THICKNESS;
    ctx.fillStyle = b.color || '#ff0';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Death screen
  if (dead) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(deathMsg, canvas.width / 2, canvas.height / 2 - 20);
  }

  // Kill log
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
  if (!playerId || dead) return;
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
}
setInterval(updateInput, 50);

canvas.addEventListener('click', (e) => {
  if (!playerId || dead) return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left - WALL_THICKNESS) / (canvas.width - WALL_THICKNESS * 2) * MAP_WIDTH;
  const my = (e.clientY - rect.top - WALL_THICKNESS) / (canvas.height - WALL_THICKNESS * 2) * MAP_HEIGHT;
  socket.emit('shoot', { x: mx, y: my });
});

socket.on('init', id => playerId = id);

socket.on('death', ({ id, msg }) => {
  if (id === playerId) {
    dead = true;
    deathMsg = msg;
    respawnTimer = 5;
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.style.display = 'block';
    if (window.respawnInterval) clearInterval(window.respawnInterval);
    window.respawnInterval = setInterval(() => {
      respawnTimer = Math.max(0, respawnTimer - 1);
      if (timerEl) timerEl.textContent = Math.floor(respawnTimer);
      if (respawnTimer <= 0) {
        clearInterval(window.respawnInterval);
        if (timerEl) timerEl.style.display = 'none';
        socket.emit('respawn');
      }
    }, 1000);
  }
});

socket.on('zombie_dead', ({ id }) => {
  const z = zombies.find(z => z.id === id);
  if (z) z.dead = true;
});

socket.on('zombie_respawn', ({ id, x, y }) => {
  let found = false;
  for (let z of zombies) {
    if (z.id === id) {
      z.x = x; z.y = y; z.hp = 100; z.dead = false;
      found = true;
      break;
    }
  }
  if (!found) zombies.push({ id, x, y, hp: 100, dead: false, speed: 0.2 });
});

socket.on('player_respawn', data => {
  const { id, x, y, hp } = data;
  if (!players[id]) {
    players[id] = { x, y, hp, color: `hsl(${Math.random()*360},80%,60%)`, name: `Игрок${id.slice(-2)}`, dead: false };
  } else {
    players[id].x = x;
    players[id].y = y;
    players[id].hp = hp;
    players[id].dead = false;
  }
  if (id === playerId) {
    dead = false;
    respawnTimer = 0;
    deathMsg = '';
  }
});

socket.on('state', state => {
  players = state.players || {};
  bullets = state.bullets || [];
  zombies = state.zombies || [];
  killLog = state.killLog || [];
});
