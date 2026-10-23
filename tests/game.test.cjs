const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let browser;
before(async () => {
    browser = await chromium.launch({ headless: true,
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
});
after(async () => { await browser?.close(); });

async function game(t, seed, settings = {}) {
    const page = await browser.newPage({ reducedMotion: 'reduce',locale:settings.locale||'ru-RU' });
    t.after(() => page.close());
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    t.after(() => assert.deepEqual(errors, [], 'browser runtime errors'));
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'game.test') return route.abort();
        const name = path.basename(url.pathname);
        if(name==='sdk.js'&&settings.sdkScript)return route.fulfill({contentType:'application/javascript',body:"window.platformCalls=[];window.platformEvents={};window.YaGames={init:async()=>({features:{LoadingAPI:{ready:()=>platformCalls.push('ready')},GameplayAPI:{start:()=>platformCalls.push('start'),stop:()=>platformCalls.push('stop')}},on:(name,fn)=>platformEvents[name]=fn})};"});
        if (name === 'index.html') {
            let html = fs.readFileSync(process.env.GAME_SOURCE || path.join(root, name), 'utf8');
            // Test-only access to private state; the shipped game has no debug API.
            html = html.replace('            ZM.ready = true;', `
                window.testGame = {
                    start: startLevel, kill: killLevel, preview: beginPreview, hub: buildHub,
                    guardian:renderGuardian, win: finishWin, endless: startEndless, ritual: claimRitual, renderJourney: renderJourney, oracle: openOracleTable, reveal: ftReveal, journal: openJournal, calendar: openCalendar, guide: openGuide, map: useMap, power: usePower, click: onCell,
                    get state() { return G; }, get selection() { return SEL; }
                };
                ZM.save.levelGuides = {memory:true,oracle:true,alchemy:true};
                ZM.ready = true;`);
            return route.fulfill({ contentType: 'text/html', body: html });
        }
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + path.sep)) return route.fulfill({ status: 404, body: '' });
        if (fs.existsSync(file)) return route.fulfill({ path: file });
        return route.fulfill({ status: 404, body: '' });
    });
    if (settings.sdk) await page.addInitScript(() => { window.platformCalls=[];window.platformEvents={};window.YaGames={init:async()=>({features:{LoadingAPI:{ready:()=>platformCalls.push('ready')},GameplayAPI:{start:()=>platformCalls.push('start'),stop:()=>platformCalls.push('stop')}},on:(name,fn)=>platformEvents[name]=fn})}; });
    if(settings.rewarded)await page.addInitScript(()=>{window.adRequests=0;window.YaGames={init:async()=>({features:{LoadingAPI:{ready(){}},GameplayAPI:{start(){},stop(){}}},on(){},adv:{showRewardedVideo({callbacks}){window.adCallbacks=callbacks;window.adRequests++;callbacks.onOpen();}}})};});
    if(settings.sdkLanguage)await page.addInitScript(lang=>{window.platformCalls=[];window.YaGames={init:async()=>({environment:{i18n:{lang}},features:{LoadingAPI:{ready:()=>platformCalls.push('ready')},GameplayAPI:{start(){},stop(){}}},on(){}})};},settings.sdkLanguage);
    if(settings.language)await page.addInitScript(value=>{if(!localStorage.getItem('zodiacMemory.language'))localStorage.setItem('zodiacMemory.language',value);},settings.language);
    if (seed) await page.addInitScript(save => { if(!localStorage.getItem('zodiacMemory.v3'))localStorage.setItem('zodiacMemory.v3', JSON.stringify(save)); }, settings.legacyEconomy?seed:{...seed,economyVersion:2});
    if (!settings.realTime) {
        await page.clock.install();
        // Deterministic model tests omit native animations; real-time tests verify falling frames.
        await page.addInitScript(() => { Element.prototype.animate = undefined; });
    }
    await page.goto(settings.url||'http://game.test/index.html');
    return page;
}

async function start(page, index = 0) {
    await page.evaluate(i => { testGame.kill(); testGame.start(i); }, index);
    await page.clock.runFor(32);
}

async function skipPreview(page) {
    await page.evaluate(() => document.getElementById('peekBanner').click());
    await page.clock.runFor(600);
}

async function settleAlchemy(page) {
    for (let n=0;n<30;n++) {
        const idle=await page.evaluate(()=>!testGame.state || testGame.state.finished || !testGame.state.match3.busy);
        if(idle) return;
        await page.clock.runFor(1000);
    }
    assert.fail('alchemy did not settle within 30 seconds');
}

test('early preview skip closes every card and allows normal play', async t => {
    const page = await game(t);
    await start(page);
    await skipPreview(page);
    assert.equal(await page.locator('#board .peek').count(), 0);
    assert.equal(await page.evaluate(() => testGame.state.running), true);
});

test('delayed match animation cannot clear cards or throw after leaving', async t => {
    const page = await game(t);
    await start(page);
    await skipPreview(page);
    await page.evaluate(() => {
        const g = testGame.state;
        const a = g.deck.findIndex(cd => cd.grp.type === 'pair');
        const b = g.deck.findIndex((cd, i) => i !== a && cd.grp === g.deck[a].grp);
        testGame.click(a); testGame.click(b);
    });
    await page.clock.runFor(450);
    await page.evaluate(() => testGame.kill());
    await page.clock.runFor(800);
});

test('old winning callback cannot finish a new level', async t => {
    const page = await game(t);
    await start(page);
    await skipPreview(page);
    await page.evaluate(() => {
        const g = testGame.state;
        g.cleared = g.needed - 1;
        const a = 0;
        const b = g.deck.findIndex((cd, i) => i !== a && cd.grp === g.deck[a].grp);
        testGame.click(a); testGame.click(b);
    });
    await page.clock.runFor(450);
    await start(page);
    await page.clock.runFor(800);
    assert.equal(await page.evaluate(() => testGame.state.finished), false);
    assert.equal(await page.locator('#menuBtn').count(), 0);
});

test('leaving a reveal resets global and board effects', async t => {
    const page = await game(t);
    await start(page);
    await skipPreview(page);
    await page.evaluate(() => {
        testGame.state.streak = 3;
        testGame.power();
        document.getElementById('board').classList.add('faded');
        testGame.kill();
    });
    assert.equal(await page.locator('body.peeking').count(), 0);
    await start(page);
    assert.equal(await page.locator('#board.faded, #board.reveal-flash').count(), 0);
});

test('astro map records both removed pairs in persistent statistics', async t => {
    const page = await game(t);
    await start(page);
    await skipPreview(page);
    await page.evaluate(() => { ZM.save.inv.map = 1; testGame.map(); });
    assert.equal(await page.evaluate(() => testGame.state.cleared), 2);
    assert.equal(await page.evaluate(() => ZM.save.stats.matchesTotal), 2);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('zodiacMemory.v3')).stats.matchesTotal), 2);
});

test('a complete level awards stars, unlocks the next level and survives reload', async t => {
    const page = await game(t);
    await start(page);
    await skipPreview(page);
    for (let i = 0; i < 8; i++) {
        await page.evaluate(() => {
            const g = testGame.state;
            const gr = g.groups.find(gr => !gr.done);
            g.deck.forEach((cd, j) => { if (cd.grp === gr) testGame.click(j); });
        });
        await page.clock.runFor(600);
    }
    await page.clock.runFor(1000);
    assert.equal(await page.evaluate(() => testGame.state.finished), true);
    assert.equal(await page.evaluate(() => ZM.save.lvStars[0]), 3);
    assert.equal(await page.evaluate(() => ZM.save.lvOpen[0]), 2);
    await page.reload();
    assert.equal(await page.evaluate(() => ZM.save.lvStars[0]), 3);
    assert.equal(await page.evaluate(() => ZM.save.lvOpen[0]), 2);
});

test('all 360 levels render cards without runtime errors', async t => {
    const page = await game(t);
    assert.equal(await page.evaluate(() => ZM.LEVELS96.length), 360);
    for (let index = 0; index < 360; index++) {
        await start(page, index);
        const result = await page.evaluate(() => ({
            cards: document.querySelectorAll('#board .cell').length,
            gems: document.querySelectorAll('#board .gem').length,
            deck: testGame.state.deck.length,
            size:testGame.state.cfg.rows*testGame.state.cfg.cols,
            missingSymbols: testGame.state.deck.some(cd => !ZM.SYMS[cd.grp.sym]),
        }));
        if (result.gems) { assert.equal(result.gems, result.size); continue; }
        assert.ok(result.cards > 0, `level ${index + 1}`);
        assert.equal(result.cards, result.deck, `level ${index + 1}`);
        assert.equal(result.missingSymbols, false, `level ${index + 1}`);
    }
    await page.evaluate(() => testGame.kill());
    await page.clock.runFor(1000);
});

test('oracle completes its first shuffle and cancels pending target animation on exit', async t => {
    const page = await game(t);
    const index = await page.evaluate(() => ZM.LEVELS96.findIndex(cfg => cfg.oracle));
    assert.ok(index >= 0);
    await start(page, index);
    await page.clock.runFor(18000);
    assert.equal(await page.evaluate(() => testGame.state.preview), false);
    await page.evaluate(() => {
        const index = testGame.state.deck.findIndex(cd => cd.grp.type === 'target');
        testGame.click(index);
        testGame.kill();
    });
    await page.clock.runFor(1500);
});

test('a pending mismatch cannot close pairs removed by the astro map', async t => {
    const page = await game(t);
    await start(page);
    await skipPreview(page);
    await page.evaluate(() => {
        const g = testGame.state;
        const groups = g.groups.slice(0, 2);
        groups.forEach(gr => testGame.click(g.deck.findIndex(cd => cd.grp === gr)));
        window.mapIndices = g.deck.flatMap((cd, i) => groups.includes(cd.grp) ? [i] : []);
    });
    await page.clock.runFor(320);
    await page.evaluate(() => {
        const shuffle = ZM.shuffle;
        ZM.shuffle = a => a;
        ZM.save.inv.map = 1;
        testGame.map();
        ZM.shuffle = shuffle;
    });
    await page.clock.runFor(1600);
    assert.equal(await page.evaluate(() => mapIndices.every(i => {
        const cell = document.getElementById('board').children[i];
        return cell.classList.contains('cleared') && cell.classList.contains('open');
    })), true);
});

test('mobile setup, atlas and level selection work through visible controls', async t => {
    const page = await game(t);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.zpick').first().click();
    await page.locator('#setupGo').click();
    await page.clock.runFor(500);
    await page.locator('#modalRoot [data-close]').click();
    await page.locator('[data-node="0"]').click();
    await page.locator('[data-play="0"]').click();
    await page.clock.runFor(4500);
    assert.equal(await page.locator('#s_game.active').count(), 1);
    assert.equal(await page.locator('#board .cell').count(), 16);
    const bounds = await page.locator('#board').boundingBox();
    assert.ok(bounds.width > 0 && bounds.x >= 0 && bounds.x + bounds.width <= 390);
});

