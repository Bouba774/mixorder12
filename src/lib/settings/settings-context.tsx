import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * MixOrder — global user preferences.
 *
 * A single localStorage-backed store centralising every non-analysis
 * setting exposed by the Settings page. Values are applied immediately
 * (React state → localStorage on every change). Existing feature modules
 * remain the source of truth for their runtime logic; this store simply
 * lets the Settings UI persist and surface each preference in one place.
 */

export type TrackDisplayFormat = "artist-title" | "title-artist" | "filename";
export type RenameTemplate =
  | "artist-title"
  | "artist-title-key-bpm"
  | "artist-title-bpm"
  | "custom";
export type HistoryRetention = "7d" | "30d" | "90d" | "forever";

export interface AppSettings {
  // Robot DiscDJ
  robotWaitMs: number;
  robotNotifications: boolean;
  robotAutoResume: boolean;
  robotAutoSave: boolean;
  robotPostAnalysis: "stay" | "close" | "notify";
  robotAdvanced: {
    ocrStrict: boolean;
    matchAggressive: boolean;
    keepScreenOn: boolean;
  };

  // Library
  libraryOpenLastAtStartup: boolean;
  libraryAutoResume: boolean;
  libraryShowBpm: boolean;
  libraryShowKey: boolean;
  libraryShowDuplicates: boolean;
  libraryTrackFormat: TrackDisplayFormat;

  // Player
  playerAutoplay: boolean;
  playerStartVolume: number; // 0-100
  playerRememberPosition: boolean;
  playerShowMini: boolean;

  // Rename
  renameAutoCleanPrefix: boolean;
  renameTemplate: RenameTemplate;
  renameKeepHistory: boolean;
  renameHistoryRetention: HistoryRetention;

  // Notifications
  notifRobotProgress: boolean;
  notifAnalysisDone: boolean;
  notifErrors: boolean;
  notifRenameDone: boolean;
  notifImportDone: boolean;
}

const DEFAULTS: AppSettings = {
  robotWaitMs: 1500,
  robotNotifications: true,
  robotAutoResume: true,
  robotAutoSave: true,
  robotPostAnalysis: "notify",
  robotAdvanced: {
    ocrStrict: true,
    matchAggressive: true,
    keepScreenOn: true,
  },

  libraryOpenLastAtStartup: true,
  libraryAutoResume: true,
  libraryShowBpm: true,
  libraryShowKey: true,
  libraryShowDuplicates: true,
  libraryTrackFormat: "artist-title",

  playerAutoplay: false,
  playerStartVolume: 80,
  playerRememberPosition: true,
  playerShowMini: true,

  renameAutoCleanPrefix: true,
  renameTemplate: "artist-title",
  renameKeepHistory: true,
  renameHistoryRetention: "30d",

  notifRobotProgress: true,
  notifAnalysisDone: true,
  notifErrors: true,
  notifRenameDone: true,
  notifImportDone: true,
};

const STORAGE_KEY = "mixorder.settings.v1";

interface SettingsContextValue {
  settings: AppSettings;
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetTemporaryData: () => void;
  clearCache: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function loadSettings(): AppSettings {
  try {
    if (typeof window === "undefined") return DEFAULTS;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed, robotAdvanced: { ...DEFAULTS.robotAdvanced, ...(parsed.robotAdvanced ?? {}) } };
  } catch {
    return DEFAULTS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      setSetting: (key, val) => setSettings((s) => ({ ...s, [key]: val })),
      clearCache: () => {
        try {
          const toClear: string[] = [];
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k && (k.startsWith("mixorder:cache:") || k.startsWith("mixorder:tmp:"))) {
              toClear.push(k);
            }
          }
          toClear.forEach((k) => window.localStorage.removeItem(k));
        } catch {}
      },
      resetTemporaryData: () => {
        try {
          const toClear: string[] = [];
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k && (k.startsWith("mixorder:tmp:") || k.startsWith("mixorder:cache:") || k.startsWith("mixorder:journal:"))) {
              toClear.push(k);
            }
          }
          toClear.forEach((k) => window.localStorage.removeItem(k));
        } catch {}
      },
    }),
    [settings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

export function computeStorageUsage(): { bytes: number; keys: number } {
  if (typeof window === "undefined") return { bytes: 0, keys: 0 };
  let bytes = 0;
  let keys = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith("mixorder")) continue;
      const v = window.localStorage.getItem(k) ?? "";
      bytes += k.length + v.length;
      keys += 1;
    }
  } catch {}
  return { bytes: bytes * 2, keys };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}