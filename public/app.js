const socket=io();let mode='wolf',room=null,role='',soup=null,hintCount=0,progress=0;
const $=id=>document.getElementById(id);
const stories=[
 {title:'餐廳裡的海龜湯',intro:'一名男子在餐廳喝了一口海龜湯，回家後卻做出了令人震驚的決定。為什麼？',clues:['他以前曾遭遇船難。','他當年吃過一碗被稱作海龜湯的湯。','餐廳的味道與記憶不同，讓他發現當年吃的不是海龜。'],hints:['想想男子過去的經歷。','關鍵在於兩次湯的味道。','當年的湯其實不是海龜肉。'],keys:['船','海龜','味道'],answer:'經典版本中，男子曾在船難後喝下被謊稱為海龜湯的湯。多年後嚐到真正的海龜湯，才察覺當年的真相。'},
 {title:'關燈的人',intro:'一個人晚上關燈睡覺，隔天得知許多人因此喪命。為什麼？',clues:['他住在靠海的地方。','這盞燈不是普通房間的照明。','他是燈塔管理員，關燈導致船隻迷航。'],hints:['注意這盞燈的位置。','燈光可能是給別人看的。','想想燈塔。'],keys:['海','燈','船'],answer:'他是燈塔管理員，誤關了指引船隻的燈，造成船難。'}
];
if(typeof extraStories!=='undefined')stories.push(...extraStories);
function show(id){['home','soup','lobby','game'].forEach(x=>$(x).hidden=x!==id);}function home(){if(room){socket.emit('leave');room=null;}show('home');socket.emit('list');}
function openSoup(){show('soup');newSoup();}function newSoup(){soup=stories[Math.floor(Math.random()*stories.length)];hintCount=0;progress=0;$('soup-title').textContent=soup.title;$('soup-story').textContent=soup.intro;$('soup-end').textContent='';$('answer').textContent='';updateSoup();}
function updateSoup(){$('hints').textContent=3-hintCount;$('soup-progress').textContent=`已解鎖線索：${progress}/${soup.clues.length}`;}
function askSoup(){const q=$('question').value.trim();if(!q)return;$('question').value='';if(soup.keys.some(k=>q.includes(k))){$('answer').textContent='是。 '+(soup.clues[progress]||'線索已全部揭曉。');progress=Math.min(progress+1,soup.clues.length);}else if(/沒有|不是|不會|無法/.test(q))$('answer').textContent='不是。';else $('answer').textContent='無關（原型判斷；請嘗試詢問故事關鍵字）。';updateSoup();if(progress===soup.clues.length)$('soup-end').textContent='你已解鎖所有線索！可按「揭曉答案」。';}
function hint(){if(hintCount>=3)return;$('answer').textContent='提示：'+soup.hints[hintCount++];updateSoup();}function reveal(){$('soup-end').textContent=soup.answer;}
function openLobby(type){mode=type;show('lobby');$('mode-title').textContent=type==='wolf'?'🌙 狼人殺':'⚔️ 團隊對抗';$('size').replaceChildren(...(type==='wolf'?[8,9,10,12]:[10,12,14]).map(n=>new Option(n+' 人',n)));socket.emit('list');}
function createRoom(){socket.emit('create',{type:mode,size:Number($('size').value),name:$('nickname').value},result=>{if(result.error)$('error').textContent=result.error;else enter(result.id);});}
function joinRoom(id){socket.emit('join',{id:id||$('room-code').value,name:$('nickname').value},result=>{if(result.error)$('error').textContent=result.error;else enter(result.id);});}
function enter(id){room=id;role='';$('role').textContent='';$('messages').replaceChildren();$('room-id').textContent=id;show('game');}
function sendChat(){const v=$('chat-input').value;socket.emit('chat',v);$('chat-input').value='';}
socket.on('rooms',rooms=>{$('room-list').replaceChildren();rooms.filter(r=>r.type===mode).forEach(r=>{const p=document.createElement('p');p.textContent=`${r.id} · ${r.players.length}/${r.size} 人 · ${r.started?'遊戲中':'招募中'} `;if(!r.started&&r.players.length<r.size){const b=document.createElement('button');b.textContent='加入';b.onclick=()=>joinRoom(r.id);p.append(b);}$('room-list').append(p);});});
socket.on('room',r=>{if(r.id!==room)return;$('game-status').textContent=`${r.type==='wolf'?'狼人殺':'團隊對抗'} · ${r.players.length}/${r.size} · ${r.phase} · 第 ${r.day} 天`;$('players').replaceChildren();r.players.forEach(p=>{const d=document.createElement('div');d.textContent=`${p.name} ${p.ready?'✓ 已準備':'○ 未準備'} ${p.alive?'':'（已淘汰）'} ${(p.team||'')+(p.hp!==undefined?' · HP '+p.hp+' · ('+p.x+','+p.y+')':'')}`;$('players').append(d);});$('ready').hidden=r.started;$('start').hidden=r.started||r.host!==socket.id;$('start').disabled=r.players.length!==r.size||!r.players.every(p=>p.ready);$('votes').replaceChildren();if(r.type==='arena'&&r.started){const h=document.createElement('h3');h.textContent='⚔️ '+r.mode+' · 中央據點 (4,3) · '+JSON.stringify(r.points);$('votes').append(h);const me=r.players.find(p=>p.id===socket.id);if(me&&me.hp>0&&r.phase==='playing'){for(const [label,dx,dy] of [['↑',0,-1],['←',-1,0],['↓',0,1],['→',1,0]]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>socket.emit('move',{dx,dy});$('votes').append(b);}const list=document.createElement('div');for(const p of r.players.filter(p=>p.team!==me.team&&p.hp>0&&Math.abs(p.x-me.x)+Math.abs(p.y-me.y)<=1)){const b=document.createElement('button');b.textContent='攻擊 '+p.name;b.onclick=()=>socket.emit('attack',p.id);list.append(b);}$('votes').append(list);}}if(r.type==='wolf'&&r.started&&r.phase!=='ended'&&r.players.find(p=>p.id===socket.id)?.alive){const h=document.createElement('h3');h.textContent=r.phase==='night'?'黑夜行動（僅狼人可投票）':'白天放逐投票';$('votes').append(h);if(r.phase==='day'||role.includes('狼'))r.players.filter(p=>p.alive&&p.id!==socket.id).forEach(p=>{const b=document.createElement('button');b.className='secondary';b.textContent='選擇 '+p.name;b.onclick=()=>socket.emit('vote',p.id);$('votes').append(b);});}});
socket.on('role',value=>{role=value;$('role').textContent='你的秘密身分：'+role;});socket.on('notice',v=>appendMessage('📢 '+v));socket.on('chat',v=>appendMessage(`${v.name}：${v.text}`));function appendMessage(v){const p=document.createElement('p');p.textContent=v;$('messages').append(p);$('messages').scrollTop=$('messages').scrollHeight;}
socket.emit('list');
socket.on('connect',()=>{socket.emit('list');if(room)appendMessage('連線恢復，正在同步房間狀態。');});socket.on('disconnect',()=>{if(room)appendMessage('連線中斷，請等待重新連線。');});


