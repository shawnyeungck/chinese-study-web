var puncState = {
    slots: [],          
    properNounIndices: [], 
    userPunctuation: {},   
    userProperNouns: new Set(), 
    wordBank: [],       
    locked: false,
    maxScore: 100
};

var selectedPuncId = null;

function renderPunctuationQuiz(q, container, mode, savedAnswer, showResult) {
    let actualData = savedAnswer;
    if (savedAnswer && savedAnswer.answer) {
        actualData = savedAnswer.answer;
    }

    puncState = {
        slots: [],
        properNounIndices: [],
        userPunctuation: {}, 
        userProperNouns: new Set(),
        wordBank: [],
        locked: showResult,
        maxScore: 100
    };
    selectedPuncId = null;

    const puncRegex = /[，。？！、：；……「」『』（）,.?!:;]/;
    const rawContent = q.content || "";
    
    let htmlBuilder = "";
    let charGlobalIndex = 0; 
    let slotIndex = 0;
    let tempProperNounMode = false; 
    let puncPool = []; 

    for (let i = 0; i < rawContent.length; i++) {
        const char = rawContent[i];

        if (char === '{') { tempProperNounMode = true; continue; }
        if (char === '}') { tempProperNounMode = false; continue; }
        if (char === '\n') { htmlBuilder += '<br>'; continue; }

        if (puncRegex.test(char)) {
            puncState.slots.push({ id: slotIndex, answer: char });
            puncPool.push(char);
            
            htmlBuilder += `<span id="punc-zone-${slotIndex}" class="punc-drop-zone drop-zone" 
                            data-id="${slotIndex}" 
                            onclick="handlePuncZoneClick(${slotIndex})" 
                            ondragover="handleDragOver(event)" 
                            ondrop="handlePuncDrop(event, ${slotIndex})"></span>`;
            slotIndex++;
        } else {
            if (tempProperNounMode) puncState.properNounIndices.push(charGlobalIndex);
            htmlBuilder += `<span id="char-${charGlobalIndex}" 
                            class="char-interactive" 
                            onclick="toggleProperNoun(${charGlobalIndex})">${char}</span>`;
            charGlobalIndex++;
        }
    }

    if (actualData && actualData.puncBank && actualData.puncBank.length > 0) {
        puncState.wordBank = actualData.puncBank;
    } else {
        let distractors = q.options || [];
        if (typeof distractors === 'string') distractors = distractors.split('');
        let allPuncs = [...puncPool, ...distractors];
        allPuncs.sort(() => Math.random() - 0.5);
        puncState.wordBank = allPuncs.map((p, idx) => ({ id: `p-${idx}`, text: p, used: false }));
    }

    if (actualData) {
        if (actualData.punctIds) {
            puncState.userPunctuation = actualData.punctIds;
            Object.values(puncState.userPunctuation).forEach(wid => {
                const item = puncState.wordBank.find(w => w.id === wid);
                if(item) item.used = true;
            });
        } else if (actualData.punct) {
            Object.keys(actualData.punct).forEach(slotId => {
                const txt = actualData.punct[slotId];
                const item = puncState.wordBank.find(w => w.text === txt && !w.used);
                if (item) {
                    puncState.userPunctuation[slotId] = item.id;
                    item.used = true;
                }
            });
        }
        if (actualData.pn && Array.isArray(actualData.pn)) {
            actualData.pn.forEach(idx => puncState.userProperNouns.add(idx));
        }
    }

    let visualHtml = '';
    if (q.image) visualHtml += `<div class="mb-4 flex justify-center"><img src="${q.image}" class="max-h-40 rounded-xl shadow-md"></div>`;

    let bankHtml = '';
    if (!puncState.locked) {
        bankHtml = `<div id="punc-bank-container" class="sticky top-0 z-20 bg-white/95 backdrop-blur-md p-3 rounded-xl shadow-sm border border-slate-200 mb-4 transition-all min-h-[60px] flex flex-wrap justify-center gap-2"></div>`;
    }

    container.innerHTML = `
        <div class="flex flex-col h-full max-w-3xl mx-auto select-none">
            ${visualHtml}
            <div class="text-center mb-2">
                <h3 class="text-lg font-bold text-slate-700">${q.question || "標點與專名號練習"}</h3>
                <p class="text-xs text-slate-500">請拖放標點符號，並<span class="font-bold text-blue-600">點擊文字</span>以標示專名號。</p>
            </div>
            ${bankHtml}
            <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex-1 text-lg text-slate-800 leading-loose text-justify">
                ${htmlBuilder}
            </div>
            <div id="punc-feedback" class="mt-2 h-6 text-center font-bold"></div>
        </div>
    `;

    renderPuncBank();
    updateAllZones();
    updateAllProperNouns();

    if (showResult) checkPunctuationResult();
    
    if (!actualData) savePuncStateSilently();
}

