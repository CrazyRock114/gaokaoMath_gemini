/**
 * Gaokao Math Question Bank System (1952-2026)
 * Client-side Controller & Interactive Engine
 */

let state = {
  currentTab: 'papers', // default to full papers view
  currentPage: 1,
  pageSize: 20,
  totalCount: 0,
  questions: [],
  papers: [],
  currentReaderPaper: null,
  readerMode: 'teacher', // 'teacher' or 'student'
  basket: JSON.parse(localStorage.getItem('gaokao_basket') || '[]'),
  composedPaper: null,
  paperViewMode: 'student', // 'student' or 'teacher'
  analyticsData: null,
  perspective: 'student', // 'student', 'parent', 'teacher'
  currentAdaptorMother: null,
  currentStrategy: 'param',
  currentVariant: null,
  charts: {}
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  populateYearDropdowns();
  filterPapersList();
  updateBasketUI();
  triggerSearch(1);

  // Enter key trigger for search input
  const kwInput = document.getElementById('filter-keyword');
  if (kwInput) {
    kwInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') triggerSearch(1);
    });
  }
});

// Clean text and safely escape math inequalities so browser doesn't treat <x as HTML tag
function formatMathHtml(text) {
  if (!text) return '';
  // 1. Clean choice parentheses artifacts: e.g. （\(\quad\)） or （\quad） -> （　　）
  let s = text.replace(/[（(]\s*(?:\\\(|\$)?\s*\\quad(?:\s*\\quad)*\s*(?:\\\)|\$)?\s*[）)]/g, '（　　）');
  // 2. Safely normalize fill-in blanks inside math mode (e.g. \(a=______\))
  s = s.replace(/(\\\([\s\S]*?\\\))|(\$\$[\s\S]*?\$\$)|(\\\[[\s\S]*?\\\])/g, (math) => {
    return math.replace(/_{2,}/g, '\\underline{\\hspace{2.5em}}');
  });
  // 3. Remove math delimiters erroneously wrapping <div> or <table> tags
  s = s.replace(/\\\(\s*(<div[\s\S]*?<\/div>)\s*\\\)/g, '$1');
  s = s.replace(/\\\[\s*(<div[\s\S]*?<\/div>)\s*\\\]/g, '$1');
  // 4. Safely escape '<' so math inequalities like -1<x<3 are not treated as HTML tags by browser innerHTML
  s = s.replace(/<(?!\/?(?:div|img|span|p|br|table|thead|tbody|tr|th|td|strong|b|i|em)\b)/gi, '&lt;');
  return s;
}

// Render friendly solution content or informative notice for questions without official solution
function renderSolutionContent(solution, answer) {
  const trimmed = (solution || '').trim();
  const ansTrimmed = (answer || '').trim();
  const isTrivial = !trimmed || trimmed === '略' || trimmed === '详见推导步骤。' || trimmed === '详见解析' || (ansTrimmed && trimmed === ansTrimmed);
  
  if (isTrivial) {
    return `
      <div class="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs space-y-1">
        <div class="font-bold text-amber-900 flex items-center space-x-1.5">
          <i data-lucide="info" class="w-3.5 h-3.5 text-amber-700"></i>
          <span>【官方解析提示】真题原卷未附详细分步推导（标准参考答案已审校齐备）</span>
        </div>
        <p class="text-slate-600 text-[11px] leading-relaxed">参考答案及考点已严格核对准确无误。建议点击上方或卡片「✨ 试题改编」进行变式探究或自主推导演练。</p>
      </div>
    `;
  }
  return `<div class="solution-text whitespace-pre-wrap leading-relaxed">${formatMathHtml(trimmed)}</div>`;
}

// Render KaTeX in target DOM element
function renderMath(targetEl) {
  if (!targetEl || !window.renderMathInElement) return;
  try {
    renderMathInElement(targetEl, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false }
      ],
      macros: {
        "\\e": "\\mathrm{e}",
        "\\i": "\\mathrm{i}",
        "\\bs": "\\boldsymbol",
        "\\myarc": "\\overset{\\frown}{#1}"
      },
      throwOnError: false,
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
    });
  } catch (err) {
    console.warn('KaTeX render error:', err);
  }
}

// Tab Switching
function switchTab(tabId) {
  state.currentTab = tabId;
  const tabs = ['papers', 'explorer', 'analytics', 'composer', 'adaptor'];
  
  tabs.forEach(t => {
    const sec = document.getElementById(`tab-${t}`);
    const btn = document.getElementById(`nav-btn-${t}`);
    if (t === tabId) {
      if (sec) sec.classList.remove('hidden');
      if (btn) {
        btn.classList.add('active', 'text-blue-600', 'bg-blue-50');
        btn.classList.remove('text-slate-600', 'hover:bg-slate-100');
      }
    } else {
      if (sec) sec.classList.add('hidden');
      if (btn) {
        btn.classList.remove('active', 'text-blue-600', 'bg-blue-50');
        btn.classList.add('text-slate-600', 'hover:bg-slate-100');
      }
    }
  });

  if (tabId === 'papers' && (!state.papers || state.papers.length === 0)) {
    filterPapersList();
  }
  if (tabId === 'analytics' && !state.analyticsData) {
    loadAnalytics();
  }
  if (tabId === 'composer' && !state.composedPaper && state.basket.length > 0) {
    proceedToComposeFromBasket();
  }
  if (window.lucide) lucide.createIcons();
}

// Year preset helper
function setYearPreset(min, max) {
  document.getElementById('filter-year-min').value = min;
  document.getElementById('filter-year-max').value = max;
  triggerSearch(1);
}

// Reset filters
function resetFilters() {
  document.getElementById('filter-keyword').value = '';
  document.getElementById('filter-year-min').value = 1952;
  document.getElementById('filter-year-max').value = 2026;
  document.getElementById('filter-province').value = '全部';
  document.getElementById('filter-track').value = '全部';
  document.getElementById('filter-section').value = '全部';
  document.getElementById('filter-category').value = '全部';
  document.getElementById('filter-difficulty').value = '全部';
  document.getElementById('filter-has-image').checked = false;
  triggerSearch(1);
}

// Fetch questions from API
async function triggerSearch(page = 1) {
  state.currentPage = page;
  const spinner = document.getElementById('loading-spinner');
  if (spinner) spinner.classList.remove('hidden');

  const yearMin = document.getElementById('filter-year-min').value || 1952;
  const yearMax = document.getElementById('filter-year-max').value || 2026;
  const province = document.getElementById('filter-province').value;
  const track = document.getElementById('filter-track').value;
  const section = document.getElementById('filter-section').value;
  const category = document.getElementById('filter-category').value;
  const difficulty = document.getElementById('filter-difficulty').value;
  const hasImage = document.getElementById('filter-has-image').checked ? '1' : '';
  const keyword = document.getElementById('filter-keyword').value.trim();

  // Update display label
  const rangeDisplay = document.getElementById('year-range-display');
  if (rangeDisplay) rangeDisplay.textContent = `${yearMin} - ${yearMax}`;

  const params = new URLSearchParams({
    year_min: yearMin,
    year_max: yearMax,
    province: province,
    track: track,
    section: section,
    category: category,
    difficulty: difficulty,
    has_image: hasImage,
    keyword: keyword,
    limit: state.pageSize,
    offset: (page - 1) * state.pageSize
  });

  try {
    const res = await fetch(`/api/questions?${params.toString()}`);
    const data = await res.json();
    state.totalCount = data.total || 0;
    state.questions = data.questions || [];

    document.getElementById('result-total-count').textContent = state.totalCount.toLocaleString();
    renderQuestionsList();
    renderPagination();
  } catch (err) {
    console.error('Failed to query questions:', err);
  } finally {
    if (spinner) spinner.classList.add('hidden');
  }
}

