var ytPlayer = null;
var ytTimer = null;
var ytState = {
    points: [],
    currentIndex: 0,
    isReviewMode: false,
    reviewRequired: false,
    videoUrl: "",
    hasAnswered: {}, 
    pointStatus: [], 
    userChoices: [],
    startTime: 0,
    endTime: 0,
    lockControls: false,
    singleAttempt: false,
    showTime: false
};

function renderYoutubeQuiz(q, container, mode, savedAnswer, showResult) {
    // 1. 初始化
    ytState.videoUrl = q.content || "";
    ytState.points = [];
    ytState.reviewRequired = false;
    ytState.lockControls = false;
    ytState.singleAttempt = false;
    ytState.showTime = false;
    ytState.hasAnswered = {};
    ytState.pointStatus = []; 
    ytState.userChoices = [];
    ytState.isReviewMode = false;
    ytState.startTime = 0;
    ytState.endTime = 0;

    // 2. 解析資料
    try {
        let parsedData = q.options;
        if (typeof parsedData === 'string') {
            parsedData = JSON.parse(parsedData);
            if (typeof parsedData === 'string') parsedData = JSON.parse(parsedData);
        }
        if (parsedData) {
            if (parsedData.points) {
                ytState.points = parsedData.points.sort((a, b) => a.time - b.time);
                ytState.pointStatus = new Array(ytState.points.length).fill('pending');
                ytState.userChoices = new Array(ytState.points.length).fill(null);
            }
            ytState.reviewRequired = parsedData.enableReview || false;
            ytState.lockControls = parsedData.lockControls || false;
            ytState.singleAttempt = parsedData.singleAttempt || false;
            ytState.showTime = parsedData.showTime || false;
            ytState.startTime = parseInt(parsedData.startTime) || 0;
            ytState.endTime = parseInt(parsedData.endTime) || 0;
        }
    } catch (e) { console.error("YT Parse Error", e); }

    // 3. 提取 Video ID
    let videoId = "";
    try {
        const urlObj = new URL(ytState.videoUrl);
        if (urlObj.hostname === "youtu.be") {
            videoId = urlObj.pathname.slice(1);
        } else if (urlObj.hostname.includes("youtube.com")) {
            videoId = urlObj.searchParams.get("v");
        }
    } catch(e) {
        const match = ytState.videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/)([\w-]{11}))/);
        if (match && match[1]) videoId = match[1];
    }

    // 4. HTML 建構
    let timeDisplayHtml = '';
    if (ytState.showTime) {
        timeDisplayHtml = `
        <div id="yt-time-display" class="w-full text-center mb-2 bg-slate-800 text-white py-2 rounded-lg font-mono text-sm tracking-wider shadow-md">
            載入時間中...
        </div>`;
    }

    let clickShieldHtml = '';
    let customPlayBtnHtml = '';

    if (ytState.lockControls) {
        clickShieldHtml = `<div id="yt-click-shield" class="absolute inset-0 z-10 bg-transparent cursor-not-allowed" onclick="showLockedAlert()"></div>`;
        
        customPlayBtnHtml = `
        <div id="yt-custom-play-btn" class="absolute inset-0 z-30 flex items-center justify-center bg-black/40 cursor-pointer group" onclick="playYoutubeVideo()">
            <div class="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                <svg class="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
        </div>`;
    }

    container.innerHTML = `
        <div id="yt-wrapper" class="w-full max-w-4xl mx-auto flex flex-col items-center select-none" style="min-height: 400px;">
            
            ${timeDisplayHtml}

            <div class="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-lg mb-4">
                ${clickShieldHtml}
                ${customPlayBtnHtml}
                <div id="yt-player-placeholder"></div>
                
                <div id="yt-overlay" class="absolute inset-0 z-40 bg-slate-900/95 hidden flex flex-col items-center justify-center p-6 text-center transition-all">
                    <div id="yt-question-box" class="w-full max-w-lg animate-bounce-in"></div>
                </div>
            </div>
            
            <div class="w-full flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
                <div class="text-sm font-bold text-slate-500">📺 影片互動模式 ${ytState.lockControls ? '(鎖定)' : ''}</div>
                <div id="yt-status-text" class="text-xs text-indigo-500 font-bold">準備播放...</div>
            </div>

            <div id="yt-question-nav" class="w-full space-y-2 mb-8">
                <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">問題列表 (點擊可跳轉至問題前30秒)</div>
                <div id="yt-question-list-container" class="grid grid-cols-1 gap-2"></div>
            </div>

            <div id="yt-review-area" class="hidden w-full mt-2 space-y-6 pb-20 border-t border-dashed border-slate-300 pt-6">
                <div class="text-center">
                    <h3 class="text-2xl font-bold text-slate-800">🎉 影片觀看完成！</h3>
                    <p class="text-slate-500 mb-6">請回答以下問題以完成溫習。</p>
                </div>
                <div id="yt-review-questions"></div>
                <button onclick="submitYoutubeReview()" class="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold shadow-lg transition text-lg active:scale-95">
                    提交答案並完成 ✅
                </button>
            </div>
        </div>
    `;

    if (!videoId) {
        container.innerHTML += `<div class="text-red-500 text-center mt-4">無法讀取影片 ID，請檢查網址。<br>網址: ${ytState.videoUrl}</div>`;
        return;
    }

    renderQuestionList();

    if (window.YT && window.YT.Player) {
        initPlayer(videoId);
    } else {
        window.onYouTubeIframeAPIReady = function() { initPlayer(videoId); };
    }
}

