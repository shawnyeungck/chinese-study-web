// 全域狀態管理
var dictationState = {
    mode: '溫習',
    maxScore: 100, 
    
    isVocabMode: false,
    fullText: "",
    requiredChars: "",
    segments: [],
    isPartial: false,
    vocabList: [], // 儲存 { w: "詞語", p: "拼音", l: "語言" }
    userVocabAnswers: [],
    activeRowIndex: 0,
    showResult: false,
    audioLang: "zh-HK", // 預設語言
    showPinyin: false   // 預設是否顯示拼音
};

var currentUtterance = null;

// 初始化介面
function renderDictationUI(q, container, mode, savedAnswer, showResult) {
    // 重置狀態
    dictationState = {
        mode: mode,
        maxScore: 100,
        showResult: showResult,
        audioLang: q.audioLang || "zh-HK",
        showPinyin: q.showPinyin === true,
        isVocabMode: false,
        fullText: "",
        requiredChars: "",
        segments: [],
        isPartial: false,
        vocabList: [],
        userVocabAnswers: [],
        activeRowIndex: 0
    };

    // 解析題目
    parseDictationContent(q, savedAnswer);

    // HTML 結構生成
    let visualHtml = '';
    if (q.image && q.image.trim() !== '') {
        visualHtml += `<div class="mb-5 flex justify-center w-full">
            <img src="${q.image}" 
                 onclick="viewImage(this.src)"
                 class="max-h-60 max-w-full rounded-2xl shadow-lg border border-slate-100 object-contain bg-white cursor-zoom-in hover:opacity-90 transition-opacity" 
                 title="點擊放大圖片">
        </div>`;
    }

    let defaultTitle = dictationState.isVocabMode ? "請聆聽/看拼音並默寫" : "請輸入課文";
    let questionText = (q.question && q.question.trim() !== "") ? q.question : defaultTitle;
    
    let instruction = "";
    if (dictationState.isVocabMode) {
        const count = dictationState.vocabList.length;
        const pinyinCount = dictationState.vocabList.filter(i => i.isPinyinQuestion).length;
        const audioCount = count - pinyinCount;
        
        instruction = `共 ${count} 題`;
        if (pinyinCount > 0) instruction += ` (拼音: ${pinyinCount}, 讀默: ${audioCount})`;
    } else {
        instruction = dictationState.isPartial ? 
            "請填寫 <span class='text-indigo-600 font-bold'>高亮方格</span> 內的文字" : 
            "請輸入完整課文內容";
    }

    visualHtml += `
        <div class="w-full text-center space-y-2 mb-6">
            <h3 class="text-xl font-bold text-slate-800 leading-relaxed">${questionText}</h3>
            <div class="h-1 w-16 bg-indigo-500 rounded-full mx-auto opacity-20"></div>
            <p class="text-sm text-slate-500">${instruction}</p>
        </div>
    `;

    let speedControlHtml = '';
    if (q.type === '讀默' || q.type === '詞語隨機清單') {
        speedControlHtml = `
        <div class="flex flex-col items-center justify-center w-full mb-6">
            <div id="speedControlBox" class="w-64 px-4 py-2 bg-slate-50/80 backdrop-blur-sm border border-slate-200 rounded-2xl flex flex-col gap-1 transition-all hover:bg-white hover:shadow-sm">
                <div class="flex justify-between items-center text-xs font-bold text-slate-400 select-none">
                    <span class="hover:text-slate-600 cursor-pointer" onclick="adjustSpeed(-0.1)">🐢 慢</span>
                    <span id="speedDisplay" class="text-indigo-500 font-mono text-sm bg-indigo-50 px-2 rounded">0.8x</span>
                    <span class="hover:text-slate-600 cursor-pointer" onclick="adjustSpeed(0.1)">快 🐇</span>
                </div>
                <input type="range" id="ttsSpeedRange" min="0.5" max="1.5" step="0.1" value="0.8" 
                       oninput="updateSpeedDisplay(this.value)"
                       class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed">
            </div>
        </div>`;
    }

    let contentArea = '';
    if (dictationState.isVocabMode) {
        contentArea = `<div id="vocabListContainer" class="w-full max-w-lg mx-auto space-y-2"></div>`;
    } else {
        let mainPlayBtn = q.type === '讀默' ? `
            <button id="ttsPlayBtn" onclick="playTTS(this)" class="group relative inline-flex items-center justify-center px-8 py-3 font-bold text-white transition-all duration-200 bg-indigo-600 font-pj rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 hover:bg-indigo-500 active:scale-95 shadow-lg shadow-indigo-200 mb-4 z-10 min-w-[160px]">
                <span class="mr-2 text-xl group-hover:animate-pulse">🔊</span> <span id="ttsBtnText">播放語音</span>
            </button>` : '';
        
        contentArea = `
            ${mainPlayBtn}
            <div id="gridContainer" onclick="focusInput()" class="flex flex-wrap gap-2 justify-center p-6 bg-white rounded-2xl cursor-text min-h-[140px] w-full items-start content-start border border-slate-200 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 ring-4 ring-slate-50/50"></div>
        `;
    }

    container.innerHTML = `
        <div class="flex flex-col items-center w-full max-w-2xl mx-auto">
            ${visualHtml}
            ${speedControlHtml}
            ${contentArea}
            <input type="text" id="hiddenInput" autocomplete="off" oninput="handleInput()" class="opacity-0 absolute h-0 w-0 pointer-events-none">
            <div id="statusMsg" class="mt-4 text-center font-bold text-slate-400 h-8 text-sm transition-all"></div>
        </div>`;

    // 恢復學生答案
    if (dictationState.isVocabMode) {
        if (savedAnswer && savedAnswer.answer && savedAnswer.answer.answer && Array.isArray(savedAnswer.answer.answer)) {
            dictationState.userVocabAnswers = [...savedAnswer.answer.answer];
        } 
        else if (savedAnswer && Array.isArray(savedAnswer.answer)) {
            dictationState.userVocabAnswers = [...savedAnswer.answer];
        }
        else {
            dictationState.userVocabAnswers = new Array(dictationState.vocabList.length).fill("");
        }
        
        renderVocabList(showResult);
        if (!showResult) setTimeout(() => focusVocabRow(0), 300); 

    } else {
        // 句子模式
        const initialText = (savedAnswer && savedAnswer.answer) ? savedAnswer.answer : "";
        document.getElementById('hiddenInput').value = initialText;
        renderGrid(initialText, showResult);
        
        if (showResult && dictationState.mode === '溫習' && initialText.length >= dictationState.requiredChars.length) {
             if(initialText === dictationState.requiredChars) {
                 document.getElementById('statusMsg').innerHTML = "<span class='text-emerald-600 font-bold'>🎉 全部正確！</span>"; 
             }
        } else {
             if(!showResult) document.getElementById('statusMsg').innerText = "點擊方格開始輸入...";
        }
        if (!showResult) setTimeout(focusInput, 300);
    }
}

