# 喵片制造所 · Meow Meme Studio

一个无需后端、无需安装第三方依赖的中文猫 Meme 视频生成器。适合制作 3–10 秒的宣传片开场，再接「CP 趣味分析网站操作演示 → CP 剧情剪辑」。所有素材在浏览器内处理，不上传服务器。

## 启动

需要 Node.js 18 或更高版本。在本目录打开终端：

```sh
node server.mjs
```

浏览器打开 **http://localhost:5173**。Windows 也可以右键 `启动喵片.ps1`，选择“使用 PowerShell 运行”。保持启动窗口开启；关闭窗口即可停止服务。不需要 `npm install`。端口占用时可设置环境变量 `PORT` 后重试。

纯前端文件在 `dist/`，也可交给任何静态网站服务器。请通过 localhost 或 HTTPS 使用，直接双击 `index.html` 不受支持（ES 模块与 GIF 解码需要合适的浏览器环境）。

## 三步制作

1. 打开即可使用示例猫。点击「＋ 示例猫」增加片段，或上传自己的猫图片、GIF、短视频。最多 4 个片段，按加入顺序播放；可以删除后重新上传调整顺序。
2. 选择 9:16、1:1 或 16:9，修改每段的上下字幕、字体大小、背景色和动画。直接拖动猫猫或字幕；「调整对象」选择字幕后也可用画布方向键移动（Shift 加速）。猫猫可用滚轮或缩放滑杆调整大小。
3. 设置总时长，预览，点击「导出猫片」。等待猫猫表演完，再通过下方播放器检查并点击「保存这段猫片」。

每个片段平分总时长。转场设置作用于该片段接下一段的边界，最后一个片段没有转场。支持淡化、滑入、闪白和直接切换；转场占用上一段最后至多 0.35 秒，不额外延长总时长。入场动画支持轻微缩放、抖动、弹入、无动画。

字幕支持手动换行，并按画布宽度自动折行。长字幕自动缩小，最多输入 160 字；为了开场易读，推荐每句 8–16 字。字幕和素材可以拖到边缘并被画布裁切，调整位置时请留出安全区。

## 格式与浏览器

- 图片：浏览器能读取的 JPG、PNG、WebP 等。透明 PNG 可做猫猫贴纸。
- 动态 GIF：使用浏览器原生 `ImageDecoder`，动态帧会进入预览和导出，不是静态首帧。建议新版桌面 Chrome / Edge。没有此接口的浏览器会明确提示改用视频。为保护内存，最多 240 帧、解码后累计 3200 万像素；长 GIF 请先裁短。GIF 遵循开场需要循环播放。
- 视频：推荐 H.264 MP4 或 VP8/VP9 WebM；MOV 能否读取取决于浏览器编码支持。单个文件 ≤ 30 MB、时长 ≤ 2 分钟、分辨率 ≤ 4K。短视频从头开始并循环，长视频仅使用每段所需的开头部分。
- 导出：**优先稳定 WebM**，使用 Canvas `captureStream` 与 `MediaRecorder`，30 fps、目标码率 4 Mbps。尺寸：竖屏 540 × 960，方形 720 × 720，横屏 960 × 540。实际码率和帧率由浏览器决定。
- **第一版导出无声视频**，素材原声不保留、不加入 BGM。后续剪辑时统一加音乐。
- 浏览器端 MP4 编码支持不统一，MVP 不引入大型 FFmpeg WASM，不伪装文件扩展名。需要 MP4 时，在能读取 WebM 的剪辑软件中导入并导出 MP4；也可用本机 FFmpeg：`ffmpeg -i input.webm -c:v libx264 -pix_fmt yuv420p output.mp4`（需要另行安装 FFmpeg）。
- 导出是实时录制，需要等待 3–10 秒，保持页面在前台；切换页面将取消这次导出，避免生成停帧文件。点击预览位置的「■」可取消。
- 不支持 WebM 录制的浏览器会显示提示。推荐桌面 Chrome / Edge；Firefox 支持图片和视频制作，但 GIF 原生解码可能不可用。手机端可编辑，导出取决于浏览器支持和设备性能。
- 没有项目自动保存，刷新页面会重置。请先保存导出文件。

## 用来宣传 CP 网站

可做两段猫片：「我：只是随便看看」→「也是我：立刻开始发疯」，导出为 6 秒开场。然后在剪辑软件接上你的网站输入、雷达图或分析结果录屏，最后放对应的 CP 剧情镜头，并统一配 BGM。

## 文件结构

```text
dist/index.html       中文界面
dist/style.css        粉色猫 Meme 工作台，响应式布局
dist/app.js           编辑、拖拽、预览、录制与下载
dist/engine.js        素材解码、字幕布局、动画与转场绘制
dist/assets/          示例猫、图标与来源说明
server.mjs            仅用于本地静态文件预览，不处理素材
```

## 示例素材

项目内置 `fix-webm-duration` 1.0.6（MIT），用于补齐浏览器录制 WebM 的总时长元数据，改善成片的进度条。代码和许可证位于 `dist/vendor/`，不需要联网加载。上游：https://github.com/yusitnikov/fix-webm-duration。

`dist/assets/sample-cat.jpg` 为占位示例，可以直接替换成自己的猫素材。作者 Roy Tanck，作品 [Cat portrait](https://commons.wikimedia.org/wiki/File:Cat_portrait_(17236370444).jpg)，[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。来源也记录于 `dist/assets/credits.txt`。网页没有外部字体、分析脚本或远程素材依赖。

## 检查

```sh
node --check dist/app.js
node --check dist/engine.js
node --check server.mjs
```

浏览器手动验收：示例猫与自传图片 / GIF / 视频 → 三个比例 → 字幕样式和拖拽 → 多片段转场 → 3 秒与 10 秒预览 → WebM 导出并播放 → 取消导出和不支持的素材错误提示。

技术依据：[Canvas captureStream](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream)、[MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)、[ImageDecoder](https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder)。
