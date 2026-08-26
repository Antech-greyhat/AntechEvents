// Cryptographically-strong, URL-safe random tokens for capability links.
// The token is used directly as the Firestore `shares` document id, so the id
// *is* the secret — anyone with the link can read the (non-revoked) share, and
// nobody can enumerate them (listing is denied by the security rules).

function bytesToHex(bytes) {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

// Returns an unguessable token as a lowercase hex string. 16 bytes = 128 bits.
export function randomToken(byteLength = 16) {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") {
    throw new Error("A secure random generator isn't available in this browser.");
  }
  const bytes = new Uint8Array(byteLength);
  cryptoObj.getRandomValues(bytes);
  return bytesToHex(bytes);
}
