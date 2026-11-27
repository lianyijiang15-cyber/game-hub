// Original puzzle set authored for Game Hub. Online collections were used for genre/category research, not copied verbatim.
const extraStories=[
  {
    "title": "倒著走的時鐘",
    "difficulty": "簡單",
    "category": "清湯",
    "intro": "阿澤發現牆上的時鐘倒著走，卻說它完全正常。為什麼？",
    "answer": "他是透過鏡子看時鐘。",
    "hints": [
      "他看到的不是鐘的正面。",
      "有一個反射表面。",
      "鏡子會左右顛倒。"
    ],
    "keys": [
      "鏡子",
      "反射",
      "倒影"
    ],
    "clues": [
      "他看到的不是鐘的正面。",
      "有一個反射表面。",
      "鏡子會左右顛倒。"
    ]
  },
  {
    "title": "雨天的乾鞋",
    "difficulty": "簡單",
    "category": "清湯",
    "intro": "小美在大雨中走了十分鐘，沒有帶傘，鞋子卻完全乾燥。為什麼？",
    "answer": "她走在有遮雨棚的室內連通走道。",
    "hints": [
      "她確實在走路。",
      "雨沒有落到她身上。",
      "她一路都在有屋頂的地方。"
    ],
    "keys": [
      "室內",
      "屋頂",
      "遮雨"
    ],
    "clues": [
      "她確實在走路。",
      "雨沒有落到她身上。",
      "她一路都在有屋頂的地方。"
    ]
  },
  {
    "title": "空白的合照",
    "difficulty": "中等",
    "category": "懸疑",
    "intro": "全班拍完畢業照，老師看到照片卻說少了一個人，但照片裡每個學生都在。為什麼？",
    "answer": "老師發現拍照的攝影師沒有出現在合照裡。",
    "hints": [
      "老師沒有說少了一位學生。",
      "想想拍攝者。",
      "攝影師沒有站進鏡頭。"
    ],
    "keys": [
      "攝影",
      "拍照",
      "老師"
    ],
    "clues": [
      "老師沒有說少了一位學生。",
      "想想拍攝者。",
      "攝影師沒有站進鏡頭。"
    ]
  },
  {
    "title": "無聲的警報",
    "difficulty": "中等",
    "category": "清湯",
    "intro": "一間商店警報器從未響起，店主卻靠它阻止了一次闖入。為什麼？",
    "answer": "警報器連動手機推播，店主收到通知並報警，沒有啟動現場聲響。",
    "hints": [
      "警報有不同通知方式。",
      "店主不在店裡。",
      "手機收到訊息。"
    ],
    "keys": [
      "手機",
      "通知",
      "推播"
    ],
    "clues": [
      "警報有不同通知方式。",
      "店主不在店裡。",
      "手機收到訊息。"
    ]
  },
  {
    "title": "最後一班車",
    "difficulty": "中等",
    "category": "清湯",
    "intro": "小杰錯過末班車，卻比搭上車的朋友更早到家。為什麼？",
    "answer": "他改騎共享單車走捷徑，公車必須繞行許多站。",
    "hints": [
      "兩人用不同交通工具。",
      "路線長短不同。",
      "他騎腳踏車。"
    ],
    "keys": [
      "單車",
      "腳踏車",
      "捷徑"
    ],
    "clues": [
      "兩人用不同交通工具。",
      "路線長短不同。",
      "他騎腳踏車。"
    ]
  },
  {
    "title": "從未寄出的信",
    "difficulty": "中等",
    "category": "懸疑",
    "intro": "阿倫每天寫一封信給遠方的朋友，信卻從來沒有寄出，朋友仍然知道信的內容。為什麼？",
    "answer": "兩人共用線上文件，阿倫稱每篇留言為一封信。",
    "hints": [
      "不是紙本信件。",
      "兩人能同時讀取。",
      "使用共享雲端文件。"
    ],
    "keys": [
      "網路",
      "雲端",
      "文件"
    ],
    "clues": [
      "不是紙本信件。",
      "兩人能同時讀取。",
      "使用共享雲端文件。"
    ]
  },
  {
    "title": "關閉的電梯",
    "difficulty": "簡單",
    "category": "清湯",
    "intro": "電梯停用了一整天，住在十二樓的阿姨卻沒有爬過任何樓梯。為什麼？",
    "answer": "阿姨當天一直待在家裡，沒有出門。",
    "hints": [
      "她沒有使用其他電梯。",
      "不一定要上下樓。",
      "她沒有離開家。"
    ],
    "keys": [
      "家",
      "出門",
      "沒有"
    ],
    "clues": [
      "她沒有使用其他電梯。",
      "不一定要上下樓。",
      "她沒有離開家。"
    ]
  },
  {
    "title": "逆向的腳印",
    "difficulty": "困難",
    "category": "懸疑",
    "intro": "雪地裡只有一排通往小屋的腳印，屋主卻確信訪客已經離開。為什麼？",
    "answer": "訪客離開時沿著自己來時的腳印倒退走，沒有留下第二排腳印。",
    "hints": [
      "離開未必留下新腳印。",
      "他刻意踩在原有印子上。",
      "沿原路倒退。"
    ],
    "keys": [
      "倒退",
      "原路",
      "腳印"
    ],
    "clues": [
      "離開未必留下新腳印。",
      "他刻意踩在原有印子上。",
      "沿原路倒退。"
    ]
  },
  {
    "title": "消失的鑰匙",
    "difficulty": "中等",
    "category": "清湯",
    "intro": "小華把鑰匙放進上鎖的抽屜，隔天沒開抽屜卻拿到了鑰匙。為什麼？",
    "answer": "抽屜是透明展示櫃的一部分，鑰匙從背面開放的夾層取出。",
    "hints": [
      "抽屜不一定六面封閉。",
      "有另一個開口。",
      "從背面取出。"
    ],
    "keys": [
      "背面",
      "開口",
      "夾層"
    ],
    "clues": [
      "抽屜不一定六面封閉。",
      "有另一個開口。",
      "從背面取出。"
    ]
  },
  {
    "title": "安靜的演唱會",
    "difficulty": "簡單",
    "category": "清湯",
    "intro": "小琳看完演唱會後說歌手唱得很好，但她從頭到尾沒聽見任何聲音。為什麼？",
    "answer": "她觀看的是有字幕的靜音演唱會影片。",
    "hints": [
      "她不是在現場。",
      "有畫面沒有聲音。",
      "她把影片靜音。"
    ],
    "keys": [
      "影片",
      "靜音",
      "字幕"
    ],
    "clues": [
      "她不是在現場。",
      "有畫面沒有聲音。",
      "她把影片靜音。"
    ]
  },
  {
    "title": "提前的生日",
    "difficulty": "困難",
    "category": "清湯",
    "intro": "兩個雙胞胎同一天出生，哥哥每年卻比弟弟早一天過生日。為什麼？",
    "answer": "兄弟住在不同時區，家人按照各自所在地日期慶祝，跨越國際換日線。",
    "hints": [
      "出生日期一樣。",
      "慶祝地點不同。",
      "國際換日線造成日期不同。"
    ],
    "keys": [
      "時區",
      "換日線",
      "國家"
    ],
    "clues": [
      "出生日期一樣。",
      "慶祝地點不同。",
      "國際換日線造成日期不同。"
    ]
  },
  {
    "title": "沒有觀眾的掌聲",
    "difficulty": "中等",
    "category": "清湯",
    "intro": "舞台上只有一名演員，台下空無一人，演出結束卻傳來熱烈掌聲。為什麼？",
    "answer": "演員參加線上直播，掌聲是遠端觀眾透過音效系統傳來。",
    "hints": [
      "觀眾不在現場。",
      "表演透過網路播出。",
      "線上觀眾送出掌聲音效。"
    ],
    "keys": [
      "直播",
      "網路",
      "線上"
    ],
    "clues": [
      "觀眾不在現場。",
      "表演透過網路播出。",
      "線上觀眾送出掌聲音效。"
    ]
  }
];

