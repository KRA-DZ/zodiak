/* Mobile shell only. Existing controls are moved, never cloned; saved progress is untouched. */
(function(root){
'use strict';
const query=matchMedia('(max-width:760px), (max-width:1000px) and (max-height:500px) and (pointer:coarse)');
let active=false,tab='path',sheet=null,lastLandscape=false,lastCompact=false,returnFocus=null;
const homes=new Map();let goalsButton=null;
function home(node){if(!homes.has(node)){const anchor=document.createComment('mobile home');node.before(anchor);homes.set(node,anchor);}return node;}
function move(node,host){if(node&&host&&node.parentNode!==host){home(node);host.appendChild(node);}}
function restore(node){const anchor=homes.get(node);if(anchor?.parentNode)anchor.after(node);}
function visible(el){return !!el&&el.getClientRects().length>0&&!el.closest('[hidden],[inert]');}
function setTab(value){tab=value;document.getElementById('s_hub').dataset.mobileTab=tab;for(const b of document.querySelectorAll('[data-mobile-tab-button]'))b.setAttribute('aria-pressed',String(b.dataset.mobileTabButton===tab));}
function closeSheet(focus=true){
 if(!sheet)return;const old=sheet;sheet=null;const panel=document.getElementById(old==='more'?'mobileMoreSheet':'mobileModesSheet');const held=panel.contains(document.activeElement);panel.hidden=true;panel.inert=true;panel.querySelector('.mobile-sheet-panel').removeAttribute('role');panel.querySelector('.mobile-sheet-panel').removeAttribute('aria-modal');
 if(old==='more'&&!document.getElementById('hubTools').hidden)document.getElementById('btnHubMenu').click();
 if(focus&&held&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
}
function openSheet(name,trigger){
 if(sheet===name)return;closeSheet(false);sheet=name;returnFocus=trigger;const host=document.getElementById(name==='more'?'mobileMoreSheet':'mobileModesSheet');host.hidden=false;host.inert=false;host.querySelector('.mobile-sheet-panel').setAttribute('role','dialog');host.querySelector('.mobile-sheet-panel').setAttribute('aria-modal','true');root.I18n?.render(host);host.querySelector('.mobile-sheet-panel').focus({preventScroll:true});
}
function sync(){
 const hub=document.getElementById('s_hub').classList.contains('active');document.getElementById('mobileNav').hidden=!active||!hub;
 if(!active||!hub){closeSheet(false);return;}
 const tools=document.getElementById('hubTools');if(!tools.hidden)openSheet('more',document.getElementById('btnHubMenu'));else if(sheet==='more')closeSheet(false);
}
function mapControls(){
 if(!active)return;const heading=document.querySelector('.chapter-heading');if(!heading)return;
 if(!heading.querySelector('#mobileSigns')){
  const b=document.createElement('button');b.id='mobileSigns';b.className='mobile-signs-button';b.textContent='Знаки';b.setAttribute('aria-expanded','false');b.setAttribute('aria-label','Выбрать знак на карте');
  b.onclick=()=>{const open=heading.classList.toggle('mobile-signs-open');b.setAttribute('aria-expanded',String(open));};heading.querySelector('.chapter-topline').appendChild(b);
 }
 const next=document.getElementById('pathContinue');if(next)next.textContent='Выбрать игру';
 if(!heading.parentElement.querySelector('.mobile-map-hint')){const p=document.createElement('small');p.className='mobile-map-hint';p.textContent='Нажми на звёздочку и выбери игру';heading.parentElement.querySelector('.path-footer').prepend(p);}
 root.I18n?.render(heading.parentElement);
}
function closeSigns(){const h=document.querySelector('.mobile-signs-open');h?.classList.remove('mobile-signs-open');document.getElementById('mobileSigns')?.setAttribute('aria-expanded','false');}
function gameDialog(kind){
 if(!active)return;
 root.GamePlatform.pause('mobile-dialog');
 if(kind==='goals'){
  const goals=document.querySelector('.level-guardian .guardian-goals');if(!goals){root.GamePlatform.resume('mobile-dialog');return;}home(goals);
  root.ZM.modalOpen('<h2>Условия звёзд</h2><div id="mobileGoalsHost"></div><div class="m-actions"><button class="btn primary" data-close>Продолжить игру</button></div>',{cls:'mobile-game-dialog mobile-goals-modal',onClose(){restore(goals);root.GamePlatform.resume('mobile-dialog');}});
  document.getElementById('mobileGoalsHost').appendChild(goals);
 }else{
  const options=[['btnFreeze','Стужа'],['btnMap','Астро-карта'],['btnMute2','Звук']].map(([id,label])=>({original:document.getElementById(id),id,label})).filter(x=>x.original&&!x.original.hidden);
  root.ZM.modalOpen('<h2>Бонусы и звук</h2><div class="mobile-boost-list">'+options.map(x=>'<button class="btn" data-mobile-boost="'+x.id+'" '+(x.original.disabled?'disabled':'')+'>'+x.label+' '+(x.original.querySelector('.cnt')?.textContent||'')+'</button>').join('')+'</div><div class="m-actions"><button class="btn primary" data-close>Продолжить игру</button></div>',{cls:'mobile-game-dialog',onClose(){root.GamePlatform.resume('mobile-dialog');}});
  document.querySelectorAll('[data-mobile-boost]').forEach(b=>b.onclick=()=>{const original=document.getElementById(b.dataset.mobileBoost);root.ZM.modalClose();original?.click();});
 }
}
function gameControls(){
 if(!active)return;const foot=document.getElementById('gFoot');if(!foot.children.length)return;
 if(innerHeight<600&&innerWidth<=innerHeight)move(goalsButton,foot);else if(goalsButton)restore(goalsButton);
 const exit=foot.querySelector('#btnHome');
 if(exit){const old=document.querySelector('.game-head #btnHome');if(old&&old!==exit){homes.delete(old);old.remove();}move(exit,document.querySelector('.game-head'));}
 if(!foot.querySelector('#mobileHintHelp')){const help=document.createElement('small');help.id='mobileHintHelp';help.textContent=foot.dataset.hintHelp||'';foot.appendChild(help);root.I18n?.render(help);}
 if(!document.getElementById('mobileBoosts')){const b=document.createElement('button');b.id='mobileBoosts';b.className='gbtn';b.textContent='Бонусы';b.onclick=()=>gameDialog('boosts');foot.appendChild(b);root.I18n?.render(b);}
}
function modalControls(){
 if(!active)return;const dialog=document.querySelector('#modalRoot .modal');if(!dialog||!dialog.querySelector('[data-close]')||dialog.querySelector('.mobile-dialog-close'))return;
 const b=document.createElement('button');b.className='mobile-dialog-close';b.textContent='×';b.setAttribute('aria-label','Закрыть');b.onclick=()=>root.ZM.modalClose();dialog.prepend(b);root.I18n?.render(b);
}
function size(){
 const height=Math.round(Math.min(innerHeight,root.visualViewport?.height||innerHeight));document.documentElement.style.setProperty('--mobile-height',height+'px');document.body.classList.toggle('mobile-short-portrait',active&&innerHeight<600&&innerWidth<=innerHeight);if(active)gameControls();
 const landscape=innerWidth>innerHeight,compact=innerHeight<600;if(active&&(landscape!==lastLandscape||compact!==lastCompact)){lastLandscape=landscape;lastCompact=compact;root.CampaignMap?.render();}
}
function apply(){
 const next=query.matches;if(next===active){size();return;}active=next;document.body.classList.toggle('mobile-ui',active);
 if(active){
  move(document.getElementById('btnHubMenu'),document.getElementById('mobileNav'));
  move(document.getElementById('hubTools'),document.getElementById('mobileMoreContent'));
  move(document.querySelector('.command-meta'),document.getElementById('mobileMoreContent'));
  move(document.querySelector('.command-actions'),document.getElementById('mobileModesContent'));
  setTab(tab);lastLandscape=innerWidth>innerHeight;lastCompact=innerHeight<600;root.CampaignMap?.render();mapControls();gameControls();modalControls();
 }else{
  closeSheet(false);if(document.querySelector('.mobile-game-dialog'))root.ZM.modalClose();
  for(const [node]of homes)if(!node.classList.contains('guardian-goals'))restore(node);
  document.getElementById('mobileSigns')?.remove();document.querySelector('.mobile-map-hint')?.remove();document.querySelector('.chapter-heading')?.classList.remove('mobile-signs-open');
  root.CampaignMap?.render();document.getElementById('mobileBoosts')?.remove();document.getElementById('mobileHintHelp')?.remove();
 }
 size();sync();
}
function init(){
 const hub=document.getElementById('s_hub');if(!hub||!root.ZM?.ready)return;
 const nav=document.createElement('nav');nav.id='mobileNav';nav.hidden=true;nav.setAttribute('aria-label','Разделы игры');nav.innerHTML='<button id="mobilePath" data-mobile-tab-button="path" aria-pressed="true"><span aria-hidden="true">✦</span><b>Путь</b></button><button id="mobileHero" data-mobile-tab-button="hero" aria-pressed="false"><span aria-hidden="true">☾</span><b>Герой</b></button><button id="mobileModes"><span aria-hidden="true">◇</span><b>Режимы</b></button>';hub.appendChild(nav);
 for(const [name,title]of[['More','Ещё'],['Modes','Выберите режим']]){
  const wrap=document.createElement('div');wrap.id='mobile'+name+'Sheet';wrap.className='mobile-sheet';wrap.hidden=true;wrap.inert=true;
  wrap.innerHTML='<button class="mobile-sheet-backdrop" tabindex="-1" aria-label="Закрыть"></button><section class="mobile-sheet-panel" aria-label="'+title+'" tabindex="-1"><header><h2>'+title+'</h2><button class="mobile-sheet-close" aria-label="Закрыть">×</button></header><div id="mobile'+name+'Content"></div></section>';
  document.body.appendChild(wrap);wrap.querySelector('.mobile-sheet-backdrop').onclick=()=>closeSheet();wrap.querySelector('.mobile-sheet-close').onclick=()=>closeSheet();
 }
 const guide=document.createElement('button');guide.id='mobileGuide';guide.className='iconbtn';guide.textContent='?';guide.setAttribute('aria-label','Как играть');guide.onclick=()=>document.getElementById('btnGuide').click();document.querySelector('.hub-command .topbar').appendChild(guide);
 const goals=document.createElement('button');goals.id='mobileGoals';goals.textContent='Цели ★';goals.setAttribute('aria-label','Условия звёзд');goals.onclick=()=>gameDialog('goals');document.querySelector('.level-guardian').appendChild(goals);goalsButton=goals;
 document.getElementById('mobilePath').onclick=()=>{closeSheet();setTab('path');};document.getElementById('mobileHero').onclick=()=>{closeSheet();setTab('hero');};document.getElementById('mobileModes').onclick=()=>{if(sheet==='modes')closeSheet();else openSheet('modes',document.getElementById('mobileModes'));};
 new MutationObserver(sync).observe(document.getElementById('hubTools'),{attributes:true,attributeFilter:['hidden']});
 for(const screen of document.querySelectorAll('.screen'))new MutationObserver(sync).observe(screen,{attributes:true,attributeFilter:['class']});
 new MutationObserver(mapControls).observe(document.getElementById('campaignMap'),{childList:true});
 new MutationObserver(gameControls).observe(document.getElementById('gFoot'),{childList:true});
 new MutationObserver(modalControls).observe(document.getElementById('modalRoot'),{childList:true});
 document.addEventListener('click',e=>{
  if(!active)return;
  if(e.target.closest('#pathObservatory,#observatoryShortcut')){if(document.querySelector('#modalRoot.show'))root.ZM.modalClose();setTab('hero');}
  if(e.target.closest('[data-chapter]')||!e.target.closest('.chapter-heading'))closeSigns();
  if(e.target.closest('.command-chip'))closeSheet(false);
 });
 document.addEventListener('keydown',e=>{
  if(!active)return;if(e.key==='Escape'){closeSigns();closeSheet();}
  if(e.key==='Tab'&&sheet&&!document.querySelector('#modalRoot.show')){const host=document.getElementById(sheet==='more'?'mobileMoreSheet':'mobileModesSheet');const controls=[...host.querySelectorAll('button:not(:disabled),select')].filter(el=>el.tabIndex>=0&&visible(el));if(!controls.length)return;const first=controls[0],last=controls.at(-1);if(!controls.includes(document.activeElement)||(e.shiftKey&&document.activeElement===first)){e.preventDefault();(e.shiftKey?last:first).focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 });
 query.addEventListener('change',apply);addEventListener('resize',apply);root.visualViewport?.addEventListener('resize',size);apply();root.I18n?.render(hub);
}
root.MobileUI={resetGameControls(){const exit=document.querySelector('.game-head #btnHome');if(exit){homes.delete(exit);exit.remove();}},get active(){return active;},get landscape(){return active&&innerWidth>innerHeight;},setTab};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
