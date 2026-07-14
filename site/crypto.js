const enc = new TextEncoder();
const dec = new TextDecoder();
// atob + tight loop。Uint8Array.from(str, cb) はコールバックが要素ごとに走り、
// 数MBのciphertextでは数百ms遅くなるため、単純ループにしている。
const unb64 = (s) => {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

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
