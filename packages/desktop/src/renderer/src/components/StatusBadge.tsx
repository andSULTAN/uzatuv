import type { ConnState } from "@uzatuv/protocol";

const LABELS: Record<ConnState, string> = {
  IDLE: "Kutilmoqda",
  CONNECTING: "Ulanmoqda",
  HANDSHAKING: "Tanishuv",
  READY: "Ulandi",
  RECONNECTING: "Qayta ulanmoqda",
  CLOSED: "Uzildi",
};

const COLORS: Record<ConnState, string> = {
  IDLE: "bg-slate-600",
  CONNECTING: "bg-amber-500",
  HANDSHAKING: "bg-amber-500",
  READY: "bg-emerald-500",
  RECONNECTING: "bg-orange-500",
  CLOSED: "bg-rose-600",
};

/** Ulanish holatini ko'rsatuvchi rangli nishon. */
export function StatusBadge({ state }: { state: ConnState }): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-200">
      <span className={`h-2 w-2 rounded-full ${COLORS[state]}`} />
      {LABELS[state]}
    </span>
  );
}
