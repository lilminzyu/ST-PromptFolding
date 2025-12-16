import { state, saveCustomSettings, config, log } from './state.js';
import { buildCollapsibleGroups } from './prompt-folding.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

let listContainerRef = null; // 儲存 listContainer 引用

export async function createSettingsPanel(pmContainer, listContainer) {
    // 避免重複建立
    if (document.getElementById('prompt-folding-settings')) return;

    // 儲存 listContainer 引用
    listContainerRef = listContainer;

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
        toggleBtn: document.querySelector('.mingyu-settings-toggle'),
        debugCheckbox: document.getElementById('prompt-folding-debug'),
        dividerSettings: document.getElementById('divider-settings'),
        manualControls: document.getElementById('manual-mode-controls'),
        startSelectBtn: document.getElementById('prompt-folding-start-select'),
    };

    // 1. 填入當前設定
    els.textarea.value = state.customDividers.join('\n');
    els.debugCheckbox.checked = state.debugMode;

    const currentRadio = document.querySelector(`input[name="folding-mode"][value="${state.foldingMode}"]`);
    if (currentRadio) currentRadio.checked = true;

    updateModeUI(); // 根據模式顯示/隱藏對應區塊

    // 2. Debug 模式開關
    els.debugCheckbox.onchange = () => {
        state.debugMode = els.debugCheckbox.checked;
        saveCustomSettings();
        log('Debug mode toggled:', state.debugMode);
        toastr.info(`Debug 模式：${state.debugMode ? '開啟' : '關閉'}`);
    };

    // 3. 模式切換
    document.getElementById('prompt-folding-mode-radios')?.addEventListener('change', (e) => {
        if (e.target.name === 'folding-mode') {
            state.foldingMode = e.target.value;
            saveCustomSettings();
            updateModeUI();
            refreshList();
            log('Folding mode changed:', state.foldingMode);
            toastr.success(`模式切換: ${getModeDisplayName()}`);
        }
    });

    // 4. 套用按鈕
    els.applyBtn.onclick = () => handleApply(els);

    // 5. 重設按鈕
    els.resetBtn.onclick = () => handleReset(els);

    // 6. 開始選擇按鈕（手動模式）
    els.startSelectBtn.onclick = () => startManualSelection();

    loadMetaInfo();
}

function updateModeUI() {
    const isManual = state.foldingMode === 'manual';
    document.getElementById('divider-settings').style.display = isManual ? 'none' : 'block';
    document.getElementById('manual-mode-controls').style.display = isManual ? 'block' : 'none';
}

function getModeDisplayName() {
    const names = { manual: '手動選擇', standard: '標準模式', sandwich: '包覆模式' };
    return names[state.foldingMode] || state.foldingMode;
}

function handleApply(els) {
    log('Apply button clicked');

    const lines = els.textarea.value.split('\n').map(x => x.trim()).filter(x => x);

    // 如果是符號模式但沒填符號，警告
    if ((state.foldingMode === 'standard' || state.foldingMode === 'sandwich') && lines.length === 0) {
        return toastr.warning('請至少輸入一個符號');
    }

    state.customDividers = lines;
    saveCustomSettings();
    refreshList();

    // 關閉面板
    els.panel.style.display = 'none';
    els.toggleBtn?.classList.remove('active');

    toastr.success('設定已儲存');
}

async function handleReset(els) {
    log('Reset button clicked');

    const confirmed = await callGenericPopup(
        `<div>確定重設所有設定？無法復原喔。</div>`,
        POPUP_TYPE.CONFIRM,
        '',
        { okButton: '重設', cancelButton: '取消' }
    );

    if (!confirmed) return;

    state.customDividers = [...config.defaultDividers];
    state.foldingMode = 'manual'; // 預設改為手動模式
    state.debugMode = false;
    state.manualHeaders.clear();
    saveCustomSettings();

    // UI 還原
    els.textarea.value = state.customDividers.join('\n');
    els.debugCheckbox.checked = false;
    document.querySelector('input[value="manual"]').checked = true;
    updateModeUI();

    refreshList();
    toastr.info('已重設為預設值');
}

function refreshList() {
    if (listContainerRef) {
        buildCollapsibleGroups(listContainerRef);
    }
}

// 手動選擇邏輯
function startManualSelection() {
    log('Start manual header selection');

    if (!listContainerRef) {
        toastr.error('找不到提示詞列表');
        return;
    }

    state.isSelectingHeaders = true;

    // 1. 在每個條目前面加勾選框
    const allItems = listContainerRef.querySelectorAll(config.selectors.promptListItem);

    allItems.forEach(item => {
        if (item.querySelector('.mingyu-header-checkbox')) return; // 避免重複

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'mingyu-header-checkbox';
        checkbox.checked = state.manualHeaders.has(item.dataset.pmIdentifier);

        // 阻止點擊事件冒泡到 li
        checkbox.onclick = (e) => {
            e.stopPropagation();
        };

        // 綁定變更事件
        checkbox.onchange = (e) => {
            e.stopPropagation();
            const id = item.dataset.pmIdentifier;
            if (checkbox.checked) {
                state.manualHeaders.add(id);
            } else {
                state.manualHeaders.delete(id);
            }
            log('Manual header toggled:', id, checkbox.checked);
        };

        // 插在最前面，成為第一個 grid item
        item.insertBefore(checkbox, item.firstChild);
    });

    // 2. 替換為「完成選擇」按鈕
    const startBtn = document.getElementById('prompt-folding-start-select');
    startBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> 完成選擇';
    startBtn.style.background = 'rgba(74, 255, 158, 0.2)';
    startBtn.onclick = finishManualSelection;
    startBtn.id = 'prompt-folding-finish-select';

    toastr.info('請勾選要當資料夾的條目，完成後點擊「完成選擇」');
}

function finishManualSelection() {
    log('Finish manual header selection, selected:', state.manualHeaders.size);

    state.isSelectingHeaders = false;

    // 移除所有勾選框
    document.querySelectorAll('.mingyu-header-checkbox').forEach(cb => cb.remove());

    // 還原為「開始選擇」按鈕
    const finishBtn = document.getElementById('prompt-folding-finish-select');
    finishBtn.innerHTML = '<i class="fa-solid fa-hand-pointer"></i> 開始選擇資料夾';
    finishBtn.style.background = 'rgba(74, 158, 255, 0.2)';
    finishBtn.onclick = startManualSelection;
    finishBtn.id = 'prompt-folding-start-select';

    // 儲存並重建
    saveCustomSettings();
    refreshList();

    toastr.success(`已選擇 ${state.manualHeaders.size} 個資料夾`);
}

function loadMetaInfo() {
    // 版本
    fetch('/scripts/extensions/third-party/ST-PromptFolding/manifest.json')
        .then(r => r.json())
        .then(m => document.getElementById('prompt-folding-version-info').textContent = `v${m.version} © ${m.author}`);

    // Changelog
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
