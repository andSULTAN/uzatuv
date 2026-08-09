package uz.uzatuv.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import uz.uzatuv.DeviceInfo
import uz.uzatuv.MainActivity
import uz.uzatuv.MirrorController
import uz.uzatuv.MirrorState
import uz.uzatuv.PairingInfo
import uz.uzatuv.R
import uz.uzatuv.capture.ScreenCaptureEncoder
import uz.uzatuv.protocol.Proto
import uz.uzatuv.transport.TransportClientImpl
import java.util.UUID
import androidx.core.content.edit
import android.util.Base64

/**
 * MediaProjectionService — ekran uzatilishi davomida ishlab turadigan foreground service.
 *
 * Android 14 (FGS) qoidalari:
 *   - Manifestda foregroundServiceType="mediaProjection"
 *   - startForeground(...) MediaProjection'ni OLISHDAN OLDIN chaqiriladi
 *   - Doimiy bildirishnoma ("Ekran uzatilmoqda") ko'rsatiladi
 */
class MediaProjectionService : Service() {

    companion object {
        private const val TAG = "UzatuvService"
        private const val CHANNEL_ID = "uzatuv_mirroring"
        private const val NOTIF_ID = 1001
        private const val PREFS = "uzatuv"
        private const val KEY_DEVICE_ID = "deviceId"

        const val ACTION_START = "uz.uzatuv.action.START"
        const val ACTION_STOP = "uz.uzatuv.action.STOP"

        private const val EX_RESULT_CODE = "resultCode"
        private const val EX_RESULT_DATA = "resultData"
        private const val EX_IP = "ip"
        private const val EX_PORT = "port"
        private const val EX_SERVER_ID = "serverId"
        private const val EX_NAME = "name"
        private const val EX_VERSION = "version"
        private const val EX_KEY_B64 = "keyB64"

        /** START intent'ini yig'adi (MediaProjection ruxsati + pairing bilan). */
        fun startIntent(
            ctx: Context,
            resultCode: Int,
            resultData: Intent,
            pairing: PairingInfo,
        ): Intent = Intent(ctx, MediaProjectionService::class.java).apply {
            action = ACTION_START
            putExtra(EX_RESULT_CODE, resultCode)
            putExtra(EX_RESULT_DATA, resultData)
            putExtra(EX_IP, pairing.ip)
            putExtra(EX_PORT, pairing.port)
            putExtra(EX_SERVER_ID, pairing.serverId)
            putExtra(EX_NAME, pairing.name)
            putExtra(EX_VERSION, pairing.version)
            putExtra(EX_KEY_B64, Base64.encodeToString(pairing.sessionKey, Base64.NO_WRAP))
        }

        fun stopIntent(ctx: Context): Intent =
            Intent(ctx, MediaProjectionService::class.java).apply { action = ACTION_STOP }
    }

    private var mediaProjection: MediaProjection? = null
    private var encoder: ScreenCaptureEncoder? = null
    private var controller: MirrorController? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> { stopMirroring("user_stopped"); return START_NOT_STICKY }
            ACTION_START -> handleStart(intent)
            else -> stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun handleStart(intent: Intent) {
        // 1) Avval foreground bo'lamiz (Android 14 talabi)
        createChannel()
        startAsForeground()

        // 2) MediaProjection'ni olamiz
        val resultCode = intent.getIntExtra(EX_RESULT_CODE, 0)
        val data: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(EX_RESULT_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION") intent.getParcelableExtra(EX_RESULT_DATA)
        }
        if (data == null) { Log.e(TAG, "MediaProjection data yo'q"); stopSelf(); return }

        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val mp = mpm.getMediaProjection(resultCode, data)
        if (mp == null) { Log.e(TAG, "MediaProjection null"); stopSelf(); return }
        mediaProjection = mp

        // 3) Pairing'ni tiklaymiz
        val pairing = PairingInfo(
            version = intent.getIntExtra(EX_VERSION, Proto.PROTOCOL_VERSION),
            ip = intent.getStringExtra(EX_IP) ?: run { stopSelf(); return },
            port = intent.getIntExtra(EX_PORT, Proto.DEFAULT_PORT),
            serverId = intent.getStringExtra(EX_SERVER_ID) ?: "",
            name = intent.getStringExtra(EX_NAME) ?: "PC",
            sessionKey = Base64.decode(intent.getStringExtra(EX_KEY_B64) ?: "", Base64.NO_WRAP),
        )

        // 4) Ekran o'lchamlari
        val metrics = screenMetrics()
        val device = buildDeviceInfo(metrics)

        // 5) Encoder + Transport + Controller
        val enc = ScreenCaptureEncoder(mp, metrics.widthPixels, metrics.heightPixels, metrics.densityDpi)
        val transport = TransportClientImpl(device)
        val ctrl = MirrorController(transport, enc, device, metrics.widthPixels, metrics.heightPixels)
        encoder = enc
        controller = ctrl

        MirrorState.setActive(true)
        ctrl.start(pairing)
        Log.i(TAG, "Uzatish boshlandi: ${pairing.name} (${pairing.ip}:${pairing.port})")
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // Ekran aylandi — encoder va serverni xabardor qilamiz
        val m = screenMetrics()
        val rotation = displayRotationDegrees()
        controller?.onScreenResize(m.widthPixels, m.heightPixels, rotation)
    }

