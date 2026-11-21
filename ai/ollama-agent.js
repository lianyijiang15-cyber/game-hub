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
 return {game:room.type,phase:room.phase,day:room.day||0,mode:room.mode||null,self:{id:bot.id,name:bot.name,role:bot.role||null,team:bot.team||null,job:bot.job||null,hp:bot.hp??null,persona:bot.persona||'理性觀察派'},players,allowedTargets:allowed,healable:friends,history:(bot.memory?.events||[]).slice(-24),notes:(bot.memory?.notes||[]).slice(-8),wolfVotes:room.type==='wolf'&&room.phase==='night'&&bot.role?.includes('狼')?Object.entries(room.votes||{}).filter(([id])=>room.players.some(p=>p.id===id&&p.role?.includes('狼'))).map(([id,target])=>({voter:room.players.find(p=>p.id===id)?.name,target:room.players.find(p=>p.id===target)?.name,targetId:target})):[],wolfTeammates:room.type==='wolf'&&bot.role?.includes('狼')?room.players.filter(p=>p.id!==bot.id&&p.role?.includes('狼')).map(p=>({id:p.id,name:p.name})):[]};
}
function normalize(decision,state){
 if(!decision||typeof decision!=='object')throw Error('AI response is not JSON object');
 const target=String(decision.target||'');
 const say=typeof decision.say==='string'?decision.say.slice(0,180):'';
 const note=typeof decision.note==='string'?decision.note.slice(0,240):'';
 if(state.game==='wolf'){if(state.phase==='discussion')return {action:'discuss',target:state.allowedTargets.includes(target)?target:null,say,note};
  if(!state.allowedTargets.includes(target))throw Error('AI chose illegal vote target: '+JSON.stringify(target)+'; allowed='+JSON.stringify(state.allowedTargets));
  return {action:'vote',target,say,note};
 }
 if(decision.action==='heal'&&state.self.job==='輔助'&&state.healable.includes(target))return {action:'heal',target,say,note};
 if(decision.action==='attack'&&state.allowedTargets.includes(target))return {action:'attack',target,say,note};
 throw Error('AI chose illegal arena action');
}
async function infer(state,{fetchImpl=fetch,model=MODEL,endpoint=ENDPOINT,timeout=TIMEOUT}={}){
 const allowed=state.allowedTargets||[];
 if(state.game==='wolf'&&state.phase!=='discussion'&&!allowed.length)throw Error('No legal vote targets');
 const schema={type:'object',properties:{
  action:{type:'string',enum:state.game==='wolf'?[state.phase==='discussion'?'discuss':'vote']:['attack','heal']},
  target:state.game==='wolf'&&state.phase==='discussion'?{type:'string'}:{type:'string',enum:[...new Set([...allowed,...(state.game==='arena'?state.healable||[]:[])])]},
  say:{type:'string'},note:{type:'string'}
 },required:['action','target','say','note']};
 const system='你是一名狼人殺／團隊對抗的自主 AI 玩家。請依照自己的身分、persona、事件記憶和玩家發言做出獨立推理。不可得知未公開的他人角色。狼人可說謊，但必須知道狼隊友。夜間狼隊要參考 wolfVotes 來協調擊殺目標，避免平票。討論階段只進行辯論，不得投票，應直接回應最新真人發言、提出問題與反駁。白天投票應根據討論推理，禁止無理由跟票。輸出 JSON 的 action、target、say、note。target 必須是 allowedTargets 中的完整 id，絕對不可填玩家名稱、座號、索引或其他文字；討論階段 target 可以是空字串。say 是自然繁體中文發言，note 是私有策略記憶。';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  let correction='';
  for(let attempt=0;attempt<3;attempt++){
   const userMessage=JSON.stringify(state)+(correction?'\\n'+correction:'')+'\\n合法投票目標 id：'+JSON.stringify(allowed);
   const response=await fetchImpl(endpoint.replace(/\/$/,'')+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({model,stream:false,format:schema,messages:[{role:'system',content:system},{role:'user',content:userMessage}],options:{temperature:0.35,num_predict:300}})});
   if(!response.ok)throw Error('Ollama HTTP '+response.status);
   const data=await response.json(),raw=data?.message?.content;
   if(typeof raw!=='string')throw Error('Ollama returned no message');
   try{return normalize(JSON.parse(raw),state);}
   catch(err){
    if(attempt===2)throw Error('AI failed to produce legal decision after 3 attempts: '+err.message);
    correction='上次輸出不合法：'+err.message+'。請重新獨立判斷，target 僅能使用列出的合法 id；不可使用名稱。';
   }
  }
 }finally{clearTimeout(timer);}
}

function remember(bot,event){bot.memory??={events:[],notes:[]};bot.memory.events.push(String(event).slice(0,350));if(bot.memory.events.length>48)bot.memory.events.shift();}
function saveNote(bot,note){bot.memory??={events:[],notes:[]};if(note){bot.memory.notes.push(note);if(bot.memory.notes.length>16)bot.memory.notes.shift();}}
module.exports={view,normalize,infer,remember,saveNote};
