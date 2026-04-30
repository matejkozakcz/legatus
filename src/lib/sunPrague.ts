// Sunrise/sunset calculation for Prague (50.0755°N, 14.4378°E)
// Using NOAA Solar Calculator algorithm. Returns UTC Date objects.
// DST is irrelevant for the calculation itself — sun events are absolute UTC moments.
// Caller can compare to `new Date()` directly regardless of viewer's timezone.

const LAT = 50.0755;
const LON = 14.4378;
const ZENITH = 90.833; // official sunrise/sunset (with atmospheric refraction)

function toRad(d: number) { return (d * Math.PI) / 180; }
function toDeg(r: number) { return (r * 180) / Math.PI; }

function calcSunEvent(date: Date, rising: boolean): Date | null {
  // Day of year (UTC)
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diff = date.getTime() - start;
  const N = Math.floor(diff / 86400000);

  const lngHour = LON / 15;
  const t = N + ((rising ? 6 : 18) - lngHour) / 24;

  // Mean anomaly
  const M = 0.9856 * t - 3.289;
  // True longitude
  let L = M + 1.916 * Math.sin(toRad(M)) + 0.020 * Math.sin(toRad(2 * M)) + 282.634;
  L = ((L % 360) + 360) % 360;

  // Right ascension
  let RA = toDeg(Math.atan(0.91764 * Math.tan(toRad(L))));
  RA = ((RA % 360) + 360) % 360;
  // Same quadrant as L
  const Lquad = Math.floor(L / 90) * 90;
  const RAquad = Math.floor(RA / 90) * 90;
  RA = RA + (Lquad - RAquad);
  RA = RA / 15;

  // Declination
  const sinDec = 0.39782 * Math.sin(toRad(L));
  const cosDec = Math.cos(Math.asin(sinDec));

  // Local hour angle
  const cosH = (Math.cos(toRad(ZENITH)) - sinDec * Math.sin(toRad(LAT))) / (cosDec * Math.cos(toRad(LAT)));
  if (cosH > 1 || cosH < -1) return null; // sun never rises/sets that day

  let H = rising ? 360 - toDeg(Math.acos(cosH)) : toDeg(Math.acos(cosH));
  H = H / 15;

  const T = H + RA - 0.06571 * t - 6.622;
  let UT = T - lngHour;
  UT = ((UT % 24) + 24) % 24;

  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const hours = Math.floor(UT);
  const minutes = Math.floor((UT - hours) * 60);
  const seconds = Math.floor(((UT - hours) * 60 - minutes) * 60);
  result.setUTCHours(hours, minutes, seconds, 0);
  return result;
}

export function getSunTimes(date: Date = new Date()): { sunrise: Date | null; sunset: Date | null } {
  return {
    sunrise: calcSunEvent(date, true),
    sunset: calcSunEvent(date, false),
  };
}

/** Returns 'light' if sun is up in Prague right now, otherwise 'dark'. */
export function getThemeForNow(now: Date = new Date()): "light" | "dark" {
  const { sunrise, sunset } = getSunTimes(now);
  if (!sunrise || !sunset) {
    // Polar edge case — fallback to hour
    const h = now.getUTCHours();
    return h >= 6 && h < 18 ? "light" : "dark";
  }
  return now >= sunrise && now < sunset ? "light" : "dark";
}

/** Milliseconds until the next sunrise/sunset transition from `now`. */
export function msUntilNextTransition(now: Date = new Date()): number {
  const today = getSunTimes(now);
  const candidates: Date[] = [];
  if (today.sunrise && today.sunrise > now) candidates.push(today.sunrise);
  if (today.sunset && today.sunset > now) candidates.push(today.sunset);
  if (candidates.length === 0) {
    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
    const next = getSunTimes(tomorrow);
    if (next.sunrise) candidates.push(next.sunrise);
    if (next.sunset) candidates.push(next.sunset);
  }
  if (candidates.length === 0) return 60 * 60 * 1000; // fallback: 1h
  const next = candidates.reduce((a, b) => (a < b ? a : b));
  return Math.max(60 * 1000, next.getTime() - now.getTime());
}
