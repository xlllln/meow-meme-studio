import { createCaption, keyGreenPixels, mediaBounds } from '../dist/engine.js';

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

console.log('engine assertions passed');
