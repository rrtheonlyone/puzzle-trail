// Build step: reads the plaintext puzzles.config.json and emits an encrypted
// docs/puzzles.enc.json. Each stage's content is encrypted with AES-GCM using a
// key derived (PBKDF2) from the answer that unlocks it, so the shipped file
// contains only ciphertext — no answers, prompts, or chain order leak.
//
// Uses the Web Crypto API (crypto.webcrypto) so it is byte-compatible with the
// browser's window.crypto.subtle in docs/app.js.

import { webcrypto } from "node:crypto";
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { subtle } = webcrypto;
const getRandomValues = (arr) => webcrypto.getRandomValues(arr);
const ROOT = dirname(fileURLToPath(import.meta.url));
const DOCS = join(ROOT, "docs");

const PBKDF2_ITERS = 150_000;
const enc = new TextEncoder();

const b64 = (bytes) => Buffer.from(bytes).toString("base64");

async function deriveKey(answer, salt) {
  const baseKey = await subtle.importKey("raw", enc.encode(answer), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
}

async function encryptStage(answer, payload) {
  const salt = getRandomValues(new Uint8Array(16));
  const iv = getRandomValues(new Uint8Array(12));
  const key = await deriveKey(answer, salt);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(payload)));
  return { salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

async function main() {
  const configFile = process.argv[2] || "puzzles.config.json";
  const config = JSON.parse(await readFile(join(ROOT, configFile), "utf8"));

  if (!config.start?.prompt) throw new Error("config.start.prompt is required");
  if (!Array.isArray(config.puzzles)) throw new Error("config.puzzles must be an array");
  if (!config.reward?.answerToHere || !config.reward?.content) {
    throw new Error("config.reward needs answerToHere and content");
  }

  const stages = [
    ...config.puzzles.map((p) => ({ answer: p.answerToHere, payload: { prompt: p.prompt } })),
    { answer: config.reward.answerToHere, payload: { content: config.reward.content, isReward: true } },
  ];

  for (const [i, s] of stages.entries()) {
    if (!s.answer) throw new Error(`stage ${i} is missing answerToHere`);
  }

  const blobs = await Promise.all(stages.map((s) => encryptStage(s.answer, s.payload)));

  const out = { start: { prompt: config.start.prompt }, blobs };
  await writeFile(join(DOCS, "puzzles.enc.json"), JSON.stringify(out, null, 2));

  // Keep the SPA fallback byte-identical to index.html so clean URLs work on GitHub Pages.
  await copyFile(join(DOCS, "index.html"), join(DOCS, "404.html"));

  console.log(`Built docs/puzzles.enc.json (${blobs.length} encrypted stages) from ${configFile} and refreshed docs/404.html.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