function renderPuncBank() {
    const container = document.getElementById('punc-bank-container');
    if (!container) return;
    container.innerHTML = puncState.wordBank.map(item => {
        if (item.used) return ''; 
        const selectedClass = (selectedPuncId === item.id) ? 'selected-word' : '';
        return `<div id="${item.id}" draggable="true" 
                ondragstart="handlePuncDragStart(event, '${item.id}')" 
                onclick="handlePuncChipClick('${item.id}')" 
                class="word-chip punc-chip ${selectedClass}">${item.text}</div>`;
    }).join('');
}

function updateAllZones() {
    puncState.slots.forEach(slot => {
        const zone = document.getElementById(`punc-zone-${slot.id}`);
        if (!zone) return;
        const wordId = puncState.userPunctuation[slot.id];
        zone.classList.remove('filled');
        zone.innerHTML = '';
        if (wordId) {
            const item = puncState.wordBank.find(w => w.id === wordId);
            if (item) {
                zone.innerHTML = `<span class="pointer-events-none">${item.text}</span>`;
                zone.classList.add('filled');
            }
        }
    });
}

function updateAllProperNouns() {
    if(puncState.locked) return; 
    puncState.userProperNouns.forEach(idx => {
        const span = document.getElementById(`char-${idx}`);
        if (span) span.classList.add('active-pn');
    });
}

function toggleProperNoun(index) {
    if (puncState.locked) return;
    const span = document.getElementById(`char-${index}`);
    if (puncState.userProperNouns.has(index)) {
        puncState.userProperNouns.delete(index);
        span.classList.remove('active-pn');
    } else {
        puncState.userProperNouns.add(index);
        span.classList.add('active-pn');
    }
    savePuncStateSilently();
}

function handlePuncChipClick(id) {
    if (puncState.locked) return;
    selectedPuncId = (selectedPuncId === id) ? null : id;
    renderPuncBank(); 
}

function handlePuncZoneClick(slotId) {
    if (puncState.locked) return;
    if (puncState.userPunctuation[slotId]) {
        const wordId = puncState.userPunctuation[slotId];
        const item = puncState.wordBank.find(w => w.id === wordId);
        if (item) item.used = false;
        delete puncState.userPunctuation[slotId];
        updateAllZones(); renderPuncBank(); savePuncStateSilently();
        return;
    }
    if (selectedPuncId) {
        const item = puncState.wordBank.find(w => w.id === selectedPuncId);
        if (item) {
            puncState.userPunctuation[slotId] = item.id;
            item.used = true;
            selectedPuncId = null;
            updateAllZones(); renderPuncBank(); savePuncStateSilently();
        }
    }
}

function handlePuncDragStart(e, id) {
    if (puncState.locked) return;
    e.dataTransfer.setData("text/plain", id);
    selectedPuncId = id;
}

function handlePuncDrop(e, slotId) {
    e.preventDefault();
    if (puncState.locked) return;
    const id = e.dataTransfer.getData("text/plain");
    const item = puncState.wordBank.find(w => w.id === id);
    
    if (puncState.userPunctuation[slotId]) {
         const oldId = puncState.userPunctuation[slotId];
         const oldItem = puncState.wordBank.find(w => w.id === oldId);
         if (oldItem) oldItem.used = false;
    }
    if (item) {
        puncState.userPunctuation[slotId] = item.id;
        item.used = true;
        selectedPuncId = null;
        updateAllZones(); renderPuncBank(); savePuncStateSilently();
    }
}