test('match3 swaps, resolves cascades, awards campaign stars and cleans up on exit', async t => {
    const page = await game(t);
    await start(page, 20);
    assert.equal(await page.locator('#board .gem').count(), 36);
    // Make actual valid exchanges through the same button handlers a player uses.
    for (let n=0; n<40; n++) {
        const status = await page.evaluate(() => ({ finished: testGame.state.finished, busy: testGame.state.match3.busy }));
        if (status.finished) break;
        const pair = await page.evaluate(() => {
            const board = testGame.state.match3.board;
            let best = null, max = 0;
            for(let i=0;i<36;i++) for(const j of [i+1,i+6]) {
                if(!Match3.adjacent(i,j)) continue;
                const next=board.slice(); [next[i],next[j]]=[next[j],next[i]];
                const count=Match3.matches(next).length;
                if(count>max) {max=count;best=[i,j];}
            }
            return best;
        });
        assert.ok(pair);
        await page.evaluate(([a,b]) => {
            const gems=document.querySelectorAll('.gem'); gems[a].click();gems[b].click();
        },pair);
        await settleAlchemy(page);
    }
    const result = await page.evaluate(() => ({ stars: ZM.save.lvStars[20], finished: testGame.state.finished }));
    assert.equal(result.finished,true);
    // Both victory and a legitimate out-of-moves result are supported.
    if(result.stars) {
        assert.ok(result.stars>=1 && result.stars<=3);
        assert.equal(await page.evaluate(()=>ZM.save.lvOpen[0]),22);
    } else assert.equal(await page.locator('#alchemyRetry').count(),1);
    await page.evaluate(()=>testGame.kill());
    await page.clock.runFor(1000);
});

test('invalid match3 exchange keeps moves and a hint is not spent during a cascade', async t => {
    const page=await game(t);
    await start(page,20);
    const result=await page.evaluate(()=>{
        const g=testGame.state, board=g.match3.board;
        let pair;
        for(let i=0;i<36&&!pair;i++) for(const j of [i+1,i+6]) {
            if(!Match3.adjacent(i,j))continue;
            const next=board.slice();[next[i],next[j]]=[next[j],next[i]];
            if(!Match3.matches(next).length){pair=[i,j];break;}
        }
        const before=g.match3.moves;
        document.querySelectorAll('.gem')[pair[0]].click();
        document.querySelectorAll('.gem')[pair[1]].click();
        return {before,after:g.match3.moves};
    });
    assert.equal(result.before,result.after);
    await page.clock.runFor(600);
    await page.evaluate(()=>{
        const pair=Match3.findMove(testGame.state.match3.board);
        document.querySelectorAll('.gem')[pair[0]].click();document.querySelectorAll('.gem')[pair[1]].click();
        document.getElementById('btnHint').click();
    });
    assert.equal(await page.evaluate(()=>testGame.state.hintFree),true);
    await page.evaluate(()=>testGame.kill());
    await page.clock.runFor(1500);
});

test('endless rewards are banked once, do not unlock campaign, and resume after reload', async t => {
    const page=await game(t);
    await page.evaluate(()=>{ZM.save.sign=0;testGame.endless();});
    await page.clock.runFor(32);
    const old=await page.evaluate(()=>ZM.save.dust);
    await page.evaluate(()=>{testGame.win();testGame.win();});
    assert.equal(await page.evaluate(()=>ZM.save.dust),old+19);
    assert.equal(await page.evaluate(()=>ZM.save.endless.round),2);
    assert.equal(await page.evaluate(()=>ZM.save.lvStars.reduce((a,b)=>a+b,0)),0);
    await page.reload();
    assert.equal(await page.evaluate(()=>ZM.save.endless.round),2);
    await page.evaluate(()=>{ZM.modalForceClose();testGame.endless();});
    assert.equal(await page.evaluate(()=>!!testGame.state.oracle),true);
});

test('ritual reward can be claimed once per day and resets on the next day', async t => {
    const page=await game(t);
    await page.evaluate(()=>{
        ZM.save.sign=0;
        ZM.save.ritual={day:ZM.todayISO(),wins:3,claimed:false};
        testGame.ritual();testGame.ritual();
    });
    assert.equal(await page.evaluate(()=>ZM.save.dust),20);
    assert.equal(await page.evaluate(()=>ZM.save.omens),1);
    await page.evaluate(()=>{ZM.save.ritual.day='2000-01-01';testGame.renderJourney();});
    assert.equal(await page.evaluate(()=>ZM.save.ritual.wins),0);
    assert.equal(await page.evaluate(()=>ZM.save.ritual.claimed),false);
});

test('prediction consumes one seal, archives once and remains readable on another day and sign', async t => {
    const page=await game(t);
    await page.evaluate(()=>{
        ZM.save.sign=0;ZM.save.dust=70;ZM.save.omens=1;
        testGame.oracle();testGame.reveal('love');testGame.reveal('love');
    });
    const text=await page.evaluate(()=>ZM.save.preds.love.text);
    assert.ok(text.length>40);
    assert.equal(await page.evaluate(()=>ZM.save.dust),70);
    assert.equal(await page.evaluate(()=>ZM.save.omens),0);
    assert.equal(await page.evaluate(()=>ZM.save.journal.length),1);
    await page.evaluate(()=>{ZM.save.sign=1;testGame.oracle();testGame.reveal('love');});
    assert.equal(await page.evaluate(()=>ZM.save.dust),20);
    await page.evaluate(()=>{ZM.save.sign=0;testGame.oracle();});
    assert.equal(await page.evaluate(()=>ZM.save.preds.love.text),text);
    await page.evaluate(()=>{ZM.save.predDay='2000-01-01';testGame.journal();});
    assert.equal(await page.locator('.journal-entry').count(),2);
});

test('a completed calendar repeats and login streak rewards cannot be claimed twice', async t => {
    const page=await game(t);
    await page.evaluate(()=>{
        ZM.save.sign=0;ZM.save.calTaken=Array.from({length:31},(_,i)=>i+1);
        ZM.save.calLast='2000-01-01';testGame.calendar();
    });
    assert.equal(await page.locator('[data-claim="1"]').count(),1);
    await page.locator('[data-claim="1"]').click();
    assert.equal(await page.evaluate(()=>ZM.save.calTaken.length),1);
    assert.equal(await page.evaluate(()=>ZM.save.loginStreak),1);
    const dust=await page.evaluate(()=>ZM.save.dust);
    await page.evaluate(()=>testGame.calendar());
    assert.equal(await page.locator('[data-claim]').count(),0);
    assert.equal(await page.evaluate(()=>ZM.save.dust),dust);
});

test('campaign migration in a current-economy save retains currency, calendar and purchased prediction', async t => {
    const page=await game(t);
    await page.evaluate(()=>{
        const save=JSON.parse(JSON.stringify(ZM.save));
        delete save.journeyVersion; delete save.predSign;
        save.sign=1;save.dust=321;save.lvStars=new Array(84).fill(0);
        save.lvStars[7]=3;save.lvStars[13]=2;save.lvOpen=new Array(12).fill(1);save.lvOpen[1]=7;
        save.stats.fast=[7,13];save.calTaken=[1,2];save.predDay=ZM.todayISO();
        save.preds.love={count:1,last:0};save.journal=[];
        localStorage.setItem('zodiacMemory.v3',JSON.stringify(save));
    });
    await page.reload();
    assert.equal(await page.evaluate(()=>ZM.save.lvStars[9]),0);
    assert.equal(await page.evaluate(()=>ZM.save.lvStars[15]),0);
    assert.equal(await page.evaluate(()=>ZM.save.lvOpen[1]),1);
    assert.equal(await page.evaluate(()=>ZM.save.dust),321);
    assert.equal(await page.evaluate(()=>ZM.save.calTaken.length),2);
    assert.equal(await page.evaluate(()=>ZM.save.preds.love.count),1);
    assert.ok(await page.evaluate(()=>ZM.save.preds.love.text.length>20));
    assert.deepEqual(await page.evaluate(()=>ZM.save.stats.fast),[]);
});

test('match3 real move can win and persist stars, while exhausted moves never award a win', async t => {
    const page=await game(t);
    await page.evaluate(()=>{ZM.save.ach.cascade3=true;ZM.save.ach.cascade5=true;testGame.start(7,{cfg:{match3:true,rows:6,cols:6,target:3,moves:1,par:180}});});
    await page.clock.runFor(32);
    await page.evaluate(()=>{
        const pair=Match3.findMove(testGame.state.match3.board);
        document.querySelectorAll('.gem')[pair[0]].click();document.querySelectorAll('.gem')[pair[1]].click();
    });
    await settleAlchemy(page);
    assert.ok(await page.evaluate(()=>ZM.save.lvStars[7]>0));
    const dust=await page.evaluate(()=>ZM.save.dust);
    await page.evaluate(()=>{ZM.modalForceClose();testGame.start(8,{cfg:{match3:true,rows:6,cols:6,target:10000,moves:1,par:180}});});
    await page.clock.runFor(32);
    await page.evaluate(()=>{
        const b=testGame.state.match3.board;
        let pair;
        for(let i=0;i<36&&!pair;i++)for(const j of[i+1,i+6]){
            if(!Match3.adjacent(i,j))continue;
            const next=b.slice();[next[i],next[j]]=[next[j],next[i]];
            if(Match3.matches(next).length===3){pair=[i,j];break;}
        }
        if(!pair) pair=Match3.findMove(b);
        document.querySelectorAll('.gem')[pair[0]].click();document.querySelectorAll('.gem')[pair[1]].click();
    });
    await settleAlchemy(page);
    // A large first cascade can legitimately grant one extra move. Finish it too.
    for(let n=0;n<40 && !await page.evaluate(()=>testGame.state.finished);n++) {
        await page.evaluate(()=>{
            const pair=Match3.findMove(testGame.state.match3.board);
            document.querySelectorAll('.gem')[pair[0]].click();document.querySelectorAll('.gem')[pair[1]].click();
        });
        await settleAlchemy(page);
    }
    assert.equal(await page.locator('#alchemyRetry').count(),1);
    assert.equal(await page.evaluate(()=>ZM.save.lvStars[8]),0);
    assert.equal(await page.evaluate(()=>ZM.save.dust),dust);
});

