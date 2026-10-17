/* =====================================================================
 * 每日日本語 - 应用逻辑
 * 页内路由 · 状态管理 · 朱印打卡 · 语音朗读 · 闯关引擎
 * ===================================================================== */
(function () {
  'use strict';

  var D = window.NIHONGO_DATA;
  var MODULES = D.MODULES;
  var STORE_KEY = 'nihongo_app_state_v1';

  /* ---------------- 状态 ---------------- */
  var state = loadState();

  function defaultState() {
    return {
      day: 0,          // 当前学习日（0-based）
      done: {},        // { dayIndex: [moduleKey,...] } 当日完成模块
      gameClear: -1,   // 已通过的最高关卡（levels 下标）
      streak: 0,       // 连续全勤天数
      lastFullDay: -1  // 最近一次全勤的 day
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        s.done = s.done || {};
        s.day = typeof s.day === 'number' ? s.day : 0;
        s.gameClear = typeof s.gameClear === 'number' ? s.gameClear : -1;
        s.streak = s.streak || 0;
        s.lastFullDay = typeof s.lastFullDay === 'number' ? s.lastFullDay : -1;
        return s;
      }
    } catch (e) {}
    return defaultState();
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ---------------- 工具 ---------------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var dayIndex = state.day % D.DAY_COUNT;
  /* 当前学习日对应的内容索引（每次渲染重新计算，切换天时内容才会随之变化） */
  function curDay() { return state.day % D.DAY_COUNT; }
  var MODULE_BY_KEY = {};
  MODULES.forEach(function (m) { MODULE_BY_KEY[m.key] = m; });

  function todayDone() { return state.done[state.day] || []; }
  function isDone(key) { return todayDone().indexOf(key) >= 0; }
  function isDayFull() { return todayDone().length >= MODULES.length; }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  /* 语音朗读 */
  var speechOK = ('speechSynthesis' in window);
  function speak(text, rate) {
    if (!speechOK) { toast('当前环境不支持语音朗读'); return; }
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = rate || 0.92;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  }
  function stopSpeak() { if (speechOK) window.speechSynthesis.cancel(); }

  var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var ICON_SPEAK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a9 9 0 0 1 0 12"/></svg>';

  /* ---------------- 导航 ---------------- */
  function renderNav() {
    var nav = $('#nav');
    nav.innerHTML = MODULES.map(function (m) {
      var active = location.hash === '#/' + m.key;
      var done = isDone(m.key);
      return '<div class="nav-item' + (active ? ' active' : '') + '" data-nav="' + m.key + '">' +
        '<span class="nav-kanji">' + m.kanji + '</span>' +
        '<span class="nav-name">' + esc(m.label) + (done ? ' <span style="color:var(--vermilion)">■</span>' : '') + '</span>' +
        '</div>';
    }).join('');
    $$('.nav-item', nav).forEach(function (el) {
      el.addEventListener('click', function () { location.hash = '#/' + el.getAttribute('data-nav'); closeSidebar(); });
    });
  }

  /* ---------------- 完成打卡 ---------------- */
  function complete(key) {
    var arr = state.done[state.day] = state.done[state.day] || [];
    if (arr.indexOf(key) < 0) arr.push(key);
    var wasFull = isDayFull();
    if (wasFull && state.lastFullDay !== state.day) {
      state.lastFullDay = state.day;
      // 从当前日向前数，统计连续全勤天数
      var s = 0, d = state.day;
      while (d >= 0 && (state.done[d] || []).length >= MODULES.length) { s += 1; d -= 1; }
      state.streak = s;
      saveState();
      toast('今日全部完成，连续学习 ' + state.streak + ' 天');
    } else {
      saveState();
      toast('「' + MODULE_BY_KEY[key].label + '」完成，盖上一枚朱印');
    }
    renderView();
  }

  /* ---------------- 视图渲染 ---------------- */
  function currentView() {
    var h = location.hash || '#/home';
    var key = h.replace('#/', '').split('?')[0];
    return MODULE_BY_KEY[key] ? key : 'home';
  }

  /* 按模块 key 分发到对应渲染函数 */
  function renderModule(key) {
    switch (key) {
      case 'listen':  renderListen(); break;
      case 'vocab':   renderVocab(); break;
      case 'reading': renderReading(); break;
      case 'oral':    renderOral(); break;
      case 'kanji':   renderKanji(); break;
      case 'game':    renderGame(); break;
      case 'culture': renderCulture(); break;
      default: renderHome(); break;
    }
  }

  function renderView() {
    var views = $$('.view');
    var cur = currentView();
    views.forEach(function (v) { v.classList.toggle('active', v.getAttribute('data-view') === cur); });
    renderNav();
    if (cur === 'home') renderHome();
    else renderModule(cur);
  }

  /* ---- 首页 ---- */
  function renderHome() {
    var v = $('#view-home');
    var dayNo = state.day + 1;
    var done = todayDone();
    var totalSeals = 0;
    Object.keys(state.done).forEach(function (d) { totalSeals += (state.done[d] || []).length; });

    v.innerHTML =
      '<div class="hero">' +
        '<div class="kicker">DAILY NIHONGO</div>' +
        '<h1>第 ' + dayNo + ' 天的学习</h1>' +
        '<p>每天三十分钟，从听力到文化，循序渐进地走进日语的世界。完成每个模块，就在朱印帐上盖上一枚红印。</p>' +
        '<div class="hero-actions">' +
          '<button class="btn primary" data-go="listen">开始今日听力</button>' +
          '<button class="btn" data-go="game">进入闯关</button>' +
        '</div>' +
      '</div>' +

      '<div class="day-select">' +
        '<div class="ds-head">' +
          '<span class="ds-title">选择学习日</span>' +
          '<span class="ds-sub">共 ' + D.DAY_COUNT + ' 天 · 点击切换到对应内容</span>' +
        '</div>' +
        '<div class="day-tabs">' + (function () {
          var cur = curDay(), s = '';
          for (var i = 0; i < D.DAY_COUNT; i++) {
            s += '<button class="day-tab' + (i === cur ? ' active' : '') + '" data-day="' + i + '">第 ' + (i + 1) + ' 天</button>';
          }
          return s;
        })() + '</div>' +
        '<div class="day-nav">' +
          '<button class="btn" id="prevDay">← 上一天</button>' +
          '<button class="btn" id="nextDay">下一天 →</button>' +
        '</div>' +
      '</div>' +

      '<div class="goshuin">' +
        '<div class="goshuin-title">今日朱印帐</div>' +
        '<div class="goshuin-sub">完成模块即盖印 · 点击印章直达对应模块</div>' +
        '<div class="seal-grid">' + MODULES.map(function (m) {
          var dd = isDone(m.key);
          return '<div class="seal' + (dd ? ' done' : '') + '" data-seal="' + m.key + '">' +
            '<div class="seal-box">' + m.kanji + '</div>' +
            '<div class="seal-label">' + esc(m.label) + '</div>' +
          '</div>';
        }).join('') + '</div>' +
      '</div>' +

      '<div class="stats-row">' +
        stat('今日完成', done.length + ' / ' + MODULES.length, '枚朱印') +
        stat('累计印章', totalSeals + ' 枚', '终身学习足迹') +
        stat('闯关进度', '第 ' + (state.gameClear + 2) + ' 关', '已达最高通关') +
        stat('连续全勤', state.streak + ' 天', '每日全部完成') +
      '</div>' +

      '<div class="view-head"><div class="kicker">MODULES</div><div class="view-title">学习模块</div></div>' +
      '<div class="module-grid">' + MODULES.map(function (m) {
        return '<div class="module-card" data-go="' + m.key + '">' +
          '<div class="mc-kanji">' + m.kanji + '</div>' +
          '<div class="mc-title">' + esc(m.label) + '</div>' +
          '<div class="mc-desc">' + esc(m.desc) + '</div>' +
        '</div>';
      }).join('') + '</div>';

    $('#prevDay').addEventListener('click', function () {
      state.day = Math.max(0, state.day - 1); saveState(); renderView();
    });
    $('#nextDay').addEventListener('click', function () {
      state.day = state.day + 1; saveState(); renderView();
    });
    $$('[data-day]', v).forEach(function (el) {
      el.addEventListener('click', function () {
        state.day = +el.getAttribute('data-day'); saveState(); renderView();
      });
    });
    $$('[data-go]', v).forEach(function (el) {
      el.addEventListener('click', function () { location.hash = '#/' + el.getAttribute('data-go'); });
    });
    $$('[data-seal]', v).forEach(function (el) {
      el.addEventListener('click', function () { location.hash = '#/' + el.getAttribute('data-seal'); });
    });
  }
  function stat(lbl, num, sub) {
    return '<div class="stat"><div class="num">' + esc(num) + '</div><div class="lbl">' + esc(lbl) + ' · ' + esc(sub) + '</div></div>';
  }

  /* ---- 通用模块页头 + 完成按钮 + 出处 ---- */
  function moduleShell(key, title, desc, inner, source) {
    var m = MODULE_BY_KEY[key];
    var done = isDone(key);
    var srcHtml = source
      ? '<div style="margin-top:10px;font-size:12px;color:#999;border-top:1px dashed #ddd;padding-top:8px;">📚 出处：' + esc(source) + '</div>'
      : '';
    return '<div class="view-head">' +
        '<div class="kicker">' + esc(m.en) + '</div>' +
        '<div class="view-title">' + esc(title) + '</div>' +
        '<div class="view-desc">' + esc(desc) + srcHtml + '</div>' +
      '</div>' +
      inner +
      '<div style="margin-top:26px;display:flex;gap:12px;align-items:center;">' +
        '<button class="btn primary" id="completeBtn">' + (done ? '本模块已盖印' : '完成本模块 · 盖印') + '</button>' +
        '<span style="font-size:13px;color:var(--ink-soft)">' + (done ? '今日已完成' : '完成后将盖上一枚朱色印章') + '</span>' +
      '</div>';
  }

  /* 可复用：选择题卡片 HTML（items 为 [{q,opts,ans}]；id 用于隔离多个卡片） */
  function choiceCardHTML(items, tkanji, title, id) {
    return '<div class="card"' + (id ? ' id="' + id + '"' : '') + '>' +
      '<div class="card-title"><span class="t-kanji">' + tkanji + '</span>' + title + '</div>' +
      '<div class="choice-list">' + items.map(function (q, qi) {
        return '<div class="choice-q" data-qi="' + qi + '">' +
          '<div class="cq-q">Q' + (qi + 1) + '. ' + esc(q.q) + '</div>' +
          '<div class="cq-opts">' + q.opts.map(function (o, i) {
            return '<button class="cq-opt" data-opt="' + i + '">' + esc(o) + '</button>';
          }).join('') + '</div>' +
          '<div class="cq-feedback"></div>' +
        '</div>';
      }).join('') + '</div>' +
    '</div>';
  }
  /* 可复用：选择题作答绑定（container 为卡片元素，list 为该卡片题目） */
  function bindChoiceClick(container, list) {
    $$('.cq-opt', container).forEach(function (b) {
      b.addEventListener('click', function () {
        var qBlock = b.closest('.choice-q');
        if (!qBlock || qBlock.classList.contains('answered')) return;
        var q = list[+qBlock.getAttribute('data-qi')];
        qBlock.classList.add('answered');
        $$('[data-opt]', qBlock).forEach(function (ob) {
          if (+ob.getAttribute('data-opt') === q.ans) ob.classList.add('correct'); else ob.classList.add('dim');
        });
        b.classList.add(+b.getAttribute('data-opt') === q.ans ? 'selected-correct' : 'selected-wrong');
        var fb = qBlock.querySelector('.cq-feedback');
        fb.textContent = (+b.getAttribute('data-opt') === q.ans) ? '正解！' : '不正解。正解は「' + q.opts[q.ans] + '」です。';
        fb.classList.add(+b.getAttribute('data-opt') === q.ans ? 'ok' : 'no');
      });
    });
  }

  /* ---- 听力 ---- */
  function renderListen() {
    var item = D.LISTENING[curDay()];
    var v = $('#view-listen');
    var html = moduleShell('listen', item.title + '（' + item.level + '）', '每天一段新闻 / 动漫 / 日剧，先听再读，训练语感。', [
      '<div class="audio-player">' +
        '<button class="play" id="playBtn" aria-label="播放">' + ICON_PLAY + '</button>' +
        '<div class="ap-info"><strong>' + esc(item.tag) + ' · 朗读全文</strong><span>点击播放，边听边跟读</span></div>' +
      '</div>',
      '<div class="audio-note">提示：朗读使用浏览器语音引擎，请将系统音量调到合适大小，先盲听一遍再看文字稿。</div>',
      '<div class="card"><div class="card-title"><span class="t-kanji">聴</span>文字稿</div>' +
        '<div class="transcript">' + esc(item.jp) + '</div>' +
        '<div class="translation">' + esc(item.zh) + '</div>' +
      '</div>',
      '<div class="card"><div class="card-title"><span class="t-kanji">選</span>N2 选择题 · 点击作答</div>' +
        '<div class="choice-list">' + item.choices.map(function (q, qi) {
          return '<div class="choice-q">' +
            '<div class="cq-q">Q' + (qi + 1) + '. ' + esc(q.q) + '</div>' +
            '<div class="cq-opts">' + q.opts.map(function (o, i) {
              return '<button class="cq-opt" data-cq="' + qi + '" data-opt="' + i + '">' + esc(o) + '</button>';
            }).join('') + '</div>' +
            '<div class="cq-feedback"></div>' +
          '</div>';
        }).join('') + '</div>' +
      '</div>',
      '<div class="card qa-card">' +
        '<button class="qa-toggle" id="qaToggle">【問】理解确认 <span class="qa-arrow">▼</span></button>' +
        '<div class="qa-body" id="qaBody" style="display:none">' +
          item.questions.map(function (q, i) {
            return '<div class="qa-item"><div class="q">Q' + (i + 1) + '. ' + esc(q.q) + '</div><div class="a">A. ' + esc(q.a) + '</div></div>';
          }).join('') +
        '</div>' +
      '</div>'
    ].join(''), item.source);

    v.innerHTML = html;

    var playing = false;
    $('#playBtn').addEventListener('click', function () {
      if (playing) { stopSpeak(); playing = false; this.querySelector('svg').outerHTML = ICON_PLAY; }
      else { speak(item.jp); playing = true; this.querySelector('svg').outerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'; }
    });

    /* N2 选择题作答 */
    $$('[data-cq]', v).forEach(function (b) {
      b.addEventListener('click', function () {
        var qi = +b.getAttribute('data-cq'), oi = +b.getAttribute('data-opt');
        var q = item.choices[qi];
        var qBlock = b.closest('.choice-q');
        if (qBlock.classList.contains('answered')) return;
        qBlock.classList.add('answered');
        $$('[data-cq="' + qi + '"]', v).forEach(function (ob) {
          var isAns = +ob.getAttribute('data-opt') === q.ans;
          if (isAns) ob.classList.add('correct'); else ob.classList.add('dim');
        });
        b.classList.add(oi === q.ans ? 'selected-correct' : 'selected-wrong');
        var fb = qBlock.querySelector('.cq-feedback');
        fb.textContent = oi === q.ans ? '正解！' : '不正解。正解は「' + q.opts[q.ans] + '」です。';
        fb.classList.add(oi === q.ans ? 'ok' : 'no');
      });
    });

    /* 理解确认折叠 */
    var qaOpen = false;
    $('#qaToggle').addEventListener('click', function () {
      qaOpen = !qaOpen;
      $('#qaBody').style.display = qaOpen ? '' : 'none';
      this.querySelector('.qa-arrow').textContent = qaOpen ? '▲' : '▼';
    });

    bindComplete('listen', v);
  }

  /* ---- 单词·语法 ---- */
  function renderVocab() {
    var item = D.VOCAB[curDay()];
    var v = $('#view-vocab');
    var html = moduleShell('vocab', '单词与语法：' + item.theme, '掌握今日单词，理解两个语法要点，并尝试造句。', [
      '<div class="card"><div class="card-title"><span class="t-kanji">単</span>今日单词（' + item.words.length + ' 个）</div>' +
        '<table class="word-table"><thead><tr><th>单词</th><th>假名</th><th>意思</th></tr></thead><tbody>' +
        item.words.map(function (w) {
          return '<tr><td class="jp">' + esc(w.jp) + '</td><td class="kana">' + esc(w.kana) + '</td><td>' + esc(w.zh) + '</td></tr>';
        }).join('') + '</tbody></table>' +
      '</div>',
      '<div class="card"><div class="card-title"><span class="t-kanji">法</span>今日语法</div>' +
        item.grammar.map(function (g) {
          return '<div class="grammar-block">' +
            '<div class="g-title">' + esc(g.title) + '</div>' +
            '<div class="g-jp jp">' + esc(g.jp) + '</div>' +
            '<div class="g-zh">' + esc(g.zh) + '</div>' +
            '<div class="g-note">' + esc(g.note) + '</div>' +
          '</div>';
        }).join('') +
      '</div>'
    ].join(''), item.source);
    v.innerHTML = html;
    bindComplete('vocab', v);
  }

  /* ---- 阅读·写作 ---- */
  function renderReading() {
    var item = D.READING[curDay()];
    var v = $('#view-reading');
    var qaOpen = false;
    var html = moduleShell('reading', '阅读与写作：' + item.title, '先读短篇，再做选择题；接着读中篇，最后完成写作练习。', [
      '<div class="card"><div class="card-title"><span class="t-kanji">読</span>短文（短篇）</div>' +
        '<div class="read-passage">' + esc(item.jp) + '</div>' +
        '<div class="read-trans">' + esc(item.zh) + '</div>' +
      '</div>',
      choiceCardHTML([item.choice], '選', 'N2 选择题 · 短文', 'shortChoice'),
      '<div class="card"><div class="card-title"><span class="t-kanji">読</span>中篇</div>' +
        '<div class="read-passage">' + esc(item.medium.jp) + '</div>' +
        '<div class="read-trans">' + esc(item.medium.zh) + '</div>' +
      '</div>',
      choiceCardHTML(item.medium.choices, '選', 'N2 选择题 · 中篇', 'mediumChoice'),
      '<div class="card qa-card">' +
        '<button class="qa-toggle" id="qaToggle">【問】理解检查 <span class="qa-arrow">▼</span></button>' +
        '<div class="qa-body" id="qaBody" style="display:none">' +
          '<div class="qa-sub">短文</div>' +
          item.questions.map(function (q, i) {
            return '<div class="qa-item"><div class="q">Q' + (i + 1) + '. ' + esc(q.q) + '</div><div class="a">A. ' + esc(q.a) + '</div></div>';
          }).join('') +
          '<div class="qa-sub">中篇</div>' +
          item.medium.questions.map(function (q, i) {
            return '<div class="qa-item"><div class="q">Q' + (i + 1) + '. ' + esc(q.q) + '</div><div class="a">A. ' + esc(q.a) + '</div></div>';
          }).join('') +
        '</div>' +
      '</div>',
      '<div class="card"><div class="card-title"><span class="t-kanji">書</span>写作练习</div>' +
        '<div class="writing-prompt"><div class="wp-title">WRITING PROMPT</div><p>' + esc(item.writing.prompt) + '</p></div>' +
        '<div class="writing-model">参考例文<br>' + esc(item.writing.model) + '</div>' +
      '</div>'
    ].join(''), item.source);
    v.innerHTML = html;
    bindChoiceClick($('#shortChoice'), [item.choice]);
    bindChoiceClick($('#mediumChoice'), item.medium.choices);
    $('#qaToggle').addEventListener('click', function () {
      qaOpen = !qaOpen;
      $('#qaBody').style.display = qaOpen ? '' : 'none';
      this.querySelector('.qa-arrow').textContent = qaOpen ? '▲' : '▼';
    });
    bindComplete('reading', v);
  }

  /* ---- 口语 ---- */
  function renderOral() {
    var item = D.ORAL[curDay()];
    var v = $('#view-oral');
    var bubbles = item.dialogue.map(function (d, i) {
      var side = i % 2 === 0 ? 'me' : 'other';
      return '<div class="bubble ' + side + '">' +
        '<div class="speaker">' + esc(d.s) + '</div>' +
        '<div class="b-jp">' + esc(d.jp) + '</div>' +
        '<div class="b-zh">' + esc(d.zh) + '</div>' +
      '</div>';
    }).join('');
    var html = moduleShell('oral', '口语练习：' + item.scene, '大声跟读对话，完成小练习，再挑战 N2 一问一答。', [
      '<div class="card"><div class="card-title"><span class="t-kanji">話</span>场景对话</div>' +
        '<div class="chat">' + bubbles + '</div>' +
        '<button class="btn" id="readDialogue">朗读整段对话</button>' +
      '</div>',
      '<div class="card"><div class="card-title"><span class="t-kanji">句</span>关键句 · 点击可跟读</div>' +
        '<div class="keys">' + item.keys.map(function (k, i) {
          return '<div class="key-row" data-spk="' + i + '">' +
            '<span class="k-jp">' + esc(k.jp) + '</span>' +
            '<span class="k-zh">' + esc(k.zh) + '</span>' +
            '<span class="speak-btn">' + ICON_SPEAK + '</span>' +
          '</div>';
        }).join('') + '</div>' +
      '</div>',
      '<div class="card"><div class="card-title"><span class="t-kanji">練</span>小练习 · 试试看</div>' +
        '<div class="practice-list">' + item.practice.map(function (p, i) {
          return '<div class="practice-item"><span class="p-num">' + (i + 1) + '</span>' +
            '<div class="p-body"><div class="p-jp">' + esc(p.jp) + '</div><div class="p-zh">' + esc(p.zh) + '</div></div>' +
          '</div>';
        }).join('') + '</div>' +
      '</div>',
      '<div class="card"><div class="card-title"><span class="t-kanji">応</span>N2 一问一答 · 先听后选</div>' +
        '<div class="qv-note">问句与选项以语音播放，文字默认隐藏。听完后点序号四选一，最后点「显示文字」查看并判对错。</div>' +
        item.qa.map(function (q, qi) {
          return '<div class="qv-block" data-qi="' + qi + '">' +
            '<div class="qv-q">' +
              '<button class="play small" id="qvQ' + qi + '" aria-label="播放问句">' + ICON_PLAY + '</button>' +
              '<span class="qv-qhint">第 ' + (qi + 1) + ' 题 · 点击喇叭听问句</span>' +
            '</div>' +
            '<div class="qv-opts">' + q.opts.map(function (o, j) {
              return '<div class="qv-opt-row" data-opt="' + j + '">' +
                '<button class="qv-opt" data-opt="' + j + '">' + (j + 1) + '</button>' +
                '<button class="qv-play" data-opt="' + j + '" aria-label="听选项">' + ICON_PLAY + '</button>' +
                '<span class="qv-otext hidden">' + esc(o) + '</span>' +
              '</div>';
            }).join('') + '</div>' +
            '<div class="qv-qtext hidden">' + esc(q.q) + '</div>' +
            '<div class="qv-feedback"></div>' +
          '</div>';
        }).join('') +
        '<button class="btn" id="showQAtext">显示问句与选项文字</button>' +
      '</div>',
      '<div class="tip-box">小贴士：' + esc(item.tip) + '</div>'
    ].join(''), item.source);
    v.innerHTML = html;
    $$('[data-spk]', v).forEach(function (row) {
      row.addEventListener('click', function () { speak(item.keys[+row.getAttribute('data-spk')].jp, 1.0); });
    });
    $('#readDialogue').addEventListener('click', function () {
      speak(item.dialogue.map(function (d) { return d.jp; }).join(' '));
    });
    bindOralQA(v, item);
    bindComplete('oral', v);
  }

  /* 口语 · N2 一问一答（先听后选，文字默认隐藏） */
  function bindOralQA(v, item) {
    var qa = item.qa;
    /* 四选一：点序号选中 */
    $$('.qv-opt', v).forEach(function (b) {
      b.addEventListener('click', function () {
        var block = b.closest('.qv-block');
        var row = b.closest('.qv-opt-row');
        $$('.qv-opt-row', block).forEach(function (r) { r.classList.remove('selected'); });
        row.classList.add('selected');
      });
    });
    /* 听问句 */
    qa.forEach(function (q, qi) {
      var qb = $('#qvQ' + qi);
      if (qb) qb.addEventListener('click', function () { speak(q.q); });
    });
    /* 听选项 */
    $$('.qv-play', v).forEach(function (b) {
      b.addEventListener('click', function () {
        var qi = +b.closest('.qv-block').getAttribute('data-qi');
        var oi = +b.getAttribute('data-opt');
        speak(qa[qi].opts[oi]);
      });
    });
    /* 显示文字 + 判对错 */
    $('#showQAtext').addEventListener('click', function () {
      $$('.qv-block', v).forEach(function (block) {
        var qi = +block.getAttribute('data-qi');
        var q = qa[qi];
        block.querySelector('.qv-qtext').classList.remove('hidden');
        $$('.qv-otext', block).forEach(function (t) { t.classList.remove('hidden'); });
        var sel = block.querySelector('.qv-opt-row.selected');
        var fb = block.querySelector('.qv-feedback');
        var oi = sel ? +sel.getAttribute('data-opt') : -1;
        if (sel && oi === q.ans) { sel.classList.add('correct'); }
        else if (sel) { sel.classList.add('wrong'); }
        $$('.qv-opt-row', block).forEach(function (r) {
          if (+r.getAttribute('data-opt') === q.ans) r.classList.add('correct');
        });
        var msg = sel && oi === q.ans ? '正解！'
          : (sel ? '不正解。正解は「' + q.opts[q.ans] + '」です。' : '请先选择一项答案。正解は「' + q.opts[q.ans] + '」です。');
        fb.textContent = msg;
        fb.classList.add(sel && oi === q.ans ? 'ok' : 'no');
      });
    });
  }

  /* ---- 汉字 ---- */
  function renderKanji() {
    var item = D.KANJI[curDay()];
    var v = $('#view-kanji');
    var html = moduleShell('kanji', '汉字特训：' + item.theme, '认识今日汉字，掌握音读与训读，记住常用词。', [
      '<div class="card"><div class="card-title"><span class="t-kanji">漢</span>今日汉字</div>' +
        '<div class="kanji-grid">' + item.chars.map(function (c) {
          return '<div class="kanji-card">' +
            '<div class="kanji-char">' + c.ch + '</div>' +
            '<div class="kanji-read">音 ' + esc(c.on) + (c.kun !== '—' ? ' · 训 ' + esc(c.kun) : '') + '</div>' +
            '<div class="kanji-zh">' + esc(c.zh) + '</div>' +
            '<div class="kanji-ex">' + c.ex.map(function (e) {
              var p = e.split('（');
              return '<div><span class="ex-jp">' + esc(p[0]) + '</span>' + (p[1] ? '（' + esc(p[1]) : '') + '</div>';
            }).join('') + '</div>' +
          '</div>';
        }).join('') + '</div>' +
      '</div>',
      '<div class="tip-box">记忆要点：' + esc(item.tip) + '</div>'
    ].join(''), item.source);
    v.innerHTML = html;
    bindComplete('kanji', v);
  }

  /* ============================================================
   * 闯关引擎 —— 从当天各模块(VOCAB/KANJI/ORAL/LISTENING/READING/CULTURE)
   * 动态生成 5 关考题，不同天题目不同，完全贴合当日学习内容。
   * ============================================================ */
  var quiz = { lv: 0, idx: 0, correct: 0, answered: false };

  /* 带种子的 Fisher-Yates 洗牌（确定性） */
  function shuffleWithSeed(arr, seed) {
    var a = arr.slice();
    var s = (seed >>> 0) || 1;
    function rnd() { s = (s * 1664525 + 1013904223) >>> 0; return (s >>> 8) / 0xFFFFFF; }
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- 全局干扰项池（初始化时从全部 14 天素材收集） ---------- */
  var POOL = (function () {
    var wordsZh = [], kanjiOn = [], kanjiKun = [], kanjiZh = [], grammarKeys = [];
    // wordsZh: 所有 VOCAB.words 的中文释义
    D.VOCAB.forEach(function (day) {
      day.words.forEach(function (w) { wordsZh.push(w.zh); });
    });
    // kanjiOn / kanjiKun / kanjiZh: 所有 KANJI.chars 的读音和释义
    D.KANJI.forEach(function (day) {
      day.chars.forEach(function (c) {
        if (c.on && c.on !== '—') kanjiOn.push(c.on);
        if (c.kun && c.kun !== '—') kanjiKun.push(c.kun);
        if (c.zh) kanjiZh.push(c.zh);
      });
    });
    // grammarKeys: 从所有 grammar.title 中提取核心助词短语
    var rawKeys = [];
    D.VOCAB.forEach(function (day) {
      day.grammar.forEach(function (g) {
        // 从 title 里去掉括号注释，提取出关键短语
        var title = g.title || '';
        // 提取 "～xxx" 或 "xxx / yyy" 里的每个短语
        var parts = title.split('/').map(function (p) {
          return p.replace(/（[^）]*）/g, '').replace(/～/g, '').trim();
        });
        parts.forEach(function (p) {
          if (p && p.length >= 2 && p.length <= 12) rawKeys.push(p);
        });
      });
    });
    // 去重
    grammarKeys = rawKeys.filter(function (v, i) { return rawKeys.indexOf(v) === i; });
    return { wordsZh: wordsZh, kanjiOn: kanjiOn, kanjiKun: kanjiKun, kanjiZh: kanjiZh, grammarKeys: grammarKeys };
  })();

  /* 从 pool 里挑 n 个不等于任何 exclude 的元素；seed 用于确定性选择；结果保证互不重复 */
  function pickDistractors(pool, n, exclude, seed) {
    var ex = {};
    (exclude || []).forEach(function (e) { ex[e] = true; });
    // 先去重再排除，确保不会有重复选项
    var seen = {};
    var cand = pool.filter(function (p) {
      if (ex[p] || seen[p]) return false;
      seen[p] = true;
      return true;
    });
    // 如果候选不够，放宽排除条件（但仍然去重）
    if (cand.length < n) {
      seen = {};
      cand = pool.filter(function (p) {
        if (seen[p]) return false;
        seen[p] = true;
        return true;
      });
    }
    return shuffleWithSeed(cand, seed).slice(0, n);
  }

  /* ---------- 各关卡类型的出题函数 ---------- */

  /* L1 词汇：从当天 VOCAB.words 生成「词(kana)」的意思是？ */
  function genVocabQ(day, count, seedBase) {
    var out = [];
    var dayWords = D.VOCAB[day].words;
    // 打乱当天词序，取前 count 个
    var picked = shuffleWithSeed(dayWords, seedBase).slice(0, Math.min(count, dayWords.length));
    for (var i = 0; i < picked.length; i++) {
      var w = picked[i];
      var correct = w.zh;
      var distractors = pickDistractors(POOL.wordsZh, 3, [correct], seedBase + i * 31 + 7);
      var optsRaw = distractors.concat([correct]);
      var optsShuffled = shuffleWithSeed(optsRaw, seedBase + i * 13 + 3);
      var ansIdx = optsShuffled.indexOf(correct);
      out.push({
        type: '词汇',
        q: '「' + w.jp + '」（' + w.kana + '）的意思是？',
        opts: optsShuffled,
        ans: ansIdx
      });
    }
    return out;
  }

  /* L2 汉字：从当天 KANJI.chars 生成 —— 音读题 + 意思题 */
  function genKanjiQ(day, count, seedBase) {
    var out = [];
    var dayChars = D.KANJI[day].chars;
    // 每天 5 字，可生成 10 题（音读+训读各半），取 count 题
    var allQ = [];
    dayChars.forEach(function (c) {
      // 音读题
      if (c.on && c.on !== '—') {
        var onCorrect = c.on;
        var onDist = pickDistractors(POOL.kanjiOn, 3, [onCorrect], seedBase + c.on.charCodeAt(0));
        var onOpts = shuffleWithSeed(onDist.concat([onCorrect]), seedBase + c.on.length);
        allQ.push({
          type: '汉字',
          q: '「' + c.ch + '」的音读是？',
          opts: onOpts,
          ans: onOpts.indexOf(onCorrect)
        });
      }
      // 训读题（如果有）
      if (c.kun && c.kun !== '—' && c.kun !== c.on) {
        var kunCorrect = c.kun;
        var kunDist = pickDistractors(POOL.kanjiKun, 3, [kunCorrect], seedBase + c.ch.charCodeAt(0));
        var kunOpts = shuffleWithSeed(kunDist.concat([kunCorrect]), seedBase + c.kun.length);
        allQ.push({
          type: '汉字',
          q: '「' + c.ch + '」的训读是？',
          opts: kunOpts,
          ans: kunOpts.indexOf(kunCorrect)
        });
      }
      // 词义题
      if (c.zh) {
        var zhCorrect = c.zh;
        var zhDist = pickDistractors(POOL.kanjiZh, 3, [zhCorrect], seedBase + c.ch.charCodeAt(0) + 1);
        var zhOpts = shuffleWithSeed(zhDist.concat([zhCorrect]), seedBase + 99);
        allQ.push({
          type: '汉字',
          q: '「' + c.ch + '」的意思是？',
          opts: zhOpts,
          ans: zhOpts.indexOf(zhCorrect)
        });
      }
    });
    // 打乱，取前 count 个
    out = shuffleWithSeed(allQ, seedBase + 5).slice(0, Math.min(count, allQ.length));
    return out;
  }

  /* L3 语法：从当天 VOCAB.grammar 生成 —— 挖空 + 语法意思题 */
  function genGrammarQ(day, count, seedBase) {
    var out = [];
    var dayGrammar = D.VOCAB[day].grammar;
    var usedCorrects = [];
    // 从每个语法点生成题目
    dayGrammar.forEach(function (g, gi) {
      if (out.length >= count) return;
      // 方法一：从 title 提取关键短语，问"（　）に入るのは？"
      var title = g.title || '';
      // 取第一个 "～xxx" 片段
      var m = title.match(/～([^（\/]+)/);
      var keyPhrase = m ? m[1].trim() : '';
      if (keyPhrase && keyPhrase.length >= 2) {
        // 从 jp 例句中找 keyPhrase 位置替换成（　）
        var sent = g.jp;
        if (sent && sent.indexOf(keyPhrase) >= 0) {
          var blankSent = sent.replace(keyPhrase, '（　）');
          var distractors = pickDistractors(POOL.grammarKeys, 3, [keyPhrase], seedBase + gi * 17 + 1);
          var optsRaw = distractors.concat([keyPhrase]);
          var optsShuffled = shuffleWithSeed(optsRaw, seedBase + gi * 7 + 3);
          out.push({
            type: '语法',
            q: blankSent + ' に入るのは？',
            opts: optsShuffled,
            ans: optsShuffled.indexOf(keyPhrase)
          });
          usedCorrects.push(keyPhrase);
        }
      }
      // 方法二：问这个语法是什么意思（从 zh 翻译生成）
      if (out.length < count) {
        var zhMeaning = g.zh ? g.zh.substring(0, Math.min(40, g.zh.length)) : '';
        if (zhMeaning) {
          // 简化一下，直接问"「{keyPhrase}」表示什么？"
          var askPhrase = keyPhrase || title.replace(/（[^）]*）/g, '').replace(/～/g, '').trim();
          if (askPhrase.length >= 2) {
            // 干扰项用其他 grammar 的 zh 翻译片段
            var allZhFrags = [];
            D.VOCAB.forEach(function (d) {
              d.grammar.forEach(function (gg) {
                if (gg.zh) allZhFrags.push(gg.zh.substring(0, 15));
              });
            });
            var distZh = pickDistractors(allZhFrags, 3, [zhMeaning.substring(0, 15)], seedBase + gi * 11 + 5);
            var optsZh = shuffleWithSeed(distZh.concat([zhMeaning]), seedBase + gi * 5 + 2);
            out.push({
              type: '语法',
              q: '「' + askPhrase + '」例句翻译的是哪个？',
              opts: optsZh,
              ans: optsZh.indexOf(zhMeaning)
            });
          }
        }
      }
    });
    // 如果当天 grammar 不够 count 题，补充从邻近天的 grammar 取
    if (out.length < count) {
      for (var d = 1; d <= 3 && out.length < count; d++) {
        var nDay = (day + d) % D.DAY_COUNT;
        dayGrammar = D.VOCAB[nDay].grammar;
        dayGrammar.forEach(function (g2) {
          if (out.length >= count) return;
          var t = g2.title || '';
          var m2 = t.match(/～([^（\/]+)/);
          var k2 = m2 ? m2[1].trim() : '';
          if (k2 && k2.length >= 2 && usedCorrects.indexOf(k2) < 0) {
            usedCorrects.push(k2);
            var s2 = g2.jp;
            if (s2 && s2.indexOf(k2) >= 0) {
              var blank = s2.replace(k2, '（　）');
              var d2 = pickDistractors(POOL.grammarKeys, 3, [k2], seedBase + d * 101 + out.length);
              var o2 = shuffleWithSeed(d2.concat([k2]), seedBase + d * 53 + out.length);
              out.push({ type: '语法', q: blank + ' に入るのは？', opts: o2, ans: o2.indexOf(k2) });
            }
          }
        });
      }
    }
    return out.slice(0, count);
  }

  /* L4 听说理解：直接复用当天 LISTENING.choices + ORAL.qa + READING 选择题 */
  function genListenOralQ(day, count, seedBase) {
    var out = [];
    // 收集当天所有现成选择题
    var pool = [];
    // LISTENING.choices
    D.LISTENING[day].choices.forEach(function (c) {
      pool.push({ type: '听力', q: c.q, opts: c.opts.slice(), ans: c.ans });
    });
    // READING.choice
    var rd = D.READING[day];
    if (rd.choice) pool.push({ type: '阅读', q: rd.choice.q, opts: rd.choice.opts.slice(), ans: rd.choice.ans });
    if (rd.medium && rd.medium.choices) {
      rd.medium.choices.forEach(function (c) {
        pool.push({ type: '阅读', q: c.q, opts: c.opts.slice(), ans: c.ans });
      });
    }
    // ORAL.qa
    D.ORAL[day].qa.forEach(function (c) {
      pool.push({ type: '口语', q: c.q, opts: c.opts.slice(), ans: c.ans });
    });
    // 打乱后取前 count 个
    out = shuffleWithSeed(pool, seedBase + 9).slice(0, Math.min(count, pool.length));
    return out;
  }

  /* L5 综合：从当天所有模块混合抽取 */
  function genMixQ(day, count, seedBase) {
    var out = [];
    // 收集所有当天可选题类型
    var vqs = genVocabQ(day, 3, seedBase + 100);
    var kqs = genKanjiQ(day, 3, seedBase + 200);
    var lqs = genListenOralQ(day, 3, seedBase + 300);
    var all = vqs.concat(kqs).concat(lqs);
    // 打乱取 count 个
    out = shuffleWithSeed(all, seedBase + 500).slice(0, Math.min(count, all.length));
    return out;
  }

  /* ---------- 主入口：生成当天全部 5 关 ---------- */
  function generateDayLevels() {
    var day = curDay();
    var cfg = D.GAME.config;
    var levels = [];
    for (var i = 0; i < cfg.length; i++) {
      var c = cfg[i];
      var seed = day * 31 + i * 7 + 1;
      var qs;
      switch (c.type) {
        case 'vocab':        qs = genVocabQ(day, c.count, seed); break;
        case 'kanji':        qs = genKanjiQ(day, c.count, seed); break;
        case 'grammar':      qs = genGrammarQ(day, c.count, seed); break;
        case 'listen_oral':  qs = genListenOralQ(day, c.count, seed); break;
        default:             qs = genMixQ(day, c.count, seed);
      }
      levels.push({ name: c.name, need: c.need, qs: qs });
    }
    return levels;
  }

  /* ---------- 渲染函数（接口不变，内部改为调用 generateDayLevels） ---------- */
  function renderGame() {
    var v = $('#view-game');
    var levels = generateDayLevels();
    var day = curDay();
    var vocabTheme = D.VOCAB[day].theme;
    var kanjiTheme = D.KANJI[day].theme;
    v.innerHTML = moduleShell('game', '互动闯关', '题目选自你今天学过的词汇、汉字、语法和听说内容。答对指定题数即可解锁下一关。',
      renderLevelList(levels), '当日词汇主题「' + vocabTheme + '」· 汉字主题「' + kanjiTheme + '」');
    $$('[data-play]', v).forEach(function (el) {
      el.addEventListener('click', function () { startQuiz(+el.getAttribute('data-play')); });
    });
    bindComplete('game', v);
  }

  function renderLevelList(levels) {
    var cleared = state.gameClear;
    return '<div class="card"><div class="card-title"><span class="t-kanji">遊</span>关卡选择</div>' +
      '<div class="level-list">' + levels.map(function (lv, i) {
        var locked = i > cleared + 1;
        var clear = i <= cleared;
        var badge = locked ? '未解锁' : (clear ? '已通关' : (i === cleared + 1 ? '可挑战' : ''));
        return '<div class="level-item' + (locked ? ' locked' : '') + (clear ? ' clear' : '') + '" data-play="' + i + '">' +
          '<div class="lv-num">' + (i + 1) + '</div>' +
          '<div class="lv-info"><div class="lv-name">' + esc(lv.name) + '</div>' +
          '<div class="lv-sub">' + lv.qs.length + ' 题 · 答对 ' + lv.need + ' 题过关</div></div>' +
          '<div class="lv-badge">' + badge + '</div>' +
        '</div>';
      }).join('') + '</div>' +
      '<div class="tip-box">每关必须答对指定题数才能通关。全部通关后，你就是日语达人！</div></div>';
  }

  function startQuiz(lv) {
    var levels = generateDayLevels();
    var level = levels[lv];
    quiz = { lv: lv, idx: 0, correct: 0, answered: false };
    renderQuizQuestion(levels);
  }

  function renderQuizQuestion(levels) {
    var level = levels[quiz.lv];
    var q = level.qs[quiz.idx];
    var v = $('#view-game');
    var prog = Math.round((quiz.idx) / level.qs.length * 100);
    v.innerHTML =
      '<div class="view-head"><div class="kicker">CHALLENGE · ' + esc(level.name) + '</div>' +
        '<div class="view-title">第 ' + (quiz.idx + 1) + ' 题</div></div>' +
      '<div class="card quiz">' +
        '<div class="quiz-top"><div class="quiz-progress"><div class="fill" style="width:' + prog + '%"></div></div>' +
          '<span class="quiz-count">' + quiz.correct + ' 对</span></div>' +
        '<div class="quiz-type">' + esc(q.type) + '</div>' +
        '<div class="quiz-q">' + esc(q.q) + '</div>' +
        '<div class="quiz-opts">' + q.opts.map(function (o, i) {
          return '<button class="quiz-opt" data-opt="' + i + '">' + esc(o) + '</button>';
        }).join('') + '</div>' +
        '<div style="margin-top:18px"><button class="btn ghost" id="quitQuiz">退出</button></div>' +
      '</div>';

    $$('[data-opt]', v).forEach(function (b) {
      b.addEventListener('click', function () { answer(+b.getAttribute('data-opt'), levels); });
    });
    $('#quitQuiz').addEventListener('click', function () { renderGame(); });
  }

  function answer(opt, levels) {
    if (quiz.answered) return;
    quiz.answered = true;
    var level = levels[quiz.lv];
    var q = level.qs[quiz.idx];
    var opts = $$('[data-opt]', $('#view-game'));
    opts[q.ans].classList.add('correct');
    var isRight = opt === q.ans;
    if (isRight) quiz.correct += 1; else opts[opt].classList.add('wrong');

    var isLast = quiz.idx >= level.qs.length - 1;
    var action;
    if (isLast) {
      var win = quiz.correct >= level.need;
      if (win) {
        if (quiz.lv > state.gameClear) state.gameClear = quiz.lv;
        saveState();
        complete('game');
        action = 'result';
      } else {
        action = 'fail';
      }
    } else {
      setTimeout(function () { quiz.idx += 1; quiz.answered = false; renderQuizQuestion(levels); }, 900);
      return;
    }

    if (action === 'result') renderGameResult(level, true);
    else renderGameResult(level, false);
  }

  function renderGameResult(level, win) {
    var v = $('#view-game');
    var msg = win
      ? '闯关成功！答对 ' + quiz.correct + ' / ' + level.qs.length + ' 题，通关 ' + esc(level.name) + '。'
      : '还差一点。本关需答对 ' + level.need + ' 题，你对了 ' + quiz.correct + ' 题，再试一次吧。';
    v.innerHTML =
      '<div class="view-head"><div class="kicker">CHALLENGE</div><div class="view-title">挑战结束</div></div>' +
      '<div class="card quiz"><div class="quiz-result">' +
        '<div class="result-seal">' + (win ? '合' : '励') + '</div>' +
        '<h3>' + (win ? '通关成功' : '继续加油') + '</h3>' +
        '<p>' + msg + '</p>' +
        '<button class="btn primary" id="backList">返回关卡</button>' +
      '</div></div>';
    $('#backList').addEventListener('click', function () { renderGame(); });
  }

  /* ---- 文化 ---- */
  function renderCulture() {
    var item = D.CULTURE[curDay()];
    var v = $('#view-culture');
    var html = moduleShell('culture', '文化小知识', '每天了解一个日本文化或冷知识，让语言学习更有温度。', [
      '<div class="culture-hero">' +
        '<div class="ch-cat">' + esc(item.cat) + '</div>' +
        '<h2>' + esc(item.title) + '</h2>' +
      '</div>',
      '<div class="card culture-body">' +
        '<div class="jp">' + esc(item.jp) + '</div>' +
        '<div class="zh">' + esc(item.zh) + '</div>' +
      '</div>',
      '<div class="tip-box">试着把这段文化介绍用日语念出来，作为今天的口语延伸练习吧。</div>'
    ].join(''), item.source);
    v.innerHTML = html;
    bindComplete('culture', v);
  }

  /* ---- 完成按钮绑定（container 为当前视图根元素，避免多 view 中重复 id 导致 querySelector 取到旧按钮） ---- */
  function bindComplete(key, container) {
    var btn = $('#completeBtn', container);
    if (btn && !isDone(key)) {
      btn.addEventListener('click', function () { complete(key); });
    }
  }

  /* ---------------- 侧栏（移动端） ---------------- */
  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#overlay').classList.remove('show');
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    if (!location.hash) location.hash = '#/home';
    /* 左上角返回首页 */
    ['brandHome', 'goHome', 'goHomeTop'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function () { location.hash = '#/home'; closeSidebar(); });
    });
    $('#hamburger').addEventListener('click', function () {
      $('#sidebar').classList.add('open');
      $('#overlay').classList.add('show');
    });
    $('#overlay').addEventListener('click', closeSidebar);
    window.addEventListener('hashchange', renderView);
    renderView();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
