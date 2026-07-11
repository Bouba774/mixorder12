package app.mixorder.discdjrobot;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Path;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executor;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * MixOrder DiscDJ AccessibilityService.
 *
 * Coordinate contract: every calibration is stored in a single canonical
 * LANDSCAPE frame. If Android is portrait during capture, touch coordinates
 * are rotated into that frame. During execution the canonical point/rectangle
 * is converted back to the real display/screenshot pixels exactly once.
 */
public class DiscDJAccessibilityService extends AccessibilityService {

    private static DiscDJAccessibilityService instance;

    static final Pattern BPM_LABELED_PATTERN =
            Pattern.compile("BPM\\s*[:：]?\\s*(\\d{2,3}(?:[.,]\\d+)?)", Pattern.CASE_INSENSITIVE);
    static final Pattern BPM_LOOSE_PATTERN =
            Pattern.compile("(?<![\\d.])(\\d{2,3}(?:[.,]\\d+)?)(?![\\d.])");
    private static final Pattern DURATION_PATTERN =
            Pattern.compile("\\b\\d{1,2}:\\d{2}(?::\\d{2})?\\b");

    private static final String[] BAD_SOURCE_KEYWORDS = new String[] {
            "mixorder", "robot discdj", "diagnostic", "calibration", "zone ocr",
            "attente de chargement", "tester la calibration", "pont :", "ouvrir les paramètres",
            "bpm final", "texte ocr brut", "recalibrer", "récapitulatif"
    };

    public static DiscDJAccessibilityService getInstance() {
        return instance;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // Passive service: the Capacitor plugin drives all reads/taps on demand.
    }

    @Override
    public void onInterrupt() {
        // no-op
    }

    public static class TextHit {
        public final String text;
        public final Rect bounds;
        public TextHit(String text, Rect bounds) {
            this.text = text;
            this.bounds = bounds;
        }
    }

    public static class ScanResult {
        public final List<TextHit> allText = new ArrayList<>();
        public int displayWidth;
        public int displayHeight;
        public String sourcePackage;
        public boolean sourceOk;
    }

    public static class WindowSnapshot {
        public String packageName;
        public Rect bounds = new Rect();
        public int childCount;
        public int displayWidth;
        public int displayHeight;
        public boolean landscape;
        public boolean foregroundMatches;
    }

    public static class OcrResult {
        public Double bpm;
        public String raw;
        public final List<String> zoneTexts = new ArrayList<>();
        public String parseReason;
        public String sourcePackage;
        public boolean sourceOk;
        public int displayWidth;
        public int displayHeight;
        public Rect cropRect = new Rect();
        public String fullScreenshotDataUrl;
        public String croppedDataUrl;
        public String ocrInputDataUrl;
    }

    public interface OcrCallback {
        void onResult(OcrResult result);
    }

    /** Real display metrics in the current Android orientation. */
    public int[] getDisplaySize() {
        DisplayMetrics dm = new DisplayMetrics();
        WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        if (wm != null && wm.getDefaultDisplay() != null) {
            wm.getDefaultDisplay().getRealMetrics(dm);
        } else {
            dm = getResources().getDisplayMetrics();
        }
        return new int[] { dm.widthPixels, dm.heightPixels };
    }

    /** Current app-window snapshot, used for foreground + stability checks. */
    public WindowSnapshot getWindowSnapshot(String expectedPackage) {
        WindowSnapshot s = new WindowSnapshot();
        int[] size = getDisplaySize();
        s.displayWidth = size[0];
        s.displayHeight = size[1];
        s.landscape = size[0] >= size[1];

        AccessibilityNodeInfo root = getDiscDJRoot(expectedPackage);
        if (root == null) root = getRootInActiveWindow();
        if (root != null) {
            CharSequence pkg = root.getPackageName();
            s.packageName = pkg != null ? pkg.toString() : null;
            root.getBoundsInScreen(s.bounds);
            s.childCount = countNodes(root, 0);
            s.foregroundMatches = packageMatches(s.packageName, expectedPackage);
        } else {
            s.foregroundMatches = false;
        }
        return s;
    }

    /** Scan only DiscDJ's app window; foreign overlays/windows are ignored. */
    public ScanResult scanDiscDJWindow(String expectedPackage) {
        ScanResult res = new ScanResult();
        int[] size = getDisplaySize();
        res.displayWidth = size[0];
        res.displayHeight = size[1];
        AccessibilityNodeInfo root = getDiscDJRoot(expectedPackage);
        if (root == null) root = getRootInActiveWindow();
        if (root != null) {
            CharSequence pkg = root.getPackageName();
            res.sourcePackage = pkg != null ? pkg.toString() : null;
            res.sourceOk = packageMatches(res.sourcePackage, expectedPackage);
            if (res.sourceOk) walk(root, res);
        }
        return res;
    }

