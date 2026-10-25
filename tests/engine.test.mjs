import assert from 'node:assert/strict';
import { createCaption, createCat, cloneCatLayer, keyGreenPixels, mediaBounds, renderedMediaBounds, editingCatBounds, catToolsPosition, Renderer } from '../dist/engine.js';
import { AudioMixer } from '../dist/audio.js';

const pixels = new Uint8ClampedArray([
  10, 255, 10, 255,
  90, 132, 92, 255,
  120, 120, 120, 255,
]);
keyGreenPixels(pixels, 100);
if (pixels[3] !== 0 || pixels[5] > Math.max(pixels[4], pixels[6]) + 2 || pixels[11] !== 255) throw new Error('100% 绿幕与绿边净化处理异常');

const line = createCaption('第一句', { start: 1, end: 2, x: .3, y: .4 });
if (!line.id || line.text !== '第一句' || line.start !== 1 || line.end !== 2 || line.x !== .3 || line.y !== .4) throw new Error('自由对白创建异常');

const cat = {
  asset: { width: 100, height: 200, autoCrop: { top: .2, bottom: .2, left: 0, right: 0 } },
  autoCrop: true,
  scale: 1,
  x: .5,
  y: .5,
};
const bounds = mediaBounds(cat, 540, 960);
if (Math.round(bounds.w) !== 540 || Math.round(bounds.h) !== 648) throw new Error('自动黑边裁切尺寸异常');

function videoElement() {
  return { paused: true, currentTime: 1.5, seeking: false, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } };
}
const originalAsset = { kind: 'video', width: 100, height: 200, duration: 4, element: videoElement() };
const original = { ...createCat(originalAsset, 'video-source'), x: .3, y: .7, scale: 1.4, flip: true, chroma: true, chromaStrength: 75, animation: 'shake', trimStart: .5, trimEnd: 3, volume: .6 };
const freshAsset = () => ({ ...originalAsset, element: videoElement() });
const single = cloneCatLayer(original, freshAsset());
const independent = cloneCatLayer(original, freshAsset(), 'independent');
const settings = ({ id, asset, ...rest }) => rest;
assert.deepEqual(settings(independent), settings(original), '独立声音应完整保留参数');
assert.deepEqual(settings(single), { ...settings(original), originalSound: false });
assert.notEqual(single.id, original.id); assert.notEqual(single.id, independent.id);
assert.notEqual(single.asset.element, original.asset.element);
assert.notEqual(single.crop, original.crop);
single.crop.top = .2; assert.equal(original.crop.top, 0, '副本裁切不能影响原猫');
assert.equal(cloneCatLayer({ ...original, originalSound: false }, freshAsset(), 'independent').originalSound, false);
for (const kind of ['image', 'gif']) assert.deepEqual(settings(cloneCatLayer(original, { kind })), settings(original), '图片和 GIF 不修改音频设置');

const mixer = new AudioMixer();
for (const layer of [original, single, independent]) mixer.nodes.set(layer.asset.element, { gain: { gain: { value: -1 } } });
const audioState = { scenes: [{ cats: [original, single, independent], duration: 4, transition: 'cut' }], duration: 4 };
mixer.sync(audioState, 1);
assert.equal(mixer.nodes.get(original.asset.element).gain.gain.value, .6);
assert.equal(mixer.nodes.get(single.asset.element).gain.gain.value, 0, '单一声音模式只静音副本');
assert.equal(mixer.nodes.get(independent.asset.element).gain.gain.value, .6, '独立声音模式使用副本自己的音频节点');
mixer.sync({ scenes: [{ cats: [], duration: 4, transition: 'cut' }], duration: 4 }, 1);

const stage = { w: 320, h: 400 }, tools = { w: 180, h: 48 };
assert.deepEqual(catToolsPosition({ x: 100, y: 120, w: 100, h: 100 }, stage, tools), { x: 60, y: 64 });
assert.deepEqual(catToolsPosition({ x: 100, y: 5, w: 100, h: 100 }, stage, tools), { x: 60, y: 113 }, '上方不足时移到下方');
for (const rectangle of [{ x: -100, y: -100, w: 500, h: 600 }, { x: 280, y: 340, w: 100, h: 100 }]) {
  const position = catToolsPosition(rectangle, stage, tools);
  assert.ok(position.x >= 8 && position.y >= 8 && position.x + tools.w <= 312 && position.y + tools.h <= 392);
}
assert.equal(catToolsPosition({ x: 400, y: 0, w: 100, h: 100 }, stage, tools), null);

