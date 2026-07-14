/**
 * Haptic feedback — light wrapper around the Web Vibration API.
 *
 * Silent no-op when the platform (desktop, iOS Safari) does not expose
 * `navigator.vibrate`. Every noticeable action in MixOrder should call
 * one of these helpers so the app feels physical on Android.
 */
function safeVibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  try {
    nav.vibrate?.(pattern);
  } catch {
    // Best-effort — some devices reject vibration outside user gestures.
  }
}

export const haptics = {
  tap: () => safeVibrate(10),
  success: () => safeVibrate([10, 40, 10]),
  warning: () => safeVibrate([20, 60, 20]),
  error: () => safeVibrate([40, 30, 40]),
  heavy: () => safeVibrate(25),
};

export function withHaptic<T extends (...args: never[]) => unknown>(fn: T): T {
  return ((...args: Parameters<T>) => {
    haptics.tap();
    return fn(...args);
  }) as T;
}