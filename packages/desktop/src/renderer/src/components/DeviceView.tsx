import { useEffect, useRef, useState } from "react";
import type { SessionView } from "../../../shared/ipc";
import { VideoRenderer } from "../VideoRenderer";
import type { DecodedChunk } from "../VideoRenderer";
import { subscribeVideo } from "../videoBus";
import { StatusBadge } from "./StatusBadge";

interface Stats {
  fps: number;
  width: number;
  height: number;
  hasVideo: boolean;
}

/**
 * Bitta qurilma ko'rinishi — <canvas> ga WebCodecs orqali render.
 * Video hali kelmasa, namunaviy (placeholder) test-pattern chizadi.
 * Bosilganda fullscreen'ga o'tadi (onSelect orqali).
 */
export function DeviceView({
  session,
  fullscreen = false,
  onSelect,
}: {
  session: SessionView;
  fullscreen?: boolean;
  onSelect?: (id: string) => void;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<Stats>({ fps: 0, width: 0, height: 0, hasVideo: false });
  const deviceId = session.id;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new VideoRenderer(canvas, () => window.uzatuv.requestKeyframe(deviceId));
    let raf = 0;
    let hasVideo = false;

    // Ulanganda darhol keyframe so'raymiz (tez birinchi kadr uchun).
    window.uzatuv.requestKeyframe(deviceId);

    const unsub = subscribeVideo(deviceId, (chunk) => {
      const decoded: DecodedChunk = {
        data: new Uint8Array(chunk.data),
        ptsUs: BigInt(chunk.ptsUs),
        seq: chunk.seq,
        isKeyframe: chunk.isKeyframe,
        codec: chunk.codec,
        config: chunk.config ? new Uint8Array(chunk.config) : undefined,
      };
      renderer.decode(decoded);
    });

    // Placeholder animatsiyasi + statistika yangilash sikli.
    const loop = (): void => {
      const s = renderer.stats();
      if (s.frames > 0) hasVideo = true;
      if (!hasVideo) drawPlaceholder(canvas, session);
      setStats({ fps: s.fps, width: s.width, height: s.height, hasVideo });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      unsub();
      renderer.dispose();
    };
  }, [deviceId, session]);

  return (
    <div
      className={
        fullscreen
          ? "relative flex h-full w-full items-center justify-center bg-black"
          : "group relative aspect-video cursor-pointer overflow-hidden rounded-xl border border-slate-800 bg-black transition hover:border-sky-500"
      }
      onClick={() => !fullscreen && onSelect?.(deviceId)}
      title={fullscreen ? undefined : "To'liq ekran uchun bosing"}
    >
      <canvas ref={canvasRef} className="h-full w-full object-contain" />

      {/* Yuqori: qurilma nomi + holat */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-2.5">
        <span className="truncate text-sm font-semibold text-slate-100">
          {session.device.name || session.device.model}
        </span>
        <StatusBadge state={session.state} />
      </div>

      {/* Past: ko'rsatkichlar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent p-2.5 text-xs text-slate-300">
        <span>{stats.hasVideo ? `${stats.width}×${stats.height}` : "Signal yo'q"}</span>
        <span>{stats.fps} FPS</span>
        <span className="uppercase">{session.codec}</span>
        {session.rttMs !== null && <span>{session.rttMs} ms</span>}
        {fullscreen && (
          <span className="ml-auto rounded bg-slate-800/80 px-2 py-0.5">
            Chiqish uchun ESC
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Namunaviy test-pattern — video kelmaguncha canvas'ni jonli tutadi.
 * (Haqiqiy dekod ishlaganda uning ustidan chiziladi.)
 */
function drawPlaceholder(canvas: HTMLCanvasElement, session: SessionView): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (canvas.width !== 640 || canvas.height !== 360) {
    canvas.width = 640;
    canvas.height = 360;
  }
  const t = performance.now() / 1000;
  const w = canvas.width;
  const h = canvas.height;

  // Harakatlanuvchi gradient fon.
  const shift = (Math.sin(t) + 1) / 2;
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#0b1220");
  grad.addColorStop(shift, "#12233f");
  grad.addColorStop(1, "#0b1220");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Aylanuvchi indikator.
  ctx.save();
  ctx.translate(w / 2, h / 2 - 12);
  ctx.rotate(t * 2);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 1.4);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "center";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText("Video signal kutilmoqda…", w / 2, h / 2 + 32);
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(session.device.model || session.device.name, w / 2, h / 2 + 54);
}
