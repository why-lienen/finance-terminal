// 到价提醒的提示音（Web Audio，无需音频素材文件）
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

export function isSoundEnabled() {
  return enabled;
}

// 必须在用户手势（点击）后调用一次，以满足浏览器自动播放策略
export function ensureAudio() {
  if (typeof window === 'undefined') return;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    try {
      ctx = new AC();
    } catch {
      return;
    }
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function playAlertSound() {
  if (!enabled) return;
  ensureAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  // 两声短蜂鸣（高频→中频）提醒更明显
  for (let i = 0; i < 2; i++) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const start = t0 + i * 0.28;
    o.type = 'sine';
    o.frequency.value = i === 0 ? 880 : 620;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(start);
    o.stop(start + 0.24);
  }
}
