export const dimensions = { '9:16': [540, 960], '1:1': [720, 720], '16:9': [960, 540] };
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export function createScene(asset, index = 0) {
  return { id: crypto.randomUUID(), asset, assetId: null, duration: asset.kind === 'video' ? asset.duration : 4, trimStart: 0, trimEnd: asset.duration || 4, loop: true, volume: 1, originalSound: true, backgroundId: null, backgroundAsset: null, chroma: false, chromaStrength: 40, flip: false, top: index ? '我：只是随便看看' : '当我发现我的 CP', bottom: index ? '也是我：立刻开始发疯' : '居然有专属分析网站！', style: 'meme', font: 48, x: .5, y: .5, scale: 1, topX: .5, topY: .1, bottomX: .5, bottomY: .86, animation: 'zoom', transition: 'fade', background: '#f9a8d4' };
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
      return { kind: 'gif', name: file.name, url, width, height, frames, duration: total, release() { frames.forEach(f => f.bitmap.close()); URL.revokeObjectURL(url); } };
    }
    if (type.startsWith('video/')) {
      element = document.createElement('video'); element.muted = true; element.playsInline = true; element.preload = 'auto'; element.loop = true;
      const ready = waitFor(element, 'loadeddata'); element.src = url; element.load(); await ready;
      if (!Number.isFinite(element.duration) || element.duration <= 0) throw new Error('无法确定视频时长，请换一份完整的视频文件。');
      if (element.videoWidth * element.videoHeight > 8_300_000) throw new Error('视频分辨率过大，请先压缩到 4K 以内。');
      return { kind: 'video', name: file.name, url, element, width: element.videoWidth, height: element.videoHeight, duration: element.duration, release() { element.pause(); element.removeAttribute('src'); element.load(); URL.revokeObjectURL(url); } };
    }
    element = new Image(); const ready = waitFor(element, 'load'); element.src = url; await ready;
    if (element.naturalWidth * element.naturalHeight > 32_000_000) throw new Error('图片分辨率过大，请先缩小到 3200 万像素以内。');
    return { kind: 'image', name: file?.name || name, url, element, width: element.naturalWidth, height: element.naturalHeight, release() { if (file) URL.revokeObjectURL(url); } };
  } catch (error) { frames.forEach(f => f.bitmap.close()); if (element?.tagName === 'VIDEO') { element.pause(); element.removeAttribute('src'); element.load(); } if (file) URL.revokeObjectURL(url); throw error; }
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
export function sourceTime(scene, local) { const start = scene.trimStart || 0, end = scene.trimEnd || scene.asset.duration || scene.duration, length = Math.max(.01, end - start); return start + (scene.loop ? Math.max(0, local) % length : Math.min(Math.max(0, local), Math.max(0, length - .025))); }
function frameFor(asset, time) {
  if (asset.kind !== 'gif') return asset.element;
  const t = time % asset.duration;
  return (asset.frames.find(f => t < f.start + f.duration) || asset.frames.at(-1)).bitmap;
}
export function mediaBounds(scene, width, height) {
  const fit = Math.min(width / scene.asset.width, height / scene.asset.height) * scene.scale;
  const w = scene.asset.width * fit, h = scene.asset.height * fit;
  return { x: scene.x * width - w / 2, y: scene.y * height - h / 2, w, h };
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
export function textLayout(ctx, scene, key, width, height) {
  // Reference size follows the shorter edge, so all three aspect ratios remain readable.
  let size = scene.font * Math.min(width, height) / 540;
  const maxWidth = width * .9, maxHeight = height * .4;
  let lines;
  do { ctx.font = `900 ${size}px Impact, "Arial Black", "Microsoft YaHei", sans-serif`; lines = wrappedLines(ctx, scene[key], maxWidth); if (lines.length * size * 1.2 <= maxHeight || size <= 10) break; size -= 1; } while (true);
  const lineHeight = size * 1.2, textWidth = Math.max(0, ...lines.map(l => ctx.measureText(l).width));
  const x = scene[key + 'X'] * width, y = scene[key + 'Y'] * height;
  return { size, lines, lineHeight, x, y, bounds: { x: x - textWidth / 2 - 10, y: y - size * .6 - 6, w: textWidth + 20, h: lines.length * lineHeight + 12 } };
}
function drawCaption(ctx, scene, key, width, height) {
  if (!scene[key]) return;
  const layout = textLayout(ctx, scene, key, width, height);
  ctx.save(); ctx.font = `900 ${layout.size}px Impact, "Arial Black", "Microsoft YaHei", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (scene.style === 'box') { ctx.fillStyle = '#111111de'; ctx.fillRect(layout.bounds.x, layout.bounds.y, layout.bounds.w, layout.bounds.h); }
  ctx.strokeStyle = '#181018'; ctx.lineWidth = Math.max(2, layout.size * .11); ctx.fillStyle = scene.style === 'yellow' ? '#ffe23e' : '#ffffff';
  layout.lines.forEach((line, i) => { if (scene.style !== 'box') ctx.strokeText(line, layout.x, layout.y + i * layout.lineHeight); ctx.fillText(line, layout.x, layout.y + i * layout.lineHeight); }); ctx.restore();
}
export function keyGreenPixels(data, strength) {
  const threshold = 75 - clamp(strength, 0, 100) * .6;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2], dominance = g - Math.max(r, b);
    if (g > 50 && dominance > threshold) { const alpha = 1 - clamp((dominance - threshold) / 35, 0, 1); data[i+3] = Math.round(data[i+3] * alpha); if (alpha > 0) data[i+1] = Math.min(g, Math.max(r,b) + threshold); }
  }
}
function drawScene(ctx, scene, local, width, height, fx) {
  ctx.fillStyle = scene.background; ctx.fillRect(0, 0, width, height);
  if (scene.backgroundAsset) { const bg=scene.backgroundAsset, cover=Math.max(width/bg.width,height/bg.height); ctx.drawImage(bg.element,(width-bg.width*cover)/2,(height-bg.height*cover)/2,bg.width*cover,bg.height*cover); }
  const p = clamp(local / .55, 0, 1);
  let scale = 1, offsetX = 0, offsetY = 0;
  if (scene.animation === 'zoom') scale = 1 + .07 * clamp(local / 3, 0, 1);
  if (scene.animation === 'shake' && p < 1) { offsetX = Math.sin(local * 85) * width * .016 * (1 - p); offsetY = Math.cos(local * 64) * height * .008 * (1 - p); }
  if (scene.animation === 'pop') { const q = p - 1; scale = 1 + 2.70158 * q ** 3 + 1.70158 * q ** 2; offsetY = (1 - p) * height * .12; }
  const bounds = mediaBounds(scene, width, height);
  let source = frameFor(scene.asset, sourceTime(scene, local));
  if (scene.chroma) { const fit=Math.min(1,720/Math.max(scene.asset.width,scene.asset.height)); const fw=Math.max(1,Math.round(scene.asset.width*fit)),fh=Math.max(1,Math.round(scene.asset.height*fit)); if(fx.width!==fw||fx.height!==fh){fx.width=fw;fx.height=fh;}const fctx=fx.getContext('2d',{willReadFrequently:true});fctx.clearRect(0,0,fw,fh);fctx.drawImage(source,0,0,fw,fh);const pixels=fctx.getImageData(0,0,fw,fh);keyGreenPixels(pixels.data,scene.chromaStrength);fctx.putImageData(pixels,0,0);source=fx; }
  ctx.save(); ctx.translate(scene.x * width + offsetX, scene.y * height + offsetY); ctx.scale(scene.flip ? -scale : scale, scale);
  ctx.drawImage(source, -bounds.w / 2, -bounds.h / 2, bounds.w, bounds.h); ctx.restore();
  drawCaption(ctx, scene, 'top', width, height); drawCaption(ctx, scene, 'bottom', width, height);
}
export class Renderer {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.buffer = document.createElement('canvas'); this.bufferCtx = this.buffer.getContext('2d'); this.fx=document.createElement('canvas'); }
  render(state, time) {
    const { width: w, height: h } = this.canvas, ctx = this.ctx;
    const at = timelineAt(time, state.duration, state.scenes), scene = state.scenes[at.index];
    ctx.clearRect(0, 0, w, h); drawScene(ctx, scene, at.local, w, h, this.fx);
    if (at.progress > 0) {
      if (this.buffer.width !== w || this.buffer.height !== h) { this.buffer.width = w; this.buffer.height = h; }
      drawScene(this.bufferCtx, state.scenes[at.index + 1], 0, w, h, this.fx);
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