// v0.2: AI seats, arena controls and explicit room lifecycle.
const originalHome=home;
home=function(){if(room){socket.emit('leave');room=null;role='';}originalHome();};
function gameButton(label,fn){const b=document.createElement('button');b.className='secondary';b.textContent=label;b.onclick=fn;return b;}
function extraControls(r){
 if(r.id!==room)return;
 let hostPanel=document.getElementById('bot-panel');
 if(!hostPanel){hostPanel=document.createElement('div');hostPanel.id='bot-panel';$('players').after(hostPanel);}
 hostPanel.replaceChildren();
 const me=r.players.find(p=>p.id===socket.id);
 if(!r.started&&r.host===socket.id){
  const count=r.players.filter(p=>p.bot).length;
  const p=document.createElement('p');p.textContent='🤖 AI 機器人：'+count+' 人（房主可補滿空位）';hostPanel.append(p);
  if(r.players.length<r.size)hostPanel.append(gameButton('＋ 加入一名 AI',()=>socket.emit('addBot',result=>{if(result?.error)alert(result.error);})));
  for(const bot of r.players.filter(p=>p.bot))hostPanel.append(gameButton('移除 '+bot.name,()=>socket.emit('removeBot',bot.id,result=>{if(result?.error)alert(result.error);})));
 }
 if(r.type==='arena'&&r.started){
  $('role').textContent=me?'所屬隊伍：'+me.team+'｜職業：'+me.job+'｜HP：'+me.hp:'';
  if(r.phase==='playing'&&me?.alive){
   const h=document.createElement('h3');h.textContent='⚔️ 回合戰鬥原型（每 1.8 秒可行動一次）';hostPanel.append(h);
   for(const target of r.players.filter(p=>p.alive&&p.team!==me.team))hostPanel.append(gameButton('攻擊 '+target.name+' ('+target.hp+' HP)',()=>socket.emit('arenaAction',{action:'attack',target:target.id})));
   if(me.job==='輔助')for(const target of r.players.filter(p=>p.alive&&p.team===me.team))hostPanel.append(gameButton('治療 '+target.name,()=>socket.emit('arenaAction',{action:'heal',target:target.id})));
  }
 }
 if(r.type==='wolf'&&r.started&&r.phase==='night'&&!role.includes('狼')){
  const p=document.createElement('p');p.textContent='🌙 夜晚請等待狼人行動。';hostPanel.append(p);
 }
}
socket.on('room',extraControls);
socket.on('connect',()=>{socket.emit('list');if(room){$('game-status').textContent='連線已恢復，但先前房間可能已離開；請返回首頁重新加入。';}});
socket.on('disconnect',()=>{if(room)$('game-status').textContent='網路中斷，正在嘗試重新連線…';});