test('rapid level changes only start the current preview and collector sees all thirty levels', async t => {
    const page=await game(t);
    await page.evaluate(()=>{testGame.start(0);testGame.start(30);});
    await page.clock.runFor(32);
    assert.equal(await page.locator('#peekBanner').count(),1);
    assert.equal(await page.evaluate(()=>testGame.state.sign),1);
    const result=await page.evaluate(()=>{
        ZM.save.lvStars.fill(3);
        return {done:ZM.signDone(1),collected:ZM.ACHDEFS.find(a=>a.id==='collector').test()};
    });
    assert.deepEqual(result,{done:30,collected:true});
});

test('mobile predictions are readable, cost is shown and atlas art fits its column', async t => {
    const page=await game(t);
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{document.querySelector('.zpick').click();document.getElementById('setupGo').click();});
    await page.clock.runFor(800);
    await page.evaluate(()=>{ZM.modalForceClose();ZM.save.dust=100;testGame.oracle();});
    await page.clock.runFor(500);
    const card=page.locator('.ft-card[data-cat="love"]');
    await card.click();
    assert.match(await page.locator('#ftStrip').innerText(),/50/);
    await page.locator('#ftYes').click();
    await page.clock.runFor(1000);
    const sizes=await card.evaluate(el=>{
        const text=el.querySelector('.tx'),b=el.getBoundingClientRect();
        return {font:parseFloat(getComputedStyle(text).fontSize),width:b.width,left:b.left,right:b.right,text:text.textContent};
    });
    assert.ok(sizes.font>=14);
    assert.ok(sizes.width>240 && sizes.left>=0 && sizes.right<=390);
    assert.ok(sizes.text.length>40);
    await page.evaluate(()=>ZM.modalForceClose());
    await page.evaluate(()=>ZM.modalForceClose());await page.locator('#openAtlas').click();
    // Wait for the modal entrance transform before measuring its final mobile width.
    await page.waitForFunction(()=>{const r=document.querySelector('#atlasModal .map-panel').getBoundingClientRect();return r.width>300&&r.left>=0&&r.right<=390;});
    const fit=await page.locator('#atlasModal .map-panel').evaluate(el=>{
        const b=el.getBoundingClientRect();return {left:b.left,right:b.right,width:b.width,images:el.querySelectorAll('.zcover img').length};
    });
    assert.equal(fit.images,12);
    assert.ok(fit.left>=0 && fit.right<=390 && fit.width>300);
    assert.equal(await page.locator('#atlasTotal').count(),0);
});

test('import previews progress, can be cancelled, then restores with a backup',async t=>{
    const page=await game(t);
    const imported=await page.evaluate(()=>{
        const s=JSON.parse(JSON.stringify(ZM.save));s.sign=0;s.dust=777;s.lvStars[9]=3;s.lvOpen[1]=2;
        return {format:'zodiac-memory',version:1,save:s};
    });
    const file={name:'my-journey.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))};
    await page.evaluate(()=>testGame.journal());
    await page.locator('.save-tools summary').click();
    await page.locator('#importFile').setInputFiles(file);
    await page.locator('#confirmImport').waitFor();
    assert.equal(await page.evaluate(()=>ZM.save.dust),0);
    await page.locator('#modalRoot [data-close]').click();
    assert.equal(await page.evaluate(()=>ZM.save.dust),0);
    await page.evaluate(()=>testGame.journal());
    await page.locator('#importFile').setInputFiles(file);
    await page.locator('#confirmImport').waitFor();
    await Promise.all([page.waitForEvent('load'),page.locator('#confirmImport').click()]);
    assert.equal(await page.evaluate(()=>ZM.save.dust),777);
    assert.equal(await page.evaluate(()=>ZM.save.lvStars[9]),3);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('zodiacMemory.beforeImport')).dust),0);
});

test('invalid import never changes current progress',async t=>{
    const page=await game(t);
    await page.evaluate(()=>{ZM.save.dust=123;ZM.persist();testGame.journal();});
    await page.locator('.save-tools summary').click();
    await page.locator('#importFile').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"format":"wrong"}')});
    await page.waitForFunction(()=>document.getElementById('importError').textContent.length>0);
    assert.equal(await page.evaluate(()=>ZM.save.dust),123);
    assert.equal(await page.locator('#confirmImport').count(),0);
});

test('alchemy shows mission types, preserves tiles on selection, and supports arrow-key focus',async t=>{
    const page=await game(t);
    await start(page,23);
    assert.equal(await page.locator('.gem.sealed').count(),6);
    assert.match(await page.locator('#missionTitle').innerText(),/печати/);
    await page.locator('.gem').nth(0).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.index),'1');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.index),'1');
    assert.equal(await page.locator('.gem.selected').count(),1);
    await start(page,22);
    assert.match(await page.locator('#missionTitle').innerText(),/Роза/);
});

test('reduced motion settles gameplay and cancels all animation effects on exit',async t=>{
    const page=await game(t);
    await page.emulateMedia({reducedMotion:'reduce'});
    await start(page,20);
    await page.evaluate(()=>{
        const pair=Match3.findMove(testGame.state.match3.board);
        document.querySelectorAll('.gem')[pair[0]].click();document.querySelectorAll('.gem')[pair[1]].click();
    });
    await settleAlchemy(page);
    assert.equal(await page.locator('.alchemy-spark,.alchemy-praise').count(),0);
    await page.evaluate(()=>testGame.kill());
    await page.clock.runFor(2000);
    assert.equal(await page.locator('.resolving').count(),0);
});

test('mobile hub keeps secondary actions in a keyboard-accessible menu',async t=>{
    const page=await game(t);
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{document.querySelector('.zpick').click();document.getElementById('setupGo').click();});
    await page.clock.runFor(800);
    await page.evaluate(()=>ZM.modalForceClose());
    assert.equal(await page.locator('#hubTools').isVisible(),false);
    await page.locator('#btnHubMenu').click();
    await page.waitForFunction(()=>document.getElementById('hubTools').clientWidth>0);
    assert.equal(await page.locator('#hubTools').isVisible(),true);
    await page.locator('#btnProfile').click();
    assert.equal(await page.locator('#hubTools').isVisible(),false);
    assert.equal(await page.locator('[role="dialog"]').count(),1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[role="dialog"]').count(),0);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'btnHubMenu');
    const width=await page.locator('.topbar').evaluate(el=>el.scrollWidth<=el.clientWidth);
    assert.equal(width,true);
});

test('touch-style swipe makes one exchange and keyboard focus survives a cascade',async t=>{
    const page=await game(t);
    await start(page,20);
    const pair=await page.evaluate(()=>Match3.findMove(testGame.state.match3.board));
    const a=await page.locator('.gem').nth(pair[0]).boundingBox(),b=await page.locator('.gem').nth(pair[1]).boundingBox();
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
    await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:5});await page.mouse.up();
    await settleAlchemy(page);
    assert.ok(await page.evaluate(()=>testGame.state.cleared>0));
    await page.evaluate(()=>testGame.start(7,{cfg:{match3:true,rows:6,cols:6,target:10000,moves:5,par:180}}));
    await page.clock.runFor(32);
    const keys=await page.evaluate(()=>Match3.findMove(testGame.state.match3.board));
    await page.locator('.gem').nth(keys[0]).focus();await page.keyboard.press('Enter');
    await page.locator('.gem').nth(keys[1]).focus();await page.keyboard.press('Enter');
    await settleAlchemy(page);
    assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.gem')),true);
});

test('previous journey can be restored after an import',async t=>{
    const page=await game(t);
    await page.evaluate(()=>{
        const previous=JSON.parse(JSON.stringify(ZM.save));previous.dust=345;
        localStorage.setItem('zodiacMemory.beforeImport',JSON.stringify(previous));
        ZM.save.dust=900;ZM.persist();testGame.journal();
    });
    await page.locator('.save-tools summary').click();await page.locator('#undoImport').click();
    await page.locator('#confirmImport').waitFor();
    assert.equal(await page.evaluate(()=>ZM.save.dust),900);
    await Promise.all([page.waitForEvent('load'),page.locator('#confirmImport').click()]);
    assert.equal(await page.evaluate(()=>ZM.save.dust),345);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('zodiacMemory.beforeImport')).dust),900);
});

test('real animation keeps survivors moving downward and waits before the next cascade',async t=>{
    const page=await game(t,undefined,{realTime:true});
    assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion:reduce)').matches),true);
    await page.evaluate(()=>{let seed=1;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};ZM.modalForceClose();testGame.start(7,{cfg:{match3:true,rows:6,cols:6,target:3,moves:8,par:180}});});
    await page.waitForTimeout(650);
    await page.evaluate(()=>{
        const board=testGame.state.match3.board;let best=null,deep=-1;
        for(let i=0;i<36;i++)for(const j of[i+1,i+6]){
            if(!Match3.adjacent(i,j))continue;
            const next=board.slice();[next[i],next[j]]=[next[j],next[i]];
            const found=Match3.matches(next);
            if(found.length&&Math.max(...found)>deep){deep=Math.max(...found);best=[i,j];}
        }
        window.oldMotionTiles=[...document.querySelectorAll('.gem')];
        oldMotionTiles[best[0]].click();oldMotionTiles[best[1]].click();
    });
    await page.waitForFunction(()=>document.getElementById('board').dataset.phase==='clear');
    await page.evaluate(()=>{window.dropPositions=new Map([...document.querySelectorAll('.gem')].map(el=>[el,parseFloat(el.style.top)]));});
    await page.waitForFunction(()=>document.getElementById('board').dataset.phase==='fall');
    await page.waitForTimeout(90);
    const first=await page.evaluate(()=>{
        window.fallingTile=[...document.querySelectorAll('.gem')].filter(el=>dropPositions.has(el)&&parseFloat(el.style.top)-dropPositions.get(el)>10).sort((a,b)=>(parseFloat(b.style.top)-dropPositions.get(b))-(parseFloat(a.style.top)-dropPositions.get(a)))[0];
        if(!fallingTile)return null;
        return {y:new DOMMatrixReadOnly(getComputedStyle(fallingTile).transform).m42,top:parseFloat(fallingTile.style.top),delta:parseFloat(fallingTile.style.top)-dropPositions.get(fallingTile),phase:document.getElementById('board').dataset.phase,motion:Observatory.state().motion,animations:fallingTile.getAnimations().map(a=>({state:a.playState,time:a.currentTime,frames:a.effect.getKeyframes()}))};
    });
    assert.ok(first,'a survivor should fall from a higher cell');
    assert.ok(first.y < -1,'survivor must still be above its target during the fall: '+JSON.stringify(first));
    await page.waitForTimeout(160);
    const second=await page.evaluate(()=>({y:new DOMMatrixReadOnly(getComputedStyle(fallingTile).transform).m42,phase:document.getElementById('board').dataset.phase}));
    assert.equal(second.phase,'fall');assert.ok(second.y>first.y,'survivor should move down continuously');
    await page.waitForFunction(()=>testGame.state.finished,{},{timeout:30000});
    assert.equal(await page.locator('#board').getAttribute('data-phase'),'complete');
    await page.evaluate(()=>{ZM.modalForceClose();testGame.start(20);});
    await page.waitForTimeout(450);
    await page.evaluate(()=>{const pair=Match3.findMove(testGame.state.match3.board);document.querySelectorAll('.gem')[pair[0]].click();document.querySelectorAll('.gem')[pair[1]].click();});
    await page.waitForFunction(()=>document.getElementById('board').dataset.phase==='fall');
    await page.evaluate(()=>testGame.kill());
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(()=>testGame.state),null);
    assert.equal(await page.locator('#board').getAttribute('data-phase'),null);
});

