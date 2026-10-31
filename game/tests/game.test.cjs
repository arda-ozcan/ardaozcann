const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function setup({ storageBlocked = false, width = 1120, height = 620 } = {}) {
  const listeners = {};
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' ? () => gradient : () => {} });
  class Element {
    constructor() { this.children = []; this.attributes = {}; this.hidden = false; this.disabled = false; this.firstElementChild = { textContent: '' }; this.events = {}; }
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...children) { this.children.push(...children); }
    addEventListener(name, callback) { this.events[name] = callback; }
    focus() {}
    querySelector() { return new Element(); }
    getBoundingClientRect() { return { width, height }; }
    getContext() { return ctx; }
  }
  const elements = new Map();
  const getElement = (id) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const document = { getElementById: getElement, createElement: () => new Element(), querySelectorAll: () => [], addEventListener: (event, fn) => { listeners[event] = fn; } };
  const values = new Map();
  const storage = { getItem(key) { if (storageBlocked) throw Error('disabled'); return values.get(key) ?? null; }, setItem(key, value) { if (storageBlocked) throw Error('disabled'); values.set(key, value); } };
  const windowEvents = {};
  const window = { matchMedia: () => ({ matches: true }), devicePixelRatio: 1, addEventListener: (event, fn) => { windowEvents[event] = fn; } };
  class Image { constructor() { this.complete = true; this.naturalWidth = 626; } }
  class ResizeObserver { observe() {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8'), { document, window, localStorage: storage, Image, ResizeObserver, requestAnimationFrame() {}, Math, Promise });
  await Promise.resolve(); await Promise.resolve();
  return { game: window.flappyGame, elements, listeners, windowEvents, values };
}

test('five original costumes load, selection and start are available', async () => {
  const { game, elements, values } = await setup();
  assert.equal(game.assetsReady, true);
  assert.equal(elements.get('costume-grid').children.length, 5);
  game.selectCostume(4);
  assert.equal(values.get('flappy-costume'), '4');
  assert.equal(elements.get('menu-bird').src, 'img/5.png');
  game.start();
  assert.equal(game.state, 'ready');
  assert.equal(game.pipes.length, 15);
  const y = game.bird.y;
  game.update(0.2);
  assert.equal(game.bird.y, y, 'ready state must not fall');
});

test('ESC freezes flight; resume preserves position, velocity, pipes and score', async () => {
  const { game, listeners } = await setup();
  game.start(); game.flap(); game.update(1 / 120);
  game.score = 3;
  const snapshot = JSON.stringify({ bird: game.bird, pipes: game.pipes, score: game.score });
  listeners.keydown({ code: 'Escape', preventDefault() {} });
  assert.equal(game.state, 'paused');
  game.update(10);
  assert.equal(JSON.stringify({ bird: game.bird, pipes: game.pipes, score: game.score }), snapshot);
  game.showView('costumes'); game.selectCostume(2); game.showView('main');
  game.resume();
  assert.equal(game.state, 'countdown');
  assert.equal(JSON.stringify({ bird: game.bird, pipes: game.pipes, score: game.score }), snapshot);
  for (let i = 0; i < 50; i++) game.frame(i * 50);
  assert.equal(game.state, 'playing');
  assert.equal(JSON.stringify({ bird: game.bird, pipes: game.pipes, score: game.score }), snapshot);
});

test('mobile pause button returns to the menu and ready state can resume', async () => {
  const { game, elements } = await setup({ width: 360, height: 600 });
  game.start();
  elements.get('pause-button').events.click();
  assert.equal(game.state, 'paused');
  assert.equal(elements.get('menu-overlay').hidden, false);
  assert.equal(elements.get('resume-button').disabled, false);
  game.resume();
  assert.equal(game.state, 'ready');
});

test('safe passage counts once; pipe, floor and ceiling contact end flight', async () => {
  for (const obstacle of ['pipe', 'floor', 'ceiling']) {
    const { game } = await setup();
    game.start(); game.flap(); game.bird.vy = 0;
    game.pipes = [{ x: game.bird.x - 110, top: 200, passed: false }];
    game.bird.y = 300;
    game.update(1 / 120); game.update(1 / 120);
    assert.equal(game.score, 1);
    if (obstacle === 'pipe') { game.pipes = [{ x: game.bird.x - 20, top: 250, passed: false }]; game.bird.y = 240; }
    if (obstacle === 'floor') game.bird.y = game.floor - 10;
    if (obstacle === 'ceiling') game.bird.y = 10;
    game.update(1 / 120);
    assert.equal(game.state, 'gameover', obstacle);
    assert.equal(game.best, 1);
  }
});

test('15th passage completes the single level and restart clears old flight', async () => {
  const { game, values } = await setup();
  game.start(); game.flap(); game.bird.vy = 0;
  game.score = 14;
  game.pipes = [{ x: game.bird.x - 110, top: 200, passed: false }];
  game.update(1 / 120);
  assert.equal(game.state, 'won');
  assert.equal(game.score, 15);
  assert.equal(values.get('flappy-best'), '15');
  game.start();
  assert.equal(game.state, 'ready'); assert.equal(game.score, 0); assert.equal(game.pipes.length, 15);
  assert.equal(game.best, 15);
});

test('focus loss and viewport changes pause safely without changing pipe distance', async () => {
  const { game, windowEvents } = await setup();
  game.start(); game.flap();
  const distance = game.pipes[0].x - game.bird.x;
  windowEvents.blur();
  assert.equal(game.state, 'paused');
  game.canvas.getBoundingClientRect = () => ({ width: 360, height: 620 });
  game.resize();
  assert.ok(Math.abs(game.pipes[0].x - game.bird.x - distance) < 0.00001);
});

test('unavailable localStorage does not block play, costumes or finishing', async () => {
  const { game } = await setup({ storageBlocked: true });
  game.selectCostume(3); game.start(); game.flap(); game.finish(false);
  assert.equal(game.state, 'gameover');
  game.mainMenu(); assert.equal(game.state, 'menu');
});

test('generated route is beatable with the same simple flight control at desktop and phone sizes', async () => {
  for (const width of [360, 1120]) {
    const { game } = await setup({ width, height: 620 });
    game.start(); game.flap();
    for (let step = 0; step < 6000 && game.state === 'playing'; step++) {
      const next = game.pipes.find((pipe) => pipe.x + 76 + 5 >= game.bird.x - 18);
      const target = next ? next.top + 102 + 12 : 330;
      if (game.bird.y > target && game.bird.vy > 0) game.flap();
      game.update(1 / 120);
    }
    assert.equal(game.state, 'won', `route must be playable at width ${width}`);
    assert.equal(game.score, 15);
  }
});
