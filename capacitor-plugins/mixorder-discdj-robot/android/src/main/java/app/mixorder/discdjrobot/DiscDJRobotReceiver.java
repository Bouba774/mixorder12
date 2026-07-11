package app.mixorder.discdjrobot;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Handles notification actions (Pause / Resume / Stop) and forwards them
 * to the foreground service.
 */
public class DiscDJRobotReceiver extends BroadcastReceiver {
    public static final String ACTION_PAUSE = "app.mixorder.discdjrobot.PAUSE";
    public static final String ACTION_RESUME = "app.mixorder.discdjrobot.RESUME";
    public static final String ACTION_STOP = "app.mixorder.discdjrobot.STOP";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        Intent svc = new Intent(context, DiscDJRobotService.class);
        svc.setAction(intent.getAction());
        context.startService(svc);
    }
}
