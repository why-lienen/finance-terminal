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
  // 紧急提醒音：3 轮双音高音警报（方波比正弦感知更响亮、更抓耳），整体约 1.1 秒。
  const peak = 0.4; // 比旧版 0.35 更高、且方波自带亮度
  const dur = 0.18;
  const toneGap = 0.14; // 两个音之间
  const cycleGap = 0.16; // 每轮之间
  let t = ctx.currentTime;
  for (let c = 0; c < 3; c++) {
    t = beep(ctx, t, 1046.5, 'square', dur, peak); // C6
    t += toneGap;
    t = beep(ctx, t, 1568.0, 'square', dur, peak); // G6
    t += cycleGap;
  }
}

// 单个音：带缓入缓出包络，避免爆音；方波提供明亮高亢的警报感
function beep(ctx: AudioContext, start: number, freq: number, type: OscillatorType, dur: number, peak: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(start);
  o.stop(start + dur + 0.03);
  return start + dur;
}
