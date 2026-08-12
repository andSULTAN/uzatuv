package uz.uzatuv.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import uz.uzatuv.Pairing
import uz.uzatuv.PairingInfo

private enum class Mode { QR, CODE }

/**
 * ConnectScreen — kompyuterga ulanish: QR skanlash yoki kod/havola kiritish.
 *
 * @param onPaired to'g'ri pairing olinganda chaqiriladi (keyin ekran ruxsati so'raladi)
 * @param onOpenUsb USB tethering yo'riqnomasini ochish
 */
@Composable
fun ConnectScreen(
    onPaired: (PairingInfo) -> Unit,
    onOpenUsb: () -> Unit,
    /** Eslab qolingan kompyuterlar — ro'yxatdan tanlab QR'siz ulanish. */
    savedDevices: List<PairingInfo> = emptyList(),
    onConnectSaved: (PairingInfo) -> Unit = {},
    onForgetSaved: (PairingInfo) -> Unit = {},
) {
    val context = LocalContext.current
    var mode by remember { mutableStateOf(Mode.QR) }
    var codeText by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    // Kamera FAQAT foydalanuvchi "skanlash"ni bosganda ochiladi (asosiy ekran —
    // kamera o'chiq). Ekran ochilganda yoki uzatish to'xtaganda kamera ochilmaydi.
    var scanning by remember { mutableStateOf(false) }

    var cameraGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        cameraGranted = granted
        if (granted) scanning = true // ruxsat berildi → skanlashni boshlaymiz
        else error = "Kamera ruxsati berilmadi. Qisqa kod bilan ulaning."
    }

    fun tryPair(text: String) {
        error = null
        runCatching { Pairing.decodePairingUri(text) }
            .onSuccess { onPaired(it) }
            .onFailure { error = it.message ?: "Ulanish ma'lumoti noto'g'ri" }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(PaddingValues(24.dp)),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top,
    ) {
        Text(
            text = "Kompyuterga ulanish",
            style = androidx.compose.material3.MaterialTheme.typography.headlineSmall,
        )
        Spacer(Modifier.padding(8.dp))

        // Saqlangan qurilmalar — QR'siz to'g'ridan ulanish (faqat asosiy ekranда)
        if (!scanning && savedDevices.isNotEmpty()) {
            SavedDevicesList(
                devices = savedDevices,
                onConnect = onConnectSaved,
                onForget = onForgetSaved,
            )
            Spacer(Modifier.padding(6.dp))
            Text(
                text = "— yoki yangi qurilma ulash —",
                style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.padding(6.dp))
        }

        // Rejim tanlash (QR / Kod)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            FilterChip(
                selected = mode == Mode.QR,
                onClick = { mode = Mode.QR; error = null },
                label = { Text("QR kod") },
            )
            FilterChip(
                selected = mode == Mode.CODE,
                onClick = { mode = Mode.CODE; error = null; scanning = false },
                label = { Text("Kod / havola") },
            )
        }
        Spacer(Modifier.padding(8.dp))

        when (mode) {
            Mode.QR -> QrSection(
                scanning = scanning,
                cameraGranted = cameraGranted,
                onStartScan = {
                    error = null
                    if (cameraGranted) scanning = true
                    else cameraLauncher.launch(Manifest.permission.CAMERA)
                },
                onStopScan = { scanning = false },
                onScanned = { tryPair(it) },
            )

            Mode.CODE -> CodeSection(
                codeText = codeText,
                onCodeChange = { codeText = it },
                onConnect = { tryPair(codeText) },
            )
        }

        error?.let {
            Spacer(Modifier.padding(8.dp))
            Text(
                text = it,
                color = androidx.compose.material3.MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center,
            )
        }

        Spacer(Modifier.padding(16.dp))
        OutlinedButton(onClick = onOpenUsb, modifier = Modifier.widthIn(min = 220.dp)) {
            Text("USB orqali ulash yo'riqnomasi")
        }
    }
}

@Composable
private fun SavedDevicesList(
    devices: List<PairingInfo>,
    onConnect: (PairingInfo) -> Unit,
    onForget: (PairingInfo) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().widthIn(max = 480.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = "Saqlangan qurilmalar",
            style = androidx.compose.material3.MaterialTheme.typography.titleSmall,
        )
        devices.forEach { d ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onConnect(d) },
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(modifier = Modifier.padding(end = 8.dp)) {
                        Text(
                            text = d.name.ifBlank { "Kompyuter" },
                            style = androidx.compose.material3.MaterialTheme.typography.bodyLarge,
                        )
                        Text(
                            text = "${d.ip}:${d.port}",
                            style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                        )
                    }
                    TextButton(onClick = { onForget(d) }) { Text("Unut") }
                }
            }
        }
    }
}

@Composable
private fun QrSection(
    scanning: Boolean,
    cameraGranted: Boolean,
    onStartScan: () -> Unit,
    onStopScan: () -> Unit,
    onScanned: (String) -> Unit,
) {
    if (scanning && cameraGranted) {
        // Skanlash rejimi — kamera oynasi ochiq
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 480.dp)
                .aspectRatio(0.9f)
                .clip(RoundedCornerShape(16.dp)),
        ) {
            QrScanner(onResult = onScanned)
        }
        Spacer(Modifier.padding(8.dp))
        Text(
            text = "Kompyuterdagi QR kodni ramkaga tuting",
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.padding(8.dp))
        OutlinedButton(onClick = onStopScan, modifier = Modifier.widthIn(min = 220.dp)) {
            Text("Bekor qilish")
        }
    } else {
        // Asosiy ekran — kamera o'chiq. Foydalanuvchi bosgandagina ochiladi.
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "Kompyuterda ochilgan QR kodni skanlab ulaning.",
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.padding(12.dp))
            Button(onClick = onStartScan, modifier = Modifier.widthIn(min = 220.dp)) {
                Text("QR kodni skanlash")
            }
        }
    }
}

@Composable
private fun CodeSection(
    codeText: String,
    onCodeChange: (String) -> Unit,
    onConnect: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        OutlinedTextField(
            value = codeText,
            onValueChange = onCodeChange,
            label = { Text("uzatuv:// havola yoki kod") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().widthIn(max = 480.dp),
        )
        Spacer(Modifier.padding(8.dp))
        Button(
            onClick = onConnect,
            enabled = codeText.isNotBlank(),
            modifier = Modifier.widthIn(min = 220.dp),
        ) { Text("Ulanish") }
        Spacer(Modifier.padding(6.dp))
        Text(
            text = "Eslatma: sof raqamli qisqa kod (masalan 123-456-789) uchun " +
                "kompyuter shu tarmoqda topilishi kerak. Hozircha QR yoki uzatuv:// havoladan foydalaning.",
            textAlign = TextAlign.Center,
            style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
        )
    }
}
