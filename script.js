/**
 * ============================================================
 *  設定區 (Configuration)
 * ============================================================
 */

// ★ 請將此處替換為你 GAS 部署後的「網頁應用程式網址」
const GAS_API_URL = "
https://script.google.com/macros/s/AKfycbyrFj5shNXl8EHY0PEipqCgQKlLJ94YXFPUPewLhp2x1I_gW8WAqObw9wK70KdU1PmPUw/exec"; 

/**
 * ============================================================
 *  全域變數與狀態管理
 * ============================================================
 */
var SERVER_LEVELS = ['FS1', 'FS2', 'DS1', 'DS2', 'DS3']; // 預設值，會被 API 覆蓋
const CLASS_CONFIG = {
    "FS1": ["V", "E", "R", "I", "T", "Y"],
    "FS2": ["V", "E", "R", "I", "T", "Y"],
    "DS1": ["V", "E", "R", "I", "T", "Y", "VT"],
    "DS2": ["V", "E", "R", "I", "T", "Y", "EY"],
    "DS3": ["V", "E", "R", "I", "T", "Y", "XY"],
    "DEFAULT": ["A", "B", "C", "D", "E", "F"]
};

var currentUploadSetting = true; 
var currentShowAnswerSetting = true; 
var currentGroups = [];
var activeGroup = null; 
var currentQuizQueue = [];
var currentQIndex = 0;
var currentTotalScore = 0;
var quizTotalMaxScore = 0; 
var quizStartTime = 0;
var isInputLocked = false;
var voices = [];
var tempResultData = {};
var currentMode = '溫習'; 
var userAnswers = [];
var timerInterval = null;
var elapsedSeconds = 0;
var isReviewChecked = false;

// YouTube 播放器管理容器 (供 js-youtube.js 使用)
window.adminYtPlayers = {}; 

/**
 * ============================================================
 *  API 通訊核心 (Communication Layer)
 * ============================================================
 */

/**
 * 呼叫 Google Apps Script API
 * @param {string} action - 對應 GAS handleApiRequest 中的 action
 * @param {object} params - 傳送的參數
 * @param {string} method - 'GET' 或 'POST'
 */
async function callGAS(action, params = {}, method = 'GET') {
    if (GAS_API_URL.includes("請在此填入")) {
        alert("⚠️ 請先在 script.js 中設定 GAS_API_URL！");
        return;
    }

    let url = `${GAS_API_URL}?action=${action}`;
    let options = {
        method: method,
    };

    if (method === 'GET') {
        // GET 請求：將參數轉換為 Query String
        const queryString = new URLSearchParams(params).toString();
        if (queryString) url += `&${queryString}`;
    } else {
        // POST 請求：將參數轉為 JSON 字串
        // 使用 text/plain 避免觸發複雜的 CORS Preflight (Google Scripts 特性)
        options.body = JSON.stringify(params);
        options.headers = { "Content-Type": "text/plain;charset=utf-8" };
    }

    try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        if (data.status === 'error') {
            throw new Error(data.message);
        }
        return data;
    } catch (error) {
        console.error("API Error:", error);
        // 如果是網路錯誤，回傳 null 或拋出
        throw error;
    }
}

/**
 * ============================================================
 *  初始化 (Initialization)
 * ============================================================
 */

window.onload = function() { 
    // 1. 初始化語音合成
    if ('speechSynthesis' in window) {
        loadVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = loadVoices;
        }
    }
    
    // 2. 鍵盤事件監聽
    document.addEventListener('keydown', function(event) {
        if (event.key === "Escape") { 
            closeModal(); 
            closeStudentModal(); 
            closeImageViewer(); 
        }
    });

    // 3. 載入 YouTube API (如果尚未載入)
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        var tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    // 4. 從後端載入設定與初始化介面
    initApp();
};

function loadVoices() { 
    voices = window.speechSynthesis.getVoices(); 
}

async function initApp() {
    const loadingEl = document.getElementById('loadingText');
    
    try {
        // 取得系統設定 (年級列表、標題等)
        const config = await callGAS('getConfig');
        
        // 更新網頁標題與 Sidebar
        if (config.SiteTitle) document.title = config.SiteTitle;
        if (config.MainTitle) document.getElementById('appMainTitle').innerText = config.MainTitle;
        if (config.SubTitle) document.getElementById('appSubTitle').innerText = config.SubTitle;
        
        // 更新年級列表
        if (config.SystemLevels && Array.isArray(config.SystemLevels)) {
            SERVER_LEVELS = config.SystemLevels;
        }

        renderSidebar();

    } catch (e) {
        console.error("Init failed", e);
        if (loadingEl) loadingEl.innerHTML = `<span class="text-red-500">連線失敗，請檢查網路或 API 設定。</span>`;
    }
}

