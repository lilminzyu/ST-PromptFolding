// --- 全域設定 ---
export const config = {
    // CSS 選擇器
    selectors: {
        appBody: 'body',
        promptList: '#completion_prompt_manager_list',
        promptListItem: 'li.completion_prompt_manager_prompt',
        promptLink: 'span.completion_prompt_manager_prompt_name',
        promptAsterisk: '.fa-asterisk', // 標題列要隱藏的星號
        listHeader: '.completion_prompt_manager_list_head',
    },
    // localStorage 的鍵值
    storageKeys: {
        openStates: 'mingyu_collapsible_openStates',
        featureEnabled: 'mingyu_collapsible_featureEnabled',
        customDividers: 'mingyu_collapsible_customDividers',
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

// --- 狀態 ---
export let state = {
    // 從 LocalStorage 讀取設定，沒讀到就用預設值
    openGroups: JSON.parse(localStorage.getItem(config.storageKeys.openStates) || '{}'),
    isEnabled: localStorage.getItem(config.storageKeys.featureEnabled) !== 'false',
    customDividers: JSON.parse(localStorage.getItem(config.storageKeys.customDividers)) || config.defaultDividers,
    foldingMode: localStorage.getItem(config.storageKeys.foldingMode) || 'standard',
    
    // Runtime 狀態
    isProcessing: false, 
    observers: new WeakMap(), 
    groupHierarchy: {},    // key: groupKey, value: [childId...]
    groupHeaderStatus: {}, // key: groupKey, value: boolean
};

// 初始化 Regex
export let dividerRegex = buildDividerRegex();

// 建立分隔線 Regex (特殊字元自動跳脫)
export function buildDividerRegex() {
    const patterns = state.customDividers.map(p => p.replace(/[.*+?^${}()|[\\]/g, '\\$&'));
    return new RegExp(`^(${patterns.join('|')})`, 'i');
}

// 存設定並更新 Regex
export function saveCustomSettings() {
    localStorage.setItem(config.storageKeys.customDividers, JSON.stringify(state.customDividers));
    localStorage.setItem(config.storageKeys.foldingMode, state.foldingMode);
    dividerRegex = buildDividerRegex();
}
