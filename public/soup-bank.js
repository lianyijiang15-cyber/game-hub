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
  },
  {
    "title": "旅館的空房來電",
    "difficulty": "中等",
    "category": "懸疑",
    "intro": "空房上鎖又沒住客，午夜卻用房內分機打到櫃檯。值班員接到後只聽見三下敲擊，立刻派人到房外的走廊。為什麼？",
    "answer": "來電其實來自走廊的緊急對講機。總機改裝時讓它共用空房的分機號碼，所以螢幕顯示的是房號。有人不能說話，只能敲對講機求助。",
    "hints": [
      "來電螢幕只顯示號碼，沒有顯示電話真正的位置。",
      "走廊有一台能呼叫櫃檯的裝置。",
      "對講機和空房共用分機。"
    ],
    "keys": [
      "分機",
      "對講機",
      "共用"
    ],
    "clues": [
      "來電螢幕只顯示號碼，沒有顯示電話真正的位置。",
      "走廊有一台能呼叫櫃檯的裝置。",
      "對講機和空房共用分機。"
    ]
  },
  {
    "title": "戲院門後的影子",
    "difficulty": "中等",
    "category": "懸疑",
    "intro": "停業的戲院沒有開燈，霧玻璃後卻站著一道人影。每有車經過，影子就朝門口跨一步。她站了一會兒，確定裡面沒有人。為什麼？",
    "answer": "戲院大廳留下了一個紙板人像。車頭燈透過側窗從不同角度掃過，人像投在霧玻璃上的影子就滑動，看著像朝門口跨了一步。",
    "hints": [
      "影子出現時，外面有光源。",
      "影子移動時，形成影子的東西沒有移動。",
      "車頭燈照到一個紙板人像。"
    ],
    "keys": [
      "車頭燈",
      "紙板",
      "投影"
    ],
    "clues": [
      "影子出現時，外面有光源。",
      "影子移動時，形成影子的東西沒有移動。",
      "車頭燈照到一個紙板人像。"
    ]
  },
  {
    "title": "停電後亮起的窗",
    "difficulty": "困難",
    "category": "懸疑",
    "intro": "整棟樓停電了，沿街只有一扇窗每隔一段時間亮起。保全確定樓上沒人，卻走到騎樓等下一班公車。為什麼？",
    "answer": "窗面正好會反射停靠公車的發光路線牌。每當公車停在窗外對街，反光便讓窗子看起來像從室內亮起。保全去等車，是為了比對發車間隔和亮起時間。",
    "hints": [
      "光不一定從窗內照出來。",
      "窗亮的時間與路上某個東西停靠的時間吻合。",
      "窗戶映出公車的發光路線牌。"
    ],
    "keys": [
      "反射",
      "路線牌",
      "反光"
    ],
    "clues": [
      "光不一定從窗內照出來。",
      "窗亮的時間與路上某個東西停靠的時間吻合。",
      "窗戶映出公車的發光路線牌。"
    ]
  },
  {
    "title": "洗衣機裡的敲門聲",
    "difficulty": "簡單",
    "category": "懸疑",
    "intro": "深夜，男人聽見一台沒插電的洗衣機傳出三下敲門聲。他沒有打開它，而是停掉旁邊的烘衣機。敲聲立刻停止。為什麼？",
    "answer": "旁邊的烘衣機裡有衣服的金屬拉鍊，翻滾時反覆撞到門。兩台機器靠在一起，震動透過外殼傳過去，聽起來像是從沒有插電的洗衣機裡發出的。",
    "hints": [
      "敲聲不一定起於聽起來最像的地方。",
      "兩台機器的外殼互相碰著。",
      "衣服的金屬拉鍊敲到烘衣機門。"
    ],
    "keys": [
      "震動",
      "拉鍊",
      "外殼"
    ],
    "clues": [
      "敲聲不一定起於聽起來最像的地方。",
      "兩台機器的外殼互相碰著。",
      "衣服的金屬拉鍊敲到烘衣機門。"
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
  ['concert', '小琳去看了一場演唱會。', '她說歌手唱得很好，卻從頭到尾沒聽見任何聲音。'],
  ['birthday', '一對雙胞胎在同一天出生。', '但每一年，哥哥都會比弟弟早一天過生日。'],
  ['stage', '一名演員獨自走上舞台，觀眾席空無一人。', '演出結束後，劇場裡卻傳來熱烈的掌聲。'],
  ['hotel-call', '午夜，旅館櫃檯接到一通來自上鎖空房的電話。', '電話裡只傳來三下敲擊。值班員立即派人到房外的走廊。'],
  ['theater-shadow', '深夜，停業戲院的霧玻璃後站著一道人影。', '每有車經過，影子就往門口跨一步。她為什麼確定裡頭沒有人？'],
  ['blackout-window', '整棟樓都停電了，只有一扇窗每隔一段時間就亮起來。', '保全知道樓上沒人，卻走去騎樓等下一班公車。'],
  ['laundry-knock', '深夜，一台沒插電的洗衣機傳出三下敲門聲。', '男人停掉旁邊的烘衣機，敲聲立刻停止。']
];

// Each inner group covers alternate wording for one deduction. Intro-only topics
// never count towards solving the case.
const soupConcepts = {
  diner: [['船難', '海難', '沉船', '海上遇難', '漂流'], ['以前喝過', '曾經喝過', '冒充', '假海龜', '以前的湯'], ['味道', '滋味', '口味', '味覺', '不是海龜肉']],
  light: [['海邊', '靠海', '沿海', '港口'], ['燈塔', '導航燈', '指引船隻'], ['迷航', '船難', '觸礁', '擱淺', '航行']],
  clock: [['鏡子', '鏡面', '玻璃反光', '反光處'], ['反射', '倒影', '映照', '映出'], ['左右顛倒', '鏡像', '左右相反']],
  rain: [['室內', '通道', '走廊', '騎樓'], ['屋頂', '天花板', '雨棚', '有頂'], ['遮雨', '擋雨', '沒淋', '沒有淋', '雨沒打到']],
  class: [['不是學生', '非學生', '學生都', '同學都'], ['攝影', '拍照的人', '拍攝者', '掌鏡'], ['鏡頭外', '照片外', '沒入鏡', '沒有入鏡']],
  alarm: [['手機', '電話', '行動裝置'], ['通知', '訊息', '推播'], ['不在店', '在店外', '報警', '遠端']],
  bus: [['單車', '腳踏車', '自行車', '共享單車', '騎車'], ['捷徑', '近路', '抄小路'], ['繞路', '繞行', '站牌', '停靠']],
  letter: [['紙本', '不是紙', '電子'], ['網路', '線上', '雲端', '同時讀'], ['文件', '文檔', '留言', '共用']],
  elevator: [['在家', '待在家', '待在公寓', '沒出門', '沒有出門'], ['沒離開', '沒有離開', '沒外出'], ['沒上下樓', '沒有上下樓', '不用下樓']],
  snow: [['同一排', '同一條', '同一路', '沿原路'], ['腳印重疊', '踩回', '踩原', '蓋住原'], ['倒著走', '倒退', '往後走', '往後退']],
  concert: [['靜音', '沒有聲音', '沒開聲音'], ['影片', '錄影', '錄播', '不是現場'], ['字幕', '螢幕', '視覺', '用眼睛']],
  birthday: [['時區', '時差', '國際換日線', '換日線'], ['不同國家', '不同地方', '不同地區', '跨國'], ['日期不同', '不同日期', '當地日期', '當地時間']],
  stage: [['直播', '實況', '網路轉播'], ['音效', '喇叭', '音響', '擴音器'], ['遠端觀眾', '線上觀眾', '在家看']],
  'hotel-call': [['分機', '總機', '房號'], ['對講機', '緊急電話', '求助按鈕'], ['共用', '共線', '同一號碼', '同個號碼', '同一個號碼']],
  'theater-shadow': [['車頭燈', '車燈', '大燈', '燈光'], ['紙板', '立牌', '人形看板'], ['投影', '光源移動', '角度', '影子滑動']],
  'blackout-window': [['反射', '倒映', '反光', '映過去'], ['路線牌', '公車看板', '電子看板', '公車的燈'], ['公車靠站', '班次', '停靠', '發車間隔']],
  'laundry-knock': [['震動', '振動', '共振', '傳過去'], ['金屬拉鍊', '拉鏈', '拉鍊'], ['外殼', '機身', '兩台碰', '靠在一起']]
};

const soupTopics = {
  diner: ['餐廳', '湯', '喝'], light: ['晚上', '關燈', '死', '意外'], clock: ['時鐘', '鐘', '指針', '時間'],
  rain: ['雨', '鞋', '走路'], class: ['老師', '學生', '合照', '畢業'], alarm: ['商店', '警報', '店主', '闖入', '響'],
  bus: ['公車', '巴士', '乘車', '車站', '時間'], letter: ['信', '朋友', '寄', '內容'],
  elevator: ['樓梯', '電梯', '樓層', '阿姨'], snow: ['雪', '腳印', '訪客', '屋主'],
  concert: ['歌手', '聽', '音樂', '唱歌'], birthday: ['雙胞胎', '兄弟', '生日', '日期', '出生'],
  stage: ['觀眾', '舞台', '掌聲', '表演'], 'hotel-call': ['空房', '電話', '旅館', '走廊', '敲'],
  'theater-shadow': ['戲院', '玻璃', '影子', '行人'], 'blackout-window': ['保全', '停電', '窗戶', '公車'],
  'laundry-knock': ['洗衣機', '敲', '烘衣機', '聲響', '電']
};

const soupReplies = {
  yes: '是。',
  no: '不是。',
  related: '有關。可以把問題縮小到一個人物、物品或原因。',
  unclear: '目前還不能確定。試著指明你想確認的人、物品或事件。',
  unrelated: '與這起事件的成因無關。'
};

function normalizeSoupQuestion(question) {
  return question.normalize('NFKC').toLowerCase().replace(/[\s，。？！、：；,.?!]/gu, '')
    .replace(/(?:是不是|有沒有|是否|有無|可不可以|會不會|能不能|對不對)/gu, '')
    .replace(/(?:嗎|呢|對嗎)$/u, '');
}

function judgeSoupQuestion(storyId, question) {
  const text = normalizeSoupQuestion(question);
  const concepts = soupConcepts[storyId] ?? [];
  const group = concepts.findIndex(aliases => aliases.some(alias => text.includes(alias)));
  if (/(?:還是|或者|抑或)/u.test(text)) return { verdict: 'related', group: -1 };
  if (/殺人|兇手|凶手|鬼魂|做夢|幻覺|時間旅行/u.test(text)) return { verdict: 'unclear', group: -1 };
  if (group >= 0) {
    // A matched word can merely be a topic, e.g. 「跟鏡子有關嗎」.
    if (/有關|相關|關係|重要/u.test(text) && !/無關|沒有關係|沒關係|不相關/u.test(text)) return { verdict: 'related', group };
    const negated = concepts[group].some(word => {
      const position = text.indexOf(word);
      if (position < 0 || /^(?:不|沒|無)/u.test(word)) return false;
      return /(?:沒有|並非|不是|並不是|不曾|從沒|沒)(?:使用|用|透過|靠|經過|看過|見過|從)?$/u.test(text.slice(0, position)) ||
        /^(?:無關|不相關|沒有關係|沒關係)/u.test(text.slice(position + word.length));
    });
    return { verdict: negated ? 'no' : 'yes', group };
  }
  if ((soupTopics[storyId] ?? []).some(topic => text.includes(topic))) return { verdict: 'related', group: -1 };
  return { verdict: 'unclear', group: -1 };
}

function startSoupGame(random = Math.random, difficulty, previousId) {
  const indexed = stories.map((story, index) => ({ story, comic: soupComics[index] }));
  const matches = difficulty ? indexed.filter(({ story }) => story.difficulty === difficulty) : indexed;
  const fresh = matches.filter(({ comic }) => comic[0] !== previousId);
  const pool = fresh.length ? fresh : matches;
  const { story, comic } = pool[Math.floor(random() * pool.length)];
  return { story, comic, discoveries: new Set(), hints: 0, progress: 0, reply: '', result: null, revealed: false };
}

function playSoup(game, action, question, verdict) {
  const { story } = game;
  if (action === 'ask') {
    const judged = judgeSoupQuestion(game.comic[0], question);
    const answer = Object.hasOwn(soupReplies, verdict) ? verdict : judged.verdict;
    game.reply = soupReplies[answer];
    if (answer === 'yes' && judged.group >= 0 && !game.discoveries.has(judged.group)) {
      game.discoveries.add(judged.group);
      if (game.progress < story.clues.length) game.reply += ' ' + story.clues[game.progress++];
      if (game.progress === story.clues.length) game.result ??= 'solved';
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

function soupCase(id) {
  const index = soupComics.findIndex(comic => comic[0] === id);
  return stories[index];
}
if (typeof module !== 'undefined') module.exports = {
  startSoupGame, playSoup, soupView, soupDifficulties, judgeSoupQuestion, soupCase
};
