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
  // 2. Safely escape '<' so math inequalities like -1<x<3 are not treated as HTML tags by browser innerHTML
  s = s.replace(/<(?!\/?(?:div|img|span|p|br|table|thead|tbody|tr|th|td)\b)/gi, '&lt;');
  return s;
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
          ${q.answer ? `
            <div class="bg-amber-50/80 border border-amber-200/90 rounded-xl p-3 flex items-center space-x-2 text-xs">
              <span class="font-bold text-amber-900">【参考答案】</span>
              <span class="font-mono font-extrabold text-amber-800 text-sm">${formatMathHtml(q.answer)}</span>
            </div>
          ` : ''}
          
          <div class="bg-slate-50 rounded-xl p-4 border border-slate-200/80 text-xs text-slate-800 font-serif leading-relaxed space-y-2">
            <div class="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
              <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-600"></i>
              <span>【官方/权威详尽推导与解析】</span>
            </div>
            <div class="solution-text whitespace-pre-wrap pt-1">${formatMathHtml(q.solution || '暂无详细步骤推导。')}</div>
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
          <div class="font-bold text-amber-900">【参考答案】<span class="font-mono text-amber-800">${formatMathHtml(q.answer || '详见解析')}</span> （考查模块：${q.category} · 难度：${q.difficulty}）</div>
          <div class="text-slate-700 whitespace-pre-wrap pt-1 border-t border-amber-200/60 leading-relaxed">${formatMathHtml(q.solution || '解析略')}</div>
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

// Adaptor Module
function openAdaptorForQuestion(uid) {
  const q = state.questions.find(item => item.uid === uid);
  if (!q) return;
  switchTab('adaptor');
  
  document.getElementById('adaptor-orig-uid').textContent = q.uid;
  const bodyEl = document.getElementById('adaptor-orig-body');
  bodyEl.innerHTML = formatMathHtml(q.body);
  renderMath(bodyEl);

  const tagsEl = document.getElementById('adaptor-orig-tags');
  tagsEl.innerHTML = `
    <span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-semibold">${q.category}</span>
    ${(q.subtags || []).map(t => `<span class="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">${t}</span>`).join('')}
  `;

  // Adaptation suggestions
  const adapt = q.adaptation || {};
  const strategies = adapt.variation_strategies || [
    '参数化变式：改变解析式系数或常数项',
    '逆向设问：将求解结论与已知条件互换'
  ];
  document.getElementById('adaptor-strategies-list').innerHTML = strategies.map(s => `
    <div class="flex items-start space-x-2">
      <span class="text-indigo-600 font-bold">•</span>
      <span>${s}</span>
    </div>
  `).join('');

  const params = adapt.adaptable_parameters || ['待定系数 a, b', '曲线几何参数', '切点坐标'];
  document.getElementById('adaptor-params-list').innerHTML = params.map(p => `
    <span class="bg-white border border-slate-200 px-2 py-1 rounded text-[11px] font-mono">${p}</span>
  `).join('');

  // Sample variation
  const varEl = document.getElementById('adaptor-variation-body');
  varEl.innerHTML = `
    已知函数 $f(x) = x\\ln x - \\frac{1}{2}a x^2$（$a\\in\\mathbb{R}$）。<br>
    (1) 讨论函数 $f(x)$ 的单调区间与极值；<br>
    (2) 若函数存在两个极值点 $x_1, x_2$（$x_1 < x_2$），求证：$x_1 + x_2 > \\frac{2}{a}$。
  `;
  renderMath(varEl);
}

function loadSampleAdaptation() {
  openAdaptorForQuestion('GK-2026-national_paper_1-04');
}

function addVariationToBasket() {
  const variationItem = {
    uid: 'GK-ADAPT-2026-01',
    paper_name: '高考数学改编工坊变式题',
    track: '新高考',
    section: '解答题',
    body: '已知函数 $f(x) = x\\ln x - \\frac{1}{2}a x^2$。证明极值点偏移不等式。',
    difficulty: '压轴',
    score: 15,
    category: '函数与导数',
    solution: '详细解析：利用对数均值不等式或构造对称差函数证明。'
  };
  state.basket.push(variationItem);
  localStorage.setItem('gaokao_basket', JSON.stringify(state.basket));
  updateBasketUI();
  alert('改编变式试题已加入试卷篮！');
}