    private fun stopMirroring(reason: String) {
        try { controller?.stop(reason) } catch (e: Exception) { Log.w(TAG, "stop xatosi", e) }
        controller = null
        encoder = null
        mediaProjection = null
        MirrorState.setActive(false)
        stopForegroundCompat()
        stopSelf()
    }

    override fun onDestroy() {
        super.onDestroy()
        try { controller?.stop("service_destroyed") } catch (_: Exception) {}
        MirrorState.setActive(false)
    }

    // -------------------------------------------------------------------------
    // Bildirishnoma / foreground
    // -------------------------------------------------------------------------
    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                val ch = NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.notif_channel_name),
                    NotificationManager.IMPORTANCE_LOW,
                ).apply { description = getString(R.string.notif_channel_desc) }
                nm.createNotificationChannel(ch)
            }
        }
    }

    private fun buildNotification(): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stopIntent = PendingIntent.getService(
            this, 1, stopIntent(this),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true)
            .setContentIntent(openIntent)
            .addAction(
                Notification.Action.Builder(
                    null, getString(R.string.notif_stop), stopIntent,
                ).build(),
            )
            .build()
    }

    private fun startAsForeground() {
        val notif = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION") stopForeground(true)
        }
    }

    // -------------------------------------------------------------------------
    // Qurilma / ekran ma'lumoti
    // -------------------------------------------------------------------------
    private fun screenMetrics(): DisplayMetrics {
        val dm = DisplayMetrics()
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = wm.currentWindowMetrics.bounds
            dm.widthPixels = bounds.width()
            dm.heightPixels = bounds.height()
            dm.densityDpi = resources.configuration.densityDpi
        } else {
            @Suppress("DEPRECATION") wm.defaultDisplay.getRealMetrics(dm)
        }
        return dm
    }

    private fun displayRotationDegrees(): Int {
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        // Service display-associated bo'lmasligi mumkin — defaultDisplay ishonchli
        @Suppress("DEPRECATION")
        val rot = wm.defaultDisplay.rotation
        return when (rot) {
            android.view.Surface.ROTATION_90 -> 90
            android.view.Surface.ROTATION_180 -> 180
            android.view.Surface.ROTATION_270 -> 270
            else -> 0
        }
    }

    private fun buildDeviceInfo(m: DisplayMetrics): DeviceInfo = DeviceInfo(
        deviceId = deviceId(),
        name = "${Build.MANUFACTURER} ${Build.MODEL}",
        model = Build.MODEL,
        androidSdk = Build.VERSION.SDK_INT,
        width = m.widthPixels,
        height = m.heightPixels,
        densityDpi = m.densityDpi,
    )

    /** Doimiy qurilma identifikatori (SharedPreferences'da saqlanadi). */
    private fun deviceId(): String {
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return prefs.getString(KEY_DEVICE_ID, null) ?: UUID.randomUUID().toString().also {
            prefs.edit { putString(KEY_DEVICE_ID, it) }
        }
    }
}
