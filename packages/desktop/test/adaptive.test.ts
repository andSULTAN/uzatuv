/**
 * FAZA 4 — adaptiv bitrate mantiqi (sof funksiya) unit testi.
 * Ishga tushirish: npm run test:adaptive
 */

import assert from "node:assert/strict";
import { computeAdaptiveBitrate } from "../src/main/Session";

const MIN = 1500;
const MAX = 8000;

function check(name: string, got: number, expected: number): void {
  assert.equal(got, expected, `${name}: kutilgan ${expected}, olindi ${got}`);
  console.log(`✔ ${name}: ${got} kbps`);
}

// Yomon tarmoq (yuqori RTT) → pasaytiradi.
check("RTT 250ms → 0.7x", computeAdaptiveBitrate(8000, 250, MIN, MAX), 5600);
check("RTT 150ms → 0.85x", computeAdaptiveBitrate(8000, 150, MIN, MAX), 6800);

// Yaxshi tarmoq (past RTT) → oshiradi, lekin max'dan oshmaydi.
check("RTT 40ms, 8000da → max'da qoladi", computeAdaptiveBitrate(8000, 40, MIN, MAX), 8000);
check("RTT 40ms, 5000da → 1.1x", computeAdaptiveBitrate(5000, 40, MIN, MAX), 5500);

// O'rta RTT (60–120ms) → o'zgarmaydi.
check("RTT 90ms → o'zgarmaydi", computeAdaptiveBitrate(6000, 90, MIN, MAX), 6000);

// Min chegara — pastga tushib ketmaydi.
check("RTT 300ms, 1800da → min'da to'xtaydi", computeAdaptiveBitrate(1800, 300, MIN, MAX), 1500);

console.log("\n=== FAZA 4 adaptiv bitrate: BARCHA TASDIQLAR O'TDI ===");
process.exit(0);
