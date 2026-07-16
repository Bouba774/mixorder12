export interface FolderPickerFile {
  name: string;
  uri: string;
  mimeType: string;
  size: number;
}

export interface FolderPickerResult {
  name: string;
  uri: string;
  files: FolderPickerFile[];
}

export interface FolderPickerPlugin {
  pickFolder(): Promise<FolderPickerResult>;
  /**
   * Delete a file by SAF URI. Requires that the URI belongs to a tree
   * previously granted via `pickFolder()`.
   */
  deleteFile(options: { uri: string }): Promise<void>;
}

export declare const FolderPicker: FolderPickerPlugin;
export default FolderPicker;
