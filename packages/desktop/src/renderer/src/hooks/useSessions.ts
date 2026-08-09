import { useEffect, useState } from "react";
import type { PairingView, SessionView } from "../../../shared/ipc";

/** Ulangan sessiyalar ro'yxati (main'dan real vaqtda yangilanadi). */
export function useSessions(): SessionView[] {
  const [sessions, setSessions] = useState<SessionView[]>([]);
  useEffect(() => window.uzatuv.onSessions(setSessions), []);
  return sessions;
}

/** Joriy pairing (QR URI + qisqa kod). */
export function usePairing(): PairingView | null {
  const [pairing, setPairing] = useState<PairingView | null>(null);
  useEffect(() => {
    let mounted = true;
    void window.uzatuv.getPairing().then((p) => {
      if (mounted) setPairing(p);
    });
    const off = window.uzatuv.onPairing(setPairing);
    return () => {
      mounted = false;
      off();
    };
  }, []);
  return pairing;
}