socket.on('deadChat',v=>appendMessage('👻 淘汰者頻道｜'+v.name+'：'+v.text));
socket.on('rolesRevealed',list=>{
 appendMessage('🏁 本局身分揭曉：');
 for(const p of list)appendMessage((p.alive?'🟢 ':'💀 ')+p.name+' — '+p.role);
});

let revealedNames=new Set();
socket.on('room',r=>{
 if(r.id!==room||r.type!=='wolf')return;
 const me=r.players.find(p=>p.id===socket.id);
 const ghost=!!(r.started&&!me?.alive&&r.phase!=='ended');
 $('votes').hidden=ghost;
 $('role').textContent=ghost?'👻 旁觀模式｜你已淘汰，無法投票或操作；可與其他淘汰玩家討論。':r.phase==='ended'?'🏁 本局已結束，所有角色已公開。':'你的秘密身分：'+(role||'等待分配');
 $('chat-input').placeholder=ghost?'👻 傳送至淘汰者專屬聊天':'輸入訊息';
 if(r.phase==='ended'&&Array.isArray(r.revealedRoles)){
  const signature=r.id+':'+r.day+':'+r.revealedRoles.map(p=>p.id+':'+p.role).join('|');
  if(!revealedNames.has(signature)){
   revealedNames.add(signature);
   appendMessage('🏁 本局完整身分表');
   for(const p of r.revealedRoles)appendMessage(p.name+'：'+p.role);
  }
 }
});

let wolfIntel={teammates:[],votes:[]};
socket.on('wolfIntel',data=>{wolfIntel=data;if(window.lastWolfRoom)renderWolfBoard(window.lastWolfRoom);});
function renderWolfBoard(r){
 if(r.id!==room||r.type!=='wolf')return;
 const me=r.players.find(p=>p.id===socket.id);
 const active=r.started&&r.phase!=='ended'&&me?.alive;
 const canVote=active&&(r.phase==='day'||(r.phase==='night'&&role.includes('狼')));
 $('votes').replaceChildren();
 const status=document.createElement('p');
 status.className='vote-help';
 status.textContent=r.phase==='discussion'?'🗣️ 討論進行中：發言會影響 AI 的判斷，房主結束討論後才開始投票。':r.phase==='night'?(role.includes('狼')?'🐺 點選非狼人玩家頭像，與隊友協調夜間目標。':'🌙 黑夜中，等待狼人行動。'):r.phase==='day'?'☀️ 點選頭像進行放逐投票。':'🏁 身分已公開';
 $('votes').append(status);
 $('end-discussion').hidden=!(r.phase==='discussion'&&r.host===socket.id);
 $('debate-hint').textContent=r.phase==='discussion'?'真人與 AI 自由辯論；AI 會閱讀公開發言並回應。':r.phase==='night'?'狼人使用秘密頻道；其他玩家不會看見。':'所有玩家可查看公開討論紀錄。';
 $('players').replaceChildren();
 r.players.forEach((p,i)=>{
  const seat=document.createElement('button');
  seat.type='button';seat.className='player-seat'+(!p.alive?' eliminated':'')+(p.id===socket.id?' self-seat':'');
  const ally=role.includes('狼')&&wolfIntel.teammates.some(t=>t.id===p.id);
  const eligible=canVote&&p.alive&&p.id!==socket.id&&!(r.phase==='night'&&ally);
  seat.disabled=!eligible;
  const avatar=document.createElement('span');avatar.className='player-avatar';avatar.textContent=p.bot?'🤖':(p.alive?'👤':'👻');
  const label=document.createElement('strong');label.textContent=p.name;
  const tag=document.createElement('small');tag.textContent=!p.alive?'已淘汰':ally?'🐺 狼人隊友':p.id===socket.id?'你自己':p.bot?'AI 玩家':'真人玩家';
  seat.append(avatar,label,tag);
  if(r.phase==='ended'&&r.revealedRoles){const info=r.revealedRoles.find(q=>q.id===p.id);if(info){const roleTag=document.createElement('small');roleTag.textContent='🎭 '+info.role;seat.append(roleTag);}}
  if(eligible)seat.onclick=()=>{socket.emit('vote',p.id);seat.classList.add('voted-seat');};
  $('players').append(seat);
 });
 const intel=$('wolf-intel');intel.replaceChildren();
 intel.hidden=!(r.started&&r.phase==='night'&&role.includes('狼'));
 if(!intel.hidden){
  const title=document.createElement('h4');title.textContent='🐺 狼人秘密作戰室';intel.append(title);
  const team=document.createElement('p');team.textContent='隊友：'+wolfIntel.teammates.map(p=>p.name+(p.alive?'':'（淘汰）')).join('、');intel.append(team);
  const votes=document.createElement('p');votes.textContent='夜間投票：'+(wolfIntel.votes.length?wolfIntel.votes.map(v=>v.voter+' → '+v.target).join('；'):'尚無隊友投票');intel.append(votes);
 }
}
socket.on('room',r=>{if(r.id!==room)return;window.lastWolfRoom=r;if(r.type==='wolf')renderWolfBoard(r);else{$('end-discussion').hidden=true;$('wolf-intel').hidden=true;}});
