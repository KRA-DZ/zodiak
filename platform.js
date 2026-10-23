/* Optional Yandex Games bridge. Standalone/GitHub builds use the same game. */
(function(root){
'use strict';
const reasons=new Set(),tasks=new Set(),pausedAnimations=new Set();
let hooks={},sdk=null,engineReady=false,assetsReady=false,readySent=false,playing=false,reported=false;
const state={sdk:'standalone',ready:false};
const now=()=>performance.now();
function arm(task){task.started=now();task.id=setTimeout(()=>{tasks.delete(task);if(!task.cancelled)task.fn();},task.remaining);}
function delay(fn,ms){const task={fn,remaining:Math.max(0,ms),id:null,cancelled:false};tasks.add(task);if(!reasons.size)arm(task);return task;}
function cancel(task){if(task&&typeof task==='object'&&'cancelled'in task){task.cancelled=true;clearTimeout(task.id);tasks.delete(task);}else clearTimeout(task);}
function sync(){const wanted=!!(sdk&&readySent&&playing&&!reasons.size&&!document.querySelector('#modalRoot.show,#levelTour'));if(wanted===reported)return;try{const api=sdk.features?.GameplayAPI;if(!api)return;wanted?api.start():api.stop();reported=wanted;}catch(e){state.gameplayError=true;}}
function pause(reason){if(reasons.has(reason))return;const first=!reasons.size;reasons.add(reason);if(first){for(const t of tasks){if(t.id!=null){clearTimeout(t.id);t.remaining=Math.max(0,t.remaining-(now()-t.started));t.id=null;}}for(const a of document.getAnimations()){if(a.playState==='running'){a.pause();pausedAnimations.add(a);}}document.body?.classList.add('platform-paused');hooks.pause?.();}sync();}
function resume(reason){reasons.delete(reason);if(!reasons.size){document.body?.classList.remove('platform-paused');for(const a of pausedAnimations){if(a.playState==='paused')a.play();}pausedAnimations.clear();for(const t of tasks)if(t.id==null&&!t.cancelled)arm(t);hooks.resume?.();}sync();}
function maybeReady(){if(!sdk||!engineReady||!assetsReady||readySent)return;try{if(typeof sdk.features?.LoadingAPI?.ready!=='function'){state.readyError=true;return;}sdk.features.LoadingAPI.ready();readySent=true;state.ready=true;sync();}catch(e){state.readyError=true;}}
async function init(){
 const enabled=/(^|\.)(yandex\.(net|ru|com)|yandexgames\.(com|net))$/.test(location.hostname)||new URLSearchParams(location.search).get('yandex')==='1';
 if(!enabled&&!root.YaGames)return;
 state.sdk='loading';
 try{
  if(!root.YaGames)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/sdk.js';script.onload=resolve;script.onerror=()=>reject(new Error('SDK unavailable'));const timeout=setTimeout(()=>reject(new Error('SDK timeout')),10000);script.addEventListener('load',()=>clearTimeout(timeout),{once:true});document.head.appendChild(script);});
  sdk=await root.YaGames.init();state.sdk='connected';root.I18n?.platformLanguage(sdk.environment?.i18n?.lang||navigator.language);
  sdk.on?.('game_api_pause',()=>pause('sdk'));sdk.on?.('game_api_resume',()=>resume('sdk'));
  maybeReady();
 }catch(e){state.sdk='unavailable';}
}
let adBusy=false;
function rewarded(onReward){
 if(adBusy||!sdk?.adv?.showRewardedVideo||reasons.size)return Promise.resolve('unavailable');
 adBusy=true;pause('rewarded');
 return new Promise(resolve=>{let granted=false,closed=false;
  function finish(status){if(closed)return;closed=true;adBusy=false;resume('rewarded');resolve(status);}
  try{sdk.adv.showRewardedVideo({callbacks:{
   onOpen:()=>{},
   onRewarded:()=>{if(closed||granted)return;granted=true;try{onReward();}catch(e){state.rewardError=true;}},
   onClose:()=>finish(granted?'rewarded':'closed'),
   onError:()=>finish(granted?'rewarded':'error')
  }});}catch(e){finish('error');}
 });
}
root.GamePlatform={rewarded,get adsAvailable(){return !!sdk?.adv?.showRewardedVideo;},get adBusy(){return adBusy;},get paused(){return reasons.size>0;},state,delay,cancel,pause,resume,sync,connect(value){hooks=value;},gameplay(value){playing=!!value;sync();},ready(){engineReady=true;maybeReady();}};
addEventListener('blur',()=>pause('focus'));addEventListener('focus',()=>resume('focus'));
document.addEventListener('visibilitychange',()=>document.hidden?pause('visibility'):resume('visibility'));
addEventListener('pagehide',()=>pause('page'));addEventListener('pageshow',()=>resume('page'));
const guard=e=>{if(reasons.size){e.preventDefault();e.stopImmediatePropagation();}};
for(const event of ['pointerdown','pointerup','click','keydown','touchstart'])document.addEventListener(event,guard,{capture:true,passive:false});
function loaded(){const fonts=Promise.all([document.fonts?.ready||Promise.resolve(),root.I18n?.ready||Promise.resolve()]);Promise.resolve(fonts).catch(()=>{}).then(()=>{assetsReady=true;maybeReady();});new MutationObserver(sync).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});if(document.hidden)pause('visibility');}
if(document.readyState==='complete')loaded();else addEventListener('load',loaded,{once:true});
init();
})(window);