/**
 * ============================================================
 *  側邊欄與選單 (Sidebar & Navigation)
 * ============================================================
 */

function renderSidebar() {
    const menu = document.getElementById('levelMenu');
    const mobileSelect = document.getElementById('mobileLevelSelect');
    if (!menu || !mobileSelect) return;

    let menuHtml = '';
    let selectHtml = '<option value="" disabled selected>選擇年級</option>';
    
    SERVER_LEVELS.forEach(level => {
        menuHtml += `<li><button onclick="selectLevel('${level}')" class="w-full text-left px-5 py-3 text-slate-600 font-bold hover:bg-white/60 hover:text-indigo-600 transition-all rounded-xl flex items-center gap-3 group"><span class="w-2 h-2 rounded-full bg-slate-300 group-hover:bg-indigo-500 transition-colors"></span>${level}</button></li>`;
        selectHtml += `<option value="${level}">${level}</option>`;
    });
    menu.innerHTML = menuHtml;
    
    // 更新手機版選單
    mobileSelect.innerHTML = selectHtml;
    // 移除舊的 event listener 並新增
    const newSelect = mobileSelect.cloneNode(true);
    mobileSelect.parentNode.replaceChild(newSelect, mobileSelect);
    newSelect.addEventListener('change', (e) => selectLevel(e.target.value));
}

async function selectLevel(level) {
    const title = document.getElementById('currentLevelTitle');
    const container = document.getElementById('contentArea');
    
    title.innerText = `${level} 溫習區`;
    container.innerHTML = `<div class="col-span-full flex flex-col justify-center items-center py-20"><div class="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600"></div><span class="mt-4 text-indigo-400 font-bold animate-pulse">正在準備題目...</span></div>`;

    try {
        // ★ 呼叫 API 取得題目
        const data = await callGAS('getQuestions', { level: level });
        currentGroups = data;
        renderCards(data);
    } catch (error) {
        container.innerHTML = `<div class="col-span-full text-center text-rose-500 bg-rose-50 p-4 rounded-xl border border-rose-200">讀取失敗：${error.message}<br>請稍後重試。</div>`;
    }
}

/**
 * ============================================================
 *  卡片列表渲染 (Card Rendering)
 * ============================================================
 */

