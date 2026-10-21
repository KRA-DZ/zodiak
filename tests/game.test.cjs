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

async function game(t) {
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
                    win: finishWin, map: useMap, power: usePower, click: onCell,
                    get state() { return G; }, get selection() { return SEL; }
                };
                ZM.ready = true;`);
            return route.fulfill({ contentType: 'text/html', body: html });
        }
        const file = path.join(root, name);
        if (fs.existsSync(file)) return route.fulfill({ path: file });
        return route.fulfill({ status: 404, body: '' });
    });
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

test('all 84 levels render cards without runtime errors', async t => {
    const page = await game(t);
    assert.equal(await page.evaluate(() => ZM.LEVELS96.length), 84);
    for (let index = 0; index < 84; index++) {
        await start(page, index);
        const result = await page.evaluate(() => ({
            cards: document.querySelectorAll('#board .cell').length,
            deck: testGame.state.deck.length,
            missingSymbols: testGame.state.deck.some(cd => !ZM.SYMS[cd.grp.sym]),
        }));
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
