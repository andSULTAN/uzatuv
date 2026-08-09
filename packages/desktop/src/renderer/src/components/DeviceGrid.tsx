import type { SessionView } from "../../../shared/ipc";
import { DeviceView } from "./DeviceView";

/** Ulangan qurilmalar grid'i (2–3 karta yonma-yon). */
export function DeviceGrid({
  sessions,
  onSelect,
}: {
  sessions: SessionView[];
  onSelect: (id: string) => void;
}): React.JSX.Element {
  // Qurilma soniga qarab ustunlar: 1 → 1, 2 → 2, 3+ → 2/3.
  const cols = sessions.length <= 1 ? "grid-cols-1" : sessions.length === 2 ? "grid-cols-2" : "grid-cols-2 xl:grid-cols-3";

  return (
    <div className={`grid gap-4 p-4 ${cols}`}>
      {sessions.map((s) => (
        <DeviceView key={s.id} session={s} onSelect={onSelect} />
      ))}
    </div>
  );
}
