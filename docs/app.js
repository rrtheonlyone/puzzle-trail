// Puzzle-trail runtime. Loads the encrypted config once, then renders the stage
// for the current URL slug by trial-decrypting blobs. AES-GCM's auth tag means a
// wrong slug fails to decrypt every blob -> "try again". No plaintext routing map.

const PBKDF2_ITERS = 150_000;
// Base path of the deployment: the current directory. Yields "/<repo>/" on a
// GitHub Pages project site and "/" at a domain root, with no hardcoded name.
const BASE = window.location.pathname.replace(/[^/]*$/, "");
const subtle = window.crypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const app = document.getElementById("app");

const b64decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(answer, salt) {
  const baseKey = await subtle.importKey("raw", encoder.encode(answer), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

// Returns the decrypted payload object, or null if this slug doesn't open this blob.
async function tryOpen(slug, blob) {
  try {
    const key = await deriveKey(slug, b64decode(blob.salt));
    const pt = await subtle.decrypt({ name: "AES-GCM", iv: b64decode(blob.iv) }, key, b64decode(blob.ct));
    return JSON.parse(decoder.decode(pt));
  } catch {
    return null; // wrong key -> auth tag mismatch
  }
}

function renderPuzzle(html) {
  app.innerHTML = `
    <div class="content">${html}</div>
    <form id="answer-form" class="answer-form">
      <input id="answer-input" type="text" placeholder="Your answer" autocomplete="off" autofocus />
      <button type="submit">Unlock</button>
    </form>`;
  document.getElementById("answer-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = document.getElementById("answer-input").value.trim();
    if (value) window.location.assign(BASE + encodeURIComponent(value));
  });
}

function renderReward(html) {
  app.innerHTML = `<div class="content reward">${html}</div>`;
}

function renderTryAgain() {
  app.innerHTML = `
    <div class="content">
      <h1>Not quite 🔒</h1>
      <p>That answer doesn't open any door. Check your spelling (answers are case-sensitive) and try again.</p>
      <p><a href="${BASE}">← Back to the start</a></p>
    </div>`;
}

async function route(config) {
  const slug = decodeURIComponent(window.location.pathname.slice(BASE.length));

  if (slug === "") {
    renderPuzzle(config.start.prompt);
    return;
  }

  for (const blob of config.blobs) {
    const payload = await tryOpen(slug, blob);
    if (payload) {
      if (payload.isReward) renderReward(payload.content);
      else renderPuzzle(payload.prompt);
      return;
    }
  }
  renderTryAgain();
}

async function main() {
  try {
    const res = await fetch(BASE + "puzzles.enc.json");
    if (!res.ok) throw new Error("fetch failed");
    await route(await res.json());
  } catch {
    app.innerHTML = `<div class="content"><h1>Something went wrong</h1><p>Couldn't load the puzzles.</p></div>`;
  }
}

main();