test('outfits cannot be directly purchased and owned shared outfits persist between heroes',async t=>{
    const page=await game(t);
    const outcome=await page.evaluate(()=>{
        ZM.save.dust=500;Observatory.setHero('female');
        const blocked=Observatory.buy('outfits','astral');Observatory.giveReward({cosmetics:[{kind:'outfits',id:'astral'}]});const bought=Observatory.buy('outfits','astral'),after=ZM.save.dust;if(blocked)throw new Error('Direct costume sale');
        Observatory.buy('outfits','astral');Observatory.setHero('male');
        return {bought,after,current:ZM.save.dust,hero:Observatory.state().hero,outfit:Observatory.state().outfit};
    });
    assert.equal(outcome.bought,true);assert.equal(outcome.after,outcome.current);
    assert.equal(outcome.hero,'male');assert.equal(outcome.outfit,'astral');
    await page.reload();
    assert.equal(await page.evaluate(()=>Observatory.state().outfit),'astral');
    assert.equal(await page.evaluate(()=>Observatory.state().hero),'male');
    await page.evaluate(()=>Observatory.openWardrobe());
    assert.equal(await page.locator('.figure-art').count()>0,true);
});

test('tutorial and completed book unlock cosmetic trophies exactly once',async t=>{
    const page=await game(t);
    await page.evaluate(()=>testGame.guide());
    await page.locator('#tutorialDone').click();
    assert.equal(await page.evaluate(()=>ZM.save.skins.roseglass),true);
    const dust=await page.evaluate(()=>ZM.save.dust);
    await page.evaluate(()=>{testGame.guide();document.getElementById('tutorialDone').click();});
    assert.equal(await page.evaluate(()=>ZM.save.dust),dust);
    await page.evaluate(()=>{for(let i=0;i<30;i++)ZM.save.lvStars[i]=1;Observatory.check();});
    assert.equal(await page.evaluate(()=>Observatory.owned('outfits','moon')),true);
    assert.equal(await page.evaluate(()=>Observatory.owned('pets','owl')),true);
    assert.equal(await page.evaluate(()=>ZM.save.ach.first_book),true);
});

test('daily cosmetic gifts convert duplicates and equipped scenes survive save import validation',async t=>{
    const page=await game(t);
    const outcome=await page.evaluate(()=>{
        Observatory.giveReward({cosmetics:[{kind:'pets',id:'cat'}]});
        const before=ZM.save.dust;
        Observatory.giveReward({cosmetics:[{kind:'pets',id:'cat'}]});
        const duplicateDust=ZM.save.dust-before;
        ZM.save.dust+=500;Observatory.buy('backgrounds','garden');Observatory.equip('pets','cat');
        const parsed=SaveFiles.parse(JSON.stringify({format:'zodiac-memory',version:1,save:ZM.save}));
        return {duplicateDust,scene:parsed.observatory.background,pet:parsed.observatory.pet,ach:ZM.save.ach.new_sky};
    });
    assert.equal(outcome.duplicateDust,16);assert.equal(outcome.scene,'garden');assert.equal(outcome.pet,'cat');assert.equal(outcome.ach,true);
});

test('daily support gift cannot be claimed twice and keeps pets in cases',async t=>{
    const page=await game(t);
    await page.evaluate(()=>{ZM.save.sign=0;ZM.save.calTaken=[1,2];ZM.save.calLast='2000-01-01';testGame.calendar();});
    await page.locator('[data-claim="3"]').click();
    assert.equal(await page.evaluate(()=>Observatory.owned('pets','cat')),false);
    assert.equal(await page.evaluate(()=>ZM.save.inv.hint),1);
    const dust=await page.evaluate(()=>ZM.save.dust);
    await page.evaluate(()=>testGame.calendar());
    assert.equal(await page.locator('[data-claim]').count(),0);
    assert.equal(await page.evaluate(()=>ZM.save.dust),dust);
});

test('locked or unaffordable cosmetics do not spend currency and legacy collector gifts are one-time',async t=>{
    const page=await game(t);
    const result=await page.evaluate(()=>{
        ZM.save.dust=10;
        const a=Observatory.buy('outfits','moon'),b=Observatory.buy('backgrounds','garden');
        return {a,b,dust:ZM.save.dust,count:ZM.ACHDEFS.length,valid:ZM.ACHDEFS.every(d=>!d.extra||(d.extra.cosmetics||[]).every(c=>Observatory.catalog[c.kind].some(item=>item.id===c.id)))};
    });
    assert.deepEqual(result,{a:false,b:false,dust:10,count:22,valid:true});
    await page.evaluate(()=>{ZM.save.ach.collector=true;Observatory.state().collectorGift=false;ZM.persist();});
    await page.reload();
    assert.equal(await page.evaluate(()=>Observatory.owned('pets','dragon')),true);
    assert.equal(await page.evaluate(()=>Observatory.owned('backgrounds','garden')),true);
    const dust=await page.evaluate(()=>ZM.save.dust);
    await page.reload();
    assert.equal(await page.evaluate(()=>ZM.save.dust),dust);
});

test('generated assets decode and the atlas leads the mobile observatory',async t=>{
    const page=await game(t);
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-hero="male"]').click();
    await page.locator('#setupGo').click();await page.clock.runFor(800);
    await page.evaluate(()=>ZM.modalForceClose());
    assert.equal(await page.evaluate(()=>Observatory.state().hero),'male');
    const result=await page.evaluate(async()=>{
        const decoded=[];
        for(const src of['assets/observatory-atlas.webp','assets/alchemy-icons.webp','assets/moon-garden.webp','assets/mystic-emblems.webp',...Array.from({length:4},(_,i)=>'assets/costumes-'+i+'.webp'),...Array.from({length:2},(_,i)=>'assets/familiars-'+i+'.webp')]){
            const image=new Image();image.src=src;await image.decode();decoded.push(image.naturalWidth>0);
        }
        const avatar=document.getElementById('observatoryHost').getBoundingClientRect();
        const modes=document.querySelector('.command-actions').getBoundingClientRect();
        const atlas=document.getElementById('campaignMap').getBoundingClientRect();
        return {decoded,above:modes.top<avatar.top,atlasFirst:atlas.top<avatar.top,columns:Campaign.modes.length,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.ok(result.decoded.every(Boolean));assert.equal(result.above,true);assert.equal(result.atlasFirst,true);assert.equal(result.columns,3);assert.equal(result.overflow,false);
});

test('shop, all wardrobe sections and the complete trophy list open through visible controls',async t=>{
    const page=await game(t);
    await page.locator('#setupGo').click();await page.clock.runFor(800);
    await page.evaluate(()=>ZM.modalForceClose());
    await page.locator('#btnHubMenu').click();await page.locator('#btnShop').click();
    await page.locator('#shopWardrobe').click();
    for(const tab of['pets','backgrounds','effects','backs','outfits']){
        await page.locator('[data-tab="'+tab+'"]').click();
        assert.ok(await page.locator('.wardrobe-item').count()>0);
        if(tab==='backs')assert.equal(await page.locator('.wardrobe-item').count(),10);
    }
    await page.keyboard.press('Escape');
    await page.locator('#btnHubMenu').click();await page.locator('#btnAch').click();
    assert.equal(await page.locator('.ach-row').count(),22);
});

test('atlas awakening reflects completed levels, grows monotonically and survives reload',async t=>{
    const page=await game(t);
    await page.locator('#setupGo').click();await page.clock.runFor(800);
    const stages=await page.evaluate(()=>{
        ZM.modalForceClose();const results=[];
        for(const count of[0,1,10,20,30]){
            for(let i=0;i<30;i++)ZM.save.lvStars[i]=i<count?1:0;
            testGame.hub();const card=document.querySelector('.zcard');
            results.push({percent:+card.dataset.progress,filter:getComputedStyle(card.querySelector('img')).filter,complete:card.classList.contains('done')});
        }
        ZM.persist();return results;
    });
    assert.deepEqual(stages.map(s=>s.percent),[0,3,33,67,100]);
    assert.equal(stages[0].complete,false);assert.equal(stages[4].complete,true);
    assert.equal(new Set(stages.map(s=>s.filter)).size,5);
    await page.reload();await page.clock.runFor(800);
    assert.equal(await page.locator('.zcard').first().getAttribute('data-progress'),'100');
});

test('observatory traits remain usable after modal dismissal and trophies can be examined',async t=>{
    const page=await game(t);await page.locator('#setupGo').click();await page.clock.runFor(800);
    await page.evaluate(()=>{ZM.modalForceClose();ZM.save.dust=500;});
    await page.locator('#openTraits').click();
    await page.locator('#traitsBox [data-tr="0"]').click();
    assert.equal(await page.locator('#traitsBox .trait.open').count(),1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#traitsHome #traitsBox').count(),1);
    await page.locator('#openTraits').click();
    assert.equal(await page.locator('#traitsBox .trait.open').count(),1);
    await page.locator('#modalRoot [data-close]').click();
    await page.evaluate(()=>{ZM.save.ach.tutorial=true;});
    await page.locator('#openTrophies').click();
    await page.locator('[data-ach-id="tutorial"]').click();
    assert.equal(await page.locator('.trophy-portrait .earned').count(),1);
    await page.locator('#backTrophies').click();
    assert.equal(await page.locator('.ach-row').count(),22);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>Observatory.openWardrobe());
    assert.equal(await page.locator('#motionPreference').count(),0);
    assert.doesNotMatch(await page.locator('#modalRoot').innerText(),/Движение фишек/);
});

test('oracle does not auto-focus Love and keeps an accessible keyboard focus indicator',async t=>{
    const page=await game(t);await page.evaluate(()=>testGame.oracle());
    assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('ft-modal')),true);
    assert.equal(await page.locator('.ft-card:focus').count(),0);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.cat),'love');
    assert.equal(await page.locator('.ft-card:focus-visible').count(),1);
    await page.locator('.ft-card[data-cat="career"]').click();
    assert.equal(await page.locator('.ft-card[data-cat="love"]:focus').count(),0);
});

