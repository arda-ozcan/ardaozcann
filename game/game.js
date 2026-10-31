'use strict';

(() => {
  const COSTUMES = [
    { name: 'Klasik Kuş', file: 'img/1.png', crop: [59, 92, 392, 310] },
    { name: 'Büyücü', file: 'img/2.png', crop: [35, 67, 575, 297] },
    { name: 'Minik Hayalet', file: 'img/3.png', crop: [35, 27, 500, 354] },
    { name: 'Pembe Muhafız', file: 'img/4.png', crop: [82, 30, 431, 352] },
    { name: 'Dino Kuş', file: 'img/5.png', crop: [68, 16, 423, 359] },
  ];
  const RULES = Object.freeze({ height: 720, goal: 15, speed: 185, gravity: 1240, flap: -420, gap: 204, spacing: 292, pipeWidth: 76, radiusX: 18, radiusY: 16, step: 1 / 120 });
  const $ = (id) => document.getElementById(id);
  const storage = {
    get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, String(value)); } catch { /* Oyun, depolama kapalıyken de çalışır. */ } },
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  class FlappyGame {
    constructor() {
      this.canvas = $('game-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.canvas.tabIndex = 0;
      this.state = 'menu';
      this.view = 'main';
      this.width = 1280;
      this.height = RULES.height;
      this.floor = this.height - 67;
      this.score = 0;
      this.best = clamp(Number(storage.get('flappy-best', 0)) || 0, 0, RULES.goal);
      this.selected = clamp(Math.floor(Number(storage.get('flappy-costume', 0)) || 0), 0, COSTUMES.length - 1);
      this.soundEnabled = storage.get('flappy-sound', 'false') === 'true';
      this.assetsReady = false;
      this.pipes = [];
      this.particles = [];
      this.bird = { x: 250, y: 300, vy: 0 };
      this.sceneTime = 0;
      this.travel = 0;
      this.lastTime = null;
      this.accumulator = 0;
      this.resumeTarget = 'playing';
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.buildCostumes();
      this.bindEvents();
      this.resize();
      this.syncSound();
      this.syncBest();
      this.selectCostume(this.selected, false);
      this.loadAssets();
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe($('game-stage'));
      requestAnimationFrame((time) => this.frame(time));
    }

    loadAssets() {
      this.images = COSTUMES.map((costume) => {
        const img = new Image();
        img.src = costume.file;
        return img;
      });
      // Bir görsel eksikse diğer kostümler ve yedek kuş çizimiyle oyun açılır.
      Promise.all(this.images.map((img) => new Promise((resolve) => {
        if (img.complete) resolve();
        else { img.onload = resolve; img.onerror = resolve; }
      }))).then(() => {
        this.assetsReady = true;
        $('start-button').disabled = false;
        $('start-button').firstElementChild.textContent = 'Oyunu başlat';
      });
    }

    buildCostumes() {
      COSTUMES.forEach((costume, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'costume-card';
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label', `${costume.name} kostümünü seç`);
        const image = document.createElement('img');
        image.src = costume.file;
        image.alt = '';
        const label = document.createElement('strong');
        label.textContent = costume.name;
        button.append(image, label);
        button.addEventListener('click', () => this.selectCostume(index));
        $('costume-grid').append(button);
      });
    }

    bindEvents() {
      $('start-button').addEventListener('click', () => this.start());
      $('retry-button').addEventListener('click', () => this.start());
      $('resume-button').addEventListener('click', () => this.resume());
      $('pause-button').addEventListener('click', () => this.pause());
      $('costumes-button').addEventListener('click', () => this.showView('costumes'));
      $('about-button').addEventListener('click', () => this.showView('about'));
      $('result-menu-button').addEventListener('click', () => this.mainMenu());
      document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => this.showView('main')));
      $('sound-button').addEventListener('click', () => {
        this.soundEnabled = !this.soundEnabled;
        storage.set('flappy-sound', this.soundEnabled);
        this.syncSound();
        if (this.soundEnabled) { this.unlockAudio(); this.tone(660, 0.08); }
      });
      $('game-stage').addEventListener('pointerdown', (event) => {
        if (event.target.closest('button, a') || (event.pointerType === 'mouse' && event.button !== 0)) return;
        if (this.state === 'ready' || this.state === 'playing') { event.preventDefault(); this.flap(); }
      });
      document.addEventListener('keydown', (event) => {
        if (event.code === 'Escape') {
          event.preventDefault();
          if (['playing', 'ready', 'countdown'].includes(this.state)) this.pause();
          else if (this.view !== 'main' && ['menu', 'paused'].includes(this.state)) this.showView('main');
          else if (['gameover', 'won'].includes(this.state)) this.mainMenu();
          return;
        }
        if (['Space', 'ArrowUp', 'Enter'].includes(event.code) && ['playing', 'ready'].includes(this.state)) {
          if (event.target.closest('button, a')) return;
          event.preventDefault();
          if (!event.repeat) this.flap();
        }
      });
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
      window.addEventListener('blur', () => this.pause());
    }

    selectCostume(index, announce = true) {
      this.selected = index;
      storage.set('flappy-costume', index);
      $('menu-bird').src = COSTUMES[index].file;
      [...$('costume-grid').children].forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
      $('costume-status').textContent = `${COSTUMES[index].name} seçildi.`;
      if (announce) this.announce(`${COSTUMES[index].name} kostümü seçildi.`);
    }

    showView(view) {
      this.view = view;
      ['main', 'costumes', 'about'].forEach((name) => { $(`${name}-panel`).hidden = name !== view; });
      const panel = $(`${view}-panel`);
      if (view === 'main') $(this.state === 'paused' ? 'resume-button' : 'start-button').focus({ preventScroll: true });
      else { panel.scrollTop = 0; panel.querySelector('button').focus({ preventScroll: true }); }
    }

    syncBest() {
      $('menu-best').textContent = `REKOR: ${this.best}`;
      $('hud-best').textContent = String(this.best).padStart(2, '0');
    }

    syncSound() {
      const button = $('sound-button');
      button.setAttribute('aria-pressed', String(this.soundEnabled));
      button.setAttribute('aria-label', this.soundEnabled ? 'Sesi kapat' : 'Sesi aç');
      button.title = this.soundEnabled ? 'Sesi kapat' : 'Sesi aç';
      $('sound-waves').setAttribute('d', this.soundEnabled ? 'M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14' : 'm16 9 5 6m0-6-5 6');
    }

    unlockAudio() {
      if (!this.soundEnabled) return;
      try {
        const AudioClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioClass) return;
        if (!this.audio) this.audio = new AudioClass();
        if (this.audio.state === 'suspended') this.audio.resume().catch(() => {});
      } catch { /* Ses desteği olmayan tarayıcıda sessiz devam et. */ }
    }

    tone(frequency, duration, endFrequency = frequency) {
      if (!this.soundEnabled || !this.audio || this.audio.state !== 'running') return;
      try {
        const oscillator = this.audio.createOscillator();
        const gain = this.audio.createGain();
        const now = this.audio.currentTime;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
        gain.gain.setValueAtTime(0.055, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        oscillator.connect(gain); gain.connect(this.audio.destination);
        oscillator.start(now); oscillator.stop(now + duration);
      } catch { /* Ses hataları oynanışı etkilemez. */ }
    }

    start() {
      if (!this.assetsReady) return;
      this.unlockAudio();
      this.state = 'ready';
      this.score = 0;
      this.travel = 0;
      this.accumulator = 0;
      this.bird = { x: this.birdX(), y: 305, vy: 0 };
      const firstX = Math.min(this.width + 65, this.bird.x + 580);
      let previousCenter = 330;
      this.pipes = Array.from({ length: RULES.goal }, (_, i) => {
        const center = clamp(previousCenter + (Math.random() - 0.5) * 180, 240, this.floor - 180);
        previousCenter = center;
        return { x: firstX + i * RULES.spacing, top: center - RULES.gap / 2, passed: false };
      });
      this.particles = [];
      $('score').textContent = '00';
      $('menu-overlay').hidden = true;
      $('result-overlay').hidden = true;
      $('countdown-overlay').hidden = true;
      $('ready-overlay').hidden = false;
      $('game-hud').hidden = false;
      this.canvas.focus({ preventScroll: true });
      this.announce('Bölüm 1. Başlamak için boşluk tuşuna bas veya ekrana dokun. Hedef 15 boru.');
    }

    flap() {
      if (!['ready', 'playing'].includes(this.state)) return;
      this.unlockAudio();
      this.state = 'playing';
      $('ready-overlay').hidden = true;
      this.bird.vy = RULES.flap;
      this.tone(440, 0.07, 720);
      if (!this.reducedMotion) this.particles.push({ x: this.bird.x - 22, y: this.bird.y + 8, life: 0.32, maxLife: 0.32 });
    }

    pause() {
      if (!['playing', 'ready', 'countdown'].includes(this.state)) return;
      if (this.state !== 'countdown') this.resumeTarget = this.state;
      this.state = 'paused';
      this.accumulator = 0;
      $('menu-eyebrow').textContent = 'KÜÇÜK BİR MOLA';
      $('menu-title').innerHTML = 'Gökyüzü<br><span>seni bekler.</span>';
      $('menu-description').innerHTML = 'Uçuşun tam burada duruyor.<br>Hazır olduğunda kaldığın yerden devam et.';
      $('resume-button').disabled = false;
      $('start-button').firstElementChild.textContent = 'Yeniden başlat';
      $('menu-overlay').hidden = false;
      $('ready-overlay').hidden = true;
      $('countdown-overlay').hidden = true;
      $('game-hud').hidden = true;
      this.showView('main');
      this.announce('Oyun duraklatıldı. Devam etmek için menüden Devam et seçeneğini kullan.');
    }

    resume() {
      if (this.state !== 'paused') return;
      this.unlockAudio();
      $('menu-overlay').hidden = true;
      $('game-hud').hidden = false;
      this.accumulator = 0;
      if (this.resumeTarget === 'ready') {
        this.state = 'ready';
        $('ready-overlay').hidden = false;
      } else {
        this.state = 'countdown';
        this.countdown = 2.4;
        $('countdown-number').textContent = '3';
        $('countdown-overlay').hidden = false;
      }
      this.canvas.focus({ preventScroll: true });
      this.announce('Uçuş devam ediyor.');
    }

    mainMenu() {
      this.state = 'menu';
      this.pipes = [];
      this.particles = [];
      $('menu-eyebrow').textContent = 'TEK BÖLÜM · SONSUZ DENEME';
      $('menu-title').innerHTML = 'Bir kanat.<br><span>Bir macera.</span>';
      $('menu-description').innerHTML = 'Gökyüzü seni bekliyor.<br>Ritmini bul, boruları geç, hedefe ulaş.';
      $('start-button').firstElementChild.textContent = 'Oyunu başlat';
      $('resume-button').disabled = true;
      $('menu-overlay').hidden = false;
      ['result-overlay', 'ready-overlay', 'countdown-overlay', 'game-hud'].forEach((id) => { $(id).hidden = true; });
      this.showView('main');
    }

    finish(won) {
      if (this.state !== 'playing') return;
      const newBest = this.score > this.best;
      this.state = won ? 'won' : 'gameover';
      this.best = Math.max(this.best, this.score);
      storage.set('flappy-best', this.best);
      this.syncBest();
      $('result-title').textContent = won ? 'Gökyüzü senin!' : 'Bir kez daha?';
      $('result-description').textContent = won ? '15 boruyu da geçtin. Yeşil Vadi tamamlandı!' : 'Her uçuşta biraz daha iyi. Yeniden kanat çırp!';
      $('result-eyebrow').textContent = won ? 'BÖLÜM 01 TAMAMLANDI' : newBest ? 'YENİ REKOR! HARİKA BİR UÇUŞ.' : 'HER DENEME YENİ BİR BAŞLANGIÇ';
      $('result-icon').textContent = won ? '★' : '↗';
      $('result-score').innerHTML = `${this.score}<small> / 15</small>`;
      $('result-best').textContent = String(this.best);
      $('result-overlay').hidden = false;
      $('game-hud').hidden = true;
      $('retry-button').focus({ preventScroll: true });
      this.announce(`${won ? 'Bölüm tamamlandı!' : 'Uçuş bitti.'} Puanın ${this.score}. Rekor ${this.best}.`);
      this.tone(won ? 660 : 220, won ? 0.35 : 0.25, won ? 990 : 70);
      if (won && !this.reducedMotion) {
        for (let i = 0; i < 65; i++) this.particles.push({ x: Math.random() * this.width, y: Math.random() * this.height * 0.55, vx: (Math.random() - 0.5) * 120, vy: 40 + Math.random() * 130, life: 4, maxLife: 4, confetti: true, color: ['#ff8853', '#fff5c8', '#6f984d', '#e7bc55'][i % 4] });
      }
    }

    birdX() { return Math.min(280, this.width * 0.27); }

    resize() {
      const bounds = this.canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const oldX = this.bird.x;
      const nextWidth = this.height * bounds.width / bounds.height;
      if (Math.abs(nextWidth - this.width) > 1) {
        this.pause();
        this.width = nextWidth;
        this.bird.x = this.birdX();
        const offset = this.bird.x - oldX;
        this.pipes.forEach((pipe) => { pipe.x += offset; });
        this.particles.forEach((particle) => { particle.x += offset; });
      }
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(bounds.width * ratio);
      this.canvas.height = Math.round(bounds.height * ratio);
      this.ctx.setTransform(this.canvas.width / this.width, 0, 0, this.canvas.height / this.height, 0, 0);
      this.ctx.imageSmoothingEnabled = false;
    }

    hitsPipe(pipe) {
      const closestX = clamp(this.bird.x, pipe.x - 5, pipe.x + RULES.pipeWidth + 5);
      const closestY = this.bird.y < pipe.top + RULES.gap / 2 ? Math.min(this.bird.y, pipe.top) : Math.max(this.bird.y, pipe.top + RULES.gap);
      const dx = (this.bird.x - closestX) / RULES.radiusX;
      const dy = (this.bird.y - closestY) / RULES.radiusY;
      return dx * dx + dy * dy <= 1;
    }

    update(dt) {
      if (this.state !== 'playing') return;
      this.travel += RULES.speed * dt;
      this.bird.vy += RULES.gravity * dt;
      this.bird.y += this.bird.vy * dt;
      this.pipes.forEach((pipe) => { pipe.x -= RULES.speed * dt; });
      if (this.bird.y - RULES.radiusY <= 0 || this.bird.y + RULES.radiusY >= this.floor) { this.finish(false); return; }
      for (const pipe of this.pipes) {
        if (pipe.x > this.bird.x + RULES.radiusX + 5 || pipe.x + RULES.pipeWidth + 5 < this.bird.x - RULES.radiusX) continue;
        if (this.hitsPipe(pipe)) { this.finish(false); return; }
      }
      for (const pipe of this.pipes) {
        if (!pipe.passed && pipe.x + RULES.pipeWidth + 5 < this.bird.x - RULES.radiusX) {
          pipe.passed = true;
          this.score++;
          $('score').textContent = String(this.score).padStart(2, '0');
          this.tone(740, 0.12, 990);
          if (this.score >= RULES.goal) { this.finish(true); return; }
        }
      }
    }

    frame(time) {
      const dt = this.lastTime === null ? 0 : Math.min((time - this.lastTime) / 1000, 0.05);
      this.lastTime = time;
      if (this.state === 'playing' || (this.state === 'menu' && !this.reducedMotion)) this.sceneTime += dt;
      if (this.state === 'countdown') {
        this.countdown -= dt;
        $('countdown-number').textContent = String(Math.max(1, Math.ceil(this.countdown / 0.8)));
        if (this.countdown <= 0) { this.state = 'playing'; $('countdown-overlay').hidden = true; this.accumulator = 0; }
      } else if (this.state === 'playing') {
        this.accumulator += dt;
        while (this.accumulator >= RULES.step && this.state === 'playing') { this.update(RULES.step); this.accumulator -= RULES.step; }
      }
      if (['playing', 'won'].includes(this.state)) {
        this.particles = this.particles.filter((p) => p.life > 0);
        this.particles.forEach((p) => { p.life -= dt; p.x += (p.vx || -45) * dt; p.y += (p.vy || 0) * dt; });
      }
      this.draw();
      requestAnimationFrame((next) => this.frame(next));
    }

    rect(x, y, width, height, color) { this.ctx.fillStyle = color; this.ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(width), Math.ceil(height)); }

    cloud(x, y, scale = 1, color = '#f4f4d9') {
      const ctx = this.ctx;
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(scale, scale);
      this.rect(0, 20, 126, 20, color); this.rect(18, 6, 80, 25, color); this.rect(38, -7, 38, 25, color);
      this.rect(8, 38, 109, 5, '#d2e4c9'); ctx.restore();
    }

    drawScene() {
      const { width: w, height: h, ctx } = this;
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, '#a7d6cb'); gradient.addColorStop(0.7, '#d6e9cb'); gradient.addColorStop(1, '#edf0c8');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
      // Güneş ve bulutlar yerel olarak Canvas üzerinde çizilir.
      const sunX = w * 0.78;
      ctx.fillStyle = '#f9eab0'; ctx.beginPath(); ctx.arc(sunX, 130, 53, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff7c027'; ctx.beginPath(); ctx.arc(sunX, 130, 73, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < Math.ceil(w / 390) + 1; i++) {
        const drift = this.reducedMotion ? 0 : this.sceneTime * 7;
        const x = ((i * 390 + 70 - drift) % (w + 250) + w + 250) % (w + 250) - 150;
        this.cloud(x, 100 + (i % 3) * 63, i % 2 ? 0.8 : 1.15);
      }
      // Arka planda katmanlı, pastel dağlar.
      ctx.fillStyle = '#a8cdb2'; ctx.beginPath(); ctx.moveTo(0, 470);
      for (let x = -200; x <= w + 220; x += 220) { ctx.lineTo(x, 470); ctx.quadraticCurveTo(x + 115, 285 + (Math.floor(x / 220) % 2) * 50, x + 220, 470); }
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
      ctx.fillStyle = '#bfd8b5'; ctx.beginPath(); ctx.moveTo(0, 510);
      for (let x = -70; x <= w + 240; x += 310) { ctx.quadraticCurveTo(x + 130, 335, x + 310, 510); }
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
      const parallax = this.travel * 0.13;
      for (let i = 0; i < Math.ceil(w / 65) + 3; i++) {
        const x = i * 65 - parallax % 65 - 65;
        const bh = 52 + ((i * 47) % 69);
        this.rect(x, this.floor - bh - 23, 47, bh + 23, '#b5caaa');
        this.rect(x + 7, this.floor - bh - 32, 20, 10, '#b5caaa');
        for (let row = 0; row < Math.floor(bh / 15); row++) for (let col = 0; col < 3; col++) this.rect(x + 7 + col * 12, this.floor - bh - 15 + row * 16, 5, 7, '#cbd9b9');
      }
      // Çalılar, çimen ve kayan toprak şeridi.
      for (let i = 0; i < Math.ceil(w / 50) + 2; i++) {
        const x = i * 50 - (this.travel * 0.35) % 50;
        this.rect(x - 12, this.floor - 23, 50, 24, '#87ad75'); this.rect(x, this.floor - 33 - (i % 2) * 9, 24, 20, '#87ad75');
      }
      this.rect(0, this.floor, w, 5, '#3f6544'); this.rect(0, this.floor + 5, w, 12, '#a6c66c');
      this.rect(0, this.floor + 17, w, 4, '#71894d'); this.rect(0, this.floor + 21, w, h - this.floor, '#e2d5a2');
      for (let i = 0; i < Math.ceil(w / 28) + 2; i++) {
        const x = i * 28 - this.travel % 28;
        this.rect(x, this.floor + 6, 13, 5, '#c7dc90');
        this.rect(x + 8, this.floor + 34, 7, 4, '#c8bc87');
      }
    }

    drawPipe(pipe) {
      const x = Math.round(pipe.x), p = RULES.pipeWidth, top = pipe.top, bottom = top + RULES.gap;
      const body = (y, height) => {
        if (height <= 0) return;
        this.rect(x, y, p, height, '#345a38'); this.rect(x + 4, y, p - 8, height, '#77ab55');
        this.rect(x + 8, y, 12, height, '#a9ce72'); this.rect(x + 22, y, 6, height, '#8abc5e'); this.rect(x + p - 15, y, 10, height, '#548846');
      };
      const cap = (y) => {
        this.rect(x - 5, y, p + 10, 28, '#345a38'); this.rect(x - 1, y + 4, p + 2, 20, '#80b45a');
        this.rect(x + 4, y + 5, 16, 17, '#b2d67a'); this.rect(x + p - 12, y + 5, 11, 18, '#548846');
        this.rect(x - 1, y + 4, p + 2, 3, '#c2de88');
      };
      body(0, top - 24); cap(top - 28);
      body(bottom + 24, this.floor - bottom - 24); cap(bottom);
    }

    drawBird() {
      const { ctx, bird } = this;
      ctx.save();
      const bob = this.state === 'ready' && !this.reducedMotion ? Math.sin(this.sceneTime * 4) * 4 : 0;
      ctx.translate(bird.x, bird.y + bob);
      ctx.rotate(this.state === 'ready' ? -0.08 : clamp(bird.vy / 700, -0.4, 1.05));
      const img = this.images?.[this.selected];
      const crop = COSTUMES[this.selected].crop;
      const drawHeight = this.selected === 1 ? 43 : 52;
      const drawWidth = drawHeight * crop[2] / crop[3];
      ctx.imageSmoothingEnabled = false;
      if (img?.complete && img.naturalWidth > 0) ctx.drawImage(img, ...crop, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      else {
        this.rect(-23, -18, 42, 36, '#f8d34f'); this.rect(9, -15, 17, 19, '#fffdf3'); this.rect(18, -10, 5, 8, '#243b2d'); this.rect(17, 6, 22, 7, '#f87836');
      }
      ctx.restore();
    }

    draw() {
      const { ctx, width: w } = this;
      ctx.clearRect(0, 0, w, this.height);
      this.drawScene();
      if (this.state === 'menu') {
        if (w > 750) { this.drawPipe({ x: w * 0.11, top: 235 }); this.drawPipe({ x: w * 0.83, top: 300 }); }
        else { this.drawPipe({ x: -46, top: 210 }); this.drawPipe({ x: w - 23, top: 325 }); }
      } else {
        this.pipes.forEach((pipe) => { if (pipe.x + RULES.pipeWidth > -10 && pipe.x < w + 10) this.drawPipe(pipe); });
        this.drawBird();
      }
      this.particles.forEach((p) => {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        this.rect(p.x, p.y, p.confetti ? 7 : 5, p.confetti ? 11 : 5, p.color || '#fff6cc');
      });
      ctx.globalAlpha = 1;
    }

    announce(message) { $('announcer').textContent = message; }
  }

  // Tek bir oyun örneği; konsoldan durum ve puan da incelenebilir.
  window.flappyGame = new FlappyGame();
})();