    private AccessibilityNodeInfo getDiscDJRoot(String expectedPackage) {
        List<AccessibilityWindowInfo> windows = getWindows();
        if (windows != null) {
            for (AccessibilityWindowInfo w : windows) {
                if (w == null || w.getType() != AccessibilityWindowInfo.TYPE_APPLICATION) continue;
                AccessibilityNodeInfo root = w.getRoot();
                if (root == null) continue;
                CharSequence pkg = root.getPackageName();
                if (packageMatches(pkg != null ? pkg.toString() : null, expectedPackage)) return root;
            }
        }
        AccessibilityNodeInfo active = getRootInActiveWindow();
        if (active == null) return null;
        CharSequence pkg = active.getPackageName();
        return packageMatches(pkg != null ? pkg.toString() : null, expectedPackage) ? active : null;
    }

    private void walk(AccessibilityNodeInfo node, ScanResult res) {
        if (node == null) return;
        CharSequence textCs = node.getText();
        CharSequence descCs = node.getContentDescription();
        String[] sources = new String[] {
                textCs != null ? textCs.toString() : null,
                descCs != null ? descCs.toString() : null,
        };
        for (String s : sources) {
            if (s == null || s.trim().isEmpty()) continue;
            Rect r = new Rect();
            node.getBoundsInScreen(r);
            if (r.width() <= 0 || r.height() <= 0) continue;
            res.allText.add(new TextHit(s.trim(), r));
        }
        int n = node.getChildCount();
        for (int i = 0; i < n; i++) walk(node.getChild(i), res);
    }

    private int countNodes(AccessibilityNodeInfo node, int depth) {
        if (node == null || depth > 8) return 0;
        int total = 1;
        for (int i = 0; i < node.getChildCount(); i++) total += countNodes(node.getChild(i), depth + 1);
        return total;
    }

    public static boolean packageMatches(String actual, String expected) {
        if (actual == null || expected == null || expected.isEmpty()) return false;
        return actual.equals(expected);
    }

    /** Convert canonical-landscape point to current display coordinates. */
    public static float[] pointFromCanonical(float nx, float ny, int screenW, int screenH) {
        nx = clamp(nx); ny = clamp(ny);
        if (screenW >= screenH) return new float[] { nx * screenW, ny * screenH };
        return new float[] { (1f - ny) * screenW, nx * screenH };
    }

    /** Convert current display coordinates to canonical landscape fractions. */
    private static float[] pointToCanonical(float rawX, float rawY, int screenW, int screenH) {
        if (screenW >= screenH) return new float[] { clamp(rawX / screenW), clamp(rawY / screenH) };
        return new float[] { clamp(rawY / screenH), clamp(1f - (rawX / screenW)) };
    }

    public static Rect rectFromCanonical(double x, double y, double w, double h, int screenW, int screenH) {
        float x1 = (float) x, y1 = (float) y, x2 = (float) (x + w), y2 = (float) (y + h);
        float[] p1 = pointFromCanonical(x1, y1, screenW, screenH);
        float[] p2 = pointFromCanonical(x2, y1, screenW, screenH);
        float[] p3 = pointFromCanonical(x2, y2, screenW, screenH);
        float[] p4 = pointFromCanonical(x1, y2, screenW, screenH);
        int l = Math.round(Math.min(Math.min(p1[0], p2[0]), Math.min(p3[0], p4[0])));
        int t = Math.round(Math.min(Math.min(p1[1], p2[1]), Math.min(p3[1], p4[1])));
        int r = Math.round(Math.max(Math.max(p1[0], p2[0]), Math.max(p3[0], p4[0])));
        int b = Math.round(Math.max(Math.max(p1[1], p2[1]), Math.max(p3[1], p4[1])));
        return new Rect(l, t, r, b);
    }

    public static boolean rectFullyVisible(Rect rect, int w, int h) {
        return rect != null && rect.left >= 0 && rect.top >= 0 && rect.right <= w && rect.bottom <= h
                && rect.width() > 0 && rect.height() > 0;
    }

