import { state, saveCustomSettings, config } from './state.js';
import { buildCollapsibleGroups } from './prompt-folding.js';

/**
 * 建立設定面板並插入到提示詞管理器中
 * @param {HTMLElement} listContainer
 */
export async function createSettingsPanel(listContainer) {
    const manager = document.getElementById('completion_prompt_manager');
    if (!manager) {
        console.warn('[PF] completion_prompt_manager 未找到');
        return;
    }

    if (document.getElementById('prompt-folding-settings')) {
        return;
    }

    // 從 manifest.json 獲取 settings.html 的路徑
    const response = await fetch('/scripts/extensions/third-party/ST-PromptFolding/settings.html');
    if (!response.ok) {
        console.error('[PF] 無法載入 settings.html');
        return;
    }
    const settingsHtml = await response.text();

    const header = manager.querySelector('.completion_prompt_manager_header');
    const listHead = manager.querySelector('.completion_prompt_manager_list_head');

    if (header) {
        header.insertAdjacentHTML('afterend', settingsHtml);
    } else if (listHead) {
        listHead.insertAdjacentHTML('beforebegin', settingsHtml);
    } else {
        listContainer.insertAdjacentHTML('beforebegin', settingsHtml);
    }
    
    initializeSettingsPanel();
}

/**
 * 初始化設定面板的事件監聽
 */
function initializeSettingsPanel() {
    const textArea = document.getElementById('prompt-folding-dividers');
    const caseCheckbox = document.getElementById('prompt-folding-case-sensitive');
    const applyButton = document.getElementById('prompt-folding-apply');
    const resetButton = document.getElementById('prompt-folding-reset');

    if (!textArea || !caseCheckbox || !applyButton || !resetButton) {
        console.warn('[PF] 設定面板元素未找到');
        return;
    }

    if (!Array.isArray(state.customDividers)) {
        state.customDividers = [...config.defaultDividers];
    }

    textArea.value = state.customDividers.join('\n');
    caseCheckbox.checked = state.caseSensitive;

    const standardRadio = document.getElementById('prompt-folding-mode-standard');
    const sandwichRadio = document.getElementById('prompt-folding-mode-sandwich');
    if (standardRadio && sandwichRadio) {
        if (state.foldingMode === 'sandwich') {
            sandwichRadio.checked = true;
        } else {
            standardRadio.checked = true;
        }

        // 為模式切換添加即時監聽
        const modeRadios = document.getElementById('prompt-folding-mode-radios');
        if (modeRadios) {
            modeRadios.addEventListener('change', (event) => {
                if (event.target.name === 'folding-mode') {
                    state.foldingMode = event.target.value;
                    saveCustomSettings();
                    const listContainer = document.querySelector(config.selectors.promptList);
                    if (listContainer) {
                        buildCollapsibleGroups(listContainer);
                    }
                    toastr.success(`模式已切換為: ${state.foldingMode === 'standard' ? '標準模式' : '包覆模式'}`);
                }
            });
        }
    }

    const closeSettingsPanel = () => {
        const settingsPanel = document.getElementById('prompt-folding-settings');
        const settingsBtn = document.querySelector('.mingyu-settings-toggle');
        if (settingsPanel) settingsPanel.style.display = 'none';
        if (settingsBtn) settingsBtn.classList.remove('active');
    };

    applyButton.addEventListener('click', () => {
        const newDividers = textArea.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (newDividers.length === 0) {
            toastr.warning('請至少輸入一個分組標示符號');
            return;
        }

        state.customDividers = newDividers;
        state.caseSensitive = caseCheckbox.checked;

        const selectedMode = document.querySelector('input[name="folding-mode"]:checked').value;
        state.foldingMode = selectedMode || 'standard';

        saveCustomSettings();

        const listContainer = document.querySelector(config.selectors.promptList);
        if (listContainer) buildCollapsibleGroups(listContainer);

        closeSettingsPanel();
        toastr.success('設定已套用並重新分組');
    });

    resetButton.addEventListener('click', () => {
        state.customDividers = [...config.defaultDividers];
        state.caseSensitive = false;
        state.foldingMode = 'standard';
        saveCustomSettings();

        textArea.value = state.customDividers.join('\n');
        caseCheckbox.checked = false;
        if (standardRadio) standardRadio.checked = true;

        const listContainer = document.querySelector(config.selectors.promptList);
        if (listContainer) buildCollapsibleGroups(listContainer);

        closeSettingsPanel();
        toastr.info('設定已重設為預設值');
    });

    // 顯示版本資訊
    fetch('/scripts/extensions/third-party/ST-PromptFolding/manifest.json')
        .then(response => response.json())
        .then(manifest => {
            const versionInfoEl = document.getElementById('prompt-folding-version-info');
            if (versionInfoEl) {
                versionInfoEl.textContent = `${manifest.display_name} v${manifest.version} © ${manifest.author}`;
            }
        })
        .catch(err => console.error('[PF] 無法載入 manifest.json 獲取版本號:', err));
}
