const enc = new TextEncoder();
const dec = new TextDecoder();
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function decryptEnvelope(passphrase, envelope) {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(envelope.salt), iterations: envelope.iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(envelope.iv) }, key, unb64(envelope.ct));
  return JSON.parse(dec.decode(pt));
}
