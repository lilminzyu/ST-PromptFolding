// --- 全域設定 ---
export const config = {
    // CSS 選擇器
    selectors: {
        appBody: 'body',
        promptList: '#completion_prompt_manager_list',
        promptListItem: 'li.completion_prompt_manager_prompt',
        promptLink: 'a.prompt-manager-inspect-action',  // 真正包含文字的 <a> 標籤
        promptNameSpan: 'span.completion_prompt_manager_prompt_name',  // 外層容器
        promptAsterisk: '.fa-asterisk', // 標題列要隱藏的星號
        listHeader: '.completion_prompt_manager_list_head',
    },
    // localStorage 的鍵值（會自動加上 preset 前綴）
    storageKeys: {
        openStates: 'openStates',
        featureEnabled: 'featureEnabled',
        customDividers: 'customDividers',
        foldingMode: 'foldingMode',
        debugMode: 'debugMode',
        manualHeaders: 'manualHeaders',
        originalNames: 'originalNames',
    },
    storagePrefix: 'mingyu_collapsible_', // 基本前綴
    // CSS class 名稱
    classNames: {
        group: 'mingyu-prompt-group',
        groupContent: 'mingyu-prompt-group-content',
        isGroupHeader: 'is-group-header', // 加到作為標題的 li 元素上
    },
    // 預設的分組標示
    defaultDividers: ['=', '-']
};

// 獲取當前 preset 名稱
export function getCurrentPresetName() {
    // 嘗試從全局變量獲取當前 preset
    if (typeof oai_settings !== 'undefined' && oai_settings.preset_settings_openai) {
        return oai_settings.preset_settings_openai;
    }
    // 嘗試從 DOM 獲取
    const select = document.querySelector('#settings_preset_openai');
    if (select) {
        const selected = select.querySelector(':checked');
        if (selected) return selected.textContent.trim();
    }
    // 降級：返回 'default'
    return 'default';
}

// 生成帶 preset 的 storage key
export function getStorageKey(key) {
    const presetName = getCurrentPresetName();
    return `${config.storagePrefix}${presetName}_${key}`;
}

// 從 localStorage 讀取（帶 preset）
// 注意：這個函數不能使用 log()，因為 state 還沒初始化
function loadFromStorage(key, defaultValue) {
    const storageKey = getStorageKey(key);
    const value = localStorage.getItem(storageKey);
    return value !== null ? value : defaultValue;
}

// --- 狀態 ---
export let state = {
    // 從 LocalStorage 讀取設定，沒讀到就用預設值
    openGroups: JSON.parse(loadFromStorage(config.storageKeys.openStates, '{}')),
    isEnabled: loadFromStorage(config.storageKeys.featureEnabled, 'true') !== 'false',
    customDividers: JSON.parse(loadFromStorage(config.storageKeys.customDividers, null)) || config.defaultDividers,
    foldingMode: loadFromStorage(config.storageKeys.foldingMode, 'manual'),
    debugMode: loadFromStorage(config.storageKeys.debugMode, 'false') === 'true',
    manualHeaders: new Set(JSON.parse(loadFromStorage(config.storageKeys.manualHeaders, '[]'))),
    originalNames: new Map(JSON.parse(loadFromStorage(config.storageKeys.originalNames, '[]'))),

    // Runtime 狀態
    isProcessing: false,
    observers: new WeakMap(),
    groupHierarchy: {},    // key: groupKey, value: [childId...]
    groupHeaderStatus: {}, // key: groupKey, value: boolean
    isSelectingHeaders: false,
    currentPreset: getCurrentPresetName(), // 記錄當前 preset
};

// 初始化 Regex
export let dividerRegex = buildDividerRegex();

// 建立分隔線 Regex (特殊字元自動跳脫)
export function buildDividerRegex() {
    const patterns = state.customDividers.map(p => p.replace(/[.*+?^${}()|[\\]/g, '\\$&'));
    return new RegExp(`^(${patterns.join('|')})`, 'i');
}

// Debug log 函式
export function log(...args) {
    if (state.debugMode) {
        console.log('[PF]', ...args);
    }
}

// 存設定並更新 Regex（帶 preset）
export function saveCustomSettings() {
    localStorage.setItem(getStorageKey(config.storageKeys.customDividers), JSON.stringify(state.customDividers));
    localStorage.setItem(getStorageKey(config.storageKeys.foldingMode), state.foldingMode);
    localStorage.setItem(getStorageKey(config.storageKeys.debugMode), state.debugMode);
    localStorage.setItem(getStorageKey(config.storageKeys.manualHeaders), JSON.stringify([...state.manualHeaders]));
    localStorage.setItem(getStorageKey(config.storageKeys.originalNames), JSON.stringify([...state.originalNames]));
    dividerRegex = buildDividerRegex();
    log('Settings saved for preset:', getCurrentPresetName());
}

// 重新載入設定（當 preset 切換時調用）
export function reloadSettings() {
    const newPreset = getCurrentPresetName();
    log('Reloading settings for preset:', newPreset);

    state.openGroups = JSON.parse(loadFromStorage(config.storageKeys.openStates, '{}'));
    state.isEnabled = loadFromStorage(config.storageKeys.featureEnabled, 'true') !== 'false';
    state.customDividers = JSON.parse(loadFromStorage(config.storageKeys.customDividers, null)) || config.defaultDividers;
    state.foldingMode = loadFromStorage(config.storageKeys.foldingMode, 'manual');
    state.debugMode = loadFromStorage(config.storageKeys.debugMode, 'false') === 'true';
    state.manualHeaders = new Set(JSON.parse(loadFromStorage(config.storageKeys.manualHeaders, '[]')));
    state.originalNames = new Map(JSON.parse(loadFromStorage(config.storageKeys.originalNames, '[]')));
    state.currentPreset = newPreset;

    dividerRegex = buildDividerRegex();
}