function parseDictationContent(q, savedAnswer) {
    // 1. 如果有 fixedList，直接使用 (詞語模式)
    if (savedAnswer && savedAnswer.fixedList && savedAnswer.fixedList.length > 0) {
        dictationState.vocabList = savedAnswer.fixedList;
        dictationState.isVocabMode = true;
        return;
    }

    const rawContent = (q.content || "").toString(); 
    dictationState.segments = [];
    dictationState.fullText = "";
    
    // 詞語隨機清單
    if (q.type === '詞語隨機清單') {
        dictationState.isVocabMode = true;
        
        let allItems = [];
        try {
            if (rawContent.trim().startsWith('[')) {
                allItems = JSON.parse(rawContent);
            } else {
                let rawList = rawContent.split(/[、\n]+/).map(w => w.trim()).filter(w => w !== "");
                allItems = rawList.map(item => {
                    let parts = item.split('|');
                    return {
                        w: parts[0],
                        p: parts.length > 1 ? parts[1] : null,
                        l: "zh-HK"
                    };
                });
            }
        } catch(e) { allItems = []; }

        let totalNeeded = q.randomPickCount > 0 ? q.randomPickCount : allItems.length;
        let pinyinNeeded = q.pinyinCount > 0 ? q.pinyinCount : 0;
        
        if (totalNeeded > allItems.length) totalNeeded = allItems.length;
        if (pinyinNeeded > totalNeeded) pinyinNeeded = totalNeeded;

        let finalSelection = [];

        // 1. 抽出拼音題
        let pinyinCandidates = allItems.filter(item => item.p && item.p.trim() !== "");
        pinyinCandidates.sort(() => 0.5 - Math.random());
        
        let pickedPinyin = pinyinCandidates.slice(0, pinyinNeeded);
        pickedPinyin.forEach(item => {
            item.isPinyinQuestion = true;
            finalSelection.push(item);
        });

        // 2. 抽出讀默題
        let remainingCandidates = allItems.filter(item => !finalSelection.includes(item));
        remainingCandidates.sort(() => 0.5 - Math.random());
        
        let audioNeeded = totalNeeded - finalSelection.length;
        let pickedAudio = remainingCandidates.slice(0, audioNeeded);
        pickedAudio.forEach(item => {
            item.isPinyinQuestion = false;
            finalSelection.push(item);
        });

        dictationState.vocabList = finalSelection;
        
        // 存回 savedAnswer 以鎖定題目 (當是第一次載入時)
        if (typeof userAnswers !== 'undefined' && userAnswers[currentQIndex]) {
            userAnswers[currentQIndex].fixedList = finalSelection;
        }
        return; 
    }

    // 句子模式 (讀默/背默)
    dictationState.isVocabMode = false;
    const regex = /\[(.*?)\]/g;
    
    if (!rawContent.match(regex)) {
        dictationState.isPartial = false;
        dictationState.fullText = rawContent;
        dictationState.requiredChars = rawContent.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
        dictationState.segments.push({ type: 'full', text: rawContent });
    } else {
        dictationState.isPartial = true;
        let lastIndex = 0;
        let match;
        while ((match = regex.exec(rawContent)) !== null) {
            if (match.index > lastIndex) {
                const text = rawContent.substring(lastIndex, match.index);
                dictationState.segments.push({ type: 'hint', text: text });
                dictationState.fullText += text;
            }
            const answer = match[1];
            dictationState.segments.push({ type: 'input', text: answer });
            dictationState.fullText += answer;
            dictationState.requiredChars += answer;
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < rawContent.length) {
            const text = rawContent.substring(lastIndex);
            dictationState.segments.push({ type: 'hint', text: text });
            dictationState.fullText += text;
        }
    }
}

