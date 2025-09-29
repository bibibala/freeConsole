// CSP 安全版本 - 不使用内联脚本注入
(function () {
    "use strict";

    // 确保只在顶级窗口中运行，避免在 iframe 中重复
    if (window !== window.top) {
        console.log("在 iframe 中跳过加载");
        return;
    }

    let panel;
    let logs = [];
    let filteredLogs = [];
    let currentFilter = "all";
    let originalConsole = {};
    let isInitializing = false; // 防止重复初始化
    let hasInitialized = false; // 标记是否已经初始化
    let isPanelClosed = false; // 标记面板是否被用户关闭
    let renderTimeout = null; // 日志渲染防抖定时器
    let saveTimeout = null; // 日志保存防抖定时器

    // console.log('🚀');

    // 获取主题样式
    function getThemeStyles() {
        // 检测系统主题偏好
        const prefersDark =
            window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches;

        const themes = {
            dark: {
                bg: "rgba(28, 28, 32, 0.95)",
                text: "#f0f0f5",
                border: "rgba(255, 255, 255, 0.08)",
                headerBg: "rgba(38, 38, 42, 0.8)",
                headerBorder: "rgba(255, 255, 255, 0.1)",
                buttonBg: "rgba(255, 255, 255, 0.06)",
                buttonBorder: "rgba(255, 255, 255, 0.12)",
                buttonText: "#f0f0f5",
                buttonHoverBg: "rgba(255, 255, 255, 0.1)",
                timestamp: "rgba(255, 255, 255, 0.5)",
                levelLog: "#34d399",
                levelError: "#f87171",
                levelWarn: "#fbbf24",
                levelInfo: "#60a5fa",
                levelDebug: "#9ca3af",
                levelSystem: "#34d399",
                shadow: "0 10px 40px rgba(0, 0, 0, 0.4)",
                scrollbar: "rgba(255, 255, 255, 0.2)",
            },
            light: {
                bg: "rgba(255, 255, 255, 0.95)",
                text: "#1f2937",
                border: "rgba(0, 0, 0, 0.06)",
                headerBg: "rgba(249, 250, 251, 0.9)",
                headerBorder: "rgba(0, 0, 0, 0.08)",
                buttonBg: "rgba(255, 255, 255, 0.8)",
                buttonBorder: "rgba(0, 0, 0, 0.1)",
                buttonText: "#374151",
                buttonHoverBg: "rgba(243, 244, 246, 0.8)",
                timestamp: "#6b7280",
                levelLog: "#059669",
                levelError: "#dc2626",
                levelWarn: "#d97706",
                levelInfo: "#2563eb",
                levelDebug: "#6b7280",
                levelSystem: "#059669",
                shadow: "0 10px 40px rgba(0, 0, 0, 0.12)",
                scrollbar: "rgba(0, 0, 0, 0.15)",
            },
        };

        return prefersDark ? themes.dark : themes.light;
    }

    // 恢复面板位置
    function restorePanelPosition() {
        return new Promise((resolve) => {
            chrome.storage.local.get("panelPosition", (result) => {
                if (result.panelPosition) {
                    resolve(result.panelPosition);
                } else {
                    resolve(null);
                }
            });
        });
    }

    // 恢复面板关闭状态
    function restorePanelClosedState() {
        return new Promise((resolve) => {
            chrome.storage.local.get("panelClosed", (result) => {
                isPanelClosed = result.panelClosed || false;
                resolve(isPanelClosed);
            });
        });
    }

    // 创建悬浮面板
    async function createPanel() {
        if (panel) {
            // console.log('面板已存在，返回现有面板');
            return panel;
        }

        // 检查是否已经有其他面板存在（防止重复创建）
        const existingPanel = document.getElementById("hover-console-panel");
        if (existingPanel) {
            // console.log('检测到已存在的面板，跳过创建');
            panel = existingPanel;
            return panel;
        }

        const theme = getThemeStyles();
        const savedPosition = await restorePanelPosition();

        panel = document.createElement("div");
        panel.id = "hover-console-panel"; // 添加唯一ID用于识别

        // 设置初始位置样式
        let positionStyles = "";
        if (savedPosition) {
            // 使用保存的位置
            positionStyles = `
                position: fixed;
                left: ${savedPosition.left}px;
                top: ${savedPosition.top}px;
                transform: none;
            `;
        } else {
            // 使用默认位置
            positionStyles = `
                position: fixed;
                bottom: 20px;
                right: 20px;
            `;
        }

        panel.style.cssText = `
            ${positionStyles}
            width: 500px;
            height: 350px;
            background: ${theme.bg};
            color: ${theme.text};
            font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Droid Sans Mono', 'Liberation Mono', 'Menlo', 'Courier', monospace;
            will-change: transform;
            transform: translateZ(0);
            backface-visibility: hidden;
            transition: none; /* 拖拽时禁用过渡效果 */
            font-size: 13px;
            border: 1px solid ${theme.border};
            border-radius: 16px;
            z-index: 2147483647;
            overflow: hidden;
            backdrop-filter: blur(20px);
            box-shadow: ${theme.shadow};
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        `;

        panel.innerHTML = `
            <div style="
                padding: 6px 10px;
                background: ${theme.headerBg};
                border-bottom: 1px solid ${theme.headerBorder};
                user-select: none;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-weight: 600;
                    font-size: 13px;
                    cursor: move;
                    margin-bottom: 4px;
                ">
                    <span style="display: flex; align-items: center; gap: 6px;">
                        <span>Free Console</span>
                    </span>
                    <div style="display: flex; gap: 6px;">
                        <button id="hc-clear" style="
                            background: ${theme.buttonBg};
                            color: ${theme.levelError};
                            border: 1px solid ${theme.buttonBorder};
                            padding: 4px 8px;
                            font-size: 10px;
                            cursor: pointer;
                            border-radius: 6px;
                            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                            font-weight: 500;
                            min-width: 40px;
                            height: 24px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            backdrop-filter: blur(10px);
                        " onmouseover="this.style.background='${theme.buttonHoverBg}'; this.style.transform='translateY(-1px)'" onmouseout="this.style.background='${theme.buttonBg}'; this.style.transform='translateY(0)'" title="清空日志">清空</button>
                        <button id="hc-close" style="
                            background: ${theme.buttonBg};
                            color: ${theme.text};
                            border: 1px solid ${theme.buttonBorder};
                            padding: 4px 8px;
                            font-size: 10px;
                            cursor: pointer;
                            border-radius: 6px;
                            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                            font-weight: 500;
                            min-width: 40px;
                            height: 24px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            backdrop-filter: blur(10px);
                        " onmouseover="this.style.background='${theme.buttonHoverBg}'; this.style.transform='translateY(-1px)'" onmouseout="this.style.background='${theme.buttonBg}'; this.style.transform='translateY(0)'" title="关闭面板">关闭</button>
                    </div>
                </div>
                <div style="
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                ">
                    <span style="color: ${theme.timestamp}; font-weight: 500;">显示:</span>
                    <select id="hc-filter" style="
                        background: ${theme.buttonBg};
                        color: ${theme.buttonText};
                        padding: 3px 6px;
                        font-size: 10px;
                        border-radius: 6px;
                        cursor: pointer;
                        outline: none;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        min-width: 80px;
                        border: 1px solid ${theme.buttonBorder};
                        backdrop-filter: blur(10px);
                    ">
                        <option value="all">所有日志</option>
                        <option value="system">系统</option>
                        <option value="error">错误</option>
                        <option value="warn">警告</option>
                        <option value="info">信息</option>
                        <option value="log">日志</option>
                        <option value="debug">调试</option>
                    </select>
                    <span id="hc-counter" style="color: ${theme.timestamp}; font-size: 10px; margin-left: auto;">0 条</span>
                </div>
            </div>
            <div id="hc-logs" style="
                height: calc(100% - 64px);
                overflow-y: auto;
                padding: 6px;
                line-height: 1.6;
                font-family: inherit;
            "></div>
        `;

        // 添加自定义滚动条样式
        const scrollbarStyle = document.createElement("style");
        scrollbarStyle.textContent = `
            #hc-logs::-webkit-scrollbar {
                width: 6px;
            }
            #hc-logs::-webkit-scrollbar-track {
                background: transparent;
            }
            #hc-logs::-webkit-scrollbar-thumb {
                background: ${theme.scrollbar};
                border-radius: 3px;
            }
            #hc-logs::-webkit-scrollbar-thumb:hover {
                background: ${theme.border};
            }
        `;
        document.head.appendChild(scrollbarStyle);

        // 添加到页面
        const target = document.body || document.documentElement;
        if (target) {
            target.appendChild(panel);
            // console.log('📋 悬浮面板已创建，ID:', panel.id);
        } else {
            // console.log('❌ 无法找到目标元素添加面板');
            return null;
        }

        // 绑定事件
        const clearBtn = panel.querySelector("#hc-clear");
        const closeBtn = panel.querySelector("#hc-close");
        const header = panel.querySelector('div[style*="cursor: move"]');

        if (clearBtn) {
            clearBtn.addEventListener("click", () => {
                logs = [];
                filterLogs();
                renderLogs();
                chrome.storage.local.set({ logs: [] });
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener("click", () => {
                // 隐藏面板
                if (panel) {
                    panel.style.display = "none";
                    isPanelClosed = true;
                    // 保存关闭状态到存储
                    chrome.storage.local.set({ panelClosed: true });
                    // console.log('面板已关闭');
                    // console.log('按 Ctrl+Shift+H 重新打开面板');

                    // 显示重新打开提示
                    showReopenHint();
                }
            });
        }

        // 显示重新打开提示
        function showReopenHint() {
            const hint = document.createElement("div");
            hint.id = "hc-reopen-hint";
            hint.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 11px;
                z-index: 2147483646;
                opacity: 0;
                transition: opacity 0.3s ease;
            `;
            hint.textContent = "按 Ctrl+Shift+H 重新打开面板";

            document.body.appendChild(hint);

            // 淡入
            setTimeout(() => {
                hint.style.opacity = "1";
            }, 100);

            // 5秒后淡出并移除
            setTimeout(() => {
                hint.style.opacity = "0";
                setTimeout(() => {
                    if (hint.parentNode) {
                        hint.parentNode.removeChild(hint);
                    }
                }, 300);
            }, 5000);
        }

        // 添加键盘快捷键重新打开面板
        document.addEventListener("keydown", (e) => {
            // Ctrl+Shift+H 重新打开面板
            if (e.ctrlKey && e.shiftKey && e.key === "H") {
                if (panel && panel.style.display === "none") {
                    panel.style.display = "block";
                    isPanelClosed = false;
                    // 清除存储中的关闭状态
                    chrome.storage.local.set({ panelClosed: false });
                    // console.log('面板已重新打开');

                    // 移除重新打开提示（如果存在）
                    const hint = document.getElementById("hc-reopen-hint");
                    if (hint && hint.parentNode) {
                        hint.parentNode.removeChild(hint);
                    }
                }
            }
        });

        // 添加筛选器事件监听
        const filterSelect = panel.querySelector("#hc-filter");
        if (filterSelect) {
            filterSelect.addEventListener("change", (e) => {
                currentFilter = e.target.value;
                filterLogs();
                renderLogs();
            });
        }

        // 添加拖拽功能（改进版，带边界检测和自动吸附）
        if (header) {
            let isDragging = false;
            let startX, startY, initialLeft, initialTop;
            let snapThreshold = 50; // 吸附阈值
            let panelWidth, panelHeight, windowWidth, windowHeight; // 缓存的尺寸变量
            let animationFrameId = null; // 动画帧ID，用于节流

            function dragStart(e) {
                if (e.target !== header) return;

                isDragging = true;
                header.style.cursor = "grabbing";

                // 缓存面板尺寸和窗口尺寸，避免拖拽过程中重复计算
                const rect = panel.getBoundingClientRect();
                panelWidth = rect.width;
                panelHeight = rect.height;
                windowWidth = window.innerWidth;
                windowHeight = window.innerHeight;

                initialLeft = rect.left;
                initialTop = rect.top;

                if (e.type === "touchstart") {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                } else {
                    startX = e.clientX;
                    startY = e.clientY;
                }

                e.preventDefault();
            }

            function dragEnd() {
                if (!isDragging) return;

                isDragging = false;
                header.style.cursor = "move";

                // 清除动画帧
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }

                // 获取当前位置（拖拽结束只需要一次DOM读取）
                const rect = panel.getBoundingClientRect();
                let finalLeft = rect.left;
                let finalTop = rect.top;

                // 自动吸附到边缘（使用缓存的窗口尺寸）
                // 水平吸附（左边缘或右边缘）
                if (rect.left < snapThreshold) {
                    finalLeft = 10; // 吸附到左边缘，留10px边距
                } else if (rect.right > windowWidth - snapThreshold) {
                    finalLeft = windowWidth - panelWidth - 10; // 吸附到右边缘，留10px边距
                }

                // 垂直吸附（上边缘）
                if (rect.top < snapThreshold) {
                    finalTop = 10; // 吸附到上边缘，留10px边距
                }

                // 确保不超出视窗
                finalLeft = Math.max(
                    10,
                    Math.min(finalLeft, windowWidth - panelWidth - 10),
                );
                finalTop = Math.max(
                    10,
                    Math.min(finalTop, windowHeight - panelHeight - 10),
                );

                // 应用最终位置（只更新必要属性）
                panel.style.transition =
                    "left 0.2s cubic-bezier(0.4, 0, 0.2, 1), top 0.2s cubic-bezier(0.4, 0, 0.2, 1)";
                panel.style.left = finalLeft + "px";
                panel.style.top = finalTop + "px";

                // 动画结束后恢复无过渡状态
                setTimeout(() => {
                    panel.style.transition = "none";
                }, 200);

                // 保存位置到存储
                const position = {
                    left: finalLeft,
                    top: finalTop,
                };
                chrome.storage.local.set({ panelPosition: position });
            }

            // 更新拖拽位置的函数（优化版）
            function updateDragPosition(x, y) {
                if (!panel) return;

                const deltaX = x - startX;
                const deltaY = y - startY;

                let newLeft = initialLeft + deltaX;
                let newTop = initialTop + deltaY;

                // 使用缓存的尺寸数据，避免重复DOM读取
                const margin = 10;
                newLeft = Math.max(
                    margin,
                    Math.min(newLeft, windowWidth - panelWidth - margin),
                );
                newTop = Math.max(
                    margin,
                    Math.min(newTop, windowHeight - panelHeight - margin),
                );

                // 只更新必要的样式属性，减少重排
                panel.style.left = newLeft + "px";
                panel.style.top = newTop + "px";
            }

            // 拖拽函数（优化版，使用requestAnimationFrame节流）
            function drag(e) {
                if (!isDragging || !panel) return;

                e.preventDefault();

                const x = e.type.includes("mouse")
                    ? e.clientX
                    : e.touches[0].clientX;
                const y = e.type.includes("mouse")
                    ? e.clientY
                    : e.touches[0].clientY;

                // 使用requestAnimationFrame节流，避免频繁更新
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                }

                animationFrameId = requestAnimationFrame(() => {
                    updateDragPosition(x, y);
                    animationFrameId = null;
                });
            }

            // 窗口大小改变时调整位置（优化版）
            function adjustPositionOnResize() {
                if (!panel) return;

                // 更新缓存的窗口尺寸
                windowWidth = window.innerWidth;
                windowHeight = window.innerHeight;

                const rect = panel.getBoundingClientRect();
                const margin = 10;

                let newLeft =
                    parseFloat(panel.style.left) ||
                    windowWidth - panelWidth - 20;
                let newTop =
                    parseFloat(panel.style.top) ||
                    windowHeight - panelHeight - 20;

                // 确保面板在可视区域内
                newLeft = Math.max(
                    margin,
                    Math.min(newLeft, windowWidth - panelWidth - margin),
                );
                newTop = Math.max(
                    margin,
                    Math.min(newTop, windowHeight - panelHeight - margin),
                );

                panel.style.left = newLeft + "px";
                panel.style.top = newTop + "px";

                // 保存调整后的位置
                const position = {
                    left: newLeft,
                    top: newTop,
                };
                chrome.storage.local.set({ panelPosition: position });
            }

            // 防止重复添加事件监听器
            if (!window.__hoverConsoleDragListenersAdded) {
                header.addEventListener("mousedown", dragStart);
                document.addEventListener("mousemove", drag);
                document.addEventListener("mouseup", dragEnd);

                // 触摸支持
                header.addEventListener("touchstart", dragStart);
                document.addEventListener("touchmove", drag);
                document.addEventListener("touchend", dragEnd);

                window.__hoverConsoleDragListenersAdded = true;
            }

            // 窗口大小改变时重新调整位置
            window.addEventListener("resize", adjustPositionOnResize);
        }

        return panel;
    }

    function filterLogs() {
        if (currentFilter === "all") {
            filteredLogs = [...logs];
        } else {
            filteredLogs = logs.filter((log) => log.level === currentFilter);
        }
        updateCounter();
    }

    function updateCounter() {
        if (!panel) return;
        const counter = panel.querySelector("#hc-counter");
        if (counter) {
            counter.textContent = `${filteredLogs.length} 条`;
        }
    }

    // 添加日志（优化性能，减少延迟）
    function addLog(message, level = "log") {
        const timestamp = new Date().toLocaleTimeString();
        const theme = getThemeStyles();

        const levelColors = {
            log: theme.levelLog,
            error: theme.levelError,
            warn: theme.levelWarn,
            info: theme.levelInfo,
            debug: theme.levelDebug,
            system: theme.levelSystem,
        };

        const logEntry = {
            timestamp,
            message: String(message),
            level,
            color: levelColors[level] || theme.text,
        };

        // 简单的重复检测：检查最近5条日志是否相同
        const recentLogs = logs.slice(-5);
        const isDuplicate = recentLogs.some(
            (log) =>
                log.message === logEntry.message &&
                log.level === logEntry.level &&
                log.timestamp === logEntry.timestamp,
        );

        if (isDuplicate) {
            return;
        }

        logs.push(logEntry);

        // 限制日志数量
        if (logs.length > 500) logs.shift();

        // 立即更新显示，使用防抖减少渲染频率
        if (renderTimeout) {
            clearTimeout(renderTimeout);
        }

        renderTimeout = setTimeout(() => {
            filterLogs();
            renderLogs();
            renderTimeout = null;
        }, 16); // 约60fps的刷新率

        // 异步保存到存储，使用防抖
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }

        saveTimeout = setTimeout(() => {
            chrome.storage.local.set({ logs: logs.slice(-200) });
            saveTimeout = null;
        }, 100); // 100ms防抖
    }

    // 渲染日志
    function renderLogs() {
        if (!panel) return;

        const logsContainer = panel.querySelector("#hc-logs");
        if (!logsContainer) return;

        const theme = getThemeStyles();

        if (filteredLogs.length === 0) {
            logsContainer.innerHTML = `<div style="color: ${theme.timestamp}; text-align: center; padding: 20px; font-size: 12px;">暂无日志</div>`;
            return;
        }

        logsContainer.innerHTML = filteredLogs
            .map((log) => {
                return `
            <div style="
                margin-bottom: 2px;
                padding: 4px 8px;
                border-left: 2px solid ${log.color};
                background: ${log.level === "error" ? "rgba(248, 113, 113, 0.06)" : "transparent"};
                border-radius: 0 4px 4px 0;
                font-family: inherit;
                line-height: 1.3;
                font-size: 11px;
                transition: all 0.2s ease;
            ">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                    <span style="color: ${theme.timestamp}; font-size: 9px; font-weight: 500;">[${log.timestamp}]</span>
                    <span style="color: ${log.color}; font-size: 8px; font-weight: 600; text-transform: uppercase;">${log.level}</span>
                </div>
                <div style="color: ${log.color}; white-space: pre-wrap; word-break: break-word;">${log.message}</div>
            </div>
        `;
            })
            .join("");

        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    // 设置错误处理（仅处理全局错误，不拦截 console）
    function setupErrorHandling() {
        // 防止重复设置错误处理
        if (window.__hoverConsoleErrorHandlingSet) {
            // console.log('错误处理已设置，跳过');
            return;
        }

        // 设置全局错误处理
        window.addEventListener("error", (event) => {
            const errorMessage = `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
            addLog(errorMessage, "error");
        });

        // 捕获未处理的 Promise 拒绝
        window.addEventListener("unhandledrejection", (event) => {
            const errorMessage =
                event.reason instanceof Error
                    ? `Unhandled Promise Rejection: ${event.reason.message}`
                    : `Unhandled Promise Rejection: ${String(event.reason)}`;
            addLog(errorMessage, "error");
        });

        window.__hoverConsoleErrorHandlingSet = true;
        // console.log('错误处理设置完成');

        return true;
    }

    // 注入 page-injector.js 到页面上下文中
    function injectPageScript() {
        try {
            // 检查是否已经注入（在content script环境中检查）
            if (window.__hoverConsoleContentInjected) {
                // console.log('页面脚本已在content script环境中注入，跳过');
                return;
            }

            // 检查页面上下文中是否已注入
            if (window.__hoverConsolePageInjected) {
                // console.log('页面脚本已在页面上下文中注入，跳过');
                return;
            }

            const script = document.createElement("script");
            script.src = chrome.runtime.getURL("page-injector.js");
            script.onload = function () {
                this.remove(); // 加载后移除脚本标签
                window.__hoverConsoleContentInjected = true;
                // console.log('页面脚本注入成功');
            };
            script.onerror = function () {
                addLog("❌ 页面注入器加载失败", "error");
            };

            (document.head || document.documentElement).appendChild(script);
        } catch (error) {
            addLog("❌ 注入页面脚本失败: " + error.message, "error");
        }
    }

    // 尝试通过 DOM 事件监听页面的 console 调用
    function setupDOMObserver() {
        // 防止重复设置DOM监听器
        if (window.__hoverConsoleDOMObserverSet) {
            // console.log('DOM监听器已设置，跳过');
            return;
        }

        // 监听来自 page-injector.js 的自定义事件
        document.addEventListener("hoverConsoleLog", (event) => {
            const { level, args } = event.detail || {};
            if (args && Array.isArray(args)) {
                const message = args.join(" ");
                addLog(message, level || "log");
            }
        });

        window.__hoverConsoleDOMObserverSet = true;
        // console.log('DOM监听器设置完成');
    }

    // 渲染已有日志
    function restoreLogs() {
        chrome.storage.local.get("logs", (result) => {
            if (result.logs && Array.isArray(result.logs)) {
                logs = result.logs;
                filterLogs();
                renderLogs();
            }
        });
    }

    // 主初始化函数
    async function initialize() {
        // 防止重复初始化
        if (isInitializing || hasInitialized) {
            // console.log('初始化已在进行中或已完成，跳过重复初始化');
            return;
        }

        isInitializing = true;

        // 恢复面板关闭状态
        await restorePanelClosedState();

        try {
            // 先向 background script 注册当前标签页
            const response = await chrome.runtime.sendMessage({
                type: "PANEL_READY",
            });
            if (response && !response.showPanel) {
                // 如果不是活动标签页，先不显示面板，但继续初始化其他功能
                // console.log('当前不是活动标签页，面板将保持隐藏');
                // 仍然创建面板但保持隐藏状态
                await createPanel();
                if (panel) {
                    panel.style.display = "none";
                }
            } else {
                // 是活动标签页，正常显示面板
                await createPanel();
                // 如果面板被用户关闭过，则保持隐藏状态
                if (isPanelClosed && panel) {
                    panel.style.display = "none";
                }
            }
        } catch (error) {
            // console.log('无法连接到 background script，使用默认行为');
            await createPanel();
            // 如果面板被用户关闭过，则保持隐藏状态
            if (isPanelClosed && panel) {
                panel.style.display = "none";
            }
        }

        setupErrorHandling();
        setupDOMObserver();
        restoreLogs();

        // 立即注入页面脚本以拦截页面级的 console 调用，移除延迟
        injectPageScript();

        hasInitialized = true;
        isInitializing = false;
        // console.log('Hover Console 初始化完成');
    }

    // 监听来自 background script 的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.type) {
            case "SHOW_PANEL":
                if (panel) {
                    panel.style.display = "block";
                    isPanelClosed = false; // 重置关闭状态
                    savePanelClosedState(); // 保存状态
                    // console.log('面板已显示');
                }
                break;

            case "HIDE_PANEL":
                if (panel) {
                    panel.style.display = "none";
                    isPanelClosed = true; // 设置为关闭状态
                    savePanelClosedState(); // 保存状态
                    // console.log('面板已隐藏');
                }
                break;

            default:
                break;
        }
        sendResponse({ received: true });
        return true;
    });

    // 等待 DOM 准备就绪
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }

    // 也在 window.load 时再次确保初始化（但只有在未初始化的情况下）
    window.addEventListener("load", () => {
        if (!hasInitialized) {
            // console.log('window.load 触发初始化（之前未初始化）');
            initialize();
        }
    });

    // 监听系统主题变化
    if (window.matchMedia) {
        const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");
        darkModeQuery.addEventListener("change", () => {
            // 重新创建面板以应用新主题
            if (panel) {
                // const panelParent = panel.parentNode;
                panel.remove();
                panel = null;
                // 重新初始化以应用新主题
                setTimeout(() => {
                    initialize();
                }, 100);
            }
        });
    }
})();
