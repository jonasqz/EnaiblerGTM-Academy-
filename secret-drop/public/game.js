// Space Aliens: fly a tiny ship over the page and shoot its elements apart.
(() => {
  const NEON = '#39ff14';
  const ALIEN_COLORS = ['#ff4fd8', '#4fd1ff', '#ffd84f', '#ff7a4f'];
  // Classic 11x8 invader, two frames.
  const INVADER = [
    ['00100000100', '00010001000', '00111111100', '01101110110', '11111111111', '10111111101', '10100000101', '00011011000'],
    ['00100000100', '10010001001', '10111111101', '11101110111', '11111111111', '01111111110', '00100000100', '01000000010'],
  ];
  const FLYERS = [
    '📄 Angebot_final_v7_WIRKLICH_final.pdf', '🔑 Fake-Secret', '📊 Pipeline Q4', '☕ Kaffee', '📎 Anhang fehlt',
    '💌 Follow-up #3', '🗓️ Kurzer Call?', '🧾 Rechnung', '🤝 Synergien', '📈 Hockeystick', '🛸 UFO', '🐙 Space-Krake',
  ];

  let canvas, ctx, hud, W, H, dpr, q;
  let ship, bullets, particles, aliens, flyers, keys, pointer;
  let score, lives, running, last, alienTimer, flyerTimer, elapsed, hintUntil, shotCooldown, winCheck, audio, muted;
  const hp = new WeakMap();

  function beacon(event, extra) {
    const body = JSON.stringify({ event, q, ...extra });
    if (navigator.sendBeacon) navigator.sendBeacon('/e', new Blob([body], { type: 'application/json' }));
    else fetch('/e', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
  }

  // Every word becomes its own target, so headlines can be shot apart letter group by letter group.
  function splitWords(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.nodeValue.trim() && !n.parentElement.closest('script,style,#sa-hud,.sa-panel,.sa-float,[hidden]')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      for (const part of node.nodeValue.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) frag.append(part);
        else {
          const span = document.createElement('span');
          span.className = 'sa-t';
          span.textContent = part;
          frag.append(span);
        }
      }
      node.replaceWith(frag);
    }
  }

  function start(opts = {}) {
    if (running) return;
    q = opts.q || '';
    document.activeElement?.blur();
    splitWords(document.body);

    canvas = document.createElement('canvas');
    canvas.id = 'sa-canvas';
    document.body.append(canvas);
    ctx = canvas.getContext('2d');
    hud = document.createElement('div');
    hud.id = 'sa-hud';
    document.body.append(hud);
    resize();

    ship = { x: W / 2, y: H * 0.8, a: -Math.PI / 2, vx: 0, vy: 0, inv: 2 };
    bullets = [];
    particles = [];
    aliens = [];
    flyers = [];
    keys = {};
    pointer = null;
    score = 0;
    lives = 3;
    elapsed = 0;
    alienTimer = 3;
    flyerTimer = 1.5;
    shotCooldown = 0;
    winCheck = 1;
    hintUntil = 4;
    muted = false;
    running = true;
    last = performance.now();

    addEventListener('resize', resize);
    addEventListener('keydown', onKey, true);
    addEventListener('keyup', onKey, true);
    canvas.addEventListener('pointerdown', onPointer);
    canvas.addEventListener('pointermove', onPointer);
    addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    beacon('game_start');
    renderHud();
    requestAnimationFrame(frame);
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function onKey(e) {
    if (!running) return;
    const down = e.type === 'keydown';
    const k = e.key.toLowerCase();
    if (down && k === 'escape') return exit();
    if (down && k === 'm') {
      muted = !muted;
      renderHud();
    }
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'a', 'd', 'w', 's'].includes(k)) {
      e.preventDefault();
      e.stopPropagation();
      keys[k] = down;
    }
  }

  function onPointer(e) {
    if (e.type === 'pointerdown') canvas.setPointerCapture?.(e.pointerId);
    if (e.type === 'pointermove' && !pointer) return;
    pointer = { x: e.clientX, y: e.clientY };
    hintUntil = 0;
  }
  function onPointerUp() {
    pointer = null;
  }

  // Tiny synth, no audio files.
  function sfx(type) {
    if (muted) return;
    try {
      audio ||= new AudioContext();
      const o = audio.createOscillator();
      const g = audio.createGain();
      const t = audio.currentTime;
      o.type = type === 'shot' ? 'square' : 'sawtooth';
      o.frequency.setValueAtTime(type === 'shot' ? 880 : type === 'hit' ? 200 : 120, t);
      o.frequency.exponentialRampToValueAtTime(type === 'shot' ? 220 : 40, t + (type === 'shot' ? 0.08 : 0.25));
      g.gain.setValueAtTime(type === 'shot' ? 0.03 : 0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.26);
    } catch {
      muted = true;
    }
  }

  function renderHud() {
    hud.innerHTML = '';
    const s = document.createElement('span');
    s.textContent = `SCORE ${String(score).padStart(6, '0')}`;
    const l = document.createElement('span');
    l.textContent = '♥'.repeat(Math.max(lives, 0)) || '–';
    const m = document.createElement('button');
    m.textContent = muted ? 'TON AUS' : 'TON AN';
    m.onclick = () => {
      muted = !muted;
      renderHud();
    };
    const x = document.createElement('button');
    x.textContent = 'ESC';
    x.onclick = exit;
    hud.append(s, l, m, x);
  }

  function shoot() {
    const nx = Math.cos(ship.a);
    const ny = Math.sin(ship.a);
    bullets.push({ x: ship.x + nx * 14, y: ship.y + ny * 14, vx: nx * 720 + ship.vx, vy: ny * 720 + ship.vy, life: 1.1 });
    shotCooldown = 0.14;
    sfx('shot');
  }

  function burst(x, y, color, n, speed = 220) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = Math.random() * speed;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.7, color });
    }
  }

  function colorOf(el) {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' ? bg : cs.color;
  }

  function destroy(el) {
    const r = el.getBoundingClientRect();
    const color = colorOf(el);
    const area = r.width * r.height;
    const n = Math.min(60, 8 + area / 150);
    for (let i = 0; i < n; i++) burst(r.left + Math.random() * r.width, r.top + Math.random() * r.height, color, 1, 160);
    el.style.visibility = 'hidden';
    score += Math.round(10 + Math.sqrt(area) / 2);
    sfx('boom');
    renderHud();
  }

  const visible = (e) => getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length > 0;

  // Words and leaves die in one hit. A container is armoured while anything inside it still stands,
  // so the card falls apart word by word instead of vanishing at once.
  function hitElement(x, y) {
    const el = document.elementsFromPoint(x, y).find((e) => e !== canvas);
    if (!el || el === document.body || el === document.documentElement || el.closest('#sa-hud,.sa-panel')) return false;
    const leaf = el.classList.contains('sa-t') || el.children.length === 0;
    const armoured = !leaf && [...el.querySelectorAll('.sa-t, img, input, svg')].some(visible);
    const left = armoured ? 1 : (hp.get(el) ?? (leaf ? 1 : 2)) - 1;
    hp.set(el, left);
    if (left <= 0) destroy(el);
    else {
      el.classList.remove('sa-hit');
      void el.offsetWidth;
      el.classList.add('sa-hit');
      burst(x, y, colorOf(el), 5, 120);
      sfx('hit');
    }
    return true;
  }

  function spawnAlien() {
    const side = Math.floor(Math.random() * 4);
    const x = side === 0 ? -30 : side === 1 ? W + 30 : Math.random() * W;
    const y = side === 2 ? -30 : side === 3 ? H + 30 : Math.random() * H * 0.6;
    aliens.push({ x, y, t: Math.random() * 10, color: ALIEN_COLORS[Math.floor(Math.random() * ALIEN_COLORS.length)], speed: 40 + Math.random() * 40 + elapsed });
  }

  function spawnFlyer() {
    const el = document.createElement('div');
    el.className = 'sa-float';
    el.textContent = FLYERS[Math.floor(Math.random() * FLYERS.length)];
    document.body.append(el);
    const fromLeft = Math.random() < 0.5;
    const w = el.offsetWidth;
    flyers.push({
      el,
      x: fromLeft ? -w - 10 : W + 10,
      y: 60 + Math.random() * (H - 140),
      vx: (fromLeft ? 1 : -1) * (60 + Math.random() * 90),
      wob: Math.random() * 6,
      rot: (Math.random() - 0.5) * 20,
    });
  }

  function update(dt) {
    elapsed += dt;
    const turn = 4.2 * dt;
    let thrust = false;

    if (keys.arrowleft || keys.a) ship.a -= turn;
    if (keys.arrowright || keys.d) ship.a += turn;
    if (keys.arrowup || keys.w) thrust = true;

    if (pointer) {
      // Touch / mouse: turn towards the finger, fly if it is far, fire all the time.
      const want = Math.atan2(pointer.y - ship.y, pointer.x - ship.x);
      let diff = ((want - ship.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      ship.a += Math.max(-turn * 1.4, Math.min(turn * 1.4, diff));
      if (Math.hypot(pointer.x - ship.x, pointer.y - ship.y) > 90) thrust = true;
    }
    if (thrust) {
      ship.vx += Math.cos(ship.a) * 420 * dt;
      ship.vy += Math.sin(ship.a) * 420 * dt;
    }
    if (keys.arrowdown || keys.s) {
      ship.vx *= 1 - 3 * dt;
      ship.vy *= 1 - 3 * dt;
    }
    ship.thrust = thrust;
    ship.vx *= 1 - 0.6 * dt;
    ship.vy *= 1 - 0.6 * dt;
    ship.x = (ship.x + ship.vx * dt + W) % W;
    ship.y = (ship.y + ship.vy * dt + H) % H;
    ship.inv = Math.max(0, ship.inv - dt);
    if (thrust && Math.random() < 0.6) {
      particles.push({ x: ship.x - Math.cos(ship.a) * 10, y: ship.y - Math.sin(ship.a) * 10, vx: -Math.cos(ship.a) * 120 + (Math.random() - 0.5) * 60, vy: -Math.sin(ship.a) * 120 + (Math.random() - 0.5) * 60, life: 0.3, color: '#ffb84f' });
    }

    shotCooldown -= dt;
    if ((keys[' '] || pointer) && shotCooldown <= 0) shoot();

    for (const b of bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < 0 || b.y < 0 || b.x > W || b.y > H) b.life = 0;
      if (b.life <= 0) continue;
      for (const al of aliens) {
        if (!al.dead && Math.hypot(al.x - b.x, al.y - b.y) < 18) {
          al.dead = true;
          b.life = 0;
          score += 100;
          burst(al.x, al.y, al.color, 30);
          sfx('boom');
          renderHud();
          break;
        }
      }
      if (b.life > 0 && hitElement(b.x, b.y)) b.life = 0;
    }
    bullets = bullets.filter((b) => b.life > 0);

    alienTimer -= dt;
    if (alienTimer <= 0) {
      spawnAlien();
      alienTimer = Math.max(0.8, 3.2 - elapsed / 30);
    }
    for (const al of aliens) {
      al.t += dt;
      const a = Math.atan2(ship.y - al.y, ship.x - al.x) + Math.sin(al.t * 2) * 0.8;
      al.x += Math.cos(a) * al.speed * dt;
      al.y += Math.sin(a) * al.speed * dt;
      if (!al.dead && ship.inv <= 0 && Math.hypot(al.x - ship.x, al.y - ship.y) < 20) {
        al.dead = true;
        lives--;
        ship.inv = 2;
        burst(ship.x, ship.y, NEON, 40, 260);
        sfx('boom');
        renderHud();
        if (lives <= 0) return end(false);
      }
    }
    aliens = aliens.filter((a) => !a.dead);

    flyerTimer -= dt;
    if (flyerTimer <= 0) {
      spawnFlyer();
      flyerTimer = 2.5 + Math.random() * 3;
    }
    for (const f of flyers) {
      f.x += f.vx * dt;
      f.wob += dt;
      const y = f.y + Math.sin(f.wob * 1.5) * 18;
      f.el.style.transform = `translate(${f.x}px, ${y}px) rotate(${Math.sin(f.wob) * f.rot}deg)`;
      if (f.el.style.visibility === 'hidden' || f.x < -600 || f.x > W + 600) f.gone = true;
    }
    flyers = flyers.filter((f) => (f.gone ? (setTimeout(() => f.el.remove(), 50), false) : true));

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vy *= 1 - 1.5 * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);

    winCheck -= dt;
    if (winCheck <= 0) {
      winCheck = 1;
      const alive = [...document.querySelectorAll('main .sa-t')].some(visible);
      if (!alive) end(true);
    }
    hintUntil -= dt;
  }

  function drawShip() {
    if (ship.inv > 0 && Math.floor(ship.inv * 10) % 2) return;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.a);
    ctx.strokeStyle = NEON;
    ctx.lineWidth = 2;
    ctx.shadowColor = NEON;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-10, -9);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 9);
    ctx.closePath();
    ctx.stroke();
    if (ship.thrust) {
      ctx.strokeStyle = '#ffb84f';
      ctx.shadowColor = '#ffb84f';
      ctx.beginPath();
      ctx.moveTo(-7, -4);
      ctx.lineTo(-14 - Math.random() * 8, 0);
      ctx.lineTo(-7, 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAlien(al) {
    const px = 3;
    const sprite = INVADER[Math.floor(al.t * 3) % 2];
    ctx.fillStyle = al.color;
    ctx.shadowColor = al.color;
    ctx.shadowBlur = 8;
    const ox = al.x - (11 * px) / 2;
    const oy = al.y - (8 * px) / 2;
    sprite.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === '1') ctx.fillRect(ox + x * px, oy + y * px, px, px);
    });
    ctx.shadowBlur = 0;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = NEON;
    ctx.shadowColor = NEON;
    ctx.shadowBlur = 8;
    for (const b of bullets) ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
    ctx.shadowBlur = 0;
    aliens.forEach(drawAlien);
    drawShip();

    if (running && hintUntil > 0) {
      const touch = matchMedia('(pointer: coarse)').matches;
      const text = touch ? 'TIPPEN & HALTEN ZUM FLIEGEN UND FEUERN' : '← → DREHEN · ↑ SCHUB · LEERTASTE FEUERN · ESC ENDE';
      ctx.font = '600 14px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      const w = ctx.measureText(text).width + 24;
      ctx.globalAlpha = Math.min(1, hintUntil);
      ctx.fillStyle = 'rgba(0,0,0,.75)';
      ctx.fillRect(W / 2 - w / 2, H - 64, w, 32);
      ctx.fillStyle = NEON;
      ctx.fillText(text, W / 2, H - 43);
      ctx.globalAlpha = 1;
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    if (running) {
      draw();
      requestAnimationFrame(frame);
    }
  }

  function cleanupListeners() {
    removeEventListener('resize', resize);
    removeEventListener('keydown', onKey, true);
    removeEventListener('keyup', onKey, true);
    removeEventListener('pointerup', onPointerUp);
  }

  function end(won) {
    running = false;
    cleanupListeners();
    draw();
    beacon(won ? 'game_win' : 'game_over', { score });
    const panel = document.createElement('div');
    panel.className = 'sa-panel';
    panel.setAttribute('role', 'dialog');
    const h = document.createElement('h2');
    h.textContent = won ? 'ALLES ZERLEGT' : 'GAME OVER';
    const p = document.createElement('p');
    p.textContent = won ? `Score ${score}. Die Seite ist Geschichte. Die Datei nicht.` : `Score ${score}. Die Aliens haben gewonnen. Die Datei bleibt trotzdem hier.`;
    const again = button('Nochmal spielen', 'btn btn-primary', () => reloadTo('#play'));
    const secret = button('Ich hab das Secret doch', 'btn btn-ghost', () => reloadTo('#secret'));
    panel.append(h, p, again, secret);
    document.body.append(panel);
    again.focus();
  }

  function exit() {
    beacon('game_exit', { score });
    running = false;
    cleanupListeners();
    reloadTo('');
  }

  function button(text, cls, onclick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = text;
    b.onclick = onclick;
    return b;
  }

  // The page is in pieces afterwards; a reload is the honest way to put it back together.
  function reloadTo(hash) {
    location.replace(location.pathname + location.search + hash);
    if (hash) location.reload();
  }

  window.SpaceAliens = { start };
})();