function renderCards(groups) {
    const container = document.getElementById('contentArea');
    if (!groups || groups.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center text-slate-400 mt-10">此年級暫無內容</div>`;
        return;
    }

    const studyGroups = groups.filter(g => g.mode !== '測驗');
    const examGroups = groups.filter(g => g.mode === '測驗');

    let html = '';
    const renderGroupCards = (list) => {
        return list.map((group, index) => {
            // 找出真實 index 以便 startQuizGroup 使用
            const realIndex = groups.indexOf(group);
            
            let icon = '📝'; 
            let typeLabel = group.mode || '練習'; 
            let colorClass = group.mode === '測驗' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800';
            
            const firstQ = group.questions[0];
            if (firstQ) {
                if (firstQ.type === '多項選擇題') icon = '👆';
                else if (firstQ.type === '讀默' || firstQ.type === '背默' || firstQ.type === '詞語隨機清單') icon = '👂';
                else if (firstQ.type === '選詞填充') icon = '🧩';
                else if (firstQ.type === '不供詞填充') icon = '✍️';
                else if (firstQ.type === '標點與專名號') icon = '❞'; 
                else if (firstQ.type === 'Youtube問答') icon = '📺';
            }

            return `
            <div onclick="startQuizGroup(${realIndex})" class="glass-panel p-6 rounded-2xl cursor-pointer card-hover group relative overflow-hidden flex flex-col h-full min-h-[160px]">
                <div class="absolute top-0 right-0 -mt-2 -mr-2 w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full opacity-5 blur-xl group-hover:opacity-10 transition-opacity z-0 pointer-events-none"></div>
                <div class="relative z-10 flex flex-col flex-1 justify-between">
                    <div class="flex justify-between items-start">
                        <span class="${colorClass} text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide shadow-sm">${typeLabel}</span>
                        <span class="text-3xl group-hover:scale-110 transition-transform filter drop-shadow-sm">${icon}</span>
                    </div>
                    <h3 class="text-xl font-bold text-slate-800 my-4 leading-snug group-hover:text-indigo-600 transition-colors break-words">
                        ${group.title || '（無標題）'}
                    </h3>
                    <div class="pt-3 flex items-center text-slate-400 text-sm font-medium border-t border-slate-100/50">
                        <span class="bg-slate-100/80 px-2 py-0.5 rounded text-xs mr-2 flex-shrink-0">共 ${group.questions.length} 題</span>
                        <span class="flex-shrink-0">點擊開始</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    };

    if (studyGroups.length > 0) {
        html += `<div class="col-span-full text-xl font-bold text-slate-700 mt-4 mb-2 flex items-center gap-2 border-l-4 border-indigo-500 pl-3">📖 溫習區</div>`;
        html += renderGroupCards(studyGroups);
    }
    if (examGroups.length > 0) {
        html += `<div class="col-span-full text-xl font-bold text-slate-700 mt-8 mb-2 flex items-center gap-2 border-l-4 border-rose-500 pl-3">✍️ 測驗區</div>`;
        html += renderGroupCards(examGroups);
    }
    container.innerHTML = html;
}

/**
 * ============================================================
 *  測驗邏輯 (Quiz Logic)
 * ============================================================
 */

function startQuizGroup(index) {
    const group = currentGroups[index];
    activeGroup = group; 
    
    currentUploadSetting = (group.uploadScore !== false);
    currentShowAnswerSetting = (group.showAnswer !== false); 

    // 複製並隨機化題目 (如果需要)
    let queueToUse = JSON.parse(JSON.stringify(group.questions)); // Deep copy
    if (group.randomOrder) {
        for (let i = queueToUse.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queueToUse[i], queueToUse[j]] = [queueToUse[j], queueToUse[i]];
        }
    }
    
    currentQuizQueue = queueToUse;
    currentQIndex = 0;                  
    currentTotalScore = 0;
    quizTotalMaxScore = 0;
    
    // 計算每題分數權重
    const qCount = currentQuizQueue.length;
    const isAllDefault100 = currentQuizQueue.every(q => !q.maxScore || q.maxScore == 100 || q.maxScore === "");
    
    let autoBaseScore = 0;
    let autoRemainder = 0;

    if (isAllDefault100 && qCount > 0) {
        autoBaseScore = Math.floor(100 / qCount); 
        autoRemainder = 100 % qCount;             
    }

    currentQuizQueue.forEach((q, i) => {
        let qMax = 0;
        if (isAllDefault100 && qCount > 0) {
            qMax = autoBaseScore + (i < autoRemainder ? 1 : 0);
        } else {
            qMax = (q.maxScore && q.maxScore !== "") ? parseInt(q.maxScore) : 100;
        }
        q.tempMaxScore = qMax; 
        quizTotalMaxScore += qMax;
    });

    currentMode = group.mode || '溫習'; 
    
    userAnswers = Array.from({length: currentQuizQueue.length}, () => ({
        answer: null, 
        score: 0,
        maxScore: 0,
        fixedList: null 
    }));
    
    isInputLocked = false;
    isReviewChecked = false;
    
    stopTimer();
    const timerEl = document.getElementById('quizTimer');
    timerEl.classList.add('hidden');
    timerEl.innerText = "00:00";

    document.getElementById('modalTitle').innerText = group.title;
    const modal = document.getElementById('quizModal');
    
    modal.classList.remove('hidden', 'z-50');
    modal.classList.add('z-[200]'); 
    
    setTimeout(() => modal.firstElementChild.classList.remove('scale-95', 'opacity-0'), 10);
    
    if (currentMode === '測驗') {
        renderReadyScreen(group.questions.length);
    } else {
        beginExam(); 
    }
}

function renderReadyScreen(qCount) {
    const content = document.getElementById('modalContent');
    content.innerHTML = `
    <div class="flex flex-col items-center justify-center h-full py-10 space-y-8 animate-bounce-in">
        <div class="w-24 h-24 bg-rose-100 rounded-full flex items-center justify-center text-4xl shadow-lg">⏱️</div>
        <div class="text-center space-y-2">
            <h2 class="text-2xl font-bold text-slate-800">準備好開始測驗了嗎？</h2>
            <p class="text-slate-500">本測驗共有 <span class="font-bold text-rose-500 text-xl">${qCount}</span> 題</p>
        </div>
        <button onclick="beginExam()" class="px-10 py-4 bg-gradient-to-r from-rose-500 to-orange-500 text-white text-lg font-bold rounded-2xl shadow-xl hover:scale-105 transition-transform active:scale-95">
            🚀 開始測驗
        </button>
    </div>
    `;
}

function beginExam() {
    quizStartTime = Date.now();
    elapsedSeconds = 0;
    if (currentMode === '測驗') {
        const timerEl = document.getElementById('quizTimer');
        timerEl.classList.remove('hidden');
        timerInterval = setInterval(updateTimer, 1000);
    }
    isReviewChecked = false;
    loadCurrentQuestion();
}

function updateTimer() {
    elapsedSeconds++;
    document.getElementById('quizTimer').innerText = formatTime(elapsedSeconds);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function loadCurrentQuestion() {
    isInputLocked = (currentMode === '溫習' && isReviewChecked);
    
    const content = document.getElementById('modalContent');
    
    if (currentMode === '溫習' && currentQIndex >= currentQuizQueue.length) {
        showFinalResult();
        return;
    }

    const q = currentQuizQueue[currentQIndex];
    const paginationHtml = renderPagination(currentQuizQueue.length, currentQIndex);

    const progressHtml = `
    <div class="mb-4 flex flex-col gap-2">
        <div class="flex justify-between items-center text-xs text-slate-400 font-bold uppercase tracking-wider">
            <span>QUESTION ${currentQIndex + 1} / ${currentQuizQueue.length}</span>
            <span class="${currentMode === '測驗' ? 'text-rose-500' : 'text-indigo-500'}">${currentMode}模式</span>
        </div>
        ${paginationHtml}
    </div>`;
    
    content.innerHTML = progressHtml + '<div id="questionContainer" class="opacity-0 transition-opacity duration-300"></div>';
    const qContainer = document.getElementById('questionContainer');

    const showResult = (currentMode === '溫習' && isReviewChecked);

    // 根據題型呼叫對應的渲染函式 (定義在各個 js-xxx.js 檔案中)
    try {
        if (q.type === '多項選擇題') {
            if(typeof renderMCQ === 'function') renderMCQ(q, qContainer, currentMode, userAnswers[currentQIndex], showResult);
        } else if (q.type === '背默' || q.type === '讀默' || q.type === '詞語隨機清單') {
            if(typeof renderDictationUI === 'function') renderDictationUI(q, qContainer, currentMode, userAnswers[currentQIndex], showResult);
        } else if (q.type === '選詞填充' || q.type === '不供詞填充') { 
            if(typeof renderDragDrop === 'function') renderDragDrop(q, qContainer, currentMode, userAnswers[currentQIndex], showResult);
        } else if (q.type === '標點與專名號') { 
            if(typeof renderPunctuationQuiz === 'function') renderPunctuationQuiz(q, qContainer, currentMode, userAnswers[currentQIndex], showResult);
        } else if (q.type === 'Youtube問答') {
            if(typeof renderYoutubeQuiz === 'function') renderYoutubeQuiz(q, qContainer, currentMode, userAnswers[currentQIndex], showResult);
        } else {
            qContainer.innerHTML = `<div class="text-center text-red-500 p-4">未知的題型: ${q.type}，請檢查檔案是否完整載入。</div>`;
        }
    } catch (e) {
        console.error("Render Error:", e);
        qContainer.innerHTML = `<div class="text-center text-red-500 p-4">題目載入發生錯誤。<br>${e.message}</div>`;
    }

    renderExamNavigation(content);

    requestAnimationFrame(() => {
        qContainer.classList.remove('opacity-0');
    });
}

function renderPagination(total, current) {
    let html = '<div class="flex flex-wrap gap-2 justify-center">';
    for (let i = 0; i < total; i++) {
        const isCurrent = (i === current);
        const hasAnswer = userAnswers[i] && userAnswers[i].answer !== null;
        let bgClass = 'bg-white text-slate-400 border border-slate-200';
        
        if (isCurrent) {
            bgClass = 'bg-indigo-600 text-white shadow-md scale-110';
        } else if (isReviewChecked) {
            bgClass = 'bg-emerald-50 text-emerald-600 border border-emerald-200';
        } else if (hasAnswer) {
            bgClass = 'bg-indigo-50 text-indigo-600 border border-indigo-200';
        }
        
        html += `<button onclick="jumpToQuestion(${i})" class="w-8 h-8 rounded-full text-xs font-bold transition-all ${bgClass}">${i + 1}</button>`;
    }
    html += '</div>';
    return html;
}

function jumpToQuestion(index) {
    if (index === currentQIndex) return;
    currentQIndex = index;
    loadCurrentQuestion();
}

function renderExamNavigation(container) {
    const isLast = currentQIndex === currentQuizQueue.length - 1;
    const isFirst = currentQIndex === 0;
    
    let centerBtnHtml = '';
    let rightBtnHtml = ''; 
    
    const currentQ = currentQuizQueue[currentQIndex];
    const isYoutube = (currentQ.type === 'Youtube問答');

    if (!isLast) {
        rightBtnHtml = `<button onclick="navigateExam(1)" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all font-bold">下一題 →</button>`;
    }

    if (currentMode === '溫習') {
        if (isReviewChecked) {
            if (isLast) {
                rightBtnHtml = `<button onclick="submitExam()" class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg font-bold transition-all">完成提交 🏁</button>`;
            }
        } else {
            if (isLast) {
                centerBtnHtml = `<button onclick="checkAllAnswers()" class="px-8 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-lg font-bold transition-all">🔍 核對答案</button>`;
            }
        }
    } else {
        if (isLast) {
            rightBtnHtml = `<button onclick="submitExam()" class="px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-200 font-bold transition-all">提交試卷 ✅</button>`;
        }
    }

    if (isYoutube) {
        centerBtnHtml = '';
    }

    const navHtml = `
    <div class="mt-8 pt-4 border-t border-slate-100 grid grid-cols-3 items-center">
        <div class="text-left">
            <button onclick="navigateExam(-1)" ${isFirst ? 'disabled class="opacity-30 cursor-not-allowed px-4 py-2"' : 'class="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"'} >← 上一題</button>
        </div>
        <div class="text-center">
            ${centerBtnHtml}
        </div>
        <div class="text-right">
            ${rightBtnHtml}
        </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', navHtml);
}

function checkAllAnswers() {
    isReviewChecked = true; 
    loadCurrentQuestion();  
}

function navigateExam(direction) {
    currentQIndex += direction;
    loadCurrentQuestion();
}

function submitExam() {
    const unanswered = userAnswers.filter(a => a === null || a.answer === null).length;
    if (currentMode === '測驗' || !isReviewChecked) { 
         if(unanswered > 0) {
             if(!confirm(`還有 ${unanswered} 題未作答，確定要交卷嗎？`)) return;
         }
    }
    showFinalResult();
}

// 供子模組呼叫的通用函式：記錄答案
function handleAnswer(earnedScore, userInput) {
    const currentQ = currentQuizQueue[currentQIndex];
    let normalizedScore = 0;
    
    if (earnedScore === 100) {
        normalizedScore = currentQ.tempMaxScore;
    } else if (earnedScore === 0) {
        normalizedScore = 0;
    } else {
        normalizedScore = Math.round((earnedScore / 100) * currentQ.tempMaxScore);
    }

    if (isReviewChecked && currentMode === '溫習') return;

    let currentRecord = userAnswers[currentQIndex] || {};
    
    userAnswers[currentQIndex] = { 
        answer: userInput, 
        score: normalizedScore, 
        maxScore: currentQ.tempMaxScore,
        fixedList: currentRecord.fixedList 
    };
}

/**
 * ============================================================
 *  結果與提交 (Results & Submission)
 * ============================================================
 */

function showFinalResult() {
    stopTimer();
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    if (currentMode === '溫習') {
         elapsedSeconds = Math.round((Date.now() - quizStartTime) / 1000);
    }

    let finalEarnedPoints = 0;
    userAnswers.forEach(record => {
        if (record) finalEarnedPoints += record.score;
    });

    let finalPercentage = 0;
    if (quizTotalMaxScore > 0) {
        finalPercentage = Math.round((finalEarnedPoints / quizTotalMaxScore) * 100);
    }

    renderResultSummary(finalPercentage, elapsedSeconds, finalEarnedPoints, quizTotalMaxScore);
}

function renderResultSummary(percentage, totalSeconds, rawScore, totalMax) {
    const content = document.getElementById('modalContent');
    // 生成結果 HTML (包含每題詳情)
    content.innerHTML = generateResultHtml(percentage, totalSeconds, true);
    document.getElementById('modalTitle').innerText = "成績總結";
}

function generateResultHtml(percentage, totalSeconds, showUploadBtn) {
    let finalEarnedPoints = 0;
    userAnswers.forEach(r => { if (r) finalEarnedPoints += r.score; });
    
    const timeStr = formatTime(totalSeconds);
    
    let html = `
    <div class="text-center mb-6">
        <h2 class="text-2xl font-bold text-slate-800">測驗完成！</h2>
        <div class="flex justify-center gap-6 mt-4">
            <div class="bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                <div class="text-xs text-slate-500 uppercase font-bold">總成績 (Score)</div>
                <div class="text-3xl font-black text-rose-500">${percentage} <span class="text-sm text-slate-400">分</span></div>
                <div class="text-xs text-slate-400 mt-1">(${finalEarnedPoints} / ${quizTotalMaxScore} 分)</div>
            </div>
            <div class="bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                <div class="text-xs text-slate-500 uppercase font-bold">用時</div>
                <div class="text-3xl font-black text-indigo-500 font-mono">${timeStr}</div>
            </div>
        </div>
    </div>
    <div class="space-y-3 mb-8">`;

    currentQuizQueue.forEach((q, idx) => {
        const record = userAnswers[idx];
        const earned = record ? record.score : 0;
        const max = q.tempMaxScore;
        const isFullMarks = (earned === max);
        
        let userAnswerDisplay = '';
        let correctAnswerDisplay = '';
        let displayQuestionText = q.content || '';
        let actualCorrectAnswer = '';
        
        const hasBrackets = q.content.match(/\[(.*?)\]/);
        if (hasBrackets) {
            const mcqMatch = q.content.match(/\[(.*?)\]/);
            if(mcqMatch) actualCorrectAnswer = mcqMatch[1];
            displayQuestionText = q.content.replace(/\[(.*?)\]/g, '<span class="text-indigo-600 font-bold">[_____]</span>');
        } else {
            actualCorrectAnswer = q.content;
            displayQuestionText = q.content;
        }

        if (q.type === '標點與專名號') {
            if (typeof currentShowAnswerSetting !== 'undefined' && !currentShowAnswerSetting) {
                displayQuestionText = q.content
                    .replace(/[，。？！、：；……「」『』（）,.?!:;]/g, ' [___] ') 
                    .replace(/[{}]/g, ''); 
            } else {
                displayQuestionText = q.content.replace(/[{}]/g, '');
            }
        }

        correctAnswerDisplay = q.content.replace(/\[(.*?)\]/g, '<span class="text-emerald-600 font-bold">$1</span>').replace(/\n/g, '<br>');

        if (record && record.answer) {
            // 根據題型格式化顯示用戶答案
            if (record.answer.type === 'vocab' && record.fixedList) {
                userAnswerDisplay = `<div class="flex flex-wrap gap-2 mt-1">` + 
                    record.fixedList.map((item, i) => {
                        const userWord = record.answer.answer[i] || "";
                        const isCorrect = (userWord === item.w);
                        const styleClass = isCorrect ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200 line-through";
                        return `<span class="px-2 py-1 rounded text-sm border ${styleClass}">${i+1}. ${userWord || '(空)'}</span>`;
                    }).join('') + `</div>`;
                
                correctAnswerDisplay = `<div class="flex flex-wrap gap-2 mt-1">` + 
                    record.fixedList.map((item, i) => {
                         const label = item.isPinyinQuestion ? `${item.w} (${item.p})` : item.w;
                         return `<span class="bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded text-sm">${i+1}. ${label}</span>`;
                    }).join('') + `</div>`;

            } else if ((q.type === '選詞填充' || q.type === '不供詞填充') && record.answer.details) { 
                let blankId = 0;
                const lines = q.content.split(/\n/g);
                const processedLines = lines.map(line => {
                    if(!line.trim()) return '';
                    return line.replace(/\[(.*?)\]/g, (match, correctVal) => {
                        const userVal = record.answer.details[blankId] || "___";
                        blankId++;
                        if (userVal === correctVal) return `<span class="text-emerald-600 font-bold border-b-2 border-emerald-100 mx-1 px-1">${userVal}</span>`;
                        else return `<span class="text-rose-500 line-through mx-1">${userVal}</span><span class="text-slate-500 font-bold text-sm">(正確：${correctVal})</span>`;
                    });
                }).filter(l => l !== '');
                userAnswerDisplay = `<div class="flex flex-col gap-3 mt-3 leading-loose">${processedLines.map(line => `<div class="border-b border-slate-100 pb-1">${line}</div>`).join('')}</div>`;

            } else if (q.type === '多項選擇題') {
                userAnswerDisplay = record.answer || '(未作答)';
                correctAnswerDisplay = actualCorrectAnswer;

            } else if (typeof record.answer === 'string') {
                // 一般文字比較 (背默/讀默)
                const userRawInput = record.answer || "";
                const isPartialQuestion = q.content.includes('[') && q.content.includes(']');

                if (isPartialQuestion) {
                    let inputIdx = 0;
                    userAnswerDisplay = q.content.replace(/\[(.*?)\]/g, (match, correctContent) => {
                        const userChar = userRawInput[inputIdx];
                        inputIdx++;
                        if (userChar) {
                            if (userChar === correctContent) return `<span class="text-emerald-600 font-bold border-b border-emerald-300">[${userChar}]</span>`;
                            else return `<span class="text-rose-500 font-bold border-b border-rose-300">[${userChar}]</span>`;
                        } else return `<span class="text-slate-300">[_____]</span>`;
                    }).replace(/\n/g, '<br>');
                } else {
                    let diffHtml = "";
                    const targetStr = q.content;
                    const maxLen = Math.max(userRawInput.length, targetStr.length);
                    for (let i = 0; i < maxLen; i++) {
                        const uChar = userRawInput[i] || "";
                        const cChar = targetStr[i] || "";
                        if (uChar === cChar) {
                            diffHtml += `<span class="text-emerald-600">${uChar}</span>`;
                        } else {
                            if (uChar) diffHtml += `<span class="text-rose-500 font-bold border-b border-rose-300">${uChar}</span>`;
                            else diffHtml += `<span class="text-rose-300 border-b border-dashed border-rose-300">&nbsp;_&nbsp;</span>`;
                        }
                    }
                    userAnswerDisplay = diffHtml.replace(/\n/g, '<br>');
                }
            } else if (record.answer && record.answer.type === 'youtube') {
                userAnswerDisplay = "影片互動問答 (分數：" + record.answer.score + ")";
                correctAnswerDisplay = "完成所有問題";
            } else if (record.answer && record.answer.type === 'punctuation') { 
                userAnswerDisplay = "標點與專名號作答完成";
                correctAnswerDisplay = "詳細結果請查看上方回顧"; 
            } else {
                 userAnswerDisplay = JSON.stringify(record.answer);
            }
        } else {
            userAnswerDisplay = '(未作答)';
            if (q.type === '多項選擇題') correctAnswerDisplay = actualCorrectAnswer;
        }
        
        const showReference = currentShowAnswerSetting && !isFullMarks && correctAnswerDisplay && 
                              q.type !== '詞語隨機清單' && q.type !== '多項選擇題' && q.type !== '標點與專名號' &&
                              ((q.type !== '選詞填充' && q.type !== '不供詞填充') || !record);

        html += `
        <div class="p-3 mb-3 rounded-lg border-l-4 ${isFullMarks ? 'border-emerald-500 bg-emerald-50' : 'border-rose-500 bg-rose-50'}">
            <div class="flex justify-between items-start mb-1">
                <div class="font-bold text-slate-700 text-sm">第 ${idx + 1} 題</div>
                <div class="${isFullMarks ? 'text-emerald-600' : 'text-rose-600'} font-bold text-sm">
                    ${earned} <span class="text-xs text-slate-400">/ ${max}</span>
                </div>
            </div>
            ${q.type !== '選詞填充' && q.type !== '不供詞填充' && q.type !== '背默' && q.type !== '讀默' && q.type !== '詞語隨機清單' && q.type !== 'Youtube問答' ? `<div class="text-xs text-slate-800 mb-2">${displayQuestionText}</div>` : ''}
            <div class="text-xs text-slate-600">你的答案：${userAnswerDisplay}</div>
            ${showReference ? `<div class="text-xs text-slate-500 border-t border-slate-200 pt-1 mt-1">參考：${correctAnswerDisplay}</div>` : ''}
            ${(q.type === '多項選擇題' && !isFullMarks && currentShowAnswerSetting) ? `<div class="text-xs mt-1 text-slate-500">正確：<span class="text-emerald-600 font-bold">${actualCorrectAnswer}</span></div>` : ''}
        </div>`;
    });

    html += `</div>`;

    if (showUploadBtn && currentUploadSetting) {
        html += `
        <div class="flex justify-center">
            <button onclick="prepareSubmission(${percentage}, ${totalSeconds})" class="px-8 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl shadow-lg font-bold hover:scale-105 transition-transform">
                登記成績 📝
            </button>
        </div>`;
    } else if (showUploadBtn && !currentUploadSetting) {
         html += `<div class="flex justify-center"><div class="text-slate-400 text-sm font-bold bg-slate-100 px-4 py-2 rounded-lg">此練習無需上傳成績</div></div>`;
    }
    
    return html;
}

function prepareSubmission(score, totalSeconds) { 
    stopTimer(); 
    const modal = document.getElementById('quizModal'); 
    modal.classList.add('hidden'); 
    
    switchStudentModalView('upload'); 
    
    const level = activeGroup ? activeGroup.level : 'Unknown'; 
    initStudentForm(level); 
    
    document.getElementById('displayScore').innerText = score; 
    document.getElementById('displayTime').innerText = formatTime(totalSeconds); 
    
    const detailsContainer = document.getElementById('submissionDetails'); 
    detailsContainer.innerHTML = generateResultHtml(score, totalSeconds, false);
    
    const timeStr = formatTime(totalSeconds); 
    const title = activeGroup ? activeGroup.title : 'Unknown Title';

    tempResultData = { 
        level: level, 
        questionID: `${title} (${currentMode})`, 
        score: score, 
        timeTaken: timeStr 
    }; 
    
    document.getElementById('studentInfoModal').classList.remove('hidden'); 
}

function switchStudentModalView(viewName) { 
    const formView = document.getElementById('uploadFormView'); 
    const reviewView = document.getElementById('reviewDetailsView'); 
    if (viewName === 'review') { 
        formView.classList.add('hidden'); 
        reviewView.classList.remove('hidden'); 
    } else { 
        reviewView.classList.add('hidden'); 
        formView.classList.remove('hidden'); 
    } 
}

function initStudentForm(currentLevel) { 
    const gradeSelect = document.getElementById('inputGrade'); 
    const numSelect = document.getElementById('inputNumber'); 
    
    let gradeHtml = ''; 
    SERVER_LEVELS.forEach(l => { 
        gradeHtml += `<option value="${l}" ${l === currentLevel ? 'selected' : ''}>${l}</option>`; 
    }); 
    gradeSelect.innerHTML = gradeHtml; 
    
    let numHtml = ''; 
    for(let i=1; i<=40; i++) { 
        numHtml += `<option value="${i}">${i}</option>`; 
    } 
    numSelect.innerHTML = numHtml; 
    
    updateClassLetters(); 
}

function updateClassLetters() { 
    const grade = document.getElementById('inputGrade').value; 
    const letterSelect = document.getElementById('inputLetter'); 
    const letters = CLASS_CONFIG[grade] || ["A", "B", "C", "D", "E", "F"]; 
    let html = ''; 
    letters.forEach(l => { 
        html += `<option value="${l}">${l}</option>`; 
    }); 
    letterSelect.innerHTML = html; 
}

/**
 * ============================================================
 *  上傳成績 (Submission via API)
 * ============================================================
 */

async function finalSubmit() { 
    const grade = document.getElementById('inputGrade').value; 
    const letter = document.getElementById('inputLetter').value; 
    const number = document.getElementById('inputNumber').value; 
    const studentName = `${grade}${letter} (${number})`; 
    
    const btn = document.querySelector('#studentInfoModal button.bg-gradient-to-r'); 
    const originalText = btn.innerText; 
    btn.disabled = true; 
    btn.innerText = "上傳中..."; 
    
    const payload = { 
        studentName: studentName, 
        level: tempResultData.level, 
        questionID: tempResultData.questionID, 
        score: tempResultData.score, 
        timeTaken: tempResultData.timeTaken 
    }; 

    try {
        // ★ 呼叫 API 上傳成績 (POST)
        const res = await callGAS('saveStudentResult', payload, 'POST');
        alert(`✅ 上傳成功！\n同學：${studentName}`);
        closeStudentModal();
    } catch (err) {
        alert("上傳失敗：" + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

/**
 * ============================================================
 *  工具函式 (Utilities)
 * ============================================================
 */

function closeModal() { 
    stopTimer(); 
    const modal = document.getElementById('quizModal'); 
    modal.classList.add('hidden'); 
    if (window.speechSynthesis) window.speechSynthesis.cancel(); 
}

function closeStudentModal() { 
    document.getElementById('studentInfoModal').classList.add('hidden'); 
}

function viewImage(src) { 
    let modal = document.getElementById('imageViewerModal'); 
    const img = document.getElementById('expandedImg'); 
    img.src = src; 
    modal.classList.remove('hidden'); 
    requestAnimationFrame(() => { 
        modal.classList.remove('opacity-0'); 
        img.classList.remove('scale-100'); 
        img.classList.add('scale-100'); 
    }); 
}

function closeImageViewer() { 
    const modal = document.getElementById('imageViewerModal'); 
    const img = document.getElementById('expandedImg'); 
    if (modal && !modal.classList.contains('hidden')) { 
        modal.classList.add('opacity-0'); 
        img.classList.remove('scale-100'); 
        img.classList.add('scale-95'); 
        setTimeout(() => { modal.classList.add('hidden'); }, 300); 
    } 
}