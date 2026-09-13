import { dimensions, clamp, createScene, loadAsset, timelineAt, mediaBounds, textLayout, Renderer, seekVideo, chooseWebmType } from './engine.js';
const $ = id => document.getElementById(id);
const state = { scenes: [], selected: 0, ratio: '9:16', duration: 6, target: 'media', time: 0, playing: false, exporting: false, loading: false };
const canvas = $('canvas'), renderer = new Renderer(canvas);
let raf = 0, start = 0, outputUrl = null, drag = null, scrubToken = 0, playToken = 0, importToken = 0, activeRecorder = null, cancelExport = null;
const controls = ['top','bottom','font','scale','animation','transition','background'];
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function current() { return state.scenes[state.selected]; }
function invalidateResult() { $('download-area').hidden=true; $('result').pause(); }
function pauseVideos() { state.scenes.forEach(s => { if (s.asset.kind === 'video') s.asset.element.pause(); }); }
function lock() { const busy = state.exporting || state.loading; document.querySelectorAll('button,input,textarea,select').forEach(el => { el.disabled = busy; }); if (!busy) document.querySelectorAll('#scenes button[aria-label^="移除"]').forEach(el => el.disabled = state.scenes.length === 1); if (state.exporting) { $('play').disabled = false; $('play').textContent = '■'; $('play').setAttribute('aria-label', '取消导出'); } }
function stop() { playToken++; state.playing = false; cancelAnimationFrame(raf); pauseVideos(); if (!state.exporting) { $('play').textContent = '▶'; $('play').setAttribute('aria-label', '播放预览'); } }
function stopForEdit() { stop(); if (state.scenes.length && timelineAt(state.time,state.duration,state.scenes).index !== state.selected) { state.time = state.selected * state.duration / state.scenes.length; void prepare(state.time).then(redraw).catch(e=>status(e.message,true)); } }
function redraw() { if (!state.scenes.length) return; renderer.render(state, state.time); $('clock').textContent = `${state.time.toFixed(1)} / ${state.duration.toFixed(1)} s`; $('scrub').value = state.time; }
function markSelection() { document.querySelectorAll('[data-scene]').forEach(el => el.classList.toggle('active', Number(el.dataset.scene) === state.selected)); }
async function goTo(time) {
  stop(); const token = ++scrubToken; state.time = clamp(time, 0, state.duration); redraw();
  const at = timelineAt(state.time, state.duration, state.scenes);
  try { await seekVideo(state.scenes[at.index].asset, at.local); if (at.progress) await seekVideo(state.scenes[at.index + 1].asset, 0); if (token === scrubToken) redraw(); } catch (error) { if (token === scrubToken) status(error.message, true); }
}
function syncForm() {
  const s = current(); if (!s) return;
  for (const key of controls) $(key).value = key === 'scale' ? Math.round(s.scale * 100) : s[key];
  $('font-out').value = s.font; $('scale-out').value = `${Math.round(s.scale * 100)}%`; $('selected-label').textContent = `片段 ${String(state.selected + 1).padStart(2, '0')}`;
  document.querySelectorAll('[data-style]').forEach(el => el.classList.toggle('active', el.dataset.style === s.style));
  document.querySelectorAll('[data-target]').forEach(el => el.classList.toggle('active', el.dataset.target === state.target));
  $('transition').disabled = state.selected === state.scenes.length - 1 || state.exporting || state.loading;
}
function selectScene(index) { if (state.exporting || state.loading) return; state.selected = index; state.target = 'media'; syncForm(); markSelection(); void goTo(index * state.duration / state.scenes.length); }
function sceneLists() {
  $('scenes').replaceChildren(); $('timeline').replaceChildren(); $('scene-count').textContent = `${state.scenes.length} / 4`;
  state.scenes.forEach((s, i) => {
    const row = document.createElement('div'); row.className = 'scene'; row.dataset.scene = i;
    const select = document.createElement('button'); select.className = 'scene-select'; select.setAttribute('aria-label', `编辑片段 ${i+1} ${s.asset.name}`); select.onclick = () => selectScene(i);
    const thumb = document.createElement(s.asset.kind === 'video' ? 'video' : 'img'); thumb.src = s.asset.url; if (s.asset.kind === 'video') { thumb.muted = true; thumb.preload = 'metadata'; }
    const name = document.createElement('span'); name.className = 'name'; name.textContent = s.asset.name;
    const small = document.createElement('small'); small.textContent = `片段 ${String(i+1).padStart(2,'0')} · ${s.asset.kind === 'video' ? '短视频' : s.asset.kind === 'gif' ? '动态 GIF' : '图片'}`; name.append(small); select.append(thumb, name); row.append(select);
    const remove = document.createElement('button'); remove.textContent = '×'; remove.setAttribute('aria-label', `移除片段 ${i+1}`); remove.disabled = state.scenes.length === 1;
    remove.onclick = () => { if (state.scenes.length === 1 || state.exporting || state.loading) return; stop(); invalidateResult(); s.asset.release(); state.scenes.splice(i,1); state.selected = Math.min(state.selected,state.scenes.length-1); sceneLists(); selectScene(state.selected); status('片段已移除。'); }; row.append(remove); $('scenes').append(row);
    const item = document.createElement('button'); item.dataset.scene = i; item.onclick = () => selectScene(i); const title = document.createElement('strong'); title.textContent = `${i+1}. ${s.top || s.asset.name}`; const timing = document.createElement('small'); timing.textContent = `${(i * state.duration / state.scenes.length).toFixed(1)}—${((i+1) * state.duration / state.scenes.length).toFixed(1)} s`; item.append(title,timing); $('timeline').append(item);
  }); markSelection(); syncForm();
}
async function addFiles(files) {
  if (state.exporting || state.loading) return;
  stop(); state.loading = true; lock(); const token = ++importToken; let added = 0, errors = [];
  try {
    for (const file of files) {
      if (state.scenes.length >= 4) { errors.push('最多放 4 个片段，请先移除一个。'); break; }
      status(`正在请 ${file.name} 入场…`);
      try { const asset = await loadAsset(file); if (token !== importToken) { asset.release(); continue; } invalidateResult(); state.scenes.push(createScene(asset, state.scenes.length)); state.selected = state.scenes.length - 1; added++; } catch (e) { errors.push(e.message); }
    }
  } finally { state.loading = false; lock(); sceneLists(); state.target = 'media'; syncForm(); await goTo(state.selected * state.duration / state.scenes.length); $('upload').value = ''; }
  status(errors.length ? `${added ? `已加入 ${added} 个片段。` : ''}${errors.join(' ')}` : '猫猫入场成功！拖动它、加字幕，准备开演。', !!errors.length);
}
async function addSample() {
  if (state.loading || state.exporting) return;
  if (state.scenes.length >= 4) return status('最多放 4 个片段，请先移除一个。',true);
  stop(); state.loading = true; lock();
  try { const asset = await loadAsset('./assets/sample-cat.jpg'); invalidateResult(); state.scenes.push(createScene(asset,state.scenes.length)); state.selected = state.scenes.length-1; }
  catch(e) { status(e.message,true); }
  finally { state.loading = false; lock(); sceneLists(); if (state.scenes.length) await goTo(state.selected * state.duration/state.scenes.length); }
}
for (const key of controls) $(key).addEventListener('input', () => { if (!current() || state.exporting) return; stopForEdit(); current()[key] = key === 'font' ? Number($(key).value) : key === 'scale' ? Number($(key).value)/100 : $(key).value; if (key === 'top' || key === 'bottom') { sceneLists(); } else syncForm(); redraw(); });
document.querySelectorAll('[data-style]').forEach(el => el.onclick = () => { stopForEdit(); current().style = el.dataset.style; syncForm(); redraw(); });
document.querySelectorAll('[data-target]').forEach(el => el.onclick = () => { stopForEdit(); state.target = el.dataset.target; syncForm(); redraw(); });
document.querySelectorAll('[data-ratio]').forEach(el => el.onclick = () => { stop(); state.ratio = el.dataset.ratio; [canvas.width, canvas.height] = dimensions[state.ratio]; document.querySelectorAll('[data-ratio]').forEach(b => b.classList.toggle('active', b === el)); redraw(); });
$('center').onclick = () => { stopForEdit(); const s = current(); if (state.target === 'media') { s.x = s.y = .5; s.scale = 1; } else { s[state.target+'X'] = .5; s[state.target+'Y'] = state.target === 'top' ? .1 : .86; } syncForm(); redraw(); };
$('duration').oninput = () => { stop(); invalidateResult(); state.duration = Number($('duration').value); $('duration-out').value = `${state.duration} 秒`; $('scrub').max = state.duration; sceneLists(); void goTo(state.selected * state.duration/state.scenes.length); };
$('upload').onchange = () => void addFiles([...$('upload').files]); $('add-sample').onclick = () => void addSample();
const zone = $('dropzone'); ['dragenter','dragover'].forEach(e => zone.addEventListener(e, event => { event.preventDefault(); zone.classList.add('over'); })); ['dragleave','drop'].forEach(e => zone.addEventListener(e, event => { event.preventDefault(); zone.classList.remove('over'); })); zone.addEventListener('drop',e=>void addFiles([...e.dataTransfer.files]));
$('scrub').oninput = () => { if (!state.exporting) void goTo(Number($('scrub').value)); }; $('restart').onclick = () => void goTo(0);
function position(event) { const r = canvas.getBoundingClientRect(); return { x: (event.clientX-r.left)/r.width, y:(event.clientY-r.top)/r.height }; }
function moveTarget(dx,dy) { const s = current(), target = state.target; if (target === 'media') { s.x = clamp(s.x+dx,-.5,1.5); s.y = clamp(s.y+dy,-.5,1.5); } else { s[target+'X'] = clamp(s[target+'X']+dx,.05,.95); s[target+'Y'] = clamp(s[target+'Y']+dy,.03,.95); } redraw(); }
canvas.onpointerdown = event => {
  if (state.exporting || state.loading || !current()) return;
  stop(); const at = timelineAt(state.time,state.duration,state.scenes); if (at.index !== state.selected) { state.selected = at.index; syncForm(); markSelection(); }
  if (at.progress > 0) { void goTo(at.index * state.duration/state.scenes.length); return; }
  const p = position(event), x = p.x*canvas.width,y=p.y*canvas.height;
  const hits = ['bottom','top'].filter(key => { if (!current()[key]) return false; const b = textLayout(renderer.ctx,current(),key,canvas.width,canvas.height).bounds; return x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h; });
  state.target = hits[0] || 'media'; syncForm(); drag = p; canvas.setPointerCapture(event.pointerId); canvas.focus();
};
canvas.onpointermove = e => { if (!drag || state.exporting) return; const p = position(e); moveTarget(p.x-drag.x,p.y-drag.y); drag = p; };
canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = () => { drag = null; };
canvas.addEventListener('wheel',e=>{ if (state.exporting || state.loading || !current() || state.target !== 'media') return; e.preventDefault(); stop(); current().scale = clamp(current().scale-e.deltaY*.001,.3,2.5); syncForm(); redraw(); },{passive:false});
canvas.onkeydown = e => { if (state.exporting || state.loading) return; const d=e.shiftKey?.03:.005; const offsets = {ArrowLeft:[-d,0],ArrowRight:[d,0],ArrowUp:[0,-d],ArrowDown:[0,d]}; if (offsets[e.key]) { e.preventDefault(); stop(); moveTarget(...offsets[e.key]); } };
function syncPlayingVideos(time) {
  const at = timelineAt(time,state.duration,state.scenes);
  state.scenes.forEach((s,i)=>{
    if (s.asset.kind !== 'video') return;
    const v=s.asset.element;
    if (i===at.index) { const target=at.local%s.asset.duration; if (Math.abs(v.currentTime-target)>.18 && !v.seeking) v.currentTime=Math.min(target,s.asset.duration-.03); if (v.paused) v.play().catch(()=>{}); }
    else { v.pause(); if (i===at.index+1 && at.progress && v.currentTime>.04 && !v.seeking) v.currentTime=0; }
  });
}
async function prepare(time) { const at=timelineAt(time,state.duration,state.scenes); await seekVideo(state.scenes[at.index].asset,at.local); if (at.index+1<state.scenes.length) await seekVideo(state.scenes[at.index+1].asset,0); }
async function play() {
  if (state.exporting) { cancelExport?.(); return; }
  if (state.playing) return stop(); if (state.loading || !state.scenes.length) return;
  if (state.time>=state.duration-.01) state.time=0;
  const token=++playToken;
  try { await prepare(state.time); if(token!==playToken || state.exporting || state.loading)return; state.playing=true; start=performance.now()-state.time*1000; $('play').textContent='Ⅱ'; $('play').setAttribute('aria-label','暂停预览');
    const tick=now=>{ if (!state.playing) return; state.time=Math.min(state.duration,(now-start)/1000); syncPlayingVideos(state.time); redraw(); if (state.time>=state.duration) { stop(); return; } raf=requestAnimationFrame(tick); }; raf=requestAnimationFrame(tick);
  } catch(e) { stop(); status(e.message,true); }
}
$('play').onclick=()=>void play();
async function exportVideo() {
  if (state.exporting || state.loading || !state.scenes.length) return;
  const mime=chooseWebmType(); if (!mime || !canvas.captureStream) return status('此浏览器不能导出 WebM，请在桌面版 Chrome / Edge / Firefox 中打开。',true);
  stop(); $('result').pause(); state.exporting=true; lock(); $('export').textContent='猫猫正在演出…';
  let stream, recorder, canceled=false, hidden=false, chunks=[], failure=null;
  cancelExport=()=>{canceled=true;};
  const onHidden=()=>{ if (document.hidden) { hidden=true; cancelExport?.(); } }; document.addEventListener('visibilitychange',onHidden);
  try {
    await document.fonts.ready; await Promise.all(state.scenes.map(s=>seekVideo(s.asset,0))); if(canceled){status(hidden?'导出已取消：请保持页面在前台后重试。':'已取消导出。');return;} state.time=0; redraw();
    stream=canvas.captureStream(30); recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4_000_000}); activeRecorder=recorder;
    const finished=new Promise((resolve,reject)=>{ recorder.ondataavailable=e=>{if(e.data.size) chunks.push(e.data);}; recorder.onerror=e=>reject(e.error||new Error('录制失败，请重试。')); recorder.onstop=resolve; });
    recorder.start(200); start=performance.now();
    const playback=new Promise(resolve=>{
      let ended=false; const finish=()=>{ if(ended)return; ended=true; cancelAnimationFrame(raf); pauseVideos(); if(recorder.state!=='inactive')recorder.stop(); resolve(); };
      cancelExport=()=>{ canceled=true; finish(); };
      const tick=now=>{ try { state.time=Math.min(state.duration,(now-start)/1000); syncPlayingVideos(state.time); redraw(); status(`猫猫正在演出… ${Math.round(state.time/state.duration*100)}%（点 ■ 可取消）`); if(state.time>=state.duration)finish(); else raf=requestAnimationFrame(tick); } catch(e){failure=e;finish();} }; raf=requestAnimationFrame(tick);
      if(document.hidden){hidden=true;cancelExport();}
    });
    await Promise.all([playback,finished]);
    if(failure)throw failure;
    if(canceled){status(hidden?'导出已暂停：保持页面在前台，再点一次导出。':'已取消导出，可以继续修改猫片。');return;}
    let blob=new Blob(chunks,{type:mime}); if(blob.size<1000)throw new Error('猫片没有录制完整，请重新导出。');
    blob=await window.ysFixWebmDuration(blob,state.duration*1000,{logger:false});
    if(outputUrl)URL.revokeObjectURL(outputUrl); outputUrl=URL.createObjectURL(blob); $('result').src=outputUrl; $('download').href=outputUrl; $('download').download=`猫猫开场-${state.ratio.replace(':','x')}-${state.duration}s.webm`; $('download-area').hidden=false;
    status(`猫片完成！${state.duration} 秒 · ${canvas.width} × ${canvas.height} · ${(blob.size/1024/1024).toFixed(1)} MB。下方预览后保存。`);
  } catch(e) { if(recorder?.state && recorder.state!=='inactive')recorder.stop(); status(e.message||'导出失败，请重试。',true); }
  finally { cancelAnimationFrame(raf); stream?.getTracks().forEach(t=>t.stop()); pauseVideos(); document.removeEventListener('visibilitychange',onHidden); state.exporting=false; activeRecorder=null; cancelExport=null; lock(); $('export').innerHTML='↗ 导出猫片 <span>WebM</span>'; $('play').textContent='▶'; $('play').setAttribute('aria-label','播放预览'); syncForm(); }
}
$('export').onclick=()=>void exportVideo();
// A changed project must be exported again; never offer an outdated clip as the current result.
controls.forEach(key=>$(key).addEventListener('input',invalidateResult));
document.querySelectorAll('[data-style],[data-ratio]').forEach(el=>el.addEventListener('click',invalidateResult));
$('center').addEventListener('click',invalidateResult);
canvas.addEventListener('pointermove',()=>{if(drag)invalidateResult();});
canvas.addEventListener('keydown',e=>{if(e.key.startsWith('Arrow'))invalidateResult();});
canvas.addEventListener('wheel',()=>{if(state.target==='media'&&!state.exporting)invalidateResult();});
window.addEventListener('pagehide',()=>{ cancelExport?.(); stop(); state.scenes.forEach(s=>s.asset.release()); if(outputUrl)URL.revokeObjectURL(outputUrl); });
document.addEventListener('visibilitychange',()=>{ if(document.hidden && !state.exporting)stop(); });
await addSample();
// Optional agent entry points use the same actions as the visible editor.
if (document.modelContext?.registerTool) {
  const lifecycle=new AbortController();
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'read_meme_project',description:'读取当前猫片的比例、时长和各片段字幕，不读取素材文件。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(){return{ratio:state.ratio,duration:state.duration,selected:state.selected,scenes:state.scenes.map((s,i)=>({index:i,top:s.top,bottom:s.bottom,style:s.style,animation:s.animation,transition:s.transition}))};}});
  register({name:'configure_meme_captions',description:'设置指定猫片段的顶部和底部字幕，更新可见画布；不会导出或上传视频。',inputSchema:{type:'object',properties:{index:{type:'integer',minimum:0,maximum:3},top:{type:'string',maxLength:160},bottom:{type:'string',maxLength:160}},required:['index','top','bottom'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){if(!input || !Number.isInteger(input.index) || !state.scenes[input.index] || typeof input.top!=='string' || typeof input.bottom!=='string' || input.top.length>160 || input.bottom.length>160 || Object.keys(input).some(k=>!['index','top','bottom'].includes(k)))throw new Error('无效的片段或字幕。');if(state.exporting || state.loading)throw new Error('请等待当前处理完成。');stop();state.selected=input.index;current().top=input.top;current().bottom=input.bottom;sceneLists();await goTo(input.index*state.duration/state.scenes.length);return{index:input.index,top:current().top,bottom:current().bottom};}});
}
