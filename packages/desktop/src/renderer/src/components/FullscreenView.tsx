import { useEffect } from "react";
import type { SessionView } from "../../../shared/ipc";
import { DeviceView } from "./DeviceView";

/** Bitta qurilmaning to'liq ekran ko'rinishi. ESC bilan chiqiladi. */
export function FullscreenView({
  session,
  onClose,
}: {
  session: SessionView;
  onClose: () => void;
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-lg bg-slate-800/80 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-700"
      >
        Yopish (ESC)
      </button>
      <DeviceView session={session} fullscreen />
    </div>
  );
}
