let context: AudioContext | null = null;

export function playSound(
  kind: "card" | "chip" | "win" | "click",
  volume: number,
) {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const notes =
      kind === "win"
        ? [523, 659, 784, 1047]
        : kind === "card"
          ? [420, 260]
          : kind === "chip"
            ? [1300, 1700]
            : [560];
    notes.forEach((frequency, index) => {
      const oscillator = context!.createOscillator();
      const gain = context!.createGain();
      const start =
        context!.currentTime + index * (kind === "win" ? 0.095 : 0.04);
      oscillator.type = kind === "card" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume * 0.16, start + 0.009);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.13);
      oscillator.connect(gain);
      gain.connect(context!.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.15);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    });
  } catch {
    /* Play remains available when a browser has no audio output. */
  }
}
