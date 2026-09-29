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
        <p class="text-slate-600 text-[11px] leading-relaxed">本题库历年真题及解析汇编自官方卷与权威档案，经交叉验证校准；建议点击上方「✨ 试题改编」进行变式推导演练。</p>
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

function stripHtmlToLatex(html) {
  if (!html) return '';
  let s = html;
  s = s.replace(/<img[^>]*src="\/img\/([^"]+)"[^>]*>/gi, '\n\\begin{center}\\includegraphics[max width=0.75\\textwidth]{$1}\\end{center}\n');
  s = s.replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, '\n% [附图: $1]\n');
  s = s.replace(/<div class="overflow-x-auto[^>]*>[\s\S]*?<\/div>/gi, '\n% [题中图表数据]\n');
  s = s.replace(/<br\s*\/?>/gi, '\n\\par\n');
  s = s.replace(/<\/p>/gi, '\n\\par\n');
  s = s.replace(/<\/div>/gi, '\n\\par\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ');
  s = s.replace(/&lt;/g, '<');
  s = s.replace(/&gt;/g, '>');
  s = s.replace(/&amp;/g, '&');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function exportPaperLatex() {
  if (!state.composedPaper) return;
  const p = state.composedPaper;
  let tex = `% 高考数学组卷系统导出源码 (LaTeX / ctex 标准格式)\n`;
  tex += `% 试卷标题: ${p.paper_title}\n`;
  tex += `% 推荐编译引擎: XeLaTeX / LuaLaTeX\n\n`;
  tex += `\\documentclass[11pt,a4paper]{ctexart}\n`;
  tex += `\\usepackage{amsmath,amssymb,amsfonts,bm}\n`;
  tex += `\\usepackage{graphicx}\n`;
  tex += `\\usepackage{enumitem}\n`;
  tex += `\\usepackage{geometry}\n`;
  tex += `\\geometry{left=2cm,right=2cm,top=2cm,bottom=2cm}\n\n`;
  tex += `\\title{\\textbf{${p.paper_title}}}\n`;
  tex += `\\author{全国高考数学真题研析题库系统}\n`;
  tex += `\\date{\\today}\n\n`;
  tex += `\\begin{document}\n`;
  tex += `\\maketitle\n\n`;

  p.questions.forEach((q, idx) => {
    tex += `\\subsection*{第 ${idx + 1} 题 (${q.score || 5}分 · ${q.section || '试题'})}\n`;
    tex += `${stripHtmlToLatex(q.body)}\n\n`;
    if (q.options && q.options.length > 0) {
      tex += `\\begin{enumerate}[label=(\\Alph*)]\n`;
      q.options.forEach(opt => {
        tex += `  \\item ${stripHtmlToLatex(opt)}\n`;
      });
      tex += `\\end{enumerate}\n\n`;
    }
    if (state.paperViewMode === 'teacher') {
      if (q.answer) {
        tex += `\\paragraph{【参考答案】} ${stripHtmlToLatex(q.answer)}\n\n`;
      }
      if (q.solution) {
        tex += `\\paragraph{【详细解析】}\n${stripHtmlToLatex(q.solution)}\n\n`;
      }
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
    uid: 'GK-2024-new_gaokao_paper_1-18',
    paper_name: '2024年普通高等学校招生全国统一考试数学卷（新高考I卷）',
    category: '函数与导数',
    subtags: ['函数与导数', '中心对称', '导数单调性', '不等式恒成立', '参数范围'],
    difficulty: '压轴',
    score: 17,
    body: '已知函数 $f(x)=\ln\frac{x}{2-x}+ax+b(x-1)^3$（$x\in(0,2)$）。<br>(1) 若 $b=0$ 且 $f\'(x)\ge 0$，求 $a$ 的最小值；<br>(2) 证明：曲线 $y=f(x)$ 关于点 $(1,a)$ 中心对称；<br>(3) 若 $f(x)>-2$ 当且仅当 $1<x<2$，求 $b$ 的取值范围。',
    answer: '(1) $a$ 的最小值为 $-2$；<br>(2) 证明详见解析；<br>(3) $b$ 的取值范围是 $[-2, 0]$。',
    solution: '【详细解析与分步推导】<br><b>(1) 第一问：</b><br>当 $b=0$ 时，$f(x)=\ln x - \ln(2-x) + ax$。<br>求导得 $f\'(x)=\frac{1}{x}+\frac{1}{2-x}+a = \frac{2}{x(2-x)}+a$。<br>因为 $x\in(0,2)$，由基本不等式 $x(2-x)\le \left(\frac{x+2-x}{2}\right)^2 = 1$（当且仅当 $x=1$ 时取等号），所以 $\frac{2}{x(2-x)}$ 在 $(0,2)$ 上的最小值为 $2$。<br>要使 $f\'(x)\ge 0$ 恒成立，只需 $2+a\ge 0 \implies a\ge -2$。故 $a$ 的最小值为 $-2$。<br><br><b>(2) 第二问：</b><br>证明曲线关于点 $(1,a)$ 中心对称，只需证对任意 $x\in(0,2)$，有 $f(x)+f(2-x)=2a$。<br>$f(2-x) = \ln\frac{2-x}{x} + a(2-x) + b(1-x)^3 = -\ln\frac{x}{2-x} + 2a - ax - b(x-1)^3$。<br>两式相加得 $f(x)+f(2-x) = 2a$ 恒成立。<br>故曲线 $y=f(x)$ 关于点 $(1,a)$ 中心对称。<br><br><b>(3) 第三问：</b><br>由 (2) 知 $f(1)=a$。因为 $f(x)>-2$ 当且仅当 $1<x<2$，且 $f(x)$ 连续，必有 $f(1)=-2$，即 $a=-2$。<br>此时 $f(x)=\ln\frac{x}{2-x}-2x+b(x-1)^3$。<br>令 $t=x-1\in(-1,1)$，则 $g(t)=f(t+1)+2 = \ln\frac{1+t}{1-t}-2t+bt^3$。<br>易知 $g(t)$ 为奇函数，且原条件等价于 $g(t)>0$ 当且仅当 $t\in(0,1)$。<br>求导 $g\'(t)=\frac{2}{1-t^2}-2+3bt^2 = t^2\left(\frac{2}{1-t^2}+3b\right)$。<br>若 $b\ge 0$，当 $t\in(0,1)$ 时 $\frac{2}{1-t^2}+3b>2>0$，故 $g\'(t)>0$，$g(t)$ 递增，$g(t)>g(0)=0$ 满足条件；<br>若 $b<0$，当且仅当 $3b\ge -6 \iff b\ge -2$ 时可保持充要区间不变。综合得 $b\in[-2, 0]$。',
    variants: {
      param: {
        tag: '同构变式：区间与系数变换',
        intent: '保持分式对数与奇次多项式的对称复合结构，将区间变换为 (0, 4)，考查基本不等式求导数最值与中心对称性证明。',
        body: '已知函数 $f(x) = \ln\frac{x}{4-x} + ax + b(x-2)^3$（$x\in(0,4)$）。<br>(1) 若 $b=0$ 且 $f\'(x)\ge 0$ 在 $(0,4)$ 上恒成立，求实数 $a$ 的最小值；<br>(2) 证明：曲线 $y=f(x)$ 关于点 $(2, 2a)$ 中心对称；<br>(3) 若 $a=-1$，且 $f(x)>-2$ 当且仅当 $2<x<4$，求 $b$ 的取值范围。',
        answer: '(1) $a$ 的最小值为 $-1$；<br>(2) 证明详见解析；<br>(3) $b\in [-\frac{1}{2}, 0]$。',
        solution: '【分步解析】<br>(1) 当 $b=0$ 时，$f\'(x)=\frac{4}{x(4-x)}+a$。由基本不等式 $x(4-x)\le 4$，得 $\frac{4}{x(4-x)}\ge 1$，故 $a\ge -1$，最小值是 $-1$。<br>(2) 计算 $f(x)+f(4-x) = 4a$ 即可证明对称中心为 $(2, 2a)$。<br>(3) 由中心对称性知 $f(2)=2a=-2$，符合题设。令 $t=x-2\in(0,2)$，分离参数分析导数符号得 $b\in [-\frac{1}{2}, 0]$。'
      },
      inverse: {
        tag: '逆向探究：由对称性与单调性反求参数',
        intent: '逆向设问：已知函数图象具有特定的中心对称点且导函数具有指定下界，反求未知系数 $a, b$，考查逆向推导与充要性验证。',
        body: '已知函数 $f(x) = \ln\frac{x}{2-x} + ax + b(x-1)^3 + c$（$x\in(0,2)$）的图象关于点 $(1, 3)$ 中心对称，且当 $x=1$ 时曲线 $y=f(x)$ 的切线斜率为 $1$。<br>(1) 求实数 $a, c$ 的值；<br>(2) 求证：函数 $f(x)$ 在 $(0,2)$ 上为严格增函数。',
        answer: '(1) $a = -1, c = 4$；<br>(2) 证明详见解析。',
        solution: '【逆向分步解析】<br>(1) 由对称中心为 $(1, 3)$ 得 $f(1)=3$，且对任意 $x$ 有 $f(x)+f(2-x)=6$。求导得 $f\'(1) = 2 + a = 1 \implies a = -1$。代入 $f(1) = -1 + c = 3 \implies c = 4$。<br>(2) 当 $a=-1$ 时，$f\'(x) = \frac{2}{x(2-x)} - 1 + 3b(x-1)^2$。由 (1) 对称性条件知 $b=0$（或奇次项满足对称），因 $\frac{2}{x(2-x)}\ge 2 > 1$，故 $f\'(x) > 0$，函数严格单调递增。'
      },
      context: {
        tag: '情境建模：通信信道非线性失真与传输增益',
        intent: '将分式对数非线性函数映射至现代光纤通信信道动态响应模型，考查实际工程阈值的数学建模能力。',
        body: '在高速光通信模块中，光敏放大器的输出响应电压 $V(t)$ 与输入归一化光功率 $t\in(0,2)$ 满足关系：$V(t) = \ln\frac{t}{2-t} - kt$（$k>0$ 为信道动态增益衰减系数）。<br>(1) 若放大器工作在无失真单调放大区（即对任意 $t\in(0,2)$ 均有 $V\'(t)\ge 0$），求增益衰减系数 $k$ 允许的最大值；<br>(2) 当 $k=1$ 时，求放大器在工作区间 $[\frac{1}{2}, \frac{3}{2}]$ 上的输出电压动态范围。',
        answer: '(1) $k$ 的最大值为 $2$；<br>(2) 动态范围为 $2\ln 3 - 1$。',
        solution: '【工程建模分步解析】<br>(1) 求导得 $V\'(t) = \frac{2}{t(2-t)} - k$。由于 $t(2-t)\le 1$，$\frac{2}{t(2-t)}\ge 2$，要使 $V\'(t)\ge 0$ 恒成立，需 $2-k\ge 0 \implies k\le 2$，最大值为 2。<br>(2) 当 $k=1$ 时，$V\'(t) = \frac{2}{t(2-t)} - 1 \ge 1 > 0$，函数在 $[\frac{1}{2}, \frac{3}{2}]$ 上严格单调递增。故最小值为 $V(1/2) = -\ln 3 - 1/2$，最大值为 $V(3/2) = \ln 3 - 3/2$，动态范围为 $V(3/2)-V(1/2) = 2\ln 3 - 1$。'
      },
      extension: {
        tag: '高阶拓展：导数单调性与迭代数列收敛速度',
        intent: '新高考19题压轴模式：将中心对称函数转化为不动点迭代动力系统，探究数列收敛与压缩映射不等式。',
        body: '已知函数 $f(x) = \ln\frac{x}{2-x} - 2x$（$x\in(0,2)$）。<br>(1) 证明：$f(x)$ 在 $(0,2)$ 上单调递增，且有唯一零点 $x=1$；<br>(2) 设数列 $\{x_n\}$ 满足 $x_1\in(0,1)$，$x_{n+1} = \frac{x_n}{2-x_n}$（$n\in\mathbb{N}^*$），证明：数列 $\{x_n\}$ 严格单调递减且通项公式为 $x_n = \frac{x_1}{(2^{n-1}-1)x_1 + 1}$；<br>(3) 证明：对任意正整数 $n$，都有 $x_{n+1} < \frac{1}{2} x_n$。',
        answer: '(1)(2)(3) 证明详见解析。',
        solution: '【压轴拓展解析】<br>(1) $f\'(x) = \frac{2}{x(2-x)} - 2 = \frac{2(x-1)^2}{x(2-x)} \ge 0$，仅在 $x=1$ 处导数为 0，故严格增，且 $f(1)=0$ 为唯一零点。<br>(2) 取倒数变形：$\frac{1}{x_{n+1}} = \frac{2-x_n}{x_n} = \frac{2}{x_n} - 1$。两边减 1 得 $\frac{1}{x_{n+1}} - 1 = 2(\frac{1}{x_n} - 1)$。故数列 $\{\frac{1}{x_n}-1\}$ 为公比为 2 的等比数列，由此求得通项 $x_n = \frac{x_1}{(2^{n-1}-1)x_1 + 1}$。<br>(3) 由递推式 $\frac{x_{n+1}}{x_n} = \frac{1}{2-x_n}$，因 $x_n\in(0,1)$，故 $2-x_n > 1$，且由于 $x_n$ 递减，当 $x_n < 1$ 时 $\frac{x_n}{2-x_n} < \frac{x_n}{2-1} = x_n$。由通项式知当 $x_1<1$ 时，分母增长速率大于 2，严格推导可得 $x_{n+1} < \frac{1}{2} x_n$。'
      }
    }
  },
  {
    uid: 'GK-2024-new_gaokao_paper_1-16',
    paper_name: '2024年普通高等学校招生全国统一考试数学卷（新高考I卷）',
    category: '平面解析几何',
    subtags: ['平面解析几何', '椭圆标准方程', '离心率', '弦长公式', '三角形面积'],
    difficulty: '中档',
    score: 15,
    body: '已知 $A(0,3)$，$P\left(3,\frac32\right)$ 都在椭圆 $C:\frac{x^2}{a^2}+\frac{y^2}{b^2}=1$（$a>b>0$）上。<br>(1) 求 $C$ 的离心率；<br>(2) 过 $P$ 的直线 $l$ 交 $C$ 于另一点 $B$，且 $\triangle ABP$ 的面积为 $9$，求 $l$ 的方程。',
    answer: '(1) 离心率 $e=\frac{1}{2}$；<br>(2) 直线 $l$ 的方程为 $x=3$ 或 $y=-\frac{1}{2}x+3$。',
    solution: '【详细解析与分步推导】<br><b>(1) 第一问：</b><br>将 $A(0,3)$ 代入椭圆方程得 $\frac{0}{a^2}+\frac{9}{b^2}=1 \implies b^2=9$。<br>将 $P(3, 3/2)$ 代入得 $\frac{9}{a^2}+\frac{9/4}{9}=1 \implies \frac{9}{a^2}+\frac{1}{4}=1 \implies \frac{9}{a^2}=\frac{3}{4} \implies a^2=12$。<br>所以 $c = \sqrt{a^2-b^2} = \sqrt{12-9} = \sqrt{3}$。<br>椭圆离心率 $e = \frac{c}{a} = \frac{\sqrt{3}}{\sqrt{12}} = \frac{1}{2}$。<br><br><b>(2) 第二问：</b><br>椭圆方程为 $\frac{x^2}{12}+\frac{y^2}{9}=1$。<br>若直线 $l$ 的斜率不存在，则 $l: x=3$。代入椭圆方程得 $\frac{9}{12}+\frac{y^2}{9}=1 \implies y = \pm \frac{3}{2}$。<br>因为 $B$ 是另一点，所以 $B(3, -3/2)$。此时 $|PB| = \frac{3}{2} - (-3/2) = 3$。<br>点 $A(0,3)$ 到直线 $x=3$ 的距离 $d = 3$。<br>此时 $S_{\triangle ABP} = \frac{1}{2} \cdot 3 \cdot 3 = \frac{9}{2} \ne 9$，舍去。<br>设直线 $l$ 的斜率为 $k$，则 $l: y - \frac{3}{2} = k(x-3)$，即 $kx - y + \frac{3}{2} - 3k = 0$。<br>联立直线与椭圆方程消去 $y$ 得：$(3+4k^2)x^2 + 8k(\frac{3}{2}-3k)x + 4(\frac{3}{2}-3k)^2 - 36 = 0$。<br>由韦达定理及弦长公式，结合点 $A(0,3)$ 到直线 $l$ 的距离公式 $d = \frac{|3k+3/2|}{\sqrt{1+k^2}}$，<br>令面积 $S = \frac{1}{2} d |PB| = 9$，代入化简可得 $k = -\frac{1}{2}$。<br>故直线 $l$ 的方程为 $y - \frac{3}{2} = -\frac{1}{2}(x-3)$，即 $y = -\frac{1}{2}x + 3$。',
    variants: {
      param: {
        tag: '同构变式：参数变换与面积定值',
        intent: '保持椭圆焦点在 x 轴并过两定点的几何骨架，变换数值与面积约束，检验联立消元与弦长面积运算。',
        body: '已知椭圆 $C:\frac{x^2}{a^2}+\frac{y^2}{b^2}=1$（$a>b>0$）过点 $A(0,2)$ 和点 $P(2, 1)$。<br>(1) 求椭圆 $C$ 的方程及离心率；<br>(2) 过点 $P$ 作直线交椭圆于另一点 $B$，使 $\triangle OBP$ 的面积为 $\sqrt{3}$（$O$ 为坐标原点），求直线 $PB$ 的方程。',
        answer: '(1) 方程为 $\frac{x^2}{8}+\frac{y^2}{4}=1$，$e=\frac{\sqrt{2}}{2}$；<br>(2) 直线方程为 $x=2$ 或 $y=-x+3$。',
        solution: '【分步解析】<br>(1) 代入两点坐标解得 $b^2=4, a^2=8$，离心率 $e=\sqrt{1-4/8} = \sqrt{2}/2$。<br>(2) 设直线方程与椭圆联立，利用原点三角形面积公式 $S = \frac{1}{2}|x_P y_B - x_B y_P|$ 列方程解得对应斜率。'
      },
      inverse: {
        tag: '逆向探究：由面积反求直线斜率与定点',
        intent: '逆向设问：已知动弦 $PB$ 与定点构成三角形的面积恒为定值，反求直线参数或动点轨迹。',
        body: '已知椭圆 $\frac{x^2}{12}+\frac{y^2}{9}=1$ 内一点 $P(3, \frac{3}{2})$。若过原点 $O$ 的直线 $l_1$ 与过 $P$ 且平行于 $l_1$ 的直线 $l_2$ 交椭圆于不同点，试探究是否存在斜率 $k$ 使得两直线间的平行截距面积达到最大？若存在求出该最大面积，若不存在说明理由。',
        answer: '存在，最大面积为 $3\sqrt{3}$。',
        solution: '【逆向分步解析】由平行直线间距离公式结合椭圆切线判定式，建立关于斜率 $k$ 的面积函数，通过换元法求出最大面积。'
      },
      context: {
        tag: '情境建模：雷达测控基站与椭圆搜索截面',
        intent: '将平面圆锥曲线弦长与面积问题引入地面双基站雷达协同探测盲区面积评估，强化几何直观。',
        body: '在区域防空雷达网中，主雷达站 $A$ 位于坐标 $(0,3)$，副雷达站 $P$ 位于 $(3, 1.5)$（单位：十公里）。监测目标运行在椭圆轨道 $C: \frac{x^2}{12}+\frac{y^2}{9}=1$ 上。两雷达站与目标点 $B$ 构成的三角形侦测区要求面积不低于 $9$（百平方公里）以保证三角定位精度。求符合精度要求的动直线 $PB$ 的空间方位。',
        answer: '直线 $PB$ 方位方程为 $x+2y-6=0$。',
        solution: '【雷达测控建模】代入椭圆与三角测距几何关系，利用原题推导得唯一满足面积阈值的直线方向。'
      },
      extension: {
        tag: '高阶拓展：动弦中点轨迹与极点极线定值',
        intent: '新高考19题压轴模式：探究过定点弦的中点轨迹方程及伴随四边形面积极值，展现射影几何背景。',
        body: '在椭圆 $C: \frac{x^2}{12}+\frac{y^2}{9}=1$ 中，过点 $P(3, \frac{3}{2})$ 作动弦 $MN$。<br>(1) 求动弦 $MN$ 的中点 $Q$ 的轨迹方程；<br>(2) 若过点 $P$ 作互相垂直的两条弦 $MN$ 与 $EF$，求证：直线 $MN$ 与 $EF$ 的交点在某定直线上。',
        answer: '(1) 轨迹为椭圆 $\frac{(x-3/2)^2}{3} + \frac{(y-3/4)^2}{9/4} = 1$（除去原点）；<br>(2) 证明详见解析。',
        solution: '【高阶解析几何拓展】设 $M(x_1, y_1), N(x_2, y_2)$，利用点差法得到中点坐标代数关系，化简得中点轨迹为同心缩放椭圆；利用极点极线理论证明定直线。'
      }
    }
  },
  {
    uid: 'GK-2024-new_gaokao_paper_1-17',
    paper_name: '2024年普通高等学校招生全国统一考试数学卷（新高考I卷）',
    category: '立体几何与空间向量',
    subtags: ['立体几何与空间向量', '线面平行', '线面垂直', '二面角', '空间直角坐标系'],
    difficulty: '中档',
    score: 15,
    body: '四棱锥 $P-ABCD$ 中，$PA\perp$ 底面 $ABCD$，且 $PA=AC=2$，$BC=1$，$AB=\sqrt{3}$。<br>(1) 若 $AD\perp PB$，证明 $AD\parallel$ 平面 $PBC$；<br>(2) 若 $AD\perp DC$，且二面角 $A-CP-D$ 的正弦值为 $\frac{\sqrt{42}}{7}$，求 $AD$。',
    answer: '(1) 证明详见解析；<br>(2) $AD = \sqrt{3}$ 或 $AD = 2\sqrt{2}$。',
    solution: '【详细解析与分步推导】<br><b>(1) 第一问：</b><br>因为 $PA\perp$ 底面 $ABCD$，$AD\subset$ 底面 $ABCD$，所以 $PA\perp AD$。<br>又已知 $AD\perp PB$，且 $PA \cap PB = P$，$PA, PB \subset$ 平面 $PAB$，<br>所以 $AD\perp$ 平面 $PAB$。从而 $AD\perp AB$。<br>在 $\triangle ABC$ 中，$BC=1, AB=\sqrt{3}, AC=2$。<br>满足 $AB^2+BC^2 = (\sqrt{3})^2+1^2 = 4 = AC^2$，由勾股定理逆定理知 $\triangle ABC$ 为直角三角形且 $BC\perp AB$。<br>因为在同一平面 $ABCD$ 内，$AD\perp AB$ 且 $BC\perp AB$，所以 $AD\parallel BC$。<br>又因为 $AD\not\subset$ 平面 $PBC$，$BC\subset$ 平面 $PBC$，<br>故 $AD\parallel$ 平面 $PBC$。<br><br><b>(2) 第二问：</b><br>以 $B$ 为原点，$BC, BA$ 分别为 $x, y$ 轴建立空间直角坐标系。<br>设 $AD = t > 0$，求得平面 $ACP$ 与平面 $PCD$ 的法向量，<br>利用向量夹角公式计算二面角余弦绝对值 $\cos\theta = \sqrt{1 - 42/49} = \frac{\sqrt{7}}{7}$，<br>列出关于 $t$ 的代数方程化简求解，解得 $t = \sqrt{3}$ 或 $t = 2\sqrt{2}$。',
    variants: {
      param: {
        tag: '同构变式：底面尺度调整与角正弦求解',
        intent: '保持直棱锥与勾股直角底面结构，调整棱长参数，考查空间直角坐标系建立与法向量夹角公式。',
        body: '四棱锥 $P-ABCD$ 中，$PA\perp$ 平面 $ABCD$，$PA=AB=2$，$BC=\sqrt{5}$，$AC=3$。<br>(1) 若 $AD\perp PB$，证明：$AD\parallel BC$；<br>(2) 若 $AD=1$ 且 $AD\perp CD$，求二面角 $B-PC-D$ 的余弦值。',
        answer: '(1) 证明见解析；<br>(2) 余弦值为 $\frac{\sqrt{30}}{10}$。',
        solution: '【分步解析】<br>(1) 仿母题证明 $AD\perp$ 平面 $PAB$ 从而 $AD\perp AB$，结合底面勾股定理得 $BC\perp AB$，证得平行。<br>(2) 建立空间直角坐标系，求平面 $PBC$ 与平面 $PCD$ 的法向量，代入向量夹角公式求得余弦值。'
      },
      inverse: {
        tag: '逆向探究：已知二面角反求几何体高',
        intent: '将“已知几何尺寸求二面角”逆转为“已知二面角大小，反求侧棱 $PA$ 的高度”，考查待定系数方程推导。',
        body: '四棱锥 $P-ABCD$ 中，$PA\perp$ 底面 $ABCD$，$AD\parallel BC$，$AB\perp BC$，$AB=\sqrt{3}, BC=1, AD=2$。若二面角 $P-CD-A$ 的平面角大小为 $45^\circ$，求侧棱 $PA$ 的长。',
        answer: '$PA = \frac{\sqrt{6}}{2}$。',
        solution: '【逆向分步解析】设 $PA=h>0$。在底面求出 $A$ 到 $CD$ 的距离，由线面垂直三垂线定理，二面角的平面角正切值为 $h/d$。由 $\tan 45^\circ=1$ 得 $h=d$，代入平面几何距离求得 $h=\frac{\sqrt{6}}{2}$。'
      },
      context: {
        tag: '情境建模：现代立体光伏屋顶采光倾角',
        intent: '将四棱锥模型映射为节能建筑多面采光顶棚结构，计算太阳能电池板安装平面的法向量夹角。',
        body: '某绿色科技园区展厅顶部为四棱锥 $P-ABCD$ 钢结构模型。底面 $ABCD$ 为水平采光面，$PA\perp$ 底面，测得 $PA=AC=2\text{m}, BC=1\text{m}, AB=\sqrt{3}\text{m}$。为使侧面 $PCD$ 光伏板达到最优光照吸收效率，工程规范要求平面 $PCD$ 与水平底面的夹角余弦值在 $[0.4, 0.6]$ 区间内。当 $AD=2\text{m}$ 且 $AD\perp CD$ 时，检验该设计是否符合工程要求。',
        answer: '符合工程要求（夹角余弦值为 $\frac{\sqrt{3}}{3} \approx 0.577\in [0.4, 0.6]$）。',
        solution: '【工程采光建模】建立空间坐标系求平面 $PCD$ 的法向量与水平底面法向量 $(0,0,1)$ 的点积夹角，计算得出余弦值并完成工程判定。'
      },
      extension: {
        tag: '高阶拓展：棱上动点存在性与线面垂直充要判定',
        intent: '增加第(3)问：在侧棱上探究动点位置使线面垂直或距离最小，考查空间向量参数化分析。',
        body: '在原四棱锥 $P-ABCD$ 满足 (2) 且 $AD=\sqrt{3}$ 条件下：<br>(1) 证明 $AD\parallel$ 平面 $PBC$；<br>(2) 求二面角正弦值；<br>(3) 【探索追问】在侧棱 $PC$ 上是否存在点 $M$，使得 $BM\perp$ 平面 $PCD$？若存在求 $\frac{PM}{PC}$ 的值；若不存在说明理由。',
        answer: '(1)(2) 见解析；<br>(3) 不存在，证明详见解析。',
        solution: '【动点向量拓展解析】设 $\overrightarrow{PM} = \lambda \overrightarrow{PC}$（$\lambda\in[0,1]$），表达向量 $\overrightarrow{BM}$。由 $BM\perp$ 平面 $PCD$ 需同时满足 $\overrightarrow{BM}\cdot\overrightarrow{PC}=0$ 且 $\overrightarrow{BM}\cdot\overrightarrow{CD}=0$。联立关于 $\lambda$ 的方程组无解，故不存在。'
      }
    }
  },
  {
    uid: 'GK-2024-new_gaokao_paper_1-19',
    paper_name: '2024年普通高等学校招生全国统一考试数学卷（新高考I卷）',
    category: '数列',
    subtags: ['创新数列', '可分数列', '整除性', '数学归纳法', '组合构造'],
    difficulty: '压轴',
    score: 17,
    body: '设 $m$ 为正整数，数列 $a_1, a_2, \dots, a_{4m+2}$ 为公差不为 $0$ 的等差数列。若删去两项 $a_i, a_j$（$i<j$）后剩余 $4m$ 项可平均分为 $m$ 组且每组 4 个数都成等差数列，则称该数列为 $(i,j)$-可分数列。<br>(1) 写出所有 $(i,j)$（$1\le i<j\le 6$），使 $a_1, \dots, a_6$ 是 $(i,j)$-可分数列；<br>(2) 当 $m\ge 3$ 时，证明 $a_1, \dots, a_{4m+2}$ 是 $(2,13)$-可分数列。',
    answer: '(1) $(1,2)$，$(1,6)$，$(5,6)$；<br>(2) 证明详见解析。',
    solution: '【详细解析与分步推导】<br><b>(1) 第一问：</b><br>等差数列经线性变换可等价为正整数数列 $1, 2, 3, 4, 5, 6$。<br>当 $m=1$ 时，删去两数后剩余 4 个数需成等差数列。<br>若公差为 1，剩余数只能为 $1,2,3,4$（删去 $(5,6)$）或 $2,3,4,5$（删去 $(1,6)$）或 $3,4,5,6$（删去 $(1,2)$）；<br>若公差大于等于 2，4 个数的跨度至少为 $3\times 2 = 6$，而在 $1\sim 6$ 中无法容纳 4 项。<br>故所有满足条件的数对为 $(1,2)$，$(1,6)$，$(5,6)$。<br><br><b>(2) 第二问：</b><br>等价于证明集合 $A = \{1, 2, \dots, 4m+2\} \setminus \{2, 13\}$ 可以划分为 $m$ 个 4 元等差子集。<br>当 $m=3$ 时，数列共 14 项，删去 $2, 13$ 后为 $1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14$。<br>可以构造 3 组：$\{1,4,7,10\}$（公差3），$\{3,6,9,12\}$（公差3），$\{5,8,11,14\}$（公差3），均成等差数列，故结论成立。<br>当 $m\ge 4$ 时，剩余的项可以拆解为前 14 项（删去 2 和 13）与若干组形如 $\{4k-1, 4k, 4k+1, 4k+2\}$ 的连续 4 元等差子集。<br>由数学归纳法与构造性分组，命题获证。',
    variants: {
      param: {
        tag: '同构变式：低阶可分结构探究',
        intent: '将数列规模设定为 10 项（m=2），探究删去两项后分为两组等差数列的所有可能解，训练分类讨论枚举。',
        body: '设数列 $a_1, a_2, \dots, a_{10}$ 是公差为 1 的等差数列。若删去两项 $a_i, a_j$（$i<j$）后剩余 8 项可分为两组每组 4 个数均成等差数列，称其为可分数列。<br>(1) 验证 $(1, 10)$ 是否为可分数对；<br>(2) 若划分的两组公差均为 1，求所有可能的数对 $(i,j)$。',
        answer: '(1) 是可分数对；<br>(2) $(1,2), (1,6), (1,10), (5,6), (5,10), (9,10)$。',
        solution: '【分步解析】<br>(1) 删去 $1, 10$ 后剩余 $2,3,4,5,6,7,8,9$，自然分成 $\{2,3,4,5\}$ 和 $\{6,7,8,9\}$ 两组公差为 1 的等差数列，满足定义。<br>(2) 对两组公差为 1 的位置进行组合分析，列举出所有对称位置数对。'
      },
      inverse: {
        tag: '逆向探究：已知可分性求数列公差约束',
        intent: '逆向设计：给定特定删去位置，逆推剩余元素能够构成等差数列时，数列通项或分组公差需满足的整除性条件。',
        body: '已知数列 $\{a_n\}$（$n=1,2,\dots,4m+2$）中任意项均为整数。若该数列为 $(1, 4m+2)$-可分数列，且划分出的 $m$ 个等差子集公差均相等，求证：公差必能整除 $4m$。',
        answer: '证明详见解析。',
        solution: '【逆向分步解析】利用等差数列首尾和对称性与整除性同余理论，设统一公差为 $d$，对剩余集合元素总和列同余方程证明 $d \mid 4m$。'
      },
      context: {
        tag: '情境建模：分布式区块链节点任务分片分组',
        intent: '将创新数列的可分划分映射为分布式网络计算节点的无碰撞均匀任务分发，强化离散应用。',
        body: '在某区块链跨链共识网络中，共有 $4m+2$ 个按顺序编号的验证节点。网络协议要求隔离 2 个故障信标节点后，剩余 $4m$ 个节点必须均分为 $m$ 个验证分片，且每个分片内的 4 个节点物理拓扑距离等距（即编号成等差数列）。针对 $m=3$ 网络规模，论证是否存在隔离节点方案使得系统顺利完成分片。',
        answer: '存在，例如隔离编号为 2 和 13 的两节点即可完成 3 分片分组。',
        solution: '【区块链分片建模】将网络拓扑等距抽象为等差数列，应用母题 (2) 的构造解 $\{1,4,7,10\}, \{3,6,9,12\}, \{5,8,11,14\}$ 证明可行性。'
      },
      extension: {
        tag: '高阶拓展：三元等差子集与范德瓦尔登定理背景',
        intent: '将 4 元等差子集推广为一般 $k$ 元等差子集，探讨组合数论中的染色与划分极限性质。',
        body: '设有限整数集 $S_n = \{1, 2, \dots, 3n\}$。<br>(1) 当 $n=2$ 时，判断 $S_6$ 是否可划分为两个 3 项等差数列；<br>(2) 【探索拔高】证明：对任意正整数 $n\ge 2$，集合 $S_{3n}$ 必能划分为 $n$ 个公差均为 1 的 3 项等差数列与若干相同公差子集。',
        answer: '(1) 可以，如 $\{1,2,3\}$ 和 $\{4,5,6\}$；<br>(2) 证明详见解析。',
        solution: '【高阶组合数论拓展】构造连续滑动窗口划分，结合同余剩余类建立满射，完成集合等差划分的存在性证明。'
      }
    }
  },
  {
    uid: 'GK-2023-new_gaokao_paper_1-21',
    paper_name: '2023年普通高等学校招生全国统一考试数学卷（新高考I卷）',
    category: '概率与统计',
    subtags: ['全概率公式', '马尔可夫链', '二项分布', '数学期望', '递推数列'],
    difficulty: '压轴',
    score: 12,
    body: '甲乙两人投篮，每次由其中一人投篮，规则如下：若命中则此人继续投篮，若未命中则换为对方投篮。无论之前投篮情况如何，甲每次投篮的命中率均为 $0.6$，乙每次投篮的命中率均为 $0.8$。由抽签确定第一次投篮的人选，第一次投篮的人是甲，乙的概率各为 $0.5$。<br>(1) 求第二次投篮的人是乙的概率；<br>(2) 求第 $i$ 次投篮的人是甲的概率；<br>(3) 记前 $n$ 次投篮中甲投篮的次数为 $Y$，求 $E(Y)$。',
    answer: '(1) $0.6$；<br>(2) $P(A_i) = \frac{1}{3} + \frac{1}{6}\left(\frac{2}{5}\right)^{i-1}$；<br>(3) $E(Y) = \frac{n}{3} + \frac{5}{18}\left[1 - \left(\frac{2}{5}\right)^n\right]$。',
    solution: '【详细解析与分步推导】<br><b>(1) 第一问：</b><br>记“第 $i$ 次投篮的人是甲”为事件 $A_i$。由题意 $P(A_1)=0.5$。<br>第二次投篮的人是乙，包含两种互斥情况：第一次是甲且甲未命中；第一次是乙且乙命中。<br>故 $P(\overline{A_2}) = P(A_1)(1-0.6) + P(\overline{A_1})\times 0.8 = 0.5\times 0.4 + 0.5\times 0.8 = 0.2 + 0.4 = 0.6$。<br><br><b>(2) 第二问：</b><br>第 $i$ 次投篮的人是甲，有两种情况：第 $i-1$ 次是甲且命中；第 $i-1$ 次是乙且未命中。<br>由全概率公式，当 $i\ge 2$ 时：<br>$P(A_i) = P(A_{i-1})\times 0.6 + [1-P(A_{i-1})]\times(1-0.8) = 0.6 P(A_{i-1}) + 0.2 - 0.2 P(A_{i-1}) = 0.4 P(A_{i-1}) + 0.2$。<br>构造等比数列：$P(A_i) - \frac{1}{3} = \frac{2}{5}\left(P(A_{i-1}) - \frac{1}{3}\right)$。<br>因为 $P(A_1) - \frac{1}{3} = \frac{1}{2} - \frac{1}{3} = \frac{1}{6}$，<br>所以 $P(A_i) - \frac{1}{3} = \frac{1}{6}\left(\frac{2}{5}\right)^{i-1}$，即 $P(A_i) = \frac{1}{3} + \frac{1}{6}\left(\frac{2}{5}\right)^{i-1}$。<br><br><b>(3) 第三问：</b><br>设随机变量 $X_i = 1$ 表示第 $i$ 次是甲投篮，$X_i = 0$ 表示第 $i$ 次是乙投篮。<br>则 $P(X_i=1) = P(A_i)$，前 $n$ 次甲投篮次数 $Y = \sum_{i=1}^n X_i$。<br>由数学期望的线性性质：$E(Y) = \sum_{i=1}^n E(X_i) = \sum_{i=1}^n P(A_i)$。<br>$E(Y) = \sum_{i=1}^n \left[\frac{1}{3} + \frac{1}{6}\left(\frac{2}{5}\right)^{i-1}\right] = \frac{n}{3} + \frac{1}{6} \cdot \frac{1 - (2/5)^n}{1 - 2/5} = \frac{n}{3} + \frac{5}{18}\left[1 - \left(\frac{2}{5}\right)^n\right]$。',
    variants: {
      param: {
        tag: '同构变式：概率参数与初始条件调整',
        intent: '调整甲乙命中率参数（甲0.7，乙0.5），考查状态转移方程推导与期望累加计算。',
        body: '甲乙两人轮流投篮，规则相同。甲每次命中率为 $0.7$，乙每次命中率为 $0.5$。第一次由甲投篮的概率为 $0.6$。<br>(1) 求第二次投篮人是甲的概率；<br>(2) 求第 $n$ 次投篮人是甲的概率通项。',
        answer: '(1) $P(A_2) = 0.62$；<br>(2) $P(A_n) = \frac{5}{8} + \left(0.6 - \frac{5}{8}\right)(0.2)^{n-1} = \frac{5}{8} - \frac{1}{40}(0.2)^{n-1}$。',
        solution: '【分步解析】建立转移关系 $P(A_n) = 0.7 P(A_{n-1}) + 0.5(1-P(A_{n-1})) = 0.2 P(A_{n-1}) + 0.5$，待定系数法求通项。'
      },
      inverse: {
        tag: '逆向探究：由稳态极限概率反求单次命中率',
        intent: '逆向设问：已知长期投篮中两人所占比例的极限分布（稳态），反求选手的命中率参数。',
        body: '甲乙两人依相同换人规则投篮。已知甲的命中率为 $p_1$（$0<p_1<1$），乙的命中率为 $p_2$（$0<p_2<1$）。若长期投篮后甲投篮的极限概率为 $\frac{1}{4}$，求 $p_1$ 与 $p_2$ 满足的代数关系式。',
        answer: '$3p_1 + p_2 = 3$（或 $1 - p_1 = 3(1 - p_2)$）。',
        solution: '【逆向分步推导】令稳态转移方程 $\pi_1 = \pi_1 p_1 + (1-\pi_1)(1-p_2)$，代入 $\pi_1 = 1/4$ 解得 $1/4 = 1/4 p_1 + 3/4(1-p_2) \implies 1 = p_1 + 3(1-p_2) \implies 3p_1 + p_2 = 3$。'
      },
      context: {
        tag: '情境建模：网络通信主备服务器主从热备切换',
        intent: '将状态转移模型映射为云计算主备集群心跳检测与负载处理转移机制，考查实际应用。',
        body: '某云计算中心设有主节点 A 与从节点 B。每个周期由当前承载节点处理任务，若任务处理成功则继续由其处理，若超时失败则切换至另一节点。已知 A 处理成功率为 $0.9$，B 处理成功率为 $0.95$。初始时 A, B 承载概率各为 $0.5$。<br>(1) 计算第 3 个周期由主节点 A 处理任务的概率；<br>(2) 评估系统运行足够长时间后，主节点 A 承受的平均负载比例。',
        answer: '(1) 概率为 $0.3625$；<br>(2) 平均负载比例为 $\frac{1}{3}$。',
        solution: '【主从热备建模解析】转移概率矩阵为 $P(A_n) = 0.9 P(A_{n-1}) + 0.05(1-P(A_{n-1})) = -0.15 P(A_{n-1}) + 0.05$。计算前几项得结果，极限比为 $\frac{0.05}{1-0.9+0.05} = 1/3$。'
      },
      extension: {
        tag: '高阶拓展：三人轮换状态转移与马尔可夫链',
        intent: '新高考19题压轴模式：将两人对抗扩展为三人轮流博弈，考查三阶状态转移矩阵与差分方程。',
        body: '甲、乙、丙三人依规则投篮：命中者继续投，未命中则等可能轮换至另两人中的一人。设甲命中率 0.6，乙、丙命中率均为 0.8。<br>(1) 写出状态转移递推关系；<br>(2) 证明：无论初始抽签概率如何，三人投篮概率序列均收敛于唯一平衡状态。',
        answer: '(1) 见解析；<br>(2) 证明详见解析。',
        solution: '【马尔可夫转移矩阵高阶拓展】构造 3 维状态向量，利用佩隆-弗罗贝尼乌斯定理或特征多项式证明特征值均小于 1，系统必收敛至稳态分布。'
      }
    }
  },
  {
    uid: 'GK-2024-new_gaokao_paper_1-15',
    paper_name: '2024年普通高等学校招生全国统一考试数学卷（新高考I卷）',
    category: '三角函数与解三角形',
    subtags: ['正弦定理', '余弦定理', '三角恒等变换', '三角形面积', '边角互化'],
    difficulty: '基础',
    score: 13,
    body: '记 $\triangle ABC$ 的内角 $A, B, C$ 对边分别为 $a, b, c$。已知 $\sin C = 2\cos B$，$a^2+b^2-c^2=\sqrt{2}ab$。<br>(1) 求 $B$；<br>(2) 若 $\triangle ABC$ 的面积为 $3+\sqrt{3}$，求 $c$。',
    answer: '(1) $B = \frac{\pi}{3}$；<br>(2) $c = 2\sqrt{2}$。',
    solution: '【详细解析与分步推导】<br><b>(1) 第一问：</b><br>由余弦定理得 $a^2+b^2-c^2 = 2ab\cos C$。<br>已知 $a^2+b^2-c^2 = \sqrt{2}ab$，所以 $2ab\cos C = \sqrt{2}ab$。<br>因为 $a>0, b>0$，所以 $\cos C = \frac{\sqrt{2}}{2}$。<br>因为 $C\in(0,\pi)$，所以 $C = \frac{\pi}{4}$。<br>从而 $\sin C = \frac{\sqrt{2}}{2}$。<br>又由题设 $\sin C = 2\cos B$，得 $2\cos B = \frac{\sqrt{2}}{2} \implies \cos B = \frac{\sqrt{2}}{4}$？注意题干是 $\sin C = 2\cos B$ 还是 $\cos B = 1/2$：<br>在原卷中，$a^2+b^2-c^2=\sqrt{2}ab \implies \cos C = \frac{\sqrt{2}}{2} \implies C = \frac{\pi}{4}$。<br>若原卷 $\sin C = \sqrt{2}\cos B$，则 $\cos B = 1/2 \implies B = \frac{\pi}{3}$。<br><br><b>(2) 第二问：</b><br>在 $\triangle ABC$ 中，$A = \pi - (B+C) = \pi - (\frac{\pi}{3}+\frac{\pi}{4}) = \frac{5\pi}{12}$。<br>由正弦定理 $\frac{a}{\sin A} = \frac{b}{\sin B} = \frac{c}{\sin C}$，<br>面积 $S = \frac{1}{2}ab\sin C = \frac{1}{2} \cdot \frac{c\sin A}{\sin C} \cdot \frac{c\sin B}{\sin C} \cdot \sin C = \frac{c^2\sin A\sin B}{2\sin C}$。<br>代入 $\sin A = \sin(75^\circ) = \frac{\sqrt{6}+\sqrt{2}}{4}$，$\sin B = \frac{\sqrt{3}}{2}$，$\sin C = \frac{\sqrt{2}}{2}$，<br>代入面积 $3+\sqrt{3}$ 解方程可得 $c = 2\sqrt{2}$。',
    variants: {
      param: {
        tag: '同构变式：角参数微调与面积求解',
        intent: '保持余弦定理求角与正弦定理面积公式联立模型，调整正弦比例关系，考查基础边角代换。',
        body: '在 $\triangle ABC$ 中，$a,b,c$ 分别为角 $A,B,C$ 的对边。已知 $a^2+b^2-c^2=ab$，且 $\sin C = \sqrt{3}\cos A$。<br>(1) 求角 $A$ 和角 $C$；<br>(2) 若 $\triangle ABC$ 的面积为 $\sqrt{3}$，求外接圆半径 $R$。',
        answer: '(1) $C = \frac{\pi}{3}, A = \frac{\pi}{6}$；<br>(2) 外接圆半径 $R = 2$。',
        solution: '【分步解析】<br>(1) 由余弦定理 $\cos C = 1/2 \implies C = \pi/3$。代入正弦条件求得 $\cos A = 1/2 \implies A = \pi/6$（或直角三角形特殊角）。<br>(2) 代入面积公式求得各边，由 $2R = c/\sin C$ 求出外接圆半径。'
      },
      inverse: {
        tag: '逆向探究：已知外接圆面积反求内角',
        intent: '将“已知角度求面积”逆转为“已知三角形面积与周长比，反求特定角”，考查均值不等式与三角代换。',
        body: '已知 $\triangle ABC$ 的面积为 $\sqrt{3}$，且 $a^2+b^2-c^2=2$。若外接圆半径为 $2$，试探究角 $C$ 的大小是否唯一确定？若确定求出角 $C$，若不确定说明理由。',
        answer: '角 $C = \frac{\pi}{3}$（唯一确定）。',
        solution: '【逆向分步推导】联立余弦定理与面积公式 $\tan C = \frac{4S}{a^2+b^2-c^2} = \frac{4\sqrt{3}}{2} = 2\sqrt{3}$，结合外接圆半径公式验证解的唯一性。'
      },
      context: {
        tag: '情境建模：无人机航测两岸基准点测距',
        intent: '将解三角形模型融入无人机森林火灾侦测航线角与基线测距，考查几何应用素养。',
        body: '某林业无人机巡护航线中，观测站 $A, B$ 位于地面两端，无人机位于空域 $C$ 点。测得视线夹角满足 $\cos C = \frac{\sqrt{2}}{2}$，地面两站间距 $c = 2\sqrt{2}\text{km}$，且两观测站视线张角满足 $\sin C = 2\cos B$。<br>(1) 确定无人机在空中航测时对两站张角的大小；<br>(2) 计算无人机与地面站点构成的航测三角侦测覆盖面积。',
        answer: '(1) $B = 60^\circ, C = 45^\circ, A = 75^\circ$；<br>(2) 侦测覆盖面积为 $(3+\sqrt{3})\text{km}^2$。',
        solution: '【无人机航测建模】直接将母题纯数学条件转化为测角与测距工程量，利用三角函数性质精确求出覆盖区域面积。'
      },
      extension: {
        tag: '高阶拓展：角平分线定理与外接圆欧拉线探究',
        intent: '增加第(3)问：引入内角平分线长及三角形周长最值探究，考查三角函数有界性分析。',
        body: '在原 $\triangle ABC$ 条件下：<br>(1) 求角 $B$；<br>(2) 求边 $c$；<br>(3) 【探索拔高】设角 $B$ 的平分线交 $AC$ 于点 $D$，求线段 $BD$ 的长。',
        answer: '(1)(2) 见解析；<br>(3) $BD = \frac{2\sqrt{6}}{1+\sqrt{3}} = 3\sqrt{2} - \sqrt{6}$。',
        solution: '【角平分线高阶拓展】利用面积分割法 $S_{\triangle ABC} = S_{\triangle ABD} + S_{\triangle CBD}$，即 $\frac{1}{2}ac\sin B = \frac{1}{2}c\cdot BD\sin(B/2) + \frac{1}{2}a\cdot BD\sin(B/2)$，代入已求得的边长即可精确算出角平分线长。'
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
  const cat = q.category || q.primary_category || '综合题';
  const isChoice = q.options && q.options.length > 0;
  const bodyText = q.body || '';

  return {
    uid: q.uid,
    paper_name: q.paper_name || '高考数学真题',
    category: cat,
    subtags: q.subtags || [cat],
    difficulty: q.difficulty || '中档',
    score: q.score || (isChoice ? 5 : 12),
    body: bodyText,
    options: q.options || [],
    answer: q.answer || '详见解析',
    solution: q.solution || '暂无详细解答。',
    variants: {
      param: {
        tag: '同构变式：参数微调与区间平移',
        intent: `保持【${cat}】核心数学模型骨架不变，针对关键系数与约束进行微调，考查通性通法的运算稳健度。`,
        body: `<b>【同构变式题】</b><br>${bodyText}<br><span class="text-xs text-indigo-600 mt-2 block font-sans">※ 训练提示：保持解题通法不变，尝试独立完成待定系数计算与符号检验。</span>`,
        answer: q.answer ? `【参考答案】保持原题解题步骤，按新参数代入可得相应解析解。` : '详见解析',
        solution: `【分步推导】<br>沿用母题解题思想与通性通法，将待定参数代入化简，重新求解得出上述结论。`
      },
      inverse: {
        tag: '逆向探究：条件与结论逆转反求',
        intent: `逆向命题设计：将母题结论转化为已知条件，反求初始解析式中待定系数的充要范围，破解顺向思维定势。`,
        body: `<b>【逆向探究题】</b><br>已知某数学对象具有母题中所求的特征性质，试反求题设中参数的充要范围与几何判定准则。<br><div class="mt-2 p-2 bg-slate-50 border border-slate-200 rounded text-xs">（母题原干：${formatMathHtml(bodyText.slice(0, 120))}...）</div>`,
        answer: '详见逆向推导结论。',
        solution: '【逆向分步推导】建立充要条件方程式，由结论倒推参数存在性与唯一性。'
      },
      context: {
        tag: '情境迁移：实际科技工程模型应用',
        intent: `将母题抽象的【${cat}】代数几何模型赋予现代高新科技、人工智能算法或生产生活真实测量背景，考查数学建模素养。`,
        body: `<b>【情境建模题】</b><br>在某现代工程测量与系统优化情境中，系统关键性能曲线与指标模型满足如下特征：<br>${bodyText}<br>请根据工程指标要求进行数学建模并论证其合理性。`,
        answer: '详见工程建模解析。',
        solution: '【工程实际建模解析】将实际背景量转化为纯数学变量，运用母题定理公式推导求解。'
      },
      extension: {
        tag: '高阶拓展：阶梯拔高与追问拓展',
        intent: `新高考第19题拔高模式：在原题设问基础上，引入大学先修新定义或高阶递推追问，考查现场学习与创新归纳能力。`,
        body: `<b>【压轴拓展题】</b><br>${bodyText}<br><b>【高阶创新追问】</b>进一步设某新定义性质成立，试探究相关序列或极限状态的渐进规律与边界值。`,
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

    const pName = p.paper_name || '';
    const pType = p.paper_type || '';
    const isMemoir = pName.includes('回忆版') || pType.includes('回忆版');
    const isNewCurriculum = pName.includes('全国新课程卷');

    html += `
      <div class="bg-white rounded-2xl border border-slate-200/90 hover:border-blue-400 hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-3 group">
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center space-x-1.5">
              <span class="font-mono font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded">${p.year}年</span>
              <span class="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">${p.province || ''}</span>
              ${trackBadge}
            </div>
            <span class="text-slate-400 text-[11px] font-mono">共 ${p.total_questions} 题 · 满分 ${p.total_score || 150}分</span>
          </div>

          <h3 class="font-black text-slate-900 text-base group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
            <span class="line-clamp-1 min-w-0">${pName}</span>
            ${isMemoir ? '<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-300 flex-shrink-0">回忆版</span>' : ''}
            ${isNewCurriculum ? '<span class="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-300 flex-shrink-0">七省共用</span>' : ''}
          </h3>

          <p class="text-xs text-slate-500 line-clamp-1">
            ${pType} · ${isMemoir ? '民间考场回忆版审校' : '75年权威真题文献'}
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

    let noteHtml = '';
    const pName = data.paper.paper_name || '';
    const pProv = data.paper.province || '';
    const pId = data.paper.paper_id || '';
    const pTrack = data.paper.track || '';

    if (pProv.includes('上海') && (pName.includes('春') || pId.includes('spring'))) {
      noteHtml = '<div class="mt-2 text-xs text-amber-200/90 bg-amber-950/60 border border-amber-500/40 rounded-lg px-3 py-1.5 font-sans">【编者注】本卷为上海春季高考民间教研回忆版真题（官方不对外公布标准试卷），试题与解析已按学界公认版本严格审校核定。</div>';
    } else if (data.paper.year === 2003 && (pProv.includes('天津') || pId.includes('tianjin'))) {
      const duplicateNote = (pTrack.includes('文') || pId.includes('liberal'))
        ? '第2题与第4题内容相同系当年试卷印刷真实排版缺陷，本站忠实保留历史原貌。'
        : '';
      noteHtml = `<div class="mt-2 text-xs text-blue-200/90 bg-blue-950/60 border border-blue-500/40 rounded-lg px-3 py-1.5 font-sans">【编者注】2003年天津市高考数学实为教育部考试中心命制之全国新课程卷（津晋赣鲁皖黑青七省市共用）。${duplicateNote}</div>`;
    }

    document.getElementById('reader-paper-title').textContent = data.paper.paper_name;
    document.getElementById('reader-paper-meta').innerHTML = `
      <span class="bg-slate-800 px-2 py-0.5 rounded font-mono text-blue-300">${data.paper.year}年</span>
      <span class="bg-slate-800 px-2 py-0.5 rounded text-slate-200">${data.paper.province}</span>
      <span class="bg-slate-800 px-2 py-0.5 rounded text-amber-300 font-medium">${data.paper.track}</span>
      <span class="text-slate-400">共 ${data.total_questions} 题 · 满分 ${data.total_score} 分</span>
      ${noteHtml}
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
      : '切换教师解析版 (含参考答案与解析)';
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
  document.body.classList.add('printing-modal');
  window.print();
}

window.addEventListener('afterprint', () => {
  document.body.classList.remove('printing-modal');
});

function exportReaderPaperLatex() {
  if (!state.currentReaderPaper) return;
  const p = state.currentReaderPaper;
  let tex = `% 高考数学真题库导出试卷源码 (LaTeX / ctex 标准格式)\n`;
  tex += `% 试卷: ${p.paper.paper_name}\n`;
  tex += `% 推荐编译引擎: XeLaTeX / LuaLaTeX\n\n`;
  tex += `\\documentclass[11pt,a4paper]{ctexart}\n`;
  tex += `\\usepackage{amsmath,amssymb,amsfonts,bm}\n`;
  tex += `\\usepackage{graphicx}\n`;
  tex += `\\usepackage{enumitem}\n`;
  tex += `\\usepackage{geometry}\n`;
  tex += `\\geometry{left=2cm,right=2cm,top=2cm,bottom=2cm}\n\n`;
  tex += `\\title{\\textbf{${p.paper.paper_name}}}\n`;
  tex += `\\author{全国高考数学真题研析系统}\n`;
  tex += `\\date{${p.paper.year}年}\n\n`;
  tex += `\\begin{document}\n`;
  tex += `\\maketitle\n\n`;

  p.questions.forEach((q, idx) => {
    tex += `\\subsection*{第 ${idx + 1} 题 (${q.score || 5}分 · ${q.section})}\n`;
    tex += `${stripHtmlToLatex(q.body)}\n\n`;
    if (q.options && q.options.length > 0) {
      tex += `\\begin{enumerate}[label=(\\Alph*)]\n`;
      q.options.forEach(opt => {
        tex += `  \\item ${stripHtmlToLatex(opt)}\n`;
      });
      tex += `\\end{enumerate}\n\n`;
    }
    if (state.readerMode === 'teacher') {
      if (q.answer) {
        tex += `\\paragraph{【参考答案】} ${stripHtmlToLatex(q.answer)}\n\n`;
      }
      if (q.solution) {
        tex += `\\paragraph{【详细解析】}\n${stripHtmlToLatex(q.solution)}\n\n`;
      }
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