function renderVocabList(showResult) {
    const container = document.getElementById('vocabListContainer');
    if(!container) return;
    
    let html = '';
    dictationState.vocabList.forEach((item, index) => {
        const word = item.w;
        const pinyin = item.p;
        const lang = item.l || dictationState.defaultLang;
        const isPinyinQ = item.isPinyinQuestion;

        const userVal = dictationState.userVocabAnswers[index] || ""; 
        const isFocused = (index === dictationState.activeRowIndex);
        
        let gridsHtml = '';
        for (let i = 0; i < word.length; i++) {
            const char = word[i];
            const uChar = userVal[i] || "";
            let statusClass = "input-target";
            
            if (showResult) {
                if (uChar) {
                    statusClass = (uChar === char) ? "correct" : "wrong";
                } else {
                    statusClass += " wrong border-red-300"; 
                }
            } else {
                if (uChar) statusClass += " active bg-indigo-50 border-indigo-200 text-slate-700";
            }
            
            if (isFocused && i === userVal.length && !showResult) {
                statusClass += " active ring-2 ring-indigo-400 ring-offset-1";
            }

            gridsHtml += `<div class="grid-box ${statusClass}">${uChar}</div>`;
        }

        let hintContent = '';
        if (isPinyinQ) {
            hintContent = `
            <div class="flex items-center gap-2 mb-1">
                <div class="text-indigo-600 font-bold font-mono text-lg tracking-widest bg-indigo-50 px-2 rounded">${pinyin}</div>
                <button class="vocab-audio-btn w-8 h-8 text-sm bg-indigo-100 hover:bg-indigo-600 hover:text-white rounded-full transition" onclick="playSingleWord(event, '${word}', 'zh-CN')">
                    🔊
                </button>
            </div>`;
        } else {
            hintContent = `
            <button class="vocab-audio-btn mb-1" onclick="playSingleWord(event, '${word}', '${lang}')">
                🔊
            </button>`;
        }

        html += `
        <div class="vocab-row ${isFocused ? 'focused' : ''}" onclick="focusVocabRow(${index})">
            <span class="vocab-num">${index + 1}.</span>
            <div class="vocab-grids flex flex-col items-start">
                ${hintContent}
                <div class="flex gap-1">${gridsHtml}</div>
            </div>
        </div>`;
    });
    container.innerHTML = html;
    
    if(showResult) checkVocabCompletionSilently();
}

function focusVocabRow(index) {
    if (dictationState.showResult) return;
    dictationState.activeRowIndex = index;
    const input = document.getElementById('hiddenInput');
    input.value = dictationState.userVocabAnswers[index] || "";
    input.focus();
    renderVocabList(false);
}

