# 喵片制造所 · Meow Meme Studio

轻量级中文猫 Meme 完整视频剪辑台。无需后端或第三方安装依赖；素材、声音、草稿和导出均在浏览器中处理，上传素材不会发送到服务器。

## 启动

安装 Node.js 18 或更高版本，在本目录运行：

```sh
node server.mjs
```

打开 http://localhost:5173。Windows 也可以右键 `启动喵片.ps1`，选择“使用 PowerShell 运行”。保持启动窗口开启，关闭窗口即可停止。无需 `npm install`。如端口占用，设置环境变量 `PORT` 后重试。

`dist/` 可直接部署到静态网站服务器。请使用 localhost 或 HTTPS，直接双击 `index.html` 不受支持。推荐新版桌面 Chrome / Edge。

## 制作一整出猫猫好戏

1. 猫图片、GIF、视频和声音导入「猫 Meme 素材」；实景背景图片导入独立的「背景素材」。两个区都支持批量文件夹导入、标签与搜索。背景区只接受 JPG / PNG / WebP 静态图片。
2. 对猫素材点击「加入本幕」即可在当前场景叠加第二只、第三只猫；「新建一幕」会创建独立场景；「替换选中猫」只更换当前猫图层。右侧的猫猫列表可选中图层、调整上下叠放顺序或移除。点击画布上的猫再拖动，可分别排位置；滚轮与滑杆分别缩放选中的猫。
3. 从背景区点击「设为本幕背景」，或在右侧下拉框选择。背景图居中铺满画布，画面顺序固定为背景底色 → 背景图片 → 多只猫 → 字幕；绿幕去除和视频原声音量都按选中的猫分别设置。若老素材中的图片被分错区，可用「移到背景区 / 移到猫区」修正。
4. 选择 9:16、1:1 或 16:9。每幕独立设置时长、上下字幕、样式和接下一幕的转场；每只猫独立设置裁剪区间、入场动画、绿幕、翻转和原声音量。复制、前移、后移和移除场景可以调整故事。
5. 视频 / GIF 可设置素材起止点；「让场景时长等于裁剪区间」适合保留一整段原素材。默认循环所选区间，关闭循环后在素材结束处定格，视频原声同时停止。字幕可拖动，方向键可微调选中对象（Shift 加速）。
6. 播放整片或拖动进度条预览。点击「导出完整猫片」，保持页面在前台，等待整片播放完毕，再检查播放器并保存 WebM。

场景数量和总时长没有人为固定上限，不再限制为 3–10 秒或 4 幕。单幕最低 0.1 秒。长视频实际可完成的长度取决于浏览器内存、设备性能和可用磁盘；此版本实时录制并在内存中整理成片，10 分钟视频需要约 10 分钟录制，不适合数小时大型工程。切换页面会取消导出，避免停帧；点击预览处「■」也可取消。

## 原声与背景音乐

- 默认保留每只猫的视频原声，同一幕的多只猫可以同时发声，音量各自可调；图片 / GIF 本身无声。
- 「全片背景原声」可选某个视频的声音或单独音频，不随场景切换重启，短声音自动循环，音量独立控制。
- 两种声音会叠加。若同一视频既是主演又提供全片背景声，可以关闭它的「保留本幕原声」，避免重复播放。
- 预览与导出使用相同混音设置，WebM 包含音频轨道；所有原声关闭时轨道为静音。没有额外加入默认音乐。

## 素材库和保存

素材文件与草稿自动保存在当前网站、当前浏览器的 IndexedDB 中。刷新或重新打开可继续；同一电脑不同浏览器、不同网站地址、换电脑、隐私模式或清理网站数据后不会自动同步。旧版单猫场景会自动转换为新版猫图层；旧素材库里未作为猫出演的图片默认归入背景区，可手动移到猫区。请保留下载的原素材和导出文件。若浏览器存储不可用会提示本次仅临时保存；空间不足会显示导入 / 保存错误。