test('first-visit visual guides pause every mode and persist completion without repeating',async t=>{
    const page=await game(t);
    for(const [mode,index]of[['memory',0],['oracle',null],['alchemy',20]]){
        await page.evaluate(([mode,index])=>{ZM.save.levelGuides[mode]=false;testGame.kill();testGame.start(index==null?ZM.LEVELS96.findIndex(c=>c.oracle):index);},[mode,index]);
        await page.clock.runFor(100);
        assert.equal(await page.locator('#levelTour').count(),1);
        const before=await page.evaluate(()=>testGame.state.elapsed);
        await page.clock.runFor(5000);
        assert.equal(await page.evaluate(()=>testGame.state.elapsed),before);
        while(await page.locator('#levelTour').count())await page.locator('#tourNext').click();
        assert.equal(await page.evaluate(mode=>ZM.save.levelGuides[mode],mode),true);
        assert.equal(await page.evaluate(mode=>JSON.parse(localStorage.getItem('zodiacMemory.v3')).levelGuides[mode],mode),true);
        await page.evaluate(()=>testGame.kill());
    }
    await page.reload();assert.equal(await page.evaluate(()=>ZM.save.levelGuides.alchemy),true);
});

test('oracle campaigns and endless never ask for more than two target cards',async t=>{
    const page=await game(t);
    assert.equal(await page.evaluate(()=>ZM.LEVELS96.filter(c=>c.oracle).every(c=>c.stages.every(s=>s.targets<=2))),true);
    assert.equal(await page.evaluate(()=>Array.from({length:60},(_,i)=>Journey.endlessConfig(i+1)).filter(c=>c.oracle).every(c=>c.stages.every(s=>s.targets<=2))),true);
    await page.evaluate(()=>testGame.start(1,{cfg:{oracle:true,par:100,stages:[{rows:3,cols:4,targets:3,swaps:2,dur:400}]}}));
    assert.equal(await page.evaluate(()=>testGame.state.oracle.targets.length),2);
});

test('large memory fields reveal at fifteen seconds and clean up the interval on exit',async t=>{
    const page=await game(t);const index=await page.evaluate(()=>ZM.LEVELS96.findIndex(c=>!c.oracle&&!c.match3&&c.rows>=6&&c.cols>=6));
    await start(page,index);await skipPreview(page);
    await page.clock.runFor(15050);
    assert.equal(await page.evaluate(()=>document.body.classList.contains('peeking')),true);
    await page.evaluate(()=>testGame.kill());await page.clock.runFor(16000);
    assert.equal(await page.locator('.peek').count(),0);
});

test('special tile swaps trigger chains, respect obstacles and preserve a created bonus',async t=>{
    const page=await game(t);
    await page.evaluate(()=>{
        testGame.kill();const host=document.getElementById('board');host.classList.add('match3-board');
        const board=Array.from({length:36},(_,i)=>(Math.floor(i/6)+i%6)%6);
        [6,7,8,15].forEach(i=>board[i]=5);board[9]=2;board[10]=0;
        window.specialRound=Match3.mount(host,{initialBoard:board,target:999,moves:20,active:()=>true,update:()=>{},match:()=>{},win:()=>{},lose:()=>{}});
        host.children[9].click();host.children[15].click();
    });
    await page.clock.runFor(25);
    assert.equal(await page.evaluate(()=>specialRound.specials.get(9)),'row');
    for(let i=0;i<20;i++)await page.clock.runFor(100);
    await page.evaluate(()=>{
        specialRound.destroy();const host=document.getElementById('board');
        const board=Array.from({length:36},(_,i)=>(Math.floor(i/6)+i%6)%6);window.bonusMatched=0;
        window.specialRound=Match3.mount(host,{initialBoard:board,specials:[[7,'row'],[10,'column']],obstacles:[[8,1],[16,2]],target:999,moves:20,active:()=>true,update:()=>{},match:n=>bonusMatched+=n,win:()=>{},lose:()=>{}});
        host.children[8].click();
    });
    assert.equal(await page.evaluate(()=>specialRound.moves),20);
    await page.evaluate(()=>{const tile=document.getElementById('board').children[8];tile.dispatchEvent(new PointerEvent('pointerdown',{pointerId:77,button:0,clientX:20,clientY:20}));tile.dispatchEvent(new PointerEvent('pointerup',{pointerId:77,button:0,clientX:20,clientY:70}));});
    assert.equal(await page.evaluate(()=>specialRound.moves),20);
    await page.evaluate(()=>{const h=document.getElementById('board');h.children[7].click();h.children[13].click();});
    await page.clock.runFor(25);
    assert.ok(await page.evaluate(()=>bonusMatched)>=6);
    for(let i=0;i<20;i++)await page.clock.runFor(100);
    assert.ok([19,20].includes(await page.evaluate(()=>specialRound.moves)));
    await page.evaluate(()=>specialRound.destroy());
});

test('streak and guide lead the atlas, header opens inline and trophies avoid automatic focus',async t=>{
    const page=await game(t);await page.locator('#setupGo').click();await page.clock.runFor(800);await page.evaluate(()=>ZM.modalForceClose());
    assert.equal(await page.evaluate(()=>document.querySelector('.welcome-strip').getBoundingClientRect().top<document.getElementById('campaignMap').getBoundingClientRect().top),true);
    await page.locator('#btnHubMenu').click();
    assert.equal(await page.evaluate(()=>document.querySelector('.topbar').classList.contains('menu-expanded')),true);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('hubTools')).position),'static');
    await page.locator('#btnHubMenu').click();
    assert.equal(await page.locator('#hubTools').getAttribute('hidden'),'');
    await page.locator('#openTrophies').click();
    assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('trophies-modal')),true);
    assert.equal(await page.locator('.achievement-inspect:focus').count(),0);
});

test('the compact trail offers three modes in every star and moves the atlas into the observatory',async t=>{
 const page=await game(t);await page.locator('#setupGo').click();await page.clock.runFor(800);await page.evaluate(()=>ZM.modalForceClose());
 assert.equal(await page.locator('.star-node').count(),10);assert.equal(await page.locator('.star-node:not(.locked)').count(),1);assert.equal(await page.locator('.star-node.guardian').count(),2);
 assert.equal(await page.locator('#atlasPanel').isVisible(),false);
 await page.locator('#openAtlas').click();assert.equal(await page.locator('#atlasModal .zcard').count(),12);assert.equal(await page.locator('.zodiac-seal').count(),36);
 await page.locator('#modalRoot [data-close]').click();assert.equal(await page.locator('#atlasPanel').isVisible(),false);
 await page.locator('[data-node="0"]').click();assert.equal(await page.locator('.picker-mode').count(),3);await page.locator('[data-play="20"]').click();await page.clock.runFor(100);
 assert.equal(await page.locator('.gem').count(),36);assert.equal(await page.evaluate(()=>testGame.state.cfg.campaignMode),2);
});
test('the tenth level removes only its own seal, rewards it once and opens the next shared chapter',async t=>{
 const page=await game(t);await page.evaluate(()=>{ZM.save.sign=0;for(let i=20;i<29;i++)ZM.save.lvStars[i]=1;testGame.start(29);testGame.win();});
 assert.equal(await page.evaluate(()=>Campaign.frontier(ZM.save)),1);assert.equal(await page.evaluate(()=>ZM.save.pathRewards['0:2']),true);
 const seals=await page.evaluate(()=>ZM.save.omens);
 await page.locator('#menuBtn').click();await page.clock.runFor(100);
 assert.match(await page.locator('.path-heading h2').innerText(),/Телец/);
 await page.locator('#openAtlas').click();assert.equal(await page.locator('.zcard').first().locator('.fallen').count(),1);
 await page.locator('#modalRoot [data-close]').click();
 await page.evaluate(()=>{testGame.start(29);testGame.win();});assert.equal(await page.evaluate(()=>ZM.save.omens),seals);
});
test('a late alchemy guardian renders voids that cannot be swapped or filled by gravity',async t=>{
 const page=await game(t);await start(page,84);
 assert.equal(await page.locator('.gem[data-void="true"]').count(),await page.evaluate(()=>testGame.state.cfg.voids.length));
 const before=await page.evaluate(()=>testGame.state.match3.moves);
 await page.evaluate(()=>{document.querySelector('.gem[data-void="true"]').click();});
 assert.equal(await page.evaluate(()=>testGame.state.match3.moves),before);
 assert.equal(await page.evaluate(()=>testGame.state.match3.board.filter(n=>n===null).length),await page.evaluate(()=>testGame.state.cfg.voids.length));
});

test('compact header contains all actions, hero stays unclipped and map matches the observatory height',async t=>{
 const page=await game(t);await page.setViewportSize({width:1366,height:900});
 await page.locator('#setupGo').click();await page.clock.runFor(800);await page.evaluate(()=>ZM.modalForceClose());
 for(const id of['btnGuide','btnContinue','btnEndless','btnAlchemy','dailyQuest','loginHint'])assert.equal(await page.locator('.hub-command #'+id).count(),1);
 assert.equal(await page.locator('.journey-bar').count(),0);
 for(const hero of['female','male'])for(const outfit of['apprentice','astral','moon','forest']){
  const metrics=await page.evaluate(([hero,outfit])=>{const s=Observatory.state();s.hero=hero;s.outfit=outfit;Observatory.render();const figure=document.querySelector('#observatoryHost .hero-figure').getBoundingClientRect(),host=document.getElementById('observatoryHost').getBoundingClientRect();return{fits:figure.top>=host.top&&figure.bottom<=host.bottom&&figure.height>130};},[hero,outfit]);assert.equal(metrics.fits,true,hero+' '+outfit);
 }
 const heights=await page.evaluate(()=>[document.getElementById('campaignMap').getBoundingClientRect().height,document.querySelector('.personal-observatory').getBoundingClientRect().height]);assert.ok(Math.abs(heights[0]-heights[1])<2);
});

test('chapter map shows one illustrated region at a time while future levels stay locked',async t=>{
 const page=await game(t);await page.locator('#setupGo').click();await page.clock.runFor(800);await page.evaluate(()=>ZM.modalForceClose());
 assert.equal(await page.locator('.zodiac-region').count(),1);assert.equal(await page.locator('.star-node').count(),10);
 const decoded=await page.evaluate(async()=>Promise.all(['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'].map(async sign=>{const image=new Image();image.src='assets/route-'+sign+'.webp';await image.decode();return image.naturalWidth>=1024&&image.naturalHeight>=1536;})));assert.ok(decoded.every(Boolean));
 await page.locator('[data-chapter="11"]').click();await page.clock.runFor(100);
 assert.match(await page.locator('.path-heading h2').innerText(),/Рыбы/);
 assert.equal(await page.locator('[data-node="110"]').getAttribute('aria-disabled'),'true');
 await page.locator('[data-node="110"]').click({force:true});assert.equal(await page.locator('#s_hub.active').count(),1);assert.equal(await page.evaluate(()=>Campaign.frontier(ZM.save)),0);
 await page.locator('[data-chapter="0"]').click();await page.clock.runFor(100);assert.match(await page.locator('.path-heading h2').innerText(),/Овен/);
});

