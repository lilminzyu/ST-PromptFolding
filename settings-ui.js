import { state, saveCustomSettings, config, log, loadFromPreset, exportConfigFromPreset, importConfigToCurrentPreset, getCurrentPresetName, getAllPresetNames, buildDividerRegex } from './state.js';
import { buildCollapsibleGroups } from './prompt-folding.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

let listContainerRef = null;
let selectionSnapshot = null;
let foldRestoreInfo = null;

export async function createSettingsPanel(pmContainer, listContainer) {
    if (document.getElementById('prompt-folding-settings')) return;

    listContainerRef = listContainer;

    try {
        const res = await fetch('/scripts/extensions/third-party/ST-PromptFolding/settings.html');
        const html = await res.text();

        const header = pmContainer.querySelector('.completion_prompt_manager_header');
        (header || pmContainer).insertAdjacentHTML(header ? 'afterend' : 'beforebegin', html);

        initLogic();
    } catch (err) {
        console.error('[PF] Load settings UI failed:', err);
    }
}

function initLogic() {
    // state 在 initialize() 中已由 loadFromPreset 填入，直接使用

    const els = {
        textarea: document.getElementById('prompt-folding-dividers'),
        resetIcon: document.getElementById('prompt-folding-reset-icon'),
        radios: document.getElementsByName('folding-mode'),
        panel: document.getElementById('prompt-folding-settings'),
        toggleBtn: document.querySelector('.mingyu-settings-toggle'),
        debugCheckbox: document.getElementById('prompt-folding-debug'),
        dividerSettings: document.getElementById('divider-settings'),
        manualControls: document.getElementById('manual-mode-controls'),
        startSelectBtn: document.getElementById('prompt-folding-start-select'),
        copyFromPresetSelect: document.getElementById('prompt-folding-copy-from-preset'),
        copyConfigBtn: document.getElementById('prompt-folding-copy-config-btn'),
        foldSettingsCheckbox: document.getElementById('prompt-folding-fold-settings'),
    };

    // 填入當前設定
    els.textarea.value = state.customDividers.join('\n');
    els.debugCheckbox.checked = state.debugMode;

    // 折設定（從 localStorage 讀取）
    const foldSettingsEnabled = localStorage.getItem('pf-fold-settings') === '1';
    els.foldSettingsCheckbox.checked = foldSettingsEnabled;
    if (foldSettingsEnabled) applyFoldSettings(true);

    const currentRadio = document.querySelector(`input[name="folding-mode"][value="${state.foldingMode}"]`);
    if (currentRadio) currentRadio.checked = true;

    if (state.foldingMode === 'standard' || state.foldingMode === 'sandwich') {
        document.getElementById('prompt-folding-legacy-modes')?.setAttribute('open', '');
    }

    updateModeUI();

    // 折設定開關
    els.foldSettingsCheckbox.onchange = () => {
        const checked = els.foldSettingsCheckbox.checked;
        localStorage.setItem('pf-fold-settings', checked ? '1' : '0');
        applyFoldSettings(checked);
    };

    // Debug 開關
    els.debugCheckbox.onchange = () => {
        state.debugMode = els.debugCheckbox.checked;
        saveCustomSettings();
        log('Debug mode toggled:', state.debugMode);
        toastr.info(`Debug 模式：${state.debugMode ? '開啟' : '關閉'}`);
    };

    // 模式切換
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

    // 分隔符號變動時彈出確認面板
    console.log('[PF] textarea element:', els.textarea);
    els.textarea.addEventListener('input', () => {
        console.log('[PF] textarea input event fired');
        showDividerConfirmPanel();
    });

    // 重設 icon
    els.resetIcon.onclick = () => handleReset(els);

    // 開始選擇按鈕（手動模式）
    els.startSelectBtn.onclick = () => startManualSelection();

    // 載入可用 preset 列表
    loadAvailablePresets(els.copyFromPresetSelect);
    els.copyFromPresetSelect.addEventListener('focus', () => loadAvailablePresets(els.copyFromPresetSelect));

    // 複製配置按鈕
    els.copyConfigBtn.onclick = () => handleCopyConfig(els);

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

async function handleReset(els) {
    log('Reset button clicked');

    const confirmed = await callGenericPopup(
        `<div>確定重設所有設定？無法復原喔。</div>`,
        POPUP_TYPE.CONFIRM,
        '',
        { okButton: '重設', cancelButton: '取消' },
    );

    if (!confirmed) return;

    // 用 loadFromPreset(null) 重設所有欄位為預設值
    loadFromPreset(null);
    saveCustomSettings();

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

// --- 分隔符號確認面板 ---
let _dividerSnapshot = null;

function showDividerConfirmPanel() {
    console.log('[PF] showDividerConfirmPanel called');
    if (document.getElementById('prompt-folding-float-wrapper')) return;

    // 記住修改前的值，供取消還原
    _dividerSnapshot = [...state.customDividers];

    const panel = document.createElement('div');
    panel.id = 'prompt-folding-float-panel';
    panel.innerHTML = `
        <div id="prompt-folding-float-finish" class="menu_button menu_button_icon">
            <i class="fa-solid fa-check"></i>
        </div>
        <div id="prompt-folding-float-cancel" class="menu_button menu_button_icon">
            <i class="fa-solid fa-xmark"></i>
        </div>
    `;
    const wrapper = document.createElement('div');
    wrapper.id = 'prompt-folding-float-wrapper';
    wrapper.appendChild(panel);

    const navPanel = document.getElementById('left-nav-panel') || document.body;
    navPanel.appendChild(wrapper);

    panel.querySelector('#prompt-folding-float-finish').onclick = applyDividerChanges;
    panel.querySelector('#prompt-folding-float-cancel').onclick = cancelDividerChanges;
}

function applyDividerChanges() {
    const textarea = document.getElementById('prompt-folding-dividers');
    const lines = textarea.value.split('\n').map(x => x.trim()).filter(x => x);
    if ((state.foldingMode === 'standard' || state.foldingMode === 'sandwich') && lines.length === 0) {
        toastr.warning('請至少輸入一個符號');
        return;
    }
    state.customDividers = lines;
    buildDividerRegex();
    saveCustomSettings();
    refreshList();

    _dividerSnapshot = null;
    document.getElementById('prompt-folding-float-wrapper')?.remove();
    toastr.success('分隔符號已套用');
}

function cancelDividerChanges() {
    if (_dividerSnapshot) {
        state.customDividers = _dividerSnapshot;
        const textarea = document.getElementById('prompt-folding-dividers');
        if (textarea) textarea.value = _dividerSnapshot.join('\n');
        _dividerSnapshot = null;
    }
    document.getElementById('prompt-folding-float-wrapper')?.remove();
}

// 手動選擇邏輯
function startManualSelection() {
    log('Start manual header selection');

    if (!listContainerRef) {
        toastr.error('找不到提示詞列表');
        return;
    }

    state.isSelectingHeaders = true;

    selectionSnapshot = new Set(state.manualHeaders);

    const allItems = listContainerRef.querySelectorAll(config.selectors.promptListItem);

    allItems.forEach(item => {
        if (item.querySelector('.mingyu-header-checkbox')) return;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'mingyu-header-checkbox';
        checkbox.checked = state.manualHeaders.has(item.dataset.pmIdentifier);

        checkbox.onclick = (e) => e.stopPropagation();
        checkbox.onchange = (e) => {
            e.stopPropagation();
            const id = item.dataset.pmIdentifier;
            if (checkbox.checked) {
                state.manualHeaders.add(id);
            } else {
                state.manualHeaders.delete(id);
            }
            updateFloatingCount();
            log('Manual header toggled:', id, checkbox.checked);
        };

        item.insertBefore(checkbox, item.firstChild);
    });

    const startBtn = document.getElementById('prompt-folding-start-select');
    startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 選擇中...';
    startBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    startBtn.style.opacity = '0.5';
    startBtn.style.pointerEvents = 'none';
    startBtn.id = 'prompt-folding-finish-select';

    const panel = document.createElement('div');
    panel.id = 'prompt-folding-float-panel';
    panel.innerHTML = `
        <span id="prompt-folding-float-count"></span>
        <div id="prompt-folding-float-finish" class="menu_button menu_button_icon">
            <i class="fa-solid fa-check"></i>
        </div>
        <div id="prompt-folding-float-cancel" class="menu_button menu_button_icon">
            <i class="fa-solid fa-xmark"></i>
        </div>
    `;
    const wrapper = document.createElement('div');
    wrapper.id = 'prompt-folding-float-wrapper';
    wrapper.appendChild(panel);

    const navPanel = document.getElementById('left-nav-panel') || document.body;
    navPanel.appendChild(wrapper);

    panel.querySelector('#prompt-folding-float-finish').onclick = finishManualSelection;
    panel.querySelector('#prompt-folding-float-cancel').onclick = cancelManualSelection;

    updateFloatingCount();
    toastr.info('請勾選要當資料夾的條目，完成後點擊「完成」');
}

function updateFloatingCount() {
    const el = document.getElementById('prompt-folding-float-count');
    if (el) el.textContent = `已選 ${state.manualHeaders.size} 個`;
}

function restoreSelectButton() {
    const btn = document.getElementById('prompt-folding-finish-select');
    if (!btn) return;
    btn.innerHTML = '<i class="fa-solid fa-hand-pointer"></i> 開始選擇資料夾';
    btn.style.background = 'rgba(74, 158, 255, 0.2)';
    btn.style.opacity = '';
    btn.style.pointerEvents = '';
    btn.onclick = startManualSelection;
    btn.id = 'prompt-folding-start-select';
}

function finishManualSelection() {
    log('Finish manual header selection, selected:', state.manualHeaders.size);

    state.isSelectingHeaders = false;
    selectionSnapshot = null;

    document.querySelectorAll('.mingyu-header-checkbox').forEach(cb => cb.remove());
    document.getElementById('prompt-folding-float-wrapper')?.remove();

    restoreSelectButton();

    saveCustomSettings();
    refreshList();

    toastr.success(`已選擇 ${state.manualHeaders.size} 個資料夾`);
}

export function cancelManualSelection() {
    if (!state.isSelectingHeaders) return;
    log('Cancel manual header selection');

    state.isSelectingHeaders = false;

    if (selectionSnapshot !== null) {
        state.manualHeaders.clear();
        selectionSnapshot.forEach(id => state.manualHeaders.add(id));
        selectionSnapshot = null;
    }

    document.querySelectorAll('.mingyu-header-checkbox').forEach(cb => cb.remove());
    document.getElementById('prompt-folding-float-wrapper')?.remove();

    restoreSelectButton();

    toastr.info('已取消，還原至修改前的選擇');
}

// 折設定：把 #range_block_openai 整體 + #openai_settings 的前段折進一個 <details>
export function applyFoldSettings(fold) {
    const DETAILS_ID = 'pf-settings-fold-details';

    if (fold) {
        if (document.getElementById(DETAILS_ID)) return;

        const rangeBlock = document.getElementById('range_block_openai');
        if (!rangeBlock) return;

        const details = document.createElement('details');
        details.id = DETAILS_ID;

        const summary = document.createElement('summary');
        summary.textContent = '詳細設定摺疊';
        summary.className = 'pf-fold-settings-summary';
        details.appendChild(summary);

        // 收集要移入的元素（依序）
        const targets = [{ el: rangeBlock, parent: rangeBlock.parentElement, next: rangeBlock.nextSibling }];

        const openaiSettings = document.getElementById('openai_settings');
        if (openaiSettings) {
            const firstDiv = openaiSettings.querySelector(':scope > div');
            const firstRangeBlockMt1 = openaiSettings.querySelector(':scope > div.range-block.m-t-1');
            if (firstDiv) targets.push({ el: firstDiv, parent: openaiSettings, next: firstDiv.nextSibling });
            if (firstRangeBlockMt1) targets.push({ el: firstRangeBlockMt1, parent: openaiSettings, next: firstRangeBlockMt1.nextSibling });
        }

        // 記住還原資訊
        foldRestoreInfo = targets.map(t => ({ el: t.el, parent: t.parent, next: t.next }));

        // 插入 details 到 rangeBlock 原來的位置，再把所有目標移入
        rangeBlock.parentElement.insertBefore(details, rangeBlock);
        targets.forEach(t => details.appendChild(t.el));
    } else {
        const details = document.getElementById(DETAILS_ID);
        if (!details || !foldRestoreInfo) return;

        // 反序還原（避免 nextSibling 參照失效）
        foldRestoreInfo.slice().reverse().forEach(({ el, parent, next }) => {
            try {
                parent.insertBefore(el, next);
            } catch {
                parent.appendChild(el);
            }
        });

        foldRestoreInfo = null;
        details.remove();
    }
}

// preset 切換後同步 UI 顯示
export function updateSettingsUI() {
    const textarea = document.getElementById('prompt-folding-dividers');
    if (!textarea) return; // 設定面板未開啟

    textarea.value = state.customDividers.join('\n');

    const debugCheckbox = document.getElementById('prompt-folding-debug');
    if (debugCheckbox) debugCheckbox.checked = state.debugMode;

    const foldSettingsCheckbox = document.getElementById('prompt-folding-fold-settings');
    if (foldSettingsCheckbox) {
        foldSettingsCheckbox.checked = localStorage.getItem('pf-fold-settings') === '1';
    }

    const currentRadio = document.querySelector(`input[name="folding-mode"][value="${state.foldingMode}"]`);
    if (currentRadio) currentRadio.checked = true;

    updateModeUI();
    loadAvailablePresets(document.getElementById('prompt-folding-copy-from-preset'));
}

// 載入可用 preset 列表（從 DOM dropdown）
function loadAvailablePresets(selectElement) {
    if (!selectElement) return;

    const currentPreset = getCurrentPresetName();
    const presets = getAllPresetNames().filter(p => p !== currentPreset);

    if (presets.length === 0) {
        selectElement.innerHTML = '<option value="">（無其他 Preset）</option>';
        return;
    }

    selectElement.innerHTML = '<option value="">選擇要複製的 Preset</option>';
    presets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset;
        option.textContent = preset;
        selectElement.appendChild(option);
    });
}

