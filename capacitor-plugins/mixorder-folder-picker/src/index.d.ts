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
}

export declare const FolderPicker: FolderPickerPlugin;
export default FolderPicker;
