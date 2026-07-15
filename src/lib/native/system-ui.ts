import { Capacitor } from "@capacitor/core";

/**
 * Configure Android system UI for a true edge-to-edge experience:
 * the WebView draws behind both the status bar and the navigation bar,
 * and CSS safe-area insets take care of padding the content.
 *
 * Called once from the client on mount. No-op on web.
 */
let configured = false;

export async function configureSystemUI(): Promise<void> {
  if (configured) return;
  configured = true;
  if (typeof window === "undefined") return;
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Draw under the status bar (edge-to-edge)
    await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    // Light icons on dark background
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    // Fully transparent so our app background shows through
    await StatusBar.setBackgroundColor({ color: "#00000000" }).catch(() => {});
  } catch {
    /* plugin unavailable — safe to ignore */
  }
}