function playSingleWord(e, word, lang) {
    e.stopPropagation(); 
    let originalLang = dictationState.audioLang;
    dictationState.audioLang = lang;
    playText(word);
    dictationState.audioLang = originalLang;
}

function renderGrid(userInput, showResult) {
    const container = document.getElementById('gridContainer');
    if(!container) return;
    const punctuations = "「、。，……！？」：；, . ! ?\"'()（）"; 
    let html = '';
    let inputCharIndex = 0;

    dictationState.segments.forEach(seg => {
        const chars = seg.text.split('');
        chars.forEach(char => {
            if (char === '\n' || char === '\r') { html += '<div class="w-full h-0 basis-full my-1"></div>'; return; }
            let isStatic = false;
            if (dictationState.isPartial) { if (seg.type === 'hint') isStatic = true; } 
            else { if (punctuations.includes(char) || char === ' ' || char === '　') isStatic = true; }

            if (isStatic) {
                if (punctuations.includes(char)) html += `<span class="punctuation select-none">${char}</span>`;
                else html += `<div class="grid-box static-hint select-none">${char}</div>`;
            } else {
                const userChar = userInput[inputCharIndex] || '';
                let statusClass = 'input-target';
                
                if (showResult) {
                    if (userChar) statusClass = (userChar === char) ? 'correct' : 'wrong';
                    else if (inputCharIndex === userInput.length) statusClass += ' active ring-2 ring-indigo-300 ring-offset-1';
                } else {
                    if (userChar) statusClass += " active bg-indigo-50 border-indigo-200 text-slate-700 font-bold";
                    else if (inputCharIndex === userInput.length) statusClass += ' active ring-2 ring-indigo-400 ring-offset-1';
                }
                html += `<div class="grid-box ${statusClass}">${userChar}</div>`;
                inputCharIndex++;
            }
        });
    });
    container.innerHTML = html;
    if (showResult && dictationState.mode === '溫習' && userInput.length >= dictationState.requiredChars.length) {
        if (userInput === dictationState.requiredChars) document.getElementById('statusMsg').innerHTML = "<span class='text-emerald-600 font-bold'>🎉 全部正確！</span>"; 
    }
}

function handleInput() {
    if (dictationState.showResult) return; 

    const input = document.getElementById('hiddenInput');
    const cleanInput = input.value.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    if (input.value !== cleanInput) input.value = cleanInput;

    if (dictationState.isVocabMode) {
        const idx = dictationState.activeRowIndex;
        dictationState.userVocabAnswers[idx] = cleanInput;
        renderVocabList(false);
        calculateVocabScore(true); 
    } else {
        renderGrid(cleanInput, false);
        calculateAndHandleScore(cleanInput, true); 
    }
}

function checkVocabCompletionSilently() {
    if (dictationState.mode !== '溫習') return;
    let allCorrect = true;
    dictationState.vocabList.forEach((item, i) => { if (dictationState.userVocabAnswers[i] !== item.w) allCorrect = false; });
    const msg = document.getElementById('statusMsg');
    if (allCorrect) msg.innerHTML = "<span class='text-emerald-600 font-bold'>🎉 全部正確！</span>";
    else msg.innerText = "";
}

function calculateAndHandleScore(userInput, isSilent = false) {
    const target = dictationState.requiredChars;
    const totalChars = target.length;
    let correctCount = 0;
    const maxLen = Math.max(totalChars, userInput.length);
    for (let i = 0; i < maxLen; i++) { if ((userInput[i] || '') === (target[i] || '')) correctCount++; }
    let earnedScore = 0;
    if (totalChars > 0) earnedScore = Math.round((correctCount / totalChars) * 100);
    if (typeof handleAnswer === 'function') handleAnswer(earnedScore, userInput);
    return earnedScore;
}

function calculateVocabScore(isSilent = false) {
    let totalChars = 0;
    let correctChars = 0;
    dictationState.vocabList.forEach((item, idx) => {
        const word = item.w;
        totalChars += word.length;
        const userAns = dictationState.userVocabAnswers[idx] || "";
        const maxLen = Math.max(word.length, userAns.length);
        for(let i=0; i<maxLen; i++) { if ((userAns[i]||'') === (word[i]||'')) correctChars++; }
    });
    let earnedScore = 0;
    if (totalChars > 0) earnedScore = Math.round((correctChars / totalChars) * 100);
    
    if (typeof handleAnswer === 'function') {
        handleAnswer(earnedScore, { answer: dictationState.userVocabAnswers, type: 'vocab' });
    }
    return earnedScore;
}

