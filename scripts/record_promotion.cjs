/* Records isolated demonstration profiles. Never edits the shipped HTML or a player's save. */
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..'),OUT=process.env.PROMO_WORKDIR||'/tmp/zodiac-trailer';
const URL=process.env.PROMO_URL||'http://localhost:8765/index.html';
if(!['localhost','127.0.0.1'].includes(new globalThis.URL(URL).hostname))throw Error('Use a local static server for recording');
fs.mkdirSync(OUT,{recursive:true});
async function capture(browser,format){
 const horizontal=format==='horizontal',width=horizontal?1600:540,height=horizontal?900:960;
 const context=await browser.newContext({viewport:{width,height},locale:'ru-RU',reducedMotion:'no-preference',recordVideo:{dir:path.join(OUT,format),size:{width,height}}});
 const page=await context.newPage(),epoch=Date.now(),errors=[],clips=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/index.html',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace('            ZM.ready = true;',`window.promoCapture={start:startLevel,kill:killLevel,hub:()=>enterHub(false),oracle:openOracleTable,album:openCampaignAtlas,card:openSignCard,get game(){return G;}};ZM.save.levelGuides={memory:true,oracle:true,alchemy:true};ZM.ready=true;`)}));
 await page.goto(URL);await page.evaluate(()=>I18n.ready);await page.locator('#setupGo').click();await page.waitForTimeout(800);
 await page.evaluate(()=>{
  ZM.modalForceClose();I18n.set('ru');const s=ZM.save;s.sign=5;s.dust=280;s.omens=3;
  s.lvStars.fill(0);for(let i=0;i<30;i++)s.lvStars[i]=3;s.lvOpen[0]=30;s.albumSeen=[0];
  for(let mode=0;mode<3;mode++)s.pathRewards['0:'+mode]=true;
  const o=s.observatory;o.hero='female';o.outfit='astral';o.pet='cat';
  for(const id of ['astral','moon','forest','greyapprentice','starreader','merlin'])o.owned.outfits[id]=true;
  for(const id of ['cat','owl'])o.owned.pets[id]=true;
  o.stats.alchemyWins=10;o.stats.oracleWins=10;o.stats.memoryWins=10;Observatory.render();promoCapture.hub();
 });
 await page.waitForTimeout(3600);await page.evaluate(()=>ZM.modalForceClose());
 async function screenshot(name){if(horizontal){await page.screenshot({path:path.join(OUT,name+'.png')});}}
 async function clip(name,duration,caption,action){
  const start=(Date.now()-epoch)/1000;
  if(action)await action();const left=duration-((Date.now()-epoch)/1000-start);if(left>0)await page.waitForTimeout(left*1000);
  clips.push({name,start,duration,caption});console.log(format+': '+name);await page.waitForTimeout(350);
 }
 async function playMatch(){
  const pair=await page.evaluate(()=>{const g=promoCapture.game;if(!g||g.finished||g.match3?.busy)return null;const m=g.match3;return Match3.findMove(m.board,g.cfg.goal,m.seals,new Set([...m.obstacles.keys(),...m.board.flatMap((v,i)=>v==null?[i]:[])]),m.specials);});
  if(!pair)return false;for(const index of pair){await page.locator('.gem[data-index="'+index+'"]').click();await page.waitForTimeout(140);}return true;
 }
 const opening=await page.evaluate(()=>{
  promoCapture.kill();ZM.modalForceClose();const random=Math.random;let selected=null;
  try{for(let seed=1;seed<=400;seed++){
   let state=seed;Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
   promoCapture.start(20);const m=promoCapture.game.match3,pair=Match3.findMove(m.board),next=m.board;
   [next[pair[0]],next[pair[1]]]=[next[pair[1]],next[pair[0]]];const plan=Match3.combinationPlan(next);
   if(plan.found.length>=5&&plan.spawns.size){selected={seed,matched:plan.found.length,bonuses:[...plan.spawns.values()]};break;}
  }}finally{Math.random=random;}
  if(!selected)throw Error('No opening bonus found');return selected;
 });console.log(format+' opening '+JSON.stringify(opening));await page.waitForTimeout(550);
 await clip('01-alchemy',7.0,'Три режима — твоё предсказание',async()=>{
  for(let i=0;i<4;i++){await playMatch();await page.waitForTimeout(1100);}await screenshot('01-match-three');
 });
 await page.evaluate(()=>{promoCapture.kill();ZM.modalForceClose();Observatory.equip('outfits','moon');Observatory.equip('pets','owl');Observatory.openWardrobe('outfits');});await page.waitForTimeout(300);
 await clip('02-wardrobe-moon',2.0,'Найди свой волшебный образ',async()=>{await page.waitForTimeout(500);await screenshot('04-wardrobe');});
 await page.evaluate(()=>{Observatory.equip('outfits','forest');Observatory.equip('pets','cat');Observatory.openWardrobe('outfits');});await page.waitForTimeout(350);
 await clip('03-wardrobe-forest',1.8,'Наряды и милые спутники');
 await page.evaluate(()=>{ZM.modalForceClose();promoCapture.start(0);});await page.waitForTimeout(650);
 await clip('04-memory',4.2,'Находи пары созвездий',async()=>{
  await screenshot('02-memory');await page.waitForTimeout(450);await page.locator('#peekBanner').click();await page.waitForTimeout(700);
  const pair=await page.evaluate(()=>{const g=promoCapture.game,a=g.deck.findIndex(x=>x.grp.type==='pair');return[a,g.deck.findIndex((x,i)=>i!==a&&x.grp===g.deck[a].grp)];});
  for(const index of pair){await page.locator('#board .cell').nth(index).click();await page.waitForTimeout(300);}await page.waitForTimeout(650);
 });
 await page.evaluate(()=>{promoCapture.kill();Observatory.equip('outfits','astral');ZM.modalForceClose();promoCapture.start(10);});await page.waitForTimeout(750);
 await clip('05-oracle-reveal',1.3,'Запомни карту…',async()=>{await screenshot('03-oracle');});
 await page.waitForFunction(()=>document.getElementById('peekBanner')?.textContent.includes('тасует'),{},{timeout:15000});
 await clip('06-oracle-shuffle',1.8,'…и найди её после тасовки');
 await page.waitForFunction(()=>promoCapture.game&&!promoCapture.game.preview&&!promoCapture.game.busy,{},{timeout:15000});
 await clip('07-oracle-find',1.6,'Доверься своей внимательности',async()=>{
  const index=await page.evaluate(()=>promoCapture.game.deck.findIndex(c=>c.grp.type==='target'&&!c.grp.done));await page.locator('#board .cell').nth(index).click();await page.waitForTimeout(1000);
 });
 await page.evaluate(()=>{promoCapture.kill();ZM.modalForceClose();promoCapture.hub();promoCapture.oracle();});await page.waitForTimeout(350);
 await clip('08-prediction',4.6,'Что звёзды скажут о любви?',async()=>{
  await page.locator('.ft-card[data-cat=love]').click();await page.waitForTimeout(500);await page.locator('#ftYes').click();await page.waitForTimeout(1300);await screenshot('05-prediction');
 });
 await page.evaluate(()=>{ZM.modalForceClose();promoCapture.album();});await page.waitForTimeout(300);
 await clip('09-album',2.8,'Собери все 12 знаков зодиака',async()=>{await screenshot('06-zodiac-album');});
 await page.evaluate(()=>{ZM.modalForceClose();promoCapture.card(0,true);});await page.waitForTimeout(350);
 await clip('10-collection',3.0,'Созвездие памяти · начни своё путешествие');
 const recordSeconds=(Date.now()-epoch)/1000,video=page.video();await context.close();const file=await video.path();
 fs.writeFileSync(path.join(OUT,format+'.json'),JSON.stringify({format,width,height,file,recordSeconds,clips,errors},null,2));
 if(errors.length)throw Error(errors.join('\n'));
}
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});try{await capture(browser,'horizontal');await capture(browser,'vertical');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
