import { state, saveCustomSettings, config } from './state.js';
import { buildCollapsibleGroups } from './prompt-folding.js';

/**
 * 建立設定面板並插入到提示詞管理器中
 * @param {HTMLElement} promptManager
 */
export async function createSettingsPanel(promptManager) {
    if (!promptManager) {
        console.warn('[PF] completion_prompt_manager 未找到');
        return;
    }

    // 避免重複創建
    if (document.getElementById('prompt-folding-settings')) {
        return;
    }

    try {
        const response = await fetch('/scripts/extensions/third-party/ST-PromptFolding/settings.html');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const settingsHtml = await response.text();

        // 尋找合適的插入位置
        const header = promptManager.querySelector('.completion_prompt_manager_header');
        const listHead = promptManager.querySelector('.completion_prompt_manager_list_head');
        const list = promptManager.querySelector(config.selectors.promptList);

        if (header) {
            header.insertAdjacentHTML('afterend', settingsHtml);
        } else if (listHead) {
            listHead.insertAdjacentHTML('beforebegin', settingsHtml);
        } else if (list) {
            list.insertAdjacentHTML('beforebegin', settingsHtml);
        } else {
            throw new Error('無法找到合適的插入位置');
        }
        
        initializeSettingsPanel();
    } catch (err) {
        console.error('[PF] 無法載入設定面板:', err);
    }
}

/**
 * 初始化設定面板的事件監聽
 */
function initializeSettingsPanel() {
    const elements = {
        textArea: document.getElementById('prompt-folding-dividers'),
        applyButton: document.getElementById('prompt-folding-apply'),
        resetButton: document.getElementById('prompt-folding-reset'),
        standardRadio: document.getElementById('prompt-folding-mode-standard'),
        sandwichRadio: document.getElementById('prompt-folding-mode-sandwich'),
        modeRadios: document.getElementById('prompt-folding-mode-radios'),
    };

    // 檢查必要元素
    if (!elements.textArea || !elements.applyButton || !elements.resetButton) {
        console.warn('[PF] 設定面板元素未找到');
        return;
    }

    // 初始化表單值
    initializeFormValues(elements);
    
    // 綁定事件
    setupModeChangeListener(elements);
    setupApplyButton(elements);
    setupResetButton(elements);
    
    // 顯示版本資訊
    displayVersionInfo();
}

/**
 * 初始化表單值
 * @param {object} elements 
 */
function initializeFormValues(elements) {
    // 確保 customDividers 是陣列
    if (!Array.isArray(state.customDividers)) {
        state.customDividers = [...config.defaultDividers];
    }

    elements.textArea.value = state.customDividers.join('\n');

    // 設置模式單選框
    if (elements.standardRadio && elements.sandwichRadio) {
        if (state.foldingMode === 'sandwich') {
            elements.sandwichRadio.checked = true;
        } else {
            elements.standardRadio.checked = true;
        }
    }
}

/**
 * 設置模式切換監聽器（即時生效）
 * @param {object} elements 
 */
function setupModeChangeListener(elements) {
    if (!elements.modeRadios) return;

    elements.modeRadios.addEventListener('change', (event) => {
        if (event.target.name === 'folding-mode') {
            state.foldingMode = event.target.value;
            saveCustomSettings();
            
            const listContainer = document.querySelector(config.selectors.promptList);
            if (listContainer) {
                buildCollapsibleGroups(listContainer);
            }
            
            const modeName = state.foldingMode === 'standard' ? '標準模式' : '包覆模式';
            toastr.success(`模式已切換為: ${modeName}`);
        }
    });
}

/**
 * 設置套用按鈕
 * @param {object} elements 
 */
function setupApplyButton(elements) {
    elements.applyButton.addEventListener('click', () => {
        const newDividers = elements.textArea.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (newDividers.length === 0) {
            toastr.warning('請至少輸入一個分組標示符號');
            return;
        }

        // 更新狀態
        state.customDividers = newDividers;
        saveCustomSettings();

        // 重新分組
        const listContainer = document.querySelector(config.selectors.promptList);
        if (listContainer) {
            buildCollapsibleGroups(listContainer);
        }

        closeSettingsPanel();
        toastr.success('設定已套用並重新分組');
    });
}

/**
 * 設置重設按鈕
 * @param {object} elements 
 */
function setupResetButton(elements) {
    elements.resetButton.addEventListener('click', () => {
        // 顯示確認對話框
        const confirmReset = confirm(
            '確定要重設所有設定嗎？\n\n' +
            '這將會：\n' +
            '• 恢復預設分組標示符號 (=, -)\n' +
            '• 切換回標準模式\n' +
            '• 立即重新分組\n\n' +
            '此操作無法復原！'
        );

        if (!confirmReset) {
            return; // 使用者取消，不執行重設
        }

        // 重設為預設值
        state.customDividers = [...config.defaultDividers];
        state.foldingMode = 'standard';
        saveCustomSettings();

        // 更新表單
        elements.textArea.value = state.customDividers.join('\n');
        if (elements.standardRadio) {
            elements.standardRadio.checked = true;
        }

        // 重新分組
        const listContainer = document.querySelector(config.selectors.promptList);
        if (listContainer) {
            buildCollapsibleGroups(listContainer);
        }

        closeSettingsPanel();
        toastr.info('設定已重設為預設值');
    });
}

/**
 * 關閉設定面板
 */
function closeSettingsPanel() {
    const settingsPanel = document.getElementById('prompt-folding-settings');
    const settingsBtn = document.querySelector('.mingyu-settings-toggle');
    
    if (settingsPanel) {
        settingsPanel.style.display = 'none';
    }
    if (settingsBtn) {
        settingsBtn.classList.remove('active');
    }
}

/**
 * 顯示版本資訊
 */
function displayVersionInfo() {
    fetch('/scripts/extensions/third-party/ST-PromptFolding/manifest.json')
        .then(response => response.json())
        .then(manifest => {
            const versionInfoEl = document.getElementById('prompt-folding-version-info');
            if (versionInfoEl) {
                versionInfoEl.textContent = `${manifest.display_name} v${manifest.version} © ${manifest.author}`;
            }
        })
        .catch(err => console.error('[PF] 無法載入版本資訊:', err));
}