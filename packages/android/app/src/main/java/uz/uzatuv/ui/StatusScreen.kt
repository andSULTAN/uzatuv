package uz.uzatuv.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import uz.uzatuv.ConnState
import uz.uzatuv.MirrorState

/**
 * StatusScreen — uzatish faol bo'lganda: ulangan PC, holat va "To'xtatish".
 */
@Composable
fun StatusScreen(
    ui: MirrorState.UiState,
    onStop: () -> Unit,
    /** "Bu kompyuterni eslab qolaymi?" taklifini ko'rsatish. */
    showRememberOffer: Boolean = false,
    onRemember: () -> Unit = {},
    onDismissRemember: () -> Unit = {},
    onToggleMute: () -> Unit = {},
) {
    val (label, color) = when (ui.conn) {
        ConnState.CONNECTING -> "Ulanmoqda…" to Color(0xFFF5A623)
        ConnState.READY -> "Faol — uzatilmoqda" to Color(0xFF2ECC71)
        ConnState.RECONNECTING -> "Qayta ulanmoqda…" to Color(0xFFF5A623)
        ConnState.CLOSED -> "Uzildi" to Color(0xFFE74C3C)
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        // Holat indikatori (rangli nuqta)
        Box(contentAlignment = Alignment.Center) {
            Surface(shape = CircleShape, color = color, modifier = Modifier.size(18.dp)) {}
        }
        Spacer(Modifier.padding(8.dp))
        Text(text = label, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)

        Spacer(Modifier.padding(12.dp))
        if (ui.peerName.isNotBlank()) {
            Text(
                text = "Ulangan: ${ui.peerName}",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
            )
        }

        // "Bu kompyuterni eslab qolaymi?" taklifi (faqat birinchi ulanишда, saqlanmagan bo'lsa)
        if (showRememberOffer) {
            Spacer(Modifier.padding(20.dp))
            Card(modifier = Modifier.fillMaxWidth().widthIn(max = 420.dp).padding(4.dp)) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = "Bu kompyuterni eslab qolaymi?",
                        style = MaterialTheme.typography.titleMedium,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = "Keyingi safar QR skanlashsiz, ro'yxatdan tanlab ulanasiz.",
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.padding(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        TextButton(onClick = onDismissRemember) { Text("Yo'q") }
                        Button(onClick = onRemember) { Text("Ha, eslab qol") }
                    }
                }
            }
        }

        // Ovoz yoqilgan bo'lsa — vaqtincha o'chirish/yoqish
        if (ui.audioEnabled) {
            Spacer(Modifier.padding(16.dp))
            OutlinedButton(onClick = onToggleMute, modifier = Modifier.widthIn(min = 220.dp)) {
                Text(if (ui.audioMuted) "🔇 Ovoz o'chiq — yoqish" else "🔊 Ovoz yoniq — o'chirish")
            }
        }

        Spacer(Modifier.padding(24.dp))
        Button(
            onClick = onStop,
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE74C3C)),
            modifier = Modifier.widthIn(min = 220.dp),
        ) { Text("To'xtatish") }
    }
}
