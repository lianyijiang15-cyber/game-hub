'use strict';
// Each bot owns its private memory. Never provide other players' secret roles.
const ENDPOINT=process.env.OLLAMA_URL||'http://127.0.0.1:11434';
const MODEL=process.env.OLLAMA_MODEL||'qwen2.5:7b';
const TIMEOUT=Number(process.env.OLLAMA_TIMEOUT_MS||60000);
function view(room,bot){
 const players=room.players.filter(p=>p.alive).map(p=>({id:p.id,name:p.name,team:room.type==='arena'?p.team:undefined,hp:room.type==='arena'?p.hp:undefined,job:room.type==='arena'?p.job:undefined}));
 const allowed=room.type==='wolf'
  ?room.players.filter(p=>p.alive&&p.id!==bot.id&&(room.phase!=='night'||!p.role?.includes('狼'))).map(p=>p.id)
  :players.filter(p=>p.id!==bot.id&&p.team!==bot.team).map(p=>p.id);
 const friends=room.type==='arena'?players.filter(p=>p.team===bot.team).map(p=>p.id):[];
 return {game:room.type,phase:room.phase,day:room.day||0,mode:room.mode||null,self:{id:bot.id,name:bot.name,role:bot.role||null,team:bot.team||null,job:bot.job||null,hp:bot.hp??null},players,allowedTargets:allowed,healable:friends,history:(bot.memory?.events||[]).slice(-24),notes:(bot.memory?.notes||[]).slice(-8),wolfTeammates:room.type==='wolf'&&bot.role?.includes('狼')?room.players.filter(p=>p.id!==bot.id&&p.role?.includes('狼')).map(p=>({id:p.id,name:p.name})):[]};
}
function normalize(decision,state){
 if(!decision||typeof decision!=='object')throw Error('AI response is not JSON object');
 const target=String(decision.target||'');
 const say=typeof decision.say==='string'?decision.say.slice(0,180):'';
 const note=typeof decision.note==='string'?decision.note.slice(0,240):'';
 if(state.game==='wolf'){
  if(!state.allowedTargets.includes(target))throw Error('AI chose illegal vote target');
  return {action:'vote',target,say,note};
 }
 if(decision.action==='heal'&&state.self.job==='輔助'&&state.healable.includes(target))return {action:'heal',target,say,note};
 if(decision.action==='attack'&&state.allowedTargets.includes(target))return {action:'attack',target,say,note};
 throw Error('AI chose illegal arena action');
}
async function infer(state,{fetchImpl=fetch,model=MODEL,endpoint=ENDPOINT,timeout=TIMEOUT}={}){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
 const system='你是一名遊戲內的自主 AI 玩家。請根據自己的身分、可見事件、歷史記憶推理和採取有目的的行動。絕不可假設知道其他玩家隱藏角色。狼人可以說謊，村民必須推理。團隊戰須考慮血量、職業、保護隊友與集火。只能輸出 JSON，格式 {"action":"vote|attack|heal","target":"玩家 id","say":"公開發言（繁體中文）","note":"私有策略記憶（繁體中文）"}。請先分析事件，再選擇合法目標。不得暴露自己的秘密推理筆記。';
 try{
  const response=await fetchImpl(endpoint.replace(/\/$/,'')+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({model,stream:false,format:'json',messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(state)}],options:{temperature:0.45,num_predict:220}})});
  if(!response.ok)throw Error('Ollama HTTP '+response.status);
  const data=await response.json();const raw=data?.message?.content;if(typeof raw!=='string')throw Error('Ollama returned no message');
  return normalize(JSON.parse(raw),state);
 }finally{clearTimeout(timer);}
}
function remember(bot,event){bot.memory??={events:[],notes:[]};bot.memory.events.push(String(event).slice(0,350));if(bot.memory.events.length>48)bot.memory.events.shift();}
function saveNote(bot,note){bot.memory??={events:[],notes:[]};if(note){bot.memory.notes.push(note);if(bot.memory.notes.length>16)bot.memory.notes.shift();}}
module.exports={view,normalize,infer,remember,saveNote};
