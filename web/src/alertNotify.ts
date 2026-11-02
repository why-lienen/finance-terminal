// 系统通知（浏览器 Notification / Electron 原生通知通用）
export function canNotify(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notifyPermission(): NotificationPermission {
  return canNotify() ? Notification.permission : 'denied';
}

export function requestNotify(): Promise<NotificationPermission> {
  if (!canNotify() || Notification.permission !== 'default') {
    return Promise.resolve(Notification.permission);
  }
  return Notification.requestPermission();
}

export function sendNotify(title: string, body: string) {
  if (canNotify() && Notification.permission === 'granted') {
    try {
      new Notification(title, { body });
    } catch {
      /* 某些 Electron 版本需在 main 进程发通知，这里兜底忽略 */
    }
  }
}
