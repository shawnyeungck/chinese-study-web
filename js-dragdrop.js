let ddState = { blanks: [], userAnswers: {}, wordBank: [], mode: '溫習', locked: false, maxScore: 100, isTypingMode: false, currentContent: "" };
let selectedWordId = null; 

function renderDragDrop(q, container, mode, savedAnswer, showResult) {
    let actualData = savedAnswer;
    if (savedAnswer && savedAnswer.answer) {
        actualData = savedAnswer.answer;
    }

    ddState.maxScore = 100;
    ddState.mode = mode;
    ddState.locked = showResult;
    ddState.isTypingMode = (q.type === '不供詞填充');
    
    let contentToRender = q.content;

    if (q.type === '不供詞填充' || q.type === '選詞填充') {
        if (actualData && actualData.shuffledContent) {
            contentToRender = actualData.shuffledContent;
        } else if (!showResult) {
            let lines = q.content.split('\n').filter(l => l.trim() !== '');
            if (lines.length > 1) {
                for (let i = lines.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [lines[i], lines[j]] = [lines[j], lines[i]];
                }
                contentToRender = lines.join('\n');
            }
        }
    }
    
    ddState.currentContent = contentToRender;

    if (actualData) {
        if (actualData.details) ddState.userAnswers = actualData.details;
        else ddState.userAnswers = actualData; 
    } else {
        ddState.userAnswers = {};
    }
    
    selectedWordId = null;

    const regex = /\[(.*?)\]/g;
    let match;
    let lastIndex = 0;
    let segments = [];
    ddState.blanks = [];
    let blankId = 0;
    let answersPool = [];

    while ((match = regex.exec(contentToRender)) !== null) {
        if (match.index > lastIndex) segments.push({ type: 'text', content: contentToRender.substring(lastIndex, match.index) });
        const answer = match[1];
        ddState.blanks.push({ id: blankId, answer: answer });
        answersPool.push(answer);
        segments.push({ type: 'blank', id: blankId, answerLength: answer.length });
        blankId++;
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < contentToRender.length) segments.push({ type: 'text', content: contentToRender.substring(lastIndex) });

    if (!ddState.isTypingMode) {
        let distractors = q.options || []; 
        let allWords = [...answersPool, ...distractors];
        allWords.sort(() => Math.random() - 0.5);
        ddState.wordBank = allWords.map((word, idx) => ({ id: `w-${idx}`, text: word, used: false }));

        if (ddState.userAnswers) {
            Object.values(ddState.userAnswers).forEach(usedWordText => {
                const target = ddState.wordBank.find(w => w.text === usedWordText && !w.used);
                if (target) target.used = true;
            });
        }
    }

    let visualHtml = '';
    if (q.image && q.image.trim() !== '') {
        visualHtml += `<div class="mb-4 flex justify-center"><img src="${q.image}" class="max-h-40 rounded-xl shadow-md border border-slate-200 object-contain bg-white"></div>`;
    }
    
    let questionHtml = `<div class="mb-2 text-center">`;
    if (q.question) questionHtml += `<div class="font-bold text-slate-700 text-lg">${q.question}</div>`;
    
    const instruction = ddState.isTypingMode ? "請在空格內輸入正確答案" : "請將上方詞語拖曳至對應空格";
    questionHtml += `<div class="text-xs text-slate-400 mt-1">${instruction}</div></div>`;

    const wordBankHtml = ddState.isTypingMode ? '' : `<div class="sticky top-0 z-20 bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-sm border border-indigo-100 mb-6 transition-all"><div id="wordBankContainer" class="word-bank-area flex flex-wrap justify-center gap-3"></div></div>`;

    const contentHtml = segments.map(seg => {
        if (seg.type === 'text') return seg.content.replace(/\n/g, '<div class="question-divider"></div>');
        
        if (ddState.isTypingMode) {
            const widthStyle = `min-width: ${Math.max(60, seg.answerLength * 20)}px; width: ${seg.answerLength * 1.5}em;`;
            const userVal = ddState.userAnswers[seg.id] || "";
            const disabled = ddState.locked ? 'disabled' : '';
            return `<input type="text" id="input-${seg.id}" class="fill-input" style="${widthStyle}" 
                    value="${userVal}" ${disabled} autocomplete="off" 
                    oninput="handleTypingInput(this, ${seg.id})">
                    <span id="feedback-${seg.id}"></span>`;
        } else {
            return `<span id="zone-${seg.id}" class="drop-zone" data-blank-id="${seg.id}" onclick="handleZoneClick(${seg.id})" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, ${seg.id})"></span>`;
        }
    }).join('');

    container.innerHTML = `<div class="flex flex-col h-full max-w-3xl mx-auto select-none">${visualHtml}${questionHtml}${wordBankHtml}<div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex-1 text-lg text-slate-700 leading-loose">${contentHtml}</div><div id="feedback" class="mt-2 h-6 text-center font-bold"></div></div>`;

    if (!ddState.isTypingMode) renderUI();
    
    if (showResult) {
        checkDragDrop(true); 
    } else {
        if (!actualData) updateQuizResultSilently();
    }
}