// 複製配置（UUID 匹配）
async function handleCopyConfig(els) {
    const sourcePreset = els.copyFromPresetSelect.value;

    if (!sourcePreset) {
        toastr.warning('請先選擇要複製的 Preset');
        return;
    }

    const confirmed = await callGenericPopup(
        `<div>確定要從「${sourcePreset}」複製配置到當前 Preset 嗎？<br><br>` +
        `會複製：<br>` +
        `• 摺疊模式<br>` +
        `• 分組符號設定<br>` +
        `• 手動選擇的資料夾（UUID 匹配）<br></div>`,
        POPUP_TYPE.CONFIRM,
        '',
        { okButton: '複製', cancelButton: '取消' },
    );

    if (!confirmed) return;

    try {
        log('Copying config from', sourcePreset);

        const configData = await exportConfigFromPreset(sourcePreset);
        if (!configData) {
            toastr.warning(`「${sourcePreset}」尚無摺疊配置`);
            return;
        }

        if (!listContainerRef) {
            toastr.error('找不到提示詞列表');
            return;
        }

        const allItems = Array.from(listContainerRef.querySelectorAll(config.selectors.promptListItem));
        const matchResults = await importConfigToCurrentPreset(configData, allItems);

        updateSettingsUI();
        refreshList();

        const failed = matchResults.failed.length;
        let message = `配置複製完成！\n• UUID 匹配：${matchResults.byUuid} 個`;
        if (failed > 0) {
            message += `\n• 無法匹配：${failed} 個`;
        }
        toastr.success(message, '複製成功', { timeOut: 4000 });

    } catch (err) {
        console.error('[PF] Copy config failed:', err);
        toastr.error('複製配置時發生錯誤：' + err.message);
    }
}

function loadMetaInfo() {
    fetch('/scripts/extensions/third-party/ST-PromptFolding/manifest.json')
        .then(r => r.json())
        .then(m => {
            const el = document.getElementById('prompt-folding-version-info');
            if (!el) return;
            el.innerHTML = `v${m.version} © <a href="${m.homePage}" target="_blank" rel="noopener" style="color: inherit; opacity: 0.7;">${m.author}</a>`;
        });

    fetch('/scripts/extensions/third-party/ST-PromptFolding/changelog.json')
        .then(r => r.json())
        .then(logs => {
            const icon = document.getElementById('prompt-folding-changelog-icon');
            if (icon) {
                const text = logs.map(l => `[${l.date}] v${l.version}\n${l.changes.map(c => `• ${c}`).join('\n')}`).join('\n\n');
                icon.title = `更新日誌\n\n${text}`;
            }
        });
}
