import { QRCodeSVG } from "qrcode.react";
import type { PairingView } from "../../../shared/ipc";

/**
 * Bosh ekran — hali qurilma ulanmagan bo'lsa. QR kod, qisqa kod va
 * ulanish yo'riqnomasi (WiFi + USB tethering). Hammasi o'zbek tilida.
 */
export function PairingScreen({ pairing }: { pairing: PairingView | null }): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="grid w-full max-w-4xl gap-8 md:grid-cols-2">
        {/* Chap: QR kod + qisqa kod */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
          <div className="rounded-xl bg-white p-4">
            {pairing ? (
              <QRCodeSVG value={pairing.uri} size={220} level="M" />
            ) : (
              <div className="flex h-[220px] w-[220px] items-center justify-center text-slate-400">
                Server tayyorlanmoqda…
              </div>
            )}
          </div>

          <p className="mt-5 text-sm text-slate-400">Yoki qisqa kodni kiriting:</p>
          <p className="mt-1 font-mono text-2xl tracking-widest text-slate-100">
            {pairing?.shortCode ?? "—"}
          </p>

          {pairing && (
            <p className="mt-4 text-center text-xs text-slate-500">
              Manzil: <span className="font-mono text-slate-300">{pairing.ip}:{pairing.port}</span>
              <br />
              Kompyuter nomi: <span className="text-slate-300">{pairing.name}</span>
            </p>
          )}
        </div>

        {/* O'ng: yo'riqnoma */}
        <div className="flex flex-col justify-center gap-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-100">Uzatuv</h1>
            <p className="mt-2 text-slate-400">
              Android telefoningiz ekranini shu kompyuterga jonli uzating.
              Telefonda <span className="text-slate-200">Uzatuv</span> ilovasini oching va
              QR kodni skanerlang.
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

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">
        {n}
      </div>
      <div>
        <h3 className="font-semibold text-slate-200">{title}</h3>
        <div className="text-sm text-slate-400">{children}</div>
      </div>
    </div>
  );
}
