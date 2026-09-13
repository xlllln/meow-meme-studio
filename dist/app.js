import { dimensions, clamp, createScene, loadAsset, timelineAt, sceneStart, totalDuration, sourceTime, textLayout, Renderer, seekVideo, chooseWebmType } from './engine.js';
import { AudioMixer } from './audio.js';
import { openStore, listAssets, putAsset, deleteAsset, saveDraft, loadDraft } from './storage.js';
const $=id=>document.getElementById(id);
const state={scenes:[],selected:0,ratio:'9:16',duration:4,target:'media',time:0,playing:false,exporting:false,loading:true,musicId:'',musicVolume:.6};
const canvas=$('canvas'), renderer=new Renderer(canvas), mixer=new AudioMixer();
let rows=[],raf=0,epoch=0,scrubEpoch=0,outputUrl=null,drag=null,saveTimer=null,ready=false,persistent=false,cancelExport=null;
const current=()=>state.scenes[state.selected];
const busy=()=>state.loading||state.exporting;
const labelTime=t=>{const v=Math.max(0,t),m=Math.floor(v/60),s=Math.floor(v%60);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');};
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function lock(){document.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=busy());if(state.exporting){$('play').disabled=false;$('play').textContent='■';$('play').setAttribute('aria-label','取消导出');}if(!busy())syncForm();}
function stop(){epoch++;cancelAnimationFrame(raf);state.playing=false;mixer.pause(state.scenes);if(!state.exporting){$('play').textContent='▶';$('play').setAttribute('aria-label','播放整片');}}
function invalidate(){ $('download-area').hidden=true;$('result').pause(); }
function snapshot(){return{version:2,ratio:state.ratio,selected:state.selected,musicId:state.musicId,musicVolume:state.musicVolume,scenes:state.scenes.map(({asset,backgroundAsset,...s})=>s)};}
function persist(){if(!ready)return;clearTimeout(saveTimer);$('save-state').textContent=persistent?'草稿正在保存…':'仅本次页面';saveTimer=setTimeout(async()=>{try{await saveDraft(snapshot());$('save-state').textContent=persistent?'草稿已保存 · 此浏览器':'仅本次页面，关闭后不保留';}catch(e){$('save-state').textContent='草稿未保存';status(e.message,true);}},250);}
function changed(){invalidate();state.duration=totalDuration(state.scenes);$('scrub').max=state.duration;state.time=Math.min(state.time,state.duration);persist();}
function redraw(){if(!state.scenes.length)return;renderer.render(state,state.time);$('clock').textContent=labelTime(state.time)+' / '+labelTime(state.duration);$('scrub').value=state.time;}
function resize(){[canvas.width,canvas.height]=dimensions[state.ratio];document.querySelectorAll('[data-ratio]').forEach(el=>el.classList.toggle('active',el.dataset.ratio===state.ratio));}
async function prepare(time){const at=timelineAt(time,state.duration,state.scenes);await seekVideo(state.scenes[at.index].asset,sourceTime(state.scenes[at.index],at.local));if(at.index+1<state.scenes.length)await seekVideo(state.scenes[at.index+1].asset,state.scenes[at.index+1].trimStart);}
async function goTo(time){stop();const token=++scrubEpoch;state.time=clamp(time,0,state.duration);redraw();try{await prepare(state.time);if(token===scrubEpoch)redraw();}catch(e){status(e.message,true);}}
function editStart(){stop();if(timelineAt(state.time,state.duration,state.scenes).index!==state.selected)state.time=sceneStart(state.scenes,state.selected);}
function releaseScene(s){if(s.asset.kind==='video')mixer.detach(s.asset.element);s.asset.release();s.backgroundAsset?.release();}
function syncForm(){
 const s=current();if(!s)return;
 for(const key of ['top','bottom','font','animation','transition','background'])$(key).value=s[key];
 $('scene-duration').value=s.duration;$('trim-start').value=s.trimStart;$('trim-end').value=s.trimEnd;
 $('scale').value=Math.round(s.scale*100);$('scale-out').value=Math.round(s.scale*100)+'%';$('font-out').value=s.font;
 $('loop').checked=s.loop;$('flip').checked=s.flip;$('chroma').checked=s.chroma;$('chroma-strength').value=s.chromaStrength;$('chroma-out').value=s.chromaStrength;
 $('original-sound').checked=s.originalSound;$('volume').value=Math.round(s.volume*100);$('volume-out').value=Math.round(s.volume*100)+'%';
 $('background-image').value=s.backgroundId||'';$('music').value=state.musicId;$('music-volume').value=Math.round(state.musicVolume*100);$('music-volume-out').value=Math.round(state.musicVolume*100)+'%';
 $('selected-label').textContent='场景 '+String(state.selected+1).padStart(2,'0');$('asset-name').textContent=s.asset.name;
 $('trim-fields').hidden=s.asset.kind==='image';$('clip-sound').hidden=s.asset.kind!=='video';
 document.querySelectorAll('[data-style]').forEach(el=>el.classList.toggle('active',el.dataset.style===s.style));
 document.querySelectorAll('[data-target]').forEach(el=>el.classList.toggle('active',el.dataset.target===state.target));
 document.querySelectorAll('[data-scene]').forEach(el=>el.classList.toggle('active',Number(el.dataset.scene)===state.selected));
 if(!busy()){$('transition').disabled=state.selected===state.scenes.length-1;$('move-left').disabled=state.selected===0;$('move-right').disabled=state.selected===state.scenes.length-1;$('remove-scene').disabled=state.scenes.length===1;}
}
function selectScene(index){if(busy())return;state.selected=index;state.target='media';syncForm();persist();void goTo(sceneStart(state.scenes,index));}
function timeline(){
 $('timeline').replaceChildren();let offset=0;
 state.scenes.forEach((s,i)=>{const b=document.createElement('button');b.dataset.scene=i;b.onclick=()=>selectScene(i);b.style.flexGrow=Math.max(.5,Math.min(s.duration,30));const title=document.createElement('strong');title.textContent=(i+1)+'. '+(s.top||s.asset.name);const time=document.createElement('small');time.textContent=labelTime(offset)+'—'+labelTime(offset+s.duration)+' · '+Number(s.duration.toFixed(2))+' s';b.append(title,time);$('timeline').append(b);offset+=s.duration;});
 $('project-length').textContent=state.scenes.length+' 个场景 · '+labelTime(state.duration)+'（'+Number(state.duration.toFixed(2))+' 秒）';syncForm();
}
function storedRow(row){const{thumbUrl,...record}=row;return record;}
function thumbUrl(row){return row.thumbUrl||(row.thumbUrl=row.file?URL.createObjectURL(row.file):row.url);}
function choiceLists(){
 const choices=[['background-image','使用纯色背景',rows.filter(r=>r.kind==='image')],['music','只用各场景原声',rows.filter(r=>r.kind==='video'||r.kind==='audio')]];
 for(const [id,empty,items] of choices){const el=$(id);el.replaceChildren(new Option(empty,''));items.forEach(row=>el.add(new Option(row.name,row.id)));}
 syncForm();
}
function library(){
 $('library').replaceChildren();const query=$('search').value.toLowerCase();const found=rows.filter(r=>(r.name+' '+r.tags).toLowerCase().includes(query));$('library-count').textContent=rows.length+' 个素材';
 for(const row of found){
  const item=document.createElement('article');item.className='library-item';
  const visual=document.createElement(row.kind==='audio'?'span':row.kind==='video'?'video':'img');visual.className='library-thumb';
  if(row.kind==='audio')visual.textContent='♫';else{visual.src=thumbUrl(row);if(row.kind==='video'){visual.muted=true;visual.preload='metadata';}}
  const body=document.createElement('div');body.className='library-copy';const title=document.createElement('strong');title.textContent=row.name;const meta=document.createElement('small');meta.textContent=({image:'图片',gif:'GIF',video:'视频',audio:'音频'}[row.kind])+(row.duration?' · '+labelTime(row.duration):'');body.append(title,meta);item.append(visual,body);
  if(row.id!=='sample'){const tags=document.createElement('input');tags.value=row.tags||'';tags.placeholder='标签：震惊 / 开心…';tags.setAttribute('aria-label',row.name+'的标签');tags.onchange=()=>{row.tags=tags.value.slice(0,120);void putAsset(storedRow(row)).catch(e=>status(e.message,true));};item.append(tags);}
  const actions=document.createElement('div');actions.className='library-actions';
  const action=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>{if(!busy())void fn();};actions.append(b);};
  if(row.kind!=='audio'){action('＋ 加入故事',()=>insert(row.id));action('替换本幕',()=>insert(row.id,true));}
  if(row.kind==='video'||row.kind==='audio')action('♫ 背景原声',()=>setMusic(row.id));
  if(row.id!=='sample')action('移出素材库',async()=>{if(state.scenes.some(s=>s.assetId===row.id||s.backgroundId===row.id)||state.musicId===row.id)return status('这份素材还在故事里使用，先替换或移除相应场景 / 背景原声。',true);try{await deleteAsset(row.id);if(row.thumbUrl?.startsWith('blob:'))URL.revokeObjectURL(row.thumbUrl);rows=rows.filter(r=>r.id!==row.id);library();choiceLists();status('素材已移出此浏览器的猫窝，原始文件不受影响。');}catch(e){status(e.message,true);}});
  item.append(actions);$('library').append(item);
 }
 if(!found.length){const p=document.createElement('p');p.className='small-note';p.textContent='没有找到这只猫，换个关键词试试。';$('library').append(p);}
}
async function assetFor(id){const row=rows.find(r=>r.id===id);if(!row)throw new Error('找不到原素材，请重新导入。');return loadAsset(row.file||row.url,row.name);}
async function insert(id,replace=false){
 if(busy())return;stop();state.loading=true;lock();
 try{const asset=await assetFor(id),s=createScene(asset,state.scenes.length);s.assetId=id;s.chroma=/绿幕|green.?screen/i.test(asset.name);
 if(replace){const old=current();s.top=old.top;s.bottom=old.bottom;s.style=old.style;s.font=old.font;s.duration=old.duration;s.backgroundId=old.backgroundId;s.backgroundAsset=old.backgroundAsset;old.backgroundAsset=null;releaseScene(old);state.scenes[state.selected]=s;}
 else{state.scenes.push(s);state.selected=state.scenes.length-1;}
 changed();timeline();status('猫猫已加入故事，修改这一幕的时长和字幕吧。');
 }catch(e){status(e.message,true);}finally{state.loading=false;lock();if(current())await goTo(sceneStart(state.scenes,state.selected));}
}
async function audioMetadata(file){const a=document.createElement('audio'),url=URL.createObjectURL(file);a.src=url;
 try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('音频读取超时。')),15000);a.onloadedmetadata=()=>{clearTimeout(timer);Number.isFinite(a.duration)&&a.duration>0?resolve(a.duration):reject(new Error('音频时长无效。'));};a.onerror=()=>{clearTimeout(timer);reject(new Error('浏览器无法读取该音频。'));};a.load();});}
 finally{a.removeAttribute('src');a.load();URL.revokeObjectURL(url);}
}
async function importFiles(files,background=false){
 if(busy())return;stop();state.loading=true;lock();let added=0,errors=[],lastImage=null;
 try{for(const file of files){if(file.size>200*1024*1024){errors.push(file.name+' 超过 200 MB。');continue;}status('正在整理 '+file.name+'…');
 try{let kind,duration=0; if(file.type.startsWith('audio/')){kind='audio';duration=await audioMetadata(file);}else{const asset=await loadAsset(file);kind=asset.kind;duration=asset.duration||0;asset.release();}
 if(background&&kind!=='image')throw new Error('背景请选择 JPG / PNG / WebP 静态图片。');
 const row={id:crypto.randomUUID(),file,name:file.name,kind,duration,tags:background?'背景':file.webkitRelativePath?.split('/').slice(0,-1).join(' ')||''};
 await putAsset(row);rows.push(row);added++;if(kind==='image')lastImage=row.id;
 }catch(e){errors.push(file.name+'：'+e.message);}}}
 finally{state.loading=false;library();choiceLists();lock();$('upload').value='';$('folder').value='';$('background-upload').value='';}
 if(background&&lastImage)await setBackground(lastImage);
 status((added?'已放入 '+added+' 个素材，点击「加入故事」就能使用。':'')+(errors.length?errors.join(' '):''),!!errors.length);
}
async function setBackground(id){if(busy())return;editStart();state.loading=true;lock();try{const bg=id?await assetFor(id):null;if(bg&&bg.kind!=='image'){bg.release();throw new Error('背景仅支持静态图片。');}current().backgroundAsset?.release();current().backgroundAsset=bg;current().backgroundId=id||null;changed();redraw();}catch(e){status(e.message,true);}finally{state.loading=false;lock();}}
async function setMusic(id){if(busy())return;stop();state.loading=true;lock();try{await mixer.setMusic(rows.find(r=>r.id===id)||null);state.musicId=id;changed();status(id?'这段原声会从头贯穿全片并循环播放。':'已恢复仅使用各场景原声。');}catch(e){state.musicId='';mixer.clearMusic();status(e.message,true);}finally{state.loading=false;lock();choiceLists();}}
async function duplicate(){if(busy())return;stop();state.loading=true;lock();let s;try{const old=current(),{asset,backgroundAsset,...copy}=old;s={...copy,id:crypto.randomUUID(),asset:await assetFor(old.assetId),backgroundAsset:null};if(old.backgroundId)s.backgroundAsset=await assetFor(old.backgroundId);state.scenes.splice(state.selected+1,0,s);state.selected++;changed();timeline();}catch(e){if(s)releaseScene(s);status(e.message,true);}finally{state.loading=false;lock();await goTo(sceneStart(state.scenes,state.selected));}}
function reorder(delta){if(busy())return;const next=state.selected+delta;if(next<0||next>=state.scenes.length)return;stop();[state.scenes[state.selected],state.scenes[next]]=[state.scenes[next],state.scenes[state.selected]];state.selected=next;changed();timeline();void goTo(sceneStart(state.scenes,next));}
function removeScene(){if(busy()||state.scenes.length===1)return;stop();releaseScene(current());state.scenes.splice(state.selected,1);state.selected=Math.min(state.selected,state.scenes.length-1);changed();timeline();void goTo(sceneStart(state.scenes,state.selected));}
$('duplicate').onclick=()=>void duplicate();$('move-left').onclick=()=>reorder(-1);$('move-right').onclick=()=>reorder(1);$('remove-scene').onclick=removeScene;
for(const key of ['top','bottom','font','scale','animation','transition','background'])$(key).addEventListener('input',()=>{if(busy()||!current())return;editStart();current()[key]=key==='font'?Number($(key).value):key==='scale'?Number($(key).value)/100:$(key).value;changed();if(key==='top'||key==='bottom')timeline();else syncForm();redraw();});
$('scene-duration').oninput=()=>{const v=Number($('scene-duration').value);if(!Number.isFinite(v)||v<.1)return;editStart();current().duration=v;changed();timeline();void goTo(sceneStart(state.scenes,state.selected));};
$('scene-duration').onchange=()=>{const v=Number($('scene-duration').value);if(!Number.isFinite(v)||v<.1){status('场景时长至少 0.1 秒，请输入有效数字。',true);syncForm();}};
for(const[id,key]of[['trim-start','trimStart'],['trim-end','trimEnd']])$(id).onchange=()=>{const s=current(),v=Number($(id).value),end=s.asset.duration;const valid=Number.isFinite(v)&&v>=0&&v<=end&&(key==='trimStart'?v<s.trimEnd:v>s.trimStart);if(!valid){status('素材起点必须小于终点，且都在原素材时长内。',true);syncForm();return;}editStart();s[key]=v;changed();syncForm();void goTo(sceneStart(state.scenes,state.selected));};
$('match-duration').onclick=()=>{editStart();current().duration=Math.max(.1,current().trimEnd-current().trimStart);changed();timeline();void goTo(sceneStart(state.scenes,state.selected));};
for(const[id,key]of[['loop','loop'],['flip','flip'],['chroma','chroma'],['original-sound','originalSound']])$(id).onchange=()=>{editStart();current()[key]=$(id).checked;changed();redraw();};
for(const[id,key]of[['chroma-strength','chromaStrength'],['volume','volume']])$(id).oninput=()=>{editStart();current()[key]=Number($(id).value)/(key==='volume'?100:1);changed();syncForm();redraw();};
$('music-volume').oninput=()=>{stop();state.musicVolume=Number($('music-volume').value)/100;changed();syncForm();};
document.querySelectorAll('[data-style]').forEach(b=>b.onclick=()=>{editStart();current().style=b.dataset.style;changed();syncForm();redraw();});
document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{editStart();state.target=b.dataset.target;syncForm();redraw();});
document.querySelectorAll('[data-ratio]').forEach(b=>b.onclick=()=>{stop();state.ratio=b.dataset.ratio;resize();changed();redraw();});
$('center').onclick=()=>{editStart();const s=current();if(state.target==='media'){s.x=s.y=.5;s.scale=1;}else{s[state.target+'X']=.5;s[state.target+'Y']=state.target==='top'?.1:.86;}changed();syncForm();redraw();};
$('upload').onchange=()=>void importFiles([...$('upload').files]);$('folder').onchange=()=>void importFiles([...$('folder').files]);$('background-upload').onchange=()=>void importFiles([...$('background-upload').files],true);
$('background-image').onchange=()=>void setBackground($('background-image').value);$('music').onchange=()=>void setMusic($('music').value);$('search').oninput=library;
const zone=$('dropzone');['dragenter','dragover'].forEach(e=>zone.addEventListener(e,event=>{event.preventDefault();zone.classList.add('over');}));['dragleave','drop'].forEach(e=>zone.addEventListener(e,event=>{event.preventDefault();zone.classList.remove('over');}));zone.addEventListener('drop',e=>void importFiles([...e.dataTransfer.files]));
$('scrub').oninput=()=>{if(!busy())void goTo(Number($('scrub').value));};$('restart').onclick=()=>void goTo(0);
function position(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};}
function move(dx,dy){const s=current(),target=state.target;if(target==='media'){s.x=clamp(s.x+dx,-.5,1.5);s.y=clamp(s.y+dy,-.5,1.5);}else{s[target+'X']=clamp(s[target+'X']+dx,.05,.95);s[target+'Y']=clamp(s[target+'Y']+dy,.03,.95);}invalidate();redraw();}
canvas.onpointerdown=e=>{if(busy()||!current())return;stop();const at=timelineAt(state.time,state.duration,state.scenes);state.selected=at.index;if(at.progress){selectScene(at.index);return;}const p=position(e),x=p.x*canvas.width,y=p.y*canvas.height;
 state.target=['bottom','top'].find(key=>{if(!current()[key])return false;const b=textLayout(renderer.ctx,current(),key,canvas.width,canvas.height).bounds;return x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h;})||'media';syncForm();drag=p;canvas.setPointerCapture(e.pointerId);canvas.focus();};
