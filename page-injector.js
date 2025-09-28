// page-injector.js
// 这个文件将作为外部脚本加载，绕过 CSP 限制

(function () {
  'use strict';

  // 双重检查防止重复注入
  if (window.__hoverConsolePageInjected) {
    // console.log('Hover Console 页面脚本已注入，跳过重复注入');
    return;
  }

  window.__hoverConsolePageInjected = true;
  // console.log('Hover Console 页面脚本开始注入');


  // 保存原始 console 方法（只保存一次）
  if (!window.__originalConsole) {
    window.__originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console)
    };
    // console.log('原始console方法已保存');
  }

  const _console = window.__originalConsole;

  // 创建包装函数
  function wrapConsoleMethod(original, level) {
    return function (...args) {
      // 先调用原始方法
      try {
        original.apply(console, args);
      } catch (e) {
      }

      // 发送自定义事件给 content script
      try {
        const event = new CustomEvent('hoverConsoleLog', {
          detail: {
            level: level,
            args: args.map(arg => {
              if (arg === null) return 'null';
              if (arg === undefined) return 'undefined';
              if (typeof arg === 'string') return arg;
              if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
              if (arg instanceof Error) return arg.stack || arg.message;
              if (typeof arg === 'object') {
                try {
                  return JSON.stringify(arg, null, 2);
                } catch (e) {
                  return '[Object]';
                }
              }
              return String(arg);
            }),
            timestamp: Date.now()
          },
          bubbles: true
        });

        document.dispatchEvent(event);
      } catch (e) {
        _console.error('Failed to dispatch hover console event:', e);
      }
    };
  }

  // 重写所有 console 方法（只重写一次）
  if (!window.__consoleMethodsWrapped) {
    console.log = wrapConsoleMethod(_console.log, 'log');
    console.error = wrapConsoleMethod(_console.error, 'error');
    console.warn = wrapConsoleMethod(_console.warn, 'warn');
    console.info = wrapConsoleMethod(_console.info, 'info');
    console.debug = wrapConsoleMethod(_console.debug, 'debug');

    window.__consoleMethodsWrapped = true;
    // console.log('console方法包装完成');
  }


  // console.log('Hover Console 页面脚本注入完成');

})();
