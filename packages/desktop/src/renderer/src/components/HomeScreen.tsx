/**
 * HomeScreen — rejim tanlash: QABUL QILISH yoki UZATISH.
 * Uzatuv ikki tomonlama: bu kompyuter ham ekran qabul qiladi, ham uzatadi.
 */
export function HomeScreen({
  onReceive,
  onTransmit,
  deviceCount,
}: {
  onReceive: () => void;
  onTransmit: () => void;
  deviceCount: number;
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-slate-100">Uzatuv</h1>
        <p className="mt-2 text-slate-400">Ekran uzatish — nima qilmoqchisiz?</p>
      </div>

      <div className="grid w-full max-w-3xl gap-6 md:grid-cols-2">
        <ModeCard
          icon="📺"
          title="Qabul qilish"
          desc="Boshqa qurilma (telefon / noutbuk) ekranini shu kompyuterda ko'rsatish."
          badge={deviceCount > 0 ? `${deviceCount} ta ulangan` : "Tinglanmoqda"}
          onClick={onReceive}
          accent="sky"
        />
        <ModeCard
          icon="📡"
          title="Uzatish"
          desc="Shu kompyuter ekranini boshqa qurilmaga (Android TV / PC) jonli uzatish. Ovoz keyin qo'shiladi."
          badge="Uzatishga tayyor"
          onClick={onTransmit}
          accent="emerald"
        />
      </div>

      <p className="mt-8 text-center text-xs text-slate-500">
        Bu kompyuter doim qabul qilishga tayyor — boshqa qurilmalar unga ulanaveradi.
      </p>
    </div>
  );
}

function ModeCard({
  icon,
  title,
  desc,
  badge,
  onClick,
  accent,
}: {
  icon: string;
  title: string;
  desc: string;
  badge: string;
  onClick: () => void;
  accent: "sky" | "emerald";
}): React.JSX.Element {
  const ring = accent === "sky" ? "hover:border-sky-500" : "hover:border-emerald-500";
  const badgeColor = accent === "sky" ? "text-sky-400" : "text-emerald-400";
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-7 text-left transition ${ring}`}
    >
      <span className="text-4xl">{icon}</span>
      <span className="text-xl font-bold text-slate-100">{title}</span>
      <span className="text-sm text-slate-400">{desc}</span>
      <span className={`mt-1 text-xs font-medium ${badgeColor}`}>{badge}</span>
    </button>
  );
}
