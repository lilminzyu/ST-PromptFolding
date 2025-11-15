import { config, state, dividerRegex } from './state.js';

/**
 * 分析一個提示詞 LI 元素，判斷它是否為分組標題
 * @param {HTMLElement} promptItem - 提示詞的 LI 元素
 * @returns {object|null} 如果是標題，回傳標題資訊；否則回傳 null
 */
function getGroupHeaderInfo(promptItem) {
  const linkElement = promptItem.querySelector(config.selectors.promptLink);
  if (!linkElement) return null;

  const originalName = linkElement.textContent.trim();

  // 確保每個項目都有 originalName，即使不是標題
  if (!promptItem.dataset.originalName) {
    promptItem.dataset.originalName = originalName;
  }

  const match = dividerRegex.exec(originalName);
  if (match) {
    return {
      originalName: originalName, // 原始的完整名稱
      stableKey: originalName, // 穩定的 key，用於儲存狀態
    };
  }
  return null;
}

/**
 * 核心函式：將提示詞列表整理成可摺疊的群組
 * @param {HTMLElement} listContainer - 提示詞列表的 UL 容器
 */
export function buildCollapsibleGroups(listContainer) {
  // 強制從 localStorage 同步最新的開合狀態，確保狀態不會因UI重建而丟失
  state.openGroups = JSON.parse(
    localStorage.getItem(config.storageKeys.openStates) || '{}'
  );

  if (!listContainer || state.isProcessing) return;

  state.isProcessing = true;

  try {
    // 1. 還原所有項目的原始狀態並備份
    const allItems = Array.from(
      listContainer.querySelectorAll(config.selectors.promptListItem)
    );
    const currentHeaders = [];

    allItems.forEach((item) => {
      item.classList.remove(config.classNames.isGroupHeader);
      const link = item.querySelector(config.selectors.promptLink);

      // 確保 originalName 存在再還原
      if (link) {
        if (!item.dataset.originalName) {
          item.dataset.originalName = link.textContent.trim();
        } else {
          link.textContent = item.dataset.originalName;
        }
      }

      // 收集當前的標題資訊
      const headerInfo = getGroupHeaderInfo(item);
      if (headerInfo) {
        currentHeaders.push(headerInfo);
      }
    });

    // 3. 清空容器
    listContainer.innerHTML = '';
    state.groupHierarchy = {};
    state.groupHeaderStatus = {};
    state.groupKeyToHeaderId = {};

    // 4. 根據功能是否啟用，決定如何重建列表
    if (!state.isEnabled) {
      allItems.forEach((item) => listContainer.appendChild(item));
    } else {
      // --- 標準模式邏輯 ---
      const buildStandardGroups = () => {
        let currentGroupContent = null;
        let currentGroupKey = null; // 追蹤當前的群組 Key

        allItems.forEach((item) => {
          const headerInfo = getGroupHeaderInfo(item);
          if (headerInfo) {
            // 是標題，建立一個新的 <details> 群組
            currentGroupKey = headerInfo.stableKey; // 更新當前的群組 Key
            const groupKey = headerInfo.stableKey;
            const headerId = item.dataset.pmIdentifier;

            // 填充狀態物件
            state.groupHierarchy[groupKey] = [];
            state.groupKeyToHeaderId[groupKey] = headerId;
            // 透過檢查 class 來判斷標頭當前的啟用狀態
            const isEnabled = !item.classList.contains('completion_prompt_manager_prompt_disabled');
            state.groupHeaderStatus[groupKey] = isEnabled;

            item.classList.add(config.classNames.isGroupHeader);
            const details = document.createElement('details');
            details.className = config.classNames.group;
            details.open = state.openGroups[headerInfo.stableKey] !== false; // 預設展開
            details.dataset.groupKey = headerInfo.stableKey;
            const summary = document.createElement('summary');
            const link = item.querySelector(config.selectors.promptLink);
            if (link) {
              link.textContent = headerInfo.originalName;
              // 讓只有文字可以點擊
              link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                details.open = !details.open;
              });
            }
            // 防止點擊 summary 的其他地方導致開合
            summary.addEventListener('click', (e) => e.preventDefault());
            summary.appendChild(item);
            details.appendChild(summary);
            currentGroupContent = document.createElement('div');
            currentGroupContent.className = config.classNames.groupContent;
            details.appendChild(currentGroupContent);
            details.addEventListener('toggle', () => {
              state.openGroups[headerInfo.stableKey] = details.open;
              localStorage.setItem(
                config.storageKeys.openStates,
                JSON.stringify(state.openGroups)
              );
            });
            listContainer.appendChild(details);
          } else if (currentGroupContent) {

            // 這是子條目
            const childId = item.dataset.pmIdentifier;
            // 將子項目 ID 加入當前群組的 hierarchy 中
            if (currentGroupKey) {
                state.groupHierarchy[currentGroupKey].push(childId);
            }
            
            // 是普通項目，且前面有群組，就放進去
            currentGroupContent.appendChild(item);
          } else {
            // 是普通項目，但前面沒有群組，直接放在最外層
            listContainer.appendChild(item);
          }
        });
      };

      // --- 包覆模式邏輯 ---
      const buildSandwichGroups = () => {
        let itemsToProcess = [...allItems];
        const nodesToAdd = [];

        while (itemsToProcess.length > 0) {
          const currentItem = itemsToProcess.shift();
          const headerInfo = getGroupHeaderInfo(currentItem);

          if (!headerInfo) {
            nodesToAdd.push(currentItem);
            continue;
          }

          // 这是一個標頭，尋找配對的結束標頭
          const closingHeaderIndex = itemsToProcess.findIndex((item) => {
            const otherHeader = getGroupHeaderInfo(item);
            return (
              otherHeader && otherHeader.stableKey === headerInfo.stableKey
            );
          });

          if (closingHeaderIndex !== -1) {
            // 要摺疊的內容包含從開始到結束的所有項目(包含結束標頭)。
            const contentItems = itemsToProcess.splice(
              0,
              closingHeaderIndex + 1
            );

            currentItem.classList.add(config.classNames.isGroupHeader);
            const details = document.createElement('details');
            details.className = config.classNames.group;
            details.open = state.openGroups[headerInfo.stableKey] !== false;
            details.dataset.groupKey = headerInfo.stableKey;

            const summary = document.createElement('summary');
            const link = currentItem.querySelector(config.selectors.promptLink);
            if (link) {
              link.textContent = headerInfo.originalName;
              // 讓只有文字可以點擊
              link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                details.open = !details.open;
              });
            }
            // 防止點擊 summary 的其他地方導致開合
            summary.addEventListener('click', (e) => e.preventDefault());

            summary.appendChild(currentItem);
            details.appendChild(summary);

            const groupContent = document.createElement('div');
            groupContent.className = config.classNames.groupContent;
            contentItems.forEach((contentItem) =>
              groupContent.appendChild(contentItem)
            );
            details.appendChild(groupContent);

            details.addEventListener('toggle', () => {
              state.openGroups[headerInfo.stableKey] = details.open;
              localStorage.setItem(
                config.storageKeys.openStates,
                JSON.stringify(state.openGroups)
              );
            });

            nodesToAdd.push(details);
          } else {
            // 找不到配對的結束標頭，當作一般項目處理
            nodesToAdd.push(currentItem);
          }
        }
        nodesToAdd.forEach((node) => listContainer.appendChild(node));
      };

      if (state.foldingMode === 'sandwich') {
        buildSandwichGroups();
      } else {
        buildStandardGroups();
      }
    }
    applyGroupDisabledStyles(listContainer);
  } catch (error) {
    console.error('[PF] 分組過程發生錯誤:', error);
  } finally {
    state.isProcessing = false;
  }
}