function handleTypingInput(input, blankId) {
    if (ddState.locked) return;
    const val = input.value.trim();
    ddState.userAnswers[blankId] = val;
    updateQuizResultSilently();
}

function renderUI() {
    if (ddState.isTypingMode) return; 

    const bankContainer = document.getElementById('wordBankContainer');
    bankContainer.innerHTML = ddState.wordBank.map(item => {
        if (item.used) return ''; 
        const isSelected = (selectedWordId === item.id);
        return `<div id="${item.id}" draggable="${!ddState.locked}" ondragstart="handleDragStart(event, '${item.id}')" onclick="handleWordClick('${item.id}')" class="word-chip px-4 py-2 bg-white border border-slate-300 rounded-lg shadow-sm font-bold text-slate-700 hover:border-indigo-400 hover:text-indigo-600 ${isSelected ? 'selected-word' : ''} ${ddState.locked ? 'cursor-not-allowed opacity-60' : ''}">${item.text}</div>`;
    }).join('');

    ddState.blanks.forEach(blank => {
        const zone = document.getElementById(`zone-${blank.id}`);
        const answerText = ddState.userAnswers[blank.id];
        zone.classList.remove('filled', 'hovered');
        if (answerText) {
            zone.classList.add('filled');
            zone.innerHTML = `<span class="pointer-events-none">${answerText}</span>`; 
        } else {
            zone.innerHTML = '';
        }
    });
}

function handleWordClick(wordId) {
    if (ddState.locked || ddState.isTypingMode) return;
    selectedWordId = (selectedWordId === wordId) ? null : wordId;
    renderUI();
}

function handleZoneClick(blankId) {
    if (ddState.locked || ddState.isTypingMode) return;
    if (ddState.userAnswers[blankId]) {
        const textToReturn = ddState.userAnswers[blankId];
        const wordObj = ddState.wordBank.find(w => w.text === textToReturn && w.used);
        if (wordObj) wordObj.used = false;
        delete ddState.userAnswers[blankId];
        renderUI();
        updateQuizResultSilently();
        return;
    }
    if (selectedWordId) {
        const wordObj = ddState.wordBank.find(w => w.id === selectedWordId);
        if (wordObj) {
            ddState.userAnswers[blankId] = wordObj.text;
            wordObj.used = true;
            selectedWordId = null;
            renderUI();
            updateQuizResultSilently();
        }
    }
}

function handleDragStart(e, wordId) {
    if (ddState.locked) { e.preventDefault(); return; }
    e.dataTransfer.setData("text/plain", wordId);
    e.dataTransfer.effectAllowed = "move";
    selectedWordId = wordId; 
    document.getElementById(wordId).classList.add('selected-word');
}

