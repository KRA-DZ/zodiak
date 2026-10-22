(function(root){
let ZM,start,openAtlas,activeSign=-1;
const tales=['Искра первого шага','Сад терпения','Зеркала двух ветров','Озеро памяти','Пламя сердца','Мастерская звёзд','Весы гармонии','Тайна перерождения','Стрела горизонта','Вершина намерения','Река открытий','Океан сновидений'];
function describe(c){const tags=[Campaign.names[c.campaignMode]];if(c.campaignBoss)tags.push('Испытание хранителя');if(c.rest)tags.push('Спокойный уровень');if(c.boss)tags.push('Обратный отсчёт '+c.par+' с');if(c.match3)tags.push(c.moves+' ходов');if(c.trios)tags.push('Триады');if(c.darks)tags.push('Тёмные карты');if(c.oracle)tags.push('до 2 целей · '+c.stages.length+' этапа');if(c.match3)tags.push(c.goal?.type==='seals'?'Лунные печати':c.goal?.type==='collect'?'Сбор цвета':'Сбор символов');if(c.obstacles?.length)tags.push('Замки и лёд');if(c.voids?.length)tags.push('Разрывы поля');return tags.join(' · ');}
function render(focus=true){
 const host=document.getElementById('campaignMap');if(!host||!ZM)return;
 const s=ZM.save,front=Campaign.frontier(s),sign=Math.min(s.campaignChapter,front),changed=activeSign!==sign;activeSign=sign;s.campaignChapter=sign;
 document.body.style.setProperty('--chapter-art','url("'+ZM.COVERS[sign]+'")');
 host.style.setProperty('--chapter-color','hsl('+(sign*29+240)+' 55% 35%)');host.style.setProperty('--chapter-art','url("'+ZM.COVERS[sign]+'")');
 let paths='',nodes='';
 for(let mode=0;mode<3;mode++){
  const points=Array.from({length:10},(_,step)=>({x:[105,300,495][(step+mode)%3],y:1080-step*106}));
  let d='M '+points[0].x+' '+points[0].y;for(let n=1;n<10;n++){const p=points[n-1],q=points[n],mid=(p.y+q.y)/2;d+=' C '+p.x+' '+mid+' '+q.x+' '+mid+' '+q.x+' '+q.y;}
  paths+='<path d="'+d+'" style="--path-color:'+Campaign.colors[mode]+'"/>';
  points.forEach((p,step)=>{const key=Campaign.id(sign,mode,step),cfg=ZM.LEVELS[key],stars=s.lvStars[key],allowed=Campaign.available(s,key),hint=ZM.SIGNS[sign].name+' · '+Campaign.names[mode]+' '+(sign*10+step+1)+' · '+describe(cfg);
   nodes+='<button class="path-node'+(allowed?' available':' locked')+(stars?' completed':'')+(cfg.campaignBoss?' guardian':'')+'" data-level="'+key+'" style="left:'+p.x/6+'%;top:'+p.y+'px;--path-color:'+Campaign.colors[mode]+'" aria-label="'+hint+(allowed?'':' · заблокирован')+'" aria-disabled="'+!allowed+'" title="'+hint+'"><span class="node-symbol">'+(cfg.campaignBoss?'♛':allowed?['✧','◉','✶'][mode]:'·')+'</span><b>'+(sign*10+step+1)+'</b><small>'+('★'.repeat(stars)+'☆'.repeat(3-stars))+'</small></button>';
  });
 }
 host.innerHTML='<header class="path-heading"><button class="btn path-observatory" id="pathObservatory">☾ Личная обсерватория</button><span class="eyebrow">ТРИ ПУТИ · 360 УРОВНЕЙ</span><h2>'+ZM.GLYPHS[sign]+' '+ZM.SIGNS[sign].name+' · '+tales[sign]+'</h2><p>Любой завершённый путь откроет следующий знак. Все три снимут печати карты.</p><div class="path-chapters">'+ZM.SIGNS.map((z,i)=>'<button class="chapter-dot'+(i===sign?' selected':'')+'" data-chapter="'+i+'" '+(i>front?'disabled':'')+' title="'+z.name+'">'+ZM.GLYPHS[i]+'</button>').join('')+'</div><div class="path-legend">'+Campaign.names.map((name,m)=>'<button data-mode="'+m+'" class="'+(s.campaignMode===m?'selected':'')+'" style="--path-color:'+Campaign.colors[m]+'">'+['✧','◉','✶'][m]+' '+name+' <small>'+Campaign.completed(s,sign,m)+'/10</small></button>').join('')+'</div><div id="pathDetails" role="status">Выберите круг: первое нажатие покажет условия, второе — начнёт уровень.</div></header><div class="path-viewport" tabindex="0" aria-label="Карта трёх путей. Прокручивайте вверх к следующим уровням"><div class="path-landscape'+(changed?' chapter-arrival':'')+'"><svg viewBox="0 0 600 1180" preserveAspectRatio="none" aria-hidden="true">'+paths+'</svg>'+nodes+'<div class="path-begin">✦ Начало пути · '+ZM.SIGNS[sign].name+'</div></div></div><footer class="path-footer"><button class="btn" id="pathAtlas">Три печати · звёздный атлас</button><button class="btn primary" id="pathContinue">Продолжить '+Campaign.names[s.campaignMode].toLowerCase()+' ↑</button></footer>';
 host.querySelectorAll('[data-level]').forEach(b=>{
  const key=+b.dataset.level,cfg=ZM.LEVELS[key];
  b.onmouseenter=()=>{document.getElementById('pathDetails').textContent=describe(cfg);};
  b.onfocus=()=>{document.getElementById('pathDetails').textContent=describe(cfg);};
  b.onclick=()=>{if(!Campaign.available(s,key)){document.getElementById('pathDetails').textContent='Сначала пройдите предыдущий уровень этого цвета.';return;}
   if(b.dataset.ready!=='yes'){host.querySelectorAll('[data-ready]').forEach(n=>delete n.dataset.ready);b.dataset.ready='yes';document.getElementById('pathDetails').textContent=describe(cfg)+' · Нажмите ещё раз, чтобы играть.';return;}
   s.campaignMode=cfg.campaignMode;ZM.persist();start(key);
  };
 });
 host.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>{s.campaignChapter=+b.dataset.chapter;ZM.persist();render();});
 host.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{s.campaignMode=+b.dataset.mode;ZM.persist();render();});
 host.querySelector('#pathAtlas').onclick=openAtlas;
 host.querySelector('#pathObservatory').onclick=()=>document.querySelector('.personal-observatory').scrollIntoView({behavior:'smooth',block:'start'});
 host.querySelector('#pathContinue').onclick=()=>{const key=Campaign.next(s,s.campaignMode);s.campaignChapter=Math.floor(key/30);ZM.persist();start(key);};
 if(focus)requestAnimationFrame(()=>{const key=Array.from({length:10},(_,step)=>Campaign.id(sign,s.campaignMode,step)).find(i=>!s.lvStars[i]&&Campaign.available(s,i))??Campaign.id(sign,s.campaignMode,9),node=host.querySelector('[data-level="'+key+'"]'),v=host.querySelector('.path-viewport');v.scrollTo({top:Math.max(0,parseFloat(node.style.top)-v.clientHeight*.68),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
}
let resizeFrame;addEventListener('resize',()=>{if(!ZM||!document.getElementById('s_hub')?.classList.contains('active'))return;cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>render());});
root.CampaignMap={init(zm,launch,atlas){ZM=zm;start=launch;openAtlas=atlas;},render,describe};
})(window);