素材库包含可直接使用的示例猫照片，以及用户提供的[夸克素材分享](https://pan.quark.cn/s/9e1bcf133e40)、已找到的[热门常用猫 Meme 目录](https://pan.quark.cn/s/9e1bcf133e40#/list/share/1cfe24756b124b6ca5190cfdba1b78b1)和[B站来源](https://www.bilibili.com/video/BV1JNrxBgEdo/)。这些链接是来源入口，未预装远程素材包。夸克下载需要用户登录；网页不会绕过登录或把播放页当作视频文件。下载后用文件夹导入即可反复选用。

## 格式与限制

- 单个素材 ≤ 200 MB；推荐 H.264 MP4 或 VP8 / VP9 WebM，视频 ≤ 4K，图片 ≤ 3200 万像素。视频不再限制为两分钟。MOV 等能否读取由浏览器编码支持决定。
- 动态 GIF 使用原生 `ImageDecoder`，动态帧会进入成片。为保护内存，最多 240 帧、解码后累计 3200 万像素；超出请先转视频。无此接口的浏览器会提示换格式。
- 背景支持 JPG / PNG / WebP 静态图片，居中铺满画布。绿幕为简单绿色去除，细毛发、半透明边缘与相近绿色物体可能受影响。
- 每幕可以放多只猫、两条字幕与一个静态背景。猫图层在整幕内同时播放；目前没有逐猫独立的入场起止时间点或音频波形编辑。
- 字幕三种样式：经典描边大字、发疯黄字、黑底白字。支持换行、自动折行和长字幕缩小，每条最多 160 字。
- 入场：缩放、抖动、弹入、无动画；转场：淡化、滑入、闪白、直接切换。转场占用上一幕最后至多 0.35 秒，不额外增加总时长。下一幕首帧进入转场，下一幕计时后开始播放。
- 导出 **WebM**：Canvas `captureStream` + `MediaRecorder`，申请 30 fps、目标视频码率 4 Mbps、音频 128 kbps。实际帧率与码率由浏览器决定。竖屏 540 × 960，方形 720 × 720，横屏 960 × 540。
- 浏览器端 MP4 编码支持不统一，本版优先稳定 WebM，不引入大型 FFmpeg WASM，也不会仅修改扩展名。需要 MP4 可导入支持 WebM 的剪辑软件再导出；或另行安装本机 FFmpeg 后运行：

```sh
ffmpeg -i input.webm -c:v libx264 -pix_fmt yuv420p -c:a aac output.mp4
```

手机 / Safari 能否导出依赖浏览器支持和性能，未逐一验证。推荐桌面 Chrome / Edge。

## 宣传 CP 网站

可以逐幕编排「猫猫发现网站 → 猫猫输入 CP → 分析结果让猫猫尖叫」，同一幕也可以安排两只猫对话或一起发疯，再接上网站操作录屏与剧情片段。录屏和剧情视频可作为普通视频导入猫素材区，关闭不需要的字幕和入场动画。复杂剪辑或精细音频剪切建议最后在剪辑软件完成。

## 文件结构与检查

```text
dist/index.html       中文编辑界面
dist/style.css        响应式猫 Meme 工作台
dist/app.js           素材库、时间线、编辑、预览、导出
dist/engine.js        图片 / GIF / 视频解码、绿幕、字幕与转场
dist/audio.js         原声与全片背景声混音
dist/storage.js       本地素材库与草稿保存
dist/assets/          示例猫、图标、来源说明
dist/vendor/          WebM 时长修复及许可证
server.mjs            本地静态预览，不处理素材
```

```sh
node --check dist/app.js
node --check dist/engine.js
node --check dist/audio.js
node --check dist/storage.js
node --check server.mjs
```

实际验收范围见 `验收说明.md`。

示例照片作者 Roy Tanck，[Cat portrait](https://commons.wikimedia.org/wiki/File:Cat_portrait_(17236370444).jpg)，[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)，来源同时记录于 `dist/assets/credits.txt`。内置 `fix-webm-duration` 1.0.6（MIT），代码和许可证位于 `dist/vendor/`，无需联网加载。上游：https://github.com/yusitnikov/fix-webm-duration。

技术依据：[Canvas captureStream](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream)、[MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)、[Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)、[ImageDecoder](https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder)、[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)。