function playYoutubeVideo() {
    if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
        ytPlayer.playVideo();
        const btn = document.getElementById('yt-custom-play-btn');
        if(btn) btn.classList.add('hidden');
    }
}

function showLockedAlert() {
    // alert("🔒 鎖定模式下無法手動點擊影片暫停或跳轉。");
}

function renderQuestionList() {
    const listContainer = document.getElementById('yt-question-list-container');
    if (!listContainer) return;

    let html = '';
    ytState.points.forEach((p, idx) => {
        const status = ytState.pointStatus[idx];
        const userChoice = ytState.userChoices[idx]; 
        
        let statusIcon = '⚪';
        let statusClass = 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-indigo-300';
        let statusText = '未作答';
        let userChoiceHtml = '';

        if (status === 'correct') {
            statusIcon = '🟢';
            statusClass = 'bg-emerald-50 border-emerald-200 text-emerald-700';
            statusText = '已答對';
            if (userChoice) {
                userChoiceHtml = `<span class="text-xs font-medium text-emerald-600 mr-3 hidden sm:inline-block">你的選擇: ${userChoice}</span>`;
            }
        } else if (status === 'wrong') {
            statusIcon = '🔴';
            statusClass = 'bg-rose-50 border-rose-200 text-rose-700';
            statusText = '曾答錯';
            if (userChoice) {
                userChoiceHtml = `<span class="text-xs font-medium text-rose-500 mr-3 hidden sm:inline-block">你的選擇: ${userChoice}</span>`;
            }
        }

        const timeLabel = formatSimpleTime(p.time);

        html += `
        <button onclick="jumpToQuestionContext(${idx})" class="flex items-center justify-between w-full p-3 rounded-xl border-2 transition-all ${statusClass} group">
            <div class="flex items-center gap-3 text-left overflow-hidden">
                <span class="text-xl group-hover:scale-110 transition-transform flex-shrink-0">${statusIcon}</span>
                <div class="min-w-0">
                    <div class="text-xs font-bold opacity-60">問題時間: ${timeLabel}</div>
                    <div class="font-bold text-sm truncate pr-2">${p.question}</div>
                </div>
            </div>
            <div class="flex items-center flex-shrink-0">
                ${userChoiceHtml}
                <div class="text-xs font-bold px-2 py-1 rounded bg-white/60 border border-black/5 whitespace-nowrap shadow-sm">
                    ${statusText} ↩
                </div>
            </div>
        </button>`;
    });
    listContainer.innerHTML = html;
}

