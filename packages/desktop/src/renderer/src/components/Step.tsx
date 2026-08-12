/**
 * Step — raqamli qadam (qabul va uzatish oqimlarida bir xil ko'rinish uchun umumiy).
 * accent: sky (qabul) / emerald (uzatish) — oqim bo'ylab rang izchilligi.
 */
export function Step({
  n,
  title,
  accent = "sky",
  children,
}: {
  n: number;
  title: string;
  accent?: "sky" | "emerald";
  children: React.ReactNode;
}): React.JSX.Element {
  const circle = accent === "emerald" ? "bg-emerald-600" : "bg-sky-600";
  return (
    <div className="flex gap-3">
      <div
        className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${circle} text-sm font-bold text-white`}
      >
        {n}
      </div>
      <div>
        <h3 className="font-semibold text-slate-200">{title}</h3>
        <div className="text-sm text-slate-400">{children}</div>
      </div>
    </div>
  );
}
