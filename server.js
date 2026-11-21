'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { connectionStateRecovery: { maxDisconnectionDuration: 120000, skipMiddlewares: false } });
app.use(express.static(path.join(__dirname, 'public')));
const rooms = new Map();
const sizes = { wolf: [8,9,10,12], arena: [10,12,14] };
const roles = {
  8:['狼人','狼人','平民','平民','平民','預言家','守衛','女巫'],
  9:['狼人','狼人','狼人','平民','平民','平民','預言家','女巫','獵人'],
  10:['狼人','狼人','狼王','平民','平民','平民','預言家','女巫','獵人','白癡'],
  12:['狼人','狼人','狼人','狼王','平民','平民','平民','平民','預言家','獵人','守衛','女巫']
};
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function snapshot(r){return {id:r.id,type:r.type,size:r.size,host:r.host,started:r.started,players:r.players.map(p=>({id:p.id,name:p.name,ready:p.ready,alive:p.alive,team:p.team,hp:p.hp,x:p.x,y:p.y})),phase:r.phase,day:r.day,mode:r.mode,points:r.points,logs:r.logs.slice(-20)};}
function publish(r){io.to(r.id).emit('room',snapshot(r));io.emit('rooms',Array.from(rooms.values()).map(snapshot));}
function log(r,message){r.logs.push(message);if(r.logs.length>60)r.logs.shift();io.to(r.id).emit('notice',message);}
function finishWolf(r){const living=r.players.filter(p=>p.alive);const wolves=living.filter(p=>p.role.includes('狼'));const good=living.length-wolves.length;if(!wolves.length||wolves.length>=good){r.phase='ended';log(r,!wolves.length?'好人陣營勝利！':'狼人陣營勝利！');return true;}return false;}
function advance(r){if(finishWolf(r))return; if(r.phase==='night'){r.phase='day';r.day++;r.votes={};log(r,`第 ${r.day} 天白天：請討論並投票。`);}else{r.phase='night';r.votes={};log(r,'黑夜降臨：狼人請選擇目標。');}publish(r);}
function leaveRoom(socket){const r=rooms.get(socket.data.room);if(!r)return;socket.leave(r.id);socket.data.room=null;r.players=r.players.filter(p=>p.id!==socket.id);if(!r.players.length)rooms.delete(r.id);else{if(r.host===socket.id)r.host=r.players[0].id;if(r.started&&r.type==='wolf'&&r.phase!=='ended')finishWolf(r);log(r,'一名玩家離開房間。');publish(r);}io.emit('rooms',Array.from(rooms.values()).map(snapshot));}
io.on('connection',socket=>{
  socket.on('list',()=>socket.emit('rooms',Array.from(rooms.values()).map(snapshot)));
  if(socket.recovered&&socket.data.room){const r=rooms.get(socket.data.room);if(r){publish(r);const p=r.players.find(p=>p.id===socket.id);if(p?.role)socket.emit('role',p.role);}}
  socket.on('create',({type,size,name}={},ack=()=>{})=>{
    if(socket.data.room)return ack({error:'請先離開目前房間'});
    if(!sizes[type]?.includes(Number(size))||typeof name!=='string'||!name.trim())return ack({error:'副本或人數不正確'});
    let id;do{id=require('crypto').randomBytes(4).toString('hex').toUpperCase();}while(rooms.has(id));const player={id:socket.id,name:name.trim().slice(0,24),ready:false,alive:true};
    const r={id,type,size:Number(size),host:socket.id,players:[player],started:false,phase:'lobby',day:0,votes:{},logs:[]};rooms.set(id,r);socket.join(id);socket.data.room=id;ack({id});publish(r);io.emit('rooms',Array.from(rooms.values()).map(snapshot));
  });
  socket.on('join',({id,name}={},ack=()=>{})=>{
    const r=rooms.get(String(id).toUpperCase());if(!r||r.started||r.players.length>=r.size||!String(name||'').trim())return ack({error:'房間不存在、已開始或已滿'});
    if(socket.data.room)return ack({error:'請先離開目前房間'});
    r.players.push({id:socket.id,name:String(name).trim().slice(0,24),ready:false,alive:true});socket.join(r.id);socket.data.room=r.id;ack({id:r.id});publish(r);
  });
  socket.on('leave',()=>{leaveRoom(socket);});
  socket.on('ready',()=>{const r=rooms.get(socket.data.room);if(!r||r.started)return;const p=r.players.find(p=>p.id===socket.id);if(p)p.ready=!p.ready;publish(r);});
  socket.on('start',()=>{
    const r=rooms.get(socket.data.room);if(!r||r.host!==socket.id||r.started||r.players.length!==r.size||!r.players.every(p=>p.ready))return;
    r.started=true;
    if(r.type==='wolf'){
      const deck=shuffle([...roles[r.size]]);r.players.forEach((p,i)=>{p.role=deck[i];io.to(p.id).emit('role',p.role);});r.phase='night';log(r,'遊戲開始！黑夜降臨。狼人可選擇淘汰目標（簡化規則）。');
    }else{r.phase='playing';shuffle(r.players).forEach((p,i)=>{p.team=i%2?'藍隊':'紅隊';p.hp=100;p.x=p.team==='紅隊'?1:8;p.y=i%5+1;});r.mode=['拔旗戰','生存戰','據點戰'][Math.floor(Math.random()*3)];r.points={'紅隊':0,'藍隊':0};log(r,'團隊分配完成！模式：'+r.mode+'。地圖為回合制戰術原型。');}
    publish(r);
  });
  socket.on('move',({dx,dy}={})=>{const r=rooms.get(socket.data.room);const p=r?.players.find(p=>p.id===socket.id);if(r?.type!=='arena'||r.phase!=='playing'||!p||p.hp<=0)return;if(!Number.isInteger(dx)||!Number.isInteger(dy)||Math.abs(dx)+Math.abs(dy)!==1)return;p.x=Math.max(0,Math.min(9,p.x+dx));p.y=Math.max(0,Math.min(6,p.y+dy));if(p.x===4&&p.y===3){r.points[p.team]++;log(r,p.name+' 奪取中央據點！');if(r.points[p.team]>=5){r.phase='ended';log(r,p.team+'獲勝！');}}publish(r);});
  socket.on('attack',target=>{const r=rooms.get(socket.data.room);const p=r?.players.find(p=>p.id===socket.id);const v=r?.players.find(p=>p.id===target);if(r?.type!=='arena'||r.phase!=='playing'||!p||!v||p.hp<=0||v.hp<=0||p.team===v.team||Math.abs(p.x-v.x)+Math.abs(p.y-v.y)>1)return;v.hp=Math.max(0,v.hp-25);log(r,p.name+' 攻擊 '+v.name+'，剩餘 '+v.hp+' HP');if(!r.players.some(x=>x.team===v.team&&x.hp>0)){r.phase='ended';log(r,p.team+'獲勝！');}publish(r);});
  socket.on('chat',text=>{const r=rooms.get(socket.data.room);const p=r?.players.find(p=>p.id===socket.id);if(!p||typeof text!=='string')return;const message=text.trim().slice(0,300);if(!message)return;if(r.type==='arena'&&r.started){for(const teammate of r.players.filter(x=>x.team===p.team))io.to(teammate.id).emit('chat',{name:p.name,text:message,team:p.team});}else io.to(r.id).emit('chat',{name:p.name,text:message,team:p.team||null});});
  socket.on('vote',target=>{
    const r=rooms.get(socket.data.room);if(!r||r.type!=='wolf'||!r.started||r.phase==='ended')return;
    const actor=r.players.find(p=>p.id===socket.id);const victim=r.players.find(p=>p.id===target&&p.alive);if(!actor?.alive||!victim||actor.id===victim.id)return;
    if(r.phase==='night'&&!actor.role.includes('狼'))return;
    if(r.votes[actor.id])return;
    r.votes[actor.id]=target;
    const eligible=r.players.filter(p=>p.alive&&(r.phase==='day'||p.role.includes('狼')));
    if(eligible.every(p=>r.votes[p.id])){
      const tally={};Object.values(r.votes).forEach(id=>tally[id]=(tally[id]||0)+1);
      const ranked=Object.entries(tally).sort((a,b)=>b[1]-a[1]);
      if(ranked.length===1||ranked[0][1]>ranked[1][1]){const eliminated=r.players.find(p=>p.id===ranked[0][0]);eliminated.alive=false;log(r,`${eliminated.name} 被淘汰。`);}else log(r,'平票，本回合無人淘汰。');
      advance(r);
    }else publish(r);
  });
  socket.on('disconnect',()=>{leaveRoom(socket);});
});
if(require.main===module)server.listen(process.env.PORT||3000,()=>console.log('Game Hub: http://localhost:'+(process.env.PORT||3000)));
module.exports={app,server,roles,sizes};