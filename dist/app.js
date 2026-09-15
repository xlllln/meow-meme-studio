import { dimensions, clamp, createCat, createScene, loadAsset, timelineAt, sceneStart, totalDuration, sourceTime, textLayout, mediaBounds, Renderer, seekVideo, chooseWebmType } from './engine.js';
import { AudioMixer } from './audio.js';
import { openStore, listAssets, putAsset, deleteAsset, saveDraft, loadDraft } from './storage.js';
const $=id=>document.getElementById(id);
const state={scenes:[],selected:0,selectedCat:0,ratio:'9:16',duration:4,target:'media',time:0,playing:false,exporting:false,loading:true,musicId:'',musicVolume:.6};
const canvas=$('canvas'),renderer=new Renderer(canvas),mixer=new AudioMixer();
let rows=[],raf=0,epoch=0,scrubEpoch=0,outputUrl=null,drag=null,saveTimer=null,ready=false,persistent=false,cancelExport=null;
const current=()=>state.scenes[state.selected];
const cat=()=>current()?.cats[state.selectedCat];
const busy=()=>state.loading||state.exporting;
const labelTime=t=>{const v=Math.max(0,t),m=Math.floor(v/60),s=Math.floor(v%60);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');};
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function lock(){document.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=busy());if(state.exporting){$('play').disabled=false;$('play').textContent='■';$('play').setAttribute('aria-label','取消导出');}if(!busy())syncForm();}
function stop(){epoch++;cancelAnimationFrame(raf);state.playing=false;mixer.pause(state.scenes);if(!state.exporting){$('play').textContent='▶';$('play').setAttribute('aria-label','播放整片');}}
function invalidate(){$('download-area').hidden=true;$('result').pause();}
function snapshot(){return{version:3,ratio:state.ratio,selected:state.selected,selectedCat:state.selectedCat,musicId:state.musicId,musicVolume:state.musicVolume,scenes:state.scenes.map(({backgroundAsset,...s})=>({...s,cats:s.cats.map(({asset,...layer})=>layer)}))};}
function persist(){if(!ready)return;clearTimeout(saveTimer);$('save-state').textContent=persistent?'草稿正在保存…':'仅本次页面';saveTimer=setTimeout(async()=>{try{await saveDraft(snapshot());$('save-state').textContent=persistent?'草稿已保存 · 此浏览器':'仅本次页面，关闭后不保留';}catch(e){$('save-state').textContent='草稿未保存';status(e.message,true);}},250);}
function changed(){invalidate();state.duration=totalDuration(state.scenes);$('scrub').max=state.duration;state.time=Math.min(state.time,state.duration);persist();}
function redraw(){if(!current())return;renderer.render(state,state.time);$('clock').textContent=labelTime(state.time)+' / '+labelTime(state.duration);$('scrub').value=state.time;}
function resize(){[canvas.width,canvas.height]=dimensions[state.ratio];document.querySelectorAll('[data-ratio]').forEach(el=>el.classList.toggle('active',el.dataset.ratio===state.ratio));}
async function prepare(time){const at=timelineAt(time,state.duration,state.scenes);await Promise.all(state.scenes[at.index].cats.map(c=>seekVideo(c.asset,sourceTime(c,at.local))));if(at.index+1<state.scenes.length)await Promise.all(state.scenes[at.index+1].cats.map(c=>seekVideo(c.asset,c.trimStart)));}
async function goTo(time){stop();const token=++scrubEpoch;state.time=clamp(time,0,state.duration);redraw();try{await prepare(state.time);if(token===scrubEpoch)redraw();}catch(e){status(e.message,true);}}
function editStart(){stop();if(timelineAt(state.time,state.duration,state.scenes).index!==state.selected)state.time=sceneStart(state.scenes,state.selected);}
function releaseCat(c){if(c.asset.kind==='video')mixer.detach(c.asset.element);c.asset.release();}
function releaseScene(s){s.cats.forEach(releaseCat);s.backgroundAsset?.release();}
function layerList(){const s=current();$('cat-layers').replaceChildren();$('layer-count').textContent=s.cats.length+' 只';s.cats.forEach((c,i)=>{const b=document.createElement('button');b.textContent=(i+1)+'. '+c.asset.name;const hint=document.createElement('small');hint.textContent=i===s.cats.length-1?'最上层':i===0?'猫猫最下层':'中间图层';b.append(hint);b.classList.toggle('active',i===state.selectedCat);b.onclick=()=>{if(busy())return;state.selectedCat=i;state.target='media';syncForm();persist();};$('cat-layers').append(b);});}
function syncForm(){
 const s=current(),c=cat();if(!s||!c)return;
 for(const key of ['top','bottom','font','transition','background'])$(key).value=s[key];
 $('scene-duration').value=s.duration;$('trim-start').value=c.trimStart;$('trim-end').value=c.trimEnd;
 $('scale').value=Math.round(c.scale*100);$('scale-out').value=Math.round(c.scale*100)+'%';$('font-out').value=s.font;$('animation').value=c.animation;
 $('loop').checked=c.loop;$('flip').checked=c.flip;$('chroma').checked=c.chroma;$('chroma-strength').value=c.chromaStrength;$('chroma-out').value=c.chromaStrength;
 $('original-sound').checked=c.originalSound;$('volume').value=Math.round(c.volume*100);$('volume-out').value=Math.round(c.volume*100)+'%';
 $('background-image').value=s.backgroundId||'';$('music').value=state.musicId;$('music-volume').value=Math.round(state.musicVolume*100);$('music-volume-out').value=Math.round(state.musicVolume*100)+'%';
 $('selected-label').textContent='场景 '+String(state.selected+1).padStart(2,'0');$('asset-name').textContent='选中：'+c.asset.name;
 $('trim-fields').hidden=c.asset.kind==='image';$('clip-sound').hidden=c.asset.kind!=='video';
 document.querySelectorAll('[data-style]').forEach(el=>el.classList.toggle('active',el.dataset.style===s.style));
 document.querySelectorAll('[data-target]').forEach(el=>el.classList.toggle('active',el.dataset.target===state.target));
 document.querySelectorAll('[data-scene]').forEach(el=>el.classList.toggle('active',Number(el.dataset.scene)===state.selected));
 layerList();
 if(!busy()){$('transition').disabled=state.selected===state.scenes.length-1;$('move-left').disabled=state.selected===0;$('move-right').disabled=state.selected===state.scenes.length-1;$('remove-scene').disabled=state.scenes.length===1;$('layer-up').disabled=state.selectedCat===s.cats.length-1;$('layer-down').disabled=state.selectedCat===0;$('layer-remove').disabled=s.cats.length===1;}
}
function selectScene(index){if(busy())return;state.selected=index;state.selectedCat=Math.min(state.selectedCat,current().cats.length-1);state.target='media';syncForm();persist();void goTo(sceneStart(state.scenes,index));}
function timeline(){$('timeline').replaceChildren();let offset=0;state.scenes.forEach((s,i)=>{const b=document.createElement('button');b.dataset.scene=i;b.onclick=()=>selectScene(i);b.style.flexGrow=Math.max(.5,Math.min(s.duration,30));const title=document.createElement('strong');title.textContent=(i+1)+'. '+(s.top||s.cats[0]?.asset.name||'猫猫同台');const time=document.createElement('small');time.textContent=labelTime(offset)+'—'+labelTime(offset+s.duration)+' · '+Number(s.duration.toFixed(2))+' s · '+s.cats.length+' 只猫';b.append(title,time);$('timeline').append(b);offset+=s.duration;});$('project-length').textContent=state.scenes.length+' 个场景 · '+labelTime(state.duration)+'（'+Number(state.duration.toFixed(2))+' 秒）';syncForm();}
function storedRow(row){const{thumbUrl,...record}=row;return record;}
function thumbUrl(row){return row.thumbUrl||(row.thumbUrl=row.file?URL.createObjectURL(row.file):row.url);}
function choiceLists(){const choices=[['background-image','使用纯色背景',rows.filter(r=>r.category==='background')],['music','只用各场景原声',rows.filter(r=>r.category==='cat'&&(r.kind==='video'||r.kind==='audio'))]];for(const[id,empty,items]of choices){const el=$(id);el.replaceChildren(new Option(empty,''));items.forEach(row=>el.add(new Option(row.name,row.id)));}syncForm();}
function library(){
 for(const category of ['cat','background']){
  const container=$(category==='cat'?'cat-library':'background-library'),query=$(category==='cat'?'cat-search':'background-search').value.toLowerCase(),items=rows.filter(r=>r.category===category);
  $(category==='cat'?'cat-count':'background-count').textContent=items.length+(category==='cat'?' 个猫素材':' 张背景');
  container.replaceChildren();let found=0;
  for(const row of items){if(!(row.name+' '+(row.tags||'')).toLowerCase().includes(query))continue;found++;
   const item=document.createElement('article');item.className='library-item';
   const visual=document.createElement(row.kind==='audio'?'span':row.kind==='video'?'video':'img');visual.className='library-thumb';if(row.kind==='audio')visual.textContent='♫';else{visual.src=thumbUrl(row);if(row.kind==='video'){visual.muted=true;visual.preload='metadata';}}
   const body=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small');body.className='library-copy';title.textContent=row.name;meta.textContent=({image:'图片',gif:'GIF',video:'视频',audio:'音频'}[row.kind])+(row.duration?' · '+labelTime(row.duration):'');body.append(title,meta);item.append(visual,body);
   if(row.id!=='sample'){const tags=document.createElement('input');tags.value=row.tags||'';tags.placeholder='标签：卧室 / 开心…';tags.setAttribute('aria-label',row.name+'的标签');tags.onchange=()=>{row.tags=tags.value.slice(0,120);void putAsset(storedRow(row)).catch(e=>status(e.message,true));};item.append(tags);}
   const actions=document.createElement('div');actions.className='library-actions';const action=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>{if(!busy())void fn();};actions.append(b);};
   if(category==='cat'){if(row.kind!=='audio'){action('＋ 加入本幕',()=>insertCat(row.id,'add'));action('新建一幕',()=>insertCat(row.id,'new'));action('替换选中猫',()=>insertCat(row.id,'replace'));}if(row.kind==='video'||row.kind==='audio')action('♫ 全片原声',()=>setMusic(row.id));}
   else action('设为本幕背景',()=>setBackground(row.id));
   if(row.id!=='sample'){
    if(row.kind==='image')action(category==='cat'?'移到背景区':'移到猫区',async()=>{row.category=category==='cat'?'background':'cat';try{await putAsset(storedRow(row));library();choiceLists();}catch(e){row.category=category;status(e.message,true);}});
    action('移出素材库',async()=>{if(state.scenes.some(s=>s.backgroundId===row.id||s.cats.some(c=>c.assetId===row.id))||state.musicId===row.id)return status('这份素材还在故事里使用，请先替换相应猫猫或背景。',true);try{await deleteAsset(row.id);if(row.thumbUrl?.startsWith('blob:'))URL.revokeObjectURL(row.thumbUrl);rows=rows.filter(r=>r.id!==row.id);library();choiceLists();status('素材已移出此浏览器，原始文件不受影响。');}catch(e){status(e.message,true);}});
   }
   item.append(actions);container.append(item);
  }
  if(!found){const p=document.createElement('p');p.className='small-note';p.textContent=category==='cat'?'没有找到猫猫。':'背景素材区还没有匹配的图片。';container.append(p);}
 }
}
async function assetFor(id){const row=rows.find(r=>r.id===id);if(!row)throw new Error('找不到原素材，请重新导入。');return loadAsset(row.file||row.url,row.name);}
async function insertCat(id,mode){
 if(busy())return;const row=rows.find(r=>r.id===id);if(!row||row.category!=='cat'||row.kind==='audio')return;stop();state.loading=true;lock();
 try{const asset=await assetFor(id),newCat=createCat(asset,id);newCat.chroma=/绿幕|green.?screen/i.test(asset.name);
  if(mode==='new'){const s=createScene(asset,state.scenes.length);s.cats=[newCat];state.scenes.push(s);state.selected=state.scenes.length-1;state.selectedCat=0;}
  else if(mode==='replace'){const old=cat();for(const key of ['x','y','scale','flip','chroma','chromaStrength','animation','volume','originalSound'])newCat[key]=old[key];current().cats[state.selectedCat]=newCat;releaseCat(old);}
  else{const n=current().cats.length;newCat.x=n%2?.68:.32;newCat.y=n>2?.66:.5;newCat.scale=.7;current().cats.push(newCat);state.selectedCat=current().cats.length-1;}
  changed();timeline();status(mode==='new'?'新的一幕已加入故事。':mode==='replace'?'已替换选中的猫猫。':'猫猫已加入本幕；拖动画布可安排它的位置。');
 }catch(e){status(e.message,true);}finally{state.loading=false;lock();if(current())await goTo(sceneStart(state.scenes,state.selected));}
}
async function audioMetadata(file){const a=document.createElement('audio'),url=URL.createObjectURL(file);a.src=url;try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('音频读取超时。')),15000);a.onloadedmetadata=()=>{clearTimeout(timer);Number.isFinite(a.duration)&&a.duration>0?resolve(a.duration):reject(new Error('音频时长无效。'));};a.onerror=()=>{clearTimeout(timer);reject(new Error('浏览器无法读取该音频。'));};a.load();});}finally{a.removeAttribute('src');a.load();URL.revokeObjectURL(url);}}
async function importFiles(files,category){
 if(busy())return;stop();state.loading=true;lock();let added=0,errors=[];
 try{for(const file of files){if(file.size>200*1024*1024){errors.push(file.name+' 超过 200 MB。');continue;}status('正在整理 '+file.name+'…');try{
  let kind,duration=0;if(file.type.startsWith('audio/')){if(category==='background')throw new Error('背景请选择静态图片。');kind='audio';duration=await audioMetadata(file);}else{const asset=await loadAsset(file);kind=asset.kind;duration=asset.duration||0;asset.release();}
  if(category==='background'&&kind!=='image')throw new Error('背景请选择 JPG / PNG / WebP 静态图片。');
  const row={id:crypto.randomUUID(),file,name:file.name,kind,duration,category,tags:file.webkitRelativePath?.split('/').slice(0,-1).join(' ')||''};await putAsset(row);rows.push(row);added++;
 }catch(e){errors.push(file.name+'：'+e.message);}}}
 finally{state.loading=false;library();choiceLists();lock();for(const id of ['cat-upload','cat-folder','background-upload','background-folder'])$(id).value='';}
 status((added?'已放入 '+added+' 个'+(category==='background'?'背景':'猫素材')+'。':'')+(errors.length?errors.join(' '):''),!!errors.length);
}
async function setBackground(id){if(busy())return;const row=rows.find(r=>r.id===id);if(id&&row?.category!=='background')return status('请选择背景素材区的图片。',true);editStart();state.loading=true;lock();try{const bg=id?await assetFor(id):null;if(bg&&bg.kind!=='image'){bg.release();throw new Error('背景仅支持静态图片。');}current().backgroundAsset?.release();current().backgroundAsset=bg;current().backgroundId=id||null;changed();redraw();status(id?'实景背景已铺在这一幕的最下层。':'已改用纯色背景。');}catch(e){status(e.message,true);}finally{state.loading=false;lock();}}
async function setMusic(id){if(busy())return;stop();state.loading=true;lock();try{await mixer.setMusic(rows.find(r=>r.id===id)||null);state.musicId=id;changed();status(id?'这段原声会贯穿全片并循环播放。':'已恢复仅使用各猫原声。');}catch(e){state.musicId='';mixer.clearMusic();status(e.message,true);}finally{state.loading=false;lock();choiceLists();}}
async function duplicate(){if(busy())return;stop();state.loading=true;lock();let s;try{const old=current();s={...old,id:crypto.randomUUID(),cats:[],backgroundAsset:null};for(const c of old.cats)s.cats.push({...c,id:crypto.randomUUID(),asset:await assetFor(c.assetId)});if(old.backgroundId)s.backgroundAsset=await assetFor(old.backgroundId);state.scenes.splice(state.selected+1,0,s);state.selected++;changed();timeline();}catch(e){if(s)releaseScene(s);status(e.message,true);}finally{state.loading=false;lock();await goTo(sceneStart(state.scenes,state.selected));}}
function reorder(delta){if(busy())return;const next=state.selected+delta;if(next<0||next>=state.scenes.length)return;stop();[state.scenes[state.selected],state.scenes[next]]=[state.scenes[next],state.scenes[state.selected]];state.selected=next;changed();timeline();void goTo(sceneStart(state.scenes,next));}
function removeScene(){if(busy()||state.scenes.length===1)return;stop();releaseScene(current());state.scenes.splice(state.selected,1);state.selected=Math.min(state.selected,state.scenes.length-1);state.selectedCat=Math.min(state.selectedCat,current().cats.length-1);changed();timeline();void goTo(sceneStart(state.scenes,state.selected));}
function reorderCat(delta){if(busy())return;const s=current(),next=state.selectedCat+delta;if(next<0||next>=s.cats.length)return;editStart();[s.cats[state.selectedCat],s.cats[next]]=[s.cats[next],s.cats[state.selectedCat]];state.selectedCat=next;changed();syncForm();redraw();}
function removeCat(){const s=current();if(busy()||s.cats.length===1)return;editStart();releaseCat(s.cats[state.selectedCat]);s.cats.splice(state.selectedCat,1);state.selectedCat=Math.min(state.selectedCat,s.cats.length-1);changed();timeline();redraw();}
$('duplicate').onclick=()=>void duplicate();$('move-left').onclick=()=>reorder(-1);$('move-right').onclick=()=>reorder(1);$('remove-scene').onclick=removeScene;$('layer-up').onclick=()=>reorderCat(1);$('layer-down').onclick=()=>reorderCat(-1);$('layer-remove').onclick=removeCat;
for(const key of ['top','bottom','font','transition','background'])$(key).addEventListener('input',()=>{if(busy()||!current())return;editStart();current()[key]=key==='font'?Number($(key).value):$(key).value;changed();if(key==='top'||key==='bottom')timeline();else syncForm();redraw();});
for(const key of ['scale','animation'])$(key).addEventListener('input',()=>{if(busy()||!cat())return;editStart();cat()[key]=key==='scale'?Number($(key).value)/100:$(key).value;changed();syncForm();redraw();});
$('scene-duration').oninput=()=>{const v=Number($('scene-duration').value);if(!Number.isFinite(v)||v<.1)return;editStart();current().duration=v;changed();timeline();void goTo(sceneStart(state.scenes,state.selected));};
$('scene-duration').onchange=()=>{const v=Number($('scene-duration').value);if(!Number.isFinite(v)||v<.1){status('场景时长至少 0.1 秒。',true);syncForm();}};
for(const[id,key]of[['trim-start','trimStart'],['trim-end','trimEnd']])$(id).onchange=()=>{const c=cat(),v=Number($(id).value),end=c.asset.duration;const valid=Number.isFinite(v)&&v>=0&&v<=end&&(key==='trimStart'?v<c.trimEnd:v>c.trimStart);if(!valid){status('素材起点必须小于终点，且都在原素材时长内。',true);syncForm();return;}editStart();c[key]=v;changed();syncForm();void goTo(sceneStart(state.scenes,state.selected));};
$('match-duration').onclick=()=>{editStart();current().duration=Math.max(.1,cat().trimEnd-cat().trimStart);changed();timeline();void goTo(sceneStart(state.scenes,state.selected));};
for(const[id,key]of[['loop','loop'],['flip','flip'],['chroma','chroma'],['original-sound','originalSound']])$(id).onchange=()=>{editStart();cat()[key]=$(id).checked;changed();redraw();};
for(const[id,key]of[['chroma-strength','chromaStrength'],['volume','volume']])$(id).oninput=()=>{editStart();cat()[key]=Number($(id).value)/(key==='volume'?100:1);changed();syncForm();redraw();};
$('music-volume').oninput=()=>{stop();state.musicVolume=Number($('music-volume').value)/100;changed();syncForm();};
document.querySelectorAll('[data-style]').forEach(b=>b.onclick=()=>{editStart();current().style=b.dataset.style;changed();syncForm();redraw();});
document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{editStart();state.target=b.dataset.target;syncForm();redraw();});
document.querySelectorAll('[data-ratio]').forEach(b=>b.onclick=()=>{stop();state.ratio=b.dataset.ratio;resize();changed();redraw();});
$('center').onclick=()=>{editStart();const s=current(),c=cat();if(state.target==='media'){c.x=c.y=.5;c.scale=1;}else{s[state.target+'X']=.5;s[state.target+'Y']=state.target==='top'?.1:.86;}changed();syncForm();redraw();};
$('cat-upload').onchange=()=>void importFiles([...$('cat-upload').files],'cat');$('cat-folder').onchange=()=>void importFiles([...$('cat-folder').files],'cat');
$('background-upload').onchange=()=>void importFiles([...$('background-upload').files],'background');$('background-folder').onchange=()=>void importFiles([...$('background-folder').files],'background');
$('background-image').onchange=()=>void setBackground($('background-image').value);$('music').onchange=()=>void setMusic($('music').value);$('cat-search').oninput=library;$('background-search').oninput=library;
for(const [id,category] of [['cat-dropzone','cat'],['background-dropzone','background']]){const zone=$(id);for(const event of ['dragenter','dragover'])zone.addEventListener(event,e=>{e.preventDefault();zone.classList.add('over');});for(const event of ['dragleave','drop'])zone.addEventListener(event,e=>{e.preventDefault();zone.classList.remove('over');});zone.addEventListener('drop',e=>void importFiles([...e.dataTransfer.files],category));}
$('scrub').oninput=()=>{if(!busy())void goTo(Number($('scrub').value));};$('restart').onclick=()=>void goTo(0);
function position(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};}
function move(dx,dy){const s=current(),c=cat(),target=state.target;if(target==='media'){c.x=clamp(c.x+dx,-.5,1.5);c.y=clamp(c.y+dy,-.5,1.5);}else{s[target+'X']=clamp(s[target+'X']+dx,.05,.95);s[target+'Y']=clamp(s[target+'Y']+dy,.03,.95);}invalidate();redraw();}
canvas.onpointerdown=e=>{if(busy()||!current())return;stop();const at=timelineAt(state.time,state.duration,state.scenes);if(at.index!==state.selected){selectScene(at.index);return;}const p=position(e),x=p.x*canvas.width,y=p.y*canvas.height,s=current();
 const textKey=['bottom','top'].find(key=>{if(!s[key])return false;const b=textLayout(renderer.ctx,s,key,canvas.width,canvas.height).bounds;return x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h;});
 if(textKey)state.target=textKey;else{let found=-1;for(let i=s.cats.length-1;i>=0;i--){const b=mediaBounds(s.cats[i],canvas.width,canvas.height);if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){found=i;break;}}if(found<0)return;state.selectedCat=found;state.target='media';}
 syncForm();drag=p;canvas.setPointerCapture(e.pointerId);canvas.focus();};
