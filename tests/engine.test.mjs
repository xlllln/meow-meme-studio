import { keyGreenPixels, mediaBounds } from '../dist/engine.js';

const pixels = new Uint8ClampedArray([
  10, 255, 10, 255,
  120, 120, 120, 255,
]);
keyGreenPixels(pixels, 100);
if (pixels[3] !== 0 || pixels[7] !== 255) throw new Error('100% 绿幕强度处理异常');

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
