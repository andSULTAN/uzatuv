import { useState } from "react";
import { useSessions, usePairing } from "./hooks/useSessions";
import { PairingScreen } from "./components/PairingScreen";
import { DeviceGrid } from "./components/DeviceGrid";
import { FullscreenView } from "./components/FullscreenView";

export default function App(): React.JSX.Element {
  const sessions = useSessions();
  const pairing = usePairing();
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);

  const fullscreenSession = sessions.find((s) => s.id === fullscreenId) ?? null;
  const hasDevices = sessions.length > 0;

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      {/* Sarlavha paneli */}
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">Uzatuv</span>
          <span className="text-sm text-slate-500">Android ekran uzatuvchi</span>
        </div>
        <div className="text-sm text-slate-400">
          {hasDevices
            ? `${sessions.length} ta qurilma ulangan`
            : "Qurilma kutilmoqda"}
        </div>
      </header>

      {/* Asosiy qism */}
      <main className="min-h-0 flex-1 overflow-auto">
        {hasDevices ? (
          <DeviceGrid sessions={sessions} onSelect={setFullscreenId} />
        ) : (
          <PairingScreen pairing={pairing} />
        )}
      </main>

      {/* To'liq ekran overlay */}
      {fullscreenSession && (
        <FullscreenView session={fullscreenSession} onClose={() => setFullscreenId(null)} />
      )}
    </div>
  );
}
