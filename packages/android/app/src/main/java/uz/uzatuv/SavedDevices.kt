package uz.uzatuv

import android.content.Context
import android.util.Base64
import androidx.core.content.edit
import org.json.JSONArray
import org.json.JSONObject

/**
 * SavedDevices — eslab qolingan kompyuterlar (pairing) ro'yxati.
 *
 * SharedPreferences'da JSON massiv sifatida saqlanadi. `serverId` — noyob kalit
 * (bir PC bir marta). Foydalanuvchi ro'yxatdan qurilmani tanlab, QR skanlashsiz
 * to'g'ridan-to'g'ri ulanadi.
 *
 * ⚠️ Eslatma: saqlangan `ip` PC IP'si o'zgarsa (DHCP) eskirishi mumkin — u holda
 * ulanish urinadi va qayta ulanish backoff bilan davom etadi; kerak bo'lsa QR
 * qayta skanlanadi. Kelajakda mDNS orqali `serverId` bo'yicha avtomatik topiladi.
 */
object SavedDevices {
    private const val PREFS = "uzatuv"
    private const val KEY = "savedDevices"
    private const val B64URL = Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING

    /** Saqlangan qurilmalar ro'yxati (bo'sh bo'lishi mumkin). */
    fun list(context: Context): List<PairingInfo> {
        val raw = prefs(context).getString(KEY, null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { fromJson(arr.getJSONObject(it)) }
        }.getOrElse { emptyList() }
    }

    /** Shu serverId saqlanganmi. */
    fun isSaved(context: Context, serverId: String): Boolean =
        serverId.isNotEmpty() && list(context).any { it.serverId == serverId }

    /** Qurilmani saqlaydi (o'sha serverId bo'lsa yangilaydi). */
    fun save(context: Context, p: PairingInfo) {
        val updated = list(context).filterNot { it.serverId == p.serverId } + p
        persist(context, updated)
    }

    /** Qurilmani ro'yxatdan o'chiradi. */
    fun remove(context: Context, serverId: String) {
        persist(context, list(context).filterNot { it.serverId == serverId })
    }

    private fun persist(context: Context, items: List<PairingInfo>) {
        val arr = JSONArray()
        items.forEach { arr.put(toJson(it)) }
        prefs(context).edit { putString(KEY, arr.toString()) }
    }

    private fun toJson(p: PairingInfo): JSONObject = JSONObject()
        .put("v", p.version)
        .put("ip", p.ip)
        .put("port", p.port)
        .put("serverId", p.serverId)
        .put("name", p.name)
        .put("key", Base64.encodeToString(p.sessionKey, B64URL))

    private fun fromJson(o: JSONObject): PairingInfo = PairingInfo(
        version = o.optInt("v", 1),
        ip = o.optString("ip"),
        port = o.optInt("port"),
        serverId = o.optString("serverId"),
        name = o.optString("name", "PC"),
        sessionKey = Base64.decode(o.optString("key"), B64URL),
    )

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
