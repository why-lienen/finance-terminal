// 到价提醒的提示音（Web Audio，无需音频素材文件）
let ctx: AudioContext | null = null;
const LS_KEY = 'ft:sound';
let enabled =
  typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) !== '0' : true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
  if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, v ? '1' : '0');
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

// kind: 'down' = 跌破下限（警示，急促方波警报）；'up' = 突破上限（愉悦，上行琶音）
export function playAlertSound(kind: 'up' | 'down' = 'down') {
  if (!enabled) return;
  ensureAudio();
  if (!ctx) return;
  if (kind === 'down') {
    // 跌破下限：警示警报——3 轮双音高音方波（响亮、抓耳、带紧迫感），整体约 1.1 秒
    const peak = 0.4;
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
  } else {
    // 突破上限：愉悦上行琶音——C5-E5-G5-C6 三角波（明亮、欢快，像“达成”的提示音），不再让人误以为是下跌
    const peak = 0.34;
    const dur = 0.16;
    const gap = 0.11;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    let t = ctx.currentTime;
    for (const f of notes) {
      t = beep(ctx, t, f, 'triangle', dur, peak);
      t += gap;
    }
    // 收尾再来一个更长的高音，强化“成功突破”的听感
    t = beep(ctx, t, 1046.5, 'triangle', dur * 1.5, peak * 0.9);
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