test('completing a zodiac shows its rotating card and stores it in the album without replaying the celebration',async t=>{
 const page=await game(t);await page.evaluate(()=>{ZM.save.sign=0;for(let i=0;i<29;i++)ZM.save.lvStars[i]=1;testGame.start(29);testGame.win();});
 assert.equal(await page.locator('.collection-turn.celebration').count(),1);
 assert.deepEqual(await page.evaluate(()=>ZM.save.albumSeen),[0]);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('zodiacMemory.v3')).albumSeen),[0]);
 await page.locator('#collectionAlbum').click();assert.equal(await page.locator('#atlasModal .zcard.done').count(),1);
 await page.locator('#atlasModal .zcard.done').click();assert.equal(await page.locator('.collection-turn').count(),1);assert.equal(await page.locator('.collection-turn.celebration').count(),0);
 await page.locator('#collectionContinue').click();
 await page.evaluate(()=>{testGame.start(29);testGame.win();});assert.equal(await page.locator('.collection-turn.celebration').count(),0);assert.equal(await page.locator('#menuBtn').count(),1);
});

test('a star remembers three mode checks and a single win opens all choices in the next star',async t=>{
 const page=await game(t);await page.locator('#setupGo').click();await page.clock.runFor(800);await page.evaluate(()=>ZM.modalForceClose());
 await page.evaluate(()=>{testGame.start(20);testGame.win();});
 await page.locator('#menuBtn').click();await page.clock.runFor(100);
 assert.equal(await page.locator('[data-node="0"] .checked').count(),1);
 assert.equal(await page.locator('[data-node="1"]').getAttribute('aria-disabled'),'false');
 await page.locator('[data-node="0"]').click();assert.equal(await page.locator('.picker-mode.done').count(),1);
 assert.equal(await page.locator('[data-play="20"] .picker-status').innerText(),'✓ Пройдено');
 await page.locator('.picker-close').click();await page.locator('[data-node="1"]').click();
 assert.deepEqual(await page.locator('[data-play]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.play))),[1,11,21]);
 await page.locator('[data-play="1"]').click();await page.clock.runFor(4500);
 assert.equal(await page.locator('#board .cell').count(),16);
});

test('alchemy chooser has no automatic first-item frame and the observatory scrolls without a bar',async t=>{
 const page=await game(t);await page.setViewportSize({width:1366,height:700});await page.locator('#setupGo').click();await page.clock.runFor(800);await page.evaluate(()=>ZM.modalForceClose());
 await page.locator('#btnAlchemy').click();
 assert.equal(await page.locator('.journey-card:focus').count(),0);
 assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('modal')),true);
 await page.keyboard.press('Tab');assert.equal(await page.locator('.journey-card:focus-visible').count(),1);
 await page.evaluate(()=>ZM.modalForceClose());
 const scroll=await page.evaluate(()=>{const panel=document.querySelector('.personal-observatory');panel.scrollTop=200;return{bar:getComputedStyle(panel).scrollbarWidth,top:panel.scrollTop,overflow:panel.scrollHeight>panel.clientHeight};});
 assert.equal(scroll.bar,'none');assert.equal(scroll.overflow,true);assert.ok(scroll.top>0);
});

test('the new economy resets legacy browser saves once and reset imports show a clear preview',async t=>{
 const seed={sign:2,dust:99999,lvStars:new Array(360).fill(3),lvOpen:new Array(12).fill(30),campaignVersion:1,journeyVersion:2,ach:{collector:true},skins:{classic:true,gold:true},skin:'gold'};
 const page=await game(t,seed,{legacyEconomy:true});
 assert.equal(await page.evaluate(()=>ZM.save.economyVersion),2);assert.equal(await page.evaluate(()=>ZM.save.dust),0);assert.equal(await page.evaluate(()=>ZM.save.lvStars.reduce((a,b)=>a+b,0)),0);
 assert.equal(await page.evaluate(()=>ZM.save.sign),null);assert.equal(await page.evaluate(()=>Observatory.owned('pets','dragon')),false);
 await page.evaluate(()=>{ZM.save.dust=91;ZM.save.lvStars[0]=1;ZM.persist();});await page.reload();
 assert.equal(await page.evaluate(()=>ZM.save.dust),91);assert.equal(await page.evaluate(()=>ZM.save.lvStars[0]),1);
 await page.evaluate(()=>testGame.journal());
 const old=await page.evaluate(()=>{const save=JSON.parse(JSON.stringify(ZM.save));delete save.economyVersion;save.dust=99999;return JSON.stringify({format:'zodiac-memory',version:1,save});});
 await page.locator('#importFile').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(old)});
 assert.match(await page.locator('.import-preview').innerText(),/0 звёзд · 0 пыли/);
 assert.match(await page.locator('.msub').innerText(),/прежней экономики/);assert.equal(await page.evaluate(()=>ZM.save.dust),91);
});

test('case opening commits its prize before animation, supports equip and forbids direct costume purchases',async t=>{
 const page=await game(t);await page.locator('#setupGo').click();await page.clock.runFor(800);await page.evaluate(()=>{ZM.modalForceClose();ZM.save.dust=1000;Observatory.setHero('female');Observatory.openWardrobe();});
 await page.locator('[data-case="outfits"]').click();assert.equal(await page.locator('.case-prize .product-art').count(),1);
 const result=await page.evaluate(()=>{const owned=Object.keys(Observatory.state().owned.outfits);const saved=JSON.parse(localStorage.getItem('zodiacMemory.v3'));return{owned,persisted:saved.observatory.owned.outfits,opens:saved.observatory.cases.outfits.opens,dust:saved.dust};});
 assert.equal(result.opens,1);assert.equal(result.owned.length,2);assert.ok(result.owned.every(id=>result.persisted[id]));assert.ok(result.dust<=825);
 await page.locator('#caseEquip').click();const outfit=await page.evaluate(()=>Observatory.state().outfit);assert.notEqual(outfit,'apprentice');
 await page.reload();assert.equal(await page.evaluate(()=>Observatory.state().outfit),outfit);
 assert.equal(await page.evaluate(()=>{const before=ZM.save.dust;const bought=Observatory.buy('outfits','archmage');return bought===false&&before===ZM.save.dust;}),true);
 await page.evaluate(()=>{Observatory.giveReward({cosmetics:[{kind:'outfits',id:'blackwitch'}]});Observatory.setHero('female');Observatory.equip('outfits','blackwitch');Observatory.setHero('male');});
 assert.equal(await page.evaluate(()=>Observatory.state().outfit),'apprentice');assert.equal(await page.evaluate(()=>Observatory.equip('outfits','blackwitch')),false);
});

test('wheel gestures change exactly one chapter with no neighbouring backgrounds and keyboard navigation still works',async t=>{
 const page=await game(t);await page.locator('#setupGo').click();await page.clock.runFor(800);await page.evaluate(()=>ZM.modalForceClose());
 assert.equal(await page.locator('#pathAtlas,#btnJournal').count(),0);
 await page.evaluate(()=>{const viewport=document.querySelector('.chapter-viewport');for(let i=0;i<4;i++)viewport.dispatchEvent(new WheelEvent('wheel',{deltaY:-90,bubbles:true,cancelable:true}));});
 assert.equal(await page.locator('.chapter-scene').getAttribute('data-region'),'1');assert.equal(await page.locator('.star-node').count(),10);assert.equal(await page.locator('.zodiac-region').count(),1);
 const bounds=await page.evaluate(()=>{const viewport=document.querySelector('.chapter-viewport').getBoundingClientRect(),scene=document.querySelector('.chapter-scene').getBoundingClientRect(),header=document.querySelector('.chapter-heading').getBoundingClientRect();return{flush:Math.abs(viewport.top-scene.top)<1&&Math.abs(viewport.bottom-scene.bottom)<1,separate:header.bottom<=scene.top};});assert.deepEqual(bounds,{flush:true,separate:true});
 await page.clock.runFor(360);await page.evaluate(()=>document.querySelector('.chapter-viewport').dispatchEvent(new WheelEvent('wheel',{deltaY:-90,bubbles:true,cancelable:true})));assert.equal(await page.locator('.chapter-scene').getAttribute('data-region'),'2');
 await page.locator('.chapter-viewport').focus();await page.keyboard.press('PageDown');assert.equal(await page.locator('.chapter-scene').getAttribute('data-region'),'1');
 await page.keyboard.press('Home');assert.equal(await page.locator('.chapter-scene').getAttribute('data-region'),'0');await page.keyboard.press('End');assert.equal(await page.locator('.chapter-scene').getAttribute('data-region'),'11');
 assert.equal(await page.locator('[data-node="119"]').getAttribute('aria-disabled'),'true');
});

test('album keeps complete original art and places smaller seals and progress outside the image on desktop and phone',async t=>{
 const page=await game(t);await page.locator('#setupGo').click();await page.clock.runFor(800);await page.evaluate(()=>ZM.modalForceClose());
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:950});await page.evaluate(()=>document.getElementById('openAtlas').click());
  const result=await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.zcover img')].map(im=>im.decode()));const card=document.querySelector('.zcard'),img=card.querySelector('img'),r=img.getBoundingClientRect(),seals=card.querySelector('.card-seals').getBoundingClientRect(),progress=card.querySelector('.zbar').getBoundingClientRect();return{ratio:r.width/r.height,natural:img.naturalWidth/img.naturalHeight,sealsBelow:seals.top+.5>=r.bottom,progressBelow:progress.top+.5>=seals.bottom,sealsInside:card.querySelector('.zcover .zodiac-seal')!==null,size:card.querySelector('.zodiac-seal').getBoundingClientRect().width,fit:getComputedStyle(img).objectFit,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.ok(Math.abs(result.ratio-result.natural)<.001);assert.equal(result.fit,'contain');assert.equal(result.sealsBelow,true);assert.equal(result.progressBelow,true);assert.equal(result.sealsInside,false);assert.ok(result.size<=34);assert.equal(result.overflow,false);
  await page.locator('#modalRoot [data-close]').click();
 }
 const decoded=await page.evaluate(async()=>{const img=new Image();img.src='assets/path-seals-dark.webp';await img.decode();return img.naturalWidth>0;});assert.equal(decoded,true);
});

