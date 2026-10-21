const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../match3.js');
const J = require('../journey.js');

test('match3 generation has no initial matches and always has a legal move', () => {
    for (let i = 0; i < 200; i++) {
        const b = M.newBoard();
        assert.equal(b.length, 36);
        assert.deepEqual(M.matches(b), []);
        assert.ok(M.findMove(b));
        assert.ok(b.every(v => Number.isInteger(v) && v >= 0 && v < 6));
    }
    const fallback = M.newBoard(() => 0);
    assert.deepEqual(M.matches(fallback), []);
    assert.ok(M.findMove(fallback));
});

test('match3 does not wrap rows and matches both directions', () => {
    assert.equal(M.adjacent(5, 6), false);
    assert.equal(M.adjacent(4, 5), true);
    assert.equal(M.adjacent(2, 8), true);
    assert.equal(M.adjacent(-1, 0), false);
    const b = Array.from({length:36}, (_,i) => (Math.floor(i/6) + i%6)%6);
    b[0] = b[1] = b[2] = 5;
    b[8] = b[14] = 5;
    b[20] = 4;
    assert.deepEqual(new Set(M.matches(b)), new Set([0,1,2,8,14]));
});

test('collapse preserves the order of survivors and refills every hole', () => {
    const b = Array.from({length:36}, (_,i) => i);
    const next = M.collapse(b, [0,12,24], () => .5);
    assert.deepEqual([0,6,12,18,24,30].map(i => next[i]), [3,3,3,6,18,30]);
    assert.equal(next[1], b[1]);
});

test('legacy save migration keeps all 84 stars, unlocks and mapped fast achievements', () => {
    const old = Array.from({length:84}, (_,i) => i%4);
    old[6] = 3;
    const save = { lvStars: old.slice(), lvOpen: new Array(12).fill(7), stats:{fast:[6,7,83]} };
    J.upgrade(save);
    assert.equal(save.lvStars.length,108);
    for(let s=0;s<12;s++) for(let l=0;l<7;l++) assert.equal(save.lvStars[s*9+l],old[s*7+l]);
    assert.equal(save.lvOpen[0],8);
    assert.deepEqual(save.stats.fast,[6,9,105]);
    const same = JSON.stringify(save);
    J.upgrade(save);
    assert.equal(JSON.stringify(save),same, 'migration must be idempotent');
});

test('108 campaign configs and endless difficulty stay within supported sizes', () => {
    const levels = J.extendLevels(Array.from({length:84},(_,i)=>({id:i})));
    assert.equal(levels.length,108);
    for(let s=0;s<12;s++) {
        assert.equal(levels[s*9].id,s*7);
        assert.equal(levels[s*9+7].match3,true);
        assert.equal(levels[s*9+8].match3,true);
    }
    for(let n=1;n<=120;n++) {
        const c=J.endlessConfig(n);
        assert.ok(c.par>0);
        if(c.oracle) assert.ok(c.stages[0].rows*c.stages[0].cols>=c.stages[0].targets);
        else if(!c.match3) assert.ok(c.rows*c.cols>=c.pairs*2);
    }
});