canvas.onpointermove=e=>{if(!drag||busy())return;const p=position(e);move(p.x-drag.x,p.y-drag.y);drag=p;};
canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>{if(drag)persist();drag=null;};
canvas.addEventListener('wheel',e=>{if(busy()||!current()||state.target!=='media')return;e.preventDefault();editStart();current().scale=clamp(current().scale-e.deltaY*.001,.1,4);changed();syncForm();redraw();},{passive:false});
canvas.onkeydown=e=>{if(busy()||!current())return;const d=e.shiftKey?.03:.005,keys={ArrowLeft:[-d,0],ArrowRight:[d,0],ArrowUp:[0,-d],ArrowDown:[0,d]};if(keys[e.key]){e.preventDefault();editStart();move(...keys[e.key]);persist();}};
async function play(){
 if(state.exporting){cancelExport?.();return;}if(state.playing)return stop();if(busy()||!current())return;
 if(state.time>=state.duration-.01)state.time=0;const token=++epoch;
 try{await mixer.init();await prepare(state.time);if(token!==epoch||busy())return;await mixer.prepare(state,state.time);if(token!==epoch||busy()){mixer.pause(state.scenes);return;}state.playing=true;const start=performance.now()-state.time*1000;$('play').textContent='Ⅱ';$('play').setAttribute('aria-label','暂停整片');
 const tick=now=>{if(!state.playing)return;state.time=Math.min(state.duration,(now-start)/1000);mixer.sync(state,state.time);redraw();if(state.time>=state.duration){stop();return;}raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);
 }catch(e){stop();status(e.message,true);}
}
$('play').onclick=()=>void play();
async function exportVideo(){
 if(busy()||!current())return;const mime=chooseWebmType();if(!mime||!canvas.captureStream)return status('此浏览器不能导出 WebM，请用桌面 Chrome / Edge / Firefox。',true);
 stop();$('result').pause();state.exporting=true;lock();$('export').textContent='猫猫正在演出…';let stream,recorder,chunks=[],canceled=false,hidden=false,failure=null;
 cancelExport=()=>{canceled=true;};const onHidden=()=>{if(document.hidden){hidden=true;cancelExport?.();}};document.addEventListener('visibilitychange',onHidden);
 try{await mixer.init();await document.fonts.ready;await Promise.all(state.scenes.map(s=>seekVideo(s.asset,s.trimStart)));if(canceled)return;
 state.time=0;redraw();stream=canvas.captureStream(30);const audioTrack=mixer.destination.stream.getAudioTracks()[0].clone();stream.addTrack(audioTrack);
 recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4_000_000,audioBitsPerSecond:128000});
 const finished=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('录制失败。'));});
 await mixer.prepare(state,0);if(canceled){mixer.pause(state.scenes);return;}recorder.start(500);const start=performance.now();mixer.sync(state,0);
 const playback=new Promise(resolve=>{let ended=false;const finish=()=>{if(ended)return;ended=true;cancelAnimationFrame(raf);mixer.pause(state.scenes);if(recorder.state!=='inactive')recorder.stop();resolve();};cancelExport=()=>{canceled=true;finish();};
 const tick=now=>{try{state.time=Math.min(state.duration,(now-start)/1000);mixer.sync(state,state.time);redraw();status('猫猫正在演出… '+Math.round(state.time/state.duration*100)+'% · '+labelTime(state.time)+' / '+labelTime(state.duration)+'（点 ■ 取消）');if(state.time>=state.duration)finish();else raf=requestAnimationFrame(tick);}catch(e){failure=e;finish();}};raf=requestAnimationFrame(tick);if(document.hidden){hidden=true;cancelExport();}});
 await Promise.all([playback,finished]);if(failure)throw failure;if(canceled)return;
 let blob=new Blob(chunks,{type:mime});if(blob.size<1000)throw new Error('录制不完整，请重试。');status('正在整理成片与时长信息…');blob=await window.ysFixWebmDuration(blob,state.duration*1000,{logger:false});
 if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=URL.createObjectURL(blob);$('result').src=outputUrl;$('download').href=outputUrl;$('download').download='完整猫片-'+state.ratio.replace(':','x')+'.webm';$('download-area').hidden=false;status('猫片完成！'+labelTime(state.duration)+' · '+canvas.width+' × '+canvas.height+' · '+(blob.size/1024/1024).toFixed(1)+' MB · 含声音轨。');
 }catch(e){if(recorder&&recorder.state!=='inactive')recorder.stop();status(e.message||'导出失败，请重试。',true);}
 finally{cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());mixer.pause(state.scenes);document.removeEventListener('visibilitychange',onHidden);state.exporting=false;cancelExport=null;lock();$('export').innerHTML='↗ 导出完整猫片 <span>WebM + 原声</span>';$('play').textContent='▶';$('play').setAttribute('aria-label','播放整片');if(canceled)status(hidden?'导出已取消：保持页面在前台后重新导出。':'已取消导出，可以继续编辑故事。');}
}
$('export').onclick=()=>void exportVideo();
const sources=[['完整素材合集','BV1JNrxBgEdo'],['15 款香蕉猫','BV1EukFBvEF2'],['猫 / 狗绿幕','BV1PYcmzFEDd'],['oiiai 旋转猫','BV1AvLizFEPn'],['委屈 / 哭泣猫','BV1J7T4z3Ei5'],['震惊大叫香蕉猫','BV1iWt1zrEjF']];
[['夸克：热门常用猫 Meme · 218 项','https://pan.quark.cn/s/9e1bcf133e40#/list/share/1cfe24756b124b6ca5190cfdba1b78b1'],['夸克：完整素材包','https://pan.quark.cn/s/9e1bcf133e40'],...sources.map(([name,bv])=>['B站：'+name,'https://www.bilibili.com/video/'+bv])].forEach(([name,url])=>{const a=document.createElement('a');a.href=url;a.textContent=name+' ↗';a.target='_blank';a.rel='noopener';$('sources').append(a);});
lock();
try{
 persistent=await openStore();rows=[{id:'sample',name:'示例猫猫',kind:'image',tags:'猫 占位 示例',url:'./assets/sample-cat.jpg'},...await listAssets()];library();choiceLists();
 const draft=await loadDraft();
 if(draft?.version===2){state.ratio=dimensions[draft.ratio]?draft.ratio:'9:16';state.musicVolume=clamp(Number.isFinite(Number(draft.musicVolume))?Number(draft.musicVolume):.6,0,1);let missing=0;
 for(const saved of draft.scenes){try{const asset=await assetFor(saved.assetId);const s={...createScene(asset),...saved,asset,backgroundAsset:null};if(s.backgroundId)s.backgroundAsset=await assetFor(s.backgroundId);state.scenes.push(s);}catch{missing++;}}
 state.selected=Math.min(draft.selected||0,Math.max(0,state.scenes.length-1));if(draft.musicId&&rows.some(r=>r.id===draft.musicId)){try{await mixer.setMusic(rows.find(r=>r.id===draft.musicId));state.musicId=draft.musicId;}catch{}}
 if(missing)status(missing+' 个场景的素材缺失，请重新导入。',true);
 }
 if(!state.scenes.length){const s=createScene(await assetFor('sample'));s.assetId='sample';state.scenes.push(s);}
 state.duration=totalDuration(state.scenes);$('scrub').max=state.duration;resize();timeline();ready=true;persist();status(draft?'猫片草稿已恢复，继续你的故事吧。':'素材库就位！上传后点击「加入故事」，可剪完整猫片。');
}catch(e){status('素材库暂时无法读取：'+e.message,true);}finally{state.loading=false;lock();if(current())await goTo(sceneStart(state.scenes,state.selected));}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!state.exporting)stop();});
window.addEventListener('pagehide',()=>{cancelExport?.();stop();if(ready)void saveDraft(snapshot());state.scenes.forEach(releaseScene);mixer.clearMusic();rows.forEach(r=>{if(r.thumbUrl?.startsWith('blob:'))URL.revokeObjectURL(r.thumbUrl);});if(outputUrl)URL.revokeObjectURL(outputUrl);});
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 const register=t=>{try{Promise.resolve(document.modelContext.registerTool(t,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
 register({name:'read_meme_project',description:'读取当前猫片场景、时长、字幕与原声设置。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>snapshot()});
 register({name:'configure_meme_captions',description:'设置指定场景的上下字幕，并更新画布，不导出或上传。',inputSchema:{type:'object',properties:{index:{type:'integer',minimum:0},top:{type:'string',maxLength:160},bottom:{type:'string',maxLength:160}},required:['index','top','bottom'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){if(busy())throw new Error('请等待当前处理完成。');if(!input||!Number.isInteger(input.index)||!state.scenes[input.index]||typeof input.top!=='string'||typeof input.bottom!=='string'||input.top.length>160||input.bottom.length>160||Object.keys(input).some(k=>!['index','top','bottom'].includes(k)))throw new Error('无效的场景或字幕。');stop();state.selected=input.index;current().top=input.top;current().bottom=input.bottom;changed();timeline();await goTo(sceneStart(state.scenes,input.index));return{index:input.index,top:current().top,bottom:current().bottom};}});
}
