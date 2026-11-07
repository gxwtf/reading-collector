const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"; // 去掉易混字符 0oO1lI

/** 生成 n 位短码（默认 7 位，约 3.4e12 组合） */
export function shortCode(n = 7): string {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < n; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
