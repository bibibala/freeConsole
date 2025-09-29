// background.js
// 管理扩展的生命周期和标签页状态

let activeTabId = null;
let panelStates = new Map(); // 存储每个标签页的面板状态

chrome.runtime.onInstalled.addListener((details) => {
    console.log("Hover Console extension installed:", details.reason);
});

chrome.runtime.onSuspend.addListener(() => {
    console.log("Hover Console extension suspended");
});

// 监听标签页激活变化
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const previousTabId = activeTabId;
    activeTabId = activeInfo.tabId;

    // 隐藏之前标签页的面板
    if (previousTabId && previousTabId !== activeTabId) {
        try {
            await chrome.tabs.sendMessage(previousTabId, {
                type: "HIDE_PANEL",
            });
            console.log(`隐藏标签页 ${previousTabId} 的面板`);
        } catch (error) {
            // 如果发送失败，说明该标签页没有 content script 或已关闭
            console.log(`标签页 ${previousTabId} 无法接收消息或已关闭`);
        }
    }

    // 不再在切换到新标签页时自动显示面板，避免用户已关闭时被强行打开
    // 如需显示请用户点击扩展图标或使用快捷键
});

// 监听标签页关闭
chrome.tabs.onRemoved.addListener((tabId) => {
    panelStates.delete(tabId);
    if (tabId === activeTabId) {
        activeTabId = null;
    }
});

// 监听标签页更新（导航到新页面）
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "loading" && tabId === activeTabId) {
        // 页面正在加载，暂时不显示面板
        console.log(`标签页 ${tabId} 正在加载新页面`);
    }
});

// 处理扩展图标点击事件
chrome.action.onClicked.addListener(async (tab) => {
    const tabId = tab.id;
    if (!tabId) return;
    try {
        const resp = await chrome.tabs.sendMessage(tabId, {
            type: "TOGGLE_PANEL",
        });
        console.log(`切换标签页 ${tabId} 面板，可见: ${resp?.visible}`);
    } catch (error) {
        // 如果 content script 尚未注入，先 ping 一次 SHOW_PANEL，再次切换
        try {
            await chrome.tabs.sendMessage(tabId, { type: "SHOW_PANEL" });
            await chrome.tabs.sendMessage(tabId, { type: "TOGGLE_PANEL" });
        } catch (e) {
            console.log(`标签页 ${tabId} 无法接收消息`);
        }
    }
});

// 处理来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const tabId = sender.tab?.id;

    switch (message.type) {
        case "CLEAR_LOGS":
            chrome.storage.local.set({ logs: [] }, () => {
                sendResponse({ success: true });
            });
            return true;

        case "PANEL_READY":
            // content script 已准备好，仅记录状态，不自动要求显示面板
            if (tabId) {
                panelStates.set(tabId, {
                    ready: true,
                    // 不依据是否为活动标签页来决定显示
                    visible: undefined,
                });
                sendResponse({ showPanel: false });
            }
            return true;

        case "GET_ACTIVE_TAB":
            // 查询当前活动标签页
            sendResponse({ activeTabId: activeTabId });
            return true;

        default:
            sendResponse({ error: "Unknown message type" });
            return true;
    }
});
