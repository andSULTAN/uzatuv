package uz.uzatuv

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * MirrorState — Service (transport) va Compose UI o'rtasidagi umumiy holat.
 *
 * Service holatni yangilaydi, UI (StatusScreen) StateFlow orqali kuzatadi.
 * Bog'langan (bound) service o'rniga oddiy singleton — yengil va yetarli.
 */
object MirrorState {

    data class UiState(
        val active: Boolean = false,     // service ishlayaptimi
        val conn: ConnState = ConnState.CLOSED,
        val peerName: String = "",       // ulangan PC nomi
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun updateState(conn: ConnState) {
        _state.value = _state.value.copy(conn = conn, active = conn != ConnState.CLOSED)
    }

    fun updatePeerName(name: String) {
        _state.value = _state.value.copy(peerName = name)
    }

    fun setActive(active: Boolean) {
        _state.value = _state.value.copy(active = active)
        if (!active) _state.value = _state.value.copy(conn = ConnState.CLOSED)
    }

    fun reset() {
        _state.value = UiState()
    }
}