test('mobile swipes switch whole zodiac pages without opening a level from a trailing click',async t=>{
 const page=await game(t);await page.setViewportSize({width:390,height:844});await page.locator('#setupGo').click();await page.clock.runFor(800);await page.evaluate(()=>ZM.modalForceClose());
 const swipe=async (from,to)=>page.evaluate(([from,to])=>{const v=document.querySelector('.chapter-viewport');for(const [type,field,y]of [['touchstart','touches',from],['touchend','changedTouches',to]]){const event=new Event(type,{bubbles:true});Object.defineProperty(event,field,{value:[{clientX:170,clientY:y}]});v.dispatchEvent(event);}},[from,to]);
 await swipe(200,300);assert.equal(await page.locator('.chapter-scene').getAttribute('data-region'),'1');
 await swipe(300,200);assert.equal(await page.locator('.chapter-scene').getAttribute('data-region'),'0');
 await page.evaluate(()=>document.querySelector('[data-node="0"]').click());assert.equal(await page.locator('.node-picker').count(),0);
 await page.clock.runFor(360);await page.locator('[data-node="0"]').click();assert.equal(await page.locator('.picker-mode').count(),3);
});

test('moon seals stay on the same DOM tile during gravity and a successful exchange',async t=>{
 const page=await game(t);await start(page,20);
 await page.evaluate(()=>{let seed=1;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});
 await page.evaluate(()=>{
  testGame.state.match3.destroy();const host=document.getElementById('board'),board=Array.from({length:36},(_,i)=>(Math.floor(i/6)+i%6)%6);
  window.moonTest=Match3.mount(host,{initialBoard:board,rows:6,cols:6,moves:20,target:1,goal:{type:'seals',cells:[0]},specials:[[24,'row']],active:()=>true,update:()=>{},match:()=>{},win:()=>{},lose:()=>{}});
  window.sealedObject=host.children[0];host.children[24].click();host.children[25].click();
 });
 for(let i=0;i<40&&await page.evaluate(()=>moonTest.busy);i++)await page.clock.runFor(250);
 assert.deepEqual(await page.evaluate(()=>[...moonTest.seals]),[6]);assert.equal(await page.evaluate(()=>sealedObject===document.querySelector('.gem[data-index="6"]')&&sealedObject.classList.contains('sealed')),true);
 await page.evaluate(()=>{
  moonTest.destroy();const board=Array.from({length:36},(_,i)=>(Math.floor(i/6)+i%6)%6);[board[0],board[1],board[2],board[6],board[7],board[8]]=[1,0,1,2,1,3];
  const host=document.getElementById('board');window.moonTest=Match3.mount(host,{initialBoard:board,rows:6,cols:6,moves:20,target:1,goal:{type:'seals',cells:[1]},active:()=>true,update:()=>{},match:()=>{},win:()=>{},lose:()=>{}});window.sealedObject=host.children[1];host.children[1].click();host.children[7].click();
 });
 for(let i=0;i<40&&await page.evaluate(()=>moonTest.busy);i++)await page.clock.runFor(250);
 assert.deepEqual(await page.evaluate(()=>[...moonTest.seals]),[7]);assert.equal(await page.evaluate(()=>sealedObject===document.querySelector('.gem[data-index="7"]')&&sealedObject.classList.contains('sealed')),true);
 await page.evaluate(()=>moonTest.destroy());
});

test('an irregular 8 by 8 board fits a phone, accepts valid moves and preserves its void mask',async t=>{
 const page=await game(t);await page.setViewportSize({width:390,height:844});
 const index=await page.evaluate(()=>ZM.LEVELS.findIndex(c=>c.match3&&c.cols===8&&c.voids?.length));await start(page,index);
 assert.equal(await page.locator('.gem').count(),64);
 const holes=await page.evaluate(()=>testGame.state.cfg.voids);
 const fits=await page.evaluate(()=>{const board=document.getElementById('board').getBoundingClientRect();return [...document.querySelectorAll('.gem')].every(el=>{const r=el.getBoundingClientRect();return r.left>=board.left&&r.right<=board.right+.5&&r.top>=board.top&&r.bottom<=board.bottom+.5&&r.width>=25;});});assert.equal(fits,true);
 await page.evaluate(()=>{const m=testGame.state.match3,blocked=new Set([...m.obstacles.keys(),...testGame.state.cfg.voids]);const pair=Match3.findMove(m.board,testGame.state.cfg.goal,m.seals,blocked,m.specials);document.querySelectorAll('.gem')[pair[0]].click();document.querySelectorAll('.gem')[pair[1]].click();});
 await settleAlchemy(page);
 assert.deepEqual(await page.evaluate(()=>testGame.state.match3.board.flatMap((v,i)=>v===null?[i]:[])),holes);
});

test('native chapter paging brings the next zodiac in from above when scrolling upward',async t=>{
 const page=await game(t,undefined,{realTime:true});await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#setupGo').click();await page.waitForTimeout(700);await page.evaluate(()=>ZM.modalForceClose());
 const motion=await page.evaluate(()=>{document.querySelector('.chapter-viewport').dispatchEvent(new WheelEvent('wheel',{deltaY:-90,bubbles:true,cancelable:true}));const scene=document.querySelector('.chapter-scene'),animation=scene.getAnimations()[0];return{chapter:scene.dataset.region,first:animation.effect.getKeyframes()[0].transform,duration:animation.effect.getTiming().duration};});
 assert.deepEqual(motion,{chapter:'1',first:'translateY(-100%)',duration:440});
 await page.waitForFunction(()=>!document.querySelector('.chapter-scene').getAnimations().length);assert.equal(await page.locator('.chapter-scene').count(),1);
 const flush=await page.evaluate(()=>Math.abs(document.querySelector('.chapter-viewport').getBoundingClientRect().top-document.querySelector('.chapter-scene').getBoundingClientRect().top)<1);assert.equal(flush,true);
});

test('seasonal chest reveals an equippable outfit, persists its independent counter and loads every new sheet',async t=>{
 const page=await game(t);await page.locator('#setupGo').click();await page.clock.runFor(800);
 await page.evaluate(()=>{ZM.modalForceClose();ZM.save.dust=1000;Observatory.setHero('female');Observatory.openWardrobe('cases');});
 assert.equal(await page.locator('[data-case]').count(),3);
 await page.locator('[data-case="seasonal"]').click();
 const result=await page.evaluate(()=>{const s=Observatory.state(),saved=JSON.parse(localStorage.getItem('zodiacMemory.v3'));return{opens:s.cases.seasonal.opens,regular:s.cases.outfits.opens,persisted:saved.observatory.cases.seasonal.opens,seasonal:WardrobeContent.outfits.filter(d=>d.seasonal&&s.owned.outfits[d.id]).length};});
 assert.deepEqual(result,{opens:1,regular:0,persisted:1,seasonal:1});
 await page.locator('#caseEquip').click();const outfit=await page.evaluate(()=>Observatory.state().outfit);
 await page.reload();assert.equal(await page.evaluate(()=>Observatory.state().outfit),outfit);
 const images=await page.evaluate(async()=>Promise.all([...new Set(WardrobeContent.outfits.map(d=>d.image))].map(async src=>{const im=new Image();im.src=src;await im.decode();return im.naturalWidth>1000&&im.naturalHeight>1000;})));
 assert.equal(images.length,8);assert.ok(images.every(Boolean));assert.equal(await page.getByText('Колёсико или свайп — по одному знаку',{exact:true}).count(),0);
});

test('guardian follows equipped appearance, tracks mission and live star conditions across all modes',async t=>{
 const page=await game(t);await start(page,20);await page.clock.runFor(1000);
 assert.equal(await page.locator('#levelHero .hero-figure').count(),1);assert.equal(await page.locator('#guardianStars li').count(),3);
 await page.evaluate(()=>{const g=testGame.state;g.moves=7;g.cleared=3;g.needed=6;testGame.guardian();});
 assert.match(await page.locator('#guardianCount').innerText(),/3 \/ 6/);assert.match(await page.locator('#guardianForecast').innerText(),/★★☆/);
 await page.evaluate(()=>{const g=testGame.state;g.cleared=6;g.moves=8;testGame.guardian();});assert.equal(await page.locator('.guardian-stars .secured').count(),3);
 await start(page,0);await page.evaluate(()=>{testGame.state.elapsed=151;testGame.state.misses=1;testGame.state.running=true;testGame.state.preview=false;});await page.clock.runFor(300);
 assert.match(await page.locator('#guardianForecast').innerText(),/★☆☆/);assert.equal(await page.locator('#guardianStar2.met').count(),0);
 await start(page,10);assert.match(await page.locator('#guardianTarget').innerText(),/отмеченные карты/);
 for(const width of [1366,390]){await page.setViewportSize({width,height:844});await page.clock.runFor(300);const fit=await page.evaluate(()=>{const b=document.getElementById('board').getBoundingClientRect(),p=document.querySelector('.level-guardian').getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth,overlap:b.left<p.right&&b.right>p.left&&b.top<p.bottom&&b.bottom>p.top};});assert.equal(fit.overflow,false);assert.equal(fit.overlap,false);}
});


test('Yandex bridge reports readiness once, brackets play and pauses/resumes SDK overlays without losing a pending delay',async t=>{
 const page=await game(t,null,{sdkScript:true,url:'http://game.test/index.html?yandex=1'});await page.clock.runFor(500);
 assert.deepEqual(await page.evaluate(()=>platformCalls),['ready']);
 await start(page,20);await page.clock.runFor(100);
 assert.deepEqual(await page.evaluate(()=>platformCalls),['ready','start']);
 await page.evaluate(()=>{window.delayed=false;GamePlatform.delay(()=>delayed=true,500);platformEvents.game_api_pause();});
 const before=await page.evaluate(()=>testGame.state.elapsed);await page.clock.runFor(3000);
 assert.equal(await page.evaluate(()=>window.delayed),false);assert.equal(await page.evaluate(()=>testGame.state.elapsed),before);
 assert.equal(await page.evaluate(()=>GamePlatform.paused),true);assert.equal(await page.locator('body.platform-paused').count(),1);
 await page.evaluate(()=>platformEvents.game_api_resume());await page.clock.runFor(501);
 assert.equal(await page.evaluate(()=>window.delayed),true);assert.deepEqual(await page.evaluate(()=>platformCalls),['ready','start','stop','start']);
 await page.evaluate(()=>ZM.modalOpen('<h2>Пауза меню</h2>'));await page.clock.runFor(1);assert.equal(await page.evaluate(()=>platformCalls.at(-1)),'stop');
 await page.evaluate(()=>ZM.modalForceClose());await page.clock.runFor(1);assert.equal(await page.evaluate(()=>platformCalls.at(-1)),'start');
 await page.evaluate(()=>testGame.kill());assert.equal(await page.evaluate(()=>platformCalls.at(-1)),'stop');
 await page.evaluate(()=>{ZM.save.levelGuides.alchemy=false;testGame.start(20);});await page.clock.runFor(100);assert.equal(await page.locator('#levelTour').count(),1);assert.equal(await page.evaluate(()=>platformCalls.at(-1)),'stop');
 await page.locator('#tourSkip').click();assert.equal(await page.evaluate(()=>platformCalls.at(-1)),'start');
 await page.reload();await page.clock.runFor(500);assert.equal(await page.evaluate(()=>platformCalls.filter(x=>x==='ready').length),1);
});
test('focus pause preserves memory preview and task cancellation survives resume',async t=>{
 const page=await game(t);await start(page,0);
 await page.evaluate(()=>{window.cancelledFired=false;const task=GamePlatform.delay(()=>cancelledFired=true,100);GamePlatform.pause('test');GamePlatform.cancel(task);});
 await page.clock.runFor(10000);assert.equal(await page.evaluate(()=>testGame.state.preview),true);
 await page.evaluate(()=>GamePlatform.resume('test'));await page.clock.runFor(8000);
 assert.equal(await page.evaluate(()=>testGame.state.preview),false);assert.equal(await page.evaluate(()=>cancelledFired),false);
 await page.evaluate(()=>dispatchEvent(new Event('blur')));const before=await page.evaluate(()=>testGame.state.elapsed);await page.clock.runFor(2000);assert.equal(await page.evaluate(()=>testGame.state.elapsed),before);
 await page.evaluate(()=>dispatchEvent(new Event('focus')));await page.clock.runFor(1000);assert.ok(await page.evaluate(()=>testGame.state.elapsed)>before);
});