function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (ddState.locked) return; e.currentTarget.classList.add('hovered'); }
function handleDragLeave(e) { e.currentTarget.classList.remove('hovered'); }

function handleDrop(e, blankId) {
    e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('hovered'); if (ddState.locked) return;
    const wordId = e.dataTransfer.getData("text/plain");
    const wordObj = ddState.wordBank.find(w => w.id === wordId);
    if (ddState.userAnswers[blankId]) {
        const oldText = ddState.userAnswers[blankId];
        const oldWordObj = ddState.wordBank.find(w => w.text === oldText && w.used);
        if (oldWordObj) oldWordObj.used = false;
    }
    if (wordObj) {
        ddState.userAnswers[blankId] = wordObj.text;
        wordObj.used = true;
        selectedWordId = null;
        renderUI();
        updateQuizResultSilently();
    }
}

function updateQuizResultSilently() {
    const score = calculateScore();
    if (typeof handleAnswer === 'function') {
        handleAnswer(score, { 
            text: ddState.isTypingMode ? "不供詞填充作答" : "選詞填充作答", 
            details: ddState.userAnswers,
            shuffledContent: ddState.currentContent 
        });
    }
}

function calculateScore() {
    let correctCount = 0;
    ddState.blanks.forEach(b => { 
        const userVal = (ddState.userAnswers[b.id] || "").trim();
        if (userVal === b.answer) correctCount++; 
    });
    if (ddState.blanks.length === 0) return 0;
    return Math.round((correctCount / ddState.blanks.length) * 100);
}

function checkDragDrop(isReplay = false) {
    let correctCount = 0;
    ddState.blanks.forEach(b => {
        const userVal = (ddState.userAnswers[b.id] || "").trim();
        const isCorrect = (userVal === b.answer);
        
        if (isCorrect) correctCount++;

        if (ddState.isTypingMode) {
            const input = document.getElementById(`input-${b.id}`);
            const feedback = document.getElementById(`feedback-${b.id}`);
            
            input.classList.remove('correct', 'wrong');
            input.classList.add(isCorrect ? 'correct' : 'wrong');
            
            if (!isCorrect) {
                if (typeof currentShowAnswerSetting !== 'undefined' && currentShowAnswerSetting) {
                    feedback.innerHTML = `<span class="answer-feedback">(${b.answer})</span>`;
                } else {
                    feedback.innerHTML = `<span class="text-rose-500 ml-1">✕</span>`;
                }
            } else {
                feedback.innerHTML = `<span class="text-emerald-500 ml-1">✓</span>`;
            }

        } else {
            const zone = document.getElementById(`zone-${b.id}`);
            zone.classList.remove('filled'); 
            if (isCorrect) {
                zone.classList.add('correct');
            } else {
                zone.classList.add('wrong');
                
                if (typeof currentShowAnswerSetting !== 'undefined' && currentShowAnswerSetting) {
                    const userDisplay = userVal ? `<span class="line-through opacity-60 mr-1 text-sm">${userVal}</span>` : `<span class="text-rose-400 text-xs bg-rose-50 px-1 rounded mr-1">{空}</span>`;
                    zone.innerHTML = `${userDisplay}<span class="font-bold text-emerald-700">${b.answer}</span>`;
                } else {
                    const userDisplay = userVal ? `<span class="text-rose-700 font-bold">${userVal}</span>` : `<span class="text-rose-400 font-bold">✕</span>`;
                    zone.innerHTML = userDisplay;
                }
            }
        }
    });

    const score = Math.round((correctCount / ddState.blanks.length) * 100);
    const feedback = document.getElementById('feedback');
    if (score === 100) feedback.innerHTML = '<span class="text-emerald-500 bg-emerald-100 px-4 py-1 rounded-full text-sm shadow-sm">🎉 全部正確！</span>';
    else feedback.innerHTML = `<span class="text-rose-500 bg-rose-100 px-4 py-1 rounded-full text-sm shadow-sm">得分：${score} 分</span>`;
}