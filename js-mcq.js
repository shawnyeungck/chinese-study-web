/**
 * 渲染選擇題介面
 */
function renderMCQ(q, container, mode, savedAnswer, showResult) {
    // 1. 智能解析
    let questionBody = q.content || "";
    let correctAnswer = "";
    
    const match = q.content.match(/\[(.*?)\]/);
    if (match) {
        correctAnswer = match[1]; 
        questionBody = q.content.replace(/\[.*?\]/, '<span class="border-b-2 border-indigo-400 px-2 text-indigo-600 font-bold">_____</span>');
    } else {
        questionBody = q.content;
        correctAnswer = "請檢查題目設定"; 
    }

    // 2. 準備選項
    let options = [...(q.options || [])];
    if (correctAnswer && correctAnswer !== "請檢查題目設定" && !options.includes(correctAnswer)) {
        options.push(correctAnswer);
    }
    
    // 選項隨機排序 (使用簡單的 hash 排序確保同一題順序固定，或改用 Math.random)
    options.sort((a, b) => stringHash(a + q.id) - stringHash(b + q.id));

    // 3. 構建 HTML
    let visualHtml = '';
    if (q.image && q.image.trim() !== '') {
        visualHtml += `<div class="mb-3 flex justify-center"><img src="${q.image}" onclick="viewImage(this.src)" class="max-h-56 rounded-xl shadow-md border border-slate-200 object-contain bg-white cursor-zoom-in hover:opacity-90 transition-opacity" title="點擊放大圖片"></div>`;
    }
    
    visualHtml += `<div class="mb-6 text-lg font-bold text-slate-700 text-center bg-white p-5 rounded-2xl border border-slate-100 shadow-sm leading-relaxed">${questionBody}</div>`;
    
    // 4. 生成選項按鈕
    let optionsHtml = options.map(opt => {
        const safeOpt = opt.replace(/'/g, "\\'");
        const safeCorrect = correctAnswer.replace(/'/g, "\\'");
        
        let userSelectedText = null;
        if (savedAnswer) {
            if (typeof savedAnswer === 'string') userSelectedText = savedAnswer;
            else if (savedAnswer.answer) userSelectedText = savedAnswer.answer;
        }

        const isSelected = (userSelectedText === opt);
        const isCorrectOption = (opt === correctAnswer);

        let btnClass = "bg-white border-slate-200";
        let iconClass = "border-slate-300 text-transparent";
        let iconText = "";
        let statusLabel = ""; 

        if (showResult) {
            if (isSelected) {
                if (isCorrectOption) {
                    btnClass = "bg-emerald-100 border-emerald-500 ring-2 ring-emerald-200";
                    iconClass = "bg-emerald-500 border-emerald-500 text-white";
                    iconText = "✓";
                    statusLabel = `<span class="ml-auto text-xs font-bold text-emerald-600 bg-white px-2 py-1 rounded-full border border-emerald-200">你的答案 (正確)</span>`;
                } else {
                    btnClass = "bg-rose-50 border-rose-500 ring-2 ring-rose-200";
                    iconClass = "bg-rose-500 border-rose-500 text-white";
                    iconText = "✕";
                    statusLabel = `<span class="ml-auto text-xs font-bold text-rose-600 bg-white px-2 py-1 rounded-full border border-rose-200">你的答案</span>`;
                }
            } else if (isCorrectOption) {
                if (typeof currentShowAnswerSetting !== 'undefined' && currentShowAnswerSetting) {
                    btnClass = "bg-white border-emerald-400 ring-2 ring-emerald-100 border-dashed";
                    iconClass = "border-emerald-400 text-emerald-500";
                    iconText = "✓";
                    statusLabel = `<span class="ml-auto text-xs font-bold text-emerald-500">正確答案</span>`;
                } else {
                    btnClass = "bg-slate-50 border-slate-100 opacity-50 grayscale";
                }
            } else {
                btnClass = "bg-slate-50 border-slate-100 opacity-50 grayscale";
            }
        } else {
            if (isSelected) {
                btnClass = "bg-indigo-50 border-indigo-500 ring-2 ring-indigo-200";
                iconClass = "bg-indigo-500 border-indigo-500 text-white";
                iconText = "✓";
            } else {
                btnClass = "bg-white border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30";
            }
        }

        const disabledAttr = showResult ? 'disabled' : '';
        const cursorClass = showResult ? 'cursor-default' : 'cursor-pointer';

        return `<button onclick="checkMCQ(this, '${safeOpt}', '${safeCorrect}')" ${disabledAttr}
            class="w-full text-left p-4 rounded-xl border-2 ${btnClass} ${cursorClass} text-lg font-medium transition-all text-slate-700 shadow-sm group mb-0 flex items-center mb-3 relative overflow-hidden">
            <span class="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full border-2 ${iconClass} mr-3 transition-colors font-bold text-sm z-10">
                ${iconText}
            </span>
            <span class="z-10">${opt}</span>
            ${statusLabel}
        </button>`;
    }).join('');

    container.innerHTML = `<div class="max-w-xl mx-auto flex flex-col h-full"><div class="flex-shrink-0">${visualHtml}</div><div class="flex flex-col flex-1 overflow-y-auto px-1 custom-scroll pb-2">${optionsHtml}</div></div>`;
}

function stringHash(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
}

function checkMCQ(btn, selected, correct) {
    const allBtns = btn.parentElement.querySelectorAll('button');
    allBtns.forEach(b => {
        b.className = "w-full text-left p-4 rounded-xl border-2 bg-white border-slate-200 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 text-lg font-medium text-slate-700 shadow-sm group mb-0 flex items-center mb-3 relative overflow-hidden";
        const icon = b.querySelector('span');
        icon.className = "flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full border-2 border-slate-300 text-transparent mr-3 font-bold text-sm z-10";
        icon.innerText = "";
        if(b.lastElementChild.tagName === 'SPAN' && b.children.length > 2) b.lastElementChild.remove();
    });

    btn.classList.remove('bg-white', 'border-slate-200', 'hover:border-indigo-300', 'hover:bg-indigo-50/30');
    btn.classList.add('bg-indigo-50', 'border-indigo-500', 'ring-2', 'ring-indigo-200');
    const icon = btn.querySelector('span');
    icon.classList.remove('border-slate-300', 'text-transparent');
    icon.classList.add('bg-indigo-500', 'border-indigo-500', 'text-white');
    icon.innerText = "✓";

    const score = (selected === correct) ? 100 : 0;
    if (typeof handleAnswer === 'function') {
        handleAnswer(score, selected);
    }
}