function jumpToQuestionContext(idx) {
    if (!ytPlayer || typeof ytPlayer.seekTo !== 'function') return;
    
    const p = ytState.points[idx];
    if (!p) return;

    let targetTime = p.time - 30;
    if (targetTime < ytState.startTime) targetTime = ytState.startTime;
    if (targetTime < 0) targetTime = 0;

    ytPlayer.seekTo(targetTime, true);
    ytPlayer.playVideo();

    Object.keys(ytState.hasAnswered).forEach(t => {
        if (parseFloat(t) >= targetTime) delete ytState.hasAnswered[t];
    });

    document.getElementById('yt-player-placeholder').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function initPlayer(videoId) {
    if(ytPlayer && typeof ytPlayer.destroy === 'function') { ytPlayer.destroy(); }
    
    const playerVars = { 'playsinline': 1, 'rel': 0, 'modestbranding': 1 };
    if (ytState.lockControls) {
        playerVars.controls = 0;
        playerVars.disablekb = 1;
        playerVars.fs = 0; 
    }
    if (ytState.startTime > 0) playerVars.start = ytState.startTime;
    if (ytState.endTime > 0) playerVars.end = ytState.endTime;

    ytPlayer = new YT.Player('yt-player-placeholder', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: playerVars,
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    if(ytTimer) clearInterval(ytTimer);
    ytTimer = setInterval(checkVideoTime, 250); 
}

function onPlayerStateChange(event) {
    const statusDiv = document.getElementById('yt-status-text');
    const playBtn = document.getElementById('yt-custom-play-btn');

    if (event.data === YT.PlayerState.PLAYING) {
        if(statusDiv) {
            statusDiv.innerText = "播放中...";
            statusDiv.className = "text-xs text-indigo-500 font-bold";
        }
        if(playBtn) playBtn.classList.add('hidden');

    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.CUED || event.data === -1) {
        if(statusDiv) {
            statusDiv.innerText = "已暫停 (點擊畫面播放)";
            statusDiv.className = "text-xs text-slate-400 font-bold";
        }
        if(playBtn && ytState.lockControls) playBtn.classList.remove('hidden');

    } else if (event.data === YT.PlayerState.ENDED) {
        handleVideoEnd();
    }
}

function checkVideoTime() {
    if (!ytPlayer || !ytPlayer.getCurrentTime || ytState.isReviewMode) return;
    
    const currentTime = ytPlayer.getCurrentTime();
    
    if (ytState.showTime) {
        const timeDisplay = document.getElementById('yt-time-display');
        if (timeDisplay) {
            const duration = ytState.endTime > 0 ? ytState.endTime : ytPlayer.getDuration();
            const remaining = Math.max(0, duration - currentTime);
            const total = Math.max(0, duration - ytState.startTime);
            timeDisplay.innerText = `剩餘時間: ${formatSimpleTime(remaining)} / 總播放時間: ${formatSimpleTime(total)}`;
        }
    }

    if (ytState.endTime > 0 && currentTime >= ytState.endTime) {
        ytPlayer.pauseVideo();
        handleVideoEnd();
        return;
    }

    const missedPoint = ytState.points.find(p => p.time <= currentTime && !ytState.hasAnswered[p.time]);

    if (missedPoint) {
        const idx = ytState.points.indexOf(missedPoint);
        pauseAndAsk(missedPoint, idx);
    }
}

function pauseAndAsk(point, idx) {
    ytPlayer.pauseVideo();
    ytState.hasAnswered[point.time] = true; 
    
    const overlay = document.getElementById('yt-overlay');
    const box = document.getElementById('yt-question-box');
    
    let optionsHtml = point.options.map((opt) => `
        <button onclick="checkYoutubeAnswer(this, '${opt}', '${point.answer}', ${point.jumpTo}, ${idx})" 
            class="w-full text-left p-3 mb-2 bg-white hover:bg-indigo-50 border-2 border-slate-200 hover:border-indigo-400 rounded-xl font-bold text-slate-700 transition">
            ${opt}
        </button>
    `).join('');

    box.innerHTML = `
        <div class="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full w-fit mx-auto mb-3">問題時間</div>
        <h3 class="text-xl font-bold text-white mb-6 leading-relaxed">${point.question}</h3>
        <div class="space-y-2">${optionsHtml}</div>
    `;
    
    overlay.classList.remove('hidden');
}

function checkYoutubeAnswer(btn, selected, correct, jumpTo, idx) {
    const isCorrect = (selected === correct);
    const overlay = document.getElementById('yt-overlay');
    const allBtns = btn.parentElement.querySelectorAll('button');
    allBtns.forEach(b => b.disabled = true);
    
    if (idx !== undefined) ytState.userChoices[idx] = selected;

    if (isCorrect) {
        btn.classList.remove('bg-white', 'border-slate-200');
        btn.classList.add('bg-emerald-500', 'border-emerald-500', 'text-white');
        if (idx !== undefined) ytState.pointStatus[idx] = 'correct';
        setTimeout(() => {
            overlay.classList.add('hidden');
            ytPlayer.playVideo();
            renderQuestionList();
        }, 1000);
    } else {
        btn.classList.remove('bg-white', 'border-slate-200');
        btn.classList.add('bg-rose-500', 'border-rose-500', 'text-white');
        if (idx !== undefined) ytState.pointStatus[idx] = 'wrong';

        if (ytState.singleAttempt) {
            btn.innerHTML += ' <span class="ml-2">✕ 答錯了 (無法重試)</span>';
            setTimeout(() => {
                overlay.classList.add('hidden');
                ytPlayer.playVideo();
                renderQuestionList();
            }, 2000);
        } else {
            btn.innerHTML += ' <span class="ml-2">✕ 答錯了，重看片段...</span>';
            setTimeout(() => {
                overlay.classList.add('hidden');
                const targetTime = (jumpTo !== undefined && jumpTo !== null) ? jumpTo : 0;
                ytPlayer.seekTo(targetTime, true);
                ytPlayer.playVideo();
                Object.keys(ytState.hasAnswered).forEach(t => {
                    if (parseFloat(t) >= targetTime) delete ytState.hasAnswered[t];
                });
                renderQuestionList();
            }, 2000);
        }
    }
}

function handleVideoEnd() {
    if (ytTimer) clearInterval(ytTimer);
    
    if (ytState.reviewRequired) {
        ytState.isReviewMode = true;
        document.getElementById('yt-wrapper').querySelector('.aspect-video').classList.add('hidden');
        document.getElementById('yt-status-text').innerText = "進入重溫階段";
        document.getElementById('yt-question-nav').classList.add('hidden'); 
        
        const reviewArea = document.getElementById('yt-review-area');
        const questionsContainer = document.getElementById('yt-review-questions');
        
        let html = '';
        ytState.points.forEach((p, index) => {
            let opts = p.options.sort(() => 0.5 - Math.random()).map(o => `
                <label class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                    <input type="radio" name="yt-q-${index}" value="${o}" class="w-5 h-5 accent-indigo-600">
                    <span class="font-bold text-slate-700">${o}</span>
                </label>
            `).join('');
            
            html += `
                <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-4" data-correct="${p.answer}">
                    <div class="font-bold text-slate-800 mb-4 flex gap-2">
                        <span class="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded text-sm h-fit">Q${index+1}</span>
                        ${p.question}
                    </div>
                    <div class="grid grid-cols-1 gap-2">${opts}</div>
                </div>
            `;
        });
        questionsContainer.innerHTML = html;
        reviewArea.classList.remove('hidden');
    } else {
        finishYoutubeQuestion(100);
    }
}

function submitYoutubeReview() {
    const questions = document.querySelectorAll('#yt-review-questions > div');
    let correctCount = 0;
    let allAnswered = true;

    questions.forEach((div, idx) => {
        const inputs = div.querySelectorAll('input[type="radio"]');
        const correctAns = div.dataset.correct;
        let userAns = null;
        inputs.forEach(input => { if(input.checked) userAns = input.value; });

        div.classList.remove('border-rose-500', 'bg-rose-50');
        if (!userAns) {
            allAnswered = false;
            div.classList.add('border-rose-500', 'bg-rose-50');
        } else if (userAns === correctAns) {
            correctCount++;
        }
    });

    if (!allAnswered) {
        alert("請回答所有問題！");
        return;
    }

    const score = Math.round((correctCount / questions.length) * 100);
    finishYoutubeQuestion(score);
}

function finishYoutubeQuestion(score) {
    if (typeof handleAnswer === 'function') {
        handleAnswer(score, { type: 'youtube', score: score });
    }
    if (typeof currentQIndex !== 'undefined' && typeof currentQuizQueue !== 'undefined') {
        const isLastQuestion = (currentQIndex >= currentQuizQueue.length - 1);
        if (isLastQuestion) {
            if (typeof showFinalResult === 'function') {
                showFinalResult();
            } else {
                alert("測驗完成！分數：" + score);
            }
        } else {
            if (typeof navigateExam === 'function') {
                navigateExam(1);
            }
        }
    } else {
        alert("本題完成！得分：" + score);
    }
}

function formatSimpleTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}