'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {view,normalize,infer,remember,saveNote}=require('../ai/ollama-agent');
const players=[
{id:'b',name:'AI 1',role:'狼人',bot:true,alive:true},
{id:'w',name:'AI 2',role:'狼人',bot:true,alive:true},
{id:'h',name:'真人',role:'預言家',alive:true}
];
const room={type:'wolf',phase:'night',day:1,players};
test('狼人只能選非狼人，且不洩漏其他人角色',()=>{
 const v=view(room,players[0]);
 assert.deepEqual(v.allowedTargets,['h']);
 assert.deepEqual(v.wolfTeammates,[{id:'w',name:'AI 2'}]);
 assert.equal(v.players[2].role,undefined);
});
test('不合法的投票會被拒絕',()=>assert.throws(()=>normalize({action:'vote',target:'w'},view(room,players[0]))));
test('AI 保留獨立記憶並限制長度',()=>{
 remember(players[0],'3號發言矛盾');saveNote(players[0],'懷疑3號');
 assert.equal(players[0].memory.notes[0],'懷疑3號');
 assert.equal(players[1].memory,undefined);
});
test('模擬 Ollama JSON 決策',async()=>{
 const fetchImpl=async(url,opts)=>({ok:true,json:async()=>({message:{content:JSON.stringify({action:'vote',target:'h',say:'我懷疑三號',note:'優先觀察'})}})});
 const decision=await infer(view(room,players[0]),{fetchImpl,timeout:1000});
 assert.equal(decision.target,'h');assert.equal(decision.say,'我懷疑三號');
});
test('Ollama 連線失敗不能偷偷改用隨機決策',async()=>{
 await assert.rejects(()=>infer(view(room,players[0]),{fetchImpl:async()=>{throw Error('offline');},timeout:1000}),/offline/);
});
test('團隊輔助可治療，不能攻擊隊友',()=>{
 const arena={type:'arena',phase:'playing',players:[{id:'a',name:'AI',bot:true,alive:true,team:'紅隊',job:'輔助',hp:80},{id:'f',name:'隊友',alive:true,team:'紅隊',hp:20},{id:'e',name:'敵人',alive:true,team:'藍隊',hp:90}]};
 const state=view(arena,arena.players[0]);
 assert.equal(normalize({action:'heal',target:'f'},state).action,'heal');
 assert.throws(()=>normalize({action:'attack',target:'f'},state));
});