canvas.onpointermove=e=>{if(!drag||busy())return;const p=position(e);move(p.x-drag.x,p.y-drag.y);drag=p;};
canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>{if(drag)persist();drag=null;};
canvas.addEventListener('wheel',e=>{if(busy()||!cat()||state.target!=='media')return;e.preventDefault();editStart();cat().scale=clamp(cat().scale-e.deltaY*.001,.1,4);changed();syncForm();redraw();},{passive:false});
canvas.onkeydown=e=>{if(busy()||!cat())return;const d=e.shiftKey?.03:.005,keys={ArrowLeft:[-d,0],ArrowRight:[d,0],ArrowUp:[0,-d],ArrowDown:[0,d]};if(keys[e.key]){e.preventDefault();editStart();move(...keys[e.key]);persist();}};
async function play(){if(state.exporting){cancelExport?.();return;}if(state.playing)return stop();if(busy()||!current())return;if(state.time>=state.duration-.01)state.time=0;const token=++epoch;try{await mixer.init();await prepare(state.time);if(token!==epoch||busy())return;await mixer.prepare(state,state.time);if(token!==epoch||busy()){mixer.pause(state.scenes);return;}state.playing=true;const start=performance.now()-state.time*1000;$('play').textContent='Ⅱ';$('play').setAttribute('aria-label','暂停整片');const tick=now=>{if(!state.playing)return;state.time=Math.min(state.duration,(now-start)/1000);mixer.sync(state,state.time);redraw();if(state.time>=state.duration){stop();return;}raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);}catch(e){stop();status(e.message,true);}}
$('play').onclick=()=>void play();
async function exportVideo(){
 if(busy()||!current())return;const mime=chooseWebmType();if(!mime||!canvas.captureStream)return status('此浏览器不能导出 WebM，请用桌面 Chrome / Edge / Firefox。',true);
 stop();$('result').pause();state.exporting=true;lock();$('export').textContent='猫猫正在演出…';let stream,recorder,chunks=[],canceled=false,hidden=false,failure=null;
 cancelExport=()=>{canceled=true;};const onHidden=()=>{if(document.hidden){hidden=true;cancelExport?.();}};document.addEventListener('visibilitychange',onHidden);
 try{await mixer.init();await document.fonts.ready;await Promise.all(state.scenes.flatMap(s=>s.cats.map(c=>seekVideo(c.asset,c.trimStart))));if(canceled)return;
  state.time=0;redraw();stream=canvas.captureStream(30);const audioTrack=mixer.destination.stream.getAudioTracks()[0].clone();stream.addTrack(audioTrack);
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4_000_000,audioBitsPerSecond:128000});
  const finished=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('录制失败。'));});
  await mixer.prepare(state,0);if(canceled){mixer.pause(state.scenes);return;}recorder.start(500);const start=performance.now();mixer.sync(state,0);
  const playback=new Promise(resolve=>{let ended=false;const finish=()=>{if(ended)return;ended=true;cancelAnimationFrame(raf);mixer.pause(state.scenes);if(recorder.state!=='inactive')recorder.stop();resolve();};cancelExport=()=>{canceled=true;finish();};const tick=now=>{try{state.time=Math.min(state.duration,(now-start)/1000);mixer.sync(state,state.time);redraw();status('猫猫正在演出… '+Math.round(state.time/state.duration*100)+'% · '+labelTime(state.time)+' / '+labelTime(state.duration)+'（点 ■ 取消）');if(state.time>=state.duration)finish();else raf=requestAnimationFrame(tick);}catch(e){failure=e;finish();}};raf=requestAnimationFrame(tick);if(document.hidden){hidden=true;cancelExport();}});
  await Promise.all([playback,finished]);if(failure)throw failure;if(canceled)return;
  let blob=new Blob(chunks,{type:mime});if(blob.size<1000)throw new Error('录制不完整，请重试。');status('正在整理成片与时长信息…');blob=await window.ysFixWebmDuration(blob,state.duration*1000,{logger:false});
  if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=URL.createObjectURL(blob);$('result').src=outputUrl;$('download').href=outputUrl;$('download').download='完整猫片-'+state.ratio.replace(':','x')+'.webm';$('download-area').hidden=false;status('猫片完成！'+labelTime(state.duration)+' · '+canvas.width+' × '+canvas.height+' · '+(blob.size/1024/1024).toFixed(1)+' MB · 含声音轨。');
 }catch(e){if(recorder&&recorder.state!=='inactive')recorder.stop();status(e.message||'导出失败，请重试。',true);}
 finally{cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());mixer.pause(state.scenes);document.removeEventListener('visibilitychange',onHidden);state.exporting=false;cancelExport=null;lock();$('export').innerHTML='↗ 导出完整猫片 <span>WebM + 原声</span>';$('play').textContent='▶';$('play').setAttribute('aria-label','播放整片');if(canceled)status(hidden?'导出已取消：保持页面在前台后重新导出。':'已取消导出，可以继续编辑故事。');}
}
$('export').onclick=()=>void exportVideo();
const sources=[['完整素材合集','BV1JNrxBgEdo'],['15 款香蕉猫','BV1EukFBvEF2'],['猫 / 狗绿幕','BV1PYcmzFEDd'],['oiiai 旋转猫','BV1AvLizFEPn'],['委屈 / 哭泣猫','BV1J7T4z3Ei5'],['震惊大叫香蕉猫','BV1iWt1zrEjF']];
[['夸克：完整素材包','https://pan.quark.cn/s/9e1bcf133e40'],...sources.map(([name,bv])=>['B站：'+name,'https://www.bilibili.com/video/'+bv])].forEach(([name,url])=>{const a=document.createElement('a');a.href=url;a.textContent=name+' ↗';a.target='_blank';a.rel='noopener';$('sources').append(a);});
lock();
try{
 persistent=await openStore();rows=[{id:'sample',name:'示例猫猫',kind:'image',category:'cat',tags:'猫 占位 示例',url:'./assets/sample-cat.jpg'},...await listAssets()];
 const draft=await loadDraft();const catIds=new Set(),bgIds=new Set();
 if(draft?.version===2){for(const s of draft.scenes){catIds.add(s.assetId);if(s.backgroundId)bgIds.add(s.backgroundId);}}
 if(draft?.version===3){for(const s of draft.scenes){for(const c of s.cats||[])catIds.add(c.assetId);if(s.backgroundId)bgIds.add(s.backgroundId);}}
 for(const row of rows){if(row.id==='sample'||row.category)continue;row.category=row.kind==='image'&&!catIds.has(row.id)?'background':'cat';if(bgIds.has(row.id))row.category='background';if(row.kind==='image')await putAsset(storedRow(row));}
 library();choiceLists();
 if(draft?.version===2||draft?.version===3){state.ratio=dimensions[draft.ratio]?draft.ratio:'9:16';state.musicVolume=clamp(Number.isFinite(Number(draft.musicVolume))?Number(draft.musicVolume):.6,0,1);let missing=0;
  for(const saved of draft.scenes){let s;try{if(draft.version===2){const asset=await assetFor(saved.assetId);s=createScene(asset);const c=s.cats[0];for(const key of ['assetId','trimStart','trimEnd','loop','volume','originalSound','chroma','chromaStrength','flip','x','y','scale','animation'])if(saved[key]!==undefined)c[key]=saved[key];for(const key of ['id','duration','backgroundId','top','bottom','style','font','topX','topY','bottomX','bottomY','transition','background'])if(saved[key]!==undefined)s[key]=saved[key];}
   else{s={...saved,cats:[],backgroundAsset:null};for(const layer of saved.cats){const asset=await assetFor(layer.assetId);s.cats.push({...createCat(asset,layer.assetId),...layer,asset});}if(!s.cats.length)throw new Error('场景缺少猫素材');}
   if(s.backgroundId)s.backgroundAsset=await assetFor(s.backgroundId);state.scenes.push(s);
  }catch{if(s)releaseScene(s);missing++;}}
  state.selected=Math.min(draft.selected||0,Math.max(0,state.scenes.length-1));state.selectedCat=Math.min(draft.selectedCat||0,Math.max(0,state.scenes[state.selected]?.cats.length-1||0));
  if(draft.musicId&&rows.some(r=>r.id===draft.musicId)){try{await mixer.setMusic(rows.find(r=>r.id===draft.musicId));state.musicId=draft.musicId;}catch{}}
  if(missing)status(missing+' 个场景的素材缺失，请重新导入。',true);
 }
 if(!state.scenes.length){const s=createScene(await assetFor('sample'));s.cats[0].assetId='sample';state.scenes.push(s);}
 state.duration=totalDuration(state.scenes);$('scrub').max=state.duration;resize();choiceLists();timeline();ready=true;persist();status(draft?'猫片草稿已恢复，多只猫可以加入同一幕。':'素材库就位！每幕可以加入多只猫。');
}catch(e){status('素材库暂时无法读取：'+e.message,true);}finally{state.loading=false;lock();if(current())await goTo(sceneStart(state.scenes,state.selected));}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!state.exporting)stop();});
window.addEventListener('pagehide',()=>{cancelExport?.();stop();if(ready)void saveDraft(snapshot());state.scenes.forEach(releaseScene);mixer.clearMusic();rows.forEach(r=>{if(r.thumbUrl?.startsWith('blob:'))URL.revokeObjectURL(r.thumbUrl);});if(outputUrl)URL.revokeObjectURL(outputUrl);});
if(document.modelContext?.registerTool){const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});const register=t=>{try{Promise.resolve(document.modelContext.registerTool(t,{signal:lifecycle.signal})).catch(()=>{});}catch{}};register({name:'read_meme_project',description:'读取当前猫片场景、猫猫图层、时长、字幕与背景设置。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>snapshot()});register({name:'configure_meme_captions',description:'设置指定场景的上下字幕。',inputSchema:{type:'object',properties:{index:{type:'integer',minimum:0},top:{type:'string',maxLength:160},bottom:{type:'string',maxLength:160}},required:['index','top','bottom'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){if(busy())throw new Error('请等待当前处理完成。');if(!input||!Number.isInteger(input.index)||!state.scenes[input.index]||typeof input.top!=='string'||typeof input.bottom!=='string'||input.top.length>160||input.bottom.length>160||Object.keys(input).some(k=>!['index','top','bottom'].includes(k)))throw new Error('无效的场景或字幕。');stop();state.selected=input.index;current().top=input.top;current().bottom=input.bottom;changed();timeline();await goTo(sceneStart(state.scenes,input.index));return{index:input.index,top:current().top,bottom:current().bottom};}});}