const stories=[
 {title:'餐廳裡的海龜湯',difficulty:'困難',intro:'一名男子在餐廳喝了一口海龜湯，回家後卻做出了令人震驚的決定。為什麼？',clues:['他以前曾遭遇船難。','他當年吃過一碗被稱作海龜湯的湯。','餐廳的味道與記憶不同，讓他發現當年吃的不是海龜。'],hints:['想想男子過去的經歷。','關鍵在於兩次湯的味道。','當年的湯其實不是海龜肉。'],keys:['船','海龜','味道'],answer:'經典版本中，男子曾在船難後喝下被謊稱為海龜湯的湯。多年後嚐到真正的海龜湯，才察覺當年的真相。'},
 {title:'關燈的人',difficulty:'中等',intro:'一個人晚上關燈睡覺，隔天得知許多人因此喪命。為什麼？',clues:['他住在靠海的地方。','這盞燈不是普通房間的照明。','他是燈塔管理員，關燈導致船隻迷航。'],hints:['注意這盞燈的位置。','燈光可能是給別人看的。','想想燈塔。'],keys:['海','燈','船'],answer:'他是燈塔管理員，誤關了指引船隻的燈，造成船難。'}
];
stories.push(...extraStories);

const soupDifficulties = ['簡單', '中等', '困難'];
// Captions describe only the opening scene, never its answer or hints.
const soupComics = [
  ['diner', '一名男子走進餐廳，點了一碗海龜湯。', '喝了一口後，他回家做了一個讓人震驚的決定。'],
  ['light', '夜深了，一個人關掉燈，上床睡覺。', '隔天，他得知有許多人因此喪命。'],
  ['clock', '阿澤走進房間，抬頭看牆上的時鐘。', '指針竟然倒著走，他卻說時鐘完全正常。'],
  ['rain', '大雨下個不停。小美沒帶傘，在雨天走了十分鐘。', '到達目的地時，她的鞋子竟然沒有濕。'],
  ['class', '畢業那天，全班一起拍了合照。', '老師說照片少了一個人，但每位學生都入鏡了。'],
  ['alarm', '打烊後，商店外出現了不速之客。', '警報器一次也沒響，店主卻說自己靠它阻止了闖入。'],
  ['bus', '小杰趕到站牌時，朋友已經搭上末班車。', '小杰錯過了車，卻比朋友還要早到家。'],
  ['letter', '阿倫每天寫一封信給遠方的朋友。', '信一封也沒寄出去，朋友卻知道裡面寫了什麼。'],
  ['elevator', '公寓電梯停用了一整天。', '住在十二樓的阿姨，這天沒有爬過任何一階樓梯。'],
  ['snow', '雪地裡，一排腳印一路通往小屋。', '找不到離開的腳印，屋主卻確信訪客已經走了。'],
  ['key', '小華把鑰匙放進抽屜，然後上了鎖。', '隔天，他沒打開抽屜，手上卻已經拿著那把鑰匙。'],
  ['concert', '小琳去看了一場演唱會。', '她說歌手唱得很好，卻從頭到尾沒聽見任何聲音。'],
  ['birthday', '一對雙胞胎在同一天出生。', '但每一年，哥哥都會比弟弟早一天過生日。'],
  ['stage', '一名演員獨自走上舞台，觀眾席空無一人。', '演出結束後，劇場裡卻傳來熱烈的掌聲。']
];