function savePuncStateSilently() {
    let puncScore = 0;
    let pnScore = 0;

    let correctPuncCount = 0;
    puncState.slots.forEach(s => {
        const userWordId = puncState.userPunctuation[s.id];
        if (userWordId) {
            const item = puncState.wordBank.find(w => w.id === userWordId);
            if (item && item.text === s.answer) correctPuncCount++;
        }
    });
    if (puncState.slots.length > 0) puncScore = (correctPuncCount / puncState.slots.length) * 50; 
    else puncScore = 50; 

    let correctPnHits = 0;
    let wrongPnSelects = 0;
    puncState.userProperNouns.forEach(idx => {
        if (puncState.properNounIndices.includes(idx)) correctPnHits++;
        else wrongPnSelects++; 
    });
    const totalPnChars = puncState.properNounIndices.length;
    if (totalPnChars > 0) {
        let rawPnScore = Math.max(0, correctPnHits - wrongPnSelects);
        pnScore = (rawPnScore / totalPnChars) * 50;
    } else {
        pnScore = (puncState.userProperNouns.size === 0) ? 50 : 0; 
    }

    const totalScore = Math.round(puncScore + pnScore);
    if (typeof handleAnswer === 'function') {
        handleAnswer(totalScore, { 
            type: 'punctuation',
            punctIds: puncState.userPunctuation,
            pn: Array.from(puncState.userProperNouns),
            puncBank: puncState.wordBank
        });
    }
}

function checkPunctuationResult() {
    // 標點
    puncState.slots.forEach(s => {
        const zone = document.getElementById(`punc-zone-${s.id}`);
        const userWordId = puncState.userPunctuation[s.id];
        
        zone.classList.remove('filled');
        let userText = "";
        if (userWordId) {
            const item = puncState.wordBank.find(w => w.id === userWordId);
            if (item) userText = item.text;
        }

        if (userText === s.answer) {
            zone.classList.add('correct');
        } else {
            zone.classList.add('wrong');
            
            if (typeof currentShowAnswerSetting !== 'undefined' && currentShowAnswerSetting) {
                const oldHtml = userText ? `<span class="line-through opacity-50 mr-1">${userText}</span>` : '';
                zone.innerHTML = `${oldHtml}<span class="text-red-600 font-bold">${s.answer}</span>`;
            } else {
                zone.innerHTML = userText ? `<span class="text-red-600 font-bold">${userText}</span>` : `<span class="text-red-400 font-bold">✕</span>`;
            }
        }
    });

    // 專名號
    const allRelevantIndices = new Set([...puncState.properNounIndices, ...puncState.userProperNouns]);
    allRelevantIndices.forEach(idx => {
        const span = document.getElementById(`char-${idx}`);
        if (!span) return;
        const isTarget = puncState.properNounIndices.includes(idx);
        const isUserSelected = puncState.userProperNouns.has(idx);
        
        span.className = 'char-interactive'; 

        if (isTarget && isUserSelected) {
            span.classList.add('pn-correct'); 
        } else if (isTarget && !isUserSelected) {
            if (typeof currentShowAnswerSetting !== 'undefined' && currentShowAnswerSetting) {
                span.classList.add('pn-missed'); 
            }
        } else if (!isTarget && isUserSelected) {
            span.classList.add('pn-wrong'); 
        }
    });

    const msg = document.getElementById('punc-feedback');
    if (typeof currentShowAnswerSetting !== 'undefined' && currentShowAnswerSetting) {
        msg.innerHTML = `<span class="text-emerald-600">實線=正確</span> / <span class="text-emerald-400 border-b-2 border-dashed border-emerald-400">虛線=漏選</span> / <span class="text-red-500">紅色=錯誤</span>`;
    } else {
        msg.innerHTML = `<span class="text-emerald-600">實線=正確</span> / <span class="text-red-500">紅色=錯誤</span>`;
    }
    msg.className = "mt-4 text-center text-sm font-bold";
}