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
    // CSS class 名稱
    classNames: {
        group: 'mingyu-prompt-group',
        groupContent: 'mingyu-prompt-group-content',
        isGroupHeader: 'is-group-header', // 加到作為標題的 li 元素上
    },
    // 預設的分組標示
    defaultDividers: ['=', '-'],
};

// 獲取當前 preset 名稱（從 DOM，不依賴全域 oai_settings）
export function getCurrentPresetName() {
    const select = document.querySelector('#settings_preset_openai');
    if (select) {
        const selected = select.querySelector(':checked');
        if (selected) return selected.textContent.trim();
    }
    return 'default';
}

// --- 狀態（初始為預設值，實際資料由 loadFromPreset 填入）---
export let state = {
    openGroups: {},
    isEnabled: true,
    customDividers: [...config.defaultDividers],
    foldingMode: 'manual',
    debugMode: false,
    manualHeaders: new Set(),
    originalNames: new Map(), // runtime-only cache，不寫入 preset

    // Runtime 狀態
    isProcessing: false,
    observers: new WeakMap(),
    groupHierarchy: {},
    groupHeaderStatus: {},
    isSelectingHeaders: false,
};

// 初始化 Regex
export let dividerRegex = buildDividerRegex();

// 建立分隔線 Regex (特殊字元自動跳脫)
export function buildDividerRegex() {
    const patterns = state.customDividers.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`^(${patterns.join('|')})`, 'i');
}

// Debug log 函式
export function log(...args) {
    if (state.debugMode) {
        console.log('[PF]', ...args);
    }
}

// --- savePreset fn cache（從 OAI_PRESET_CHANGED_BEFORE 事件取得）---
let _cachedSavePreset = null;

export function setCachedSavePreset(fn) {
    _cachedSavePreset = fn;
}

// --- 從 preset extensions 載入 state ---
export function loadFromPreset(pfData) {
    console.log('[PF] loadFromPreset called with:', JSON.stringify(pfData));
    // manualHeaders 支援純 UUID 陣列（新格式）或 {uuid,name} 物件陣列（舊格式）
    const rawHeaders = pfData?.manualHeaders ?? [];
    const uuids = rawHeaders.map(h => (typeof h === 'string' ? h : h?.uuid)).filter(Boolean);

    state.openGroups     = pfData?.openStates     ?? {};
    state.isEnabled      = pfData?.featureEnabled  ?? true;
    state.customDividers = pfData?.customDividers  ?? [...config.defaultDividers];
    state.foldingMode    = pfData?.foldingMode     ?? 'manual';
    state.debugMode      = pfData?.debugMode       ?? false;
    state.manualHeaders  = new Set(uuids);
    // originalNames 不從 preset 讀取，保持 runtime cache（由 prompt-folding.js 即時填入）
    state.originalNames  = new Map();

    dividerRegex = buildDividerRegex();
    log('loadFromPreset:', pfData ? `mode=${state.foldingMode}, headers=${uuids.length}` : 'no data, using defaults');
}

// --- 正規化任意格式的 pfData 為新格式（清除 version/sourcePreset，統一 manualHeaders 為純 UUID）---
function normalizePfData(pfData) {
    if (!pfData) return null;
    const rawHeaders = pfData.manualHeaders ?? [];
    const uuids = rawHeaders.map(h => (typeof h === 'string' ? h : h?.uuid)).filter(Boolean);
    return {
        openStates:     pfData.openStates     ?? {},
        featureEnabled: pfData.featureEnabled  ?? true,
        foldingMode:    pfData.foldingMode     ?? 'manual',
        customDividers: pfData.customDividers  ?? [...config.defaultDividers],
        debugMode:      pfData.debugMode       ?? false,
        manualHeaders:  uuids,
    };
}

// --- 序列化 state 為可存進 preset 的格式 ---
export function getStateForSave() {
    return {
        openStates:     state.openGroups,
        featureEnabled: state.isEnabled,
        foldingMode:    state.foldingMode,
        customDividers: state.customDividers,
        debugMode:      state.debugMode,
        manualHeaders:  [...state.manualHeaders], // 純 UUID 陣列
    };
}

