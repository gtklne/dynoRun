/**
 * Best-effort voice feedback for hands-free use: the rider hears state changes
 * without looking at the phone. No-ops when SpeechSynthesis is unavailable
 * (older WebViews) — haptics remain the fallback cue.
 */
export function speak(text: string): void {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch { /* noop */ }
}
