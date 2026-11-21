'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
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
function snapshot(r){return {id:r.id,type:r.type,size:r.size,host:r.host,started:r.started,players:r.players.map(p=>({id:p.id,name:p.name,ready:p.ready,alive:p.alive,team:p.team})),phase:r.phase,day:r.day,logs:r.logs.slice(-20)};}
function publish(r){io.to(r.id).emit('room',snapshot(r));}
function log(r,message){r.logs.push(message);io.to(r.id).emit('notice',message);}
function finishWolf(r){const living=r.players.filter(p=>p.alive);const wolves=living.filter(p=>p.role.includes('狼'));const good=living.length-wolves.length;if(!wolves.length||wolves.length>=good){r.phase='ended';log(r,!wolves.length?'好人陣營勝利！':'狼人陣營勝利！');return true;}return false;}
function advance(r){if(finishWolf(r))return; if(r.phase==='night'){r.phase='day';r.day++;r.votes={};log(r,`第 ${r.day} 天白天：請討論並投票。`);}else{r.phase='night';r.votes={};log(r,'黑夜降臨：狼人請選擇目標。');}publish(r);}
io.on('connection',socket=>{
  socket.on('list',()=>socket.emit('rooms',Array.from(rooms.values()).map(snapshot)));
  socket.on('create',({type,size,name}={},ack=()=>{})=>{
    if(!sizes[type]?.includes(Number(size))||typeof name!=='string'||!name.trim())return ack({error:'副本或人數不正確'});
    const id=Math.random().toString(36).slice(2,8).toUpperCase();const player={id:socket.id,name:name.trim().slice(0,24),ready:false,alive:true};
    const r={id,type,size:Number(size),host:socket.id,players:[player],started:false,phase:'lobby',day:0,votes:{},logs:[]};rooms.set(id,r);socket.join(id);socket.data.room=id;ack({id});publish(r);io.emit('rooms',Array.from(rooms.values()).map(snapshot));
  });
  socket.on('join',({id,name}={},ack=()=>{})=>{
    const r=rooms.get(String(id).toUpperCase());if(!r||r.started||r.players.length>=r.size||!String(name||'').trim())return ack({error:'房間不存在、已開始或已滿'});
    if(socket.data.room)return ack({error:'請先離開目前房間'});
    r.players.push({id:socket.id,name:String(name).trim().slice(0,24),ready:false,alive:true});socket.join(r.id);socket.data.room=r.id;ack({id:r.id});publish(r);
  });
  socket.on('ready',()=>{const r=rooms.get(socket.data.room);if(!r||r.started)return;const p=r.players.find(p=>p.id===socket.id);if(p)p.ready=!p.ready;publish(r);});
  socket.on('start',()=>{
    const r=rooms.get(socket.data.room);if(!r||r.host!==socket.id||r.started||r.players.length!==r.size||!r.players.every(p=>p.ready))return;
    r.started=true;
    if(r.type==='wolf'){
      const deck=shuffle([...roles[r.size]]);r.players.forEach((p,i)=>{p.role=deck[i];io.to(p.id).emit('role',p.role);});r.phase='night';log(r,'遊戲開始！黑夜降臨。狼人可選擇淘汰目標（簡化規則）。');
    }else{r.phase='playing';r.players.forEach((p,i)=>p.team=i%2?'藍隊':'紅隊');log(r,'團隊分配完成！目前為戰鬥模式原型，詳細技能與地圖尚未實作。');}
    publish(r);
  });
  socket.on('chat',text=>{const r=rooms.get(socket.data.room);const p=r?.players.find(p=>p.id===socket.id);if(!p||typeof text!=='string')return;const message=text.trim().slice(0,300);if(!message)return;io.to(r.id).emit('chat',{name:p.name,text:message,team:p.team||null});});
  socket.on('vote',target=>{
    const r=rooms.get(socket.data.room);if(!r||r.type!=='wolf'||!r.started||r.phase==='ended')return;
    const actor=r.players.find(p=>p.id===socket.id);const victim=r.players.find(p=>p.id===target&&p.alive);if(!actor?.alive||!victim||actor.id===victim.id)return;
    if(r.phase==='night'&&!actor.role.includes('狼'))return;
    r.votes[actor.id]=target;
    const eligible=r.players.filter(p=>p.alive&&(r.phase==='day'||p.role.includes('狼')));
    if(eligible.every(p=>r.votes[p.id])){
      const tally={};Object.values(r.votes).forEach(id=>tally[id]=(tally[id]||0)+1);
      const ranked=Object.entries(tally).sort((a,b)=>b[1]-a[1]);
      if(ranked.length===1||ranked[0][1]>ranked[1][1]){const eliminated=r.players.find(p=>p.id===ranked[0][0]);eliminated.alive=false;log(r,`${eliminated.name} 被淘汰。`);}else log(r,'平票，本回合無人淘汰。');
      advance(r);
    }else publish(r);
  });
  socket.on('disconnect',()=>{const r=rooms.get(socket.data.room);if(!r)return;r.players=r.players.filter(p=>p.id!==socket.id);if(!r.players.length)rooms.delete(r.id);else{if(r.host===socket.id)r.host=r.players[0].id;log(r,'一名玩家離線。');publish(r);}io.emit('rooms',Array.from(rooms.values()).map(snapshot));});
});
if(require.main===module)server.listen(process.env.PORT||3000,()=>console.log('Game Hub: http://localhost:'+(process.env.PORT||3000)));
module.exports={app,server,roles,sizes};