// Analytics Dashboard Initializer
async function loadAnalytics() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    state.analyticsData = data;
    renderAnalyticsCharts(data);
  } catch (err) {
    console.error('Failed to load analytics stats:', err);
  }
}

function renderAnalyticsCharts(data) {
  // Chart 1: Year Trend
  const ctxYear = document.getElementById('chart-year-trend');
  if (ctxYear && !state.charts.yearTrend) {
    const years = data.year_trends.map(yt => yt.year);
    const counts = data.year_trends.map(yt => yt.total);

    state.charts.yearTrend = new Chart(ctxYear, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: '年度收录真题总数',
          data: counts,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 2,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 15 } },
          y: { grid: { color: '#f1f5f9' } }
        }
      }
    });
  }

  // Chart 2: Category Pie
  const ctxCat = document.getElementById('chart-category-pie');
  if (ctxCat && !state.charts.catPie) {
    const cats = data.category_deep_dive.slice(0, 7);
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
          legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } }
        }
      }
    });
  }

  // Chart 3: Section Types
  const ctxSec = document.getElementById('chart-section-types');
  if (ctxSec && !state.charts.secBar) {
    const sections = data.overview.sections;
    state.charts.secBar = new Chart(ctxSec, {
      type: 'bar',
      data: {
        labels: ['单选题', '解答题', '填空题', '多选题', '选考/附加'],
        datasets: [{
          label: '题量',
          data: [sections['单选题'] || 6929, sections['解答题'] || 4637, sections['填空题'] || 4030, sections['多选题'] || 50, 450],
          backgroundColor: '#10b981',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  }

  // Chart 4: Regional Radar
  const ctxRadar = document.getElementById('chart-regional-radar');
  if (ctxRadar && !state.charts.radar) {
    state.charts.radar = new Chart(ctxRadar, {
      type: 'radar',
      data: {
        labels: ['运算求解深度', '逻辑推理抽象', '创新开放情境', '数形结合灵活', '高等数学渗透'],
        datasets: [
          {
            label: '新高考全国卷',
            data: [85, 90, 95, 88, 92],
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.2)'
          },
          {
            label: '江苏历史卷 (硬核)',
            data: [98, 95, 80, 92, 85],
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.2)'
          },
          {
            label: '北京卷 (通透概念)',
            data: [80, 92, 90, 85, 88],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.2)'
          },
          {
            label: '上海卷 (代数严密)',
            data: [88, 89, 82, 86, 96],
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.2)'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: { ticks: { display: false }, min: 50, max: 100 }
        }
      }
    });
  }

  // Render Eras cards
  const erasContainer = document.getElementById('eras-cards-container');
  if (erasContainer && data.historical_eras) {
    erasContainer.innerHTML = data.historical_eras.map((era, i) => `
      <div class="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-2">
        <div class="font-bold text-slate-900 text-xs">${era.era}</div>
        <p class="text-slate-600 leading-relaxed text-[11px]">${era.characteristics}</p>
        <div class="pt-1 flex flex-wrap gap-1">
          ${era.core_topics.map(t => `<span class="bg-blue-50 text-blue-700 px-1 py-0.5 rounded text-[10px]">${t}</span>`).join('')}
        </div>
      </div>
    `).join('');
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
            <span>【参考答案】<span class="font-mono text-amber-800 text-sm ml-1">${formatMathHtml(q.answer || '详见解析')}</span></span>
            <span class="text-amber-700 font-sans text-[11px]">考查：${q.category} · 难度：${q.difficulty}</span>
          </div>
          <div class="text-slate-700 whitespace-pre-wrap pt-1 border-t border-amber-200/70 leading-relaxed">${formatMathHtml(q.solution || '详见推导步骤。')}</div>
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
          <button onclick="toggleSingleBasketItem('${q.uid}')" class="text-xs text-blue-600 hover:underline flex items-center space-x-1 font-sans">
            <i data-lucide="plus" class="w-3 h-3"></i>
            <span>单题入篮</span>
          </button>
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

