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

/**
 * Ulanish holatini ko'rsatuvchi rangli nishon (qabul va uzatishda bir xil uslub).
 * @param labels — kontekstga xos so'z (masalan uzatishda READY→"Uzatilmoqda").
 * @param size — "sm" (standart) yoki "md" (faol holatda ko'proq ko'zga tashlansin).
 */
export function StatusBadge({
  state,
  labels,
  size = "sm",
}: {
  state: ConnState;
  labels?: Partial<Record<ConnState, string>>;
  size?: "sm" | "md";
}): React.JSX.Element {
  const text = labels?.[state] ?? LABELS[state];
  const pad = size === "md" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs";
  const dot = size === "md" ? "h-2.5 w-2.5" : "h-2 w-2";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 font-medium text-slate-200 ${pad}`}
    >
      <span className={`rounded-full ${dot} ${COLORS[state]}`} />
      {text}
    </span>
  );
}
