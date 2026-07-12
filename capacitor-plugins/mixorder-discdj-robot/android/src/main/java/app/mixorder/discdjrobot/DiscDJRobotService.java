package app.mixorder.discdjrobot;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Rect;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Foreground service that owns the DiscDJ analysis loop. It survives the
 * WebView / MixOrder activity being backgrounded or killed, drives the
 * AccessibilityService for taps + OCR, and reports progress through the
 * Capacitor plugin.
 */
public class DiscDJRobotService extends Service {

    public static final String ACTION_START = "app.mixorder.discdjrobot.START";
    public static final String CHANNEL_ID = "mixorder-discdj-robot";
    public static final int NOTIF_ID = 4211;

    private static final String PREFS = "discdj_robot_state";
    private static final String KEY_STATE = "state";

    private static DiscDJRobotService instance;

    public interface Listener {
        void onEvent(String name, JSONObject payload);
    }

    private static Listener listener;

    public static void setListener(Listener l) { listener = l; }

    public static DiscDJRobotService getInstance() { return instance; }

    // --- Run state (in-memory) ---
    static class TrackItem {
        String id, path, name, originalName;
        boolean hasBpm;
    }

    private final List<TrackItem> tracks = new ArrayList<>();
    private String projectFingerprint;
    private String projectName;
    private int deck = 1;
    private int index = 0; // 0-based, next track to process
    private int total = 0;
    private boolean skipAlreadyBpm = true;
    private boolean replaceExisting = false;
    private JSONObject nextPoint;
    private JSONObject bpmZone;
    private String discdjPackage;
    private int waitAfterClickMs = 1200;
    private int waitBeforeReadMs = 800;
    private int pressDurationMs = 120;
    private int maxAttempts = 3;
    private String analysisMode = "auto-sync";
    private JSONObject playlistButton;
    private JSONObject backButton;
    private JSONObject nameZone;
    private int waitAfterPlaylistOpenMs = 900;
    private int waitAfterBackMs = 700;
    private int nameMaxOcrRetries = 3;

    private volatile boolean running = false;
    private volatile boolean userPaused = false;
    private volatile boolean visibilityPaused = false;
    private String phase = "idle";
    private Double lastBpm = null;
    private String currentName = null;
    private long stepStartedAt = 0L;
    private final List<Long> recentStepMs = new ArrayList<>();

