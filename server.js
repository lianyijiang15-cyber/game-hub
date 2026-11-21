'use strict';
const express=require('express'),http=require('http'),path=require('path'),crypto=require('crypto');
const {Server}=require('socket.io');
const agent=require('./ai/ollama-agent');
const app=express(),server=http.createServer(app),io=new Server(server);
app.use(express.static(path.join(__dirname,'public')));
const rooms=new Map(),sizes={wolf:[8,9,10,12],arena:[10,12,14]};
const roles={
8:['狼人','狼人','平民','平民','平民','預言家','守衛','女巫'],
9:['狼人','狼人','狼人','平民','平民','平民','預言家','女巫','獵人'],
10:['狼人','狼人','狼王','平民','平民','平民','預言家','女巫','獵人','白癡'],
12:['狼人','狼人','狼人','狼王','平民','平民','平民','平民','預言家','獵人','守衛','女巫']
};
const rand=a=>a[Math.floor(Math.random()*a.length)];
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const isWolf=p=>p.role==='狼人'||p.role==='狼王';
function publicRoom(r){return {id:r.id,type:r.type,size:r.size,host:r.host,started:r.started,phase:r.phase,day:r.day,mode:r.mode||null,players:r.players.map(p=>({id:p.id,name:p.name,ready:p.ready,alive:p.alive,bot:!!p.bot,team:p.team||null,hp:p.hp??null,job:p.job||null})),logs:r.logs.slice(-35)};}
function list(){io.emit('rooms',Array.from(rooms.values()).map(publicRoom));}
function publish(r){io.to(r.id).emit('room',publicRoom(r));list();}
function notice(r,s){for(const p of r.players.filter(p=>p.bot))agent.remember(p,s);r.logs.push(s);if(r.logs.length>100)r.logs.shift();io.to(r.id).emit('notice',s);}
function player(r,id){return r.players.find(p=>p.id===id);}
function actorRoom(socket){const r=rooms.get(socket.data.room);return r&&player(r,socket.id)?r:null;}
function winner(r){const live=r.players.filter(p=>p.alive),wolves=live.filter(isWolf);if(!wolves.length||wolves.length>=live.length-wolves.length){r.phase='ended';notice(r,!wolves.length?'好人陣營獲勝！':'狼人陣營獲勝！');publish(r);return true;}return false;}
function wolfPhase(r,phase){r.phase=phase;r.votes={};if(phase==='day'){r.day++;notice(r,'第 '+r.day+' 天：所有存活玩家投票放逐。');}else notice(r,'黑夜降臨：狼人投票選擇目標。');publish(r);scheduleBots(r);}
function resolveVotes(r){if(r.phase!=='day'&&r.phase!=='night')return;
 const eligible=r.players.filter(p=>p.alive&&(r.phase==='day'||isWolf(p)));
 if(!eligible.length||!eligible.every(p=>r.votes[p.id]))return;
 const count=new Map();for(const target of Object.values(r.votes))count.set(target,(count.get(target)||0)+1);
 const ordered=[...count].sort((a,b)=>b[1]-a[1]);
 if(ordered.length===1||ordered[0][1]>ordered[1][1]){const victim=player(r,ordered[0][0]);if(victim?.alive){victim.alive=false;notice(r,(r.phase==='night'?'夜晚：':'白天：')+victim.name+' 被淘汰。');}}
 else notice(r,'本回合平票，無人淘汰。');
 if(!winner(r))wolfPhase(r,r.phase==='night'?'day':'night');
}
async function runWolfAgents(r,phase){
 if(r.aiRunning)return;r.aiRunning=true;
 try{
  const bots=r.players.filter(p=>p.bot&&p.alive&&(phase==='day'||isWolf(p)));
  for(const bot of bots){
   if(!rooms.has(r.id)||r.phase!==phase||!bot.alive)break;
   if(r.votes[bot.id])continue;
   try{
    const state=agent.view(r,bot);
    const decision=await agent.infer(state);
    if(!rooms.has(r.id)||r.phase!==phase||!bot.alive)break;
    agent.saveNote(bot,decision.note);
    if(decision.say&&phase==='day'){io.to(r.id).emit('chat',{name:bot.name,text:decision.say,team:null});for(const p of r.players.filter(p=>p.bot))agent.remember(p,bot.name+'：'+decision.say);}
    r.votes[bot.id]=decision.target;
    resolveVotes(r);publish(r);
   }catch(err){notice(r,'⚠️ '+bot.name+' AI 無法決策：'+err.message+'。請檢查 Ollama；系統不會以隨機投票代替。');break;}
  }
 }finally{r.aiRunning=false;if(r.aiPending){const next=r.aiPending;r.aiPending=null;scheduleBots(r);}}
}
function scheduleBots(r){
 if(!['day','night'].includes(r.phase))return;
 if(r.aiRunning){r.aiPending=r.phase;return;}
 const phase=r.phase;
 setImmediate(()=>runWolfAgents(r,phase));
}
function leave(socket){const r=actorRoom(socket);if(!r)return;socket.leave(r.id);socket.data.room=null;r.players=r.players.filter(p=>p.id!==socket.id);
 if(!r.players.some(p=>!p.bot)){clearTimeout(r.botTimer);clearInterval(r.arenaTimer);rooms.delete(r.id);list();return;}
 if(r.host===socket.id)r.host=r.players.find(p=>!p.bot).id;
 notice(r,'玩家離開房間');if(r.started&&r.type==='wolf'&&r.phase!=='ended'){if(!winner(r))resolveVotes(r);}publish(r);
}
function startArena(r){r.mode=rand(['拔旗戰','生存戰','據點戰']);r.phase='playing';shuffle(r.players).forEach((p,i)=>{p.team=i%2?'藍隊':'紅隊';p.hp=100;p.job=i<2?'指揮':i<4?'輔助':'打手';});r.round=1;notice(r,'團隊對抗開始！模式：'+r.mode+'。目前為回合制戰鬥原型，非 PDF 的完整即時地圖模式。');publish(r);scheduleArenaBots(r);}
function arenaAttack(r,attacker,target,heal=false){if(r.phase!=='playing'||!attacker.alive||!target.alive)return false;
 if(heal){if(attacker.job!=='輔助'||attacker.team!==target.team)return false;target.hp=Math.min(100,target.hp+25);notice(r,attacker.name+' 治療 '+target.name+'（+25 HP）');}
 else{if(attacker.team===target.team)return false;target.hp=Math.max(0,target.hp-(attacker.job==='打手'?30:15));if(!target.hp)target.alive=false;notice(r,attacker.name+' 攻擊 '+target.name+'（剩餘 '+target.hp+' HP）');}
 const red=r.players.some(p=>p.alive&&p.team==='紅隊'),blue=r.players.some(p=>p.alive&&p.team==='藍隊');
 if(!red||!blue){r.phase='ended';notice(r,(red?'紅隊':'藍隊')+' 勝利！');}publish(r);return true;
}
function scheduleArenaBots(r){
 if(r.arenaTimer)clearInterval(r.arenaTimer);
 r.arenaTimer=setInterval(async()=>{
  if(!rooms.has(r.id)||r.phase!=='playing'){clearInterval(r.arenaTimer);return;}
  if(r.arenaBusy)return;r.arenaBusy=true;
  try{
   for(const bot of r.players.filter(p=>p.bot&&p.alive)){
    if(r.phase!=='playing')break;
    try{
     const decision=await agent.infer(agent.view(r,bot));
     if(!rooms.has(r.id)||r.phase!=='playing'||!bot.alive)break;
     agent.saveNote(bot,decision.note);
     if(decision.say){for(const teammate of r.players.filter(p=>!p.bot&&p.team===bot.team))io.to(teammate.id).emit('chat',{name:bot.name,text:decision.say,team:bot.team});}
     const target=player(r,decision.target);
     if(target)arenaAttack(r,bot,target,decision.action==='heal');
    }catch(err){notice(r,'⚠️ '+bot.name+' AI 無法決策：'+err.message+'。未執行替代攻擊。');break;}
   }
  }finally{r.arenaBusy=false;}
 },Number(process.env.AI_ARENA_INTERVAL_MS||12000));r.arenaTimer.unref?.();
}
io.on('connection',socket=>{
 socket.on('list',()=>socket.emit('rooms',Array.from(rooms.values()).map(publicRoom)));
 socket.on('create',(data={},ack=()=>{})=>{if(actorRoom(socket))return ack({error:'請先離開目前房間'});const {type,name}=data,size=Number(data.size);
 if(!sizes[type]?.includes(size)||typeof name!=='string'||!name.trim())return ack({error:'請輸入有效暱稱與房間人數'});
 let id;do{id=crypto.randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(id));
 const r={id,type,size,host:socket.id,started:false,phase:'lobby',day:0,players:[{id:socket.id,name:name.trim().slice(0,24),ready:false,alive:true,bot:false}],votes:{},logs:[]};
 rooms.set(id,r);socket.join(id);socket.data.room=id;ack({id});publish(r);
 });
 socket.on('join',(data={},ack=()=>{})=>{if(actorRoom(socket))return ack({error:'請先離開目前房間'});const r=rooms.get(String(data.id||'').toUpperCase());if(!r||r.started||r.players.length>=r.size)return ack({error:'房間不存在、已開始或已滿'});
 if(typeof data.name!=='string'||!data.name.trim())return ack({error:'請輸入暱稱'});
 r.players.push({id:socket.id,name:data.name.trim().slice(0,24),ready:false,alive:true,bot:false});socket.join(r.id);socket.data.room=r.id;ack({id:r.id});publish(r);});
 socket.on('leave',()=>leave(socket));
 socket.on('addBot',(ack=()=>{})=>{const r=actorRoom(socket);if(!r||r.host!==socket.id||r.started)return ack({error:'只有等待中的房主能加入 AI'});
 if(r.players.length>=r.size)return ack({error:'房間已滿'});let n=1;while(r.players.some(p=>p.name==='AI '+n))n++;
 r.players.push({id:'bot-'+crypto.randomUUID(),name:'AI '+n,bot:true,ready:true,alive:true,memory:{events:[],notes:[]}});notice(r,'AI '+n+' 加入房間');publish(r);ack({ok:true});});
 socket.on('removeBot',(id,ack=()=>{})=>{const r=actorRoom(socket);if(!r||r.host!==socket.id||r.started)return ack({error:'只有等待中的房主能移除 AI'});const p=player(r,id);if(!p?.bot)return ack({error:'找不到 AI'});r.players=r.players.filter(p=>p.id!==id);publish(r);ack({ok:true});});
 socket.on('ready',()=>{const r=actorRoom(socket);if(!r||r.started)return;const p=player(r,socket.id);p.ready=!p.ready;publish(r);});
 socket.on('start',()=>{const r=actorRoom(socket);if(!r||r.host!==socket.id||r.started||r.players.length!==r.size||!r.players.every(p=>p.ready))return;
 r.started=true;if(r.type==='wolf'){const deck=shuffle([...roles[r.size]]);r.players.forEach((p,i)=>{p.role=deck[i];if(!p.bot)io.to(p.id).emit('role',p.role);});wolfPhase(r,'night');}else startArena(r);});
 socket.on('vote',id=>{const r=actorRoom(socket);if(!r||r.type!=='wolf'||!['night','day'].includes(r.phase))return;const actor=player(r,socket.id),target=player(r,id);
 if(!actor.alive||!target?.alive||actor.id===target.id||r.votes[actor.id]||(r.phase==='night'&&!isWolf(actor)))return;
 if(r.phase==='night'&&isWolf(target))return;r.votes[actor.id]=target.id;resolveVotes(r);publish(r);});
 socket.on('arenaAction',(data={})=>{const r=actorRoom(socket);if(!r||r.type!=='arena')return;const p=player(r,socket.id),target=player(r,data.target);if(!target||!['attack','heal'].includes(data.action))return;
 const now=Date.now();if(p.lastAction&&now-p.lastAction<1800)return;if(arenaAttack(r,p,target,data.action==='heal'))p.lastAction=now;});
 socket.on('chat',message=>{const r=actorRoom(socket);if(!r||typeof message!=='string')return;const text=message.trim().slice(0,300);if(!text)return;const p=player(r,socket.id);if(r.started&&!p.alive)return;if(r.type==='wolf'&&r.phase==='night'&&!isWolf(p))return;
 const payload={name:p.name,text,team:p.team||null};for(const bot of r.players.filter(q=>q.bot&&(r.type!=='arena'||!r.started||q.team===p.team)&&(r.type!=='wolf'||r.phase!=='night'||isWolf(q))))agent.remember(bot,p.name+'：'+text);if(r.type==='arena'&&r.started)for(const teammate of r.players.filter(q=>!q.bot&&q.team===p.team))io.to(teammate.id).emit('chat',payload);else if(r.type==='wolf'&&r.phase==='night'){for(const wolf of r.players.filter(q=>!q.bot&&isWolf(q)))io.to(wolf.id).emit('chat',payload);}else if(r.type!=='arena'||!r.started)io.to(r.id).emit('chat',payload);
 });
 socket.on('disconnect',()=>leave(socket));
});
if(require.main===module)server.listen(process.env.PORT||3000,()=>console.log('Game Hub: http://localhost:'+(process.env.PORT||3000)));
module.exports={app,server,roles,sizes,rooms};