    /** Strict screenshot crop + ML Kit OCR, never using MixOrder UI as source. */
    public void readBpmFromScreenshot(final Rect displayCropRect, final String expectedPackage, final OcrCallback cb) {
        removeOverlay();
        OcrResult early = new OcrResult();
        int[] display = getDisplaySize();
        early.displayWidth = display[0];
        early.displayHeight = display[1];
        early.cropRect = displayCropRect != null ? new Rect(displayCropRect) : new Rect();
        WindowSnapshot snap = getWindowSnapshot(expectedPackage);
        early.sourcePackage = snap.packageName;
        early.sourceOk = snap.foregroundMatches;

        if (!snap.foregroundMatches) {
            early.parseReason = "Mauvaise source de capture : DiscDJ n'est pas au premier plan.";
            cb.onResult(early);
            return;
        }
        if (!snap.landscape) {
            early.parseReason = "Orientation incorrecte : DiscDJ doit être affiché en mode paysage avant la lecture OCR.";
            cb.onResult(early);
            return;
        }
        if (!rectFullyVisible(displayCropRect, display[0], display[1])) {
            early.parseReason = "Zone OCR invalide ou partiellement hors écran.";
            cb.onResult(early);
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            early.parseReason = "Capture OCR indisponible : Android 11 ou plus récent est requis pour capturer strictement l'écran DiscDJ.";
            cb.onResult(early);
            return;
        }

        Executor executor = command -> new Handler(Looper.getMainLooper()).post(command);
        try {
        takeScreenshot(Display.DEFAULT_DISPLAY, executor, new TakeScreenshotCallback() {
            @Override
            public void onSuccess(ScreenshotResult screenshot) {
                Bitmap full;
                try {
                    Bitmap hw = Bitmap.wrapHardwareBuffer(screenshot.getHardwareBuffer(), screenshot.getColorSpace());
                    if (hw == null) throw new IllegalStateException("buffer vide");
                    full = hw.copy(Bitmap.Config.ARGB_8888, false);
                    screenshot.getHardwareBuffer().close();
                } catch (Exception e) {
                    OcrResult r = baseResult(displayCropRect, expectedPackage);
                    r.parseReason = "Capture DiscDJ impossible : " + e.getMessage();
                    cb.onResult(r);
                    return;
                }
                if (full.getWidth() < full.getHeight()) {
                    OcrResult r = baseResult(displayCropRect, expectedPackage);
                    r.fullScreenshotDataUrl = bitmapDataUrl(full, Bitmap.CompressFormat.JPEG, 45);
                    r.parseReason = "Orientation incorrecte : la capture reçue est en portrait alors que DiscDJ doit être en paysage.";
                    cb.onResult(r);
                    return;
                }

                float sx = full.getWidth() / (float) display[0];
                float sy = full.getHeight() / (float) display[1];
                Rect crop = new Rect(
                        Math.round(displayCropRect.left * sx),
                        Math.round(displayCropRect.top * sy),
                        Math.round(displayCropRect.right * sx),
                        Math.round(displayCropRect.bottom * sy)
                );
                if (!rectFullyVisible(crop, full.getWidth(), full.getHeight())) {
                    OcrResult r = baseResult(displayCropRect, expectedPackage);
                    r.fullScreenshotDataUrl = bitmapDataUrl(full, Bitmap.CompressFormat.JPEG, 45);
                    r.parseReason = "Zone OCR invalide dans la capture DiscDJ.";
                    cb.onResult(r);
                    return;
                }

                Bitmap cropped = Bitmap.createBitmap(full, crop.left, crop.top, crop.width(), crop.height());
                OcrResult result = baseResult(displayCropRect, expectedPackage);
                result.fullScreenshotDataUrl = bitmapDataUrl(full, Bitmap.CompressFormat.JPEG, 45);
                Bitmap ocrInput = prepareForOcr(cropped);
                result.croppedDataUrl = bitmapDataUrl(cropped, Bitmap.CompressFormat.PNG, 100);
                result.ocrInputDataUrl = bitmapDataUrl(ocrInput, Bitmap.CompressFormat.PNG, 100);

                TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
                recognizer.process(InputImage.fromBitmap(ocrInput, 0))
                        .addOnSuccessListener(text -> {
                            List<String> candidates = extractOcrTexts(text);
                            result.zoneTexts.addAll(candidates);
                            result.raw = join(candidates);
                            if (containsBadSourceText(result.raw)) {
                                result.sourceOk = false;
                                result.parseReason = "Mauvaise source d'image capturée : le texte OCR contient des éléments de MixOrder ou d'un overlay.";
                            } else {
                                result.bpm = parseBestBpm(candidates);
                                if (result.bpm == null) {
                                    result.parseReason = result.raw == null || result.raw.isEmpty()
                                            ? "OCR vide dans le rectangle BPM calibré."
                                            : "Texte OCR brut lu, mais aucun BPM valide entre 40 et 240 n'a été retenu.";
                                }
                            }
                            recognizer.close();
                            cb.onResult(result);
                        })
                        .addOnFailureListener(e -> {
                            result.parseReason = "OCR impossible : " + e.getMessage();
                            recognizer.close();
                            cb.onResult(result);
                        });
            }

            @Override
            public void onFailure(int errorCode) {
                OcrResult r = baseResult(displayCropRect, expectedPackage);
                r.parseReason = "Capture DiscDJ refusée par Android (code " + errorCode + ").";
                cb.onResult(r);
            }
        });
        } catch (Exception e) {
            OcrResult r = baseResult(displayCropRect, expectedPackage);
            r.parseReason = "Capture DiscDJ impossible : " + e.getMessage();
            cb.onResult(r);
        }
    }

