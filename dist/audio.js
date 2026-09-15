import { sourceTime, timelineAt } from './engine.js';
export class AudioMixer {
  constructor() { this.context=null; this.nodes=new Map(); this.music=null; this.musicNode=null; this.musicUrl=null; }
  async init() { if(!this.context){this.context=new AudioContext();this.destination=this.context.createMediaStreamDestination();} await this.context.resume(); }
  connect(element) { if(this.nodes.has(element))return this.nodes.get(element); const source=this.context.createMediaElementSource(element), gain=this.context.createGain();gain.gain.value=0;source.connect(gain);gain.connect(this.context.destination);gain.connect(this.destination);element.muted=false; const node={source,gain};this.nodes.set(element,node);return node; }
  async setMusic(row) {
    this.clearMusic(); if(!row)return;
    this.musicUrl=row.file?URL.createObjectURL(row.file):row.url;
    const music=document.createElement('audio');music.src=this.musicUrl;music.loop=true;music.preload='auto';this.music=music;
    if(this.context)this.musicNode=this.connect(music);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(new Error('背景原声读取超时。'));},15000);const cleanup=()=>{clearTimeout(timer);music.onloadedmetadata=null;music.onerror=null;};music.onloadedmetadata=()=>{cleanup();resolve();};music.onerror=()=>{cleanup();reject(new Error('无法读取这段素材的原声。'));};music.load();});
  }
  clearMusic() { if(this.music){this.music.pause();this.detach(this.music);this.music.removeAttribute('src');this.music.load();} if(this.musicUrl?.startsWith('blob:'))URL.revokeObjectURL(this.musicUrl);this.music=null;this.musicNode=null;this.musicUrl=null; }
  detach(element) { const node=this.nodes.get(element);if(node){node.source.disconnect();node.gain.disconnect();this.nodes.delete(element);} }
  pause(scenes) { scenes.forEach(s=>s.cats.forEach(cat=>{if(cat.asset.kind==='video'){cat.asset.element.pause();const n=this.nodes.get(cat.asset.element);if(n)n.gain.gain.value=0;}}));if(this.music)this.music.pause();if(this.musicNode)this.musicNode.gain.gain.value=0; }
  async prepare(state,time) { await this.init();for(const s of state.scenes)for(const cat of s.cats)if(cat.asset.kind==='video')this.connect(cat.asset.element);if(this.music){this.musicNode=this.connect(this.music);const t=time%this.music.duration;if(Number.isFinite(t))this.music.currentTime=t;this.musicNode.gain.gain.value=state.musicVolume;await this.music.play();} }
  sync(state,time) {
    const at=timelineAt(time,state.duration,state.scenes);
    for(let i=0;i<state.scenes.length;i++)for(const cat of state.scenes[i].cats){if(cat.asset.kind!=='video')continue;const v=cat.asset.element,n=this.nodes.get(v),ended=!cat.loop && at.local>=cat.trimEnd-cat.trimStart;
      if(i===at.index){const target=sourceTime(cat,at.local);if(Math.abs(v.currentTime-target)>.18&&!v.seeking)v.currentTime=target;if(ended)v.pause();else if(v.paused)v.play().catch(()=>{});if(n)n.gain.gain.value=cat.originalSound&&!ended?cat.volume*(at.progress?1-at.progress:1):0;}
      else {v.pause();if(n)n.gain.gain.value=0;if(i===at.index+1&&at.progress&&Math.abs(v.currentTime-cat.trimStart)>.04&&!v.seeking)v.currentTime=cat.trimStart;}
    }
    if(this.musicNode)this.musicNode.gain.gain.value=state.musicVolume;
  }
}
