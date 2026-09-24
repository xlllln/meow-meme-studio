export const dimensions = { '9:16': [540, 960], '1:1': [720, 720], '16:9': [960, 540] };
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export function createCaption(text = '输入一句猫猫对白', options = {}) {
  return { id: crypto.randomUUID(), text, start: 0, end: 4, x: .5, y: .5, style: 'meme', font: 48, ...options };
}
export function createCat(asset, assetId = null) {
  const crop = asset.autoCrop || { top: 0, right: 0, bottom: 0, left: 0 };
  return { id: crypto.randomUUID(), asset, assetId, trimStart: 0, trimEnd: asset.duration || 4, loop: true, volume: 1, originalSound: true, chroma: Boolean(asset.autoChroma), chromaStrength: 100, autoCrop: Boolean(asset.autoChroma), crop: { ...crop }, cropVersion: 2, flip: false, x: .5, y: .5, scale: 1, animation: 'zoom' };
}
export function createScene(asset, index = 0) {
  const duration = asset.kind === 'video' ? asset.duration : 4;
  return { id: crypto.randomUUID(), cats: [createCat(asset)], duration, backgroundId: null, backgroundAsset: null, captions: [
    createCaption(index ? '我：只是随便看看' : '当我发现我的 CP', { end: duration, x: .5, y: .1 }),
    createCaption(index ? '也是我：立刻开始发疯' : '居然有专属分析网站！', { end: duration, x: .5, y: .86 }),
  ], transition: 'fade', background: '#f9a8d4' };
}
function waitFor(element, event, fail = 'error') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('素材读取超时，请试试更小的文件。')), 15000);
    const done = () => finish();
    const bad = () => finish(new Error('浏览器无法读取这份素材，请换成 JPG / PNG 或 H.264 MP4。'));
    function finish(error) { clearTimeout(timer); element.removeEventListener(event, done); element.removeEventListener(fail, bad); error ? reject(error) : resolve(); }
    element.addEventListener(event, done, { once: true }); element.addEventListener(fail, bad, { once: true });
  });
}
export async function loadAsset(fileOrUrl, name = '示例猫猫') {
  const file = typeof fileOrUrl !== 'string' ? fileOrUrl : null;
  if (file && file.size > 200 * 1024 * 1024) throw new Error('单个素材请控制在 200 MB 以内；大文件可以先压缩再导入。');
  const type = file?.type || 'image/jpeg';
  if (file && !/^(image\/|video\/)/.test(type)) throw new Error('请上传图片、GIF 或短视频素材。');
  const url = file ? URL.createObjectURL(file) : fileOrUrl;
  let element, frames = [];
  try {
    if (type === 'image/gif') {
      if (!globalThis.ImageDecoder || !await ImageDecoder.isTypeSupported('image/gif')) throw new Error('此浏览器不能解码动态 GIF，请用新版 Chrome / Edge，或先把 GIF 转为视频。');
      const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: 'image/gif' });
      let width, height, total = 0;
      try {
        await decoder.tracks.ready; await decoder.completed;
        const count = decoder.tracks.selectedTrack.frameCount;
        if (count > 240) throw new Error('这个 GIF 帧数太多，请先裁成更短的猫片（最多 240 帧）。');
        for (let i = 0; i < count; i++) {
          const { image } = await decoder.decode({ frameIndex: i });
          try {
            const factor = Math.min(1, 720 / Math.max(image.displayWidth, image.displayHeight));
            width = Math.max(1, Math.round(image.displayWidth * factor)); height = Math.max(1, Math.round(image.displayHeight * factor));
            if ((i + 1) * width * height > 32_000_000) throw new Error('这个 GIF 解码后太大，请降低分辨率或缩短时长。');
            const bitmap = await createImageBitmap(image, { resizeWidth: width, resizeHeight: height });
            const duration = Math.max(.02, (image.duration || 100000) / 1000000);
            frames.push({ bitmap, start: total, duration }); total += duration;
          } finally { image.close(); }
        }
      } finally { decoder.close(); }
      const analysis = analyzeBackdrop(frames[0]?.bitmap, width, height, file.name);
      return { kind: 'gif', name: file.name, url, width, height, frames, duration: total, ...analysis, release() { frames.forEach(f => f.bitmap.close()); URL.revokeObjectURL(url); } };
    }
    if (type.startsWith('video/')) {
      element = document.createElement('video'); element.muted = true; element.playsInline = true; element.preload = 'auto'; element.loop = true;
      const ready = waitFor(element, 'loadeddata'); element.src = url; element.load(); await ready;
      if (!Number.isFinite(element.duration) || element.duration <= 0) throw new Error('无法确定视频时长，请换一份完整的视频文件。');
      if (element.videoWidth * element.videoHeight > 8_300_000) throw new Error('视频分辨率过大，请先压缩到 4K 以内。');
      const analysis = analyzeBackdrop(element, element.videoWidth, element.videoHeight, file.name);
      return { kind: 'video', name: file.name, url, element, width: element.videoWidth, height: element.videoHeight, duration: element.duration, ...analysis, release() { element.pause(); element.removeAttribute('src'); element.load(); URL.revokeObjectURL(url); } };
    }
    element = new Image(); const ready = waitFor(element, 'load'); element.src = url; await ready;
    if (element.naturalWidth * element.naturalHeight > 32_000_000) throw new Error('图片分辨率过大，请先缩小到 3200 万像素以内。');
    const analysis = analyzeBackdrop(element, element.naturalWidth, element.naturalHeight, file?.name || name);
    return { kind: 'image', name: file?.name || name, url, element, width: element.naturalWidth, height: element.naturalHeight, ...analysis, release() { if (file) URL.revokeObjectURL(url); } };
  } catch (error) { frames.forEach(f => f.bitmap.close()); if (element?.tagName === 'VIDEO') { element.pause(); element.removeAttribute('src'); element.load(); } if (file) URL.revokeObjectURL(url); throw error; }
}
function analyzeBackdrop(source, width, height, name = '') {
  const empty = { autoChroma: false, autoCrop: { top: 0, right: 0, bottom: 0, left: 0 } };
  if (!source || !width || !height) return empty;
  try {
    const max = 240, fit = Math.min(1, max / Math.max(width, height));
    const w = Math.max(1, Math.round(width * fit)), h = Math.max(1, Math.round(height * fit));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data, rows = new Float32Array(h), cols = new Float32Array(w), blackRows = new Float32Array(h), blackCols = new Float32Array(w);
    let green = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > 55 && g - Math.max(r, b) > 24) { green++; rows[y]++; cols[x]++; }
      if (Math.max(r, g, b) < 32) { blackRows[y]++; blackCols[x]++; }
    }
    const autoChroma = green / (w * h) > .12 || /绿幕|green.?screen/i.test(name);
    if (!autoChroma) return empty;
    for (let y = 0; y < h; y++) rows[y] /= w;
    for (let x = 0; x < w; x++) cols[x] /= h;
    for (let y = 0; y < h; y++) blackRows[y] /= w;
    for (let x = 0; x < w; x++) blackCols[x] /= h;
    const span = (values, threshold) => {
      let first = 0, last = values.length - 1;
      while (first < values.length && values[first] < threshold) first++;
      while (last >= 0 && values[last] < threshold) last--;
      return first <= last ? [first, last] : [0, values.length - 1];
    };
    const edgeBars = values => {
      let first = 0, last = values.length - 1;
      while (first < values.length && values[first] > .68) first++;
      while (last >= 0 && values[last] > .68) last--;
      return [first, last];
    };
    const [greenTop, greenBottom] = span(rows, .08), [greenLeft, greenRight] = span(cols, .08);
    const [blackTop, blackBottom] = edgeBars(blackRows), [blackLeft, blackRight] = edgeBars(blackCols);
    const insetY = Math.max(2, Math.round(h * .012)), insetX = Math.max(2, Math.round(w * .008));
    const top = Math.max(greenTop, blackTop), bottom = Math.min(greenBottom, blackBottom), left = Math.max(greenLeft, blackLeft), right = Math.min(greenRight, blackRight);
    const normalize = (value, size, inset) => value / size > .018 && value / size < .43 ? Math.min(.44, (value + inset) / size) : 0;
    return { autoChroma: true, autoCropVersion: 2, autoCrop: { top: normalize(top, h, insetY), right: normalize(w - right - 1, w, insetX), bottom: normalize(h - bottom - 1, h, insetY), left: normalize(left, w, insetX) } };
  } catch { return /绿幕|green.?screen/i.test(name) ? { ...empty, autoChroma: true } : empty; }
}
export function timelineAt(time, duration, scenes) {
  let index = 0, start = 0;
  while (index < scenes.length - 1 && time >= start + scenes[index].duration) { start += scenes[index].duration; index++; }
  const length = scenes[index].duration;
  const local = clamp(time - start, 0, length);
  const overlap = Math.min(.35, length * .2);
  const transitioning = index < scenes.length - 1 && scenes[index].transition !== 'cut' && local > length - overlap;
  return { index, local, length, start, progress: transitioning ? clamp((local - length + overlap) / overlap, 0, 1) : 0 };
}
export function sceneStart(scenes, index) { return scenes.slice(0, index).reduce((sum, scene) => sum + scene.duration, 0); }
export function totalDuration(scenes) { return scenes.reduce((sum, scene) => sum + scene.duration, 0); }
export function sourceTime(cat, local) { const start = cat.trimStart || 0, end = cat.trimEnd || cat.asset.duration || 4, length = Math.max(.01, end - start); return start + (cat.loop ? Math.max(0, local) % length : Math.min(Math.max(0, local), Math.max(0, length - .025))); }
function frameFor(asset, time) {
  if (asset.kind !== 'gif') return { source: asset.element, tag: asset.kind === 'video' ? Math.floor(asset.element.currentTime * 24) : 0 };
  const t = time % asset.duration;
  const found = asset.frames.findIndex(f => t < f.start + f.duration), index = found < 0 ? asset.frames.length - 1 : found;
  return { source: asset.frames[index].bitmap, tag: index };
}
export function mediaBounds(cat, width, height) {
  const crop = cat.autoCrop === false ? { top: 0, right: 0, bottom: 0, left: 0 } : (cat.crop || cat.asset.autoCrop || { top: 0, right: 0, bottom: 0, left: 0 });
  const sourceWidth = cat.asset.width * Math.max(.05, 1 - crop.left - crop.right), sourceHeight = cat.asset.height * Math.max(.05, 1 - crop.top - crop.bottom);
  const fit = Math.min(width / sourceWidth, height / sourceHeight) * cat.scale;
  const w = sourceWidth * fit, h = sourceHeight * fit;
  return { x: cat.x * width - w / 2, y: cat.y * height - h / 2, w, h };
}
function wrappedLines(ctx, text, maxWidth) {
  const result = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const character of Array.from(paragraph)) {
      if (line && ctx.measureText(line + character).width > maxWidth) { result.push(line); line = character; } else line += character;
    }
    result.push(line);
  }
  return result;
}
export function captionLayout(ctx, caption, width, height) {
  // Reference size follows the shorter edge, so all three aspect ratios remain readable.
  let size = caption.font * Math.min(width, height) / 540;
  const maxWidth = width * .9, maxHeight = height * .4;
  let lines;
  do { ctx.font = `900 ${size}px Impact, "Arial Black", "Microsoft YaHei", sans-serif`; lines = wrappedLines(ctx, caption.text, maxWidth); if (lines.length * size * 1.2 <= maxHeight || size <= 10) break; size -= 1; } while (true);
  const lineHeight = size * 1.2, textWidth = Math.max(0, ...lines.map(l => ctx.measureText(l).width));
  const x = caption.x * width, y = caption.y * height;
  return { size, lines, lineHeight, x, y, bounds: { x: x - textWidth / 2 - 10, y: y - size * .6 - 6, w: textWidth + 20, h: lines.length * lineHeight + 12 } };
}
function drawCaption(ctx, caption, local, width, height) {
  if (!caption.text || local < caption.start || local >= caption.end) return;
  const layout = captionLayout(ctx, caption, width, height);
  ctx.save(); ctx.font = `900 ${layout.size}px Impact, "Arial Black", "Microsoft YaHei", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (caption.style === 'box') { ctx.fillStyle = '#111111de'; ctx.fillRect(layout.bounds.x, layout.bounds.y, layout.bounds.w, layout.bounds.h); }
  ctx.strokeStyle = '#181018'; ctx.lineWidth = Math.max(2, layout.size * .11); ctx.fillStyle = caption.style === 'yellow' ? '#ffe23e' : '#ffffff';
  layout.lines.forEach((line, i) => { if (caption.style !== 'box') ctx.strokeText(line, layout.x, layout.y + i * layout.lineHeight); ctx.fillText(line, layout.x, layout.y + i * layout.lineHeight); }); ctx.restore();
}
export function keyGreenPixels(data, strength, width = 0, height = 0) {
  const amount = clamp(strength, 0, 100) / 100;
  const threshold = 48 - amount * 43;
  const softness = 48 - amount * 22;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2], dominance = g - Math.max(r, b);
    if (g > 36 && g > r * 1.035 && g > b * 1.035 && dominance > threshold) {
      const matte = clamp((dominance - threshold) / softness, 0, 1) * clamp((g - 36) / 70, 0, 1);
      const key = clamp(matte * (.55 + amount * .55), 0, 1);
      data[i+3] = Math.round(data[i+3] * (1 - key));
    }
    if (amount > .35 && dominance > 0) {
      const spill = clamp((dominance - threshold * .15) / 34, 0, 1) * amount;
      const neutral = Math.round((r + b) / 2);
      data[i+1] = Math.round(g * (1 - spill) + neutral * spill);
    }
  }
  if (amount > .7 && width * height * 4 === data.length) {
    const alpha = new Uint8ClampedArray(width * height);
    for (let p = 0; p < alpha.length; p++) alpha[p] = data[p * 4 + 3];
    const edgeFade = .82 - (amount - .7) * .9;
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      if (!alpha[p]) continue;
      const transparentNeighbors = (alpha[p - 1] < 8) + (alpha[p + 1] < 8) + (alpha[p - width] < 8) + (alpha[p + width] < 8);
      if (transparentNeighbors) data[p * 4 + 3] = Math.round(data[p * 4 + 3] * Math.max(.38, edgeFade - transparentNeighbors * .08));
    }
  }
}
function drawCat(ctx, cat, local, width, height, keyCache, quality) {
  const sourceAsset = cat.asset;
  const p = clamp(local / .55, 0, 1);
  let scale = 1, offsetX = 0, offsetY = 0;
  if (cat.animation === 'zoom') scale = 1 + .07 * clamp(local / 3, 0, 1);
  if (cat.animation === 'shake' && p < 1) { offsetX = Math.sin(local * 85) * width * .016 * (1 - p); offsetY = Math.cos(local * 64) * height * .008 * (1 - p); }
  if (cat.animation === 'pop') { const q = p - 1; scale = 1 + 2.70158 * q ** 3 + 1.70158 * q ** 2; offsetY = (1 - p) * height * .12; }
  const bounds = mediaBounds(cat, width, height);
  const frame = frameFor(sourceAsset, sourceTime(cat, local)); let source = frame.source;
  const crop = cat.autoCrop === false ? { top: 0, right: 0, bottom: 0, left: 0 } : (cat.crop || sourceAsset.autoCrop || { top: 0, right: 0, bottom: 0, left: 0 });
  const sx = sourceAsset.width * crop.left, sy = sourceAsset.height * crop.top, sw = sourceAsset.width * Math.max(.05, 1 - crop.left - crop.right), sh = sourceAsset.height * Math.max(.05, 1 - crop.top - crop.bottom);
  let sourceRect = [sx, sy, sw, sh];
  if (cat.chroma) {
    let cache = keyCache.get(cat.id);
    if (!cache) { const canvas = document.createElement('canvas'); cache = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }), tag: null }; keyCache.set(cat.id, cache); }
    const fit = Math.min(1, quality / Math.max(sw, sh)), fw = Math.max(1, Math.round(sw * fit)), fh = Math.max(1, Math.round(sh * fit));
    const tag = `${frame.tag}|${cat.chromaStrength}|${fw}x${fh}|${sx.toFixed(2)},${sy.toFixed(2)},${sw.toFixed(2)},${sh.toFixed(2)}`;
    if (cache.tag !== tag) {
      if (cache.canvas.width !== fw || cache.canvas.height !== fh) { cache.canvas.width = fw; cache.canvas.height = fh; }
      cache.ctx.clearRect(0, 0, fw, fh); cache.ctx.drawImage(source, sx, sy, sw, sh, 0, 0, fw, fh);
      const pixels = cache.ctx.getImageData(0, 0, fw, fh); keyGreenPixels(pixels.data, cat.chromaStrength, fw, fh); cache.ctx.putImageData(pixels, 0, 0); cache.tag = tag;
    }
    source = cache.canvas; sourceRect = [0, 0, cache.canvas.width, cache.canvas.height];
  }
  ctx.save(); ctx.translate(cat.x * width + offsetX, cat.y * height + offsetY); ctx.scale(cat.flip ? -scale : scale, scale);
  ctx.drawImage(source, ...sourceRect, -bounds.w / 2, -bounds.h / 2, bounds.w, bounds.h); ctx.restore();
}
function drawScene(ctx, scene, local, width, height, keyCache, quality) {
  ctx.fillStyle = scene.background; ctx.fillRect(0, 0, width, height);
  if (scene.backgroundAsset) { const bg=scene.backgroundAsset, cover=Math.max(width/bg.width,height/bg.height); ctx.drawImage(bg.element,(width-bg.width*cover)/2,(height-bg.height*cover)/2,bg.width*cover,bg.height*cover); }
  for (const cat of scene.cats) drawCat(ctx, cat, local, width, height, keyCache, quality);
  for (const caption of scene.captions || []) drawCaption(ctx, caption, local, width, height);
}
export class Renderer {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.buffer = document.createElement('canvas'); this.bufferCtx = this.buffer.getContext('2d'); this.keyCache = new Map(); }
  render(state, time) {
    const { width: w, height: h } = this.canvas, ctx = this.ctx;
    const at = timelineAt(time, state.duration, state.scenes), scene = state.scenes[at.index];
    const quality = state.exporting ? 720 : state.playing ? 420 : 560;
    ctx.clearRect(0, 0, w, h); drawScene(ctx, scene, at.local, w, h, this.keyCache, quality);
    if (at.progress > 0) {
      if (this.buffer.width !== w || this.buffer.height !== h) { this.buffer.width = w; this.buffer.height = h; }
      drawScene(this.bufferCtx, state.scenes[at.index + 1], 0, w, h, this.keyCache, quality);
      ctx.save();
      if (scene.transition === 'fade') { ctx.globalAlpha = at.progress; ctx.drawImage(this.buffer, 0, 0); }
      if (scene.transition === 'slide') { ctx.drawImage(this.buffer, w * (1 - at.progress), 0); }
      if (scene.transition === 'flash') { if (at.progress > .5) ctx.drawImage(this.buffer, 0, 0); ctx.fillStyle = `rgba(255,255,255,${Math.sin(at.progress * Math.PI)})`; ctx.fillRect(0, 0, w, h); }
      ctx.restore();
    }
    return at;
  }
}
export async function seekVideo(asset, time) {
  if (asset.kind !== 'video') return;
  const target = Math.min(time % asset.duration, Math.max(0, asset.duration - .03));
  if (Math.abs(asset.element.currentTime - target) < .035 && asset.element.readyState >= 2) return;
  const ready = waitFor(asset.element, 'seeked'); asset.element.currentTime = target; await ready;
}
export function chooseWebmType() {
  if (!globalThis.MediaRecorder) return null;
  return ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type)) || null;
}
