import { useEffect, useRef, useState } from "react";
import { ScreenTransmitter } from "../ScreenTransmitter";
import type { TransmitConfig } from "../ScreenTransmitter";
import type { ConnState } from "@uzatuv/protocol";

/**
 * TransmitScreen — UZATISH rejimi. Bu PC ekranini boshqa qabul qiluvchiga
 * (Android TV / boshqa PC) uzatadi. Qabul qiluvchining `uzatuv://` havolasi
 * kiritiladi (uning QR'i ostidan), keyin ekran tanlanadi va uzatiladi.
 */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

export function TransmitScreen({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [uri, setUri] = useState("");
  const [state, setState] = useState<ConnState | "IDLE">("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [audioOn, setAudioOn] = useState(false); // Ovoz — 3-bosqichда faollashadi

  const videoRef = useRef<HTMLVideoElement>(null);
  const txRef = useRef<ScreenTransmitter | null>(null);
  const startedRef = useRef(false);

  const active = state !== "IDLE" && state !== "CLOSED";

  function stopAll(): void {
    startedRef.current = false;
    txRef.current?.stop();
    txRef.current = null;
    window.uzatuv.transmitStop();
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("IDLE");
  }

  function startCapture(cfg: TransmitConfig): void {
    const tx = new ScreenTransmitter(
      (data, ptsUs, isKeyframe) =>
        window.uzatuv.transmitChunk({ data: toArrayBuffer(data), ptsUs: ptsUs.toString(), isKeyframe }),
      (stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      },
      (reason) => {
        setError(reason === "ended" ? "Ekran ulashish to'xtatildi" : reason);
        stopAll();
      },
    );
    txRef.current = tx;
    tx.start(cfg).catch((e: Error) => {
      setError(e.message);
      stopAll();
    });
  }

  useEffect(() => {
    const offState = window.uzatuv.onTransmitState((s) => setState(s));
    const offControl = window.uzatuv.onTransmitControl((msg) => {
      if (msg.type === "STREAM_CONFIG" && !startedRef.current) {
        startedRef.current = true;
        startCapture({
          codec: msg.codec,
          width: msg.maxWidth || 1920,
          height: msg.maxHeight || 1080,
          fps: msg.fps || 30,
          bitrateKbps: msg.bitrateKbps || 8000,
        });
      } else if (msg.type === "KEYFRAME_REQUEST") {
        txRef.current?.requestKeyframe();
      }
    });
    return () => {
      offState();
      offControl();
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function begin(): Promise<void> {
    setError(null);
    if (!ScreenTransmitter.isSupported()) {
      setError("Bu qurilmada ekran uzatish qo'llab-quvvatlanmaydi.");
      return;
    }
    if (!uri.trim()) {
      setError("Qabul qiluvchining havolasini joylang.");
      return;
    }
    const res = await window.uzatuv.transmitStart(uri.trim());
    if (!res.ok) {
      setError(res.error ?? "Havola noto'g'ri.");
      return;
    }
    setReceiverName(res.name ?? "");
    // Ekran olish STREAM_CONFIG kelganда boshlanadi (onTransmitControl).
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-slate-800 px-5 py-3">
        <button
          onClick={() => {
            stopAll();
            onBack();
          }}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
        >
          ← Orqaga
        </button>
        <span className="text-lg font-semibold">Ekran uzatish</span>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        {!active ? (
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
            <h2 className="text-xl font-bold text-slate-100">Boshqa qurilmaga uzatish</h2>
            <p className="mt-2 text-sm text-slate-400">
              Qabul qiluvchi qurilmada (Android TV yoki boshqa kompyuter) Uzatuv'ni{" "}
              <span className="text-slate-200">"Qabul qilish"</span> rejimida oching. U yerda
              chiqadigan <span className="text-slate-200">uzatuv://</span> havolani nusxalab, shu
              yerga joylang.
            </p>

            <input
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder="uzatuv://pair?..."
              className="mt-5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            />

            <label className="mt-4 flex cursor-not-allowed items-center gap-2 text-sm text-slate-500">
              <input type="checkbox" checked={audioOn} disabled onChange={() => setAudioOn(!audioOn)} />
              Ovoz bilan uzatish <span className="text-xs">(tez orada)</span>
            </label>

            {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

            <button
              onClick={begin}
              className="mt-5 w-full rounded-lg bg-sky-600 px-4 py-2.5 font-semibold text-white hover:bg-sky-500"
            >
              Uzatishni boshlash
            </button>
          </div>
        ) : (
          <div className="flex w-full max-w-4xl flex-col items-center">
            <div className="w-full overflow-hidden rounded-xl border border-slate-800 bg-black">
              <video ref={videoRef} autoPlay muted className="max-h-[60vh] w-full object-contain" />
            </div>
            <div className="mt-4 flex items-center gap-4 text-sm">
              <StateBadge state={state} />
              {receiverName && <span className="text-slate-400">→ {receiverName}</span>}
            </div>
            {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
            <button
              onClick={stopAll}
              className="mt-5 rounded-lg bg-rose-600 px-6 py-2.5 font-semibold text-white hover:bg-rose-500"
            >
              To'xtatish
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function StateBadge({ state }: { state: ConnState | "IDLE" }): React.JSX.Element {
  const map: Record<string, { label: string; color: string }> = {
    CONNECTING: { label: "Ulanmoqda…", color: "text-amber-400" },
    HANDSHAKING: { label: "Ulanmoqda…", color: "text-amber-400" },
    READY: { label: "● Uzatilmoqda", color: "text-emerald-400" },
    RECONNECTING: { label: "Qayta ulanmoqda…", color: "text-amber-400" },
    CLOSED: { label: "Uzildi", color: "text-rose-400" },
    IDLE: { label: "Tayyor", color: "text-slate-400" },
  };
  const s = map[state] ?? map.IDLE!;
  return <span className={`font-medium ${s.color}`}>{s.label}</span>;
}