/**
 * 展開或收合所有群組
 * @param {HTMLElement} listContainer
 * @param {boolean} shouldOpen - true 展開，false 收合
 */
export function toggleAllGroups(listContainer, shouldOpen) {
  const allGroups = listContainer.querySelectorAll(
    `.${config.classNames.group}`
  );
  if (!allGroups.length) return;

  allGroups.forEach((details) => {
    details.open = shouldOpen;
    const groupKey = details.dataset.groupKey;
    if (groupKey) state.openGroups[groupKey] = shouldOpen;
  });

  localStorage.setItem(
    config.storageKeys.openStates,
    JSON.stringify(state.openGroups)
  );
}

/**
 * 根據群組標頭的啟用狀態，為子項目應用或移除灰度樣式
 * @param {HTMLElement} listContainer 
 */
function applyGroupDisabledStyles(listContainer) {
    const allGroups = listContainer.querySelectorAll(`.${config.classNames.group}`);
    allGroups.forEach(details => {
        const groupKey = details.dataset.groupKey;
        if (!groupKey) return;

        const headerIsEnabled = state.groupHeaderStatus[groupKey];

        const contentItems = details.querySelectorAll(`.${config.classNames.groupContent} > li.completion_prompt_manager_prompt`);
        
        contentItems.forEach(item => {
            if (headerIsEnabled === false) {
                item.classList.add('prompt-controlled-by-disabled-group');
            } else {
                item.classList.remove('prompt-controlled-by-disabled-group');
            }
        });
    });
}