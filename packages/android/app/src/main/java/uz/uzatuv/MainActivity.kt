package uz.uzatuv

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import uz.uzatuv.service.MediaProjectionService
import uz.uzatuv.ui.ConnectScreen
import uz.uzatuv.ui.StatusScreen
import uz.uzatuv.ui.UsbTetherScreen
import uz.uzatuv.ui.UzatuvTheme

/**
 * MainActivity — yagona Activity, Compose ekranlarini boshqaradi.
 *
 * Oqim: ConnectScreen → (pairing) → bildirishnoma ruxsati → MediaProjection ruxsati →
 * MediaProjectionService ishga tushadi → StatusScreen (MirrorState orqali).
 */
class MainActivity : ComponentActivity() {

    private enum class Route { CONNECT, USB }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            UzatuvTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    AppRoot()
                }
            }
        }
    }

    @Composable
    private fun AppRoot() {
        val ui by MirrorState.state.collectAsState()
        var route by remember { mutableStateOf(Route.CONNECT) }
        var pending by remember { mutableStateOf<PairingInfo?>(null) }

        // MediaProjection ruxsat natijasi → service'ni foreground'da boshlaymiz
        val projectionLauncher = rememberLauncherForActivityResult(
            ActivityResultContracts.StartActivityForResult(),
        ) { result ->
            val p = pending
            val data = result.data
            if (result.resultCode == RESULT_OK && data != null && p != null) {
                ContextCompat.startForegroundService(
                    this,
                    MediaProjectionService.startIntent(this, result.resultCode, data, p),
                )
            }
            pending = null
        }

        fun launchProjection() {
            val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            projectionLauncher.launch(mpm.createScreenCaptureIntent())
        }

        // Bildirishnoma ruxsati (Android 13+) natijasi — keyin ekran ruxsatini so'raymiz
        val notifLauncher = rememberLauncherForActivityResult(
            ActivityResultContracts.RequestPermission(),
        ) { _ -> launchProjection() }

        fun beginStart(p: PairingInfo) {
            pending = p
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                launchProjection()
            }
        }

        when {
            ui.active -> StatusScreen(
                ui = ui,
                onStop = { startService(MediaProjectionService.stopIntent(this)) },
            )

            route == Route.USB -> UsbTetherScreen(onBack = { route = Route.CONNECT })

            else -> ConnectScreen(
                onPaired = { beginStart(it) },
                onOpenUsb = { route = Route.USB },
            )
        }
    }
}