function focusInput() { 
    if (dictationState.isVocabMode) focusVocabRow(dictationState.activeRowIndex);
    else document.getElementById('hiddenInput').focus(); 
}

function playTTS(btnElement) { 
    if (dictationState.isVocabMode) { 
        alert("請點擊個別詞語旁的小喇叭聆聽。"); 
        return; 
    } 
    togglePlayStop(btnElement, dictationState.fullText); 
}

function playText(text) { 
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text); 
    const slider = document.getElementById('ttsSpeedRange'); 
    utterance.rate = slider ? parseFloat(slider.value) : 0.8; 
    utterance.lang = dictationState.audioLang || "zh-HK";
    
    if(typeof voices !== 'undefined' && voices.length > 0) { 
        let targetVoice = voices.find(v => v.lang === utterance.lang);
        if (!targetVoice && utterance.lang === "zh-HK") targetVoice = voices.find(v => v.lang.includes('HK') || v.lang.includes('Cantonese'));
        if (!targetVoice && utterance.lang === "zh-CN") targetVoice = voices.find(v => v.lang.includes('CN') || v.lang.includes('Chinese'));
        if (targetVoice) utterance.voice = targetVoice; 
    } 
    window.speechSynthesis.speak(utterance); 
}

function togglePlayStop(btnElement, text) { 
    if (!('speechSynthesis' in window)) { alert("不支援語音"); return; } 
    const slider = document.getElementById('ttsSpeedRange'); 
    const controlBox = document.getElementById('speedControlBox'); 
    const btnText = document.getElementById('ttsBtnText'); 
    const iconSpan = btnElement.querySelector('span'); 
    
    if (window.speechSynthesis.speaking) { 
        window.speechSynthesis.cancel(); 
        resetAudioUI(); 
        return; 
    } 
    
    if (slider) slider.disabled = true; 
    if (controlBox) controlBox.classList.add('opacity-60', 'grayscale'); 
    btnElement.classList.remove('bg-indigo-600', 'hover:bg-indigo-500', 'shadow-indigo-200'); 
    btnElement.classList.add('bg-rose-500', 'hover:bg-rose-600', 'shadow-rose-200', 'animate-pulse'); 
    if(btnText) btnText.innerText = "停止播放"; 
    if(iconSpan) iconSpan.innerText = "⏹️"; 
    
    currentUtterance = new SpeechSynthesisUtterance(text); 
    currentUtterance.rate = slider ? parseFloat(slider.value) : 0.8; 
    if(typeof voices !== 'undefined' && voices.length > 0) { 
        const targetVoice = voices.find(v => v.lang === 'zh-HK') || voices.find(v => v.lang.includes('HK')); 
        if (targetVoice) currentUtterance.voice = targetVoice; 
    } 
    currentUtterance.onend = resetAudioUI; 
    currentUtterance.onerror = resetAudioUI; 
    window.speechSynthesis.cancel(); 
    window.speechSynthesis.speak(currentUtterance); 
}

function resetAudioUI() { 
    const btnElement = document.getElementById('ttsPlayBtn'); 
    const slider = document.getElementById('ttsSpeedRange'); 
    const controlBox = document.getElementById('speedControlBox'); 
    const btnText = document.getElementById('ttsBtnText'); 
    
    if (slider) slider.disabled = false; 
    if (controlBox) controlBox.classList.remove('opacity-60', 'grayscale'); 
    
    if (btnElement) { 
        btnElement.classList.add('bg-indigo-600', 'hover:bg-indigo-500', 'shadow-indigo-200'); 
        btnElement.classList.remove('bg-rose-500', 'hover:bg-rose-600', 'shadow-rose-200', 'animate-pulse'); 
        const iconSpan = btnElement.querySelector('span'); 
        if(iconSpan) iconSpan.innerText = "🔊"; 
    } 
    if (btnText) btnText.innerText = "播放語音"; 
}

function updateSpeedDisplay(val) { document.getElementById('speedDisplay').innerText = parseFloat(val).toFixed(1) + 'x'; }
function adjustSpeed(delta) { const slider = document.getElementById('ttsSpeedRange'); if (!slider || slider.disabled) return; let newVal = parseFloat(slider.value) + delta; if (newVal < 0.5) newVal = 0.5; if (newVal > 1.5) newVal = 1.5; slider.value = newVal; updateSpeedDisplay(newVal); }