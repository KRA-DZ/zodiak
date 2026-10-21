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

async function game(t, seed) {
    const page = await browser.newPage();
    t.after(() => page.close());
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    t.after(() => assert.deepEqual(errors, [], 'browser runtime errors'));
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'game.test') return route.abort();
        const name = path.basename(url.pathname);
        if (name === 'index.html') {
            let html = fs.readFileSync(process.env.GAME_SOURCE || path.join(root, name), 'utf8');
            // Test-only access to private state; the shipped game has no debug API.
            html = html.replace('            ZM.ready = true;', `
                window.testGame = {
                    start: startLevel, kill: killLevel, preview: beginPreview,
                    win: finishWin, endless: startEndless, ritual: claimRitual, renderJourney: renderJourney, oracle: openOracleTable, reveal: ftReveal, journal: openJournal, calendar: openCalendar, guide: openGuide, map: useMap, power: usePower, click: onCell,
                    get state() { return G; }, get selection() { return SEL; }
                };
                ZM.ready = true;`);
            return route.fulfill({ contentType: 'text/html', body: html });
        }
        const file = path.join(root, name);
        if (fs.existsSync(file)) return route.fulfill({ path: file });
        return route.fulfill({ status: 404, body: '' });
    });
    if (seed) await page.addInitScript(save => localStorage.setItem('zodiacMemory.v3', JSON.stringify(save)), seed);
    await page.clock.install();
    await page.goto('http://game.test/index.html');
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
    for (let i = 0; i < 6; i++) {
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

test('all 108 levels render cards without runtime errors', async t => {
    const page = await game(t);
    assert.equal(await page.evaluate(() => ZM.LEVELS96.length), 108);
    for (let index = 0; index < 108; index++) {
        await start(page, index);
        const result = await page.evaluate(() => ({
            cards: document.querySelectorAll('#board .cell').length,
            gems: document.querySelectorAll('#board .gem').length,
            deck: testGame.state.deck.length,
            missingSymbols: testGame.state.deck.some(cd => !ZM.SYMS[cd.grp.sym]),
        }));
        if (result.gems) { assert.equal(result.gems, 36); continue; }
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
    // Atlas cards levitate continuously; click their visible centre without
    // waiting for an animation that is intentionally infinite to stop.
    await page.locator('.zcard').first().evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.clock.runFor(500);
    const card = await page.locator('.zcard').first().boundingBox();
    await page.mouse.click(card.x + card.width / 2, card.y + Math.min(card.height / 2, 200));
    await page.locator('.lv-row.open').first().click();
    await page.clock.runFor(4500);
    assert.equal(await page.locator('#s_game.active').count(), 1);
    assert.equal(await page.locator('#board .cell').count(), 12);
    const bounds = await page.locator('#board').boundingBox();
    assert.ok(bounds.width > 0 && bounds.x >= 0 && bounds.x + bounds.width <= 390);
});

test('match3 swaps, resolves cascades, awards campaign stars and cleans up on exit', async t => {
    const page = await game(t);
    await start(page, 7);
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
    const result = await page.evaluate(() => ({ stars: ZM.save.lvStars[7], finished: testGame.state.finished }));
    assert.equal(result.finished,true);
    // Both victory and a legitimate out-of-moves result are supported.
    if(result.stars) {
        assert.ok(result.stars>=1 && result.stars<=3);
        assert.equal(await page.evaluate(()=>ZM.save.lvOpen[0]),9);
    } else assert.equal(await page.locator('#alchemyRetry').count(),1);
    await page.evaluate(()=>testGame.kill());
    await page.clock.runFor(1000);
});

test('invalid match3 exchange keeps moves and a hint is not spent during a cascade', async t => {
    const page=await game(t);
    await start(page,7);
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
    assert.equal(await page.evaluate(()=>ZM.save.dust),old+12);
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
    assert.equal(await page.evaluate(()=>ZM.save.dust),50);
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

test('legacy browser save retains stars, currency, calendar and today purchased prediction', async t => {
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
    assert.equal(await page.evaluate(()=>ZM.save.lvStars[9]),3);
    assert.equal(await page.evaluate(()=>ZM.save.lvStars[15]),2);
    assert.equal(await page.evaluate(()=>ZM.save.lvOpen[1]),8);
    assert.equal(await page.evaluate(()=>ZM.save.dust),321);
    assert.equal(await page.evaluate(()=>ZM.save.calTaken.length),2);
    assert.equal(await page.evaluate(()=>ZM.save.preds.love.count),1);
    assert.ok(await page.evaluate(()=>ZM.save.preds.love.text.length>20));
    assert.deepEqual(await page.evaluate(()=>ZM.save.stats.fast),[9,15]);
});

test('match3 real move can win and persist stars, while exhausted moves never award a win', async t => {
    const page=await game(t);
    await page.evaluate(()=>testGame.start(7,{cfg:{match3:true,rows:6,cols:6,target:3,moves:1,par:180}}));
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

test('rapid level changes only start the current preview and collector sees all nine levels', async t => {
    const page=await game(t);
    await page.evaluate(()=>{testGame.start(0);testGame.start(9);});
    await page.clock.runFor(32);
    assert.equal(await page.locator('#peekBanner').count(),1);
    assert.equal(await page.evaluate(()=>testGame.state.sign),1);
    const result=await page.evaluate(()=>{
        ZM.save.lvStars.fill(3);
        return {done:ZM.signDone(1),collected:ZM.ACHDEFS.find(a=>a.id==='collector').test()};
    });
    assert.deepEqual(result,{done:9,collected:true});
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
    const fit=await page.locator('.map-panel').evaluate(el=>{
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
    await start(page,8);
    assert.equal(await page.locator('.gem.sealed').count(),6);
    assert.match(await page.locator('#missionTitle').innerText(),/печати/);
    await page.locator('.gem').nth(0).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.index),'1');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.index),'1');
    assert.equal(await page.locator('.gem.selected').count(),1);
    await start(page,16);
    assert.match(await page.locator('#missionTitle').innerText(),/Луна/);
});

test('reduced motion settles gameplay and cancels all animation effects on exit',async t=>{
    const page=await game(t);
    await page.emulateMedia({reducedMotion:'reduce'});
    await start(page,7);
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
    await start(page,7);
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
