package uz.uzatuv

import android.net.Uri
import android.util.Base64
import org.json.JSONObject

/**
 * Pairing ma'lumotini QR/URI'dan o'qish — PROTOCOL.md §2.1.
 *
 * Ikki format qo'llab-quvvatlanadi:
 *   1) URI:  uzatuv://pair?v=1&ip=..&port=..&id=..&name=..&key=<base64url>
 *   2) JSON: {"v":1,"ip":..,"port":..,"serverId":..,"name":..,"key":"<base64url>"}
 *      (QR ichida to'g'ridan-to'g'ri yoki base64url o'ralgan)
 */
object Pairing {

    private const val B64URL = Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING

    /** QR/kiritilgan matndan PairingInfo. Xato bo'lsa [IllegalArgumentException]. */
    fun decodePairingUri(raw: String): PairingInfo {
        val text = raw.trim()
        return when {
            text.startsWith("${Proto.PAIRING_URI_SCHEME}://", ignoreCase = true) -> fromUri(text)
            text.startsWith("{") -> fromJson(JSONObject(text))
            else -> {
                // base64url o'ralgan JSON bo'lishi mumkin
                val decoded = runCatching { String(Base64.decode(text, B64URL), Charsets.UTF_8) }.getOrNull()
                if (decoded != null && decoded.trimStart().startsWith("{")) {
                    fromJson(JSONObject(decoded))
                } else {
                    throw IllegalArgumentException("Uzatuv pairing formati emas")
                }
            }
        }
    }

    private fun fromUri(text: String): PairingInfo {
        val uri = Uri.parse(text)
        require(uri.scheme.equals(Proto.PAIRING_URI_SCHEME, ignoreCase = true)) { "sxema noto'g'ri" }
        val keyStr = uri.getQueryParameter("key") ?: error("key yo'q")
        return PairingInfo(
            version = uri.getQueryParameter("v")?.toIntOrNull() ?: Proto.PROTOCOL_VERSION,
            ip = uri.getQueryParameter("ip") ?: error("ip yo'q"),
            port = uri.getQueryParameter("port")?.toIntOrNull() ?: Proto.DEFAULT_PORT,
            serverId = uri.getQueryParameter("id") ?: uri.getQueryParameter("serverId") ?: "",
            name = uri.getQueryParameter("name") ?: "PC",
            sessionKey = decodeKey(keyStr),
        )
    }

    private fun fromJson(o: JSONObject): PairingInfo {
        val keyStr = o.optString("key").ifEmpty { error("key yo'q") }
        return PairingInfo(
            version = o.optInt("v", Proto.PROTOCOL_VERSION),
            ip = o.optString("ip").ifEmpty { error("ip yo'q") },
            port = o.optInt("port", Proto.DEFAULT_PORT),
            serverId = o.optString("serverId", o.optString("id", "")),
            name = o.optString("name", "PC"),
            sessionKey = decodeKey(keyStr),
        )
    }

    private fun decodeKey(b64url: String): ByteArray {
        val key = Base64.decode(b64url, B64URL)
        require(key.size == Proto.SESSION_KEY_LEN) {
            "sessionKey ${Proto.SESSION_KEY_LEN} bayt bo'lishi kerak, ${key.size} keldi"
        }
        return key
    }
}
