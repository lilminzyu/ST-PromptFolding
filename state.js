// --- 全域設定 ---
export const config = {
    // CSS 選擇器
    selectors: {
        appBody: 'body',
        promptList: '#completion_prompt_manager_list',
        promptListItem: 'li.completion_prompt_manager_prompt',
        promptLink: 'a.prompt-manager-inspect-action',
        promptAsterisk: '.fa-asterisk', // 標題列要隱藏的星號
        listHeader: '.completion_prompt_manager_list_head',
    },
    // localStorage 的鍵值
    storageKeys: {
        openStates: 'mingyu_collapsible_openStates',
        featureEnabled: 'mingyu_collapsible_featureEnabled',
        customDividers: 'mingyu_collapsible_customDividers',
        caseSensitive: 'mingyu_collapsible_caseSensitive',
        foldingMode: 'mingyu_collapsible_foldingMode',
    },
    // CSS class 名稱
    classNames: {
        group: 'mingyu-prompt-group',
        groupContent: 'mingyu-prompt-group-content',
        isGroupHeader: 'is-group-header', // 加到作為標題的 li 元素上
    },
    // 預設的分組標示
    defaultDividers: ['=', '-']
};

// --- 狀態管理 ---
export let state = {
    openGroups: JSON.parse(localStorage.getItem(config.storageKeys.openStates) || '{}'),
    isEnabled: localStorage.getItem(config.storageKeys.featureEnabled) !== 'false',
    isProcessing: false, // 防止重複執行的標記
    observers: new WeakMap(), // 儲存每個 listContainer 的 observer
    customDividers: JSON.parse(localStorage.getItem(config.storageKeys.customDividers) || 'null') || config.defaultDividers,
    caseSensitive: localStorage.getItem(config.storageKeys.caseSensitive) === 'true',
    foldingMode: localStorage.getItem(config.storageKeys.foldingMode) || 'standard',
};

export let dividerRegex = buildDividerRegex();

/**
 * 符號匹配
 * @returns {RegExp}
 */
export function buildDividerRegex() {
    const patterns = state.customDividers.map(pattern => {
        // 完全轉義所有特殊字元，當作普通字串處理
        return pattern.replace(/[.*+?^${}()|[\\]/g, '\\$&');
    });
    const flags = state.caseSensitive ? '' : 'i';
    return new RegExp(`^(${patterns.join('|')})`, flags);
}

/**
 * 儲存自訂設定
 */
export function saveCustomSettings() {
    localStorage.setItem(config.storageKeys.customDividers, JSON.stringify(state.customDividers));
    localStorage.setItem(config.storageKeys.caseSensitive, state.caseSensitive);
    localStorage.setItem(config.storageKeys.foldingMode, state.foldingMode);
    dividerRegex = buildDividerRegex();
}
