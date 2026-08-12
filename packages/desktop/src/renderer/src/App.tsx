import { useState } from "react";
import { useSessions, usePairing } from "./hooks/useSessions";
import { HomeScreen } from "./components/HomeScreen";
import { PairingScreen } from "./components/PairingScreen";
import { DeviceGrid } from "./components/DeviceGrid";
import { FullscreenView } from "./components/FullscreenView";
import { TransmitScreen } from "./components/TransmitScreen";

type Mode = "home" | "receive" | "transmit";

export default function App(): React.JSX.Element {
  const sessions = useSessions();
  const pairing = usePairing();
  const [mode, setMode] = useState<Mode>("home");
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);

  const fullscreenSession = sessions.find((s) => s.id === fullscreenId) ?? null;
  const hasDevices = sessions.length > 0;

  if (mode === "home") {
    return (
      <div className="h-full bg-slate-950 text-slate-100">
        <HomeScreen
          onReceive={() => setMode("receive")}
          onTransmit={() => setMode("transmit")}
          deviceCount={sessions.length}
        />
      </div>
    );
  }

  if (mode === "transmit") {
    return (
      <div className="h-full bg-slate-950 text-slate-100">
        <TransmitScreen onBack={() => setMode("home")} />
      </div>
    );
  }

  // mode === "receive"
  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMode("home")}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            ← Orqaga
          </button>
          <span className="text-lg font-bold">Qabul qilish</span>
        </div>
        <div className="text-sm text-slate-400">
          {hasDevices ? `${sessions.length} ta qurilma ulangan` : "Qurilma kutilmoqda"}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        {hasDevices ? (
          <DeviceGrid sessions={sessions} onSelect={setFullscreenId} />
        ) : (
          <PairingScreen pairing={pairing} />
        )}
      </main>

      {fullscreenSession && (
        <FullscreenView session={fullscreenSession} onClose={() => setFullscreenId(null)} />
      )}
    </div>
  );
}
