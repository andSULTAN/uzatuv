package uz.uzatuv.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Build
import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import uz.uzatuv.receiver.ReceiverIdentity
import uz.uzatuv.receiver.ReceiverServer
import uz.uzatuv.receiver.lanIpv4

/**
 * ReceiveScreen — QABUL QILISH rejimi. Bu qurilma (telefon yoki Android TV) boshqa
 * qurilmadan ekran qabul qiladi. QR + havola ko'rsatiladi (uzatuvchi skanlaydi yoki
 * nusxalaydi); ulanганда video SurfaceView'да ko'rsatiladi.
 */
@Composable
fun ReceiveScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val deviceName = remember { "${Build.MANUFACTURER} ${Build.MODEL}" }
    val identity = remember { ReceiverIdentity.load(context, deviceName) }
    val ip = remember { lanIpv4() }

    var peer by remember { mutableStateOf("") }
    var stateStr by remember { mutableStateOf("listening") }

    val server = remember {
        ReceiverServer(identity) { s, p ->
            stateStr = s
            peer = p
        }
    }

    DisposableEffect(Unit) {
        server.start()
        onDispose { server.stop() }
    }

    val uri = remember(server.port, ip) { identity.pairingUri(ip, server.port) }
    val qr = remember(uri) { makeQr(uri, 440) }
    val connected = stateStr == "connected"

    Box(modifier = Modifier.fillMaxSize()) {
        // Video sirti — doim mavjud; ulanганда shu yerда video ko'rinadi.
        AndroidView(
            factory = { ctx ->
                SurfaceView(ctx).apply {
                    holder.addCallback(object : SurfaceHolder.Callback {
                        override fun surfaceCreated(h: SurfaceHolder) = server.setSurface(h.surface)
                        override fun surfaceChanged(h: SurfaceHolder, f: Int, w: Int, ht: Int) {}
                        override fun surfaceDestroyed(h: SurfaceHolder) = server.setSurface(null)
                    })
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        if (!connected) {
            // Kutish ekrani — QR + havola + yo'riqnoma
            Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = "Qabul qilishga tayyor",
                        style = MaterialTheme.typography.headlineSmall,
                    )
                    Spacer(Modifier.padding(4.dp))
                    Text(
                        text = if (stateStr == "error") "Tarmoq portini ochib bo'lmadi"
                        else "Boshqa qurilmadan shu ekranga uzating",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    Spacer(Modifier.padding(12.dp))
                    Box(modifier = Modifier.clip(RoundedCornerShape(16.dp))) {
                        Image(
                            bitmap = qr,
                            contentDescription = "Ulanish QR kodi",
                            modifier = Modifier.size(240.dp),
                        )
                    }

                    Spacer(Modifier.padding(10.dp))
                    Text(
                        text = "Uzatuvchi qurilmada Uzatuv'ni oching:",
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = "• Telefon — \"Uzatish\" → QR kodni skanlang",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = "• Kompyuter — \"Uzatish\" → havolani joylang",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    Spacer(Modifier.padding(8.dp))
                    Text(
                        text = "Manzil: $ip:${server.port}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    Spacer(Modifier.padding(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedButton(onClick = { copyToClipboard(context, uri) }) {
                            Text("Havolani nusxalash")
                        }
                        OutlinedButton(onClick = onBack) { Text("Orqaga") }
                    }
                }
            }
        } else {
            // Ulangan — video ko'rinadi; ustда minimal panel
            Row(
                modifier = Modifier.fillMaxWidth().padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(color = androidx.compose.ui.graphics.Color(0x99000000), shape = RoundedCornerShape(8.dp)) {
                    Text(
                        text = "● $peer",
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        color = androidx.compose.ui.graphics.Color(0xFF2ECC71),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                Button(onClick = onBack) { Text("Chiqish") }
            }
        }
    }
}

/** ZXing bilan matndan QR bitmap yasaydi. */
private fun makeQr(text: String, size: Int): androidx.compose.ui.graphics.ImageBitmap {
    val hints = mapOf(EncodeHintType.MARGIN to 1)
    val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, hints)
    val pixels = IntArray(size * size)
    for (y in 0 until size) {
        val row = y * size
        for (x in 0 until size) {
            pixels[row + x] = if (matrix.get(x, y)) Color.BLACK else Color.WHITE
        }
    }
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    bmp.setPixels(pixels, 0, size, 0, 0, size, size)
    return bmp.asImageBitmap()
}

private fun copyToClipboard(context: Context, text: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText("Uzatuv havola", text))
}
