type SoundType = "upcoming" | "start" | "ending" | "end"

const toneMap: Record<SoundType, { freq: number; duration: number; count: number }> = {
  upcoming: { freq: 660, duration: 0.12, count: 1 },
  start: { freq: 880, duration: 0.15, count: 1 },
  ending: { freq: 520, duration: 0.1, count: 2 },
  end: { freq: 440, duration: 0.2, count: 1 },
}

export function playNotificationSound(type: SoundType) {
  const ctx = new AudioContext()
  const { freq, duration, count } = toneMap[type]

  for (let i = 0; i < count; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = "sine"
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.12)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + duration)
    osc.start(ctx.currentTime + i * 0.12)
    osc.stop(ctx.currentTime + i * 0.12 + duration)
  }
}