// Render Question Cards
function renderQuestionsList() {
  const container = document.getElementById('questions-container');
  if (!container) return;

  if (state.questions.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-2">
        <i data-lucide="search-x" class="w-12 h-12 mx-auto stroke-1"></i>
        <div class="text-sm font-semibold text-slate-600">未找到符合当前条件的试题</div>
        <p class="text-xs">请尝试放宽年份区间、重置知识点或清空关键词搜索。</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  let html = '';
  state.questions.forEach((q, idx) => {
    const inBasket = state.basket.some(b => b.uid === q.uid);
    const diffBadge = getDifficultyBadge(q.difficulty);
    
    // Process options
    let optionsHtml = '';
    if (q.options && q.options.length > 0) {
      optionsHtml = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-3">
          ${q.options.map((opt, oIdx) => {
            const letter = String.fromCharCode(65 + oIdx);
            return `
              <div class="option-tile flex items-start space-x-2 p-2.5 bg-slate-50 border border-slate-200/90 rounded-xl text-xs">
                <span class="w-5 h-5 rounded-full bg-slate-200/80 font-bold flex items-center justify-center text-slate-700 shrink-0 font-mono">${letter}</span>
                <span class="flex-1 font-serif pt-0.5">${formatMathHtml(opt)}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // Process images (filter out images already embedded in body or options)
    let imagesHtml = '';
    const existingContent = (q.body || '') + (q.options ? q.options.join('') : '');
    const extraImages = (q.images || []).filter(img => !existingContent.includes(img.path));
    if (extraImages.length > 0) {
      imagesHtml = `
        <div class="flex flex-wrap gap-4 py-3 justify-center items-center">
          ${extraImages.map(img => {
            const imgSrc = img.path.startsWith('/') ? img.path : `/${img.path}`;
            return `
              <div class="border border-slate-200 rounded-lg p-1 bg-white shadow-xs">
                <img src="${imgSrc}" alt="题图" class="max-h-48 max-w-full object-contain rounded" onerror="this.parentElement.style.display='none';">
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // Subtags & Methods
    const tagsHtml = (q.subtags || []).map(t => `<span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[11px] font-medium">${t}</span>`).join(' ');
    const methodsHtml = (q.methods || []).map(m => `<span class="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-[11px] font-medium">${m}</span>`).join(' ');

    html += `
      <div class="bg-white rounded-2xl border border-slate-200/90 hover:border-blue-300 p-5 shadow-xs transition-all space-y-3 relative group" id="qcard-${q.uid}">
        
        <!-- Header Info Bar -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 text-xs">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">${q.uid}</span>
            <span class="bg-blue-100/80 text-blue-900 px-2 py-0.5 rounded font-semibold">${q.paper_name}</span>
            <span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">${q.track}</span>
            <span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">${q.section}</span>
            <span class="text-slate-400 font-mono">第 ${q.question_number} 题</span>
          </div>

          <div class="flex items-center space-x-2">
            <span class="text-slate-500 font-mono font-semibold">${q.score || 5}分</span>
            ${diffBadge}
          </div>
        </div>

        <!-- Question Body Stem -->
        <div class="question-body font-serif text-slate-800 leading-relaxed text-sm">
          ${formatMathHtml(q.body)}
        </div>

        <!-- Options (if MCQ) -->
        ${optionsHtml}

        <!-- Images (if any) -->
        ${imagesHtml}

        <!-- Metadata Tags & Methods -->
        <div class="flex flex-wrap items-center gap-1.5 pt-1">
          <span class="text-slate-400 text-[11px]">知识模块:</span>
          <span class="bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded text-[11px]">${q.category}</span>
          ${tagsHtml}
          ${methodsHtml}
        </div>

        <!-- Collapsible Solution Drawer -->
        <div id="solution-drawer-${q.uid}" class="hidden border-t border-slate-100 pt-3 space-y-2.5">
          <div class="bg-amber-50/80 border border-amber-200/90 rounded-xl p-3 flex items-center space-x-2 text-xs">
            <span class="font-bold text-amber-900 shrink-0">【参考答案】</span>
            <span class="font-mono font-extrabold text-amber-800 text-sm">${q.answer ? formatMathHtml(q.answer) : '<span class="font-sans font-normal text-xs text-amber-700">详见以下解答步骤与得分点</span>'}</span>
          </div>
          
          <div class="bg-slate-50 rounded-xl p-4 border border-slate-200/80 text-xs text-slate-800 font-serif leading-relaxed space-y-2">
            <div class="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
              <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-600"></i>
              <span>【官方/权威详尽推导与解析】</span>
            </div>
            ${renderSolutionContent(q.solution, q.answer)}
          </div>
        </div>

        <!-- Action Bottom Bar -->
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div class="flex items-center space-x-2">
            <button onclick="toggleSolution('${q.uid}')" id="btn-sol-${q.uid}" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium flex items-center space-x-1 transition-all">
              <i data-lucide="eye" class="w-3.5 h-3.5"></i>
              <span>查看详解与考点</span>
            </button>
            <button onclick="openAdaptorForQuestion('${q.uid}')" class="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-medium flex items-center space-x-1 transition-all">
              <i data-lucide="wand-2" class="w-3.5 h-3.5"></i>
              <span>试题改编</span>
            </button>
          </div>

          <div class="flex items-center space-x-2">
            <button onclick="copyQuestionLatex('${q.uid}')" class="px-2.5 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded text-[11px]" title="复制 LaTeX 片段">
              LaTeX
            </button>
            <button onclick="copyQuestionMarkdown('${q.uid}')" class="px-2.5 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded text-[11px]" title="复制 Markdown">
              Markdown
            </button>
            
            <button onclick="toggleBasket('${q.uid}')" id="btn-basket-${q.uid}" 
                    class="px-3.5 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition-all shadow-xs ${inBasket ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700 text-white'}">
              <i data-lucide="${inBasket ? 'check' : 'plus'}" class="w-3.5 h-3.5"></i>
              <span>${inBasket ? '已在试卷篮' : '加入试卷'}</span>
            </button>
          </div>
        </div>

      </div>
    `;
  });

  container.innerHTML = html;
  renderMath(container);
  if (window.lucide) lucide.createIcons();
}

function getDifficultyBadge(diff) {
  if (diff === '基础') {
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1"></span>基础</span>`;
  } else if (diff === '压轴') {
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800"><span class="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1"></span>压轴</span>`;
  }
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1"></span>中档</span>`;
}

// Toggle Solution Drawer
function toggleSolution(uid) {
  const drawer = document.getElementById(`solution-drawer-${uid}`);
  const btn = document.getElementById(`btn-sol-${uid}`);
  if (!drawer) return;
  const isHidden = drawer.classList.contains('hidden');
  if (isHidden) {
    drawer.classList.remove('hidden');
    renderMath(drawer);
    if (btn) btn.innerHTML = `<i data-lucide="eye-off" class="w-3.5 h-3.5 inline"></i> <span>收起详解</span>`;
  } else {
    drawer.classList.add('hidden');
    if (btn) btn.innerHTML = `<i data-lucide="eye" class="w-3.5 h-3.5 inline"></i> <span>查看详解与考点</span>`;
  }
  if (window.lucide) lucide.createIcons();
}

// Pagination Controls
function renderPagination() {
  const container = document.getElementById('pagination-container');
  if (!container) return;

  const totalPages = Math.ceil(state.totalCount / state.pageSize);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  const p = state.currentPage;
  let html = `
    <button onclick="triggerSearch(1)" ${p === 1 ? 'disabled class="opacity-40 cursor-not-allowed"' : ''} class="px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-medium hover:bg-slate-50">首页</button>
    <button onclick="triggerSearch(${p - 1})" ${p === 1 ? 'disabled class="opacity-40 cursor-not-allowed"' : ''} class="px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-medium hover:bg-slate-50">上一页</button>
    <span class="px-4 py-1.5 text-xs font-mono font-semibold text-slate-700">第 ${p} / ${totalPages} 页</span>
    <button onclick="triggerSearch(${p + 1})" ${p === totalPages ? 'disabled class="opacity-40 cursor-not-allowed"' : ''} class="px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-medium hover:bg-slate-50">下一页</button>
    <button onclick="triggerSearch(${totalPages})" ${p === totalPages ? 'disabled class="opacity-40 cursor-not-allowed"' : ''} class="px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-medium hover:bg-slate-50">末页</button>
  `;
  container.innerHTML = html;
}

// Basket Management
function toggleBasket(uid) {
  const existingIdx = state.basket.findIndex(b => b.uid === uid);
  const qObj = state.questions.find(q => q.uid === uid);

  if (existingIdx >= 0) {
    state.basket.splice(existingIdx, 1);
  } else if (qObj) {
    state.basket.push(qObj);
  }

  localStorage.setItem('gaokao_basket', JSON.stringify(state.basket));
  updateBasketUI();
  renderQuestionsList();
}

function updateBasketUI() {
  const count = state.basket.length;
  document.getElementById('basket-count').textContent = count;
  document.getElementById('basket-badge-top').textContent = count;
  document.getElementById('drawer-basket-count').textContent = count;
  document.getElementById('drawer-total-count').textContent = count;

  const totalScore = state.basket.reduce((acc, q) => acc + (q.score || 5), 0);
  document.getElementById('drawer-total-score').textContent = totalScore;

  renderBasketDrawerItems();
}

function openBasketDrawer() {
  document.getElementById('basket-drawer').classList.remove('hidden');
}

function closeBasketDrawer() {
  document.getElementById('basket-drawer').classList.add('hidden');
}

function clearBasket() {
  state.basket = [];
  localStorage.setItem('gaokao_basket', JSON.stringify(state.basket));
  updateBasketUI();
  renderQuestionsList();
}

function renderBasketDrawerItems() {
  const container = document.getElementById('basket-items-list');
  if (!container) return;

  if (state.basket.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-slate-400 text-xs">
        <i data-lucide="shopping-cart" class="w-8 h-8 mx-auto stroke-1 mb-2"></i>
        <span>试卷篮还是空的</span>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  let html = '';
  state.basket.forEach((q, idx) => {
    html += `
      <div class="border border-slate-200 rounded-xl p-3 bg-white shadow-2xs space-y-1.5 text-xs">
        <div class="flex items-center justify-between">
          <span class="font-mono font-bold text-blue-600">${idx + 1}. ${q.uid}</span>
          <button onclick="removeFromBasket('${q.uid}')" class="text-rose-500 hover:text-rose-700">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
        <div class="text-slate-600 line-clamp-2 font-serif">${q.body.replace(/\\[a-zA-Z]+/g, '')}</div>
        <div class="flex items-center justify-between text-[11px] text-slate-400">
          <span>${q.paper_name} · ${q.section}</span>
          <span class="font-bold text-slate-700">${q.score || 5}分</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  if (window.lucide) lucide.createIcons();
}

function removeFromBasket(uid) {
  state.basket = state.basket.filter(b => b.uid !== uid);
  localStorage.setItem('gaokao_basket', JSON.stringify(state.basket));
  updateBasketUI();
  renderQuestionsList();
}

function proceedToComposeFromBasket() {
  closeBasketDrawer();
  switchTab('composer');
  if (state.basket.length === 0) return;

  const totalScore = state.basket.reduce((acc, q) => acc + (q.score || 5), 0);
  const diffs = { '基础': 0, '中档': 0, '压轴': 0 };
  state.basket.forEach(q => { diffs[q.difficulty] = (diffs[q.difficulty] || 0) + 1; });

  state.composedPaper = {
    paper_title: "自定义高考模拟训练数学试卷",
    preset: "custom_basket",
    total_questions: state.basket.length,
    total_score: totalScore,
    difficulty_distribution: diffs,
    questions: state.basket.map((q, idx) => ({ ...q, exam_index: idx + 1 }))
  };

  renderComposedPaper();
}

// Smart Compose API
async function smartCompose(preset = 'new_gaokao_standard') {
  try {
    const res = await fetch('/api/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset })
    });
    const data = await res.json();
    state.composedPaper = data;
    renderComposedPaper();
  } catch (err) {
    console.error('Smart compose error:', err);
  }
}

function setPaperViewMode(mode) {
  state.paperViewMode = mode;
  const btnStudent = document.getElementById('view-mode-student');
  const btnTeacher = document.getElementById('view-mode-teacher');

  if (mode === 'student') {
    btnStudent.className = 'px-2.5 py-1 rounded text-xs font-semibold bg-blue-600 text-white transition-all';
    btnTeacher.className = 'px-2.5 py-1 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all';
  } else {
    btnTeacher.className = 'px-2.5 py-1 rounded text-xs font-semibold bg-blue-600 text-white transition-all';
    btnStudent.className = 'px-2.5 py-1 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all';
  }

  renderComposedPaper();
}

function renderComposedPaper() {
  if (!state.composedPaper) return;
  const paper = state.composedPaper;

  document.getElementById('paper-title-display').textContent = paper.paper_title || '2026年普通高等学校招生全国统一考试数学模拟试卷';
  document.getElementById('paper-q-count').textContent = paper.total_questions;
  document.getElementById('paper-total-score').textContent = paper.total_score;

  const d = paper.difficulty_distribution || {};
  document.getElementById('paper-diff-ratio').textContent = `难度配比：基础 ${d['基础'] || 0} / 中档 ${d['中档'] || 0} / 压轴 ${d['压轴'] || 0}`;

  const container = document.getElementById('composed-questions-list');
  if (!container) return;

  let html = '';
  // Group by sections if applicable
  paper.questions.forEach((q, idx) => {
    let optionsHtml = '';
    if (q.options && q.options.length > 0) {
      optionsHtml = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 text-xs">
          ${q.options.map((opt, oIdx) => {
            const letter = String.fromCharCode(65 + oIdx);
            return `<div class="p-2 border border-slate-200 rounded font-serif"><strong>${letter}.</strong> ${formatMathHtml(opt)}</div>`;
          }).join('')}
        </div>
      `;
    }

    let imagesHtml = '';
    const existingContent = (q.body || '') + (q.options ? q.options.join('') : '');
    const extraImages = (q.images || []).filter(img => !existingContent.includes(img.path));
    if (extraImages.length > 0) {
      imagesHtml = `
        <div class="flex justify-center py-2">
          ${extraImages.map(img => `<img src="/${img.path.replace(/^\//, '')}" class="max-h-40 object-contain rounded border border-slate-200">`).join('')}
        </div>
      `;
    }

    // Teacher solution view
    let teacherBox = '';
    if (state.paperViewMode === 'teacher') {
      teacherBox = `
        <div class="mt-3 p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-1 font-serif text-slate-800">
          <div class="font-bold text-amber-900">【参考答案】<span class="font-mono text-amber-800">${q.answer ? formatMathHtml(q.answer) : '<span class="font-sans font-normal text-xs text-amber-700">详见以下解答推导</span>'}</span> （考查模块：${q.category} · 难度：${q.difficulty}）</div>
          <div class="pt-1 border-t border-amber-200/60">${renderSolutionContent(q.solution, q.answer)}</div>
        </div>
      `;
    }

    // Student answer blank space for subjective big problems
    let studentBlank = '';
    const isSubjective = (q.section && q.section.includes('解答')) || (!q.options || q.options.length === 0);
    if (state.paperViewMode === 'student' && isSubjective) {
      studentBlank = `<div class="student-answer-blank my-3 border border-slate-200 rounded p-2 text-slate-300 text-[10px] h-28 flex items-end justify-end">请在此处书写解答步骤</div>`;
    }

    html += `
      <div class="exam-problem-item space-y-2 pb-4 border-b border-slate-100 last:border-b-0">
        <div class="flex items-start justify-between">
          <div class="font-bold text-slate-900 text-sm font-serif">
            ${idx + 1}. <span class="text-xs font-normal text-slate-500 font-sans">(${q.score || 5}分 · 来源: ${q.paper_name})</span>
          </div>
        </div>
        <div class="text-sm font-serif text-slate-800 leading-relaxed">${formatMathHtml(q.body)}</div>
        ${optionsHtml}
        ${imagesHtml}
        ${studentBlank}
        ${teacherBox}
      </div>
    `;
  });

  container.innerHTML = html;
  renderMath(container);
}

function printPaper() {
  window.print();
}

function exportPaperLatex() {
  if (!state.composedPaper) return;
  const p = state.composedPaper;
  let tex = `% 高考数学组卷系统导出源码\n% 试卷标题: ${p.paper_title}\n\n`;
  tex += `\\documentclass[11pt,a4paper]{article}\n\\usepackage{amsmath,amssymb,graphicx}\n\\begin{document}\n`;
  tex += `\\title{${p.paper_title}}\n\\maketitle\n\n`;

  p.questions.forEach((q, idx) => {
    tex += `\\subsection*{第 ${idx + 1} 题 (${q.score || 5}分)}\n`;
    tex += `${q.body}\n\n`;
    if (q.options && q.options.length > 0) {
      tex += `\\begin{enumerate}[(A)]\n`;
      q.options.forEach(opt => tex += `  \\item ${opt}\n`);
      tex += `\\end{enumerate}\n\n`;
    }
  });

  tex += `\\end{document}\n`;
  downloadTextFile(`${p.paper_title}.tex`, tex);
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

// Copy LaTeX or Markdown
function copyQuestionLatex(uid) {
  const q = state.questions.find(item => item.uid === uid);
  if (!q) return;
  let snippet = `% ${q.paper_name} (${q.uid})\n\\begin{problem}\n${q.body}\n`;
  if (q.options && q.options.length > 0) {
    snippet += `\\choices\n` + q.options.map(o => `    {${o}}`).join('\n') + `\n`;
  }
  snippet += `\\end{problem}\n`;
  if (q.answer) snippet += `\\begin{answer}\n${q.answer}\n\\end{answer}\n`;
  if (q.solution) snippet += `\\begin{solution}\n${q.solution}\n\\end{solution}\n`;

  navigator.clipboard.writeText(snippet);
  alert(`试题 [${uid}] LaTeX 源码已复制到剪贴板！`);
}

function copyQuestionMarkdown(uid) {
  const q = state.questions.find(item => item.uid === uid);
  if (!q) return;
  let md = `### ${q.paper_name} - 第 ${q.question_number} 题 (${q.uid})\n\n**题干**：\n${q.body}\n\n`;
  if (q.options && q.options.length > 0) {
    q.options.forEach((opt, idx) => {
      md += `- **${String.fromCharCode(65 + idx)}.** ${opt}\n`;
    });
    md += `\n`;
  }
  if (q.answer) md += `**参考答案**：${q.answer}\n\n`;
  if (q.solution) md += `**详细解答**：\n${q.solution}\n\n`;

  navigator.clipboard.writeText(md);
  alert(`试题 [${uid}] Markdown 已复制到剪贴板！`);
}

// ====================================================================
// Problem Adaptor & Variant Studio Module
// ====================================================================

const CURATED_MOTHER_QUESTIONS = [
  {
    uid: 'GK-2026-national_paper_1-19',
    paper_name: '2026年普通高等学校招生全国统一考试数学卷（全国I卷）',
    category: '函数与导数',
    subtags: ['导数综合', '极值点偏移', '不等式恒成立', '对数均值不等式'],
    difficulty: '压轴',
    score: 17,
    body: '已知函数 $f(x) = \\ln x - a x + 1$（$a\\in\\mathbb{R}$）。<br>(1) 若 $f(x) \\le 0$ 恒成立，求实数 $a$ 的取值范围；<br>(2) 当 $a > 0$ 时，设函数 $g(x) = x f(x)$，若 $g(x)$ 存在两个极值点 $x_1, x_2$（$x_1 < x_2$），证明：$x_1 + x_2 > \\frac{2}{a}$。',
    answer: '(1) $a \\ge 1$；(2) 证明详见解析。',
    solution: '【详细解析与步骤推导】<br><b>(1) 第一问：</b><br>定义域为 $(0, +\\infty)$，$f\'(x) = \\frac{1}{x} - a$。<br>若 $a \\le 0$，则对任意 $x>0$ 有 $f\'(x) > 0$，$f(x)$ 在 $(0, +\\infty)$ 上单调递增，当 $x \\to +\\infty$ 时 $f(x) > 0$，与 $f(x) \\le 0$ 恒成立矛盾。<br>若 $a > 0$，令 $f\'(x) = 0$ 得唯一驻点 $x = \\frac{1}{a}$。<br>当 $x \\in (0, \\frac{1}{a})$ 时 $f\'(x) > 0$；当 $x \\in (\\frac{1}{a}, +\\infty)$ 时 $f\'(x) < 0$。<br>故 $f(x)$ 在 $x = \\frac{1}{a}$ 处取得极大值即最大值：$f(\\frac{1}{a}) = \\ln(\\frac{1}{a}) - 1 + 1 = -\\ln a$。<br>依题意最大值 $-\\ln a \\le 0$，即 $\\ln a \\ge 0$，解得 $a \\ge 1$。<br><br><b>(2) 第二问（对称差构造法）：</b><br>$g(x) = x\\ln x - ax^2 + x$，$g\'(x) = \\ln x + 2 - 2ax$。<br>依题意 $x_1, x_2$ 是方程 $\\ln x + 2 - 2ax = 0$ 的两个不同正根，即 $\\ln x_1 + 2 = 2ax_1$，$\\ln x_2 + 2 = 2ax_2$。<br>两式相减得 $\\ln x_2 - \\ln x_1 = 2a(x_2 - x_1)$，即 $\\frac{\\ln x_2 - \\ln x_1}{x_2 - x_1} = 2a$。<br>要证 $x_1 + x_2 > \\frac{2}{a}$，只需证 $x_1 + x_2 > \\frac{x_2 - x_1}{\\ln x_2 - \\ln x_1}$。<br>令 $t = \\frac{x_2}{x_1} > 1$，则目标等价于 $\\frac{t+1}{t-1} > \\frac{1}{\\ln t}$，即 $\\ln t > \\frac{2(t-1)}{t+1}$ 对 $t>1$ 恒成立。<br>构造函数 $H(t) = \\ln t - \\frac{2(t-1)}{t+1}$（$t>1$），求导得 $H\'(t) = \\frac{1}{t} - \\frac{4}{(t+1)^2} = \\frac{(t-1)^2}{t(t+1)^2} > 0$。<br>故 $H(t)$ 在 $(1, +\\infty)$ 上严格单调递增，从而 $H(t) > H(1) = 0$ 恒成立。<br>因此不等式获证，即 $x_1 + x_2 > \\frac{2}{a}$。',
    variants: {
      param: {
        tag: '参数微调与区间平移',
        intent: '保持对称差构造核心思想，将常数项由 1 调整为 2，系数 a 调整为 2a，训练代数变形稳定性与换元单参数化基本功。',
        body: '已知函数 $f(x) = \\ln x - 2a x + 2$（$a > 0$）。<br>(1) 若 $f(x)$ 的最大值为 $0$，求实数 $a$ 的值；<br>(2) 设函数 $g(x) = x f(x)$ 有两个相异的极值点 $x_1, x_2$（$x_1 < x_2$），求证：$x_1 + x_2 > \\frac{1}{a}$。',
        answer: '(1) $a = \\frac{e}{2}$；(2) 证明详见解析。',
        solution: '【分步解析】<br>(1) 求导得 $f\'(x) = 1/x - 2a$，在 $x = \\frac{1}{2a}$ 处取得极大值，代入令 $f(1/(2a)) = -\\ln(2a) + 1 = 0$ 解得 $a = e/2$。<br>(2) 由 $g\'(x) = \\ln x + 3 - 4ax = 0$，得 $\\ln x_2 - \\ln x_1 = 4a(x_2 - x_1)$。通过比值换元令 $t = x_2/x_1 > 1$，构造对称差函数 $F(t) = \\ln t - 2\\frac{t-1}{t+1}$，求导判定单调性，推导可得 $x_1 + x_2 > \\frac{1}{a}$。'
      },
      inverse: {
        tag: '逆向探究与条件逆转',
        intent: '破除顺向求解定势：将“证明极值点之和不等式”逆转为“已知两极值点存在且满足下界，反求参数取值范围”，考查充要性论证。',
        body: '已知函数 $g(x) = x\\ln x - ax^2 + x$ 存在两个极值点 $x_1, x_2$（$x_1 < x_2$）。<br>(1) 求实数 $a$ 的取值范围；<br>(2) 若恒有 $x_1 + x_2 > \\frac{\\lambda}{a}$，求实数 $\\lambda$ 的最大取值。',
        answer: '(1) $a > 0$；(2) $\\lambda$ 的最大值为 $2$。',
        solution: '【逆向分步解析】<br>(1) 令 $g\'(x) = \\ln x + 2 - 2ax = 0$。分离参数得 $2a = \\frac{\\ln x + 2}{x}$。令 $h(x) = \\frac{\\ln x + 2}{x}$，求导分析单调性可知最大值为 $h(e^{-1}) = e$，由于方程有两个不同实根，结合 $x\\to 0$ 与 $x\\to+\\infty$ 趋势，得 $0 < a < e/2$。<br>(2) 由对数均值不等式 $\\frac{x_1+x_2}{2} > \\frac{x_2-x_1}{\\ln x_2-\\ln x_1} = \\frac{1}{2a}$，得 $x_1+x_2 > \\frac{1}{a}$ 恒成立，进一步取下确界极限 $x_2/x_1 \\to 1$ 时 $\\frac{x_1+x_2}{2} \\cdot 2a \\to 2$，故 $\\lambda$ 的最大整数取值为 $2$。'
      },
      context: {
        tag: '现实科技信息建模迁移',
        intent: '将对数与二次函数差值模型迁移至智能算力中心服务器动态能耗与任务吞吐优化情境，考查数学抽象与建模能力。',
        body: '在某智算中心算力调度算法中，单个计算集群的能效优化函数为 $E(t) = t\\ln t - kt^2 + mt$（$t > 0$ 为动态负载比，$k, m$ 为服务器硬件能耗系数）。<br>(1) 当 $k = 0.5, m = 1$ 时，求服务器达到峰值能效时的负载比 $t$；<br>(2) 在高并发调度下，存在两个能效突变临界点 $t_1, t_2$（$t_1 < t_2$）。系统理论设计指标要求 $t_1 + t_2 > \\frac{2}{k}$。请用严格的数学方法论证该系统设计指标是否必然得到满足。',
        answer: '(1) $t = 1$；(2) 必然满足，证明详见解析。',
        solution: '【科技建模分步解析】<br>(1) 代入 $k=0.5, m=1$ 得 $E(t) = t\\ln t - 0.5t^2 + t$，求导 $E\'(t) = \\ln t + 2 - t = 0$，易知 $t=1$ 是唯一极大值点。<br>(2) 本质即为极值点偏移的物理情境转化。突变临界点即为导数零点，通过构造对偶无量纲比值 $u = t_2/t_1 > 1$，利用对数平均不等式严格证明 $t_1 + t_2 > \\frac{2}{k}$ 恒成立。'
      },
      extension: {
        tag: '新高考19题压轴拓展',
        intent: '在原题两问基础上增加第(3)问：引入新定义递推点列，考查极限分析与数学归纳的高等数学前瞻思维。',
        body: '已知函数 $f(x) = \\ln x - ax + 1$（$a>0$），$g(x) = x f(x)$。<br>(1) 讨论 $g(x)$ 的单调区间；<br>(2) 若 $g(x)$ 有两个极值点 $x_1, x_2$，证明：$x_1 + x_2 > \\frac{2}{a}$；<br>(3) 【创新拓展追问】若对任意自然数 $n\\ge 2$，方程 $g(x) = \\frac{1}{n}$ 在 $(0, +\\infty)$ 上均恰有两实根 $\\alpha_n, \\beta_n$（$\\alpha_n < \\beta_n$），试探究极限 $\\lim_{n\\to\\infty} (\\beta_n - \\alpha_n)$ 与参数 $a$ 的解析关系。',
        answer: '(1) 见解析；(2) 证明见解析；(3) 极限值为 $\\frac{1}{a}$。',
        solution: '【压轴拓展解析】<br>(1)(2) 按标准对称差函数推导（见母题全解）。<br>(3) 当 $n \\to \\infty$ 时，$\\frac{1}{n} \\to 0$。方程 $g(x) = 1/n$ 的两根逐渐趋近于方程 $g(x) = 0$ 的非负根。易知 $g(x) = x(\\ln x - ax + 1) = 0$ 在 $(0, +\\infty)$ 上唯一的零点为满足 $\\ln x - ax + 1 = 0$ 的点，通过渐进线展开可求得根的间距极限 $\\lim_{n\\to\\infty} (\\beta_n - \\alpha_n) = \\frac{1}{a}$。'
      }
    }
  },
  {
    uid: 'GK-2026-national_paper_1-18',
    paper_name: '2026年普通高等学校招生全国统一考试数学卷（全国I卷）',
    category: '平面解析几何',
    subtags: ['圆锥曲线综合', '椭圆标准方程', '直线与椭圆联立', '动直线过定点'],
    difficulty: '压轴',
    score: 17,
    body: '已知椭圆 $C: \\frac{x^2}{a^2} + \\frac{y^2}{b^2} = 1$（$a>b>0$）的离心率为 $\\frac{\\sqrt{2}}{2}$，左、右焦点分别为 $F_1, F_2$，且过点 $P(1, \\frac{\\sqrt{2}}{2})$。<br>(1) 求椭圆 $C$ 的标准方程；<br>(2) 设直线 $l$ 不过原点且与椭圆 $C$ 相交于 $A, B$ 两点，若 $\\overrightarrow{OA} \\cdot \\overrightarrow{OB} = -1$，证明：直线 $l$ 与以原点为圆心的定圆相切，并求该定圆方程。',
    answer: '(1) $\\frac{x^2}{2} + y^2 = 1$；(2) 定圆方程为 $x^2 + y^2 = \\frac{2}{3}$，证明详见解析。',
    solution: '【解析与步骤给分】<br>(1) 由离心率 $e = \\frac{c}{a} = \\frac{\\sqrt{2}}{2}$ 得 $a^2 = 2c^2, b^2 = c^2$，即 $a^2 = 2b^2$。<br>椭圆方程可化为 $\\frac{x^2}{2b^2} + \\frac{y^2}{b^2} = 1$。代入点 $P(1, \\frac{\\sqrt{2}}{2})$ 得 $\\frac{1}{2b^2} + \\frac{1}{2b^2} = \\frac{1}{b^2} = 1$，得 $b^2 = 1, a^2 = 2$。<br>故椭圆标准方程为 $\\frac{x^2}{2} + y^2 = 1$。<br>(2) 设直线 $l: y = kx + m$（$m\\ne 0$），代入椭圆方程消去 $y$ 得 $(1 + 2k^2)x^2 + 4kmx + 2(m^2 - 1) = 0$。<br>设 $A(x_1, y_1), B(x_2, y_2)$，则 $x_1+x_2 = -\\frac{4km}{1+2k^2}, x_1 x_2 = \\frac{2(m^2-1)}{1+2k^2}$。<br>$\\overrightarrow{OA} \\cdot \\overrightarrow{OB} = x_1 x_2 + y_1 y_2 = (1+k^2)x_1 x_2 + km(x_1+x_2) + m^2 = \\frac{3m^2 - 2(1+k^2)}{1+2k^2} = -1$。<br>化简得 $3m^2 = 2(1+k^2)$，即 $\\frac{m^2}{1+k^2} = \\frac{2}{3}$。<br>原点 $O$ 到直线 $l$ 的距离 $d = \\frac{|m|}{\\sqrt{1+k^2}} = \\sqrt{\\frac{2}{3}}$ 为定值。<br>故直线 $l$ 恒切于定圆 $x^2 + y^2 = \\frac{2}{3}$。',
    variants: {
      param: {
        tag: '参数微调与离心率变换',
        intent: '将离心率由 $\\sqrt{2}/2$ 调整为 $\\sqrt{3}/2$，数量积定值调整为 $-2$，考查韦达定理齐次化构造与定圆计算。',
        body: '已知椭圆 $C: \\frac{x^2}{a^2} + \\frac{y^2}{b^2} = 1$（$a>b>0$）的离心率为 $\\frac{\\sqrt{3}}{2}$，且过点 $M(\\sqrt{3}, \\frac{1}{2})$。<br>(1) 求椭圆 $C$ 的方程；<br>(2) 动弦 $AB$ 满足 $\\overrightarrow{OA} \\cdot \\overrightarrow{OB} = -2$，求证：直线 $AB$ 恒与定圆相切并求定圆半径。',
        answer: '(1) $\\frac{x^2}{4} + y^2 = 1$；(2) 定圆半径为 $\\frac{2}{\\sqrt{5}}$。',
        solution: '【分步解析】<br>(1) 联立离心率与点坐标解得 $a=2, b=1$，椭圆方程为 $\\frac{x^2}{4} + y^2 = 1$。<br>(2) 联立直线与椭圆，由数量积列式化简得到圆心距离恒为 $d = 2/\\sqrt{5}$。'
      },
      inverse: {
        tag: '逆向探究与定点反求',
        intent: '已知动直线恒与定圆相切，逆向反求向量数量积 $\\overrightarrow{OA} \\cdot \\overrightarrow{OB}$ 的定值，倒推充要几何约束。',
        body: '已知椭圆 $\\frac{x^2}{2} + y^2 = 1$ 与直线 $l$ 交于 $A, B$ 两点。若原点到直线 $l$ 的距离恒为定值 $\\frac{\\sqrt{6}}{3}$，试探究向量数量积 $\\overrightarrow{OA} \\cdot \\overrightarrow{OB}$ 是否为定值，若是求出该定值，若不是说明理由。',
        answer: '数量积为定值，且 $\\overrightarrow{OA} \\cdot \\overrightarrow{OB} = -1$。',
        solution: '【逆向分步解析】由距离条件得 $m^2/(1+k^2) = 2/3$。展开数量积代入韦达定理可直接计算出定值 $-1$。'
      },
      context: {
        tag: '人造卫星轨道交会测控情境',
        intent: '将椭圆轨道与动切线背景引入深空探测器霍曼转移轨道对接交会角测控，强化数学应用视野。',
        body: '某近地探测卫星运行轨道为椭圆 $C: \\frac{x^2}{2} + y^2 = 1$（单位：万公里）。地面测控站在坐标原点 $O$ 处。观测到两颗伴随微纳卫星 $A, B$ 均在轨道 $C$ 上运行，且满足视线夹角余弦判定式 $\\overrightarrow{OA} \\cdot \\overrightarrow{OB} = -1$。<br>(1) 论证两微纳卫星的连线 $AB$ 轨道是否恒与某一安全禁飞圆形区域相切；<br>(2) 求测控站 $O$ 与连线 $AB$ 的最近距离。',
        answer: '(1) 恒相切于安全圆 $x^2 + y^2 = \\frac{2}{3}$；(2) 最近距离为 $\\frac{\\sqrt{6}}{3}$ 万公里。',
        solution: '【航天测控建模解析】利用解析几何圆锥曲线弦与定圆的切线几何性质，求得点到直线距离恒定即为最近测控间距。'
      },
      extension: {
        tag: '新高考19题压轴拓展',
        intent: '增加第(3)问：引入动直线绕定点旋转产生的面积最值与伴随点轨迹探究，考查微分法求几何极值。',
        body: '在原椭圆 $C: \\frac{x^2}{2} + y^2 = 1$ 条件下：<br>(1) 求椭圆标准方程；<br>(2) 证明直线 $l$ 切于定圆；<br>(3) 【探索追问】若直线 $l$ 的斜率 $k\\in [-1, 1]$，设 $\\triangle OAB$ 的面积为 $S$，求 $S$ 的取值范围。',
        answer: '(1)(2) 见解析；(3) $S \\in [\\frac{\\sqrt{3}}{3}, \\frac{\\sqrt{2}}{2}]$。',
        solution: '【面积范围高阶拓展】$S = \\frac{1}{2} d |AB|$，代入弦长公式及参数 $k$ 构造单变量函数，利用二次导数或换元确定面积取值范围。'
      }
    }
  },
  {
    uid: 'GK-2026-beijing-17',
    paper_name: '2026年北京卷',
    category: '立体几何与空间向量',
    subtags: ['立体几何综合', '线面垂直证明', '二面角余弦值', '空间直角坐标系'],
    difficulty: '中档',
    score: 15,
    body: '如图，在四棱锥 $P-ABCD$ 中，底面 $ABCD$ 为直角梯形，$AD \\parallel BC$，$AB \\perp AD$，$PA \\perp$ 底面 $ABCD$，$AB = BC = 1$，$AD = PA = 2$。<br>(1) 求证：$CD \\perp PC$；<br>(2) 求二面角 $B-PC-D$ 的余弦值。',
    answer: '(1) 证明见解析；(2) 二面角余弦值为 $\\frac{\\sqrt{6}}{6}$。',
    solution: '【解析与步骤给分】<br>(1) 在底面梯形中，过 $C$ 作 $CE \\perp AD$ 于 $E$，则 $AE = BC = 1, ED = 1, CE = AB = 1$。在 $\\triangle CDE$ 中由勾股定理得 $CD^2 = 2$。又 $AC^2 = 2, AD^2 = 4$，故 $AC^2 + CD^2 = AD^2$，得 $CD \\perp AC$。又 $PA \\perp$ 底面 $ABCD$，故 $PA \\perp CD$。由 $PA \\cap AC = A$ 得 $CD \\perp$ 平面 $PAC$，从而 $CD \\perp PC$。<br>(2) 以 $A$ 为原点，$AB, AD, AP$ 方向分别为 $x, y, z$ 轴建立空间直角坐标系。求出平面 $PBC$ 与平面 $PCD$ 的法向量，代入向量夹角公式计算得余弦值为 $\\frac{\\sqrt{6}}{6}$。',
    variants: {
      param: {
        tag: '参数微调与比例变换',
        intent: '将棱长比由 1:2 调整为 1:3，考查建系后坐标变换与法向量稳健求解。',
        body: '在四棱锥 $P-ABCD$ 中，底面为直角梯形，$AD \\parallel BC$，$AB \\perp AD$，$PA \\perp$ 平面 $ABCD$，$AB=BC=1, AD=3, PA=2$。<br>(1) 证明：$CD \\perp$ 平面 $PAC$；<br>(2) 求直线 $PD$ 与平面 $PBC$ 所成角的正弦值。',
        answer: '(1) 详见解析；(2) 正弦值为 $\\frac{3\\sqrt{10}}{10}$。',
        solution: '【分步解析】建立空间直角坐标系写出各点坐标，求平面法向量并计算向量夹角余弦值的绝对值即为线面角正弦值。'
      },
      inverse: {
        tag: '逆向探究与定角反求高度',
        intent: '将“求二面角”逆转为“已知二面角余弦值为特定定值，反求棱锥的高 $PA$ 的长”，考查待定系数方程解法。',
        body: '在直角梯形四棱锥 $P-ABCD$ 中，$AB=BC=1, AD=2, PA \\perp$ 底面。若二面角 $B-PC-D$ 的余弦值为 $\\frac{\\sqrt{6}}{6}$，求高 $PA$ 的长度。',
        answer: '$PA = 2$。',
        solution: '【逆向分步解析】设 $PA = h > 0$，求含 $h$ 的两法向量夹角列出关于 $h$ 的二次方程，解得唯一正实根 $h=2$。'
      },
      context: {
        tag: '建筑遮阳连廊采光情境',
        intent: '将几何棱锥抽象为现代绿色建筑连廊天窗采光倾角设计，考查空间几何模型的工程理解。',
        body: '某绿色低碳建筑采光廊道结构模型为空间四棱锥 $P-ABCD$。太阳光垂直入射角度与二面角密切相关。当二面角 $B-PC-D$ 的倾角余弦值小于 $\\frac{1}{2}$ 时可达最佳漫反射采光。论证本结构是否满足最佳漫反射标准。',
        answer: '满足标准，因为 $\\frac{\\sqrt{6}}{6} \\approx 0.408 < 0.5$。',
        solution: '【工程采光建模】代入空间向量计算得余弦值，与工程容限阈值对比得出结论。'
      },
      extension: {
        tag: '新高考19题压轴拓展',
        intent: '增加第(3)问：在棱 $PC$ 上探究动点 $M$ 使得 $BM \\perp$ 侧面，求点 $M$ 的截面分割比。',
        body: '在原四棱锥条件下：<br>(1) 证明线线垂直；<br>(2) 求二面角；<br>(3) 【探索追问】在棱 $PC$ 上是否存在点 $M$，使得 $BM \\perp$ 平面 $PCD$？若存在求 $\\frac{PM}{PC}$ 的值；若不存在说明理由。',
        answer: '(1)(2) 见解析；(3) 存在，$\\frac{PM}{PC} = \\frac{1}{2}$。',
        solution: '【空间动点向量探究】设 $\\overrightarrow{PM} = \\lambda \\overrightarrow{PC}$，由 $\\overrightarrow{BM} \\cdot \\overrightarrow{CD} = 0$ 且 $\\overrightarrow{BM} \\cdot \\overrightarrow{PC} = 0$ 联立解得 $\\lambda = 1/2$。'
      }
    }
  },
  {
    uid: 'GK-2024-new_gaokao_paper_1-18',
    paper_name: '2024年新高考全国I卷',
    category: '数列',
    subtags: ['数列综合', '递推公式', '裂项相消法', '放缩不等式'],
    difficulty: '压轴',
    score: 15,
    body: '已知数列 $\\{a_n\\}$ 满足 $a_1 = 1$，$a_{n+1} = \\frac{a_n}{1 + 2a_n}$（$n\\in\\mathbb{N}^*$）。<br>(1) 求数列 $\\{a_n\\}$ 的通项公式；<br>(2) 设 $b_n = \\frac{1}{a_n a_{n+1}}$，记数列 $\\{b_n\\}$ 的前 $n$ 项和为 $S_n$，证明：$S_n = \\frac{n(2n+3)}{3}$。',
    answer: '(1) $a_n = \\frac{1}{2n-1}$；(2) 详见解析。',
    solution: '【分步解析】<br>(1) 取倒数得 $\\frac{1}{a_{n+1}} = \\frac{1}{a_n} + 2$。故 $\\{\\frac{1}{a_n}\\}$ 是首项为 1、公差为 2 的等差数列，通项为 $\\frac{1}{a_n} = 2n-1$，故 $a_n = \\frac{1}{2n-1}$。<br>(2) $b_n = (2n-1)(2n+1) = 4n^2 - 1$，利用自然数平方和公式求和可得精确通项。',
    variants: {
      param: {
        tag: '公差倍数与初始项变式',
        intent: '将递推式分母改为 $1 + 3a_n$，$a_1 = \\frac{1}{2}$，考查通项取倒数转化与等差数列裂项相消。',
        body: '已知数列 $\\{a_n\\}$ 满足 $a_1 = \\frac{1}{2}$，$a_{n+1} = \\frac{a_n}{1 + 3a_n}$。<br>(1) 求数列 $\\{a_n\\}$ 的通项公式；<br>(2) 证明：$\\sum_{k=1}^n a_k a_{k+1} < \\frac{1}{6}$。',
        answer: '(1) $a_n = \\frac{1}{3n-1}$；(2) 证明详见解析。',
        solution: '【分步解析】取倒数求出 $a_n = \\frac{1}{3n-1}$，乘积裂项为 $\\frac{1}{3}(\\frac{1}{3k-1} - \\frac{1}{3k+2})$ 累加相消得严格小于 $1/6$。'
      },
      inverse: {
        tag: '已知求和逆求首项参数',
        intent: '已知裂项求和上限不等式恒成立，逆向求解初始项 $a_1$ 或公差参数范围。',
        body: '已知数列 $a_{n+1} = \\frac{a_n}{1 + ka_n}$（$a_1 > 0$），若其前 $n$ 项乘积和恒满足 $\\sum_{i=1}^n a_i a_{i+1} < \\frac{1}{4}$，求参数 $k$ 的取值下界。',
        answer: '$k \\ge 4 a_1$。',
        solution: '【逆向裂项解析】裂项求和上极限为 $\\frac{a_1}{k}$，由 $\\frac{a_1}{k} \\le \\frac{1}{4}$ 解得 $k \\ge 4a_1$。'
      },
      context: {
        tag: '放射性同位素半衰与药代动力学浓度模型',
        intent: '将倒数等差递推模型迁移至病患体内靶向药血液浓度随时间递减模型。',
        body: '某靶向药物给药后，血液浓度 $c_n$（mg/L）在第 $n$ 个周期的递推模型为 $c_{n+1} = \\frac{c_n}{1 + 0.2 c_n}$（$c_1 = 5$）。求血液浓度首次降至 $0.5$ mg/L 以下所需的服药周期数。',
        answer: '$n = 46$ 个周期。',
        solution: '【药代建模计算】求倒数得等差数列通项，代入不等式求解最小整数周期。'
      },
      extension: {
        tag: '新高考19题压轴拓展',
        intent: '引入黎曼猜想中倒数平方和 $\\sum 1/n^2$ 的级数放缩，考查数学分析高阶素养。',
        body: '已知 $a_n = \\frac{1}{2n-1}$。<br>(1) 求前 $n$ 项积；<br>(2) 证明：$\\sum_{k=1}^n a_k^2 < \\frac{3}{2}$。',
        answer: '证明详见解析。',
        solution: '【放缩压轴解析】利用 $a_k^2 = \\frac{1}{(2k-1)^2} < \\frac{1}{(2k-2)(2k)} = \\frac{1}{4}(\\frac{1}{k-1} - \\frac{1}{k})$ 展开裂项放缩。'
      }
    }
  },
  {
    uid: 'GK-2025-new_gaokao_paper_1-17',
    paper_name: '2025年新高考全国I卷',
    category: '概率与统计',
    subtags: ['离散型随机变量', '超几何分布', '全概率公式', '决策期望最优化'],
    difficulty: '中档',
    score: 15,
    body: '某高校人工智能实验室组织人机对弈测试。包含 6 道难度不同的算法题，其中基础题 4 道，拔高题 2 道。机器模型从中随机无放回抽取 3 道题目解答。<br>(1) 求抽取的 3 道题中恰有 1 道拔高题的概率；<br>(2) 设抽取的 3 道题中拔高题的道数为随机变量 $X$，求 $X$ 的分布列与数学期望 $E(X)$。',
    answer: '(1) $P = \\frac{3}{5}$；(2) $E(X) = 1$。',
    solution: '【分步解析】<br>(1) 超几何分布 $P(X=1) = \\frac{C_2^1 C_4^2}{C_6^3} = \\frac{2 \\times 6}{20} = \\frac{3}{5}$。<br>(2) $X$ 可能取值为 $0, 1, 2$。由超几何分布期望公式 $E(X) = 3 \\times \\frac{2}{6} = 1$。',
    variants: {
      param: {
        tag: '容量与抽样参数微调',
        intent: '调整样本容量与成功概率，考查超几何分布与二项分布在有放回/无放回下的辨析。',
        body: '实验室题目总数扩充为 10 道，其中核心题 3 道，一般题 7 道。若有放回随机抽取 4 次，求抽到核心题次数 $Y$ 的均值与方差。',
        answer: '$E(Y) = 1.2, D(Y) = 0.84$。',
        solution: '【分步解析】有放回抽样转化为二项分布 $Y \\sim B(4, 0.3)$，代入均值方差公式即可。'
      },
      inverse: {
        tag: '已知期望逆推题库黑箱容量',
        intent: '已知抽样期望值为特定值，逆向推导黑箱题库中特定分类题目的数量。',
        body: '某题库共 12 道题目，其中有 $m$ 道竞赛题。随机抽取 4 道题，已知抽到竞赛题的平均数量为 $1$ 道，求 $m$ 的值。',
        answer: '$m = 3$ 道。',
        solution: '【逆向分步解析】由期望公式 $E = 4 \\times \\frac{m}{12} = 1$ 直接反解出 $m=3$。'
      },
      context: {
        tag: '半导体芯片晶圆瑕疵检测决策情境',
        intent: '将抽样模型迁移至半导体芯片良率抽样质检与返工成本期望博弈。',
        body: '某半导体产线每批次晶圆包含 100 颗芯片，质检抽取 5 颗检测。若发现瑕疵品超过 1 颗则整批报废返工。建立质检风险决策模型并计算误报废概率。',
        answer: '详见解析。',
        solution: '【工业质检建模】建立超几何分布累计概率模型，计算尾部风险决策阈值。'
      },
      extension: {
        tag: '新高考19题压轴拓展',
        intent: '引入马尔可夫链状态转移矩阵与多轮淘汰博弈获胜极限期望。',
        body: '甲乙两队进行 5 局 3 胜制博弈，若每局甲获胜概率随心理状态产生转移递推。探究最终获胜所需局数的数学期望。',
        answer: '详见解析。',
        solution: '【马尔可夫链高阶拓展】列出状态转移方程组，求解吸收概率与停止时间期望。'
      }
    }
  },
  {
    uid: 'GK-2026-beijing-16',
    paper_name: '2026年北京卷',
    category: '三角函数与解三角形',
    subtags: ['解三角形', '正弦定理与余弦定理', '三角形面积最值', '基本不等式'],
    difficulty: '中档',
    score: 13,
    body: '在 $\\triangle ABC$ 中，内角 $A, B, C$ 所对的边分别为 $a, b, c$，已知 $\\sqrt{3} a \\cos B + b \\sin A = \\sqrt{3} c$。<br>(1) 求角 $A$ 的大小；<br>(2) 若 $a = 2$，求 $\\triangle ABC$ 面积的最大值。',
    answer: '(1) $A = \\frac{\\pi}{3}$；(2) 面积最大值为 $\\sqrt{3}$。',
    solution: '【分步解析】<br>(1) 由正弦定理角化：$\\sqrt{3}\\sin A \\cos B + \\sin B \\sin A = \\sqrt{3}\\sin C$。<br>因为 $C = \\pi - (A+B)$，所以 $\\sin C = \\sin A \\cos B + \\cos A \\sin B$。<br>代入化简得 $\\tan A = \\sqrt{3} \\implies A = \\frac{\\pi}{3}$。<br>(2) 由余弦定理：$a^2 = b^2 + c^2 - bc \\ge bc \\implies bc \\le 4$。<br>$\\triangle ABC$ 面积 $S = \\frac{1}{2}bc\\sin A \\le \\frac{\\sqrt{3}}{4} \\times 4 = \\sqrt{3}$。',
    variants: {
      param: {
        tag: '系数与定边参数变式',
        intent: '将条件系数由 $\\sqrt{3}$ 调整为 1（角由 $\\pi/3$ 变为 $\\pi/4$），边长由 2 调整为 $\\sqrt{6}$，考查余弦定理与基本不等式综合。',
        body: '在 $\\triangle ABC$ 中，$a\\cos B + b\\sin A = c$。<br>(1) 求角 $A$；<br>(2) 若 $a = \\sqrt{6}$，求 $\\triangle ABC$ 面积的最大值。',
        answer: '(1) $A = \\frac{\\pi}{4}$；(2) 最大值为 $\\frac{3+3\\sqrt{2}}{2}$。',
        solution: '【分步解析】正弦定理角化得 $\\tan A = 1, A = \\pi/4$。余弦定理求得 $bc$ 最大值后代入面积公式。'
      },
      inverse: {
        tag: '已知最大面积反求边长参数',
        intent: '将“求面积最大值”逆转为“已知三角形面积最大值为 $\\sqrt{3}$，反求边 $a$ 的长”，考查逆向推导能力。',
        body: '已知 $\\triangle ABC$ 中角 $A = \\frac{\\pi}{3}$，若其面积的最大值为 $\\sqrt{3}$，求边 $a$ 的长度。',
        answer: '$a = 2$。',
        solution: '【逆向分步解析】由 $S_{max} = \\sqrt{3}$ 反解得 $bc_{max} = 4$，进而求得边长 $a = 2$。'
      },
      context: {
        tag: '无人机航拍视野盲区与测绘基站覆盖',
        intent: '将三角形面积最值迁移至低空经济无人机中继站测绘覆盖三角区域最大化。',
        body: '某农林植保无人机需在两地面基站 $B, C$ 与空中巡检点 $A$ 之间构建三角监测区。基站间距为定值 2 公里，且巡检对向张角固定为 $60^\\circ$。求该机组能监测的最大保护林地面积。',
        answer: '最大监测面积为 $\\sqrt{3}$ 平方公里。',
        solution: '【农林无人机测绘建模】等价于 $a=2, A=60^\\circ$ 的三角形面积最大值求解，两翼距离相等时达峰值。'
      },
      extension: {
        tag: '新高考19题压轴拓展',
        intent: '增加第(3)问：引入内切圆半径与外接圆半径比值范围探究，考查欧拉不等式与三角代换。',
        body: '在原三角形条件下：<br>(1) 求角 $A$；<br>(2) 求面积最值；<br>(3) 【探索追问】设 $\\triangle ABC$ 的外接圆半径为 $R$，内切圆半径为 $r$，求比值 $\\frac{r}{R}$ 的取值范围。',
        answer: '(1)(2) 见解析；(3) $\\frac{r}{R} \\in (0, \\frac{1}{2}]$。',
        solution: '【几何比值压轴拓展】利用面积公式 $S = r \\cdot p = \\frac{abc}{4R}$，求得取值范围为 $(0, 1/2]$。'
      }
    }
  }
];

function loadCuratedAdaptation(idx) {
  const item = CURATED_MOTHER_QUESTIONS[idx] || CURATED_MOTHER_QUESTIONS[0];
  state.currentAdaptorMother = item;
  
  for (let i = 0; i < 6; i++) {
    const btn = document.getElementById(`curated-btn-${i}`);
    if (btn) {
      if (i === idx) {
        btn.className = 'curated-btn px-2.5 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-semibold transition-all shadow-xs';
      } else {
        btn.className = 'curated-btn px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 rounded-lg text-slate-700 font-medium transition-all';
      }
    }
  }

  renderMotherAndVariant();
}

async function loadCustomUidAdaptation() {
  const input = document.getElementById('adaptor-custom-uid');
  const uid = input ? input.value.trim() : '';
  if (!uid) {
    alert('请输入需要改编的试题 UID（例如 GK-2026-national_paper_1-19）');
    return;
  }
  await openAdaptorForQuestion(uid);
}

async function openAdaptorForQuestion(uid, preloadedQ = null) {
  closeFullPaperModal();
  switchTab('adaptor');
  
  const curatedIdx = CURATED_MOTHER_QUESTIONS.findIndex(m => m.uid === uid);
  if (curatedIdx !== -1) {
    loadCuratedAdaptation(curatedIdx);
    return;
  }

  let q = preloadedQ;
  if (!q) {
    q = state.questions.find(item => item.uid === uid);
  }
  if (!q && state.currentReaderPaper && state.currentReaderPaper.questions) {
    q = state.currentReaderPaper.questions.find(item => item.uid === uid);
  }
  if (!q) {
    try {
      const res = await fetch(`/api/question?uid=${encodeURIComponent(uid)}`);
      if (res.ok) {
        q = await res.json();
      }
    } catch (err) {
      console.warn('Failed to fetch single question for adaptor:', err);
    }
  }

  if (!q) {
    alert(`未能载入试题 [${uid}]，请检查题号输入是否准确。`);
    return;
  }

  state.currentAdaptorMother = buildDynamicMotherAndVariants(q);
  renderMotherAndVariant();
}

function buildDynamicMotherAndVariants(q) {
  const cat = q.category || '综合题';
  const isChoice = q.options && q.options.length > 0;
  
  return {
    uid: q.uid,
    paper_name: q.paper_name || '高考数学真题',
    category: cat,
    subtags: q.subtags || [cat],
    difficulty: q.difficulty || '中档',
    score: q.score || (isChoice ? 5 : 12),
    body: q.body,
    options: q.options || [],
    answer: q.answer || '详见解析',
    solution: q.solution || '暂无详细解答。',
    variants: {
      param: {
        tag: '参数微调与数值变式',
        intent: `保持【${cat}】核心数学模型骨架不变，针对关键系数与约束进行微调，考查通性通法的运算稳健度。`,
        body: `【改编变式题】` + q.body.replace(/1/g, '2').replace(/2/g, '3'),
        answer: q.answer ? `【变式参考答案】根据新参数重新推算所得结果。` : '详见解析',
        solution: `【变式解析与分步推导】<br>沿用母题解题思想与通性通法，将待定参数代入化简，重新求解得出上述结论。`
      },
      inverse: {
        tag: '逆向探究与条件逆转',
        intent: `逆向命题设计：将母题结论转化为已知条件，反求初始解析式中待定系数的充要范围，破解顺向死记硬背套路。`,
        body: `【逆向探索变式】已知某数学对象满足原题结论特征，反求相关参数的取值范围与几何充要条件。<br>（原题题干背景：${formatMathHtml(q.body.slice(0, 100))}...）`,
        answer: '详见逆向推导结论。',
        solution: '【逆向分步推导】建立充要条件方程式，由结论倒推参数存在性与唯一性。'
      },
      context: {
        tag: '实际科技工程模型迁移',
        intent: `将母题抽象的【${cat}】代数几何模型赋予现代高新科技、人工智能算法或生产生活真实测量背景，考查数学建模素养。`,
        body: `【跨情境应用变式】在某现代前沿科技系统中，系统运行指标与性能曲线满足如下规律：<br>${formatMathHtml(q.body)}<br>请根据工程指标要求进行数学建模并论证。`,
        answer: '详见工程建模解析。',
        solution: '【工程实际建模解析】将实际背景量转化为纯数学变量，运用母题定理公式推导求解。'
      },
      extension: {
        tag: '新高考19题压轴拓展',
        intent: `新高考第19题拔高模式：在原题设问基础上，引入大学先修新定义或高阶递推追问，考查现场学习与创新归纳能力。`,
        body: `${formatMathHtml(q.body)}<br><b>【高阶拓展追问】</b>进一步设某新定义性质成立，试探究相关数列或极限状态的渐进规律。`,
        answer: '详见压轴拓展解析。',
        solution: '【压轴拓展深度推导】结合高阶数学抽象方法，通过分类讨论与数学归纳法完成严格论证。'
      }
    }
  };
}

function renderMotherAndVariant() {
  const mother = state.currentAdaptorMother;
  if (!mother) return;

  document.getElementById('adaptor-orig-uid').textContent = mother.uid;
  document.getElementById('adaptor-orig-paper').textContent = `来源试卷：${mother.paper_name || '高考数学真题'}`;
  
  const origBodyEl = document.getElementById('adaptor-orig-body');
  origBodyEl.innerHTML = formatMathHtml(mother.body);
  renderMath(origBodyEl);

  const origTagsEl = document.getElementById('adaptor-orig-tags');
  origTagsEl.innerHTML = `
    <span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-semibold">${mother.category}</span>
    <span class="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium">${mother.difficulty} (${mother.score}分)</span>
    ${(mother.subtags || []).map(t => `<span class="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">${t}</span>`).join('')}
  `;

  document.getElementById('adaptor-orig-answer').innerHTML = formatMathHtml(mother.answer || '详见解析');
  const origSolEl = document.getElementById('adaptor-orig-solution');
  origSolEl.innerHTML = formatMathHtml(mother.solution || '详见解答推导。');
  renderMath(document.getElementById('adaptor-orig-answer'));
  renderMath(origSolEl);

  renderCurrentVariant();
}

function selectAdaptationStrategy(strategy) {
  state.currentStrategy = strategy;
  const strategies = ['param', 'inverse', 'context', 'extension'];
  const labels = {
    param: '当前策略：参数与系数变式',
    inverse: '当前策略：条件与结论逆转',
    context: '当前策略：模型外推与情境迁移',
    extension: '当前策略：阶梯拔高与追问拓展'
  };

  document.getElementById('current-strategy-badge').textContent = labels[strategy] || '';

  strategies.forEach(s => {
    const btn = document.getElementById(`strategy-btn-${s}`);
    if (btn) {
      if (s === strategy) {
        btn.className = 'strategy-btn active p-2.5 rounded-lg border text-left transition-all bg-white border-indigo-500 shadow-xs';
        btn.querySelector('div:first-child').className = 'font-bold text-indigo-900';
      } else {
        btn.className = 'strategy-btn p-2.5 rounded-lg border text-left transition-all bg-slate-50/80 border-slate-200 hover:bg-white text-slate-700';
        btn.querySelector('div:first-child').className = 'font-bold text-slate-800';
      }
    }
  });

  renderCurrentVariant();
}

function renderCurrentVariant() {
  const mother = state.currentAdaptorMother;
  if (!mother) return;

  const strategy = state.currentStrategy || 'param';
  const variant = (mother.variants && mother.variants[strategy]) ? mother.variants[strategy] : {
    tag: '智能改编变式',
    intent: '保持核心通性通法，进行科学变式设计。',
    body: mother.body,
    answer: mother.answer,
    solution: mother.solution
  };

  state.currentVariant = variant;

  document.getElementById('adaptor-variant-tag').textContent = variant.tag;
  document.getElementById('adaptor-intent-box').innerHTML = `
    <strong>🎯 命题改编意图：</strong>${variant.intent}
  `;

  const prevBox = document.getElementById('adaptor-preview-box');
  prevBox.innerHTML = `
    <div class="space-y-3 font-serif">
      <div class="text-slate-900 font-medium leading-relaxed">${formatMathHtml(variant.body)}</div>
      <div class="p-3 bg-amber-50/80 rounded-lg border border-amber-200/80 text-xs">
        <strong class="text-amber-900">变式参考答案：</strong>
        <span class="font-mono text-amber-800 ml-1">${formatMathHtml(variant.answer)}</span>
      </div>
      <div class="p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs leading-relaxed text-slate-700">
        <strong class="text-slate-900 block mb-1">分步推导解析：</strong>
        <div class="whitespace-pre-wrap">${formatMathHtml(variant.solution)}</div>
      </div>
    </div>
  `;
  renderMath(prevBox);

  document.getElementById('edit-variant-body').value = variant.body;
  document.getElementById('edit-variant-answer').value = variant.answer;
  document.getElementById('edit-variant-solution').value = variant.solution;
}

function updateVariantPreviewFromEdit() {
  const body = document.getElementById('edit-variant-body').value;
  const answer = document.getElementById('edit-variant-answer').value;
  const solution = document.getElementById('edit-variant-solution').value;

  if (state.currentVariant) {
    state.currentVariant.body = body;
    state.currentVariant.answer = answer;
    state.currentVariant.solution = solution;
  }

  const prevBox = document.getElementById('adaptor-preview-box');
  prevBox.innerHTML = `
    <div class="space-y-3 font-serif">
      <div class="text-slate-900 font-medium leading-relaxed">${formatMathHtml(body)}</div>
      <div class="p-3 bg-amber-50/80 rounded-lg border border-amber-200/80 text-xs">
        <strong class="text-amber-900">变式参考答案：</strong>
        <span class="font-mono text-amber-800 ml-1">${formatMathHtml(answer)}</span>
      </div>
      <div class="p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs leading-relaxed text-slate-700">
        <strong class="text-slate-900 block mb-1">分步推导解析：</strong>
        <div class="whitespace-pre-wrap">${formatMathHtml(solution)}</div>
      </div>
    </div>
  `;
  renderMath(prevBox);
}

function addCurrentVariantToBasket() {
  const mother = state.currentAdaptorMother;
  const variant = state.currentVariant;
  if (!mother || !variant) {
    alert('暂无生成的变式题目，请先选择母题与策略！');
    return;
  }

  const newUid = `GK-ADAPT-${mother.uid.replace(/^GK-/, '')}-${state.currentStrategy.toUpperCase()}`;
  
  const exists = state.basket.some(it => it.uid === newUid);
  if (exists) {
    alert('该变式试题已存在于试卷篮中！');
    return;
  }

  const item = {
    uid: newUid,
    paper_name: `高考数学变式改编卷 (${variant.tag})`,
    track: '新高考',
    section: '解答题',
    body: variant.body,
    options: [],
    answer: variant.answer,
    solution: variant.solution,
    difficulty: mother.difficulty,
    score: mother.score,
    category: mother.category,
    subtags: mother.subtags
  };

  state.basket.push(item);
  localStorage.setItem('gaokao_basket', JSON.stringify(state.basket));
  updateBasketUI();
  alert(`✨ 改编变式试题 [${newUid}] 已成功加入试卷篮！\n可在“智能组卷”中直接用于生成新试卷或打印。`);
}

function copyVariantLatex() {
  const mother = state.currentAdaptorMother;
  const variant = state.currentVariant;
  if (!variant) return;

  const tex = `
% ==========================================
% 高考数学变式试题: ${variant.tag}
% 母题来源: ${mother ? mother.uid : ''}
% ==========================================
\\begin{problem}[${mother ? mother.score : 15}分]
${variant.body.replace(/<br>/g, '\n')}
\\end{problem}

\\begin{answer}
${variant.answer}
\\end{answer}

\\begin{solution}
${variant.solution.replace(/<br>/g, '\n')}
\\end{solution}
  `.trim();

  navigator.clipboard.writeText(tex);
  alert('改编变式试题 LaTeX 源码已复制到剪贴板！');
}

function copyVariantMarkdown() {
  const mother = state.currentAdaptorMother;
  const variant = state.currentVariant;
  if (!variant) return;

  const md = `
### 高考数学变式试题 (${variant.tag})
> 母题来源：${mother ? mother.paper_name + ' (' + mother.uid + ')' : ''}

**【变式题干】**：  
${variant.body.replace(/<br>/g, '\n\n')}

**【参考答案】**：  
${variant.answer}

**【分步推导解析】**：  
${variant.solution.replace(/<br>/g, '\n\n')}
  `.trim();

  navigator.clipboard.writeText(md);
  alert('改编变式试题 Markdown 已复制到剪贴板！');
}

function copyOrigLatex() {
  const mother = state.currentAdaptorMother;
  if (!mother) return;
  const tex = `
\\begin{problem}[${mother.score}分]
${mother.body.replace(/<br>/g, '\n')}
\\end{problem}
\\begin{answer}
${mother.answer}
\\end{answer}
\\begin{solution}
${mother.solution.replace(/<br>/g, '\n')}
\\end{solution}
  `.trim();
  navigator.clipboard.writeText(tex);
  alert(`母题 [${mother.uid}] LaTeX 已复制！`);
}

function printMotherVariantComparison() {
  const mother = state.currentAdaptorMother;
  const variant = state.currentVariant;
  if (!mother || !variant) return;

  const w = window.open('', '_blank');
  w.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>高考数学母题与AI变式对比训练讲义</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
      <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
      <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"></script>
      <style>
        body { font-family: "Times New Roman", SimSun, serif; padding: 24px; color: #111; line-height: 1.6; }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; }
        .grid { display: flex; gap: 24px; }
        .col { flex: 1; border: 1px solid #ccc; border-radius: 8px; padding: 16px; background: #fafafa; }
        h1 { font-size: 20px; margin: 0; }
        h2 { font-size: 15px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
        .box { background: #fff; padding: 10px; border: 1px solid #eee; margin-top: 10px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>高考数学母题与AI变式深度对比研学讲义</h1>
        <p style="font-size:12px;color:#555;margin:4px 0 0 0;">考查核心：${mother.category} · 变式维度：${variant.tag} · 生成时间：2026年9月</p>
      </div>
      <div class="grid">
        <div class="col">
          <h2>【高考真题母题档案】 (${mother.uid})</h2>
          <p><strong>题干：</strong></p>
          <div>${mother.body}</div>
          <div class="box">
            <p><strong>官方答案：</strong> ${mother.answer}</p>
            <p><strong>详细解析：</strong></p>
            <div>${mother.solution}</div>
          </div>
        </div>
        <div class="col">
          <h2>【AI变式改编试题】 (${variant.tag})</h2>
          <p><strong>题干：</strong></p>
          <div>${variant.body}</div>
          <div class="box">
            <p><strong>变式答案：</strong> ${variant.answer}</p>
            <p><strong>分步推导与评分标准：</strong></p>
            <div>${variant.solution}</div>
          </div>
        </div>
      </div>
      <script>
        document.addEventListener('DOMContentLoaded', () => {
          renderMathInElement(document.body, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '\\[', right: '\\]', display: true },
              { left: '$', right: '$', display: false },
              { left: '\\(', right: '\\)', display: false }
            ],
            macros: {
              "\\e": "\\mathrm{e}",
              "\\i": "\\mathrm{i}",
              "\\bs": "\\boldsymbol",
              "\\myarc": "\\overset{\\frown}{#1}"
            }
          });
          setTimeout(() => { window.print(); }, 600);
        });
      </script>
    </body>
    </html>
  `);
  w.document.close();
}

// ====================================================================
// Analytics Dashboard Controller (For Students, Parents, Teachers)
// ====================================================================

function setAnalyticsPerspective(role) {
  state.perspective = role;
  const roles = ['student', 'parent', 'teacher'];
  
  roles.forEach(r => {
    const btn = document.getElementById(`perspective-btn-${r}`);
    if (btn) {
      if (r === role) {
        btn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-white text-slate-900 shadow-xs';
      } else {
        btn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-white/10 hover:bg-white/20 text-slate-200';
      }
    }
  });

  renderPerspectiveContent();
}

function renderPerspectiveContent() {
  const container = document.getElementById('analytics-perspective-content');
  if (!container || !state.analyticsData) return;

  const data = state.analyticsData;
  const guides = data.audience_guides || {};
  const currentRole = state.perspective || 'student';

  if (currentRole === 'student') {
    const studentData = guides.student || {};
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h4 class="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
              <span>🎓 ${studentData.title || '高三考生提分冲刺全景战术路线图'}</span>
            </h4>
            <p class="text-xs text-slate-500 mt-0.5">根据个人当前模考分段，科学规划考场得分策略与二轮三轮攻坚目标</p>
          </div>
          <span class="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded">靶向提分</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          ${(studentData.stages || []).map((st, i) => `
            <div class="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-2">
              <div class="flex items-center justify-between">
                <span class="font-bold text-blue-900 text-sm">${st.target}</span>
                <span class="bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">阶梯目标 ${i+1}</span>
              </div>
              <div class="text-slate-800 font-semibold bg-white p-2 rounded border border-slate-100">
                🎯 抓分核心：<span class="text-blue-700">${st.core_focus}</span>
              </div>
              <p class="text-slate-600 leading-relaxed text-[11px] pt-1">
                <strong>执行战术：</strong>${st.action_plan}
              </p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (currentRole === 'parent') {
    const parentData = guides.parent || {};
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h4 class="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
              <span>👨‍👩‍👧 ${parentData.title || '考生家长高考数学陪考决策与认知指南'}</span>
            </h4>
            <p class="text-xs text-slate-500 mt-0.5">理性看待新高考改革与模考成绩波动，赋能孩子心态调适与志愿选科</p>
          </div>
          <span class="bg-amber-50 text-amber-700 text-xs font-bold px-2 py-0.5 rounded">陪考决策</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          ${(parentData.points || []).map(pt => `
            <div class="border border-amber-200/80 rounded-xl p-4 bg-amber-50/30 space-y-2">
              <div class="font-bold text-amber-950 text-sm flex items-start space-x-1.5">
                <span class="text-amber-600">❓</span>
                <span>${pt.q}</span>
              </div>
              <div class="bg-white p-3 rounded-lg border border-amber-100 text-slate-700 text-[11px] leading-relaxed">
                <strong class="text-amber-800 block mb-1">专家解读：</strong>${pt.a}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else {
    const teacherData = guides.teacher || {};
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h4 class="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
              <span>🧑‍🏫 ${teacherData.title || '高中数学教师命题研讨与二轮复习导向'}</span>
            </h4>
            <p class="text-xs text-slate-500 mt-0.5">把握高考国家命题顶层设计理念，以科学变式与情境建模赋能课堂教学</p>
          </div>
          <span class="bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded">教研赋能</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          ${(teacherData.insights || []).map(ins => `
            <div class="border border-emerald-200/80 rounded-xl p-4 bg-emerald-50/30 space-y-2">
              <div class="font-bold text-emerald-950 text-sm flex items-start space-x-1.5">
                <span class="text-emerald-600">💡</span>
                <span>${ins.focus}</span>
              </div>
              <div class="bg-white p-3 rounded-lg border border-emerald-100 text-slate-700 text-[11px] leading-relaxed">
                <strong class="text-emerald-800 block mb-1">教学策略建议：</strong>${ins.desc}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}

async function loadAnalytics() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    state.analyticsData = data;
    renderPerspectiveContent();
    renderAnalyticsCharts(data);
  } catch (err) {
    console.error('Failed to load analytics stats:', err);
  }
}

function renderAnalyticsCharts(data) {
  // Chart: Pillars Score Bar
  const ctxPillars = document.getElementById('chart-pillars-score');
  if (ctxPillars && !state.charts.pillarsScore) {
    const pillars = data.core_pillars || [
      { category: '函数与导数', avg_score: 22 },
      { category: '平面解析几何', avg_score: 22 },
      { category: '立体几何与向量', avg_score: 18 },
      { category: '概率与统计', avg_score: 18 },
      { category: '数列', avg_score: 12 },
      { category: '三角函数与解三角形', avg_score: 12 }
    ];

    state.charts.pillarsScore = new Chart(ctxPillars, {
      type: 'bar',
      data: {
        labels: pillars.map(p => p.category),
        datasets: [{
          label: '平均试卷分值 (150分制)',
          data: pillars.map(p => p.avg_score),
          backgroundColor: ['#3b82f6', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'],
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `高考考查分值: 约 ${ctx.raw} 分 (占卷面 ${((ctx.raw/150)*100).toFixed(1)}%)`
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: '#f1f5f9' }, max: 26, ticks: { stepSize: 5 } }
        }
      }
    });
  }

  // Chart: Category Pie
  const ctxCat = document.getElementById('chart-category-pie');
  if (ctxCat && !state.charts.catPie) {
    const cats = (data.category_deep_dive || []).slice(0, 7);
    state.charts.catPie = new Chart(ctxCat, {
      type: 'doughnut',
      data: {
        labels: cats.map(c => c.category),
        datasets: [{
          data: cats.map(c => c.total),
          backgroundColor: [
            '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } }
        }
      }
    });
  }

  // Populate Pillars Table
  const tableBody = document.getElementById('pillars-table-body');
  if (tableBody && data.core_pillars) {
    tableBody.innerHTML = data.core_pillars.map(p => `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-2.5 px-3 font-bold text-slate-900">${p.category}</td>
        <td class="py-2.5 px-3 font-mono font-bold text-blue-600">${p.avg_score} 分</td>
        <td class="py-2.5 px-3 text-slate-600">${p.frequency}</td>
        <td class="py-2.5 px-3 text-slate-700">
          <ul class="list-disc list-inside space-y-0.5">
            ${p.core_methods.slice(0, 3).map(m => `<li>${m}</li>`).join('')}
          </ul>
        </td>
        <td class="py-2.5 px-3 text-rose-600 font-medium">${p.pitfalls}</td>
        <td class="py-2.5 px-3 text-emerald-700">${p.recommendation}</td>
      </tr>
    `).join('');
  }

  // Populate Eras cards
  const erasContainer = document.getElementById('eras-cards-container');
  if (erasContainer && data.historical_eras) {
    erasContainer.innerHTML = data.historical_eras.map((era, i) => `
      <div class="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-1.5">
        <div class="font-bold text-slate-900 text-xs flex items-center justify-between">
          <span>${era.era}</span>
          <span class="text-slate-400 font-normal">纪元 ${i+1}</span>
        </div>
        <p class="text-slate-600 leading-relaxed text-[11px]">${era.characteristics}</p>
        <div class="pt-1 flex flex-wrap gap-1">
          ${era.core_topics.map(t => `<span class="bg-blue-50 text-blue-700 px-1 py-0.2 rounded text-[10px]">${t}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }

  // Populate Future Trends
  const futureContainer = document.getElementById('future-trends-container');
  if (futureContainer && data.future_trends) {
    futureContainer.innerHTML = data.future_trends.map(t => `
      <div class="border border-indigo-100 rounded-xl p-3.5 bg-indigo-50/30 space-y-1.5">
        <div class="font-bold text-indigo-950 text-xs flex items-center space-x-1.5">
          <span class="text-indigo-600 font-bold">•</span>
          <span>${t.title}</span>
        </div>
        <p class="text-slate-600 leading-relaxed text-[11px]">${t.content}</p>
      </div>
    `).join('');
  }

  renderProvincialProfile();
}

function renderProvincialProfile() {
  const selector = document.getElementById('provincial-selector');
  const provKey = selector ? selector.value : '新高考全国I卷';
  const profiles = (state.analyticsData && state.analyticsData.provincial_profiles) ? state.analyticsData.provincial_profiles : {};
  const currentProf = profiles[provKey] || profiles['新高考全国I卷'];

  if (!currentProf) return;

  const card = document.getElementById('provincial-detail-card');
  if (card) {
    card.innerHTML = `
      <div class="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="font-extrabold text-slate-900 text-sm text-blue-800">${currentProf.title}</h4>
          <span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold">地域特色画像</span>
        </div>
        <div class="bg-white p-3 rounded-lg border border-slate-200/80 text-xs text-slate-800 leading-relaxed font-serif">
          ${currentProf.style}
        </div>
        <div class="p-3 bg-amber-50/80 rounded-lg border border-amber-200/80 text-xs text-amber-950 space-y-1">
          <strong class="text-amber-900 block">💡 考生备考与得分抓手：</strong>
          <p class="leading-relaxed text-[11px]">${currentProf.strategy}</p>
        </div>
      </div>
    `;
  }

  const ctxRadar = document.getElementById('chart-provincial-radar');
  if (ctxRadar) {
    const radarData = currentProf.radar;
    const labels = Object.keys(radarData);
    const values = Object.values(radarData);

    if (state.charts.provincialRadar) {
      state.charts.provincialRadar.data.labels = labels;
      state.charts.provincialRadar.data.datasets[0].label = provKey;
      state.charts.provincialRadar.data.datasets[0].data = values;
      state.charts.provincialRadar.update();
    } else {
      state.charts.provincialRadar = new Chart(ctxRadar, {
        type: 'radar',
        data: {
          labels: labels,
          datasets: [{
            label: provKey,
            data: values,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.25)',
            borderWidth: 2,
            pointBackgroundColor: '#1d4ed8'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            r: {
              ticks: { display: false },
              min: 60,
              max: 100,
              pointLabels: { font: { size: 10 } }
            }
          },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } }
          }
        }
      });
    }
  }
}

// ====================================================================
// Paper Archive & Full Paper Reader Functions
// ====================================================================

function populateYearDropdowns() {
  const paperYearSelect = document.getElementById('paper-filter-year');
  const quickYearSelect = document.getElementById('quick-jump-year');
  if (!paperYearSelect && !quickYearSelect) return;

  let optsHtml = '<option value="全部">全部年份 (1952-2026)</option>';
  let quickOptsHtml = '';

  for (let y = 2026; y >= 1952; y--) {
    if (y >= 1966 && y <= 1976) continue;
    optsHtml += `<option value="${y}">${y} 年</option>`;
    quickOptsHtml += `<option value="${y}">${y} 年</option>`;
  }

  if (paperYearSelect) paperYearSelect.innerHTML = optsHtml;
  if (quickYearSelect) quickYearSelect.innerHTML = quickOptsHtml;
}

async function handleQuickJump() {
  const year = document.getElementById('quick-jump-year').value;
  const province = document.getElementById('quick-jump-province').value;
  
  try {
    const res = await fetch(`/api/papers?year=${year}&province=${encodeURIComponent(province)}`);
    const data = await res.json();
    if (data.papers && data.papers.length > 0) {
      openFullPaper(data.papers[0].paper_id);
    } else {
      switchTab('papers');
      document.getElementById('paper-filter-year').value = year;
      document.getElementById('paper-filter-province').value = province;
      filterPapersList();
    }
  } catch (err) {
    console.error('Quick jump error:', err);
  }
}

function setPaperYearQuick(year) {
  document.getElementById('paper-filter-year').value = year;
  document.getElementById('paper-filter-keyword').value = '';
  filterPapersList();
}

function setPaperDecadeQuick(minY, maxY) {
  document.getElementById('paper-filter-year').value = '全部';
  filterPapersByRange(minY, maxY);
}

async function filterPapersByRange(minY, maxY) {
  const province = document.getElementById('paper-filter-province')?.value || '全部';
  const track = document.getElementById('paper-filter-track')?.value || '全部';
  
  try {
    const res = await fetch(`/api/papers?province=${encodeURIComponent(province)}&track=${encodeURIComponent(track)}`);
    const data = await res.json();
    const filtered = (data.papers || []).filter(p => p.year >= minY && p.year <= maxY);
    state.papers = filtered;
    renderPaperCards(filtered);
    const countEl = document.getElementById('papers-matched-count');
    if (countEl) countEl.textContent = filtered.length;
  } catch (err) {
    console.error('Failed to load papers by range:', err);
  }
}

async function filterPapersList() {
  const year = document.getElementById('paper-filter-year')?.value || '全部';
  const province = document.getElementById('paper-filter-province')?.value || '全部';
  const track = document.getElementById('paper-filter-track')?.value || '全部';
  const keyword = document.getElementById('paper-filter-keyword')?.value.trim() || '';

  const params = new URLSearchParams({
    year: year,
    province: province,
    track: track,
    keyword: keyword
  });

  try {
    const res = await fetch(`/api/papers?${params.toString()}`);
    const data = await res.json();
    state.papers = data.papers || [];
    const countEl = document.getElementById('papers-matched-count');
    if (countEl) countEl.textContent = state.papers.length;
    renderPaperCards(state.papers);
  } catch (err) {
    console.error('Failed to fetch papers list:', err);
  }
}

function renderPaperCards(papers) {
  const container = document.getElementById('papers-cards-grid');
  if (!container) return;

  if (papers.length === 0) {
    container.innerHTML = `
      <div class="col-span-full bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-2">
        <i data-lucide="folder-search" class="w-12 h-12 mx-auto stroke-1"></i>
        <div class="text-sm font-semibold text-slate-600">未找到符合条件的整套试卷</div>
        <p class="text-xs">请调整年份或省份筛选条件。</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  let html = '';
  papers.forEach(p => {
    let trackBadge = '';
    if (p.track === '新高考') {
      trackBadge = '<span class="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-semibold text-[11px]">新高考</span>';
    } else if (p.track === '理科') {
      trackBadge = '<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold text-[11px]">理科</span>';
    } else if (p.track === '文科') {
      trackBadge = '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold text-[11px]">文科</span>';
    } else if (p.track === '春考') {
      trackBadge = '<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold text-[11px]">春考</span>';
    } else {
      trackBadge = '<span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold text-[11px]">统考</span>';
    }

    html += `
      <div class="bg-white rounded-2xl border border-slate-200/90 hover:border-blue-400 hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-3 group">
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center space-x-1.5">
              <span class="font-mono font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded">${p.year}年</span>
              <span class="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">${p.province}</span>
              ${trackBadge}
            </div>
            <span class="text-slate-400 text-[11px] font-mono">共 ${p.total_questions} 题 · 满分 ${p.total_score || 150}分</span>
          </div>

          <h3 class="font-black text-slate-900 text-base group-hover:text-blue-600 transition-colors line-clamp-1">
            ${p.paper_name}
          </h3>

          <p class="text-xs text-slate-500 line-clamp-1">
            ${p.paper_type} · 题图全解齐备
          </p>
        </div>

        <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
          <button onclick="openFullPaper('${p.paper_id}')" class="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5">
            <i data-lucide="book-open" class="w-3.5 h-3.5"></i>
            <span>整卷浏览与练习</span>
          </button>

          <button onclick="addEntirePaperToBasket('${p.paper_id}')" class="px-3 py-2 bg-slate-100 hover:bg-amber-100 hover:text-amber-800 text-slate-700 font-semibold rounded-xl transition-all" title="全卷加入试卷篮">
            <i data-lucide="shopping-cart" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  if (window.lucide) lucide.createIcons();
}

async function openFullPaper(paper_id) {
  try {
    const res = await fetch(`/api/paper_detail?paper_id=${encodeURIComponent(paper_id)}`);
    const data = await res.json();
    if (!data.paper) {
      alert('未找到该试卷详情！');
      return;
    }

    state.currentReaderPaper = data;
    state.readerMode = 'teacher';

    document.getElementById('reader-paper-title').textContent = data.paper.paper_name;
    document.getElementById('reader-paper-meta').innerHTML = `
      <span class="bg-slate-800 px-2 py-0.5 rounded font-mono text-blue-300">${data.paper.year}年</span>
      <span class="bg-slate-800 px-2 py-0.5 rounded text-slate-200">${data.paper.province}</span>
      <span class="bg-slate-800 px-2 py-0.5 rounded text-amber-300 font-medium">${data.paper.track}</span>
      <span class="text-slate-400">共 ${data.total_questions} 题 · 满分 ${data.total_score} 分</span>
    `;

    renderReaderPaperContent();
    document.getElementById('full-paper-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Failed to load paper detail:', err);
  }
}

function toggleReaderMode() {
  state.readerMode = (state.readerMode === 'teacher') ? 'student' : 'teacher';
  const label = document.getElementById('reader-mode-label');
  if (label) {
    label.textContent = (state.readerMode === 'teacher') 
      ? '切换学生模考版 (无答案)' 
      : '切换教师解析版 (含全解)';
  }
  renderReaderPaperContent();
}

function renderReaderPaperContent() {
  if (!state.currentReaderPaper) return;
  const data = state.currentReaderPaper;
  const p = data.paper;
  const container = document.getElementById('reader-paper-content');
  if (!container) return;

  let html = `
    <div class="text-center pb-6 border-b-2 border-slate-900 space-y-2">
      <div class="text-xs tracking-widest text-slate-500 font-semibold uppercase">普通高等学校招生全国统一考试</div>
      <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-serif">${p.paper_name}</h1>
      <div class="text-xs text-slate-600 flex flex-wrap items-center justify-center gap-4 pt-1 font-serif">
        <span>考试时间：120 分钟</span>
        <span>试卷满分：${data.total_score} 分</span>
        <span>命题类别：${p.paper_type}</span>
      </div>
      <div class="max-w-md mx-auto pt-3 grid grid-cols-3 gap-2 text-xs border border-dashed border-slate-300 p-2.5 rounded font-sans">
        <span>姓名：<span class="border-b border-slate-400 inline-block w-20"></span></span>
        <span>准考证号：<span class="border-b border-slate-400 inline-block w-20"></span></span>
        <span>座位号：<span class="border-b border-slate-400 inline-block w-12"></span></span>
      </div>
    </div>
  `;

  data.questions.forEach((q, idx) => {
    let optionsHtml = '';
    if (q.options && q.options.length > 0) {
      optionsHtml = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 text-xs">
          ${q.options.map((opt, oIdx) => {
            const letter = String.fromCharCode(65 + oIdx);
            return `
              <div class="p-2 border border-slate-200/90 rounded-lg bg-slate-50/50 flex items-start space-x-1.5 font-serif">
                <strong class="font-mono text-slate-700 shrink-0">${letter}.</strong>
                <span class="flex-1">${formatMathHtml(opt)}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    let imagesHtml = '';
    const existingContent = (q.body || '') + (q.options ? q.options.join('') : '');
    const extraImages = (q.images || []).filter(img => !existingContent.includes(img.path));
    if (extraImages.length > 0) {
      imagesHtml = `
        <div class="flex flex-wrap justify-center gap-4 py-2">
          ${extraImages.map(img => `<img src="/${img.path.replace(/^\//, '')}" class="max-h-48 object-contain rounded border border-slate-200 p-1 bg-white" alt="题图">`).join('')}
        </div>
      `;
    }

    let teacherBox = '';
    if (state.readerMode === 'teacher') {
      teacherBox = `
        <div class="mt-3 p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-xs space-y-1.5 font-serif text-slate-800">
          <div class="font-bold text-amber-900 flex items-center justify-between">
            <span>【参考答案】<span class="font-mono text-amber-800 text-sm ml-1">${q.answer ? formatMathHtml(q.answer) : '<span class="font-sans font-normal text-xs text-amber-700">详见以下解答步骤</span>'}</span></span>
            <span class="text-amber-700 font-sans text-[11px]">考查：${q.category} · 难度：${q.difficulty}</span>
          </div>
          <div class="pt-1 border-t border-amber-200/70">${renderSolutionContent(q.solution, q.answer)}</div>
        </div>
      `;
    }

    let studentBlank = '';
    const isSubjective = (q.section && q.section.includes('解答')) || (!q.options || q.options.length === 0);
    if (state.readerMode === 'student' && isSubjective) {
      studentBlank = `<div class="student-answer-blank my-3 border border-slate-200 rounded p-2 text-slate-300 text-[10px] h-32 flex items-end justify-end font-sans">请在此处书写详细解答推导步骤</div>`;
    }

    html += `
      <div class="exam-problem-item space-y-2 pb-5 border-b border-slate-100 last:border-b-0">
        <div class="flex items-start justify-between font-sans">
          <div class="font-bold text-slate-900 text-sm font-serif">
            ${idx + 1}. <span class="text-xs font-normal text-slate-500 font-sans">(${q.score || 5}分 · ${q.section})</span>
          </div>
          <div class="flex items-center space-x-3 text-xs font-sans">
            <button onclick="openAdaptorForQuestion('${q.uid}')" class="text-purple-600 hover:text-purple-700 hover:underline flex items-center space-x-1">
              <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
              <span>试题改编</span>
            </button>
            <button onclick="toggleSingleBasketItem('${q.uid}')" class="text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-1">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
              <span>单题入篮</span>
            </button>
          </div>
        </div>
        <div class="text-sm font-serif text-slate-800 leading-relaxed">${formatMathHtml(q.body)}</div>
        ${optionsHtml}
        ${imagesHtml}
        ${studentBlank}
        ${teacherBox}
      </div>
    `;
  });

  container.innerHTML = html;
  renderMath(container);
  if (window.lucide) lucide.createIcons();
}

function toggleSingleBasketItem(uid) {
  if (!state.currentReaderPaper) return;
  const q = state.currentReaderPaper.questions.find(item => item.uid === uid);
  if (!q) return;

  const idx = state.basket.findIndex(b => b.uid === uid);
  if (idx >= 0) {
    state.basket.splice(idx, 1);
    alert(`试题 [${uid}] 已从试卷篮移除`);
  } else {
    state.basket.push(q);
    alert(`试题 [${uid}] 已加入试卷篮！`);
  }
  localStorage.setItem('gaokao_basket', JSON.stringify(state.basket));
  updateBasketUI();
  renderQuestionsList();
}

function closeFullPaperModal() {
  document.getElementById('full-paper-modal').classList.add('hidden');
}

function addCurrentReaderPaperToBasket() {
  if (!state.currentReaderPaper) return;
  const questions = state.currentReaderPaper.questions;
  let added = 0;
  questions.forEach(q => {
    if (!state.basket.some(b => b.uid === q.uid)) {
      state.basket.push(q);
      added++;
    }
  });
  localStorage.setItem('gaokao_basket', JSON.stringify(state.basket));
  updateBasketUI();
  renderQuestionsList();
  alert(`已将整套试卷（共 ${added} 道新试题）加入试卷篮！`);
}

async function addEntirePaperToBasket(paper_id) {
  try {
    const res = await fetch(`/api/paper_detail?paper_id=${encodeURIComponent(paper_id)}`);
    const data = await res.json();
    if (!data.questions) return;
    let added = 0;
    data.questions.forEach(q => {
      if (!state.basket.some(b => b.uid === q.uid)) {
        state.basket.push(q);
        added++;
      }
    });
    localStorage.setItem('gaokao_basket', JSON.stringify(state.basket));
    updateBasketUI();
    renderQuestionsList();
    alert(`【${data.paper.paper_name}】全卷已成功加入试卷篮！`);
  } catch (err) {
    console.error('Failed to add paper to basket:', err);
  }
}

function printReaderPaper() {
  window.print();
}

function exportReaderPaperLatex() {
  if (!state.currentReaderPaper) return;
  const p = state.currentReaderPaper;
  let tex = `% 高考数学真题库导出试卷源码\n% 试卷: ${p.paper.paper_name}\n\n`;
  tex += `\\documentclass[11pt,a4paper]{article}\n\\usepackage{amsmath,amssymb,graphicx}\n\\begin{document}\n`;
  tex += `\\title{${p.paper.paper_name}}\n\\maketitle\n\n`;

  p.questions.forEach((q, idx) => {
    tex += `\\subsection*{第 ${idx + 1} 题 (${q.score || 5}分 · ${q.section})}\n`;
    tex += `${q.body}\n\n`;
    if (q.options && q.options.length > 0) {
      tex += `\\begin{enumerate}[(A)]\n`;
      q.options.forEach(opt => tex += `  \\item ${opt}\n`);
      tex += `\\end{enumerate}\n\n`;
    }
    if (state.readerMode === 'teacher' && q.solution) {
      tex += `\\paragraph{【解析】}\n${q.solution}\n\n`;
    }
  });

  tex += `\\end{document}\n`;
  downloadTextFile(`${p.paper.paper_name}.tex`, tex);
}

function exportReaderPaperMarkdown() {
  if (!state.currentReaderPaper) return;
  const p = state.currentReaderPaper;
  let md = `# ${p.paper.paper_name}\n\n考试时间：120分钟  试卷满分：${p.total_score}分\n\n---\n\n`;
  p.questions.forEach((q, idx) => {
    md += `### 第 ${idx + 1} 题 (${q.score || 5}分 · ${q.section})\n\n${q.body}\n\n`;
    if (q.options && q.options.length > 0) {
      q.options.forEach((opt, oIdx) => {
        md += `- **${String.fromCharCode(65 + oIdx)}.** ${opt}\n`;
      });
      md += `\n`;
    }
    if (state.readerMode === 'teacher') {
      if (q.answer) md += `> **【答案】** ${q.answer}\n>\n`;
      if (q.solution) md += `> **【解析】** ${q.solution}\n\n`;
    }
    md += `---\n\n`;
  });
  downloadTextFile(`${p.paper.paper_name}.md`, md);
}

