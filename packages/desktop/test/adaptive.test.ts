/**
 * Adaptiv bitrate mantiqi (sof funksiya) unit testi.
 * Lokal tarmoq: min 8 Mbps, max 20 Mbps, yumshoq adaptatsiya.
 * Ishga tushirish: npm run test:adaptive
 */

import assert from "node:assert/strict";
import { computeAdaptiveBitrate } from "../src/main/Session";

const MIN = 8000;
const MAX = 20000;

function check(name: string, got: number, expected: number): void {
  assert.equal(got, expected, `${name}: kutilgan ${expected}, olindi ${got}`);
  console.log(`✔ ${name}: ${got} kbps`);
}

// Tarmoq jiddiy to'lgan (yuqori RTT) → pasaytiradi.
check("RTT 600ms → 0.8x", computeAdaptiveBitrate(20000, 600, MIN, MAX), 16000);
check("RTT 300ms → 0.92x", computeAdaptiveBitrate(20000, 300, MIN, MAX), 18400);

// Barqaror (past RTT) → asta oshiradi, max'dan oshmaydi.
check("RTT 40ms, 20000da → max'da qoladi", computeAdaptiveBitrate(20000, 40, MIN, MAX), 20000);
check("RTT 40ms, 15000da → 1.08x", computeAdaptiveBitrate(15000, 40, MIN, MAX), 16200);

// O'rta RTT (100–250ms) → o'zgarmaydi (scroll paytидаги sakrash sifatni tushirmaydi).
check("RTT 150ms → o'zgarmaydi", computeAdaptiveBitrate(15000, 150, MIN, MAX), 15000);

// Min floor — 8 Mbps'дан pastga tushmaydi (sifat kafolati).
check("RTT 700ms, 9000da → min floor 8000", computeAdaptiveBitrate(9000, 700, MIN, MAX), 8000);

console.log("\n=== Adaptiv bitrate: BARCHA TASDIQLAR O'TDI ===");
process.exit(0);