    private Handler main;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        main = new Handler(Looper.getMainLooper());
        ensureChannel();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) return START_NOT_STICKY;
        String action = intent.getAction();
        switch (action) {
            case ACTION_START:
                startForegroundNotif("Analyse DiscDJ démarrée", "Préparation…");
                loadFromIntent(intent);
                running = true;
                userPaused = false;
                phase = "opening";
                emit("discdjPhase", jo("phase", phase));
                scheduleTick(300);
                break;
            case DiscDJRobotReceiver.ACTION_PAUSE:
                userPaused = true;
                phase = "paused";
                updateNotif();
                emit("discdjPhase", jo("phase", phase));
                break;
            case DiscDJRobotReceiver.ACTION_RESUME:
                userPaused = false;
                if (running) {
                    phase = "reading";
                    updateNotif();
                    emit("discdjPhase", jo("phase", phase));
                    scheduleTick(200);
                }
                break;
            case DiscDJRobotReceiver.ACTION_STOP:
                stopRun(true);
                break;
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    // --- Public status ---
    public synchronized JSONObject getStatus() {
        JSONObject o = new JSONObject();
        try {
            o.put("running", running);
            o.put("phase", phase);
            o.put("index", index);
            o.put("total", total);
            o.put("bpm", lastBpm == null ? JSONObject.NULL : lastBpm);
            o.put("userPaused", userPaused);
            o.put("visibilityPaused", visibilityPaused);
            o.put("currentName", currentName);
            o.put("etaMs", computeEta());
            o.put("projectFingerprint", projectFingerprint);
            SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
            String raw = p.getString(KEY_STATE, null);
            if (raw != null) {
                JSONObject saved = new JSONObject(raw);
                o.put("interrupted", saved.optBoolean("interrupted", false));
                o.put("lastPath", saved.optString("lastPath", null));
                o.put("savedIndex", saved.optInt("index", 0));
                o.put("savedTotal", saved.optInt("total", 0));
                o.put("savedProjectFingerprint", saved.optString("projectFingerprint", null));
                o.put("savedProjectName", saved.optString("projectName", null));
                o.put("savedDeck", saved.optInt("deck", 1));
            }
        } catch (JSONException ignored) {}
        return o;
    }

    // --- Setup ---
    private void loadFromIntent(Intent intent) {
        tracks.clear();
        recentStepMs.clear();
        try {
            String payload = intent.getStringExtra("payload");
            JSONObject p = new JSONObject(payload);
            deck = p.optInt("deck", 1);
            analysisMode = p.optString("analysisMode", "auto-sync");
            index = Math.max(0, p.optInt("startIndex", 0));
            projectFingerprint = p.optString("projectFingerprint", "");
            projectName = p.optString("projectName", "");
            discdjPackage = p.optString("discdjPackage", null);
            skipAlreadyBpm = p.optBoolean("skipAlreadyBpm", true);
            replaceExisting = p.optBoolean("replaceExisting", false);
            waitAfterClickMs = p.optInt("waitAfterClickMs", 1200);
            waitBeforeReadMs = p.optInt("waitBeforeReadMs", 800);
            waitAfterPlaylistOpenMs = p.optInt("waitAfterPlaylistOpenMs", 900);
            waitAfterBackMs = p.optInt("waitAfterBackMs", 700);
            pressDurationMs = p.optInt("pressDurationMs", 120);
            maxAttempts = Math.max(1, p.optInt("maxAttempts", 3));
            nameMaxOcrRetries = Math.max(1, p.optInt("nameMaxOcrRetries", 3));
            nextPoint = p.optJSONObject("nextPoint");
            bpmZone = p.optJSONObject("bpmZone");
            playlistButton = p.optJSONObject("playlistButton");
            backButton = p.optJSONObject("backButton");
            nameZone = p.optJSONObject("nameZone");
            JSONArray arr = p.optJSONArray("tracks");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject t = arr.getJSONObject(i);
                    TrackItem ti = new TrackItem();
                    ti.id = t.optString("id");
                    ti.path = t.optString("path");
                    ti.name = t.optString("name");
                    ti.originalName = t.optString("originalName", ti.name);
                    ti.hasBpm = t.optBoolean("hasBpm", false);
                    tracks.add(ti);
                }
            }
            total = tracks.size();
        } catch (Exception e) {
            emitLog("error", "Payload invalide: " + e.getMessage());
        }
        int waitOpen = 0;
        try {
            waitOpen = new JSONObject(intent.getStringExtra("payload")).optInt("waitOnOpenMs", 1000);
        } catch (Exception ignored) {}
        // Bring DiscDJ up
        if (discdjPackage != null) {
            try {
                Intent launch = getPackageManager().getLaunchIntentForPackage(discdjPackage);
                if (launch != null) {
                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                    startActivity(launch);
                }
            } catch (Exception ignored) {}
        }
        // Small delay before the first read for DiscDJ to fully load.
        if (waitOpen > 0) {
            try { Thread.sleep(Math.min(2500, waitOpen)); } catch (InterruptedException ignored) {}
        }
    }

    // --- Loop ---
    private void scheduleTick(long delayMs) {
        if (main == null) return;
        main.postDelayed(this::tick, delayMs);
    }

    private void tick() {
        if (!running) return;
        if (userPaused) return;

        // Check DiscDJ visibility.
        DiscDJAccessibilityService svc = DiscDJAccessibilityService.getInstance();
        if (svc == null || discdjPackage == null) {
            visibilityPaused = true;
            phase = "paused";
            updateNotif();
            emit("discdjVisibilityPaused", jo("visible", false));
            scheduleTick(1200);
            return;
        }
        DiscDJAccessibilityService.WindowSnapshot snap = svc.getWindowSnapshot(discdjPackage);
        if (!snap.foregroundMatches || !snap.landscape) {
            if (!visibilityPaused) {
                visibilityPaused = true;
                phase = "paused";
                emitLog("warning", snap.foregroundMatches
                        ? "DiscDJ n'est pas en paysage — analyse en pause."
                        : "DiscDJ n'est plus au premier plan — analyse en pause.");
                emit("discdjVisibilityPaused", jo("visible", false));
                updateNotif();
            }
            scheduleTick(1500);
            return;
        }
        if (visibilityPaused) {
            visibilityPaused = false;
            emitLog("success", "DiscDJ est revenu au premier plan — reprise automatique.");
            emit("discdjVisibilityPaused", jo("visible", true));
        }

        if (index >= total) { finishRun(); return; }

        TrackItem track = tracks.get(index);
        currentName = track.name;
        stepStartedAt = System.currentTimeMillis();

        if (skipAlreadyBpm && track.hasBpm && !replaceExisting) {
            emitLog("info", "Morceau " + (index + 1) + "/" + total + " ignoré (BPM déjà présent).");
            advance();
            return;
        }

        phase = "reading";
        updateNotif();
        emit("discdjPhase", jo("phase", phase, "index", index + 1, "total", total));

        if ("autosync-name".equals(analysisMode)) readNameCheckedStep(0);
        else readOnce(0);
    }

    private void readNameCheckedStep(int attempt) {
        if (!running || userPaused) return;
        DiscDJAccessibilityService svc = DiscDJAccessibilityService.getInstance();
        if (svc == null) { scheduleTick(500); return; }
        Rect crop = rectFromJson(svc, bpmZone);
        if (crop == null) { emitLog("error", "Zone BPM invalide."); skipAndAdvance(); return; }
        final int attemptFinal = attempt;
        main.postDelayed(() -> svc.readBpmFromScreenshot(crop, discdjPackage, result -> {
            if (result.bpm == null) {
                retryNameCheckedStep(attemptFinal, "BPM illisible : " + result.parseReason);
                return;
            }
            final double bpm = Math.round(result.bpm);
            tapPoint(playlistButton, ok -> {
                if (!ok) { retryNameCheckedStep(attemptFinal, "Clic Playlist refusé."); return; }
                main.postDelayed(() -> readNameAndMatch(attemptFinal, bpm, 0), Math.max(250, waitAfterPlaylistOpenMs));
            });
        }), Math.max(250, waitBeforeReadMs));
    }

    private void readNameAndMatch(int attempt, double bpm, int nameAttempt) {
        if (!running || userPaused) return;
        DiscDJAccessibilityService svc = DiscDJAccessibilityService.getInstance();
        if (svc == null) { scheduleTick(500); return; }
        Rect crop = rectFromJson(svc, nameZone);
        if (crop == null) { backThenRetryOrSkip(attempt, "Zone Nom invalide."); return; }
        svc.readBpmFromScreenshot(crop, discdjPackage, result -> {
            List<String> candidates = buildNameCandidates(result.raw, result.zoneTexts);
            Match match = resolveMatch(candidates, tracks.get(index));
            if (match.track != null) {
                TrackItem t = match.track;
                lastBpm = bpm;
                currentName = t.name;
                emitLog("success", "Morceau " + (index + 1) + "/" + total + " · BPM " + ((int) bpm) + " · « " + (candidates.isEmpty() ? "" : candidates.get(0)) + " » → « " + t.name + " »");
                try {
                    JSONObject payload = new JSONObject();
                    payload.put("trackId", t.id);
                    payload.put("path", t.path);
                    payload.put("bpm", bpm);
                    payload.put("index", index + 1);
                    payload.put("total", total);
                    emit("discdjBpm", payload);
                } catch (JSONException ignored) {}
                saveState(false, t.path);
                tapPoint(backButton, ignored -> main.postDelayed(this::advance, Math.max(250, waitAfterBackMs)));
            } else if (nameAttempt + 1 < nameMaxOcrRetries) {
                main.postDelayed(() -> readNameAndMatch(attempt, bpm, nameAttempt + 1), 350);
            } else {
                String ocr = candidates.isEmpty() ? "" : candidates.get(0);
                String guess = match.bestTrack != null ? " (meilleur candidat: « " + match.bestTrack.name + " » " + Math.round(match.bestScore * 100) + "%)" : "";
                backThenRetryOrSkip(attempt, "Aucun morceau MixOrder ne correspond à « " + ocr + " »" + guess + ".");
            }
        });
    }

    private void retryNameCheckedStep(int attempt, String reason) {
        if (attempt + 1 < maxAttempts) {
            emitLog("warning", reason + " Nouvelle tentative.");
            main.postDelayed(() -> readNameCheckedStep(attempt + 1), 500);
        } else {
            emitLog("warning", reason + " Morceau marqué à réanalyser.");
            skipAndAdvance();
        }
    }

    private void backThenRetryOrSkip(int attempt, String reason) {
        tapPoint(backButton, ignored -> main.postDelayed(() -> retryNameCheckedStep(attempt, reason), Math.max(250, waitAfterBackMs)));
    }

    private void readOnce(int attempt) {
        if (!running || userPaused) return;
        DiscDJAccessibilityService svc = DiscDJAccessibilityService.getInstance();
        if (svc == null) { scheduleTick(500); return; }
        try { Thread.sleep(Math.min(400, waitBeforeReadMs)); } catch (InterruptedException ignored) {}

        Rect crop = null;
        if (bpmZone != null) {
            int[] size = svc.getDisplaySize();
            crop = DiscDJAccessibilityService.rectFromCanonical(
                    bpmZone.optDouble("x", 0), bpmZone.optDouble("y", 0),
                    bpmZone.optDouble("width", 0), bpmZone.optDouble("height", 0),
                    size[0], size[1]);
        }
        if (crop == null || !DiscDJAccessibilityService.rectFullyVisible(crop, svc.getDisplaySize()[0], svc.getDisplaySize()[1])) {
            emitLog("error", "Zone BPM invalide.");
            skipAndAdvance();
            return;
        }
        final int attemptFinal = attempt;
        svc.readBpmFromScreenshot(crop, discdjPackage, result -> {
            if (result.bpm != null) {
                lastBpm = result.bpm;
                TrackItem t = tracks.get(index);
                emitLog("success", "Morceau " + (index + 1) + "/" + total + " « " + t.name + " » : BPM " + result.bpm);
                try {
                    JSONObject payload = new JSONObject();
                    payload.put("trackId", t.id);
                    payload.put("path", t.path);
                    payload.put("bpm", result.bpm);
                    payload.put("index", index + 1);
                    payload.put("total", total);
                    emit("discdjBpm", payload);
                } catch (JSONException ignored) {}
                saveState(false, t.path);
                advance();
            } else if (attemptFinal + 1 < maxAttempts) {
                emitLog("warning", "Lecture BPM échec tentative " + (attemptFinal + 1) + " — réessai.");
                main.postDelayed(() -> readOnce(attemptFinal + 1), 500);
            } else {
                emitLog("warning", "BPM illisible pour le morceau " + (index + 1) + " : " + result.parseReason);
                skipAndAdvance();
            }
        });
    }

    private void skipAndAdvance() { advance(); }

    private void advance() {
        long elapsed = System.currentTimeMillis() - stepStartedAt;
        recentStepMs.add(elapsed);
        if (recentStepMs.size() > 5) recentStepMs.remove(0);
        index++;
        emit("discdjProgress", jo("index", index, "total", total, "etaMs", computeEta()));
        updateNotif();
        if (index >= total) { finishRun(); return; }

        // Tap Next then wait for next track to load.
        DiscDJAccessibilityService svc = DiscDJAccessibilityService.getInstance();
        if (svc == null || nextPoint == null) { scheduleTick(500); return; }
        int[] size = svc.getDisplaySize();
        float[] xy = DiscDJAccessibilityService.pointFromCanonical(
                (float) nextPoint.optDouble("x", 0), (float) nextPoint.optDouble("y", 0),
                size[0], size[1]);
        phase = "advancing";
        emit("discdjPhase", jo("phase", phase));
        svc.tapAt(xy[0], xy[1], pressDurationMs, (ok, reason) -> {
            if (!ok) emitLog("error", "Clic Next échoué: " + reason);
            scheduleTick(Math.max(400, waitAfterClickMs));
        });
    }

    private Rect rectFromJson(DiscDJAccessibilityService svc, JSONObject rect) {
        if (svc == null || rect == null) return null;
        int[] size = svc.getDisplaySize();
        Rect crop = DiscDJAccessibilityService.rectFromCanonical(
                rect.optDouble("x", 0), rect.optDouble("y", 0),
                rect.optDouble("width", 0), rect.optDouble("height", 0),
                size[0], size[1]);
        return DiscDJAccessibilityService.rectFullyVisible(crop, size[0], size[1]) ? crop : null;
    }

    private interface TapDone { void done(boolean ok); }

    private void tapPoint(JSONObject point, TapDone cb) {
        DiscDJAccessibilityService svc = DiscDJAccessibilityService.getInstance();
        if (svc == null || point == null) { cb.done(false); return; }
        int[] size = svc.getDisplaySize();
        float[] xy = DiscDJAccessibilityService.pointFromCanonical(
                (float) point.optDouble("x", 0), (float) point.optDouble("y", 0),
                size[0], size[1]);
        svc.tapAt(xy[0], xy[1], pressDurationMs, (ok, reason) -> cb.done(ok));
    }

    static class Match { TrackItem track; TrackItem bestTrack; double score; double bestScore; }

    private Match resolveMatch(List<String> ocrCandidates, TrackItem expected) {
        Match out = new Match();
        if (ocrCandidates == null || ocrCandidates.isEmpty() || expected == null) return out;
        for (TrackItem t : tracks) {
            double s = bestTrackScore(ocrCandidates, t);
            if (s > out.bestScore) { out.bestScore = s; out.bestTrack = t; }
        }
        double expectedScore = bestTrackScore(ocrCandidates, expected);
        if (expectedScore >= 0.50 || (expectedScore >= 0.38 && (out.bestTrack == expected || out.bestScore - expectedScore <= 0.16))) {
            out.track = expected;
            out.score = expectedScore;
        } else if (out.bestTrack != null && out.bestScore >= 0.55) {
            out.track = out.bestTrack;
            out.score = out.bestScore;
        }
        return out;
    }

    private static double bestTrackScore(List<String> ocrCandidates, TrackItem t) {
        double best = 0;
        for (String c : ocrCandidates) {
            best = Math.max(best, similarity(c, t.name));
            best = Math.max(best, similarity(c, t.originalName));
            best = Math.max(best, similarity(c, fileName(t.path)));
        }
        return best;
    }

    private static List<String> buildNameCandidates(String raw, List<String> zoneTexts) {
        List<String> out = new ArrayList<>();
        addCandidate(out, cleanOcrName(raw));
        if (zoneTexts != null) {
            StringBuilder joined = new StringBuilder();
            for (String z : zoneTexts) {
                addCandidate(out, cleanOcrName(z));
                if (z != null && !z.trim().isEmpty()) {
                    if (joined.length() > 0) joined.append(' ');
                    joined.append(z.trim());
                }
            }
            addCandidate(out, cleanOcrName(joined.toString()));
        }
        return out;
    }

    private static void addCandidate(List<String> out, String s) {
        if (s == null || s.isEmpty() || out.contains(s)) return;
        out.add(s);
    }

    private static String cleanOcrName(String input) {
        if (input == null) return "";
        String s = input.replaceAll("[\\p{Cntrl}]+", " ")
                .replaceAll("[·•●▪■□]", " ")
                .replaceAll("(?i)\\.(mp3|wav|flac|m4a|aac|ogg|wma|aiff)\\b", "")
                .replaceAll("(?i)\\bbpm\\s*[:=]?\\s*\\d{2,3}(?:[.,]\\d+)?\\b", " ")
                .replaceAll("^\\s*\\d{1,4}\\s*[_\\-–—.:]+\\s*", "")
                .replaceAll("[_\\-–—.·|/\\\\]+", " ")
                .replaceAll("\\s+", " ")
                .trim();
        String low = s.toLowerCase();
        if (low.length() < 2 || low.equals("unknown") || low.contains("playlist") || low.contains("pitch") || low.contains("sync")) return "";
        return s;
    }

    private static String normalizeName(String input) {
        if (input == null) return "";
        return java.text.Normalizer.normalize(input, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replaceAll("(?i)\\.(mp3|wav|flac|m4a|aac|ogg|wma|aiff)$", "")
                .replaceAll("(?i)\\b(official|music|video|audio|lyrics?|clip|hd|hq|remaster(?:ed)?|remix|edit|clean|explicit)\\b", " ")
                .replaceAll("^[\\s\\W_]*(?:\\d{1,4}[\\s._\\-–—]+)+", "")
                .replaceAll("[_\\-–—.·|/\\\\]+", " ")
                .replaceAll("[^\\p{L}\\p{N}\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim()
                .toLowerCase();
    }

    private static double similarity(String a, String b) {
        String na = normalizeName(a), nb = normalizeName(b);
        if (na.isEmpty() || nb.isEmpty()) return 0;
        if (na.equals(nb)) return 1;
        double dice = dice(na, nb);
        String longer = na.length() >= nb.length() ? na : nb;
        String shorter = na.length() >= nb.length() ? nb : na;
        if (shorter.length() >= 4 && longer.contains(shorter)) dice = Math.min(1, dice + 0.08);
        return dice;
    }

    private static double dice(String a, String b) {
        if (a.length() < 2 || b.length() < 2) return 0;
        java.util.Map<String, Integer> m = new java.util.HashMap<>();
        for (int i = 0; i < a.length() - 1; i++) {
            String g = a.substring(i, i + 2);
            m.put(g, m.getOrDefault(g, 0) + 1);
        }
        int inter = 0;
        for (int i = 0; i < b.length() - 1; i++) {
            String g = b.substring(i, i + 2);
            Integer c = m.get(g);
            if (c != null && c > 0) { inter++; m.put(g, c - 1); }
        }
        return (2.0 * inter) / ((a.length() - 1) + (b.length() - 1));
    }

    private static String fileName(String path) {
        if (path == null) return "";
        int a = path.lastIndexOf('/'), b = path.lastIndexOf('\\');
        int i = Math.max(a, b);
        return i >= 0 ? path.substring(i + 1) : path;
    }

    private void finishRun() {
        emitLog("success", "Analyse DiscDJ terminée.");
        phase = "done";
        running = false;
        saveState(false, null);
        emit("discdjDone", jo("index", index, "total", total));
        stopForeground(true);
        stopSelf();
    }

    private void stopRun(boolean userInitiated) {
        running = false;
        phase = "idle";
        emitLog("warning", userInitiated ? "Analyse arrêtée par l'utilisateur." : "Analyse arrêtée.");
        saveState(true, null);
        emit("discdjPhase", jo("phase", phase));
        stopForeground(true);
        stopSelf();
    }

    // --- Persistence ---
    private void saveState(boolean interrupted, String lastPath) {
        try {
            JSONObject o = new JSONObject();
            o.put("interrupted", interrupted && running);
            o.put("index", index);
            o.put("total", total);
            o.put("deck", deck);
            o.put("projectFingerprint", projectFingerprint);
            o.put("projectName", projectName);
            if (lastPath != null) o.put("lastPath", lastPath);
            o.put("savedAt", System.currentTimeMillis());
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_STATE, o.toString()).apply();
        } catch (JSONException ignored) {}
    }

    private long computeEta() {
        if (recentStepMs.isEmpty()) return -1;
        long sum = 0;
        for (long v : recentStepMs) sum += v;
        long avg = sum / recentStepMs.size();
        int remaining = Math.max(0, total - index);
        return avg * remaining;
    }

    // --- Notification ---
    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID,
                getString(R.string.mixorder_discdj_notif_channel),
                NotificationManager.IMPORTANCE_LOW);
        ch.setDescription(getString(R.string.mixorder_discdj_notif_channel_desc));
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    private void startForegroundNotif(String title, String text) {
        Notification n = buildNotification(title, text);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(NOTIF_ID, n);
            }
        } catch (Exception e) {
            startForeground(NOTIF_ID, n);
        }
    }

    private void updateNotif() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        String title;
        String text;
        if (visibilityPaused) {
            title = "En pause — DiscDJ n'est pas visible";
            text = "Rouvre DiscDJ (mode paysage) pour reprendre.";
        } else if (userPaused) {
            title = "Analyse en pause";
            text = "Morceau " + Math.min(index + 1, total) + "/" + total;
        } else {
            String name = currentName != null ? currentName : "";
            title = "Morceau " + Math.min(index + 1, total) + "/" + total
                    + (lastBpm != null ? " · " + lastBpm + " BPM" : "");
            long eta = computeEta();
            text = (name.isEmpty() ? "" : name + " · ") + (eta > 0 ? "reste ~" + (eta / 1000) + "s" : "");
        }
        nm.notify(NOTIF_ID, buildNotification(title, text));
    }

    private Notification buildNotification(String title, String text) {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        b.setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSmallIcon(android.R.drawable.stat_notify_sync);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

        PendingIntent piStop = PendingIntent.getBroadcast(this, 1,
                new Intent(this, DiscDJRobotReceiver.class).setAction(DiscDJRobotReceiver.ACTION_STOP), flags);
        b.addAction(new Notification.Action.Builder(null, "Arrêter", piStop).build());

        if (userPaused) {
            PendingIntent piResume = PendingIntent.getBroadcast(this, 2,
                    new Intent(this, DiscDJRobotReceiver.class).setAction(DiscDJRobotReceiver.ACTION_RESUME), flags);
            b.addAction(new Notification.Action.Builder(null, "Reprendre", piResume).build());
        } else {
            PendingIntent piPause = PendingIntent.getBroadcast(this, 3,
                    new Intent(this, DiscDJRobotReceiver.class).setAction(DiscDJRobotReceiver.ACTION_PAUSE), flags);
            b.addAction(new Notification.Action.Builder(null, "Pause", piPause).build());
        }
        return b.build();
    }

    // --- Events ---
    private void emit(String name, JSONObject payload) {
        Listener l = listener;
        if (l != null) l.onEvent(name, payload);
    }

    private void emitLog(String level, String message) {
        try {
            emit("discdjLog", new JSONObject().put("level", level).put("message", message));
        } catch (JSONException ignored) {}
    }

    private static JSONObject jo(String key, Object val) {
        try { return new JSONObject().put(key, val); } catch (JSONException e) { return new JSONObject(); }
    }

    private static JSONObject jo(Object... kv) {
        JSONObject o = new JSONObject();
        try {
            for (int i = 0; i + 1 < kv.length; i += 2) {
                o.put(String.valueOf(kv[i]), kv[i + 1]);
            }
        } catch (JSONException ignored) {}
        return o;
    }

    // --- Static helper for the plugin ---
    public static JSONObject readSavedState(Context ctx) {
        try {
            String raw = ctx.getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_STATE, null);
            if (raw == null) return null;
            return new JSONObject(raw);
        } catch (Exception e) { return null; }
    }

    public static void clearSavedState(Context ctx) {
        ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(KEY_STATE).apply();
    }
}