// Record the actual draw transforms, so the outline is checked against the image.
function canvasRecorder() {
  const calls = [], stack = [];
  let transform = { x: 0, y: 0, sx: 1, sy: 1 };
  const ctx = {
    strokeStyle: 'initial', lineWidth: 1, dash: [],
    save() { stack.push({ transform: { ...transform }, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, dash: this.dash }); },
    restore() { const saved = stack.pop(); transform = saved.transform; Object.assign(this, { strokeStyle: saved.strokeStyle, lineWidth: saved.lineWidth, dash: saved.dash }); },
    translate(x, y) { transform.x += x * transform.sx; transform.y += y * transform.sy; },
    scale(x, y) { transform.sx *= x; transform.sy *= y; },
    clearRect() {}, fillRect() {},
    setLineDash(dash) { this.dash = dash; },
    drawImage(source, ...args) {
      calls.push({ type: 'image', source, args, transform: { ...transform } });
    },
    strokeRect(x, y, w, h) { calls.push({ type: 'outline', x, y, w, h, color: this.strokeStyle, width: this.lineWidth, dash: this.dash }); },
  };
  return { width: 540, height: 960, clientWidth: 270, calls, ctx, getContext: () => ctx };
}
const oldDocument = globalThis.document;
globalThis.document = { createElement: () => canvasRecorder() };
try {
  const canvas = canvasRecorder(), renderer = new Renderer(canvas);
  const layer = { ...cat, id: 'cat-1', scale: .6, x: .35, y: .45, asset: { ...cat.asset, kind: 'image', element: {}, duration: 4 } };
  const scene = { cats: [layer], captions: [], duration: 4, background: '#000', transition: 'cut' };
  const state = { scenes: [scene], duration: 4, selected: 0, selectedCat: 0, target: 'media', playing: false, exporting: false };
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
  for (const [width, height] of [[540, 960], [720, 720], [960, 540]]) {
    canvas.width = width; canvas.height = height;
    for (const animation of ['none', 'zoom', 'shake', 'pop']) for (const flip of [false, true]) for (const time of [.1, 3]) {
      Object.assign(layer, { animation, flip }); canvas.calls.length = 0;
      renderer.render(state, time);
      const image = canvas.calls.find(c => c.type === 'image'), outline = canvas.calls.find(c => c.color === '#e8498b');
      const [dx, dy, dw, dh] = image.args.slice(-4), t = image.transform;
      const x1 = t.x + dx * t.sx, x2 = t.x + (dx + dw) * t.sx;
      const y1 = t.y + dy * t.sy, y2 = t.y + (dy + dh) * t.sy;
      assert.ok(outline, '编辑态应显示边框');
      near(outline.x, Math.min(x1, x2)); near(outline.y, Math.min(y1, y2));
      near(outline.w, Math.abs(x2 - x1)); near(outline.h, Math.abs(y2 - y1));
      assert.equal(canvas.calls.at(-1), outline, '边框应在素材之后绘制');
      assert.deepEqual(outline.dash, [6 * width / 270, 4 * width / 270]);
      assert.equal(canvas.ctx.strokeStyle, 'initial'); assert.deepEqual(canvas.ctx.dash, []);
    }
  }
  const before = renderedMediaBounds(layer, 1, 540, 960);
  layer.x += .1; layer.y += .2; layer.scale *= 2;
  const after = renderedMediaBounds(layer, 1, 540, 960);
  near(after.w, before.w * 2); near(after.h, before.h * 2);
  near(after.x + after.w / 2, before.x + before.w / 2 + 54);
  near(after.y + after.h / 2, before.y + before.h / 2 + 192);

  for (const patch of [{ loading: true }, { exporting: true }, { playing: true }, { target: null }, { target: 'caption:1' }, { selected: 1 }, { selectedCat: 10 }]) {
    canvas.calls.length = 0; renderer.render({ ...state, ...patch }, 1);
    assert.equal(canvas.calls.filter(c => c.type === 'outline').length, 0, `应隐藏边框: ${JSON.stringify(patch)}`);
    assert.equal(editingCatBounds({ ...state, ...patch }, 1, canvas.width, canvas.height), null, 'HTML 工具与选中框共用显隐条件');
  }
  for (const exporting of [false, true]) {
    const emptyState = { ...state, exporting, scenes: [{ ...scene, cats: [] }] };
    canvas.calls.length = 0; renderer.render(emptyState, 1);
    assert.equal(canvas.calls.length, 0, '空场景没有猫图像或选中框，仍可渲染和导出');
    assert.equal(editingCatBounds(emptyState, 1, 540, 960), null);
  }
  // Verify every transition is composited before the UI; exports never draw UI,
  // including the very first and last frames captured by MediaRecorder.
  const nextScene = { ...scene, cats: [{ ...layer, id: 'cat-2', x: .8 }] };
  for (const transition of ['fade', 'slide', 'flash']) {
    scene.transition = transition;
    const multiState = { ...state, scenes: [scene, nextScene], duration: 8 };
    canvas.calls.length = 0; renderer.render(multiState, 3.9);
    assert.equal(canvas.calls.at(-1).color, '#e8498b');
    for (const time of [0, .1, 3.9, 4, 7.9, 8]) {
      canvas.calls.length = 0; renderer.buffer.calls.length = 0;
      renderer.render({ ...multiState, exporting: true }, time);
      assert.equal(canvas.calls.filter(c => c.type === 'outline').length, 0);
      assert.equal(renderer.buffer.calls.filter(c => c.type === 'outline').length, 0);
      assert.ok(canvas.calls.some(c => c.type === 'image'), '导出仍应绘制素材');
    }
    canvas.calls.length = 0; renderer.render(multiState, 4.1);
    assert.equal(canvas.calls.filter(c => c.type === 'outline').length, 0, '不能将上一幕的选中框画到下一幕');
  }
} finally {
  if (oldDocument === undefined) delete globalThis.document;
  else globalThis.document = oldDocument;
}
console.log('engine assertions passed (copy parameters, audio modes, empty scenes, tools positioning, geometry, export isolation)');