// --- 存到 preset JSON ---
export async function saveToPreset() {
    try {
        const [
            { oai_settings, openai_settings: oaiSettingsArr, openai_setting_names },
            { getRequestHeaders },
        ] = await Promise.all([
            import('../../../../scripts/openai.js'),
            import('../../../../script.js'),
        ]);

        const pfData = getStateForSave();

        // 同步寫入 oai_settings（runtime）
        oai_settings.extensions = oai_settings.extensions || {};
        oai_settings.extensions.prompt_folding = pfData;

        // 同步寫入 openai_settings[idx]（in-memory preset 原始物件），確保兩處一致
        const name = oai_settings.preset_settings_openai || getCurrentPresetName();
        const idx = openai_setting_names[name];
        if (idx !== undefined) {
            oaiSettingsArr[idx].extensions = oaiSettingsArr[idx].extensions || {};
            oaiSettingsArr[idx].extensions.prompt_folding = pfData;
        }

        console.log('[PF] saveToPreset — preset:', name, '| data:', JSON.stringify(pfData));

        if (_cachedSavePreset) {
            console.log('[PF] saveToPreset: using cachedSavePreset');
            await _cachedSavePreset(name, oai_settings, false);
            console.log('[PF] saveToPreset: done');
        } else {
            console.log('[PF] saveToPreset: using fallback fetch');
            if (idx === undefined) {
                console.error('[PF] saveToPreset fallback: preset not found in memory:', name);
                return;
            }
            const res = await fetch('/api/presets/save', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ apiId: 'openai', name, preset: oaiSettingsArr[idx] }),
            });
            const resBody = await res.text();
            console.log('[PF] fallback: status=', res.status, 'body=', resBody);
            if (!res.ok) {
                console.error('[PF] saveToPreset fallback: server returned', res.status, res.statusText);
                return;
            }
        }
        log('Saved to preset:', name);
    } catch (err) {
        console.error('[PF] saveToPreset failed:', err);
    }
}

// saveCustomSettings：向下相容，呼叫 saveToPreset（fire-and-forget）
export function saveCustomSettings() {
    saveToPreset().catch(err => console.error('[PF] Save failed:', err));
}

// --- 從 in-memory preset 讀取 folding data（頁面載入時用）---
export async function getCurrentPresetFoldingData() {
    try {
        const { oai_settings, openai_settings, openai_setting_names } = await import('../../../../scripts/openai.js');
        const name = oai_settings.preset_settings_openai || getCurrentPresetName();
        const idx = openai_setting_names[name];
        if (idx === undefined) return null;
        return openai_settings[idx]?.extensions?.prompt_folding ?? null;
    } catch (err) {
        console.error('[PF] getCurrentPresetFoldingData failed:', err);
        return null;
    }
}

// --- 列出所有 preset 名稱（從 DOM dropdown）---
export function getAllPresetNames() {
    return Array.from(
        document.querySelectorAll('#settings_preset_openai option'),
    ).map(opt => opt.textContent.trim()).filter(Boolean);
}

// --- 取得指定 preset 的 folding config（供 copy 功能用）---
// 回傳值永遠是新格式（等同 getStateForSave 結構），舊格式會經 loadFromPreset 正規化
export async function exportConfigFromPreset(presetName) {
    const currentName = getCurrentPresetName();

    // 當前 preset：直接從 runtime state 取（已是新格式）
    if (presetName === currentName) {
        return getStateForSave();
    }

    // 其他 preset：從 in-memory 讀取，經 normalizePfData 正規化
    try {
        const { openai_settings, openai_setting_names } = await import('../../../../scripts/openai.js');
        const idx        = openai_setting_names[presetName];
        const presetData = openai_settings?.[idx];
        const pfData     = presetData?.extensions?.prompt_folding;
        return pfData ? normalizePfData(pfData) : null;
    } catch (err) {
        console.error('[PF] exportConfigFromPreset failed:', err);
        return null;
    }
}

// --- 將來源 preset 的設定套用到當前 preset（UUID 匹配）---
export async function importConfigToCurrentPreset(configData, currentPromptItems) {
    log('Importing config from another preset to', getCurrentPresetName());

    // 先正規化再載入（configData 已經過 exportConfigFromPreset 正規化，但防禦性處理）
    const normalized = normalizePfData(configData);
    loadFromPreset(normalized);

    // manualHeaders UUID 匹配：只保留當前 preset 中存在的
    const currentUuids = new Set(
        currentPromptItems.map(item => item.dataset.pmIdentifier).filter(Boolean),
    );

    const matched = [];
    const failed  = [];
    state.manualHeaders.forEach(uuid => {
        if (currentUuids.has(uuid)) {
            matched.push(uuid);
        } else {
            failed.push(uuid);
        }
    });

    state.manualHeaders = new Set(matched);

    await saveToPreset();

    log('Import completed: matched', matched.length, 'failed', failed.length);
    return { byUuid: matched.length, failed };
}