    private OcrResult baseResult(Rect crop, String expectedPackage) {
        OcrResult r = new OcrResult();
        int[] display = getDisplaySize();
        r.displayWidth = display[0];
        r.displayHeight = display[1];
        r.cropRect = crop != null ? new Rect(crop) : new Rect();
        WindowSnapshot snap = getWindowSnapshot(expectedPackage);
        r.sourcePackage = snap.packageName;
        r.sourceOk = snap.foregroundMatches;
        return r;
    }

    private static List<String> extractOcrTexts(Text text) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;
        for (Text.TextBlock block : text.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                String s = line.getText();
                if (s != null && !s.trim().isEmpty()) out.add(s.trim());
            }
        }
        if (out.isEmpty() && text.getText() != null && !text.getText().trim().isEmpty()) {
            out.add(text.getText().trim());
        }
        return out;
    }

    private static String join(List<String> texts) {
        StringBuilder b = new StringBuilder();
        if (texts == null) return "";
        for (String s : texts) {
            if (s == null || s.trim().isEmpty()) continue;
            if (b.length() > 0) b.append(' ');
            b.append(s.trim());
        }
        return b.toString();
    }

    private static boolean containsBadSourceText(String raw) {
        if (raw == null) return false;
        String lower = raw.toLowerCase(Locale.ROOT);
        for (String k : BAD_SOURCE_KEYWORDS) if (lower.contains(k)) return true;
        return false;
    }

    private static String bitmapDataUrl(Bitmap bitmap, Bitmap.CompressFormat format, int quality) {
        if (bitmap == null) return null;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bitmap.compress(format, quality, out);
        String mime = format == Bitmap.CompressFormat.PNG ? "image/png" : "image/jpeg";
        return "data:" + mime + ";base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    /** Upscale + high-contrast binarization for small stylized BPM displays. */
    private static Bitmap prepareForOcr(Bitmap source) {
        if (source == null) return null;
        int scale = Math.max(2, Math.min(4, 1500 / Math.max(1, Math.max(source.getWidth(), source.getHeight()))));
        Bitmap scaled = Bitmap.createScaledBitmap(source, source.getWidth() * scale, source.getHeight() * scale, true);
        int w = scaled.getWidth();
        int h = scaled.getHeight();
        int[] pixels = new int[w * h];
        scaled.getPixels(pixels, 0, w, 0, 0, w, h);
        long sum = 0;
        int[] lum = new int[pixels.length];
        for (int i = 0; i < pixels.length; i++) {
            int c = pixels[i];
            int l = (int) (Color.red(c) * 0.299 + Color.green(c) * 0.587 + Color.blue(c) * 0.114);
            lum[i] = l;
            sum += l;
        }
        int avg = pixels.length > 0 ? (int) (sum / pixels.length) : 128;
        boolean brightTextOnDark = avg < 128;
        int margin = 18;
        for (int i = 0; i < pixels.length; i++) {
            boolean textPixel = brightTextOnDark ? lum[i] > avg + margin : lum[i] < avg - margin;
            pixels[i] = textPixel ? Color.BLACK : Color.WHITE;
        }
        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        out.setPixels(pixels, 0, w, 0, 0, w, h);
        return out;
    }

    public static Double parseBestBpm(List<String> texts) {
        if (texts != null) {
            for (String t : texts) {
                Matcher m = BPM_LABELED_PATTERN.matcher(t == null ? "" : t);
                if (m.find()) {
                    Double v = tryParseBpm(m.group(1));
                    if (v != null) return v;
                }
            }
            for (String t : texts) {
                if (t == null) continue;
                Double v = parseBpm(t);
                if (v != null && looksLikeBpmText(t)) return v;
            }
        }
        return null;
    }

    private static boolean looksLikeBpmText(String t) {
        String compact = t == null ? "" : t.trim().replaceAll("\\s+", "");
        return compact.toUpperCase(Locale.ROOT).contains("BPM") || compact.matches("^\\d{2,3}([.,]\\d+)?$");
    }

    public static Double parseBpm(String raw) {
        if (raw == null) return null;
        Matcher m = BPM_LABELED_PATTERN.matcher(raw);
        if (m.find()) {
            Double v = tryParseBpm(m.group(1));
            if (v != null) return v;
        }
        Matcher m2 = BPM_LOOSE_PATTERN.matcher(raw);
        while (m2.find()) {
            Double v = tryParseBpm(m2.group(1));
            if (v != null) return v;
        }
        return null;
    }

    private static Double tryParseBpm(String s) {
        if (s == null) return null;
        try {
            double v = Double.parseDouble(s.replace(',', '.'));
            if (v < 40 || v > 240) return null;
            return v;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public static String extractDuration(String raw) {
        if (raw == null) return null;
        Matcher m = DURATION_PATTERN.matcher(raw);
        return m.find() ? m.group(0) : null;
    }

    public interface TapCallback {
        void onResult(boolean ok, String reason);
    }

    public void tapAt(final float x, final float y, final int durationMs, final TapCallback callback) {
        Path p = new Path();
        p.moveTo(x, y);
        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(p, 0, Math.max(45, durationMs));
        GestureDescription gesture = new GestureDescription.Builder().addStroke(stroke).build();

        new Handler(Looper.getMainLooper()).post(() -> {
            boolean accepted = dispatchGesture(gesture, new GestureResultCallback() {
                @Override public void onCompleted(GestureDescription g) { callback.onResult(true, "completed"); }
                @Override public void onCancelled(GestureDescription g) { callback.onResult(false, "cancelled"); }
            }, null);
            if (!accepted) callback.onResult(false, "not-accepted");
        });
    }

    public interface CaptureCallback {
        void onResult(boolean cancelled, float nx, float ny, float nw, float nh);
    }

    private WindowManager windowManager;
    private View overlayView;

    private void removeOverlay() {
        if (overlayView != null && windowManager != null) {
            try { windowManager.removeView(overlayView); } catch (Exception ignored) {}
        }
        overlayView = null;
    }

    public void startCalibration(final boolean zone, final String instructions, final CaptureCallback cb) {
        new Handler(Looper.getMainLooper()).post(() -> {
            removeOverlay();
            windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
            int[] size = getDisplaySize();
            CalibrationOverlay view = new CalibrationOverlay(this, zone, instructions, size[0], size[1], (cancelled, nx, ny, nw, nh) -> {
                removeOverlay();
                cb.onResult(cancelled, nx, ny, nw, nh);
            });
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                            | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                    PixelFormat.TRANSLUCENT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            }
            overlayView = view;
            try {
                windowManager.addView(view, lp);
            } catch (Exception e) {
                overlayView = null;
                cb.onResult(true, 0, 0, 0, 0);
            }
        });
    }

    private static class CalibrationOverlay extends View {
        private final boolean zone;
        private final String instructions;
        private final CaptureCallback cb;
        private final int refW;
        private final int refH;
        private final Paint scrim = new Paint();
        private final Paint markerStroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint markerDot = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint zoneFill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint textBg = new Paint();
        private float downX, downY, curX, curY;
        private boolean hasPoint = false;

        CalibrationOverlay(Context ctx, boolean zone, String instructions, int refW, int refH, CaptureCallback cb) {
            super(ctx);
            this.zone = zone;
            this.instructions = instructions != null ? instructions : "";
            this.cb = cb;
            this.refW = refW;
            this.refH = refH;
            scrim.setColor(Color.argb(60, 0, 0, 0));
            markerStroke.setColor(Color.rgb(250, 204, 21));
            markerStroke.setStyle(Paint.Style.STROKE);
            markerStroke.setStrokeWidth(2f);
            markerDot.setColor(Color.rgb(250, 204, 21));
            markerDot.setStyle(Paint.Style.FILL);
            zoneFill.setColor(Color.argb(70, 250, 204, 21));
            zoneFill.setStyle(Paint.Style.FILL);
            text.setColor(Color.WHITE);
            text.setTextSize(36f);
            text.setFakeBoldText(true);
            textBg.setColor(Color.argb(210, 15, 23, 42));
            setFocusableInTouchMode(true);
        }

        @Override
        protected void onDraw(Canvas c) {
            super.onDraw(c);
            c.drawRect(0, 0, getWidth(), getHeight(), scrim);
            float pad = 24f;
            c.drawRect(0, 28, getWidth(), 138, textBg);
            drawWrapped(c, instructions, pad, 60f);
            c.drawText("Appuie sur RETOUR pour annuler.", pad, 124f, hintPaint());
            if (!hasPoint) return;
            if (zone) {
                float l = Math.min(downX, curX), t = Math.min(downY, curY);
                float r = Math.max(downX, curX), b = Math.max(downY, curY);
                c.drawRect(l, t, r, b, zoneFill);
                Paint stroke = new Paint(markerStroke);
                stroke.setStrokeWidth(3f);
                c.drawRect(l, t, r, b, stroke);
            } else {
                c.drawCircle(curX, curY, 1.5f, markerDot);
                c.drawCircle(curX, curY, 6f, markerStroke);
                c.drawLine(curX - 10, curY, curX - 3, curY, markerStroke);
                c.drawLine(curX + 3, curY, curX + 10, curY, markerStroke);
                c.drawLine(curX, curY - 10, curX, curY - 3, markerStroke);
                c.drawLine(curX, curY + 3, curX, curY + 10, markerStroke);
            }
        }

        private Paint hintPaint() {
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            p.setColor(Color.rgb(148, 163, 184));
            p.setTextSize(24f);
            return p;
        }

        private void drawWrapped(Canvas c, String s, float x, float y) {
            String[] words = s.split(" ");
            StringBuilder line = new StringBuilder();
            float maxW = getWidth() - x * 2;
            float ly = y;
            for (String w : words) {
                String test = line.length() == 0 ? w : line + " " + w;
                if (text.measureText(test) > maxW && line.length() > 0) {
                    c.drawText(line.toString(), x, ly, text);
                    ly += 40f;
                    line = new StringBuilder(w);
                } else line = new StringBuilder(test);
            }
            if (line.length() > 0) c.drawText(line.toString(), x, ly, text);
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = curX = e.getRawX(); downY = curY = e.getRawY(); hasPoint = true; invalidate(); return true;
                case MotionEvent.ACTION_MOVE:
                    curX = e.getRawX(); curY = e.getRawY(); invalidate(); return true;
                case MotionEvent.ACTION_UP:
                    curX = e.getRawX(); curY = e.getRawY(); finish(); return true;
            }
            return true;
        }

        @Override
        public boolean dispatchKeyEventPreIme(android.view.KeyEvent event) {
            int keyCode = event != null ? event.getKeyCode() : 0;
            if (keyCode == android.view.KeyEvent.KEYCODE_BACK) { cb.onResult(true, 0, 0, 0, 0); return true; }
            return super.dispatchKeyEventPreIme(event);
        }

        private void finish() {
            float sw = refW > 0 ? refW : getWidth();
            float sh = refH > 0 ? refH : getHeight();
            if (sw <= 0 || sh <= 0) { cb.onResult(true, 0, 0, 0, 0); return; }
            if (zone) {
                float l = Math.min(downX, curX), t = Math.min(downY, curY);
                float r = Math.max(downX, curX), b = Math.max(downY, curY);
                if (r - l < 12 || b - t < 12) { cb.onResult(true, 0, 0, 0, 0); return; }
                float[] a = pointToCanonical(l, t, (int) sw, (int) sh);
                float[] btm = pointToCanonical(r, b, (int) sw, (int) sh);
                float x1 = Math.min(a[0], btm[0]), y1 = Math.min(a[1], btm[1]);
                float x2 = Math.max(a[0], btm[0]), y2 = Math.max(a[1], btm[1]);
                cb.onResult(false, x1, y1, x2 - x1, y2 - y1);
            } else {
                float[] p = pointToCanonical(curX, curY, (int) sw, (int) sh);
                cb.onResult(false, p[0], p[1], 0, 0);
            }
        }
    }

    private static float clamp(float v) {
        if (Float.isNaN(v) || Float.isInfinite(v)) return 0f;
        return Math.max(0f, Math.min(1f, v));
    }
}