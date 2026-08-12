package uz.uzatuv.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.clickable

/**
 * HomeScreen — rejim tanlash: UZATISH yoki QABUL QILISH.
 * Uzatuv ikki tomonlama — bu qurilma ham ekran uzatadi, ham qabul qiladi.
 * (Android TV'да D-pad bilan tanlanadi — kartalar fokuslanadigan.)
 */
@Composable
fun HomeScreen(
    onTransmit: () -> Unit,
    onReceive: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = "Uzatuv", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.padding(2.dp))
        Text(
            text = "Nima qilmoqchisiz?",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.padding(16.dp))

        ModeCard(
            icon = "📡",
            title = "Ekran uzatish",
            desc = "Shu qurilma ekranini boshqasiga (TV / kompyuter) jonli uzatish.",
            onClick = onTransmit,
        )
        Spacer(Modifier.padding(8.dp))
        ModeCard(
            icon = "📺",
            title = "Ekran qabul qilish",
            desc = "Boshqa qurilma ekranini shu qurilmada ko'rsatish (TV rejimi).",
            onClick = onReceive,
        )
    }
}

@Composable
private fun ModeCard(
    icon: String,
    title: String,
    desc: String,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 460.dp)
            .clickable { onClick() },
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(text = icon, style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.padding(4.dp))
            Text(text = title, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.padding(2.dp))
            Text(
                text = desc,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Start,
            )
        }
    }
}
