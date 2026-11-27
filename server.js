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
function publicRoom(r){return {id:r.id,type:r.type,size:r.size,host:r.host,started:r.started,phase:r.phase,day:r.day,mode:r.mode||null,players:r.players.map(p=>({id:p.id,name:p.name,ready:p.ready,alive:p.alive,bot:!!p.bot,team:p.team||null,hp:p.hp??null,job:p.job||null})),logs:r.logs.slice(-35),revealedRoles:r.type==='wolf'&&r.phase==='ended'?r.players.map(p=>({id:p.id,name:p.name,role:p.role})):null};}
function list(){io.emit('rooms',Array.from(rooms.values()).map(publicRoom));}
function publish(r){io.to(r.id).emit('room',publicRoom(r));if(r.type==='wolf'&&r.started){for(const p of r.players.filter(p=>!p.bot&&isWolf(p)))io.to(p.id).emit('wolfIntel',{teammates:r.players.filter(isWolf).map(q=>({id:q.id,name:q.name,alive:q.alive})),votes:r.phase==='night'?Object.entries(r.votes).filter(([id])=>isWolf(player(r,id))).map(([id,target])=>({voter:player(r,id)?.name,target:player(r,target)?.name,targetId:target})):[]});}list();}
function notice(r,s){for(const p of r.players.filter(p=>p.bot))agent.remember(p,s);r.logs.push(s);if(r.logs.length>100)r.logs.shift();io.to(r.id).emit('notice',s);}
function player(r,id){return r.players.find(p=>p.id===id);}
function actorRoom(socket){const r=rooms.get(socket.data.room);return r&&player(r,socket.id)?r:null;}
function revealRoles(r){if(r.revealed)return;r.revealed=true;io.to(r.id).emit('rolesRevealed',r.players.map(p=>({name:p.name,role:p.role,alive:p.alive})));notice(r,'🏁 遊戲結束，所有玩家身分已公開。');}
function winner(r){const live=r.players.filter(p=>p.alive),wolves=live.filter(isWolf);if(!wolves.length||wolves.length>=live.length-wolves.length){r.phase='ended';notice(r,!wolves.length?'好人陣營獲勝！':'狼人陣營獲勝！');revealRoles(r);publish(r);return true;}return false;}
function wolfPhase(r,phase){r.phase=phase;r.votes={};if(phase==='discussion'){r.day++;notice(r,'第 '+r.day+' 天：討論階段，請交換線索、質疑與辯論，房主可結束討論並進入投票。');}else if(phase==='day')notice(r,'討論結束：開始放逐投票。');else notice(r,'黑夜降臨：狼人可以在秘密頻道討論目標，並查看隊友的投票。');publish(r);if(phase==='discussion')scheduleDebate(r);else scheduleBots(r);}
function resolveVotes(r){if(r.phase!=='day'&&r.phase!=='night')return;
 const eligible=r.players.filter(p=>p.alive&&(r.phase==='day'||isWolf(p)));
 if(!eligible.length||!eligible.every(p=>r.votes[p.id]))return;
 const count=new Map();for(const target of Object.values(r.votes))count.set(target,(count.get(target)||0)+1);
 const ordered=[...count].sort((a,b)=>b[1]-a[1]);
 if(ordered.length===1||ordered[0][1]>ordered[1][1]){const victim=player(r,ordered[0][0]);if(victim?.alive){victim.alive=false;notice(r,(r.phase==='night'?'夜晚：':'白天：')+victim.name+' 被淘汰。');}}
 else notice(r,'本回合平票，無人淘汰。');
 if(!winner(r))wolfPhase(r,r.phase==='night'?'discussion':'night');
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
    if(decision.say&&phase==='day'){io.to(r.id).emit('chat',{name:bot.name,text:decision.say,team:null});for(const p of r.players.filter(p=>p.bot&&p.alive))agent.remember(p,bot.name+'：'+decision.say);}
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
async function scheduleDebate(r){if(r.debateBusy||r.phase!=='discussion')return;r.debateBusy=true;try{for(const bot of r.players.filter(p=>p.bot&&p.alive)){if(!rooms.has(r.id)||r.phase!=='discussion')break;try{const decision=await agent.infer(agent.view(r,bot));if(r.phase!=='discussion')break;agent.saveNote(bot,decision.note);if(decision.say){io.to(r.id).emit('chat',{name:bot.name,text:decision.say});for(const other of r.players.filter(p=>p.bot&&p.alive&&p.id!==bot.id))agent.remember(other,bot.name+'：'+decision.say);}}catch(err){notice(r,'⚠️ '+bot.name+' 討論失敗：'+err.message);}}}finally{r.debateBusy=false;}}
function leave(socket){const r=actorRoom(socket);if(!r)return;socket.leave(r.id);socket.data.room=null;r.players=r.players.filter(p=>p.id!==socket.id);
 if(!r.players.some(p=>!p.bot)){clearTimeout(r.debateTimer);clearTimeout(r.botTimer);clearInterval(r.arenaTimer);rooms.delete(r.id);list();return;}
 if(r.host===socket.id)r.host=r.players.find(p=>!p.bot).id;
 notice(r,'玩家離開房間');if(r.started&&r.type==='wolf'&&r.phase!=='ended'){if(!winner(r))resolveVotes(r);}publish(r);
}
const W=960,H=576, walls=[[280,80,48,144],[280,352,48,144],[632,80,48,144],[632,352,48,144],[432,240,96,96]];
const classes={warrior:{hp:150,speed:150,range:52,damage:24,cd:650},archer:{hp:100,speed:185,range:240,damage:17,cd:850},mage:{hp:80,speed:165,range:190,damage:20,cd:950}};
function blocked(x,y){return x<24||y<24||x>W-24||y>H-24||walls.some(([a,b,w,h])=>x+12>a&&x-12<a+w&&y+12>b&&y-12<b+h);}
function clearLine(a,b){const d=Math.hypot(b.x-a.x,b.y-a.y);for(let i=0;i<=d;i+=8){const t=i/(d||1);if(blocked(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t))return false;}return true;}
function spawn(p){p.x=p.team==='紅隊'?80:880;p.y=80+p.slot*100;p.hp=classes[p.job].hp;p.alive=true;p.input={x:0,y:0};p.lastInput=0;p.respawn=0;}
function startArena(r){r.mode='團隊死鬥';r.phase='playing';r.score={'紅隊':0,'藍隊':0};r.effects=[];r.ends=Date.now()+300000;shuffle(r.players).forEach((p,i)=>{p.team=i<5?'紅隊':'藍隊';p.slot=i%5;p.job=classes[p.job]?p.job:Object.keys(classes)[i%3];p.attackAt=0;p.skillAt=0;spawn(p);});notice(r,'戰鬥開始！率先取得 20 擊殺或五分鐘後領先者獲勝。');publish(r);r.arenaTimer=setInterval(()=>tick(r),50);}
function hit(r,p,q,damage){if(!q.alive)return;q.hp=Math.max(0,q.hp-damage);if(!q.hp){q.alive=false;q.respawn=Date.now()+3000;r.score[p.team]++;}}
function attack(r,p,x,y,skill=false){if(!p.alive||r.phase!=='playing'||!Number.isFinite(x)||!Number.isFinite(y))return;const now=Date.now(),c=classes[p.job],key=skill?'skillAt':'attackAt';if(now<p[key])return;p[key]=now+(skill?5000:c.cd);const angle=Math.atan2(y-p.y,x-p.x),range=skill?(p.job==='warrior'?90:c.range):c.range;const targets=r.players.filter(q=>q.alive&&q.team!==p.team&&Math.hypot(q.x-p.x,q.y-p.y)<=range&&clearLine(p,q)).filter(q=>skill&&p.job==='warrior'||Math.abs(Math.atan2(Math.sin(Math.atan2(q.y-p.y,q.x-p.x)-angle),Math.cos(Math.atan2(q.y-p.y,q.x-p.x)-angle)))<(skill?.65:.30)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));for(const q of targets.slice(0,skill?10:1))hit(r,p,q,c.damage*(skill?1.6:1));r.effects.push({x:p.x,y:p.y,angle,range,skill,team:p.team,until:now+200});}
function tick(r){if(!rooms.has(r.id)||r.phase!=='playing'){clearInterval(r.arenaTimer);return;}const now=Date.now();for(const p of r.players){if(!p.alive){if(now>=p.respawn)spawn(p);continue;}let v=p.input||{x:0,y:0};if(p.bot){const q=r.players.filter(q=>q.alive&&q.team!==p.team).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];if(q){const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);v=d>classes[p.job].range*.8?{x:dx/(d||1),y:dy/(d||1)}:{x:0,y:0};if(!clearLine(p,q)){v={x:0,y:p.y<288?-1:1};if(p.y<40||p.y>536)v={x:Math.sign(dx),y:0};}attack(r,p,q.x,q.y,now>=p.skillAt);}}else if(now-p.lastInput>350)v={x:0,y:0};const n=Math.max(1,Math.hypot(v.x,v.y)),step=classes[p.job].speed*.05;const x=p.x+v.x/n*step,y=p.y+v.y/n*step;if(!blocked(x,p.y))p.x=x;if(!blocked(p.x,y))p.y=y;}
r.effects=r.effects.filter(e=>e.until>now);if(now>=r.ends||Object.values(r.score).some(n=>n>=20)){r.phase='ended';clearInterval(r.arenaTimer);notice(r,'比賽結束：'+(r.score['紅隊']===r.score['藍隊']?'平手':r.score['紅隊']>r.score['藍隊']?'紅隊獲勝':'藍隊獲勝'));publish(r);}io.to(r.id).emit('arenaState',{players:r.players.map(p=>({id:p.id,name:p.name,team:p.team,job:p.job,x:p.x,y:p.y,hp:p.hp,maxHp:classes[p.job].hp,alive:p.alive,skillAt:p.skillAt})),walls,score:r.score,remaining:Math.max(0,r.ends-now),effects:r.effects,phase:r.phase});}
io.on('connection',socket=>{
 socket.on('list',()=>socket.emit('rooms',Array.from(rooms.values()).map(publicRoom)));
 socket.on('create',(data={},ack=()=>{})=>{if(actorRoom(socket))return ack({error:'請先離開目前房間'});const {type,name}=data,size=Number(data.size);
 if(type!=='arena'||size!==10||typeof name!=='string'||!name.trim())return ack({error:'請輸入有效暱稱與房間人數'});
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
 r.players.push({id:'bot-'+crypto.randomUUID(),name:'AI '+n,bot:true,ready:true,alive:true,persona:['懷疑派：對證據要求嚴格，經常質疑其他人的推論','直覺派：敢提出不同猜測，但願意修正','調停派：擅長整合各方說法，不盲目跟票','強勢派：主動追問矛盾，會公開挑戰觀點','保守派：先觀察再表態，重視前後一致性','冒險派：偏好提出大膽假設並驗證'][((n-1)%6)],memory:{events:[],notes:[]}});notice(r,'AI '+n+' 加入房間');publish(r);ack({ok:true});});
 socket.on('removeBot',(id,ack=()=>{})=>{const r=actorRoom(socket);if(!r||r.host!==socket.id||r.started)return ack({error:'只有等待中的房主能移除 AI'});const p=player(r,id);if(!p?.bot)return ack({error:'找不到 AI'});r.players=r.players.filter(p=>p.id!==id);publish(r);ack({ok:true});});
 socket.on('ready',()=>{const r=actorRoom(socket);if(!r||r.started)return;const p=player(r,socket.id);p.ready=!p.ready;publish(r);});
 socket.on('start',()=>{const r=actorRoom(socket);if(!r||r.host!==socket.id||r.started||r.players.length!==r.size||!r.players.every(p=>p.ready))return;
 r.started=true;r.revealed=false;if(r.type==='wolf'){const deck=shuffle([...roles[r.size]]);r.players.forEach((p,i)=>{p.role=deck[i];if(!p.bot)io.to(p.id).emit('role',p.role);});wolfPhase(r,'night');}else startArena(r);});
 socket.on('endDiscussion',()=>{const r=actorRoom(socket);if(r?.type==='wolf'&&r.phase==='discussion'&&r.host===socket.id)wolfPhase(r,'day');});
 socket.on('vote',id=>{const r=actorRoom(socket);if(!r||r.type!=='wolf'||!['night','day'].includes(r.phase))return;const actor=player(r,socket.id),target=player(r,id);
 if(!actor.alive||!target?.alive||actor.id===target.id||r.votes[actor.id]||(r.phase==='night'&&!isWolf(actor)))return;
 if(r.phase==='night'&&isWolf(target))return;r.votes[actor.id]=target.id;resolveVotes(r);publish(r);});
 socket.on('arenaInput',data=>{const r=actorRoom(socket);if(r?.phase!=='playing'||!data)return;const p=player(r,socket.id);if(!Number.isFinite(data.x)||!Number.isFinite(data.y))return;p.input={x:Math.max(-1,Math.min(1,data.x)),y:Math.max(-1,Math.min(1,data.y))};p.lastInput=Date.now();});
 socket.on('arenaAttack',data=>{const r=actorRoom(socket);if(r?.phase==='playing'&&data)attack(r,player(r,socket.id),data.x,data.y,data.skill===true);});
 socket.on('chooseClass',job=>{const r=actorRoom(socket);if(r&&!r.started&&Object.hasOwn(classes,job)){player(r,socket.id).job=job;publish(r);}});
 socket.on('chat',message=>{const r=actorRoom(socket);if(!r||typeof message!=='string')return;const text=message.trim().slice(0,300);if(!text)return;const p=player(r,socket.id);if(r.type!=='wolf'&&r.started&&!p.alive)return;if(r.type==='wolf'&&r.phase==='night'&&p.alive&&!isWolf(p))return;
 if(r.type==='wolf'&&r.started&&!p.alive){const payload={name:p.name,text,dead:true};for(const ghost of r.players.filter(q=>!q.bot&&!q.alive))io.to(ghost.id).emit('deadChat',payload);return;}
 const payload={name:p.name,text,team:p.team||null};for(const bot of r.players.filter(q=>q.bot&&(r.type!=='arena'||!r.started||q.team===p.team)&&(r.type!=='wolf'||r.phase!=='night'||isWolf(q))))agent.remember(bot,p.name+'：'+text);if(r.type==='arena'&&r.started)for(const teammate of r.players.filter(q=>!q.bot&&q.team===p.team))io.to(teammate.id).emit('chat',payload);else if(r.type==='wolf'&&r.phase==='night'){for(const wolf of r.players.filter(q=>!q.bot&&isWolf(q)))io.to(wolf.id).emit('chat',payload);}else if(r.type!=='arena'||!r.started)io.to(r.id).emit('chat',payload);
 if(r.type==='wolf'&&r.phase==='discussion'&&p.alive&&r.players.some(q=>q.bot&&q.alive)){clearTimeout(r.debateTimer);r.debateTimer=setTimeout(()=>scheduleDebate(r),Number(process.env.AI_DEBATE_DELAY_MS||2500));}
 });
 socket.on('disconnect',()=>leave(socket));
});
if(require.main===module)server.listen(process.env.PORT||3000,()=>console.log('Game Hub: http://localhost:'+(process.env.PORT||3000)));
module.exports={app,server,roles,sizes,rooms};
