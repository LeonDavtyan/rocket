(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const frame = document.querySelector('.game-frame');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const playButton = document.getElementById('play-button');
  const pauseLabel = document.getElementById('pause-label');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const fuelFill = document.getElementById('fuel-fill');
  const soundButton = document.getElementById('sound-button');
  const jumpButton = document.getElementById('jump-button');
  const duckButton = document.getElementById('duck-button');
  const kickButton = document.getElementById('kick-button');

  const H = 540;
  const GROUND = 435;
  let W = 960;
  let last = 0;
  let time = 0;
  let scenery = 0;
  let mode = 'menu';
  let score = 0;
  let passed = 0;
  let spawnTimer = 1.1;
  let obstacles = [];
  let particles = [];
  let muted = false;
  let audio;
  const input = { jump: false, duck: false };
  const player = { x: 170, bottom: GROUND, vy: 0, fuel: 1, duck: false, run: 0, kickTime: 0, kickCooldown: 0 };

  function bestScore() {
    try { return Number(localStorage.getItem('rocket-hopper-best')) || 0; } catch { return 0; }
  }
  function saveBest(value) {
    try { localStorage.setItem('rocket-hopper-best', String(value)); } catch { /* Private browsing is fine. */ }
  }
  let best = bestScore();
  bestEl.textContent = format(best);

  function resize() {
    const width = frame.clientWidth;
    const height = frame.clientHeight;
    W = H * width / height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    player.x = Math.min(170, W * .25);
  }
  addEventListener('resize', resize);
  resize();

  function format(n) { return String(Math.floor(n)).padStart(4, '0'); }
  function sound(freq, duration, type = 'sine', volume = .06) {
    if (muted) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(50, freq * .65), audio.currentTime + duration);
      gain.gain.setValueAtTime(volume, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    } catch { /* Sound is optional. */ }
  }

  function start() {
    mode = 'playing';
    time = 0;
    score = 0;
    passed = 0;
    scenery = 0;
    spawnTimer = 1.35;
    obstacles = [];
    particles = [];
    player.bottom = GROUND;
    player.vy = 0;
    player.fuel = 1;
    player.duck = false;
    player.kickTime = 0;
    player.kickCooldown = 0;
    input.jump = false;
    input.duck = false;
    jumpButton.classList.remove('pressed');
    duckButton.classList.remove('pressed');
    kickButton.classList.remove('pressed');
    scoreEl.textContent = '0000';
    fuelFill.style.width = '100%';
    overlay.hidden = true;
    pauseLabel.hidden = true;
    sound(590, .12, 'triangle');
  }

  function end() {
    mode = 'over';
    const final = Math.floor(score);
    if (final > best) { best = final; saveBest(best); }
    bestEl.textContent = format(best);
    overlayTitle.innerHTML = 'Oh no!<br><em>Try again!</em>';
    overlayText.textContent = `You scored ${format(final)}! The mushrooms are still hopping. Give it another go!`;
    playButton.innerHTML = 'PLAY AGAIN <span aria-hidden="true">➜</span>';
    overlay.hidden = false;
    sound(330, .35, 'sawtooth', .035);
  }

  function jumpPress() {
    if (mode !== 'playing') return;
    if (!input.jump && player.bottom >= GROUND - .1) {
      player.vy = -670;
      player.bottom = GROUND - 1;
      sound(510, .14, 'triangle');
      puff(player.x - 12, GROUND - 5, 7, '#d8d6ff');
    }
    input.jump = true;
    jumpButton.classList.add('pressed');
  }
  function jumpRelease() { input.jump = false; jumpButton.classList.remove('pressed'); }
  function duckPress() { input.duck = true; duckButton.classList.add('pressed'); }
  function duckRelease() { input.duck = false; duckButton.classList.remove('pressed'); }
  function kick() {
    if (mode !== 'playing' || player.kickCooldown > 0) return;
    player.kickTime = .28;
    player.kickCooldown = .48;
    kickButton.classList.add('pressed');
    sound(280, .1, 'triangle', .04);
  }

  addEventListener('keydown', (event) => {
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
    if (['Space', 'ArrowUp', 'KeyW'].includes(event.code)) {
      if (mode === 'menu' || mode === 'over') { if (!event.repeat) start(); }
      else if (!event.repeat) jumpPress();
    }
    if (['ArrowDown', 'KeyS'].includes(event.code)) duckPress();
    if (['KeyK', 'KeyF'].includes(event.code) && !event.repeat) kick();
    if (event.code === 'KeyP' && !event.repeat) {
      if (mode === 'playing') { mode = 'paused'; pauseLabel.hidden = false; }
      else if (mode === 'paused') { mode = 'playing'; pauseLabel.hidden = true; }
    }
  });
  addEventListener('keyup', (event) => {
    if (['Space', 'ArrowUp', 'KeyW'].includes(event.code)) jumpRelease();
    if (['ArrowDown', 'KeyS'].includes(event.code)) duckRelease();
  });
  addEventListener('blur', () => {
    jumpRelease(); duckRelease();
    if (mode === 'playing') { mode = 'paused'; pauseLabel.hidden = false; }
  });
  function bindHold(button, press, release) {
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); press(); });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  }
  bindHold(jumpButton, jumpPress, jumpRelease);
  bindHold(duckButton, duckPress, duckRelease);
  kickButton.addEventListener('pointerdown', (event) => { event.preventDefault(); kick(); });
  playButton.addEventListener('click', start);
  soundButton.addEventListener('click', () => {
    muted = !muted;
    soundButton.textContent = muted ? '♪̸' : '♪';
    soundButton.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    if (!muted) sound(720, .08);
  });

  function puff(x, y, count, color) {
    for (let i = 0; i < count; i++) particles.push({
      x, y, vx: (Math.random() - .5) * 140, vy: -Math.random() * 110,
      life: .35 + Math.random() * .3, max: .65, r: 2 + Math.random() * 4, color
    });
  }
  function spawn() {
    const size = 46 + Math.random() * 9;
    obstacles.push({ x: W + 50, size, phase: Math.random() * 1.3 - .6, hopSpeed: 3.25 + Math.random() * .5, hopHeight: 112 + Math.random() * 28, color: Math.random() > .5 ? '#c94c70' : '#e97967', passed: false, knocked: false });
  }
  function hopHeight(m) { return Math.max(0, Math.sin(m.phase)) ** 1.15 * m.hopHeight; }

  function update(dt) {
    time += dt;
    scenery += dt * (mode === 'playing' ? 170 : 25);
    if (mode !== 'playing') return;
    const speed = Math.min(440, 290 + time * 3.2);
    player.run += dt * 15;
    player.duck = input.duck && player.bottom >= GROUND - 1;
    player.kickTime = Math.max(0, player.kickTime - dt);
    player.kickCooldown = Math.max(0, player.kickCooldown - dt);
    if (player.kickTime === 0) kickButton.classList.remove('pressed');

    if (player.bottom < GROUND || player.vy < 0) {
      let gravity = 1750;
      if (input.jump && player.fuel > 0) {
        gravity -= 2300;
        player.fuel = Math.max(0, player.fuel - dt * .57);
        player.vy = Math.max(player.vy, -400);
        if (Math.random() < .7) puff(player.x - 26, player.bottom - 25, 1, '#ffcf6c');
      }
      player.vy += gravity * dt;
      player.bottom += player.vy * dt;
      if (player.bottom < 88) { player.bottom = 88; player.vy = Math.max(0, player.vy); }
      if (player.bottom >= GROUND) {
        player.bottom = GROUND;
        player.vy = 0;
        puff(player.x, GROUND - 4, 3, '#cfb9dc');
      }
    } else {
      player.fuel = Math.min(1, player.fuel + dt * .55);
    }
    fuelFill.style.width = `${player.fuel * 100}%`;

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawn();
      spawnTimer = Math.max(.94, 1.45 - time * .007) + Math.random() * .36;
    }
    for (const m of obstacles) {
      if (m.knocked) {
        m.x += m.knockVx * dt;
        m.knockY += m.knockVy * dt;
        m.knockVy += 1050 * dt;
        m.spin += dt * 10;
        continue;
      }
      m.x -= speed * dt;
      m.phase += m.hopSpeed * dt;
      const my2 = GROUND - hopHeight(m) - 5;
      const my1 = my2 - m.size * .78;
      if (player.kickTime > 0 && m.x > player.x + 5 && m.x < player.x + 112 && my2 > player.bottom - 58 && my1 < player.bottom + 4) {
        m.knocked = true;
        m.knockY = GROUND - hopHeight(m);
        m.knockVx = 540;
        m.knockVy = -440;
        m.spin = 0;
        passed++;
        puff(m.x, m.knockY - 25, 16, '#ffe3a1');
        sound(170, .22, 'square', .045);
        continue;
      }
      if (!m.passed && m.x + m.size / 2 < player.x - 22) {
        m.passed = true;
        passed++;
        sound(770, .09, 'sine', .027);
      }
      const mx1 = m.x - m.size * .38;
      const mx2 = m.x + m.size * .38;
      const ph = player.duck ? 34 : 65;
      const px1 = player.x - (player.duck ? 23 : 18);
      const px2 = player.x + (player.duck ? 23 : 18);
      const py1 = player.bottom - ph + 5;
      const py2 = player.bottom - 5;
      if (px2 > mx1 && px1 < mx2 && py2 > my1 && py1 < my2) { end(); break; }
    }
    obstacles = obstacles.filter(m => m.x > -80 && (!m.knocked || (m.x < W + 100 && m.knockY < H + 90)));
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 180 * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
    score = time * 10 + passed * 35;
    scoreEl.textContent = format(score);
  }

  function roundRect(x, y, w, h, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
  function circle(x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  function ellipse(x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }

  function background() {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#7b304f'); sky.addColorStop(.62, '#c75d6d'); sky.addColorStop(1, '#f4a079');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // Stars repeat as the world scrolls.
    for (let i = 0; i < Math.ceil(W / 85) + 2; i++) {
      const x = ((i * 91 + 35 - scenery * .08) % (W + 100) + W + 100) % (W + 100);
      const y = 55 + (i * 71 % 224);
      circle(x, y, i % 4 === 0 ? 2.4 : 1.4, '#fff4de');
      if (i % 5 === 0) { ctx.strokeStyle = '#fff2d5'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke(); }
    }
    const planetX = W * .76 - scenery * .025 % (W + 150);
    circle(planetX, 126, 51, '#ffe3a2');
    ellipse(planetX, 129, 72, 15, '#ec936f');
    circle(planetX, 126, 51, '#ffe3a2');
    ellipse(planetX - 13, 113, 14, 5, '#f8bc8f');
    ellipse(planetX + 14, 145, 19, 6, '#f8bc8f');
    // Distant hills.
    for (let layer = 0; layer < 2; layer++) {
      const color = layer ? '#90445f' : '#ae5870';
      const base = layer ? 417 : 375;
      const stride = layer ? 180 : 245;
      const offset = scenery * (layer ? .25 : .14) % stride;
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, GROUND);
      for (let x = -stride - offset; x < W + stride; x += stride) {
        ctx.quadraticCurveTo(x + stride * .48, base - (x / stride % 2 ? 30 : 4), x + stride, GROUND);
      }
      ctx.lineTo(W, GROUND); ctx.fill();
    }
    ctx.fillStyle = '#65354d'; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#cf7b7d'; ctx.fillRect(0, GROUND, W, 10);
    ctx.fillStyle = '#ffd0a0'; ctx.fillRect(0, GROUND, W, 3);
    for (let i = 0; i < Math.ceil(W / 85) + 2; i++) {
      const x = ((i * 85 - scenery * .8) % (W + 85) + W + 85) % (W + 85);
      ellipse(x, 471 + i % 3 * 18, 13 + i % 4 * 5, 5, '#87465a');
      circle(x + 22, 505 + i % 2 * 10, 2.5, '#bd7180');
    }
  }

  function drawMushroom(m) {
    const h = hopHeight(m);
    const b = m.knocked ? m.knockY : GROUND - h;
    const s = m.size;
    const x = m.x;
    if (!m.knocked) ellipse(x, GROUND + 3, s * (.42 - h / 1000), 5, '#3c203977');
    ctx.save(); ctx.translate(x, b);
    if (m.knocked) ctx.rotate(m.spin);
    // Little wings flap behind the cap.
    const flap = Math.sin(time * 21 + m.phase) * .16;
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side, 1); ctx.rotate(flap * side);
      ctx.fillStyle = '#ffe0d1'; ctx.strokeStyle = '#b45473'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s * .25, -s * .72);
      ctx.bezierCurveTo(s * .83, -s * 1.38, s * 1.25, -s * 1.11, s * .92, -s * .61);
      ctx.bezierCurveTo(s * 1.15, -s * .34, s * .67, -s * .38, s * .27, -s * .51);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#e7a1a8'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(s * .38, -s * .64); ctx.lineTo(s * .91, -s * .94); ctx.stroke();
      ctx.restore();
    }
    // Feet and stalk.
    ellipse(-s * .16, -4, s * .13, 7, '#54355b');
    ellipse(s * .16, -4, s * .13, 7, '#54355b');
    roundRect(-s * .27, -s * .52, s * .54, s * .46, 13, '#f7d8bd');
    ellipse(0, -s * .53, s * .49, s * .29, '#a83b73');
    ctx.fillStyle = m.color; ctx.beginPath(); ctx.moveTo(-s * .49, -s * .53); ctx.quadraticCurveTo(-s * .45, -s * 1.12, 0, -s * 1.15); ctx.quadraticCurveTo(s * .45, -s * 1.12, s * .49, -s * .53); ctx.closePath(); ctx.fill();
    circle(-s * .20, -s * .83, s * .08, '#ffe4d2');
    circle(s * .14, -s * 1.01, s * .09, '#ffe4d2');
    circle(s * .34, -s * .7, s * .05, '#ffe4d2');
    // Angry eyes.
    ellipse(-s * .11, -s * .32, s * .06, s * .075, '#32294b');
    ellipse(s * .11, -s * .32, s * .06, s * .075, '#32294b');
    ctx.strokeStyle = '#632d57'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-s * .2, -s * .43); ctx.lineTo(-s * .055, -s * .39); ctx.moveTo(s * .2, -s * .43); ctx.lineTo(s * .055, -s * .39); ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    const x = player.x, b = player.bottom;
    const duck = player.duck;
    const flying = b < GROUND - 4 && input.jump && player.fuel > 0 && mode === 'playing';
    ellipse(x, GROUND + 3, Math.max(15, 29 - (GROUND - b) * .04), 5, '#2d244a77');
    ctx.save(); ctx.translate(x, b);
    if (duck) ctx.scale(1.19, .46);
    const bob = b >= GROUND - 1 && !duck && mode === 'playing' ? Math.sin(player.run) * 2 : 0;
    ctx.translate(0, bob);
    // Rocket pack sits behind the astronaut.
    roundRect(-32, -53, 15, 37, 6, '#6575aa');
    roundRect(-34, -43, 7, 24, 3, '#aec7d7');
    roundRect(-33, -19, 12, 9, 3, '#343a75');
    if (flying) {
      ctx.fillStyle = '#ffb34d'; ctx.beginPath(); ctx.moveTo(-32, -10); ctx.quadraticCurveTo(-29, 11 + Math.random() * 12, -25, -10); ctx.fill();
      ctx.fillStyle = '#fff1a1'; ctx.beginPath(); ctx.moveTo(-30, -10); ctx.quadraticCurveTo(-28, 4 + Math.random() * 6, -27, -10); ctx.fill();
    }
    // Boots, suit, arms, and helmet.
    const step = b >= GROUND - 1 ? Math.sin(player.run) * 5 : 1;
    roundRect(-15, -15 + step, 12, 17, 4, '#e7d9d0');
    roundRect(-18, -5 + step, 17, 7, 3, '#464477');
    if (player.kickTime > 0) {
      roundRect(5, -27, 38, 13, 6, '#e7d9d0');
      roundRect(37, -28, 16, 15, 5, '#464477');
      ctx.strokeStyle = '#ffe8ac'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(52, -20, 15, -.9, .8); ctx.stroke();
    } else {
      roundRect(3, -15 - step, 12, 17, 4, '#e7d9d0');
      roundRect(2, -5 - step, 17, 7, 3, '#464477');
    }
    roundRect(-20, -49, 40, 38, 13, '#fbf0dc');
    roundRect(-17, -43, 34, 20, 8, '#e5d7d2');
    roundRect(3, -39, 11, 11, 3, '#ffbf69');
    circle(8.5, -33.5, 2, '#fff6db');
    roundRect(-23, -40, 10, 25, 5, '#fbf0dc');
    roundRect(15, -40, 10, 25, 5, '#fbf0dc');
    circle(-19, -17, 6, '#677ca9'); circle(21, -17, 6, '#677ca9');
    circle(0, -52, 30, '#eee5d7');
    circle(0, -52, 25, '#89c7d9');
    ellipse(0, -52, 22, 20, '#2b517b');
    ellipse(-9, -62, 8, 4, '#bfe5e8');
    circle(-7, -51, 3, '#142d56'); circle(9, -51, 3, '#142d56');
    ctx.strokeStyle = '#163761'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(1, -46, 5, .1, Math.PI - .1); ctx.stroke();
    roundRect(-22, -79, 44, 6, 3, '#fff5e1');
    circle(0, -76, 4, '#ffbd6d');
    // The sword stays in the astronaut's right hand.
    ctx.save(); ctx.translate(21, -19); ctx.rotate(player.kickTime > 0 ? .35 : .12);
    roundRect(-3, -17, 6, 20, 2, '#694260');
    roundRect(-10, -20, 20, 5, 2, '#f8bd67');
    ctx.fillStyle = '#dcecf0'; ctx.beginPath(); ctx.moveTo(-5, -21); ctx.lineTo(5, -21); ctx.lineTo(4, -59); ctx.lineTo(0, -72); ctx.lineTo(-4, -59); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#7bb8c9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, -61); ctx.stroke();
    circle(0, 2, 4, '#ffd27b'); ctx.restore();
    ctx.restore();
  }

  function draw() {
    background();
    for (const m of obstacles) drawMushroom(m);
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); circle(p.x, p.y, p.r, p.color); }
    ctx.globalAlpha = 1;
    drawPlayer();
  }
  function loop(timestamp) {
    const dt = Math.min((timestamp - last) / 1000 || 0, .033);
    last = timestamp;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
