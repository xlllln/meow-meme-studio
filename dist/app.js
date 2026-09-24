import { dimensions, clamp, createCaption, createCat, createScene, loadAsset, timelineAt, sceneStart, totalDuration, sourceTime, captionLayout, mediaBounds, Renderer, seekVideo, chooseWebmType } from './engine.js';
import { AudioMixer } from './audio.js';
import { openStore, listAssets, putAsset, deleteAsset, saveDraft, loadDraft } from './storage.js';
const $=id=>document.getElementById(id);
const state={scenes:[],selected:0,selectedCat:0,selectedCaption:0,ratio:'9:16',duration:4,target:'media',time:0,playing:false,exporting:false,loading:true,musicId:'',musicVolume:.6,catPage:0,catFilter:'all'};
const canvas=$('canvas'),renderer=new Renderer(canvas),mixer=new AudioMixer();
let rows=[],raf=0,epoch=0,scrubEpoch=0,outputUrl=null,drag=null,saveTimer=null,ready=false,persistent=false,cancelExport=null;
const current=()=>state.scenes[state.selected];
const cat=()=>current()?.cats[state.selectedCat];
const caption=()=>current()?.captions?.[state.selectedCaption]||null;
const busy=()=>state.loading||state.exporting;
const labelTime=t=>{const v=Math.max(0,t),m=Math.floor(v/60),s=Math.floor(v%60);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');};
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function lock(){document.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=busy());if(state.exporting){$('play').disabled=false;$('play').textContent='■';$('play').setAttribute('aria-label','取消导出');}if(!busy())syncForm();}
function stop(){epoch++;cancelAnimationFrame(raf);state.playing=false;mixer.pause(state.scenes);if(!state.exporting){$('play').textContent='▶';$('play').setAttribute('aria-label','播放整片');}}
function invalidate(){$('download-area').hidden=true;$('result').pause();}
function snapshot(){return{version:5,ratio:state.ratio,selected:state.selected,selectedCat:state.selectedCat,selectedCaption:state.selectedCaption,musicId:state.musicId,musicVolume:state.musicVolume,scenes:state.scenes.map(({backgroundAsset,...s})=>({...s,cats:s.cats.map(({asset,...layer})=>layer)}))};}
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
function captionList(){
 const s=current(),container=$('caption-list');container.replaceChildren();
 state.selectedCaption=Math.min(state.selectedCaption,Math.max(0,(s.captions?.length||0)-1));
 for(const [i,item] of (s.captions||[]).entries()){
  const b=document.createElement('button'),title=document.createElement('strong'),time=document.createElement('small');
  title.textContent=(i+1)+'. '+(item.text||'空白对白');time.textContent=Number(item.start.toFixed(1))+'—'+Number(item.end.toFixed(1))+' 秒';b.append(title,time);
  b.classList.toggle('active',i===state.selectedCaption);b.onclick=()=>{if(busy())return;state.selectedCaption=i;state.target='caption:'+item.id;syncForm();persist();};container.append(b);
 }
 const selected=caption();$('caption-editor').hidden=!selected;
 if(selected){$('caption-text').value=selected.text;$('caption-start').value=selected.start;$('caption-end').value=selected.end;$('caption-font').value=selected.font;$('caption-font-out').value=selected.font;document.querySelectorAll('[data-caption-style]').forEach(el=>el.classList.toggle('active',el.dataset.captionStyle===selected.style));}
}
function syncForm(){
 const s=current(),c=cat();if(!s||!c)return;
 for(const key of ['transition','background'])$(key).value=s[key];
 $('scene-duration').value=s.duration;$('trim-start').value=c.trimStart;$('trim-end').value=c.trimEnd;
 $('scale').value=Math.round(c.scale*100);$('scale-out').value=Math.round(c.scale*100)+'%';$('animation').value=c.animation;
 $('loop').checked=c.loop;$('flip').checked=c.flip;$('chroma').checked=c.chroma;$('chroma-strength').value=c.chromaStrength;$('chroma-out').value=c.chromaStrength;$('autocrop').checked=c.autoCrop!==false;
 const crop=c.crop||c.asset.autoCrop||{},cropY=Math.round(((crop.top||0)+(crop.bottom||0))*100);$('crop-note').textContent=cropY?'已自动裁掉上下约 '+cropY+'% 的黑边':'未检测到需要裁切的上下黑边';
 $('original-sound').checked=c.originalSound;$('volume').value=Math.round(c.volume*100);$('volume-out').value=Math.round(c.volume*100)+'%';
 $('background-image').value=s.backgroundId||'';$('music').value=state.musicId;$('music-volume').value=Math.round(state.musicVolume*100);$('music-volume-out').value=Math.round(state.musicVolume*100)+'%';
 $('selected-label').textContent='场景 '+String(state.selected+1).padStart(2,'0');$('asset-name').textContent='选中：'+c.asset.name;
 $('trim-fields').hidden=c.asset.kind==='image';$('clip-sound').hidden=c.asset.kind!=='video';
 document.querySelectorAll('[data-scene]').forEach(el=>el.classList.toggle('active',Number(el.dataset.scene)===state.selected));
 layerList();captionList();
 if(!busy()){$('transition').disabled=state.selected===state.scenes.length-1;$('move-left').disabled=state.selected===0;$('move-right').disabled=state.selected===state.scenes.length-1;$('remove-scene').disabled=state.scenes.length===1;$('layer-up').disabled=state.selectedCat===s.cats.length-1;$('layer-down').disabled=state.selectedCat===0;$('layer-remove').disabled=s.cats.length===1;}
}
function selectScene(index){if(busy())return;state.selected=index;state.selectedCat=Math.min(state.selectedCat,current().cats.length-1);state.target='media';syncForm();persist();void goTo(sceneStart(state.scenes,index));}
function timeline(){$('timeline').replaceChildren();let offset=0;state.scenes.forEach((s,i)=>{const b=document.createElement('button');b.dataset.scene=i;b.onclick=()=>selectScene(i);b.style.flexGrow=Math.max(.5,Math.min(s.duration,30));const title=document.createElement('strong');title.textContent=(i+1)+'. '+(s.captions?.find(c=>c.text)?.text||s.cats[0]?.asset.name||'猫猫同台');const time=document.createElement('small');time.textContent=labelTime(offset)+'—'+labelTime(offset+s.duration)+' · '+Number(s.duration.toFixed(2))+' s · '+s.cats.length+' 只猫 · '+(s.captions?.length||0)+' 句';b.append(title,time);$('timeline').append(b);offset+=s.duration;});$('project-length').textContent=state.scenes.length+' 个场景 · '+labelTime(state.duration)+'（'+Number(state.duration.toFixed(2))+' 秒）';syncForm();}
function storedRow(row){const{thumbUrl,...record}=row;return record;}
function thumbUrl(row){return row.thumbUrl||(row.thumbUrl=row.file?URL.createObjectURL(row.file):row.url);}
const filterRules={emotion:/笑|开心|happy|哭|委屈|愤怒|生气|震惊|惊吓|疑惑|害羞|忧|呕吐|紧张|尖叫|大叫|怒吼|严肃|呆滞|瞌睡|昏睡/i,action:/跳舞|跑步|摇|旋转|开车|敲|吃|喝|打电话|工作|按摩|唱歌|吹口哨|举手|走路|自拍|亲亲|求饶|打哈欠|啃|骑摩托|磨指甲/i,role:/香蕉猫|huh|doge|企鹅|山羊|仓鼠|鼠鼠|巴哥|柴犬|土拨鼠|痞老板|cheems/i,sound:/有声|唱歌|叫|声音|音乐|歌/i,silent:/无声/i,green:/绿幕|green.?screen/i};
function inferredTags(name=''){return Object.entries(filterRules).filter(([,rule])=>rule.test(name)).map(([key])=>key);}
function normalizedName(name=''){return name.replace(/\.[^.]+$/,'').replace(/\(1\)$/,'').replace(/【高清(?:无水印)?】/g,'').trim().toLowerCase();}
function friendlyBackgroundName(name=''){
 const extension=(name.match(/\.[^.]+$/)||[''])[0],base=name.slice(0,name.length-extension.length).replace(/^AI[-_\s]*/i,'').trim();
 const aliases={'教室':'学校教室','卧室夜晚':'夜晚卧室','学校厕所':'学校卫生间','学校食堂':'学校食堂'};
 return (aliases[base]||base||'场景背景')+extension;
}
function fingerprint(file){return normalizedName(file.name)+'|'+file.size;}
function kindForFile(file){if(file.type.startsWith('audio/'))return'audio';if(file.type==='image/gif')return'gif';if(file.type.startsWith('image/'))return'image';if(file.type.startsWith('video/')||/\.mp4$/i.test(file.name))return'video';return null;}
function choiceLists(){const choices=[['background-image','使用纯色背景',rows.filter(r=>r.category==='background')],['music','只用各场景原声',rows.filter(r=>r.category==='cat'&&(r.kind==='video'||r.kind==='audio'))]];for(const[id,empty,items]of choices){const el=$(id);el.replaceChildren(new Option(empty,''));items.forEach(row=>el.add(new Option(row.name,row.id)));}syncForm();}
function library(){
 for(const category of ['cat','background']){
  const container=$(category==='cat'?'cat-library':'background-library'),query=$(category==='cat'?'cat-search':'background-search').value.toLowerCase();let items=rows.filter(r=>r.category===category);
  if(category==='cat'&&state.catFilter!=='all')items=items.filter(r=>inferredTags(r.name+' '+(r.tags||'')).includes(state.catFilter));
  $(category==='cat'?'cat-count':'background-count').textContent=items.length+(category==='cat'?' 个猫素材':' 张背景');
  items=items.filter(row=>(row.name+' '+(row.tags||'')).toLowerCase().includes(query));
  const pageSize=category==='cat'?24:30,totalPages=Math.max(1,Math.ceil(items.length/pageSize));if(category==='cat')state.catPage=Math.min(state.catPage,totalPages-1);const visible=category==='cat'?items.slice(state.catPage*pageSize,(state.catPage+1)*pageSize):items;
  container.replaceChildren();let found=0;
  for(const row of visible){found++;
   const item=document.createElement('article');item.className='library-item';
   const canThumb=row.file||row.url,visual=document.createElement(row.kind==='audio'||!canThumb?'span':row.kind==='video'?'video':'img');visual.className='library-thumb';if(row.kind==='audio'||!canThumb)visual.textContent=row.kind==='audio'?'♫':'▶';else{visual.src=thumbUrl(row);if(row.kind==='video'){visual.muted=true;visual.preload='metadata';}}
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
  if(category==='cat'&&items.length){$('cat-page').textContent=`第 ${state.catPage+1} / ${totalPages} 页`;$('cat-prev').disabled=state.catPage===0;$('cat-next').disabled=state.catPage>=totalPages-1;$('cat-pager').hidden=totalPages<=1;}
 }
}
async function assetFor(id){const row=rows.find(r=>r.id===id);if(!row)throw new Error('找不到原素材，请重新导入。');let source=row.file||row.url;if(!source&&row.handle){try{source=await row.handle.getFile();}catch{throw new Error('需要重新关联本地热门猫文件夹。');}}if(!source)throw new Error('找不到原素材，请重新导入。');return loadAsset(source,row.name);}
async function insertCat(id,mode){
 if(busy())return;const row=rows.find(r=>r.id===id);if(!row||row.category!=='cat'||row.kind==='audio')return;stop();state.loading=true;lock();
 try{const asset=await assetFor(id),newCat=createCat(asset,id);newCat.chroma=asset.autoChroma||/绿幕|green.?screen/i.test(asset.name);newCat.chromaStrength=100;
  if(mode==='new'){const s=createScene(asset,state.scenes.length);s.cats=[newCat];state.scenes.push(s);state.selected=state.scenes.length-1;state.selectedCat=0;}
  else if(mode==='replace'){const old=cat();for(const key of ['x','y','scale','flip','animation','volume','originalSound'])newCat[key]=old[key];current().cats[state.selectedCat]=newCat;releaseCat(old);}
  else{const n=current().cats.length;newCat.x=n%2?.68:.32;newCat.y=n>2?.66:.5;newCat.scale=.7;current().cats.push(newCat);state.selectedCat=current().cats.length-1;}
  changed();timeline();status(mode==='new'?'新的一幕已加入故事。':mode==='replace'?'已替换选中的猫猫。':'猫猫已加入本幕；拖动画布可安排它的位置。');
 }catch(e){status(e.message,true);}finally{state.loading=false;lock();if(current())await goTo(sceneStart(state.scenes,state.selected));}
}
async function audioMetadata(file){const a=document.createElement('audio'),url=URL.createObjectURL(file);a.src=url;try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('音频读取超时。')),15000);a.onloadedmetadata=()=>{clearTimeout(timer);Number.isFinite(a.duration)&&a.duration>0?resolve(a.duration):reject(new Error('音频时长无效。'));};a.onerror=()=>{clearTimeout(timer);reject(new Error('浏览器无法读取该音频。'));};a.load();});}finally{a.removeAttribute('src');a.load();URL.revokeObjectURL(url);}}
async function importFiles(files,category){
 if(busy())return;stop();state.loading=true;lock();let added=0,skipped=0,errors=[];const known=new Set(rows.filter(r=>r.file).map(r=>fingerprint(r.file)));
 try{for(const file of files){if(file.size>200*1024*1024){errors.push(file.name+' 超过 200 MB。');continue;}status('正在整理 '+file.name+'…');try{
  const key=fingerprint(file);if(known.has(key)){skipped++;continue;}
  let kind,duration=0;if(file.type.startsWith('audio/')){if(category==='background')throw new Error('背景请选择静态图片。');kind='audio';duration=await audioMetadata(file);}else{const asset=await loadAsset(file);kind=asset.kind;duration=asset.duration||0;asset.release();}
  if(category==='background'&&kind!=='image')throw new Error('背景请选择 JPG / PNG / WebP 静态图片。');
   const tags=[file.webkitRelativePath?.split('/').slice(0,-1).join(' ')||'',...inferredTags(file.name)].filter(Boolean).join(' '),row={id:crypto.randomUUID(),file,name:category==='background'?friendlyBackgroundName(file.name):file.name,size:file.size,kind,duration,category,tags};await putAsset(row);rows.push(row);known.add(key);added++;
 }catch(e){errors.push(file.name+'：'+e.message);}}}
 finally{state.loading=false;library();choiceLists();lock();for(const id of ['cat-upload','cat-folder','background-upload','background-folder'])$(id).value='';}
 status((added?'已放入 '+added+' 个'+(category==='background'?'背景':'猫素材')+'。':'')+(skipped?' 已跳过 '+skipped+' 个重复文件。':'')+(errors.length?errors.join(' '):''),!!errors.length);
}
async function linkedFiles(directory,path=''){
 const result=[];for await(const handle of directory.values()){if(handle.kind==='directory')result.push(...await linkedFiles(handle,path+handle.name+'/'));else result.push({handle,path});}return result;
}
async function linkCatFolder(){
 if(busy())return;if(!window.showDirectoryPicker)return status('当前浏览器不支持关联文件夹，请用上面的“批量导入”按钮。',true);
 stop();state.loading=true;lock();let added=0,skipped=0,unsupported=0;
 try{const directory=await showDirectoryPicker({mode:'read'});const entries=await linkedFiles(directory),known=new Set(rows.map(r=>r.file?fingerprint(r.file):r.fingerprint).filter(Boolean));
  await navigator.storage?.persist?.();
  for(let i=0;i<entries.length;i++){const {handle,path}=entries[i],file=await handle.getFile(),kind=kindForFile(file);status(`正在关联 ${i+1} / ${entries.length}：${file.name}`);if(!kind){unsupported++;continue;}if(file.size>220*1024*1024){unsupported++;continue;}const key=fingerprint(file);if(known.has(key)){skipped++;continue;}const tags=[path.replace(/\/$/,''),...inferredTags(file.name)].filter(Boolean).join(' '),row={id:crypto.randomUUID(),handle,fingerprint:key,name:file.name,size:file.size,kind,duration:0,category:'cat',tags};await putAsset(row);rows.push(row);known.add(key);added++;}
  state.catPage=0;library();choiceLists();status(`热门猫窝已关联：新增 ${added} 个，跳过 ${skipped} 个重复文件${unsupported?'，忽略 '+unsupported+' 个不支持文件':''}。素材继续保存在本地文件夹，不会复制 3.8 GB 到浏览器。`);
 }catch(e){if(e?.name!=='AbortError')status('关联文件夹失败：'+e.message,true);}
 finally{state.loading=false;lock();}
}
async function setBackground(id){if(busy())return;const row=rows.find(r=>r.id===id);if(id&&row?.category!=='background')return status('请选择背景素材区的图片。',true);editStart();state.loading=true;lock();try{const bg=id?await assetFor(id):null;if(bg&&bg.kind!=='image'){bg.release();throw new Error('背景仅支持静态图片。');}current().backgroundAsset?.release();current().backgroundAsset=bg;current().backgroundId=id||null;changed();redraw();status(id?'实景背景已铺在这一幕的最下层。':'已改用纯色背景。');}catch(e){status(e.message,true);}finally{state.loading=false;lock();}}
async function setMusic(id){if(busy())return;stop();state.loading=true;lock();try{let row=rows.find(r=>r.id===id)||null;if(row?.handle)row={...row,file:await row.handle.getFile()};await mixer.setMusic(row);state.musicId=id;changed();status(id?'这段原声会贯穿全片并循环播放。':'已恢复仅使用各猫原声。');}catch(e){state.musicId='';mixer.clearMusic();status(e.message,true);}finally{state.loading=false;lock();choiceLists();}}
async function duplicate(){if(busy())return;stop();state.loading=true;lock();let s;try{const old=current();s={...old,id:crypto.randomUUID(),cats:[],captions:(old.captions||[]).map(item=>({...item,id:crypto.randomUUID()})),backgroundAsset:null};for(const c of old.cats)s.cats.push({...c,id:crypto.randomUUID(),asset:await assetFor(c.assetId)});if(old.backgroundId)s.backgroundAsset=await assetFor(old.backgroundId);state.scenes.splice(state.selected+1,0,s);state.selected++;state.selectedCaption=0;changed();timeline();}catch(e){if(s)releaseScene(s);status(e.message,true);}finally{state.loading=false;lock();await goTo(sceneStart(state.scenes,state.selected));}}
function reorder(delta){if(busy())return;const next=state.selected+delta;if(next<0||next>=state.scenes.length)return;stop();[state.scenes[state.selected],state.scenes[next]]=[state.scenes[next],state.scenes[state.selected]];state.selected=next;changed();timeline();void goTo(sceneStart(state.scenes,next));}
function removeScene(){if(busy()||state.scenes.length===1)return;stop();releaseScene(current());state.scenes.splice(state.selected,1);state.selected=Math.min(state.selected,state.scenes.length-1);state.selectedCat=Math.min(state.selectedCat,current().cats.length-1);changed();timeline();void goTo(sceneStart(state.scenes,state.selected));}
function reorderCat(delta){if(busy())return;const s=current(),next=state.selectedCat+delta;if(next<0||next>=s.cats.length)return;editStart();[s.cats[state.selectedCat],s.cats[next]]=[s.cats[next],s.cats[state.selectedCat]];state.selectedCat=next;changed();syncForm();redraw();}
function removeCat(){const s=current();if(busy()||s.cats.length===1)return;editStart();releaseCat(s.cats[state.selectedCat]);s.cats.splice(state.selectedCat,1);state.selectedCat=Math.min(state.selectedCat,s.cats.length-1);changed();timeline();redraw();}
$('duplicate').onclick=()=>void duplicate();$('move-left').onclick=()=>reorder(-1);$('move-right').onclick=()=>reorder(1);$('remove-scene').onclick=removeScene;$('layer-up').onclick=()=>reorderCat(1);$('layer-down').onclick=()=>reorderCat(-1);$('layer-remove').onclick=removeCat;
for(const key of ['transition','background'])$(key).addEventListener('input',()=>{if(busy()||!current())return;editStart();current()[key]=$(key).value;changed();syncForm();redraw();});
for(const key of ['scale','animation'])$(key).addEventListener('input',()=>{if(busy()||!cat())return;editStart();cat()[key]=key==='scale'?Number($(key).value)/100:$(key).value;changed();syncForm();redraw();});
$('scene-duration').oninput=()=>{const v=Number($('scene-duration').value);if(!Number.isFinite(v)||v<.1)return;editStart();const s=current(),old=s.duration;s.duration=v;for(const item of s.captions||[]){if(Math.abs(item.end-old)<.02)item.end=v;else item.end=Math.min(item.end,v);item.start=Math.min(item.start,Math.max(0,v-.1));}changed();timeline();void goTo(sceneStart(state.scenes,state.selected));};
$('scene-duration').onchange=()=>{const v=Number($('scene-duration').value);if(!Number.isFinite(v)||v<.1){status('场景时长至少 0.1 秒。',true);syncForm();}};
for(const[id,key]of[['trim-start','trimStart'],['trim-end','trimEnd']])$(id).onchange=()=>{const c=cat(),v=Number($(id).value),end=c.asset.duration;const valid=Number.isFinite(v)&&v>=0&&v<=end&&(key==='trimStart'?v<c.trimEnd:v>c.trimStart);if(!valid){status('素材起点必须小于终点，且都在原素材时长内。',true);syncForm();return;}editStart();c[key]=v;changed();syncForm();void goTo(sceneStart(state.scenes,state.selected));};
$('match-duration').onclick=()=>{editStart();current().duration=Math.max(.1,cat().trimEnd-cat().trimStart);changed();timeline();void goTo(sceneStart(state.scenes,state.selected));};
for(const[id,key]of[['loop','loop'],['flip','flip'],['chroma','chroma'],['autocrop','autoCrop'],['original-sound','originalSound']])$(id).onchange=()=>{editStart();cat()[key]=$(id).checked;changed();syncForm();redraw();};
for(const[id,key]of[['chroma-strength','chromaStrength'],['volume','volume']])$(id).oninput=()=>{editStart();cat()[key]=Number($(id).value)/(key==='volume'?100:1);changed();syncForm();redraw();};
$('music-volume').oninput=()=>{stop();state.musicVolume=Number($('music-volume').value)/100;changed();syncForm();};
function updateCaptionTime(){const item=caption();if(!item)return;const start=Number($('caption-start').value),end=Number($('caption-end').value),duration=current().duration;if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration){status('对白时间要在本场景内，而且结束时间必须晚于出现时间。',true);syncForm();return;}editStart();item.start=start;item.end=end;changed();captionList();timeline();redraw();}
$('caption-text').oninput=()=>{const item=caption();if(busy()||!item)return;editStart();item.text=$('caption-text').value;changed();captionList();timeline();redraw();};
$('caption-start').onchange=updateCaptionTime;$('caption-end').onchange=updateCaptionTime;
$('caption-font').oninput=()=>{const item=caption();if(busy()||!item)return;editStart();item.font=Number($('caption-font').value);changed();captionList();redraw();};
document.querySelectorAll('[data-caption-style]').forEach(b=>b.onclick=()=>{const item=caption();if(!item)return;editStart();item.style=b.dataset.captionStyle;changed();syncForm();redraw();});
$('caption-add').onclick=()=>{if(busy())return;editStart();const s=current(),count=s.captions.length,item=createCaption('猫猫的新对白',{end:s.duration,x:.5,y:clamp(.2+(count%5)*.15,.12,.84)});s.captions.push(item);state.selectedCaption=s.captions.length-1;state.target='caption:'+item.id;changed();syncForm();timeline();redraw();};
$('caption-remove').onclick=()=>{const s=current(),item=caption();if(busy()||!item)return;editStart();s.captions.splice(state.selectedCaption,1);state.selectedCaption=Math.min(state.selectedCaption,Math.max(0,s.captions.length-1));state.target=s.captions.length?'caption:'+s.captions[state.selectedCaption].id:'media';changed();syncForm();timeline();redraw();};
$('caption-select').onclick=()=>{const item=caption();if(!item)return;state.target='caption:'+item.id;status('已选中这句对白，可以直接在画布上拖动。');syncForm();redraw();};
document.querySelectorAll('[data-ratio]').forEach(b=>b.onclick=()=>{stop();state.ratio=b.dataset.ratio;resize();changed();redraw();});
$('center').onclick=()=>{editStart();const c=cat(),item=caption();if(state.target==='media'){c.x=c.y=.5;c.scale=1;}else if(item){item.x=item.y=.5;}changed();syncForm();redraw();};
$('cat-upload').onchange=()=>void importFiles([...$('cat-upload').files],'cat');$('cat-folder').onchange=()=>void importFiles([...$('cat-folder').files],'cat');
$('background-upload').onchange=()=>void importFiles([...$('background-upload').files],'background');$('background-folder').onchange=()=>void importFiles([...$('background-folder').files],'background');
$('link-cat-folder').onclick=()=>void linkCatFolder();$('cat-filter').onchange=()=>{state.catFilter=$('cat-filter').value;state.catPage=0;library();};$('cat-prev').onclick=()=>{state.catPage=Math.max(0,state.catPage-1);library();};$('cat-next').onclick=()=>{state.catPage++;library();};
$('background-image').onchange=()=>void setBackground($('background-image').value);$('music').onchange=()=>void setMusic($('music').value);$('cat-search').oninput=()=>{state.catPage=0;library();};$('background-search').oninput=library;
for(const [id,category] of [['cat-dropzone','cat'],['background-dropzone','background']]){const zone=$(id);for(const event of ['dragenter','dragover'])zone.addEventListener(event,e=>{e.preventDefault();zone.classList.add('over');});for(const event of ['dragleave','drop'])zone.addEventListener(event,e=>{e.preventDefault();zone.classList.remove('over');});zone.addEventListener('drop',e=>void importFiles([...e.dataTransfer.files],category));}
$('scrub').oninput=()=>{if(!busy())void goTo(Number($('scrub').value));};$('restart').onclick=()=>void goTo(0);
function position(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};}
function move(dx,dy){const c=cat(),item=caption();if(state.target==='media'){c.x=clamp(c.x+dx,-.5,1.5);c.y=clamp(c.y+dy,-.5,1.5);}else if(item){item.x=clamp(item.x+dx,.05,.95);item.y=clamp(item.y+dy,.03,.95);}invalidate();redraw();}
canvas.onpointerdown=e=>{if(busy()||!current())return;stop();const at=timelineAt(state.time,state.duration,state.scenes);if(at.index!==state.selected){selectScene(at.index);return;}const p=position(e),x=p.x*canvas.width,y=p.y*canvas.height,s=current();
 let textIndex=-1;for(let i=(s.captions?.length||0)-1;i>=0;i--){const item=s.captions[i];if(at.local<item.start||at.local>=item.end||!item.text)continue;const b=captionLayout(renderer.ctx,item,canvas.width,canvas.height).bounds;if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){textIndex=i;break;}}
 if(textIndex>=0){state.selectedCaption=textIndex;state.target='caption:'+s.captions[textIndex].id;}else{let found=-1;for(let i=s.cats.length-1;i>=0;i--){const b=mediaBounds(s.cats[i],canvas.width,canvas.height);if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){found=i;break;}}if(found<0)return;state.selectedCat=found;state.target='media';}
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
 if([3,4,5].includes(draft?.version)){for(const s of draft.scenes){for(const c of s.cats||[])catIds.add(c.assetId);if(s.backgroundId)bgIds.add(s.backgroundId);}}
 for(const row of rows){if(row.id==='sample'||row.category)continue;row.category=row.kind==='image'&&!catIds.has(row.id)?'background':'cat';if(bgIds.has(row.id))row.category='background';if(row.kind==='image')await putAsset(storedRow(row));}
 for(const row of rows){if(row.id==='sample'||row.category!=='background')continue;const friendly=friendlyBackgroundName(row.name);if(friendly!==row.name){row.name=friendly;await putAsset(storedRow(row));}}
 library();choiceLists();
 if([2,3,4,5].includes(draft?.version)){state.ratio=dimensions[draft.ratio]?draft.ratio:'9:16';state.musicVolume=clamp(Number.isFinite(Number(draft.musicVolume))?Number(draft.musicVolume):.6,0,1);let missing=0;
   for(const saved of draft.scenes){let s;try{if(draft.version===2){const asset=await assetFor(saved.assetId);s=createScene(asset);const c=s.cats[0];for(const key of ['assetId','trimStart','trimEnd','loop','volume','originalSound','chroma','chromaStrength','flip','x','y','scale','animation'])if(saved[key]!==undefined)c[key]=saved[key];for(const key of ['id','duration','backgroundId','top','bottom','style','font','topX','topY','bottomX','bottomY','transition','background'])if(saved[key]!==undefined)s[key]=saved[key];}
    else{s={...saved,cats:[],backgroundAsset:null};for(const layer of saved.cats){const asset=await assetFor(layer.assetId),defaults=createCat(asset,layer.assetId),restored={...defaults,...layer,asset};if(asset.autoChroma&&(draft.version<4||!layer.cropVersion||layer.cropVersion<2)){restored.chroma=true;restored.chromaStrength=100;restored.autoCrop=true;restored.crop={...asset.autoCrop};restored.cropVersion=2;}s.cats.push(restored);}if(!s.cats.length)throw new Error('场景缺少猫素材');}
    if(draft.version===2)s.captions=null;if(!Array.isArray(s.captions)){s.captions=[];if(s.top)s.captions.push(createCaption(s.top,{end:s.duration,x:s.topX??.5,y:s.topY??.1,style:s.style||'meme',font:s.font||48}));if(s.bottom)s.captions.push(createCaption(s.bottom,{end:s.duration,x:s.bottomX??.5,y:s.bottomY??.86,style:s.style||'meme',font:s.font||48}));}
    s.captions=s.captions.map(item=>{const x=Number(item.x),y=Number(item.y);return createCaption(item.text||'',{...item,id:item.id||crypto.randomUUID(),start:clamp(Number(item.start)||0,0,Math.max(0,s.duration-.1)),end:clamp(Number(item.end)||s.duration,.1,s.duration),x:clamp(Number.isFinite(x)?x:.5,.05,.95),y:clamp(Number.isFinite(y)?y:.5,.03,.95),font:clamp(Number(item.font)||48,24,80),style:['meme','yellow','box'].includes(item.style)?item.style:'meme'});}).filter(item=>item.end>item.start);
    if(s.backgroundId)s.backgroundAsset=await assetFor(s.backgroundId);state.scenes.push(s);
  }catch{if(s)releaseScene(s);missing++;}}
   state.selected=Math.min(draft.selected||0,Math.max(0,state.scenes.length-1));state.selectedCat=Math.min(draft.selectedCat||0,Math.max(0,state.scenes[state.selected]?.cats.length-1||0));state.selectedCaption=Math.min(draft.selectedCaption||0,Math.max(0,(state.scenes[state.selected]?.captions?.length||1)-1));
  if(draft.musicId&&rows.some(r=>r.id===draft.musicId)){try{let musicRow=rows.find(r=>r.id===draft.musicId);if(musicRow.handle)musicRow={...musicRow,file:await musicRow.handle.getFile()};await mixer.setMusic(musicRow);state.musicId=draft.musicId;}catch{}}
  if(missing)status(missing+' 个场景的素材缺失，请重新导入。',true);
 }
 if(!state.scenes.length){const s=createScene(await assetFor('sample'));s.cats[0].assetId='sample';state.scenes.push(s);}
 state.duration=totalDuration(state.scenes);$('scrub').max=state.duration;resize();choiceLists();timeline();ready=true;persist();status(draft?'猫片草稿已恢复，多只猫可以加入同一幕。':'素材库就位！每幕可以加入多只猫。');
}catch(e){status('素材库暂时无法读取：'+e.message,true);}finally{state.loading=false;lock();if(current())await goTo(sceneStart(state.scenes,state.selected));}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!state.exporting)stop();});
window.addEventListener('pagehide',()=>{cancelExport?.();stop();if(ready)void saveDraft(snapshot());state.scenes.forEach(releaseScene);mixer.clearMusic();rows.forEach(r=>{if(r.thumbUrl?.startsWith('blob:'))URL.revokeObjectURL(r.thumbUrl);});if(outputUrl)URL.revokeObjectURL(outputUrl);});
if(document.modelContext?.registerTool){const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});const register=t=>{try{Promise.resolve(document.modelContext.registerTool(t,{signal:lifecycle.signal})).catch(()=>{});}catch{}};register({name:'read_meme_project',description:'读取当前猫片场景、猫猫图层、时长、字幕与背景设置。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>snapshot()});register({name:'configure_meme_captions',description:'快速为指定场景设置两句可自由移动的对白。',inputSchema:{type:'object',properties:{index:{type:'integer',minimum:0},top:{type:'string',maxLength:160},bottom:{type:'string',maxLength:160}},required:['index','top','bottom'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){if(busy())throw new Error('请等待当前处理完成。');if(!input||!Number.isInteger(input.index)||!state.scenes[input.index]||typeof input.top!=='string'||typeof input.bottom!=='string'||input.top.length>160||input.bottom.length>160||Object.keys(input).some(k=>!['index','top','bottom'].includes(k)))throw new Error('无效的场景或字幕。');stop();state.selected=input.index;const s=current();s.captions=[createCaption(input.top,{end:s.duration,x:.5,y:.1}),createCaption(input.bottom,{end:s.duration,x:.5,y:.86})];state.selectedCaption=0;changed();timeline();await goTo(sceneStart(state.scenes,input.index));return{index:input.index,captions:s.captions};}});}
