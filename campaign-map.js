/* One zodiac per screen: ten stars with three game modes each. */
(function(root){
'use strict';
let ZM,start,activeSign=0;
const names=['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
const labels=['Созвездие памяти','Оракул','Алхимия звёзд'];
const hints=['Найди пары','Следи за картами','Три в ряд'];
const backgrounds=new Map();
function warm(sign){if(sign<0||sign>11||backgrounds.has(sign))return;const image=new Image();backgrounds.set(sign,image);image.src='assets/route-'+names[sign]+'.webp';}
const steps=()=>Campaign.nodesPerSign||10;
const point=(sign,step)=>({x:300+190*Math.sin(step*.86+sign*.43)+22*Math.sin(step*1.7),y:90-step*8.6});
function describe(c){const tags=[Campaign.names[c.campaignMode]];if(c.campaignBoss)tags.push('Испытание хранителя');if(c.rest)tags.push('Спокойный уровень');if(c.boss)tags.push('Обратный отсчёт '+c.par+' с');if(c.match3)tags.push(c.rows+'×'+c.cols,c.shapeLabel||'Открытое небо',c.moves+' ходов');if(c.trios)tags.push('Триады');if(c.darks)tags.push('Тёмные карты');if(c.oracle)tags.push('до 2 целей · '+c.stages.length+' этапа');if(c.match3)tags.push(c.goal?.type==='seals'?'Лунные печати':c.goal?.type==='collect'?'Сбор цвета':'Сбор символов');if(c.obstacles?.length)tags.push('Замки и лёд');if(c.voids?.length)tags.push('Разрывы поля');return tags.join(' · ');}
function detail(cfg){return describe(cfg)||[cfg.campaignBoss?'Испытание хранителя':'',cfg.rest?'Спокойный уровень':'',cfg.goal?.type==='seals'?'Лунные печати':'',cfg.obstacles?.length?'Замки и лёд':'',cfg.voids?.length?'Разрывы поля':''].filter(Boolean).join(' · ')||'Обычный расклад';}
function dismiss(){const popup=document.querySelector('.node-picker');if(popup){const node=document.querySelector('.star-node[data-node="'+popup.dataset.node+'"]');popup.remove();return node;}return null;}
function render(){
 const host=document.getElementById('campaignMap');if(!host||!ZM)return;
 const s=ZM.save,n=steps();activeSign=s.campaignChapter;
 host.innerHTML='<header class="path-heading chapter-heading"><div class="chapter-topline"><div class="chapter-caption"><span class="eyebrow">ЗВЁЗДНАЯ ТРОПА · 120 ЗВЁЗДОЧЕК</span><h2></h2></div><span id="chapterProgress"></span><div class="chapter-paging"><button id="chapterPrev" aria-label="Предыдущий знак">‹</button><span id="chapterIndex"></span><button id="chapterNext" aria-label="Следующий знак">›</button></div><button class="btn path-observatory" id="pathObservatory">☾ Обсерватория</button></div><nav class="path-chapters" aria-label="Знаки зодиака">'+ZM.SIGNS.map((sign,i)=>'<button class="chapter-dot" data-chapter="'+i+'" title="'+sign.name+'" aria-label="'+sign.name+'">'+ZM.GLYPHS[i]+'</button>').join('')+'</nav><div id="pathDetails" role="status">Любой режим открывает следующую звёздочку · все три собирают карту.</div></header><div class="path-viewport chapter-viewport" tabindex="0" aria-label="Карта знака. Колёсико вверх — следующие уровни, вниз — предыдущие."></div><footer class="path-footer chapter-footer"><small>Колёсико или свайп — по одному знаку</small><button class="btn primary" id="pathContinue">Следующая звёздочка ↑</button></footer>';
 const viewport=host.querySelector('.path-viewport');let animation,suppressClickUntil=0;
 function show(sign,animate=true){
  const previousSign=activeSign;
  sign=Math.max(0,Math.min(11,sign));warm(sign-1);warm(sign+1);dismiss();activeSign=sign;s.campaignChapter=sign;ZM.persist();
  host.querySelector('h2').textContent=ZM.GLYPHS[sign]+' '+ZM.SIGNS[sign].name;
  const done=Array.from({length:n},(_,step)=>[0,1,2].filter(mode=>s.lvStars[Campaign.id(sign,mode,step)]>0).length).reduce((a,b)=>a+b,0),seals=[0,1,2].filter(mode=>Campaign.completed(s,sign,mode)===n).length;
  host.querySelector('#chapterProgress').textContent='Карта знака · '+done+'/30 · печати '+seals+'/3';
  host.querySelector('#chapterIndex').textContent=(sign+1)+'/12';host.querySelector('#chapterPrev').disabled=sign===0;host.querySelector('#chapterNext').disabled=sign===11;
  host.querySelectorAll('[data-chapter]').forEach(b=>{b.classList.toggle('selected',+b.dataset.chapter===sign);b.setAttribute('aria-current',+b.dataset.chapter===sign?'page':'false');});
  host.querySelector('#pathDetails').textContent='Любой режим открывает следующую звёздочку · все три собирают карту.';
  let nodes='',path='',previous;
  for(let step=0;step<n;step++){
   const node=sign*n+step,p=point(sign,step),done=[0,1,2].map(mode=>s.lvStars[Campaign.id(sign,mode,step)]>0),count=done.filter(Boolean).length,allowed=Campaign.available(s,Campaign.id(sign,0,step)),boss=(step+1)%5===0,y=p.y*6;
   if(!previous)path='M '+p.x+' '+y;else{const mid=(previous.y+y)/2;path+=' C '+previous.x+' '+mid+' '+p.x+' '+mid+' '+p.x+' '+y;}previous={x:p.x,y};
   nodes+='<button class="star-node'+(count===3?' filled':count?' visited':'')+(allowed?'':' locked')+(boss?' guardian':'')+'" data-node="'+node+'" style="left:'+p.x/6+'%;top:'+p.y+'%;--node-progress:'+count/3+'" aria-disabled="'+!allowed+'" tabindex="'+(allowed?'0':'-1')+'" aria-label="'+ZM.SIGNS[sign].name+' · звёздочка '+(node+1)+' · пройдено '+count+' из 3'+(boss?' · хранитель':'')+'"><span class="star-disc">'+(boss?'<i class="star-crown" aria-hidden="true">♛</i>':'')+'<b>'+(node+1)+'</b></span><span class="star-checks" aria-hidden="true">'+done.map((yes,mode)=>'<i class="'+(yes?'checked':'')+'" style="--check-color:'+Campaign.colors[mode]+'">'+(yes?'✓':'·')+'</i>').join('')+'</span></button>';
  }
  animation?.cancel();viewport.innerHTML='<section class="zodiac-region route-region chapter-scene" data-region="'+sign+'" style="--world-image:url(assets/route-'+names[sign]+'.webp)"><svg viewBox="0 0 600 600" preserveAspectRatio="none" aria-hidden="true"><path class="trail-shadow" d="'+path+'"/><path class="trail-line" d="'+path+'"/></svg>'+nodes+'</section>';
  viewport.querySelectorAll('.star-node').forEach(button=>button.onclick=()=>{if(Date.now()>=suppressClickUntil)picker(+button.dataset.node,button);});
  if(animate&&sign!==previousSign&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&viewport.animate)animation=viewport.querySelector('.chapter-scene').animate([{transform:'translateY('+(sign>previousSign?'-':'')+'100%)',opacity:.35},{transform:'translateY(0)',opacity:1}],{duration:440,easing:'cubic-bezier(.2,.7,.25,1)'});
 }
 function picker(node,button){
  dismiss();const sign=Math.floor(node/n),step=node%n;
  if(!Campaign.available(s,Campaign.id(sign,0,step))){host.querySelector('#pathDetails').textContent='Пройдите любой режим предыдущей звёздочки.';return;}
  const popup=document.createElement('section');popup.className='node-picker';popup.dataset.node=node;popup.tabIndex=-1;popup.setAttribute('role','dialog');popup.setAttribute('aria-labelledby','nodePickerTitle');
  popup.innerHTML='<div class="picker-heading"><b id="nodePickerTitle">✦ '+(node+1)+' · '+ZM.SIGNS[sign].name+'</b><button class="picker-close" aria-label="Закрыть выбор режима">×</button></div><div class="picker-modes">'+[0,1,2].map(mode=>{const id=Campaign.id(sign,mode,step),done=s.lvStars[id]>0;return '<button class="picker-mode'+(done?' done':'')+'" data-play="'+id+'" title="'+labels[mode]+' · '+detail(ZM.LEVELS[id])+'"><span class="mystic-icon" style="--icon-x:'+([0,50,50][mode])+'%;--icon-y:'+([0,0,100][mode])+'%" aria-hidden="true"></span><b>'+labels[mode]+'</b><small>'+hints[mode]+'</small><span class="picker-status">'+(done?'✓ Пройдено':'Играть')+'</span></button>';}).join('')+'</div>';
  host.appendChild(popup);const r=button.getBoundingClientRect(),h=host.getBoundingClientRect(),w=popup.offsetWidth,ph=popup.offsetHeight;
  popup.style.left=Math.max(9,Math.min(h.width-w-9,r.left-h.left+r.width/2-w/2))+'px';popup.style.top=Math.max(host.querySelector('.path-heading').offsetHeight,Math.min(h.height-ph-9,r.bottom-h.top+12+ph<h.height-12?r.bottom-h.top+12:r.top-h.top-ph-12))+'px';
  popup.querySelector('.picker-close').onclick=()=>{dismiss();button.focus({preventScroll:true});};
  popup.querySelectorAll('[data-play]').forEach(b=>{const id=+b.dataset.play;b.onmouseenter=b.onfocus=()=>{host.querySelector('#pathDetails').textContent=labels[ZM.LEVELS[id].campaignMode]+' · '+detail(ZM.LEVELS[id]);};b.onclick=()=>{if(!Campaign.available(s,id))return;s.campaignChapter=sign;s.campaignMode=ZM.LEVELS[id].campaignMode;ZM.persist();dismiss();start(id);};});
  popup.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();dismiss();button.focus({preventScroll:true});}};popup.focus({preventScroll:true});
 }
 let wheelArmed=true,wheelTimer=0,wheelStarted=0;
 viewport.addEventListener('wheel',e=>{
  if(e.ctrlKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)||e.deltaY===0)return;
  e.preventDefault();clearTimeout(wheelTimer);
  if(wheelArmed){wheelArmed=false;wheelStarted=Date.now();show(activeSign+(e.deltaY<0?1:-1));}
  wheelTimer=setTimeout(()=>{wheelArmed=true;},Math.max(220,350-(Date.now()-wheelStarted)));
 },{passive:false});
 let touch;
 viewport.addEventListener('touchstart',e=>{touch=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
 viewport.addEventListener('touchend',e=>{if(!touch)return;const end=e.changedTouches[0],dy=touch.y-end.clientY,dx=touch.x-end.clientX;touch=null;if(Math.abs(dy)>45&&Math.abs(dy)>Math.abs(dx)){suppressClickUntil=Date.now()+350;show(activeSign+(dy<0?1:-1));}},{passive:true});
 viewport.addEventListener('touchcancel',()=>{touch=null;},{passive:true});
 viewport.addEventListener('keydown',e=>{let next;if(['ArrowUp','PageUp'].includes(e.key))next=activeSign+1;if(['ArrowDown','PageDown'].includes(e.key))next=activeSign-1;if(e.key==='Home')next=0;if(e.key==='End')next=11;if(next!=null){e.preventDefault();show(next);viewport.focus({preventScroll:true});}});
 host.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>show(+b.dataset.chapter));
 host.querySelector('#chapterPrev').onclick=()=>show(activeSign-1);host.querySelector('#chapterNext').onclick=()=>show(activeSign+1);
 host.querySelector('#pathObservatory').onclick=()=>document.querySelector('.personal-observatory').scrollIntoView({behavior:'smooth',block:'start'});
 host.querySelector('#pathContinue').onclick=()=>{const id=Campaign.next(s,s.campaignMode),sign=Math.floor(id/30),step=id%n;show(sign);host.querySelector('.star-node[data-node="'+(sign*n+step)+'"]').focus({preventScroll:true});};
 show(activeSign,false);
}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.node-picker,.star-node'))dismiss();});
root.CampaignMap={init(zm,launch){ZM=zm;start=launch;},render,describe};
})(window);
