package uz.uzatuv.ui

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

/**
 * UsbTetherScreen — USB tethering (USB modem) orqali ulash yo'riqnomasi (o'zbekcha).
 * WiFi bo'lmasa yoki barqarorroq/tezroq aloqa kerak bo'lganda.
 */
@Composable
fun UsbTetherScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scroll = rememberScrollState()

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp).verticalScroll(scroll),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("USB orqali ulash", style = MaterialTheme.typography.headlineSmall)
        Text(
            "WiFi bo'lmasa yoki tezroq/barqarorroq aloqa kerak bo'lsa, telefonni USB kabel bilan " +
                "kompyuterga ulang. Uzatuv o'sha ulanish (odatda 192.168.42.x) ustidan ishlaydi.",
            style = MaterialTheme.typography.bodyMedium,
        )

        Step(1, "Telefonni USB kabel bilan kompyuterga ulang.")
        Step(2, "Sozlamalar → Ulanishlar → Modem rejimi (Hotspot) bo'limini oching.")
        Step(3, "\"USB modem\" (USB tethering) tugmasini yoqing.")
        Step(4, "Kompyuterda Uzatuv dasturi telefonni avtomatik topadi (yoki QR/kod bilan ulang).")

        Spacer(Modifier.padding(4.dp))
        Button(onClick = { openTetherSettings(context) }) {
            Text("Modem rejimi sozlamasini ochish")
        }
        OutlinedButton(onClick = onBack) { Text("Orqaga") }
    }
}

@Composable
private fun Step(n: Int, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("$n.", style = MaterialTheme.typography.bodyLarge)
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}

/** Modem rejimi (tethering) sozlamalarini ochishga urinadi; bo'lmasa umumiy sozlama. */
private fun openTetherSettings(context: Context) {
    val tether = Intent(Intent.ACTION_MAIN).apply {
        component = ComponentName("com.android.settings", "com.android.settings.TetherSettings")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
    }
    try {
        context.startActivity(tether)
    } catch (_: Exception) {
        // Ba'zi qurilmalarda yashirin — umumiy Sozlamalarni ochamiz
        try {
            context.startActivity(
                Intent(android.provider.Settings.ACTION_WIRELESS_SETTINGS)
                    .apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK },
            )
        } catch (_: Exception) { /* e'tiborsiz */ }
    }
}
