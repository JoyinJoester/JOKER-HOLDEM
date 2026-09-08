export const secureRandom = () =>
  crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export const randomIndex = (length: number) =>
  Math.floor(secureRandom() * length);

export const randomHex = (bytes = 12) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
