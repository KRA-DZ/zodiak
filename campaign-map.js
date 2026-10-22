(function(root){
let ZM,start,openAtlas,activeSign=-1,version=0;
const HEIGHT=1180;
const tales=['Искра первого шага','Сад терпения','Зеркала двух ветров','Озеро памяти','Пламя сердца','Мастерская звёзд','Весы гармонии','Тайна перерождения','Стрела горизонта','Вершина намерения','Река открытий','Океан сновидений'];
const sheet=sign=>'assets/zodiac-worlds-'+Math.floor(sign/4)+'.png';
function describe(c){const tags=[Campaign.names[c.campaignMode]];if(c.campaignBoss)tags.push('Испытание хранителя');if(c.rest)tags.push('Спокойный уровень');if(c.boss)tags.push('Обратный отсчёт '+c.par+' с');if(c.match3)tags.push(c.moves+' ходов');if(c.trios)tags.push('Триады');if(c.darks)tags.push('Тёмные карты');if(c.oracle)tags.push('до 2 целей · '+c.stages.length+' этапа');if(c.match3)tags.push(c.goal?.type==='seals'?'Лунные печати':c.goal?.type==='collect'?'Сбор цвета':'Сбор символов');if(c.obstacles?.length)tags.push('Замки и лёд');if(c.voids?.length)tags.push('Разрывы поля');return tags.join(' · ');}
function render(focus=true){
 const host=document.getElementById('campaignMap');if(!host||!ZM)return;
 const s=ZM.save,front=Campaign.frontier(s),token=++version,sign=s.campaignChapter;
 let nodes='',regions='',paths='';
 for(let chapter=11;chapter>=0;chapter--){
  const top=(11-chapter)*HEIGHT;
  regions+='<section class="zodiac-region'+(chapter>front?' unreached':'')+'" data-region="'+chapter+'" style="top:'+top+'px;--world-image:url('+sheet(chapter)+');--world-x:'+((chapter%4)*100/3)+'%"><div class="region-title">'+ZM.GLYPHS[chapter]+' '+ZM.SIGNS[chapter].name+'<small>'+tales[chapter]+(chapter>front?' · впереди на пути':'')+'</small></div></section>';
 }
 for(let mode=0;mode<3;mode++){
  let d='';
  for(let chapter=0;chapter<12;chapter++)for(let step=0;step<10;step++){
   const p={x:[105,300,495][(step+mode)%3],y:(11-chapter)*HEIGHT+1080-step*106};
   if(!d)d='M '+p.x+' '+p.y;else{const prev=step?{x:[105,300,495][(step-1+mode)%3],y:p.y+106}:{x:[105,300,495][(9+mode)%3],y:p.y+226};const mid=(prev.y+p.y)/2;d+=' C '+prev.x+' '+mid+' '+p.x+' '+mid+' '+p.x+' '+p.y;}
   const key=Campaign.id(chapter,mode,step),cfg=ZM.LEVELS[key],stars=s.lvStars[key],allowed=Campaign.available(s,key),hint=ZM.SIGNS[chapter].name+' · '+Campaign.names[mode]+' '+(chapter*10+step+1)+' · '+describe(cfg);
   nodes+='<button class="path-node'+(allowed?' available':' locked')+(stars?' completed':'')+(cfg.campaignBoss?' guardian':'')+'" data-level="'+key+'" style="left:'+p.x/6+'%;top:'+p.y+'px;--path-color:'+Campaign.colors[mode]+'" aria-label="'+hint+(allowed?'':' · заблокирован')+'" aria-disabled="'+!allowed+'" tabindex="'+(allowed?'0':'-1')+'" title="'+hint+'"><span class="node-symbol">'+(cfg.campaignBoss?'♛':allowed?['✧','◉','✶'][mode]:'·')+'</span><b>'+(chapter*10+step+1)+'</b><small>'+('★'.repeat(stars)+'☆'.repeat(3-stars))+'</small></button>';
  }
  paths+='<path d="'+d+'" style="--path-color:'+Campaign.colors[mode]+'"/>';
 }
 host.innerHTML='<header class="path-heading"><button class="btn path-observatory" id="pathObservatory">☾ Обсерватория</button><span class="eyebrow">ТРИ ПУТИ · 360 УРОВНЕЙ</span><h2></h2><div class="path-chapters">'+ZM.SIGNS.map((z,i)=>'<button class="chapter-dot'+(i>front?' future':'')+'" data-chapter="'+i+'" title="'+z.name+(i>front?' · будущая область':'')+'">'+ZM.GLYPHS[i]+'</button>').join('')+'</div><div class="path-legend">'+Campaign.names.map((name,m)=>'<button data-mode="'+m+'" style="--path-color:'+Campaign.colors[m]+'">'+['✧','◉','✶'][m]+' '+name+' <small></small></button>').join('')+'</div><div id="pathDetails" role="status">Выберите круг: условия → повторное нажатие для игры.</div></header><div class="path-viewport" tabindex="0" aria-label="Все 360 уровней. Прокручивайте вверх через 12 знаков зодиака"><div class="path-landscape continuous-world" style="height:'+HEIGHT*12+'px">'+regions+'<svg viewBox="0 0 600 '+HEIGHT*12+'" preserveAspectRatio="none" aria-hidden="true">'+paths+'</svg>'+nodes+'</div></div><footer class="path-footer"><button class="btn" id="pathAtlas">Альбом знаков · три печати</button><button class="btn primary" id="pathContinue">Продолжить путь ↑</button></footer>';
 const viewport=host.querySelector('.path-viewport');
 function chapterLabel(chapter,persist=false){
  activeSign=chapter;s.campaignChapter=chapter;
  host.querySelector('.path-heading h2').textContent=ZM.GLYPHS[chapter]+' '+ZM.SIGNS[chapter].name+' · '+tales[chapter];
  host.querySelectorAll('[data-chapter]').forEach(b=>b.classList.toggle('selected',+b.dataset.chapter===chapter));
  host.querySelectorAll('[data-mode]').forEach(b=>{const mode=+b.dataset.mode;b.classList.toggle('selected',mode===s.campaignMode);b.querySelector('small').textContent=Campaign.completed(s,chapter,mode)+'/10';});
  if(persist)ZM.persist();
 }
 function reveal(chapter,mode){
  const key=Array.from({length:10},(_,n)=>Campaign.id(chapter,mode,n)).find(i=>!s.lvStars[i]&&Campaign.available(s,i))??Campaign.id(chapter,mode,0),node=host.querySelector('[data-level="'+key+'"]');
  viewport.scrollTo({top:Math.max(0,parseFloat(node.style.top)-viewport.clientHeight*.68),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  chapterLabel(chapter);
 }
 let scrollFrame;
 viewport.onscroll=()=>{cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(()=>{if(token!==version)return;const chapter=Math.max(0,Math.min(11,11-Math.floor((viewport.scrollTop+viewport.clientHeight*.6)/HEIGHT)));if(chapter!==activeSign)chapterLabel(chapter,true);});};
 host.querySelectorAll('[data-level]').forEach(b=>{
  const key=+b.dataset.level,cfg=ZM.LEVELS[key];
  b.onmouseenter=()=>{if(cfg.campaignSign===activeSign)host.querySelector('#pathDetails').textContent=ZM.SIGNS[cfg.campaignSign].name+' · '+describe(cfg);};
  b.onfocus=()=>{chapterLabel(cfg.campaignSign);host.querySelector('#pathDetails').textContent=ZM.SIGNS[cfg.campaignSign].name+' · '+describe(cfg);};
  b.onclick=()=>{if(!Campaign.available(s,key)){host.querySelector('#pathDetails').textContent='Сначала завершите предыдущий уровень пути или откройте этот знак.';return;}
   if(b.dataset.ready!=='yes'){host.querySelectorAll('[data-ready]').forEach(n=>delete n.dataset.ready);b.dataset.ready='yes';host.querySelector('#pathDetails').textContent=describe(cfg)+' · Нажмите ещё раз, чтобы играть.';return;}
   s.campaignMode=cfg.campaignMode;s.campaignChapter=cfg.campaignSign;ZM.persist();start(key);
  };
 });
 host.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>reveal(+b.dataset.chapter,s.campaignMode));
 host.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{s.campaignMode=+b.dataset.mode;ZM.persist();reveal(activeSign,s.campaignMode);});
 host.querySelector('#pathAtlas').onclick=openAtlas;
 host.querySelector('#pathObservatory').onclick=()=>document.querySelector('.personal-observatory').scrollIntoView({behavior:'smooth',block:'start'});
 host.querySelector('#pathContinue').onclick=()=>{const key=Campaign.next(s,s.campaignMode);s.campaignChapter=Math.floor(key/30);ZM.persist();start(key);};
 chapterLabel(sign);
 if(focus)requestAnimationFrame(()=>{if(token===version)reveal(sign,s.campaignMode);});
}
let resizeFrame;addEventListener('resize',()=>{if(!ZM||!document.getElementById('s_hub')?.classList.contains('active'))return;cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>render());});
root.CampaignMap={init(zm,launch,atlas){ZM=zm;start=launch;openAtlas=atlas;},render,describe};
})(window);
