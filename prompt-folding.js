import { config, state, dividerRegex } from './state.js';

/**
 * 判斷 LI 是不是標題
 * @returns headerInfo object or null
 */
function getGroupHeaderInfo(promptItem) {
  const link = promptItem.querySelector(config.selectors.promptLink);
  if (!link) return null;

  const originalName = link.textContent.trim();
  // 記錄原始名稱，避免重複處理時名字壞掉
  if (!promptItem.dataset.originalName) promptItem.dataset.originalName = originalName;

  // 用 ID 當 Key
  const createInfo = (name) => ({ originalName: name, stableKey: promptItem.dataset.pmIdentifier });

  return dividerRegex.test(originalName) ? createInfo(originalName) : null;
}

/**
 * [Helper] 建立群組的 DOM 結構
 */
function createGroupDOM(headerItem, headerInfo, contentItems) {
    const groupKey = headerInfo.stableKey;
    
    // 1. 記錄狀態
    const childIds = contentItems.map(item => item.dataset.pmIdentifier).filter(Boolean);
    state.groupHierarchy[groupKey] = childIds;
    state.groupHeaderStatus[groupKey] = !headerItem.classList.contains('completion_prompt_manager_prompt_disabled');

    // 2. 標記標題 Item
    headerItem.classList.add(config.classNames.isGroupHeader);
    const link = headerItem.querySelector(config.selectors.promptLink);
    if (link) {
        link.textContent = headerInfo.originalName;
        // 綁定點擊：只點文字才開關
        link.onclick = (e) => {
            e.preventDefault(); 
            e.stopPropagation();
            details.open = !details.open;
        };
    }

    // 3. 建立容器
    const details = document.createElement('details');
    details.className = config.classNames.group;
    details.open = state.openGroups[groupKey] !== false; // 預設開啟
    details.dataset.groupKey = groupKey;

    // 4. 建立 Summary (標題列)
    const summary = document.createElement('summary');
    summary.onclick = (e) => e.preventDefault(); // 擋掉預設行為，由上面 link 控制
    summary.appendChild(headerItem);
    details.appendChild(summary);

    // 5. 建立內容區
    const contentDiv = document.createElement('div');
    contentDiv.className = config.classNames.groupContent;
    contentItems.forEach(item => contentDiv.appendChild(item));
    details.appendChild(contentDiv);

    // 6. 監聽開關狀態
    details.ontoggle = () => {
        state.openGroups[groupKey] = details.open;
        localStorage.setItem(config.storageKeys.openStates, JSON.stringify(state.openGroups));
    };

    return details;
}

/**
 * 主函式：重建列表
 */
export function buildCollapsibleGroups(listContainer) {
  // 強制同步最新的開關狀態
  state.openGroups = JSON.parse(localStorage.getItem(config.storageKeys.openStates) || '{}');

  if (!listContainer || state.isProcessing) return;
  state.isProcessing = true;

  try {
    // 1. 先把所有項目拿出來，還原成乾淨的狀態
    const allItems = Array.from(listContainer.querySelectorAll(config.selectors.promptListItem));
    
    allItems.forEach(item => {
      item.classList.remove(config.classNames.isGroupHeader);
      // 還原名稱
      if (item.dataset.originalName) {
        const link = item.querySelector(config.selectors.promptLink);
        if (link) link.textContent = item.dataset.originalName;
      }
    });

    // 2. 清空並重置狀態
    listContainer.innerHTML = '';
    state.groupHierarchy = {};
    state.groupHeaderStatus = {};

    // 3. 沒啟用就直接塞回去
    if (!state.isEnabled) {
      allItems.forEach(item => listContainer.appendChild(item));
      return; 
    }

    // --- 標準模式 (遇到標題就切分) ---
    const buildStandardGroups = () => {
      let buffer = [];
      let currentHeader = null;
      let currentHeaderInfo = null;

      const flushBuffer = () => {
        if (currentHeader) {
            listContainer.appendChild(createGroupDOM(currentHeader, currentHeaderInfo, buffer));
        } else {
            buffer.forEach(i => listContainer.appendChild(i)); // 沒標題的孤兒
        }
        buffer = [];
      };

      allItems.forEach(item => {
        const info = getGroupHeaderInfo(item);
        if (info) {
          flushBuffer(); // 把上一組結算掉
          currentHeader = item;
          currentHeaderInfo = info;
        } else {
          buffer.push(item);
        }
      });
      flushBuffer(); // 結算最後一組
    };

    // --- 包覆模式 (A...A 為一組) ---
    const buildSandwichGroups = () => {
      let remaining = [...allItems];

      while (remaining.length > 0) {
        const current = remaining.shift();
        const info = getGroupHeaderInfo(current);

        if (!info) {
          listContainer.appendChild(current); // 不是標題，直接放
          continue;
        }

        // 找配對的結束標題
        const closerIdx = remaining.findIndex(item => {
            const otherInfo = getGroupHeaderInfo(item);
            return otherInfo && otherInfo.originalName === info.originalName;
        });

        if (closerIdx !== -1) {
          // 抓出中間這整包 (含結束標題)
          const groupContent = remaining.splice(0, closerIdx + 1); 
          listContainer.appendChild(createGroupDOM(current, info, groupContent));
        } else {
          listContainer.appendChild(current); // 找不到另一半，當孤兒
        }
      }
    };

    state.foldingMode === 'sandwich' ? buildSandwichGroups() : buildStandardGroups();
    
    // 補上禁用樣式
    applyGroupDisabledStyles(listContainer);

  } catch (err) {
    console.error('[PF] Oops, 分組壞了:', err);
  } finally {
    state.isProcessing = false;
  }
}

/**
 * 全收合/展開
 */
export function toggleAllGroups(listContainer, shouldOpen) {
  const details = listContainer.querySelectorAll(`.${config.classNames.group}`);
  details.forEach(el => el.open = shouldOpen);
  // 狀態就不一個個存了，下次重建時會自動更新
}

/**
 * 根據群組標頭的啟用狀態，為子項目應用或移除灰度樣式
 */
function applyGroupDisabledStyles(listContainer) {
    // 掃描所有群組，依據 Header 狀態對內容加 class
    listContainer.querySelectorAll(`.${config.classNames.group}`).forEach(group => {
        const key = group.dataset.groupKey;
        if (!key) return;
        
        const isDisabled = state.groupHeaderStatus[key] === false;
        const contentItems = group.querySelectorAll(`.${config.classNames.groupContent} > li`);
        
        contentItems.forEach(item => {
            item.classList.toggle('prompt-controlled-by-disabled-group', isDisabled);
        });
    });
}