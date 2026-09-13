const memory={assets:new Map(),project:null};
let db=null;
export async function openStore(){try{db=await new Promise((resolve,reject)=>{const r=indexedDB.open('meow-meme-studio-v2',1);r.onupgradeneeded=()=>{r.result.createObjectStore('assets',{keyPath:'id'});r.result.createObjectStore('drafts');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('请关闭其他旧版猫片页面后重试。'));});return true;}catch{return false;}}
function transaction(store,mode,action){return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),request=action(tx.objectStore(store));let value;request.onsuccess=()=>value=request.result;tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('浏览器空间不足，素材未保存。'));});}
export const listAssets=()=>db?transaction('assets','readonly',s=>s.getAll()):Promise.resolve([...memory.assets.values()]);
export const putAsset=row=>db?transaction('assets','readwrite',s=>s.put(row)):Promise.resolve(memory.assets.set(row.id,row));
export const deleteAsset=id=>db?transaction('assets','readwrite',s=>s.delete(id)):Promise.resolve(memory.assets.delete(id));
export const saveDraft=project=>db?transaction('drafts','readwrite',s=>s.put(project,'current')):Promise.resolve(memory.project=project);
export const loadDraft=()=>db?transaction('drafts','readonly',s=>s.get('current')):Promise.resolve(memory.project);
