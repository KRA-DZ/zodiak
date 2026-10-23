const {test}=require('node:test');
const assert=require('node:assert/strict');
const {canonical,decision,parse}=require('../cloud-save.js');

test('cloud comparisons ignore object key order but keep balances and array order exact',()=>{
 assert.equal(canonical({b:2,a:{d:4,c:3}}),canonical({a:{c:3,d:4},b:2}));
 assert.notEqual(canonical({coins:2,items:[1,2]}),canonical({coins:2,items:[2,1]}));
});
test('cloud lineage distinguishes unchanged local, unchanged remote and divergent branches without adding balances',()=>{
 const base={dust:50},local={dust:10},remote={id:'new-revision',updatedAt:1,save:{dust:80}};
 assert.equal(decision(local,null,null),'upload');
 assert.equal(decision({dust:80},remote,null),'same');
 assert.equal(decision(local,remote,{id:remote.id,base:canonical(base)}),'upload');
 assert.equal(decision(local,remote,{id:'old-revision',base:canonical(local)}),'restore');
 assert.equal(decision(local,remote,{id:'old-revision',base:canonical(base)}),'conflict');
 assert.equal(decision(local,{...remote,updatedAt:999999999999999},null),'conflict');
 assert.deepEqual(local,{dust:10});assert.equal(remote.save.dust,80);
});
test('only a pristine browser can restore a differing cloud without a known common baseline',()=>{
 assert.equal(decision({dust:0},{id:'cloud',save:{dust:50}},null,true),'restore');
 assert.equal(decision({dust:1},{id:'cloud',save:{dust:50}},null,false),'conflict');
});
test('unrecognized or malformed cloud envelopes cannot reset or bypass progress validation',()=>{
 for(const packet of [null,{}, {version:2,id:'future-cloud',updatedAt:1,save:{}},{version:1,id:'valid-id',updatedAt:1,save:{dust:-1}},{version:1,id:'<bad-id>',updatedAt:1,save:{}}])assert.throws(()=>parse(packet));
});
