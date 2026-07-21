#!/usr/bin/env node
// Chunk-size optimizer — evaluates cost and wall-clock time over candidate
// chunk sizes B, per tier, under the constraints in docs/tuning/gemini-limits.md.
//
//   node scripts/chunk-model.mjs                  # defaults (estimates marked below)
//   node scripts/chunk-model.mjs N=1400 tout=22 th=150
//   node scripts/chunk-model.mjs file=samples/subtitles/full-movie.srt tout=22
//
// Every parameter is overridable as key=value. Re-run with measured values
// (from the [gemini] log line: prompt=, thoughts=, output=) as they arrive.

import { readFileSync } from 'node:fs';

// ---------- parameters (defaults = MEASURED unless marked) ----------------
// Measured 2026-07-21 from a real 461-block run (3 chunks) — see
// docs/tuning/chunk-size-model.md "실측 파라미터". Back-solved from the
// [gemini] log lines: prompt = pfixed + blocks*tin, output = blocks*tout.
const P = {
  // Workload
  N: 851,        // subtitle blocks per file (full-movie.srt measured)
  tin: 15,       // MEASURED input tokens/block (was estimated 10)
  tout: 16,      // MEASURED output tokens/block (was estimated 20)
  th: 0,         // MEASURED thinking tokens/request — 0 at both MINIMAL and LOW
  pfixed: 1028,  // MEASURED fixed prompt tokens/chunk incl. movieInfo notes (est. was 700)
  dens: 1.25,    // p95/mean density factor — densest window vs average (measured ~1.2)

  // Model / API (docs/tuning/gemini-limits.md)
  outcap: 65536, // max output tokens per request
  pin: 1.5,      // $/1M input
  pout: 9.0,     // $/1M output (thinking bills here too)
  rpmFree: 15,
  rpmPaid: 1000,
  rpdFree: 1500,
  timeout: 300,  // route maxDuration seconds

  // Concurrency ceiling we impose ourselves (SERVER_CONCURRENCY). Neither
  // Gemini (no concurrent-request limit, §2) nor Vercel (auto-scales to 30,000,
  // §7-1) binds this at our scale, so 14 is OUR choice, bounded by how much of
  // Gemini's 1,000 RPM one user may consume — not by an infrastructure ceiling.
  kmax: 14,

  // Latency
  ttft: 2,       // ESTIMATE seconds to first token
  v: 220,        // MEASURED output tokens/second (was estimated 120)

  // Candidate chunk sizes
  B: '25,40,50,100,150,200,300,425,600,851',
};

for (const arg of process.argv.slice(2)) {
  const [k, v] = arg.split('=');
  if (k === 'file') {
    const raw = readFileSync(v, 'utf8').replace(/\r\n?/g, '\n').trim();
    P.N = raw.split(/\n\s*\n/).filter(Boolean).length;
  } else if (k in P) {
    P[k] = k === 'B' ? v : Number(v);
  } else {
    console.error(`unknown param: ${k}`);
    process.exit(1);
  }
}

const Bs = P.B.split(',').map(Number);

// ---------- model -----------------------------------------------------------
function evaluate(B, rpm) {
  const m = Math.ceil(P.N / B);

  // Per-chunk duration: TTFT + generation of (body + thoughts).
  const outTokens = B * P.tout + P.th;
  const D = P.ttft + outTokens / P.v;

  // Concurrency ceiling. Three binds: the number of chunks, the rate Gemini
  // allows (the launch burst plus the steady-state 60K/D), and the cap we
  // impose ourselves. On the free tier RPM dominates; on the paid tier it
  // never binds, so kmax is the only thing holding K down.
  const K = Math.max(
    1,
    Math.min(m, P.kmax, rpm, Math.floor((D * rpm) / 60) || 1),
  );

  const waves = Math.ceil(m / K);
  const T = waves * D;

  // Cost (paid tier; free is $0 — time and limits still apply).
  const inputTok = m * P.pfixed + P.N * P.tin;
  const outputTok = P.N * P.tout + m * P.th; // thoughts bill as output
  const cost = (inputTok * P.pin + outputTok * P.pout) / 1e6;

  // Constraints
  const flags = [];
  // Densest-window safety: the worst chunk carries dens× the average tokens.
  if (B * P.tout * P.dens + P.th > P.outcap) flags.push('OUTCAP');
  if (D > P.timeout) flags.push('TIMEOUT');

  return { B, m, D, K, waves, T, cost, inputTok, outputTok, flags };
}

function fmtTime(s) {
  return s >= 60 ? `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s` : `${Math.round(s)}s`;
}

function table(rpm, label, showCost) {
  console.log(`\n=== ${label} (RPM ${rpm}) — N=${P.N}, tout=${P.tout}, th=${P.th}, v=${P.v} tok/s ===`);
  const rows = Bs.map((B) => evaluate(B, rpm));
  const header = showCost
    ? 'B      chunks  D/chunk  K   waves  total    $/file    tok(in/out)'
    : 'B      chunks  D/chunk  K   waves  total    files/day';
  console.log(header);
  for (const r of rows) {
    const base = [
      String(r.B).padEnd(6),
      String(r.m).padEnd(7),
      fmtTime(r.D).padEnd(8),
      String(r.K).padEnd(3),
      String(r.waves).padEnd(6),
      fmtTime(r.T).padEnd(8),
    ].join(' ');
    const tail = showCost
      ? `$${r.cost.toFixed(4)}   ${(r.inputTok / 1000).toFixed(1)}k/${(r.outputTok / 1000).toFixed(1)}k`
      : `${Math.floor(P.rpdFree / r.m)}`;
    const flag = r.flags.length ? `  ⚠ ${r.flags.join(',')}` : '';
    console.log(`${base} ${tail}${flag}`);
  }
  const ok = rows.filter((r) => r.flags.length === 0);
  const byTime = [...ok].sort((a, b) => a.T - b.T)[0];
  const byCost = [...ok].sort((a, b) => a.cost - b.cost)[0];
  console.log(showCost
    ? `→ fastest: B=${byTime.B} (${fmtTime(byTime.T)})   cheapest: B=${byCost.B} ($${byCost.cost.toFixed(4)})`
    : `→ fastest: B=${byTime.B} (${fmtTime(byTime.T)})`);
}

table(P.rpmFree, 'FREE tier (BYOK)', false);
table(P.rpmPaid, 'PAID tier (server key)', true);

console.log(`\nNotes:
- th (thinking) is a PER-REQUEST cost at output rates — the reason many small
  chunks are expensive even though the subtitle text itself is B-invariant.
- Free tier cost is $0; the columns that matter are total time and files/day (RPD ${P.rpdFree}).
- OUTCAP flag uses the densest-window factor dens=${P.dens}, not the average.
- Failure blast radius: one failed chunk keeps B blocks untranslated — pick the
  largest B whose blast radius is still acceptable, not the theoretical optimum.`);
