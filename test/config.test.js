'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {roles,sizes}=require('../server');
test('狼人殺人數配置符合 PDF',()=>{
 for(const n of sizes.wolf){assert.equal(roles[n].length,n);assert.ok(roles[n].some(role=>role.includes('狼')));}
});
test('團隊對抗支援 10/12/14 人',()=>assert.deepEqual(sizes.arena,[10,12,14]));
test('狼人殺支援 8/9/10/12 人',()=>assert.deepEqual(sizes.wolf,[8,9,10,12]));
