import { state, saveCustomSettings, config } from './state.js';
import { buildCollapsibleGroups } from './prompt-folding.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

export async function createSettingsPanel(pmContainer) {
    // 避免重複建立
    if (document.getElementById('prompt-folding-settings')) return;

    try {
        const res = await fetch('/scripts/extensions/third-party/ST-PromptFolding/settings.html');
        const html = await res.text();

        // 找個好位置插入
        const header = pmContainer.querySelector('.completion_prompt_manager_header');
        const target = header ? header.nextElementSibling : pmContainer.firstElementChild;
        
        // 使用 insertAdjacentHTML
        (header || pmContainer).insertAdjacentHTML(header ? 'afterend' : 'beforebegin', html);
        
        initLogic();
    } catch (err) {
        console.error('[PF] Load settings UI failed:', err);
    }
}

function initLogic() {
    const els = {
        textarea: document.getElementById('prompt-folding-dividers'),
        applyBtn: document.getElementById('prompt-folding-apply'),
        resetBtn: document.getElementById('prompt-folding-reset'),
        radios: document.getElementsByName('folding-mode'),
        panel: document.getElementById('prompt-folding-settings'),
        toggleBtn: document.querySelector('.mingyu-settings-toggle')
    };

    // 1. 填入當前設定
    els.textarea.value = state.customDividers.join('\n');
    const currentRadio = document.querySelector(`input[name="folding-mode"][value="${state.foldingMode}"]`);
    if (currentRadio) currentRadio.checked = true;

    // 2. 綁定事件
    els.applyBtn.onclick = () => handleApply(els);
    els.resetBtn.onclick = () => handleReset(els);
    
    // 模式切換即時生效
    document.getElementById('prompt-folding-mode-radios')?.addEventListener('change', (e) => {
        if (e.target.name === 'folding-mode') {
            state.foldingMode = e.target.value;
            saveCustomSettings();
            refreshList();
            toastr.success(`模式切換: ${state.foldingMode}`);
        }
    });

    loadMetaInfo();
}

function handleApply(els) {
    const lines = els.textarea.value.split('\n').map(x => x.trim()).filter(x => x);
    if (lines.length === 0) return toastr.warning('請至少輸入一個符號');

    state.customDividers = lines;
    // Radio value
    const mode = document.querySelector('input[name="folding-mode"]:checked')?.value;
    state.foldingMode = mode || 'standard';

    saveCustomSettings();
    refreshList();
    
    // 關閉面板
    els.panel.style.display = 'none';
    els.toggleBtn?.classList.remove('active');
    toastr.success('設定已儲存');
}

async function handleReset(els) {
    const confirmed = await callGenericPopup(
        `<div>確定重設所有設定？無法復原喔。</div>`, 
        POPUP_TYPE.CONFIRM, 
        '', 
        { okButton: '重設', cancelButton: '取消' }
    );

    if (!confirmed) return;

    state.customDividers = [...config.defaultDividers];
    state.foldingMode = 'standard';
    saveCustomSettings();

    // UI 還原
    els.textarea.value = state.customDividers.join('\n');
    document.querySelector('input[value="standard"]').checked = true;
    
    refreshList();
    toastr.info('已重設為預設值');
}

function refreshList() {
    const list = document.querySelector(config.selectors.promptList);
    if (list) buildCollapsibleGroups(list);
}

function loadMetaInfo() {
    // 版本
    fetch('/scripts/extensions/third-party/ST-PromptFolding/manifest.json')
        .then(r => r.json())
        .then(m => document.getElementById('prompt-folding-version-info').textContent = `v${m.version} © ${m.author}`);

    // Log
    fetch('/scripts/extensions/third-party/ST-PromptFolding/changelog.json')
        .then(r => r.json())
        .then(logs => {
            const icon = document.getElementById('prompt-folding-changelog-icon');
            if (icon) {
                const text = logs.map(l => `[${l.date}] v${l.version}\n${l.changes.map(c=>`• ${c}`).join('\n')}`).join('\n\n');
                icon.title = `更新日誌\n\n${text}`;
            }
        });
}