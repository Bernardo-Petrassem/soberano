let ctx: AudioContext | null = null;

function context(enabled: boolean): AudioContext | null {
  if (!enabled || typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function knock(enabled: boolean) {
  const audio = context(enabled);
  if (!audio) return;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(640, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.07);
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

export function capture(enabled: boolean) {
  const audio = context(enabled);
  if (!audio) return;
  const now = audio.currentTime;
  const body = audio.createOscillator();
  const wood = audio.createOscillator();
  const gain = audio.createGain();
  body.type = "triangle";
  body.frequency.setValueAtTime(210, now);
  body.frequency.exponentialRampToValueAtTime(70, now + 0.12);
  wood.type = "square";
  wood.frequency.setValueAtTime(140, now);
  wood.frequency.exponentialRampToValueAtTime(55, now + 0.07);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.14, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  body.connect(gain);
  wood.connect(gain);
  gain.connect(audio.destination);
  body.start(now);
  wood.start(now);
  body.stop(now + 0.17);
  wood.stop(now + 0.17);
}
