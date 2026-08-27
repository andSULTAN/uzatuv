package uz.uzatuv.receiver

import android.content.Context
import android.util.Base64
import androidx.core.content.edit
import uz.uzatuv.protocol.Crypto
import uz.uzatuv.protocol.Proto
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * ReceiverIdentity — bu qurilma QABUL QILISH rejimida server bo'lganда o'z
 * identligini (serverId + sessionKey) doimiy saqlaydi va uzatuvchi uchun
 * `uzatuv://` pairing havolasini (QR) yasaydi.
 *
 * Doimiy sessionKey shart — uzatuvchi (PC/telefon) uni saqlab, keyingi safar ham
 * ishlata olsin. (Desktop tomonда ham xuddi shunday.)
 */
class ReceiverIdentity private constructor(
    val serverId: String,
    val sessionKey: ByteArray,
    val name: String,
) {
    companion object {
        private const val PREFS = "uzatuv"
        private const val KEY_ID = "recvServerId"
        private const val KEY_SK = "recvSessionKey"

        fun load(context: Context, deviceName: String): ReceiverIdentity {
            val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            var id = p.getString(KEY_ID, null)
            var skB64 = p.getString(KEY_SK, null)
            if (id == null || skB64 == null) {
                id = java.util.UUID.randomUUID().toString()
                val sk = Crypto.generateSessionKey()
                skB64 = Base64.encodeToString(sk, Base64.NO_WRAP)
                p.edit {
                    putString(KEY_ID, id)
                    putString(KEY_SK, skB64)
                }
            }
            val sk = Base64.decode(skB64, Base64.NO_WRAP)
            return ReceiverIdentity(id, sk, deviceName)
        }
    }

    /** base64url (padding'siz) sessionKey — URI/QR uchun. */
    private fun keyB64Url(): String =
        Base64.encodeToString(sessionKey, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

    /** uzatuv://pair?... havolasi (uzatuvchi shuni skanlaydi yoki nusxalaydi). */
    fun pairingUri(ip: String, port: Int): String {
        // PROTOCOL.md §2.1 — desktop encodePairingUri bilan bir xil format.
        val params = listOf(
            "v" to Proto.PROTOCOL_VERSION.toString(),
            "ip" to ip,
            "port" to port.toString(),
            "id" to serverId,
            "name" to name,
            "key" to keyB64Url(),
        ).joinToString("&") { (k, v) -> "$k=${android.net.Uri.encode(v)}" }
        return "${Proto.PAIRING_URI_SCHEME}://pair?$params"
    }
}

/**
 * WiFi/LAN IPv4 manzil. WiFi (wlan) afzal, cellular (rmnet) va VPN (tun/ppp)
 * o'tkazib yuboriladi — telefon shu manzilda uzatuvchi bilan bir tarmoqda bo'lsin.
 * Topilmasa "0.0.0.0".
 */
fun lanIpv4(): String {
    var best: String? = null
    var bestScore = -1
    try {
        for (ni in NetworkInterface.getNetworkInterfaces()) {
            if (!ni.isUp || ni.isLoopback || ni.isVirtual) continue
            val n = ni.name.lowercase()
            // cellular / VPN / point-to-point — LAN emas
            if (n.startsWith("rmnet") || n.startsWith("pdp") || n.contains("tun") || n.contains("ppp")) continue
            val score = when {
                n.startsWith("wlan") -> 100 // WiFi
                n.startsWith("eth") -> 85 // Ethernet (TV)
                n.startsWith("ap") || n.startsWith("swlan") -> 70 // hotspot
                else -> 50
            }
            for (addr in ni.inetAddresses) {
                if (addr.isLoopbackAddress || addr !is Inet4Address) continue
                if (!addr.isSiteLocalAddress) continue // 192.168.x / 10.x / 172.16-31.x
                val host = addr.hostAddress ?: continue
                if (score > bestScore) {
                    bestScore = score
                    best = host
                }
            }
        }
    } catch (_: Exception) {
        // e'tiborsiz
    }
    return best ?: "0.0.0.0"
}
