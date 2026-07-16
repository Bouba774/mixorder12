package app.mixorder.folderpicker;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FolderPicker")
public class FolderPickerPlugin extends Plugin {

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "pickFolderResult");
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null || uriString.isEmpty()) {
            call.reject("missing uri");
            return;
        }
        try {
            Uri uri = Uri.parse(uriString);
            boolean ok = DocumentsContract.deleteDocument(
                getContext().getContentResolver(),
                uri
            );
            if (ok) call.resolve();
            else call.reject("delete failed");
        } catch (Exception ex) {
            call.reject("delete error: " + ex.getMessage());
        }
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.reject("no uri");
            return;
        }
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                treeUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            );
        } catch (SecurityException ignored) {
        }

        String rootDocId = DocumentsContract.getTreeDocumentId(treeUri);
        String folderName = queryDisplayName(treeUri, rootDocId);

        JSArray files = new JSArray();
        try {
            collect(treeUri, rootDocId, files);
        } catch (Exception ex) {
            call.reject("failed to list folder: " + ex.getMessage());
            return;
        }

        JSObject ret = new JSObject();
        ret.put("name", folderName != null ? folderName : "Bibliothèque");
        ret.put("uri", treeUri.toString());
        ret.put("files", files);
        call.resolve(ret);
    }

    private String queryDisplayName(Uri treeUri, String documentId) {
        Uri docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(
                docUri,
                new String[]{ DocumentsContract.Document.COLUMN_DISPLAY_NAME },
                null, null, null
            );
            if (c != null && c.moveToFirst()) {
                return c.getString(0);
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.close();
        }
        return null;
    }

    private void collect(Uri treeUri, String parentDocId, JSArray out) {
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId);
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(
                childrenUri,
                new String[]{
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE,
                    DocumentsContract.Document.COLUMN_SIZE
                },
                null, null, null
            );
            if (c == null) return;
            while (c.moveToNext()) {
                String docId = c.getString(0);
                String name = c.getString(1);
                String mime = c.isNull(2) ? null : c.getString(2);
                long size = c.isNull(3) ? 0L : c.getLong(3);
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    collect(treeUri, docId, out);
                } else if (isAudio(name, mime)) {
                    Uri fileUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);
                    JSObject o = new JSObject();
                    o.put("name", name != null ? name : "");
                    o.put("uri", fileUri.toString());
                    o.put("mimeType", mime != null ? mime : "audio/*");
                    o.put("size", size);
                    out.put(o);
                }
            }
        } finally {
            if (c != null) c.close();
        }
    }

    private boolean isAudio(String name, String mime) {
        if (mime != null && mime.startsWith("audio/")) return true;
        if (name == null) return false;
        String n = name.toLowerCase();
        return n.endsWith(".mp3") || n.endsWith(".wav") || n.endsWith(".flac")
            || n.endsWith(".aif") || n.endsWith(".aiff") || n.endsWith(".m4a")
            || n.endsWith(".ogg") || n.endsWith(".opus") || n.endsWith(".wma")
            || n.endsWith(".aac");
    }
}