test('Yandex SDK network failure leaves the standalone game playable and startup fonts are local',async t=>{
 const page=await game(t,null,{url:'http://game.test/index.html?yandex=1'});await page.clock.runFor(500);
 assert.equal(await page.evaluate(()=>GamePlatform.state.sdk),'unavailable');await start(page,20);
 assert.equal(await page.locator('#board .gem').count(),36);
 assert.equal(await page.locator('link[href*="fonts.googleapis"]').count(),0);
 assert.equal(await page.evaluate(()=>document.fonts.check('16px Manrope')),true);
});


test('rewarded ads grant once only after SDK confirmation, do not reward closes/errors and release pause',async t=>{
 const page=await game(t,null,{rewarded:true});await page.locator('#setupGo').click();await page.clock.runFor(800);await page.evaluate(()=>{ZM.modalForceClose();Observatory.openWardrobe('rewards');});
 const before=await page.evaluate(()=>ZM.save.dust);await page.locator('[data-ad="dust"]').click();assert.equal(await page.evaluate(()=>GamePlatform.paused),true);
 await page.evaluate(()=>{adCallbacks.onRewarded();adCallbacks.onRewarded();adCallbacks.onClose();});
 assert.equal(await page.evaluate(()=>ZM.save.dust),before+25);assert.equal(await page.evaluate(()=>GamePlatform.paused),false);
 await page.locator('[data-ad="dust"]').click();await page.evaluate(()=>adCallbacks.onClose());assert.equal(await page.evaluate(()=>ZM.save.dust),before+25);
 await page.locator('[data-ad="dust"]').click();await page.evaluate(()=>{adCallbacks.onError();adCallbacks.onRewarded();});assert.equal(await page.evaluate(()=>ZM.save.dust),before+25);
 assert.equal(await page.evaluate(()=>ZM.save.adRewards.counts.dust),1);
 await page.locator('[data-ad-choice="academyrunes"]').click();
 for(let n=0;n<3;n++){await page.locator('[data-ad="outfit"]').click();await page.evaluate(()=>{adCallbacks.onRewarded();adCallbacks.onClose();});}
 assert.equal(await page.evaluate(()=>ZM.save.observatory.owned.outfits.academyrunes),true);assert.equal(await page.evaluate(()=>ZM.save.adRewards.chosenUsed),true);
 assert.equal(await page.locator('[data-ad="outfit"]').isDisabled(),true);
 const target=await page.evaluate(()=>ZM.save.adRewards.target);await page.reload();assert.equal(await page.evaluate(()=>ZM.save.adRewards.target),target);assert.equal(await page.evaluate(()=>ZM.save.adRewards.chosenUsed),true);
});
test('ad offerings are absent without SDK and an exhausted hint exposes a labelled voluntary offer',async t=>{
 const plain=await game(t);await plain.evaluate(()=>Observatory.openWardrobe('rewards'));assert.equal(await plain.locator('[data-ad]').count(),0);await plain.close();
 const page=await game(t,null,{rewarded:true});await start(page,20);await page.evaluate(()=>{testGame.state.hintFree=false;ZM.save.inv.hint=0;testGame.guardian();document.getElementById('btnHint').click();});assert.equal(await page.locator('[data-ad="hint"]').count(),1);
 await page.locator('[data-ad="hint"]').click();await page.evaluate(()=>{adCallbacks.onRewarded();adCallbacks.onClose();});assert.equal(await page.evaluate(()=>ZM.save.inv.hint),1);
});

test('SDK interface language selects Russian, English or Turkish independently of browser locale',async t=>{
 for(const [lang,title] of [['ru','Созвездие памяти'],['en','Constellation of Memory'],['tr','Hafıza Takımyıldızı']]){
  const page=await game(t,null,{sdkLanguage:lang,locale:'de-DE'});await page.evaluate(()=>I18n.ready);await page.clock.runFor(100);
  assert.equal(await page.locator('html').getAttribute('lang'),lang);assert.equal(await page.title(),title);
  assert.equal(await page.locator('#setupLanguage select').inputValue(),'auto');
  assert.deepEqual(await page.evaluate(()=>platformCalls),['ready']);
 }
});

test('manual language survives reload, wins over SDK, and auto restores SDK language',async t=>{
 const page=await game(t,null,{sdkLanguage:'en',locale:'ru-RU'});await page.evaluate(()=>I18n.ready);
 await page.locator('#setupLanguage select').selectOption('tr');assert.equal(await page.title(),'Hafıza Takımyıldızı');
 await page.reload();await page.evaluate(()=>I18n.ready);assert.equal(await page.locator('html').getAttribute('lang'),'tr');
 await page.locator('#setupGo').click();await page.clock.runFor(800);await page.evaluate(()=>ZM.modalForceClose());await page.locator('#btnHubMenu').click();await page.locator('#btnLanguage').click();assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.language-modal')),true);
 assert.equal(await page.locator('.language-modal select').inputValue(),'tr');
 await page.locator('.language-modal select').selectOption('auto');assert.equal(await page.title(),'Constellation of Memory');
 assert.equal(await page.locator('.language-modal h2').textContent(),'Interface language');
 await page.locator('.language-modal select').selectOption('ru');assert.equal(await page.locator('.language-modal h2').textContent(),'Язык интерфейса');
 await page.locator('.language-modal [data-close]').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.matches('.language-modal select')),true);
});

test('browser language works without SDK and unsupported languages fall back to English',async t=>{
 for(const [locale,lang] of [['tr-TR','tr'],['ru-RU','ru'],['fr-FR','en']]){
  const page=await game(t,null,{locale});await page.evaluate(()=>I18n.ready);assert.equal(await page.locator('html').getAttribute('lang'),lang);
 }
});

async function visibleRussian(page){return page.evaluate(()=>{const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),texts=[];let node;while(node=walker.nextNode())if(!node.parentElement.closest('script,style,[data-no-i18n]')&&node.parentElement.getClientRects().length&&/[А-Яа-яЁё]/.test(node.textContent))texts.push(node.textContent.trim());return texts;});}

test('language changes preserve active games, rewards and journal records across all modes',async t=>{
 const page=await game(t);await page.evaluate(()=>I18n.ready);
 for(const index of [0,10,20]){
  await start(page,index);
  const before=await page.evaluate(()=>{window.localeGame=testGame.state;return JSON.stringify(ZM.save);});
  for(const lang of ['en','tr','ru']){
   await page.evaluate(lang=>I18n.set(lang),lang);await page.clock.runFor(32);
   assert.equal(await page.evaluate(()=>testGame.state===localeGame&&!testGame.state.finished),true);
   assert.equal(await page.evaluate(()=>JSON.stringify(ZM.save)),before);
   if(lang!=='ru')assert.deepEqual(await visibleRussian(page),[]);
  }
 }
 await page.evaluate(()=>{testGame.kill();const text=ZM.WEEKLY[ZM.SIGNS[0].name]['Любовь'][0];ZM.save.journal=[{day:ZM.todayISO(),sign:0,cat:'love',text}];testGame.journal();});
 const original=await page.locator('.journal-entry p').textContent();
 for(const lang of ['en','tr']){await page.evaluate(lang=>I18n.set(lang),lang);await page.clock.runFor(32);assert.deepEqual(await visibleRussian(page),[]);assert.ok((await page.locator('.journal-entry p').textContent()).length>70);}
 await page.evaluate(()=>I18n.set('ru'));assert.equal(await page.locator('.journal-entry p').textContent(),original);assert.equal(await page.evaluate(()=>ZM.save.journal[0].text),original);
});

test('translated hub, wardrobe, rewards, help and level tours fit desktop and phone',async t=>{
 const page=await game(t,null,{rewarded:true});await page.evaluate(()=>I18n.ready);
 await page.locator('#setupGo').click();await page.clock.runFor(800);await page.evaluate(()=>ZM.modalForceClose());
 for(const lang of ['en','tr'])for(const width of [1366,390]){
  await page.setViewportSize({width,height:950});await page.evaluate(lang=>{I18n.set(lang);testGame.hub();},lang);await page.clock.runFor(32);
  assert.deepEqual(await visibleRussian(page),[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('[data-node="0"]').click();await page.clock.runFor(32);assert.deepEqual(await visibleRussian(page),[]);assert.equal(await page.evaluate(()=>{const r=document.querySelector('.node-picker').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+.5;}),true);await page.locator('.picker-close').click();
  for(const tab of ['cases','outfits','pets','rewards']){await page.evaluate(tab=>Observatory.openWardrobe(tab),tab);await page.clock.runFor(32);assert.deepEqual(await visibleRussian(page),[],lang+' '+tab);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.evaluate(()=>ZM.modalForceClose());}
  await page.evaluate(()=>testGame.guide());await page.clock.runFor(32);assert.deepEqual(await visibleRussian(page),[]);await page.evaluate(()=>ZM.modalForceClose());
  for(const mode of ['memory','oracle','alchemy']){await page.evaluate(mode=>LevelTour.start(mode,()=>{}),mode);for(let n=0;n<(mode==='alchemy'?4:3);n++){await page.clock.runFor(32);assert.deepEqual(await visibleRussian(page),[]);assert.equal(await page.evaluate(()=>{const r=document.querySelector('.tour-card').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+.5&&r.top>=0&&r.bottom<=innerHeight+.5;}),true);await page.locator('#tourNext').click();}}
 }
});
