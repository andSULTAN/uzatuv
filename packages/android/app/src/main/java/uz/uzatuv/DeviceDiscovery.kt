package uz.uzatuv

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.util.Log
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean

/** mDNS orqali topilgan PC (Uzatuv server). */
data class DiscoveredPc(
    val serverId: String,
    val name: String,
    val host: String, // joriy IPv4
    val port: Int,
)

/**
 * DeviceDiscovery — `_uzatuv._tcp` xizmatlarini mDNS/NSD orqali topadi.
 *
 * Maqsad: saqlangan qurilmaning IP'si o'zgarganда (DHCP) ham uni `serverId`
 * (TXT 'id') bo'yicha topib, JORIY IP'ni aniqlash. Shunda saqlangan qurilma
 * IP o'zgarsa ham ulanaveradi.
 *
 * Eslatma:
 *   - `resolveService` bir vaqtda bittadan ishlaydi → resolve navbati bilan.
 *   - Ba'zi qurilmalarда mDNS ko'p-manzilli (multicast) paketlar uchun
 *     MulticastLock kerak — olamiz.
 */
class DeviceDiscovery(context: Context) {
    companion object {
        private const val TAG = "UzatuvNSD"
        private const val SERVICE_TYPE = "_uzatuv._tcp"
    }

    private val appContext = context.applicationContext
    private val nsd = appContext.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val wifi = appContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

    private var multicastLock: WifiManager.MulticastLock? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private val queue = ConcurrentLinkedQueue<NsdServiceInfo>()
    private val resolving = AtomicBoolean(false)
    private var onUpdate: ((DiscoveredPc) -> Unit)? = null

    /** Topishni boshlaydi. Har resolve bo'lgan PC uchun [onFound] chaqiriladi. */
    fun start(onFound: (DiscoveredPc) -> Unit) {
        if (discoveryListener != null) return
        onUpdate = onFound

        multicastLock = wifi.createMulticastLock("uzatuv-nsd").apply {
            setReferenceCounted(true)
            runCatching { acquire() }
        }

        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            override fun onServiceFound(info: NsdServiceInfo) {
                queue.add(info)
                pump()
            }
            override fun onServiceLost(info: NsdServiceInfo) {}
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.w(TAG, "discovery boshlanmadi: $errorCode")
            }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
        }
        discoveryListener = listener
        runCatching {
            nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
        }.onFailure { Log.w(TAG, "discoverServices xato", it) }
    }

    private fun pump() {
        if (resolving.getAndSet(true)) return
        val next = queue.poll()
        if (next == null) {
            resolving.set(false)
            return
        }
        resolveOne(next)
    }

    @Suppress("DEPRECATION") // resolveService API 34'да deprecated, lekin minSdk 26 uchun ishlaydi
    private fun resolveOne(info: NsdServiceInfo) {
        val cb = object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                resolving.set(false)
                pump()
            }

            override fun onServiceResolved(resolved: NsdServiceInfo) {
                emit(resolved)
                resolving.set(false)
                pump()
            }
        }
        runCatching { nsd.resolveService(info, cb) }
            .onFailure {
                resolving.set(false)
                pump()
            }
    }

    private fun emit(info: NsdServiceInfo) {
        val host = info.host?.hostAddress ?: return
        if (host.contains(":")) return // IPv6 — hozircha IPv4 kutamiz
        val attrs = info.attributes
        val serverId = attrs?.get("id")?.let { String(it, Charsets.UTF_8) } ?: ""
        val name = attrs?.get("name")?.let { String(it, Charsets.UTF_8) }
            ?: info.serviceName ?: "PC"
        onUpdate?.invoke(DiscoveredPc(serverId = serverId, name = name, host = host, port = info.port))
    }

    /** Topishni to'xtatadi va resurslarni bo'shatadi. */
    fun stop() {
        discoveryListener?.let { runCatching { nsd.stopServiceDiscovery(it) } }
        discoveryListener = null
        queue.clear()
        resolving.set(false)
        multicastLock?.let { runCatching { if (it.isHeld) it.release() } }
        multicastLock = null
        onUpdate = null
    }
}
