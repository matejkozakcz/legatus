/**
 * Simple Czech vocative case converter for first names.
 * Covers the most common patterns; falls back to nominative if unsure.
 */
export function toVocative(name: string): string {
  if (!name) return name;
  const n = name.trim();

  // Common female endings — vocative is same as nominative
  if (/[aeiyí]$/i.test(n)) return n;

  const lower = n.toLowerCase();

  // Exceptions / irregular
  const irregulars: Record<string, string> = {
    bůh: "Bože",
    člověk: "člověče",
  };
  if (irregulars[lower]) {
    return n[0] === n[0].toUpperCase()
      ? irregulars[lower][0].toUpperCase() + irregulars[lower].slice(1)
      : irregulars[lower];
  }

  const stem = n.slice(0, -1);
  const last = lower.slice(-1);
  const last2 = lower.slice(-2);
  const last3 = lower.slice(-3);

  // -ek → -ku  (Marek → Marku, Radek → Radku)
  if (last2 === "ek") return n.slice(0, -2) + "ku";

  // -ec → -če  (Honzovec → Honzovče... rare for first names, but covered)
  if (last2 === "ec") return n.slice(0, -2) + "če";

  // -el → -le  (Pavel → Pavle)
  if (last2 === "el") return n.slice(0, -2) + "le";

  // -eš → -ši  (Aleš → Aleši)  — handled by general -š rule below

  // -ůj / -ej → -oji / -eji  (Matěj → Matěji, Ondřej → Ondřeji)
  if (last === "j") return n + "i";

  // -ch → -chu  (Vojtech → Vojtěchu)  
  if (last2 === "ch") return n + "u";

  // -k → -ku  (Patrik → Patriku, Dominik → Dominiku)
  if (last === "k") return n + "u";

  // -r → -ře  (Petr → Petře, Alexandr → Alexandre)
  if (last === "r") return stem + "ře";

  // -š → -ši  (Tomáš → Tomáši, Lukáš → Lukáši)
  if (last === "š") return n + "i";

  // -ž → -ži  (Jiří... no, but Stráž → Stráži)
  if (last === "ž") return n + "i";

  // -ř → -ři  (Oldřich handled below, but -ř names: Řehoř → Řehoři)
  if (last === "ř") return n + "i";

  // -n → -ne  (Jan → Jane, Martin → Martine)
  if (last === "n") return stem + "ne";

  // -l → -le  (Karel → Karle — but -el handled above; Daniel → Daniele? Actually Danieli)
  if (last === "l") return n + "e";

  // -m → -me  (Adam → Adame)
  if (last === "m") return n + "e";

  // -t → -te  (Robert → Roberte)
  if (last === "t") return n + "e";

  // -d → -de  (David → Davide)
  if (last === "d") return n + "e";

  // -p → -pe  (Filip → Filipe)
  if (last === "p") return n + "e";

  // -b → -be  (Jakub → Jakube)
  if (last === "b") return n + "e";

  // -v → -ve  (Gustav → Gustave)
  if (last === "v") return n + "e";

  // -c → -ci  (Franc → Franci — rare)
  if (last === "c") return n + "i";

  // fallback — return as-is
  return n;
}
