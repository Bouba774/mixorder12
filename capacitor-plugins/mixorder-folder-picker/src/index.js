import { registerPlugin } from "@capacitor/core";

/**
 * @typedef {{ name: string, uri: string, mimeType: string, size: number }} FolderPickerFile
 * @typedef {{ name: string, uri: string, files: FolderPickerFile[] }} FolderPickerResult
 */

const FolderPicker = registerPlugin("FolderPicker");

export { FolderPicker };
export default FolderPicker;
