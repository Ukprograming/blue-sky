// Lengths use the planet radius as their unit. RGB is an educational sampling
// of the visible spectrum, not a colorimetric reconstruction of sunlight.
export const WAVELENGTHS = [650, 530, 450];
export const COLORS = ['#ff625d', '#68ed9d', '#6b9fff'];
export const OPTICAL_DEPTH = WAVELENGTHS.map(w => 0.30 * (650 / w) ** 4);
export const SHELL_HEIGHT = 0.34;

export function circleInterval(x, y, dx, dy, radius) {
  const b = x * dx + y * dy;
  const c = x * x + y * y - radius * radius;
  const d = b * b - c;
  if (d < 0) return null;
  const root = Math.sqrt(d);
  return [-b - root, -b + root];
}

export function atmosphereLength(x, y, dx, dy, maxDistance = Infinity) {
  const outer = circleInterval(x, y, dx, dy, 1 + SHELL_HEIGHT);
  if (!outer) return 0;
  const start = Math.max(0, outer[0]);
  let end = Math.min(maxDistance, outer[1]);
  const earth = circleInterval(x, y, dx, dy, 1);
  if (earth && earth[0] > 1e-7) end = Math.min(end, earth[0]);
  return Math.max(0, end - start);
}

export function sunGeometry(position, orbitRatio) {
  const limit = Math.acos(1 / orbitRatio);
  const angle = position / 100 * limit;
  const x = orbitRatio * Math.sin(angle);
  const y = -orbitRatio * Math.cos(angle);
  const distance = Math.hypot(x, y + 1);
  const dx = x / distance, dy = (y + 1) / distance;
  return { x, y, dx, dy, distance, altitude: Math.asin(Math.max(0, -dy)), angle, limit };
}

export function directLight(sun) {
  const length = atmosphereLength(0, -1, sun.dx, sun.dy, sun.distance);
  return { length, rgb: OPTICAL_DEPTH.map(t => Math.exp(-t * length / SHELL_HEIGHT)) };
}

// Single-scattering line-of-sight integral. At each point, light is attenuated
// on both the Sun -> point and point -> observer paths, with a Rayleigh phase.
export function skyLight(sun, elevation, side = 1) {
  const dx = side * Math.cos(elevation), dy = -Math.sin(elevation);
  const length = atmosphereLength(0, -1.00001, dx, dy);
  const rgb = [0, 0, 0], steps = 44, step = length / steps;
  for (let i = 0; i < steps; i++) {
    const s = (i + 0.5) * step;
    const x = dx * s, y = -1.00001 + dy * s;
    const distance = Math.hypot(sun.x - x, sun.y - y);
    const sx = (sun.x - x) / distance, sy = (sun.y - y) / distance;
    const earth = circleInterval(x, y, sx, sy, 1);
    if (earth && earth[0] > 1e-7 && earth[0] < distance) continue;
    const incoming = atmosphereLength(x, y, sx, sy, distance);
    const phase = 0.75 * (1 + (dx * sx + dy * sy) ** 2);
    for (let c = 0; c < 3; c++) {
      const beta = OPTICAL_DEPTH[c] / SHELL_HEIGHT;
      rgb[c] += beta * Math.exp(-beta * (incoming + s)) * phase * step;
    }
  }
  return rgb;
}

export function relativeRGB(rgb) {
  const sum = rgb.reduce((a, b) => a + b, 0);
  if (!sum) return [0, 0, 0];
  const exact = rgb.map(v => v / sum * 100);
  const values = exact.map(Math.floor);
  const order = exact.map((v, i) => ({ i, remainder: v - values[i] })).sort((a, b) => b.remainder - a.remainder);
  const missing = 100 - values.reduce((a, b) => a + b, 0);
  for (let i = 0; i < missing; i++) values[order[i].i]++;
  return values;
}

export function scatterAngle(random = Math.random) {
  // Rejection sampling of the 2D analogue of the Rayleigh 1 + cos² phase.
  let angle;
  do { angle = random() * Math.PI * 2; } while (random() * 2 > 1 + Math.cos(angle) ** 2);
  return angle;
}

export function scatterProbability(color, atmosphericDistance) {
  return -Math.expm1(-OPTICAL_DEPTH[color] * atmosphericDistance / SHELL_HEIGHT);
}
