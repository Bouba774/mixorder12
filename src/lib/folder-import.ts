import { Capacitor } from "@capacitor/core";
import { FolderPicker } from "mixorder-folder-picker";

/**
 * Cross-platform folder / library import.
 *
 * - Web: uses the standard <input webkitdirectory> flow (handled by the
 *   caller — this module only exposes the native path).
 * - Android (Capacitor): uses our custom `FolderPicker` plugin which opens
 *   the system's Storage Access Framework directory picker
 *   (ACTION_OPEN_DOCUMENT_TREE). One tap picks a folder and every audio
 *   file inside is imported in a single action — no multi-select needed.
 */

export interface ImportedTrackInput {
  originalName: string;
  path: string;
  mimeType: string;
  size: number;
  /** Playable URL for <audio>. Blob URL on web, http://localhost/... on native. */
  url: string;
  /** Present on web only. */
  file?: File;
}

export interface ImportedProject {
  name: string;
  tracks: ImportedTrackInput[];
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

const AUDIO_EXT = /\.(mp3|wav|flac|aiff?|m4a|ogg|opus|wma|aac)$/i;

export async function pickFolderNative(): Promise<ImportedProject | null> {
  const res = await FolderPicker.pickFolder();
  const files = (res?.files ?? []).filter(
    (f) => AUDIO_EXT.test(f.name) || (f.mimeType ?? "").startsWith("audio/"),
  );
  if (files.length === 0) return { name: res?.name ?? "Bibliothèque", tracks: [] };

  const tracks: ImportedTrackInput[] = files.map((f) => ({
    originalName: f.name,
    path: f.uri,
    mimeType: f.mimeType || "audio/*",
    size: f.size ?? 0,
    url: Capacitor.convertFileSrc(f.uri),
  }));

  return { name: res.name || "Bibliothèque", tracks };
}

export function projectFromFileList(files: FileList | File[]): ImportedProject | null {
  const arr = Array.from(files).filter(
    (f) => AUDIO_EXT.test(f.name) || f.type.startsWith("audio/"),
  );
  if (arr.length === 0) return null;

  const tracks: ImportedTrackInput[] = arr.map((f) => {
    const rel =
      (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    return {
      originalName: f.name,
      path: rel,
      mimeType: f.type || "audio/*",
      size: f.size,
      url: URL.createObjectURL(f),
      file: f,
    };
  });

  const first = (arr[0] as File & { webkitRelativePath?: string }).webkitRelativePath;
  const name = first ? first.split("/")[0] : "Nouveau projet";
  return { name, tracks };
}
