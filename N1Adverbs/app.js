/* =====================================================================
 * N1 核心副词 300 - 应用逻辑
 * 7 模块闭环学习 · 状态管理 · 测验引擎 · 进度追踪
 * ===================================================================== */
(function () {
  'use strict';

  var D = window.ADVERB_DATA;
  var STORE_KEY = 'n1_adverb_state_v1';

  /* ---------------- 状态 ---------------- */
  var state = loadState();

  function defaultState() {
    return {
      unitIdx: 0,           // 当前学习单元下标
      doneUnits: {},        // { unitId: { moduleIdx: true } } 各单元完成模块
      quizScores: {},       // { unitId: score }
      mode: '14',           // '14' 紧凑 / '20' 温和
      totalQuizScore: 0,    // 总混合测验得分
      totalQuizDone: false  // 总混合测验是否已完成
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        s.doneUnits = s.doneUnits || {};
        s.quizScores = s.quizScores || {};
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

  var toast = function (msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 1800);
  };

  /* 语音朗读 */
  var speechOK = ('speechSynthesis' in window);
  function speak(text, rate) {
    if (!speechOK) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = rate || 0.92;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  }

  /* ---------------- 模块定义 ---------------- */
  var MODULES = [
    { idx: 1, key: 'flashcard', kanji: '単', name: '副词总览', label: 'Flashcard' },
    { idx: 2, key: 'example',   kanji: '例', name: '例句 + 辨析', label: 'Examples' },
    { idx: 3, key: 'reading',   kanji: '読', name: 'N2 短篇阅读', label: 'Reading' },
    { idx: 4, key: 'listening', kanji: '聴', name: '听力模拟', label: 'Listening' },
    { idx: 5, key: 'quiz',      kanji: '測', name: '单元测验', label: 'Quiz' },
    { idx: 6, key: 'summary',   kanji: '纏', name: '单元小结', label: 'Summary' }
  ];

  /* ---------------- 导航 ---------------- */
  function renderNav() {
    var nav = $('#nav');
    var currentUnit = getCurrentUnit();
    nav.innerHTML = D.UNITS.map(function (u, i) {
      var unlocked = i <= state.unitIdx;
      var active = currentUnit && currentUnit.id === u.id;
      var done = state.doneUnits[u.id] && Object.keys(state.doneUnits[u.id]).length >= MODULES.length;
      return '<div class="nav-item' + (active ? ' active' : '') + (!unlocked ? ' locked' : '') + '" data-unit="' + i + '">' +
        '<span class="nav-kanji">' + (i + 1) + '</span>' +
        '<span class="nav-name">' + esc(u.title) + '</span>' +
        (done ? '<span class="nav-badge">✓</span>' : (unlocked ? '' : '<span class="nav-badge lock">🔒</span>')) +
        '</div>';
    }).join('');
    $$('.nav-item', nav).forEach(function (el) {
      el.addEventListener('click', function () {
        var idx = +el.getAttribute('data-unit');
        if (idx <= state.unitIdx) {
          state.unitIdx = idx;
          saveState();
          location.hash = '#/unit';
          closeSidebar();
        } else {
          toast('请先完成前面的单元');
        }
      });
    });
  }

  /* ---------------- 视图路由 ---------------- */
  function currentView() {
    var h = location.hash || '#/home';
    var key = h.replace('#/', '').split('?')[0];
    return key;
  }
  function renderView() {
    var views = $$('.view');
    var cur = currentView();
    views.forEach(function (v) { v.classList.toggle('active', v.getAttribute('data-view') === cur); });
    renderNav();
    if (cur === 'home') renderHome();
    else if (cur === 'unit') renderUnit();
    else if (cur === 'quiz') renderTotalQuiz();
    else renderHome();
  }
  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#overlay').classList.remove('show');
  }

  /* ---------------- 状态辅助 ---------------- */
  function getCurrentUnit() { return D.UNITS[state.unitIdx]; }
  function isModuleDone(unitId, moduleIdx) {
    return state.doneUnits[unitId] && state.doneUnits[unitId][moduleIdx];
  }
  function completeModule(moduleIdx) {
    var unit = getCurrentUnit();
    state.doneUnits[unit.id] = state.doneUnits[unit.id] || {};
    var arr = state.doneUnits[unit.id];
    if (!arr[moduleIdx]) {
      arr[moduleIdx] = true;
      var doneCount = Object.keys(arr).length;
      if (doneCount >= MODULES.length && state.unitIdx < D.UNITS.length - 1) {
        state.unitIdx = Math.max(state.unitIdx, Math.min(state.unitIdx + 1, D.UNITS.length - 1));
        toast('🎉 单元完成！已解锁下一单元');
      } else {
        toast('✅ 模块完成');
      }
      saveState();
      renderView();
    }
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    var v = $('#view-home');
    var totalDone = Object.keys(state.doneUnits).length;
    var totalAdvLearned = 0;
    Object.keys(state.doneUnits).forEach(function (uid) {
      var unit = D.UNITS.find(function (u) { return u.id === uid; });
      if (unit && state.doneUnits[uid][6]) totalAdvLearned += unit.adverbs.length;
    });
    var percent = Math.round(totalDone / D.UNITS.length * 100);

    v.innerHTML =
      '<div class="hero">' +
        '<div class="kicker">N1 ADVERBS · CLOSED-LOOP LEARNING</div>' +
        '<h1>核心副词 300 · 场景化闭环</h1>' +
        '<p>拒绝死记单个中文释义，按语义场景分组，每组 6 个学习模块：副词闪卡 → 例句辨析 → N2 短篇阅读 → 听力模拟 → 单元测验 → 小结。</p>' +
        '<div class="hero-actions">' +
          '<button class="btn primary" id="startBtn">从「' + esc(getCurrentUnit().title) + '」开始</button>' +
          (state.totalQuizDone ? '<button class="btn indigo" id="totalQuizBtn">📊 总混合大测验</button>' : '') +
        '</div>' +
      '</div>' +

      '<div class="stats-row">' +
        stat('学习进度', totalDone + ' / ' + D.UNITS.length + ' 单元', percent + '%') +
        stat('已完成模块', countTotalModules() + ' 个', '累计') +
        stat('已掌握副词', totalAdvLearned + ' 个', '约数') +
        stat('总测验', state.totalQuizDone ? '已完成' : '未解锁', state.totalQuizDone ? state.totalQuizScore + ' 分' : '完成全部单元后解锁') +
      '</div>' +

      '<div class="view-head"><div class="kicker">UNITS</div><div class="view-title">学习单元一览</div></div>' +
      '<div class="unit-grid">' + D.UNITS.map(function (u, i) {
        var unlocked = i <= state.unitIdx;
        var done = state.doneUnits[u.id] && Object.keys(state.doneUnits[u.id]).length >= MODULES.length;
        return '<div class="unit-card' + (!unlocked ? ' locked' : '') + (done ? ' done' : '') + '" data-go="' + i + '">' +
          '<div class="uc-head">' +
            '<div class="uc-day">第' + (i + 1) + '日</div>' +
            '<div>' +
              '<div class="uc-title">' + esc(u.title) + '</div>' +
              '<div class="uc-cat">' + esc(getCategoryName(u.category)) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="uc-count">📚 ' + u.adverbs.length + ' 个副词 · 6 模块闭环</div>' +
          '<div class="uc-seal"></div>' +
        '</div>';
      }).join('') + '</div>';

    $('#startBtn').addEventListener('click', function () { location.hash = '#/unit'; });
    if ($('#totalQuizBtn')) $('#totalQuizBtn').addEventListener('click', function () { location.hash = '#/quiz'; });
    $$('[data-go]', v).forEach(function (el) {
      el.addEventListener('click', function () {
        var idx = +el.getAttribute('data-go');
        state.unitIdx = idx;
        saveState();
        location.hash = '#/unit';
      });
    });
  }

  function stat(lbl, num, sub) {
    return '<div class="stat"><div class="num">' + esc(num) + '</div><div class="lbl">' + esc(lbl) + ' · ' + esc(sub) + '</div></div>';
  }
  function countTotalModules() {
    var c = 0;
    Object.keys(state.doneUnits).forEach(function (uid) {
      c += Object.keys(state.doneUnits[uid]).length;
    });
    return c;
  }
  function getCategoryName(id) {
    var cat = D.CATEGORIES.find(function (c) { return c.id === id; });
    return cat ? cat.name : id;
  }

  /* ---------------- 单元页面 ---------------- */
  // renderUnit(forceModIdx): 渲染整个单元页，如果传了 forceModIdx 就强制渲染那个模块
  function renderUnit(forceModIdx) {
    var v = $('#view-unit');
    var unit = getCurrentUnit();
    if (!unit) { renderHome(); return; }

    // 决定当前渲染哪个模块
    var modIdx = forceModIdx || currentModuleIdx();

    // 一次性构建完整 HTML 字符串
    var html =
      '<div class="view-head">' +
        '<div class="kicker">UNIT ' + (state.unitIdx + 1) + ' / ' + D.UNITS.length + ' · ' + esc(getCategoryName(unit.category)) + '</div>' +
        '<div class="view-title">' + esc(unit.title) + '</div>' +
        '<div class="view-desc">' + esc(unit.adverbs.length) + ' 个副词 · 按 6 模块闭环学习 · 拒绝死记硬背</div>' +
      '</div>' +
      buildModuleProgress(unit, modIdx) +
      buildModuleContent(unit, modIdx);

    v.innerHTML = html;

    // 一次性绑定所有事件
    bindUnitEvents(unit, modIdx);
  }

  function buildModuleProgress(unit, curIdx) {
    return '<div class="module-progress">' + MODULES.map(function (m) {
      var done = isModuleDone(unit.id, m.idx);
      return '<div class="mp-step' + (curIdx === m.idx ? ' active' : '') + (done ? ' done' : '') + '" data-mod="' + m.idx + '">' +
        '<span class="mp-kanji">' + m.kanji + '</span>' + m.name +
      '</div>';
    }).join('') + '</div>';
  }

  function currentModuleIdx() {
    var unit = getCurrentUnit();
    var done = state.doneUnits[unit.id] || {};
    for (var i = 1; i <= 6; i++) if (!done[i]) return i;
    return 1;
  }

  /* ---------------- 构建某个模块的 HTML 字符串（有 return） ---------------- */
  function buildModuleContent(unit, modIdx) {
    var body = '';
    switch (modIdx) {
      case 1: body = buildFlashcard(unit); break;
      case 2: body = buildExample(unit); break;
      case 3: body = buildReading(unit); break;
      case 4: body = buildListening(unit); break;
      case 5: body = buildQuizStart(unit); break;
      case 6: body = buildSummary(unit); break;
      default: body = '<div class="card"><p>模块不存在</p></div>';
    }
    var done = isModuleDone(unit.id, modIdx);
    return body +
      '<div style="margin-top:26px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
        '<button class="btn primary" id="completeModBtn">' + (done ? '✓ 本模块已完成' : '完成本模块') + '</button>' +
        '<button class="btn ghost" id="prevModBtn">← 上一模块</button>' +
        '<button class="btn" id="nextModBtn">下一模块 →</button>' +
      '</div>';
  }

  /* ---------------- 统一事件绑定 ---------------- */
  function bindUnitEvents(unit, modIdx) {
    var v = $('#view-unit');
    // 模块进度条点击
    $$('.mp-step', v).forEach(function (el) {
      el.addEventListener('click', function () {
        var target = +el.getAttribute('data-mod');
        var maxAllowed = currentModuleIdx();
        if (isModuleDone(unit.id, target) || target <= maxAllowed || target === modIdx) {
          renderUnit(target);
        } else {
          toast('请先完成前面的模块');
        }
      });
    });
    // 完成按钮
    var doneBtn = $('#completeModBtn');
    if (doneBtn) doneBtn.addEventListener('click', function () { completeModule(modIdx); });
    // 上一 / 下一 模块
    var prevBtn = $('#prevModBtn');
    var nextBtn = $('#nextModBtn');
    if (prevBtn) prevBtn.addEventListener('click', function () {
      if (modIdx > 1) renderUnit(modIdx - 1);
      else toast('已是第一模块');
    });
    if (nextBtn) nextBtn.addEventListener('click', function () {
      if (modIdx < 6) renderUnit(modIdx + 1);
      else toast('已是最后模块');
    });
    // 测验模块的「开始答题」按钮
    var startQ = $('#startQuizBtn');
    if (startQ) startQ.addEventListener('click', function () { startQuizFlow(unit); });
    // 読模块专属事件绑定（Module 3：阅读理解 4 选一）
    if (modIdx === 3) bindReadingEvents(v, unit);
    // 聴模块专属事件绑定（Module 4）
    if (modIdx === 4) bindListeningEvents(v, unit);
  }

  /* ---- 読模块 4 选一事件绑定 ---- */
  function bindReadingEvents(v, unit) {
    // 🔑 直接读 render 时存好的缓存，不再重新 build（避免 shuffle 两次错位）
    if (!_readingCache) return;
    var allQs = _readingCache.allQs;

    // 给每个 rd-opt 按钮绑事件
    $$('.rd-q', v).forEach(function (qDiv, qi) {
      var realQ = allQs[qi];
      if (!realQ) return;
      $$('.rd-opt', qDiv).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var picked = +btn.getAttribute('data-opt');
          var opts = $$('.rd-opt', qDiv);
          opts.forEach(function (o) { o.disabled = true; });
          opts[realQ.ans].classList.add('correct');
          if (picked !== realQ.ans) btn.classList.add('wrong');
          var fb = $('.rd-feedback', qDiv);
          fb.textContent = (picked === realQ.ans ? '正解！' : '不正解。正解：' + realQ.opts[realQ.ans]);
          fb.classList.add(picked === realQ.ans ? 'ok' : 'no');
        });
      });
    });
  }

  /* ---------------- Module 1: 闪卡 ---------------- */
  function buildFlashcard(unit) {
    var cards = unit.adverbs.map(function (a) {
      return '<div class="adverb-card" data-word="' + esc(a.word) + '">' +
        '<div class="ac-word">' + esc(a.word) + '</div>' +
        (a.reading ? '<div class="ac-reading">【' + esc(a.reading) + '】</div>' : '') +
        '<div class="ac-meaning">' + esc(a.meaning) + '</div>' +
        '<div class="ac-nuance">💡 ' + esc(a.nuance || '语感待补充') + '</div>' +
      '</div>';
    }).join('');
    return '<div class="card">' +
      '<div class="card-title"><span class="t-kanji">単</span>本单元副词总览（' + unit.adverbs.length + ' 个）</div>' +
      '<div class="tip-box" style="margin-bottom:16px;">' +
        '点击卡片可听日语朗读。<strong>语感限制</strong>优先于中文翻译——比如「ろくに」只用于否定句，记住这点比只背"好好地"有用一百倍。' +
      '</div>' +
      '<div class="adverb-grid">' + cards + '</div>' +
    '</div>';
  }

  /* ---------------- Module 2: 例句 + 辨析 ---------------- */
  function buildExample(unit) {
    var examplesHtml = unit.adverbs.map(function (a) {
      var ex = (a.examples && a.examples[0]) || ['（例句待补充）', ''];
      return '<div class="grammar-block">' +
        '<div class="g-title">' +
          '<span class="g-icon">副</span>' +
          '<span class="g-word">' + esc(a.word) + '</span>' +
          (a.reading ? '<span class="g-read">【' + esc(a.reading) + '】</span>' : '') +
          '<span class="g-mean">' + esc(a.meaning || '') + '</span>' +
          '<button class="speak-mini" data-spk="' + esc(a.word) + '" title="朗读">🔊</button>' +
        '</div>' +
        '<div class="g-jp">「' + esc(ex[0]) + '」</div>' +
        '<div class="g-zh">' + esc(ex[1]) + '</div>' +
        '<div class="g-note">💡 语感：' + esc(a.nuance || '—') + '</div>' +
      '</div>';
    }).join('');

    // 找对应的辨析表
    var comparisons = D.COMPARISONS;
    var unitComparisons = comparisons.filter(function (c) {
      return unit.adverbs.some(function (a) { return c.title.indexOf(a.word) >= 0 || a.word.indexOf(c.title.split('「')[1] ? '' : '') >= 0; });
    });
    if (unitComparisons.length === 0) {
      // 找 G 组对应
      var groupKey = unit.adverbs.length > 0 ? findGroupKey(unit.adverbs[0].word) : '';
      unitComparisons = comparisons.filter(function (c) { return c.group === groupKey; });
    }

    var compHtml = '';
    if (unitComparisons.length > 0) {
      compHtml = '<div class="card" style="margin-top:20px;">' +
        '<div class="card-title"><span class="t-kanji">辨</span>高频易混副词对比</div>' +
        unitComparisons.map(function (c) {
          return '<div style="margin-bottom:18px;">' +
            '<div style="font-weight:700;color:var(--vermilion);margin-bottom:10px;">' + esc(c.title) + '</div>' +
            '<table class="compare-table"><thead><tr><th style="width:20%">副词A</th><th style="width:20%">副词B</th><th>差异要点</th></tr></thead><tbody>' +
            c.pairs.map(function (p) {
              return '<tr>' +
                '<td class="ct-word">' + esc(p.a) + '</td>' +
                '<td class="ct-word">' + esc(p.b) + '</td>' +
                '<td>' + esc(p.hint) + '</td>' +
              '</tr>';
            }).join('') +
            '</tbody></table></div>';
        }).join('') +
      '</div>';
    }

    return '<div class="card">' +
      '<div class="card-title"><span class="t-kanji">例</span>例句 + 语感辨析</div>' +
      '<div class="tip-box" style="margin-bottom:16px;">同样是"终于"，<strong>ついに/とうとう/ようやく</strong>语感完全不同——这是日语副词的最大陷阱。</div>' +
      examplesHtml +
    '</div>' + compHtml;
  }

  function findGroupKey(word) {
    var keys = Object.keys(D.ADVERBS);
    for (var i = 0; i < keys.length; i++) {
      if (D.ADVERBS[keys[i]].some(function (a) { return a.word === word; })) return keys[i];
    }
    return '';
  }

  /* ---------------- Module 3: 阅读 ---------------- */
  // render 时算一次、绑定时复用：避免 shuffle 两次导致数据错位
  var _readingCache = null;
  function buildReading(unit) {
    // ---------- 短篇 ----------
    var sHtml = '';
    var allAdvs = unit.adverbs.slice();
    var quizShort = [];
    var quizMid = [];

    if (unit.readings && unit.readings.length > 0) {
      var s = unit.readings[0];
      var sHL = highlightAdverbs(s.jp, allAdvs);

      // 将数据里的 {q, a} 问答题 升级为 4 选一
      quizShort = buildReadingQuiz(s, allAdvs, 3);
      sHtml = renderReadingBlock('N2 短篇阅读（嵌有本组副词）', sHL, s.zh, quizShort, '短篇 · 约 200 字');
    } else {
      sHtml = '<div class="card"><div class="card-title"><span class="t-kanji">読</span>N2 短篇阅读</div>' +
        '<p style="color:var(--ink-soft);">本单元暂无数据，先看下一模块 🔄</p></div>';
    }

    // ---------- 中篇（自动生成，约 350 字，嵌多个副词） ----------
    var midAdverbs = allAdvs.slice(0, Math.min(8, allAdvs.length));
    var midJp = autoGenMediumPassage(unit, midAdverbs);
    var midHL = highlightAdverbs(midJp, midAdverbs);
    var midData = { jp: midJp };
    quizMid = buildReadingQuiz(midData, midAdverbs, 3);
    var mHtml = renderReadingBlock('N2 中篇阅读（自动生成 · 嵌有本组副词）', midHL, null, quizMid, '中篇 · 约 350 字');

    // 🔑 把算好的 quiz 存到模块级缓存，bind 时直接读，不再重新 shuffle
    _readingCache = { short: quizShort, mid: quizMid, allQs: quizShort.concat(quizMid) };

    return sHtml + mHtml;
  }

  /* 辅助：给副词加高亮 */
  function highlightAdverbs(text, adverbs) {
    var r = text;
    adverbs.forEach(function (a) {
      var re = new RegExp(escapeRegExp(a.word), 'g');
      r = r.replace(re, '<span class="hl">' + a.word + '</span>');
    });
    return r;
  }
  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* 核心：把短文变成 4 选一（取目标副词 → 正确选项=含该副词的句 → 干扰=其他副词句） */
  function buildReadingQuiz(passageData, pool, count) {
    var targetAdvs = shuffleArray(pool.slice()).slice(0, Math.min(count, pool.length));
    return targetAdvs.map(function (adv) {
      // 正确选项 = 包含副词的"完整句子/短语"（参考 adv 的例句）
      var ex = (adv.examples && adv.examples[0]) || [adv.word + 'の例文（略）', ''];
      var correctSent = ex[0] || (adv.word + ' を使った表現');

      // 3 个干扰项 = 同单元其他副词的例句
      var distractors = shuffleArray(pool.filter(function (a) { return a.word !== adv.word; })).slice(0, 3);
      var distSentences = distractors.map(function (a) {
        var e = (a.examples && a.examples[0]) || [a.word + 'の例文（略）', ''];
        return e[0];
      });

      var allOpts = shuffleArray([correctSent].concat(distSentences));
      var ansIdx = allOpts.indexOf(correctSent);

      return {
        q: '「' + adv.word + '」が使われている箇所と、最も意味の近い文はどれ？',
        opts: allOpts,
        ans: ansIdx,
        adv: adv
      };
    });
  }

  /* 辅助：通用阅读块渲染（4 选一版） */
  function renderReadingBlock(title, jpHL, zh, questions, sub) {
    var qaHtml = questions.map(function (q, i) {
      return '<div class="rd-q">' +
        '<div class="rd-qnum">Q' + (i + 1) + '</div>' +
        '<div class="rd-qbody">' + esc(q.q) + '</div>' +
        '<div class="rd-opts">' + q.opts.map(function (o, oi) {
          var letter = String.fromCharCode(65 + oi);
          return '<button class="rd-opt" data-qi="' + i + '" data-opt="' + oi + '">' +
            '<span class="rd-let">' + letter + '</span> ' + esc(o) +
          '</button>';
        }).join('') + '</div>' +
        '<div class="rd-feedback" data-qi="' + i + '"></div>' +
      '</div>';
    }).join('');

    return '<div class="card">' +
      '<div class="card-title"><span class="t-kanji">読</span>' + title +
        '<span class="tag indigo" style="margin-left:10px;">' + esc(sub) + '</span></div>' +
      '<div class="read-passage">' + jpHL + '</div>' +
      (zh ? '<div class="read-trans">📖 ' + esc(zh) + '</div>' : '') +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title"><span class="t-kanji">問</span>阅读理解确认（4 选一）</div>' +
      '<div class="tip-box" style="margin-bottom:14px;">下の4つの文から、最も適切なものを一つ選ぼう。</div>' +
      qaHtml +
    '</div>';
  }

  /* 辅助：自动拼中篇 */
  function autoGenMediumPassage(unit, picks) {
    var w = picks.map(function (a) { return a.word; });
    var p1 = '先日、友達と久しぶりに会った。彼は仕事が大変だと言っていたが、_____笑顔で話してくれた。';
    var p2 = '私も昔、忙しい時期があったので、気持ちはよくわかる。_____無理をしすぎると、後でひどい目に合う。';
    var p3 = 'とはいえ、休みを取ったり趣味に没頭したりする時間も大切だ。_____自分を労わる時間を作るようにしている。';
    var p4 = 'その日は結局、夕方までカフェでおしゃべりを続けた。_____解散した後も、心が温かかった。';
    var p5 = 'こうした小さな時間が、私たちの日々を豊かにしてくれるのだと思う。';
    var blanks = [w[0] || 'とうとう', w[1] || 'むしろ', w[2] || 'せっかく', w[3] || 'ほっと'];
    return [p1, p2, p3, p4, p5].join('\n\n').replace('_____', blanks[0]).replace('_____', blanks[1]).replace('_____', blanks[2]).replace('_____', blanks[3]);
  }

  /* ---------------- Module 4: 听力模拟 ---------------- */
  // render 时算一次、绑定时复用
  var _listeningCache = null;
  // 统一朗读图标（SVG，避免 emoji 不一致）
  var ICON_PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>';

  function buildListening(unit) {
    // 1) JLPT 会话 3 道：问句 + 完整句子选项
    var diaQs = buildDiaQuestions(unit);
    var diaHtml = '<div class="card">' +
      '<div class="card-title"><span class="t-kanji">聴</span>听力模拟 ① · JLPT 会话理解（4 选一）</div>' +
      '<div class="tip-box" style="margin-bottom:16px;">会話を読んで、下の問いに対する最も適切な答えを一つ選ぶ。選択肢はすべて日本語。</div>';
    diaQs.forEach(function (q, i) {
      diaHtml += '<div class="ls-block" data-li="' + i + '">' +
        '<div class="listen-card"><div class="ls-label">会話 ' + (i + 1) + '</div>' + esc(q.dialogue) + '</div>' +
        '<div class="ls-question">Q' + (i + 1) + '. ' + esc(q.question) + '</div>' +
        '<div class="ls-opts">' + q.opts.map(function (o, oi) {
          var letter = String.fromCharCode(65 + oi);
          return '<button class="ls-opt" data-oi="' + oi + '"><span class="rd-let">' + letter + '</span> ' + esc(o) + '</button>';
        }).join('') + '</div>' +
        '<div class="ls-feedback"></div>' +
      '</div>';
    });
    diaHtml += '</div>';

    // 2) 先听后选 6 道：问句 + 完整句子选项（默认隐藏文字）
    var qa = buildOralQA(unit);
    var qaHtml = '<div class="card">' +
      '<div class="card-title"><span class="t-kanji">応</span>听力模拟 ② · 先听后选（一问一答）</div>' +
      '<div class="qv-note">文字はデフォルト非表示。青い丸ボタンを押して問いを聞き、右下の小さい丸で各選択肢を聞こう。番号を選んで最後に「文字を表示」で答え合わせ。</div>' +
      qa.map(function (q, qi) {
        return '<div class="qv-block" data-qi="' + qi + '">' +
          '<div class="qv-q">' +
            '<button class="play small" id="qvQ' + qi + '" aria-label="音声を聞く">' + ICON_PLAY + '</button>' +
            '<span class="qv-qhint">第 ' + (qi + 1) + ' 問 · クリックで問いを聞く</span>' +
          '</div>' +
          '<div class="qv-opts">' + q.opts.map(function (o, j) {
            return '<div class="qv-opt-row" data-opt="' + j + '">' +
              '<button class="qv-opt" data-opt="' + j + '">' + (j + 1) + '</button>' +
              '<button class="qv-play" data-opt="' + j + '" aria-label="選択肢を聞く">' + ICON_PLAY + '</button>' +
              '<span class="qv-otext hidden">' + esc(o) + '</span>' +
            '</div>';
          }).join('') + '</div>' +
          '<div class="qv-qtext hidden"><div class="rd-qnum">Q' + (qi + 1) + '</div>' + esc(q.q) + '</div>' +
          '<div class="qv-feedback"></div>' +
        '</div>';
      }).join('') +
      '<button class="btn" id="showQAtext">文字を表示して答え合わせ</button>' +
    '</div>';

    // 🔑 把算好的题存到缓存，bind 时直接读
    _listeningCache = { diaQs: diaQs, qas: qa };

    return diaHtml + qaHtml;
  }

  /* ---- JLPT 会话题（3 道 · 问句 + 完整句子选项） ---- */
  function buildDiaQuestions(unit) {
    var picks = shuffleArray(unit.adverbs.slice()).slice(0, Math.min(3, unit.adverbs.length));
    var dialogues = [
      'A: 最近どう？調子は？\nB: うーん、先週までは順調だったんだけど、今週はとうとう忙しくてね。\nA: 大丈夫？無理しないでね。',
      'A: あの件、どうなった？\nB: 彼に頼んだんだけど、いまだに返事がないんだ。\nA: じゃあ、こちらから連絡してみようか。',
      'A: 明日の集合時間、何時だっけ？\nB: えっと、とりあえず9時だったと思う。\nA: 了解。じゃあ、時間通りにね。',
      'A: あの先生、また遅れてきたね。\nB: 本当、全くだよ。\nA: でも怒らないで。'
    ];
    return picks.map(function (adv, i) {
      // 问题：围绕这个副词的用法
      var question = '会話の中で使われている「' + adv.word + '」に最も近い内容はどれ？';
      // 正确选项 = 包含该副词例句（完整句子）
      var ex = (adv.examples && adv.examples[0]) || [adv.word + 'は状況を強調する。', ''];
      var correctSent = ex[0];
      // 干扰项 = 同单元其他副词的例句
      var distractors = shuffleArray(unit.adverbs.filter(function (a) { return a.word !== adv.word; })).slice(0, 3);
      var distSents = distractors.map(function (a) {
        var e = (a.examples && a.examples[0]) || [a.word + 'についての例文。', ''];
        return e[0];
      });
      var allOpts = shuffleArray([correctSent].concat(distSents));
      return {
        dialogue: dialogues[i % dialogues.length],
        question: question,
        opts: allOpts,
        ans: allOpts.indexOf(correctSent)
      };
    });
  }

  /* ---- 先听后选（6 道 · 问句 + 完整句子选项） ---- */
  function buildOralQA(unit) {
    var picks = shuffleArray(unit.adverbs.slice()).slice(0, Math.min(6, unit.adverbs.length));
    // 问句：四个选项都用「这个副词」，但只有一句用对了
    return picks.map(function (adv, i) {
      var question = '「' + adv.word + '」が使われている文の中で、最も自然なのはどれ？';
      // 正确选项 = 该副词的真实例句
      var ex = (adv.examples && adv.examples[0]) || [adv.word + ' を使った例文。', ''];
      var correctSent = ex[0];
      // 3 个干扰项 = 同样用这个副词，但场景明显不对
      var wrongSents = buildWrongUsages(adv, 3);
      var allOpts = shuffleArray([correctSent].concat(wrongSents));
      return { q: question, opts: allOpts, ans: allOpts.indexOf(correctSent) };
    });
  }

  /* 核心：给一个副词，生成 3 个"用了它但明显不对"的句子 */
  function buildWrongUsages(adv, count) {
    var w = adv.word;
    var n = adv.nuance || '';
    var m = adv.meaning || '';
    var category = adv.category || '';
    var results = [];

    // --- 规则 1：书面语副词 → 放进日常闲聊场景 ---
    if (/書面|公文|命令式|硬い|あらたまっ|公的/.test(n + m)) {
      results.push('「' + w + '」おはよう！今日もいい天気だね。');
    } else if (/口語|日常|くだけた/.test(n + m)) {
      results.push('会議室にて、「' + w + '」ご報告いたします。');
    }

    // --- 规则 2：负面/反诘/惊讶语感副词 → 放进正面/赞美场景 ---
    if (/否定|反語|驚き|批判|遅すぎ|意外|不信|不満|まさか/.test(n + m)) {
      results.push('あの料理は「' + w + '」美味しくて、おかわりしちゃった！');
    } else if (/肯定|強調|ぴったり|完璧/.test(n + m)) {
      results.push('今日のテストは「' + w + '」難しすぎて、全然わからなかった。');
    }

    // --- 规则 3：时间类副词 → 放到明显矛盾的时间场景 ---
    if (category === 'time' || /時間|時|遅い|早い|今|以前|以降/.test(n + m)) {
      results.push('明日の朝、「' + w + '」出かけるので、準備よろしく。');
    }

    // --- 规则 4：程度/频率类副词 → 放到不适合修饰的词上 ---
    if (category === 'degree' || category === 'frequency' || /程度|頻度|とても|少し|全く|ほとんど/.test(n + m)) {
      results.push('この本は「' + w + '」ページがある。');  // 修饰数量词（程度副词不适用）
    }

    // --- 规则 5：拟态副词 → 放到和"样子/动作"无关的场景 ---
    if (category === 'mimic' || /様子|動作|音|光|ゆっくり|急いで/.test(n + m)) {
      results.push('来週の予定は「' + w + '」決まった。');  // 拟态修饰"决定"不自然
    }

    // --- 规则 6：心理/态度副词 → 放到客观事实描述 ---
    if (category === 'attitude' || /気持ち|態度|勇気|無理/.test(n + m)) {
      results.push('地球は「' + w + '」丸いです。');
    }

    // 兜底：通用错误模板（什么副词都能套）
    var fallbackTemplates = [
      '数学の公式は「' + w + '」覚えられない。',
      '郵便番号は「' + w + '」1234567だ。',
      '猫は「' + w + '」魚を好きだ。',
      '日本の首都は「' + w + '」東京である。',
      '1+1は「' + w + '」2です。',
      '音楽を聞きながら、「' + w + '」勉強するのが好きだ。',
      '彼の誕生日に「' + w + '」プレゼントをあげた。',
      'スマホの充電が「' + w + '」切れてしまった。',
      '来月、「' + w + '」海外へ旅行に行く予定だ。',
      '図書館で「' + w + '」本を借りた。',
    ];

    // 如果上面规则不够 count 个，就从兜底模板里补（确保不重复）
    var seen = {};
    results = results.filter(function (r) { seen[r] = true; return true; });
    var fidx = 0;
    while (results.length < count && fidx < fallbackTemplates.length) {
      var f = fallbackTemplates[fidx++];
      if (!seen[f]) { results.push(f); seen[f] = true; }
    }
    // 还是不够就用占位符
    while (results.length < count) results.push('（誤用例）「' + w + '」の使い方が不自然な文。');

    return results.slice(0, count);
  }

  /* ---- 聴模块事件绑定 ---- */
  function bindListeningEvents(v, unit) {
    // 🔑 直接读 render 时存好的缓存，不再重新 build（避免 shuffle 两次错位）
    if (!_listeningCache) return;
    var diaQs = _listeningCache.diaQs;
    var qas = _listeningCache.qas;

    // JLPT 会话单选题
    $$('.ls-block', v).forEach(function (block) {
      var li = +block.getAttribute('data-li');
      var q = diaQs[li];
      $$('.ls-opt', block).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var picked = +btn.getAttribute('data-oi');
          $$('.ls-opt', block).forEach(function (o) { o.disabled = true; });
          $$('.ls-opt', block)[q.ans].classList.add('correct');
          if (picked !== q.ans) btn.classList.add('wrong');
          var fb = $('.ls-feedback', block);
          fb.textContent = (picked === q.ans ? '正解！' : '不正解。正解：' + q.opts[q.ans]);
          fb.classList.add(picked === q.ans ? 'ok' : 'no');
        });
        btn.addEventListener('dblclick', function () { speak(btn.textContent.replace(/^[A-Z]\s*/, '')); });
      });
    });

    // 先听后选：点序号选中
    $$('.qv-opt', v).forEach(function (b) {
      b.addEventListener('click', function () {
        var block = b.closest('.qv-block');
        var row = b.closest('.qv-opt-row');
        $$('.qv-opt-row', block).forEach(function (r) { r.classList.remove('selected'); });
        row.classList.add('selected');
      });
    });
    // 先听后选：播放问句
    qas.forEach(function (q, qi) {
      var qb = document.getElementById('qvQ' + qi);
      if (qb) qb.addEventListener('click', function () { speak(q.q); });
    });
    // 先听后选：播放选项
    $$('.qv-play', v).forEach(function (b) {
      b.addEventListener('click', function () {
        var qi = +b.closest('.qv-block').getAttribute('data-qi');
        var oi = +b.getAttribute('data-opt');
        speak(qas[qi].opts[oi]);
      });
    });
    // 显示文字 + 判对错
    var showBtn = document.getElementById('showQAtext');
    if (showBtn) showBtn.addEventListener('click', function () {
      $$('.qv-block', v).forEach(function (block) {
        var qi = +block.getAttribute('data-qi');
        var q = qas[qi];
        block.querySelector('.qv-qtext').classList.remove('hidden');
        $$('.qv-otext', block).forEach(function (t) { t.classList.remove('hidden'); });
        var sel = block.querySelector('.qv-opt-row.selected');
        var fb = block.querySelector('.qv-feedback');
        var oi = sel ? +sel.getAttribute('data-opt') : -1;
        if (sel && oi === q.ans) { sel.classList.add('correct'); fb.textContent = '正解！'; fb.classList.add('ok'); }
        else if (sel) { sel.classList.add('wrong'); fb.textContent = '不正解。正解：' + q.opts[q.ans]; fb.classList.add('no'); }
        else { fb.textContent = '正解：' + q.opts[q.ans]; fb.classList.add('no'); }
      });
      showBtn.disabled = true;
      showBtn.textContent = '文字を表示済み';
    });
  }

  // shuffleArray 已在上方 Module 3 定义过，删除下方重复的

  /* ---------------- Module 5: 单元测验 ---------------- */
  var quiz = { idx: 0, correct: 0, answered: false, questions: [], unit: null };

  // 测验入口卡片（放在单元的第 5 模块位置，只有"开始答题"按钮）
  function buildQuizStart(unit) {
    var questions = generateUnitQuiz(unit);
    quiz = { idx: 0, correct: 0, answered: false, questions: questions, unit: unit };
    return '<div class="card quiz-card">' +
      '<div class="card-title"><span class="t-kanji">測</span>单元测验</div>' +
      '<p style="color:var(--ink-soft);margin-bottom:16px;">共 ' + questions.length + ' 题 · 选择完成后立即判分</p>' +
      '<button class="btn primary" id="startQuizBtn">开始答题 🚀</button>' +
    '</div>';
  }

  // 点击"开始答题"按钮后，进入答题视图
  function startQuizFlow(unit) {
    quiz.idx = 0; quiz.correct = 0; quiz.answered = false;
    renderQuizQuestion();
  }

  function generateUnitQuiz(unit) {
    var picks = shuffleArray(unit.adverbs).slice(0, Math.min(8, unit.adverbs.length));
    var allWords = unit.adverbs.map(function (a) { return a.word; });
    var qs = [];
    picks.forEach(function (adv) {
      var distractors = shuffleArray(allWords.filter(function (w) { return w !== adv.word; })).slice(0, 3);
      var opts = shuffleArray([adv.word].concat(distractors));
      var ans = opts.indexOf(adv.word);
      qs.push({
        type: '填詞',
        q: '「' + adv.meaning + '」のニュアンスを持つ副詞はどれ？',
        opts: opts,
        ans: ans,
        adv: adv
      });
    });
    // 追加 2 道语感辨析题
    if (unit.adverbs.length >= 4) {
      var pair1 = shuffleArray(unit.adverbs).slice(0, 2);
      qs.push({
        type: '辨析',
        q: '「' + pair1[0].word + '」と「' + pair1[1].word + '」のニュアンス、どっちが正しい？',
        opts: [pair1[0].nuance || pair1[0].meaning, pair1[1].nuance || pair1[1].meaning, '两者完全相同', '都不对'],
        ans: 0,
        adv: pair1[0]
      });
    }
    return qs;
  }

  function startQuizUI(mode) { /* 已废弃，保留占位避免 undefined */ return ''; }

  // 测验答题 UI 事件委托在 view-unit 容器上
  function answerQuiz(optIdx) {
    if (quiz.answered) return;
    quiz.answered = true;
    var q = quiz.questions[quiz.idx];
    var v = $('#view-unit');
    var opts = $$('.quiz-opt', v);
    opts[q.ans].classList.add('correct');
    var isRight = optIdx === q.ans;
    if (isRight) quiz.correct += 1;
    else opts[optIdx].classList.add('wrong');

    // 更新进度
    var progress = Math.round((quiz.idx + 1) / quiz.questions.length * 100);
    $('#quizProgressFill').style.width = progress + '%';
    $('#quizCount').textContent = quiz.correct + ' 对';

    if (quiz.idx >= quiz.questions.length - 1) {
      setTimeout(function () { renderQuizResult(); }, 800);
    } else {
      setTimeout(function () {
        quiz.idx += 1;
        quiz.answered = false;
        renderQuizQuestion();
      }, 900);
    }
  }

  function renderQuizQuestion() {
    var v = $('#view-unit');
    var q = quiz.questions[quiz.idx];
    var progress = Math.round(quiz.idx / quiz.questions.length * 100);
    v.innerHTML =
      '<div class="view-head">' +
        '<div class="kicker">QUIZ · ' + (quiz.unit ? quiz.unit.title : '总混合测验') + '</div>' +
        '<div class="view-title">第 ' + (quiz.idx + 1) + ' / ' + quiz.questions.length + ' 题</div>' +
      '</div>' +
      '<div class="card quiz-card">' +
        '<div class="quiz-top"><div class="quiz-progress"><div class="fill" id="quizProgressFill" style="width:' + progress + '%"></div></div>' +
          '<span class="quiz-count" id="quizCount">' + quiz.correct + ' 对</span></div>' +
        '<div class="quiz-type">' + esc(q.type) + '</div>' +
        '<div class="quiz-q">' + esc(q.q) + '</div>' +
        '<div class="quiz-opts">' + q.opts.map(function (o, i) {
          return '<button class="quiz-opt" data-opt="' + i + '">' + esc(o) + '</button>';
        }).join('') + '</div>' +
      '</div>';
    $$('.quiz-opt', v).forEach(function (b) {
      b.addEventListener('click', function () { answerQuiz(+b.getAttribute('data-opt')); });
    });
  }

  function renderQuizResult() {
    var v = $('#view-unit');
    var pct = Math.round(quiz.correct / quiz.questions.length * 100);
    var pass = pct >= 60;
    if (quiz.unit) {
      state.quizScores[quiz.unit.id] = pct;
      saveState();
    }
    var html =
      '<div class="view-head">' +
        '<div class="kicker">QUIZ RESULT</div>' +
        '<div class="view-title">测验结束</div>' +
      '</div>' +
      '<div class="card quiz-card">' +
        '<div class="quiz-result">' +
          '<div class="result-seal">' + (pass ? '合' : '励') + '</div>' +
          '<h3>' + (pass ? '合格！' : '继续加油') + '</h3>' +
          '<p>答对 ' + quiz.correct + ' / ' + quiz.questions.length + ' 题 · 正确率 ' + pct + '%</p>' +
        '</div>' +
        '<div style="display:flex;gap:12px;justify-content:center;">' +
          '<button class="btn primary" id="backToUnit">返回单元</button>' +
          '<button class="btn" id="retryQuiz">重新测验</button>' +
        '</div>' +
      '</div>';
    v.innerHTML = html;
    $('#backToUnit').addEventListener('click', function () { renderView(); });
    $('#retryQuiz').addEventListener('click', function () {
      if (quiz.unit) {
        // 单元测验重开：重新生成题库
        quiz.questions = generateUnitQuiz(quiz.unit);
      }
      quiz.idx = 0; quiz.correct = 0; quiz.answered = false;
      renderQuizQuestion();
    });
  }

  /* ---------------- Module 6: 单元小结 ---------------- */
  function buildSummary(unit) {
    var tips = generateSummaryTips(unit);
    return '<div class="summary-box">' +
      '<h3>📝 本单元小结</h3>' +
      '<p style="font-size:16px;margin-bottom:16px;line-height:1.9;">' + esc(unit.summary) + '</p>' +
      '<ul>' + tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
    '</div>';
  }

  function generateSummaryTips(unit) {
    var tips = [];
    // 根据单元内容自动生成 2-4 条要点
    if (unit.category === 'time') {
      tips.push('「ついに」「とうとう」「ようやく」是 N1 最高频考点——务必记住语感差异');
      tips.push('「いまさら」「とっくに」「すでに」都表时间，但语气有微妙区别');
    } else if (unit.category === 'degree') {
      tips.push('「完全不」系列：まったく > 全然 > いっこう（后接否定时语感递减）');
      tips.push('程度副词要记住「限定用法」——比如「全然」基本只接否定');
    } else if (unit.category === 'mimic') {
      tips.push('拟态词是日语灵魂——同一状态有多个词，语感差别比意思更重要');
      tips.push('动作拟态(のろのろ/ぐずぐず)vs 神态拟态(にこにこ/うっとり)');
    } else if (unit.category === 'judge') {
      tips.push('让步副词「むしろ」「まして」「どうせ」——读解高频陷阱');
      tips.push('「あくまで」vs「しいて」——坚持 vs 勉强，语感完全不同');
    } else {
      tips.push('副词学习最大敌人是"都翻译成一样的中文"——记住语感优先');
      tips.push('每次遇到易混词，自己造两个例句对比一下');
    }
    // 针对本单元的具体建议
    if (unit.adverbs.length > 0) {
      var sample = unit.adverbs.slice(0, 3).map(function (a) { return a.word; }).join('·');
      tips.push('本单元 ' + sample + ' 等 ' + unit.adverbs.length + ' 个副词，建议隔天快速复习一次');
    }
    return tips.slice(0, 4);
  }

  /* ---------------- 总混合大测验 ---------------- */
  function renderTotalQuiz() {
    var v = $('#view-quiz');
    if (!state.totalQuizDone) {
      // 检查是否所有单元都完成了
      var allDone = D.UNITS.every(function (u) {
        var d = state.doneUnits[u.id];
        return d && Object.keys(d).length >= MODULES.length;
      });
      if (!allDone) {
        v.innerHTML = '<div class="card">' +
          '<div class="card-title"><span class="t-kanji">🔒</span>总混合大测验</div>' +
          '<p style="color:var(--ink-soft);">完成全部 ' + D.UNITS.length + ' 个学习单元的全部模块后解锁 🔓</p>' +
          '<button class="btn primary" onclick="location.hash=\'#/home\'">返回首页</button>' +
        '</div>';
        return;
      }
    }
    // 生成 20 题跨组混合测验
    var allAdv = [];
    D.UNITS.forEach(function (u) { u.adverbs.forEach(function (a) { allAdv.push(a); }); });
    var picks = shuffleArray(allAdv).slice(0, 20);
    var questions = picks.map(function (adv) {
      var distractors = shuffleArray(allAdv.filter(function (a) { return a.word !== adv.word; })).slice(0, 3).map(function (a) { return a.word; });
      var opts = shuffleArray([adv.word].concat(distractors));
      return {
        type: '跨组混合',
        q: '「' + adv.meaning + '」のニュアンスを持つ副詞はどれ？',
        opts: opts,
        ans: opts.indexOf(adv.word),
        adv: adv
      };
    });
    quiz = { lv: 0, idx: 0, correct: 0, answered: false, questions: questions, unit: null };

    v.innerHTML =
      '<div class="view-head">' +
        '<div class="kicker">FINAL CHALLENGE</div>' +
        '<div class="view-title">📊 总混合大测验</div>' +
        '<div class="view-desc">跨全部单元随机抽取 20 题 · 检验你的真实掌握程度</div>' +
      '</div>' +
      '<div class="card quiz-card">' +
        '<div class="quiz-top"><div class="quiz-progress"><div class="fill" id="quizProgressFill" style="width:0%"></div></div>' +
          '<span class="quiz-count" id="quizCount">0 对</span></div>' +
        '<div class="quiz-type">' + esc(quiz.questions[0].type) + '</div>' +
        '<div class="quiz-q">' + esc(quiz.questions[0].q) + '</div>' +
        '<div class="quiz-opts">' + quiz.questions[0].opts.map(function (o, i) {
          return '<button class="quiz-opt" data-opt="' + i + '">' + esc(o) + '</button>';
        }).join('') + '</div>' +
        '<div style="margin-top:18px"><button class="btn ghost" onclick="location.hash=\'#/home\'">退出测验</button></div>' +
      '</div>';

    $$('.quiz-opt', v).forEach(function (b) {
      b.addEventListener('click', function () { answerQuiz(+b.getAttribute('data-opt')); });
    });
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    if (!location.hash) location.hash = '#/home';
    ['brandHome', 'goHome', 'goHomeTop'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function () { location.hash = '#/home'; closeSidebar(); });
    });
    $('#hamburger').addEventListener('click', function () {
      $('#sidebar').classList.add('open');
      $('#overlay').classList.add('show');
    });
    $('#overlay').addEventListener('click', closeSidebar);

    // 事件委托：模块内的测验按钮、朗读等
    document.addEventListener('click', function (e) {
      // 闪卡朗读
      if (e.target.closest('.adverb-card')) {
        var card = e.target.closest('.adverb-card');
        var word = card.getAttribute('data-word');
        if (word) speak(word);
      }
      // 🔊 朗读按钮
      if (e.target.closest('[data-spk]')) {
        var spk = e.target.closest('[data-spk]');
        speak(spk.getAttribute('data-spk'));
      }
    });

    window.addEventListener('hashchange', renderView);
    renderView();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
