/* A single compact trail. Each stop contains all three existing game modes. */
(function(root){
'use strict';
let ZM,start,album,activeSign=0,version=0;
const names=['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
const labels=['Созвездие памяти','Оракул','Алхимия звёзд'];
const hints=['Найди пары','Следи за картами','Три в ряд'];
const steps=()=>Campaign.nodesPerSign||10;
const regionHeight=()=>steps()*46+150;
const point=(sign,step)=>({x:300+190*Math.sin(step*.86+sign*.43)+22*Math.sin(step*1.7),y:(11-sign)*regionHeight()+regionHeight()-70-step*46});
function chapterOf(index){return Math.floor(index/(steps()*3));}
function describe(c){const tags=[Campaign.names[c.campaignMode]];if(c.campaignBoss)tags.push('Испытание хранителя');if(c.rest)tags.push('Спокойный уровень');if(c.boss)tags.push('Обратный отсчёт '+c.par+' с');if(c.match3)tags.push(c.moves+' ходов');if(c.trios)tags.push('Триады');if(c.darks)tags.push('Тёмные карты');if(c.oracle)tags.push('до 2 целей · '+c.stages.length+' этапа');if(c.match3)tags.push(c.goal?.type==='seals'?'Лунные печати':c.goal?.type==='collect'?'Сбор цвета':'Сбор символов');if(c.obstacles?.length)tags.push('Замки и лёд');if(c.voids?.length)tags.push('Разрывы поля');return tags.join(' · ');}
function detail(cfg){return describe(cfg)||[cfg.campaignBoss?'Испытание хранителя':'',cfg.rest?'Спокойный уровень':'',cfg.goal?.type==='seals'?'Лунные печати':'',cfg.obstacles?.length?'Замки и лёд':'',cfg.voids?.length?'Разрывы поля':''].filter(Boolean).join(' · ')||'Обычный расклад';}
function dismiss(){const popup=document.querySelector('.node-picker');if(popup){const node=document.querySelector('[data-node="'+popup.dataset.node+'"]');popup.remove();return node;}return null;}
function render(focus=true){
 const host=document.getElementById('campaignMap');if(!host||!ZM)return;
 const s=ZM.save,n=steps(),height=regionHeight(),token=++version,total=n*12;activeSign=s.campaignChapter;
 let regions='',nodes='',path='',previous;
 for(let sign=11;sign>=0;sign--)regions+='<section class="zodiac-region route-region" data-region="'+sign+'" style="top:'+((11-sign)*height)+'px;height:'+height+'px;--world-image:url(assets/route-'+names[sign]+'.webp)"><div class="region-title">'+ZM.GLYPHS[sign]+' '+ZM.SIGNS[sign].name+'<small>'+n+' звёздочек · три режима в каждой</small></div></section>';
 for(let sign=0;sign<12;sign++)for(let step=0;step<n;step++){
  const node=sign*n+step,p=point(sign,step),done=[0,1,2].map(mode=>s.lvStars[Campaign.id(sign,mode,step)]>0),count=done.filter(Boolean).length,allowed=Campaign.available(s,Campaign.id(sign,0,step)),boss=(step+1)%5===0;
  if(!previous)path='M '+p.x+' '+p.y;else{const mid=(previous.y+p.y)/2;path+=' C '+previous.x+' '+mid+' '+p.x+' '+mid+' '+p.x+' '+p.y;}previous=p;
  nodes+='<button class="star-node'+(count===3?' filled':count?' visited':'')+(allowed?'':' locked')+(boss?' guardian':'')+'" data-node="'+node+'" style="left:'+p.x/6+'%;top:'+p.y+'px;--node-progress:'+count/3+'" aria-disabled="'+!allowed+'" tabindex="'+(allowed?'0':'-1')+'" aria-label="'+ZM.SIGNS[sign].name+' · звёздочка '+(node+1)+' · пройдено '+count+' из 3'+(boss?' · хранитель':'')+'"><span class="star-disc">'+(boss?'<i class="star-crown" aria-hidden="true">♛</i>':'')+'<b>'+(node+1)+'</b></span><span class="star-checks" aria-hidden="true">'+done.map((yes,mode)=>'<i class="'+(yes?'checked':'')+'" style="--check-color:'+Campaign.colors[mode]+'">'+(yes?'✓':'·')+'</i>').join('')+'</span></button>';
 }
 host.innerHTML='<header class="path-heading route-heading"><button class="btn path-observatory" id="pathObservatory">☾ Обсерватория</button><span class="eyebrow">ЗВЁЗДНАЯ ТРОПА · '+total+' ЗВЁЗДОЧЕК · '+total*3+' ИСПЫТАНИЙ</span><h2></h2><div class="path-chapters">'+ZM.SIGNS.map((sign,i)=>'<button class="chapter-dot" data-chapter="'+i+'" title="'+sign.name+'">'+ZM.GLYPHS[i]+'</button>').join('')+'</div><div id="pathDetails" role="status">Пройдите любой режим, чтобы идти дальше. Все три — для альбома.</div></header><div class="path-viewport" tabindex="0" aria-label="Единая звёздная тропа"><div class="path-landscape continuous-world star-world" style="height:'+height*12+'px">'+regions+'<svg viewBox="0 0 600 '+height*12+'" preserveAspectRatio="none" aria-hidden="true"><path class="trail-shadow" d="'+path+'"/><path class="trail-line" d="'+path+'"/></svg>'+nodes+'</div></div><footer class="path-footer"><button class="btn" id="pathAtlas">Альбом знаков</button><button class="btn primary" id="pathContinue">Следующая звёздочка ↑</button></footer>';
 const viewport=host.querySelector('.path-viewport');
 function label(sign,persist=false){activeSign=sign;s.campaignChapter=sign;host.querySelector('.path-heading h2').textContent=ZM.GLYPHS[sign]+' '+ZM.SIGNS[sign].name;host.querySelectorAll('[data-chapter]').forEach(b=>b.classList.toggle('selected',+b.dataset.chapter===sign));if(persist)ZM.persist();}
 function reveal(sign,step){dismiss();const candidate=step??Array.from({length:n},(_,i)=>i).find(i=>[0,1,2].every(m=>!s.lvStars[Campaign.id(sign,m,i)])&&Campaign.available(s,Campaign.id(sign,0,i)))??0;const p=point(sign,candidate);viewport.scrollTo({top:Math.max(0,p.y-viewport.clientHeight*.66),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});label(sign);}
 function picker(node,button){
  dismiss();const sign=Math.floor(node/n),step=node%n;
  if(!Campaign.available(s,Campaign.id(sign,0,step))){host.querySelector('#pathDetails').textContent='Пройдите любой режим предыдущей звёздочки.';return;}
  label(sign);const popup=document.createElement('section');popup.className='node-picker';popup.dataset.node=node;popup.tabIndex=-1;popup.setAttribute('role','dialog');popup.setAttribute('aria-labelledby','nodePickerTitle');
  popup.innerHTML='<div class="picker-heading"><b id="nodePickerTitle">✦ '+(node+1)+' · '+ZM.SIGNS[sign].name+'</b><button class="picker-close" aria-label="Закрыть выбор режима">×</button></div><div class="picker-modes">'+[0,1,2].map(mode=>{const id=Campaign.id(sign,mode,step),done=s.lvStars[id]>0;return '<button class="picker-mode'+(done?' done':'')+'" data-play="'+id+'" title="'+labels[mode]+' · '+detail(ZM.LEVELS[id])+'"><span class="mystic-icon" style="--icon-x:'+([0,50,50][mode])+'%;--icon-y:'+([0,0,100][mode])+'%" aria-hidden="true"></span><b>'+labels[mode]+'</b><small>'+hints[mode]+'</small><span class="picker-status">'+(done?'✓ Пройдено':'Играть')+'</span></button>';}).join('')+'</div>';
  host.appendChild(popup);const r=button.getBoundingClientRect(),h=host.getBoundingClientRect(),w=popup.offsetWidth,ph=popup.offsetHeight;
  popup.style.left=Math.max(9,Math.min(h.width-w-9,r.left-h.left+r.width/2-w/2))+'px';popup.style.top=Math.max(host.querySelector('.path-heading').offsetHeight,Math.min(h.height-ph-9,r.bottom-h.top+12+ph<h.height-12?r.bottom-h.top+12:r.top-h.top-ph-12))+'px';
  popup.querySelector('.picker-close').onclick=()=>{dismiss();button.focus({preventScroll:true});};
  popup.querySelectorAll('[data-play]').forEach(b=>{const id=+b.dataset.play;b.onmouseenter=b.onfocus=()=>{host.querySelector('#pathDetails').textContent=labels[ZM.LEVELS[id].campaignMode]+' · '+detail(ZM.LEVELS[id]);};b.onclick=()=>{if(!Campaign.available(s,id))return;s.campaignChapter=sign;s.campaignMode=ZM.LEVELS[id].campaignMode;ZM.persist();dismiss();start(id);};});
  popup.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();dismiss();button.focus({preventScroll:true});}};popup.focus({preventScroll:true});
 }
 host.querySelectorAll('[data-node]').forEach(button=>{if(!button.classList.contains('star-node'))return;const node=+button.dataset.node;button.onclick=()=>picker(node,button);button.onfocus=()=>label(Math.floor(node/n));});
 let scrollFrame;viewport.onscroll=()=>{dismiss();cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(()=>{if(token!==version)return;const sign=Math.max(0,Math.min(11,11-Math.floor((viewport.scrollTop+viewport.clientHeight*.6)/height)));if(sign!==activeSign)label(sign,true);});};
 host.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>reveal(+b.dataset.chapter));host.querySelector('#pathAtlas').onclick=album;host.querySelector('#pathObservatory').onclick=()=>document.querySelector('.personal-observatory').scrollIntoView({behavior:'smooth',block:'start'});
 host.querySelector('#pathContinue').onclick=()=>{const id=Campaign.next(s,s.campaignMode);const sign=chapterOf(id),step=id%n;reveal(sign,step);const button=host.querySelector('[data-node="'+(sign*n+step)+'"]');button.focus({preventScroll:true});};
 label(s.campaignChapter);if(focus)requestAnimationFrame(()=>{if(token===version)reveal(s.campaignChapter);});
}
let resizeFrame;addEventListener('resize',()=>{if(!ZM||!document.getElementById('s_hub')?.classList.contains('active'))return;cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>render());});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.node-picker,.star-node'))dismiss();});
root.CampaignMap={init(zm,launch,open){ZM=zm;start=launch;album=open;},render,describe};
})(window);
