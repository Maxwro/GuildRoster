// =========================================================
// Runs fetch-data.mjs every 3 minutes, so data.js stays fresh.
//
//   Run from this folder:   node watch-data.mjs
//   Other interval:         node watch-data.mjs 5      (minutes)
//   Stop it:                Ctrl+C
//
// Keep this window open while you want live data. The page checks for
// new data by itself every minute, so you never have to refresh it.
// =========================================================

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MINUTES = Number(process.argv[2]) || 3;
const clock = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

let running = false;

function run() {
  if (running) return; // the previous fetch is still busy — skip this turn
  running = true;
  const started = new Date();
  process.stdout.write(`[${clock(started)}] Fetching guild data... `);

  const child = spawn(process.execPath, ["fetch-data.mjs"], { cwd: HERE });
  let summary = "";
  let errors = "";
  child.stdout.on("data", (d) => {
    const done = d.toString().split("\n").find((line) => line.startsWith("Done:"));
    if (done) summary = done;
  });
  child.stderr.on("data", (d) => (errors += d.toString()));

  child.on("close", (code) => {
    running = false;
    const seconds = Math.round((Date.now() - started) / 1000);
    const next = clock(new Date(started.getTime() + MINUTES * 60 * 1000));
    if (code === 0) console.log(`done in ${seconds}s. ${summary} Next: ${next}`);
    else console.log(`FAILED (exit ${code}) — will try again at ${next}\n${errors.trim()}`);
  });
}

console.log(`Refreshing data.js every ${MINUTES} minutes. Press Ctrl+C to stop.\n`);
run();
setInterval(run, MINUTES * 60 * 1000);
