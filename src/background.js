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

    // 显示当前标签页的面板
    try {
        await chrome.tabs.sendMessage(activeTabId, {
            type: "SHOW_PANEL",
        });
        console.log(`显示标签页 ${activeTabId} 的面板`);
    } catch (error) {
        console.log(`标签页 ${activeTabId} 还没有加载 content script`);
    }
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
        // 获取当前标签页的面板状态
        const currentState = panelStates.get(tabId);
        const isVisible = currentState?.visible;

        if (isVisible) {
            // 如果面板可见，则隐藏它
            await chrome.tabs.sendMessage(tabId, {
                type: "HIDE_PANEL",
            });

            // 更新状态
            panelStates.set(tabId, {
                ...currentState,
                visible: false,
            });

            console.log(`隐藏标签页 ${tabId} 的面板`);
        } else {
            // 如果面板不可见，则显示它
            await chrome.tabs.sendMessage(tabId, {
                type: "SHOW_PANEL",
            });

            // 更新状态
            panelStates.set(tabId, {
                ...currentState,
                visible: true,
            });

            console.log(`显示标签页 ${tabId} 的面板`);
        }
    } catch (error) {
        // 如果发送失败，说明该标签页还没有 content script
        console.log(`标签页 ${tabId} 还没有加载 content script，尝试显示面板`);

        try {
            // 尝试显示面板
            await chrome.tabs.sendMessage(tabId, {
                type: "SHOW_PANEL",
            });

            // 设置状态
            panelStates.set(tabId, {
                ready: true,
                visible: true,
            });
        } catch (retryError) {
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
            // content script 已准备好
            if (tabId) {
                panelStates.set(tabId, {
                    ready: true,
                    visible: tabId === activeTabId,
                });

                // 如果是当前活动标签页，显示面板
                if (tabId === activeTabId) {
                    sendResponse({ showPanel: true });
                } else {
                    sendResponse({ showPanel: false });
                }
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
