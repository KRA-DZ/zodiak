/* Yandex cloud progress. Local saves remain authoritative until the remote read succeeds.
   SDK has no compare-and-swap: reread before writing; divergent branches require a choice. */
(function(root){
'use strict';
const KEY='zodiacMemoryCloud',META='zodiacMemory.cloudMeta',BACKUP='zodiacMemory.beforeCloud';
const INTERVAL=30000,MAX_BYTES=180*1024;
const canonical=value=>JSON.stringify(sort(value));
function sort(value){if(Array.isArray(value))return value.map(sort);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])]));return value;}
function parse(packet){
 if(!packet||packet.version!==1||typeof packet.id!=='string'||!/^[-\w]{8,100}$/.test(packet.id)||!Number.isSafeInteger(packet.updatedAt)||packet.updatedAt<0)throw Error('invalid');
 const validator=root.SaveFiles||(typeof require==='function'?require('./save-files.js'):null);
 const save=validator.parse(JSON.stringify({format:'zodiac-memory',version:1,save:packet.save}));
 // Current cloud schema never silently resets an unsupported economy or campaign.
 if(save.economyVersion!==2||save.campaignVersion!==1||save.journeyVersion!==2)throw Error('invalid');
 return{version:1,id:packet.id,updatedAt:packet.updatedAt,save};
}
function decision(local,remote,meta,fresh=false){
 if(!remote)return 'upload';
 const current=canonical(local),other=canonical(remote.save);
 if(current===other)return 'same';
 if(meta?.id===remote.id)return 'upload';
 if(meta?.base===current||fresh)return 'restore';
 return 'conflict';
}
let zm,hooks={},sdk,player,account='',meta=null,remote=null,timer=null,busy=false,connected=false,initializing=false,status='unavailable',lastAttempt=0,lastRead=0,dirty=false,stopped=false;
let operation=Promise.resolve();
const messages={loading:'Проверяем облачное сохранение…',guest:'Войдите в Яндекс, чтобы сохранять прогресс между устройствами.',synced:'Прогресс сохранён в облаке.',pending:'Изменения сохранены в браузере и ожидают отправки в облако.',conflict:'Найдены разные сохранения. Выберите, какое продолжить.',error:'Облако недоступно. Прогресс сохранён в этом браузере. Повторите позже.',invalid:'Облачная копия не поддерживается или повреждена. Она не перезаписана; локальная игра доступна.',large:'Копия слишком большая для облака. Скачайте её из книги предсказаний.',unavailable:'Облачные сохранения доступны в Яндекс Играх.'};
function state(value){const previous=status;status=value;paint();if(value==='conflict'&&previous!=='conflict')zm?.toast(messages.conflict);}
function paint(){
 const menu=document.getElementById('btnHubMenu');if(menu)menu.dataset.cloudConflict=String(status==='conflict');const setup=document.getElementById('setupCloud');if(setup)setup.title=messages[status];
 const button=document.getElementById('btnCloud');if(button){button.dataset.cloudState=status;button.title=messages[status];button.querySelector('span').textContent='Облако';}
 const box=document.getElementById('cloudStatus');if(box)box.textContent=messages[status];
 const sync=document.getElementById('cloudSync');if(sync)sync.disabled=busy||stopped||status==='invalid'||status==='large';
}
function timeout(promise){return new Promise((resolve,reject)=>{const id=setTimeout(()=>reject(Error('timeout')),8000);Promise.resolve(promise).then(value=>{clearTimeout(id);resolve(value);},error=>{clearTimeout(id);reject(error);});});}
function current(){return parse({version:1,id:'local-check',updatedAt:Date.now(),save:zm.save}).save;}
function remember(packet){meta={account,id:packet.id,base:canonical(packet.save),lastAttempt};try{localStorage.setItem(META,JSON.stringify(meta));}catch(e){} }
function pristine(s){return s.sign===null&&s.dust===0&&!s.lvStars.some(Boolean)&&!s.journal?.length&&!Object.values(s.ach||{}).some(Boolean)&&!s.calTaken?.length&&!Object.values(s.stats||{}).some(v=>Array.isArray(v)?v.length:v)&&(!s.observatory||!s.observatory.hero);}
function schedule(){clearTimeout(timer);if(!connected||stopped||status==='conflict'||status==='invalid'||status==='large')return;timer=setTimeout(()=>{timer=null;sync();},Math.max(1500,Math.max(lastAttempt,lastRead)+INTERVAL-Date.now()));}
function changed(){if(!zm||!connected||stopped)return;dirty=true;if(status==='synced')state('pending');schedule();}
async function read(){lastRead=Date.now();const data=await timeout(player.getData([KEY]));if(!data||typeof data!=='object')throw Error('network');if(!Object.hasOwn(data,KEY)||data[KEY]===null)return null;try{return parse(data[KEY]);}catch(e){throw Error('invalid');}}
function restore(packet){
 if(!hooks.canRestore()){remote=packet;state('conflict');return false;}
 // A failed local backup must leave the active progress untouched.
 try{localStorage.setItem(BACKUP,JSON.stringify(zm.save));localStorage.setItem('zodiacMemory.v3',JSON.stringify(packet.save));}catch(e){state('error');return false;}
 remember(packet);dirty=false;stopped=true;clearTimeout(timer);hooks.restore(packet.save);return true;
}
async function reconcile(allowRestore=true){
 const packet=await read();remote=packet;
 const local=current(),action=decision(local,packet,meta,pristine(local));
 if(action==='same'){remember(packet);dirty=false;state('synced');return;}
 if(action==='restore'){if(allowRestore&&hooks.canRestore())restore(packet);else state('conflict');return;}
 if(action==='conflict'){state('conflict');return;}
 const upload={version:1,id:root.crypto.randomUUID?.()||Array.from(root.crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join(''),updatedAt:Date.now(),save:local};
 if(new TextEncoder().encode(JSON.stringify({[KEY]:upload})).length>MAX_BYTES){state('large');return;}
 // No parallel writes, no writes before a read, and at most one write attempt per 30 seconds.
 if(Date.now()<lastAttempt+INTERVAL){dirty=true;state('pending');schedule();return;}
 lastAttempt=Date.now();meta=meta||{account,id:'',base:''};meta.lastAttempt=lastAttempt;try{localStorage.setItem(META,JSON.stringify(meta));}catch(e){}
 const request=Promise.resolve(player.setData({[KEY]:upload},true));
 const complete=()=>{remember(upload);remote=upload;dirty=canonical(current())!==canonical(upload.save);state(dirty?'pending':'synced');if(dirty)schedule();};
 try{await timeout(request);}catch(e){
  if(e.message==='timeout'){
   // A timeout does not cancel an SDK write. Do not start a second one until it settles.
   stopped=true;clearTimeout(timer);
   request.then(()=>{stopped=false;complete();},()=>{stopped=false;state('error');});
  }
  throw e;
 }
 complete();
}
function sync(){
 if(busy||!connected||stopped||status==='conflict'||status==='invalid'||status==='large')return operation;
 if(Date.now()<Math.max(lastAttempt,lastRead)+INTERVAL){if(dirty)state('pending');schedule();return operation;}
 busy=true;paint();operation=reconcile().catch(e=>{state(e.message==='invalid'?'invalid':'error');}).finally(()=>{busy=false;paint();});return operation;
}
async function connect(){
 connected=false;state('loading');
 try{
  const candidate=await timeout(sdk.getPlayer({scopes:false}));
  const authorized=typeof candidate.isAuthorized==='function'?candidate.isAuthorized():candidate.getMode?.()==='full';
  if(!authorized){player=null;state('guest');return;}
  const id=candidate.getUniqueID?.();if(typeof id!=='string'||!id)throw Error('identity');
  player=candidate;account=id;meta=null;
  try{const stored=JSON.parse(localStorage.getItem(META)||'null');if(stored?.account===account&&typeof stored.id==='string'&&typeof stored.base==='string'){meta=stored;lastAttempt=Math.min(Date.now(),Number(stored.lastAttempt)||0);}else lastAttempt=0;}catch(e){lastAttempt=0;}
  connected=true;
  // Initial reads bypass the write cooldown, so another device can always restore promptly.
  busy=true;await reconcile();
 }catch(e){state(e.message==='invalid'?'invalid':'error');}
 finally{busy=false;paint();}
}
function summary(save,label){
 const games=save.lvStars.filter(Boolean).length,stars=save.lvStars.reduce((a,b)=>a+b,0),items=Object.values(save.observatory?.owned||{}).reduce((n,group)=>n+Object.values(group).filter(Boolean).length,0);
 return '<article class="cloud-copy"><h3>'+label+'</h3><p>Пройдено игр: '+games+' / 360</p><p>Звёзды атласа: '+stars+' / 1080</p><p>Звёздная пыль: '+save.dust+'</p><p>Предметов коллекции: '+items+'</p></article>';
}
async function choose(which){
 if(busy||!remote)return;busy=true;paint();
 try{
  // Recheck the exact version shown to the user; a newer remote version needs a new decision.
  const latest=await read();if(!latest||latest.id!==remote.id){remote=latest;state(latest?'conflict':'error');open();return;}
  if(which==='cloud'){restore(latest);return;}
  remember(latest);dirty=true;state('pending');
 }catch(e){state(e.message==='invalid'?'invalid':'error');}
 finally{busy=false;paint();}
 if(!stopped){open();sync();}
}
function exportBackup(){try{const save=JSON.parse(localStorage.getItem(BACKUP));if(!save)return;const url=URL.createObjectURL(new Blob([JSON.stringify({format:'zodiac-memory',version:1,save})],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='zodiac-memory-before-cloud.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){}}
function open(){
 let backup=false;try{backup=!!localStorage.getItem(BACKUP);}catch(e){}
 const conflict=status==='conflict'&&remote;
 zm.modalOpen('<h2>Облачный прогресс</h2><p id="cloudStatus" role="status">'+messages[status]+'</p>'+(conflict?'<div class="cloud-copies">'+summary(zm.save,'В этом браузере')+summary(remote.save,'В облаке Яндекса')+'</div><p>Выбранная копия заменит другую. Валюта и предметы не суммируются. Перед восстановлением облака останется резервная копия в браузере.</p><div class="m-actions"><button class="btn" id="cloudLocal">Продолжить местную копию</button><button class="btn primary" id="cloudRemote">Восстановить из облака</button></div>':'<p>Без входа в аккаунт игра сохраняется в браузере. Облако переносит путешествие между устройствами. После изменений дождитесь подтверждения сохранения; частые записи объединяются.</p><div class="m-actions">'+(status==='guest'?'<button class="btn primary" id="cloudLogin">Войти в Яндекс</button>':'<button class="btn primary" id="cloudSync">Синхронизировать</button>')+'</div>')+(backup?'<button class="btn" id="cloudBackup">Скачать копию до восстановления</button>':'')+'<div class="m-actions"><button class="btn" data-close>Закрыть</button></div>',{cls:'cloud-modal'});
 document.getElementById('cloudLocal')?.addEventListener('click',()=>choose('local'));
 document.getElementById('cloudRemote')?.addEventListener('click',()=>choose('cloud'));
 document.getElementById('cloudLogin')?.addEventListener('click',async()=>{
  if(busy||!sdk.auth?.openAuthDialog)return;busy=true;state('loading');
  try{await sdk.auth.openAuthDialog();await connect();open();}catch(e){state('guest');}finally{busy=false;paint();}
 });
 document.getElementById('cloudSync')?.addEventListener('click',async()=>{if(!connected)await connect();else await sync();if(!stopped&&document.querySelector('.cloud-modal'))open();});
 document.getElementById('cloudBackup')?.addEventListener('click',exportBackup);paint();
}
async function init(value,callbacks){
 if(initializing)return;initializing=true;zm=value;hooks=callbacks;
 sdk=await root.GamePlatform.sdkReady;if(!sdk?.getPlayer)return;await root.I18n.ready;
 const nav=document.getElementById('hubTools'),button=document.createElement('button');button.id='btnCloud';button.className='iconbtn';button.innerHTML='☁<span class="il">Облако</span>';button.onclick=open;nav.appendChild(button);
 const setup=document.getElementById('setupLanguage');if(setup){const b=document.createElement('button');b.id='setupCloud';b.className='btn';b.textContent='☁ Облачный прогресс';b.onclick=open;setup.after(b);}
 await connect();
}
// No unconditional pagehide save: imported/restored data must never be overwritten by a stale page.
root.CloudSave={init,changed,sync,open,get status(){return status;},get connected(){return connected;},model:{canonical,parse,decision,KEY,INTERVAL}};
if(typeof module!=='undefined')module.exports=root.CloudSave.model;
})(typeof window==='undefined'?globalThis:window);
