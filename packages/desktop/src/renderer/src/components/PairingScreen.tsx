import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { PairingView, PairingEndpointView } from "../../../shared/ipc";
import { Step } from "./Step";

/**
 * Bosh ekran — hali qurilma ulanmagan bo'lsa. QR kod, qisqa kod va
 * ulanish yo'riqnomasi (WiFi + USB tethering). Hammasi o'zbek tilida.
 * Bir nechta tarmoq (WiFi/USB) bo'lsa — har biriga alohida QR (tanlanadi).
 */
export function PairingScreen({ pairing }: { pairing: PairingView | null }): React.JSX.Element {
  // Ko'rsatiladigan endpoint indeksi (WiFi/USB o'rtasida almashish uchun).
  const [epIndex, setEpIndex] = useState(0);

  const endpoints: PairingEndpointView[] = useMemo(() => {
    if (!pairing) return [];
    if (pairing.endpoints && pairing.endpoints.length > 0) return pairing.endpoints;
    // Zaxira: eski ko'rinish (bitta URI).
    return [{ kind: "wifi", ip: pairing.ip, uri: pairing.uri }];
  }, [pairing]);

  const active = endpoints[Math.min(epIndex, endpoints.length - 1)];
  const qrValue = active?.uri ?? pairing?.uri ?? "";

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="grid w-full max-w-4xl gap-8 md:grid-cols-2">
        {/* Chap: QR kod + qisqa kod */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
          <div className="rounded-xl bg-white p-4">
            {pairing ? (
              <QRCodeSVG value={qrValue} size={220} level="M" />
            ) : (
              <div className="flex h-[220px] w-[220px] items-center justify-center text-slate-400">
                Server tayyorlanmoqda…
              </div>
            )}
          </div>

          {/* Tarmoq tanlash (WiFi / USB) — bir nechta endpoint bo'lsa */}
          {endpoints.length > 1 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {endpoints.map((ep, i) => (
                <button
                  key={ep.ip}
                  onClick={() => setEpIndex(i)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    i === epIndex
                      ? "bg-sky-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {ep.kind === "usb" ? "USB" : "WiFi"} · {ep.ip}
                </button>
              ))}
            </div>
          )}

          <p className="mt-5 text-sm text-slate-400">Yoki qisqa kodni kiriting:</p>
          <p className="mt-1 font-mono text-2xl tracking-widest text-slate-100">
            {pairing?.shortCode ?? "—"}
          </p>

          {pairing && (
            <p className="mt-4 text-center text-xs text-slate-500">
              Manzil:{" "}
              <span className="font-mono text-slate-300">
                {active?.ip ?? pairing.ip}:{pairing.port}
              </span>
              <br />
              Kompyuter nomi: <span className="text-slate-300">{pairing.name}</span>
            </p>
          )}
        </div>

        {/* O'ng: yo'riqnoma */}
        <div className="flex flex-col justify-center gap-6">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Telefon ekranini shu kompyuterga oling</h2>
            <p className="mt-2 text-slate-400">
              Boshqa qurilmada <span className="text-slate-200">Uzatuv</span> ilovasini oching va
              chapdagi QR kodni skanerlang. Uch qadam:
            </p>
          </div>

          <Step n={1} title="Bir xil WiFi ga ulaning">
            Telefon va kompyuter <span className="text-slate-200">bitta WiFi tarmog'ida</span>{" "}
            bo'lishi kerak. Keyin telefondagi ilova bu kompyuterni o'zi topadi.
          </Step>

          <Step n={2} title="QR kodni skanerlang">
            Ilovada “QR skanerlash” tugmasini bosing va chapdagi kodni ko'rsating.
            QR o'qilmasa, qisqa kodni qo'lda kiriting.
          </Step>

          <Step n={3} title="WiFi bo'lmasa — USB tethering">
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-400">
              <li>Telefonni USB kabel bilan kompyuterga ulang.</li>
              <li>
                Telefonda <span className="text-slate-200">Sozlamalar → Modem rejimi
                (Tethering) → USB modem</span> ni yoqing.
              </li>
              <li>Ilovada yana QR kodni skanerlang — ulanish USB orqali ketadi.</li>
            </ol>
          </Step>
        </div>
      </div>
    </div>
  );
}