function startSoupGame(random = Math.random, difficulty, previousId) {
  const indexed = stories.map((story, index) => ({ story, comic: soupComics[index] }));
  const matches = difficulty ? indexed.filter(({ story }) => story.difficulty === difficulty) : indexed;
  const fresh = matches.filter(({ comic }) => comic[0] !== previousId);
  const pool = fresh.length ? fresh : matches;
  const { story, comic } = pool[Math.floor(random() * pool.length)];
  return { story, comic, hints: 0, progress: 0, reply: '', result: null, revealed: false };
}

function playSoup(game, action, question) {
  const { story } = game;
  if (action === 'ask') {
    if (story.keys.some(key => question.includes(key))) {
      game.reply = '是。 ' + (story.clues[game.progress] || '線索已全部揭曉。');
      game.progress = Math.min(game.progress + 1, story.clues.length);
      if (game.progress === story.clues.length) game.result ??= 'solved';
    } else {
      game.reply = /沒有|不是|不會|無法/.test(question) ? '不是。' : '無關（原型判斷；請嘗試詢問故事關鍵字）。';
    }
  }
  if (action === 'hint' && game.hints < 3) game.reply = '提示：' + story.hints[game.hints++];
  if (action === 'reveal') {
    game.result ??= 'revealed';
    game.revealed = true;
  }
}

function soupView(game) {
  return {
    title: game.story.title, difficulty: game.story.difficulty, storyId: game.comic[0], panels: game.comic.slice(1), intro: game.story.intro, hints: game.hints,
    progress: game.progress, clues: game.story.clues.length, reply: game.reply,
    end: game.revealed ? game.story.answer : game.result === 'solved' ? '你已解鎖所有線索！可按「揭曉答案」。' : ''
  };
}

if (typeof module !== 'undefined') module.exports = { startSoupGame, playSoup, soupView, soupDifficulties };
