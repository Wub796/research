/** GLSL Fabric sources for the heliocentric scene.
 *
 *  Bodies are drawn with flat MaterialAppearances and light themselves: the
 *  Sun sits at the world origin, so each fragment's light direction is simply
 *  (sun in eye space − fragment in eye space). Cesium's own scene light is
 *  Earth-centric and would be wrong everywhere else in the solar system.
 *
 *  Polyline materials rely on `st.s` running 0→1 by vertex index; the mission
 *  exports samples uniformly in time, so `s` is also the mission fraction and
 *  the trail can be driven by a single `progress` uniform — no geometry
 *  rebuilds while the clock runs. */

const NOISE = /* glsl */ `
float ares_hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float ares_noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(ares_hash(i), ares_hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(ares_hash(i + vec3(0.0, 1.0, 0.0)), ares_hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(ares_hash(i + vec3(0.0, 0.0, 1.0)), ares_hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(ares_hash(i + vec3(0.0, 1.0, 1.0)), ares_hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float ares_fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * ares_noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}
// Cesium ellipsoid st: s = 0/1 at longitude 0, 0.5 at 180°.
vec3 ares_sphere(vec2 st) {
  float lon = st.s * 6.2831853;
  float lat = (st.t - 0.5) * 3.1415926;
  return vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
}
`;

/** Light direction toward the Sun (world origin), in eye coordinates. */
const SUN_LIGHT = /* glsl */ `
vec3 ares_sunDirEC(czm_materialInput mi) {
  vec3 sunEC = (czm_view * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  return normalize(sunEC + mi.positionToEyeEC);
}
`;

export const SUN_SOURCE = NOISE + /* glsl */ `
czm_material czm_getMaterial(czm_materialInput mi) {
  czm_material m = czm_getDefaultMaterial(mi);
  vec3 n = normalize(mi.normalEC);
  vec3 v = normalize(mi.positionToEyeEC);
  float mu = clamp(dot(n, v), 0.0, 1.0);
  vec3 p = ares_sphere(mi.st);
  float granules = ares_fbm(p * 34.0 + vec3(0.0, 0.0, time * 0.06));
  float cells = ares_fbm(p * 5.0 - vec3(time * 0.012));
  // quadratic limb darkening (visible band)
  float limb = 1.0 - 0.62 * (1.0 - mu) - 0.18 * (1.0 - mu) * (1.0 - mu);
  vec3 hot = vec3(1.0, 0.94, 0.8);
  vec3 warm = vec3(1.0, 0.56, 0.22);
  vec3 col = mix(warm, hot, limb) * (0.8 + 0.38 * granules) * (0.9 + 0.2 * cells);
  m.diffuse = vec3(0.0);
  m.emission = col * (0.5 + 0.8 * limb);
  m.alpha = 1.0;
  return m;
}
`;

export const EARTH_SOURCE = SUN_LIGHT + /* glsl */ `
czm_material czm_getMaterial(czm_materialInput mi) {
  czm_material m = czm_getDefaultMaterial(mi);
  vec3 n = normalize(mi.normalEC);
  vec3 v = normalize(mi.positionToEyeEC);
  vec3 l = ares_sunDirEC(mi);
  float ndl = dot(n, l);
  vec3 day = pow(texture(image, mi.st).rgb, vec3(1.12));
  float lit = smoothstep(-0.12, 0.22, ndl);
  float ocean = smoothstep(0.02, 0.12, day.b - max(day.r, day.g));
  float spec = pow(max(dot(n, normalize(l + v)), 0.0), 64.0) * ocean * lit;
  vec3 col = day * (0.03 + 1.25 * max(ndl, 0.0)) * lit + day * 0.012;
  col += vec3(1.0, 0.95, 0.85) * spec * 0.55;
  float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.6);
  col += vec3(0.32, 0.58, 1.0) * rim * smoothstep(-0.35, 0.5, ndl) * 1.15;
  m.diffuse = vec3(0.0);
  m.emission = col;
  m.alpha = 1.0;
  return m;
}
`;

export const MARS_SOURCE = NOISE + SUN_LIGHT + /* glsl */ `
czm_material czm_getMaterial(czm_materialInput mi) {
  czm_material m = czm_getDefaultMaterial(mi);
  vec3 n = normalize(mi.normalEC);
  vec3 v = normalize(mi.positionToEyeEC);
  vec3 l = ares_sunDirEC(mi);
  float ndl = dot(n, l);
  vec3 p = ares_sphere(mi.st);
  float lat = (mi.st.t - 0.5) * 3.1415926;
  float albedo = ares_fbm(p * 3.0 + 11.7);
  float detail = ares_fbm(p * 16.0 + 3.1);
  float maria = smoothstep(0.5, 0.66, ares_fbm(p * 2.2 + 5.0));
  vec3 rust = vec3(0.78, 0.4, 0.21);
  vec3 dark = vec3(0.33, 0.19, 0.12);
  vec3 bright = vec3(0.93, 0.66, 0.44);
  vec3 base = mix(mix(rust, bright, smoothstep(0.35, 0.72, albedo)), dark, maria * 0.75);
  base *= 0.82 + 0.3 * detail;
  float cap = smoothstep(1.2, 1.28, abs(lat) + 0.06 * detail);
  base = mix(base, vec3(0.95, 0.94, 0.92), cap);
  float lit = smoothstep(-0.08, 0.2, ndl);
  vec3 col = base * (0.02 + 1.2 * max(ndl, 0.0)) * lit + base * 0.01;
  float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  col += vec3(0.95, 0.6, 0.4) * rim * smoothstep(-0.3, 0.5, ndl) * 0.35;
  m.diffuse = vec3(0.0);
  m.emission = col;
  m.alpha = 1.0;
  return m;
}
`;

/** Spacecraft path. Past: phase-coloured core + halo with a hot head; future:
 *  a sparse ghost dash of the planned route. */
export const TRAIL_SOURCE = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput mi) {
  czm_material m = czm_getDefaultMaterial(mi);
  float s = mi.st.s;
  float across = abs(mi.st.t - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.1, 0.42, across);
  float halo = pow(max(1.0 - across, 0.0), 3.0);
  vec3 phase = s < decayS ? nominalColor.rgb : (s < lockS ? warnColor.rgb : critColor.rgb);
  float past = 1.0 - step(progress, s);
  float behind = progress - s;
  float head = past * exp(-behind * behind * 5.0e4);
  float dash = step(0.5, fract(s * 240.0));
  float future = (1.0 - past) * dash * core * ghostColor.a;
  vec3 col = mix(ghostColor.rgb, phase, past);
  float alpha = past * (core * 0.9 + halo * 0.22) + head * (core + halo) * 0.9 + future;
  m.diffuse = vec3(0.0);
  m.emission = col * (1.0 + head * 1.4);
  m.alpha = clamp(alpha, 0.0, 1.0);
  return m;
}
`;

/** Full orbit ring that brightens into a comet tail behind the planet. */
export const ORBIT_SOURCE = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput mi) {
  czm_material m = czm_getDefaultMaterial(mi);
  float d = fract(head - mi.st.s + 1.0);
  float across = abs(mi.st.t - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.25, 0.95, across);
  float trail = pow(1.0 - clamp(d / tail, 0.0, 1.0), 2.4);
  m.diffuse = vec3(0.0);
  m.emission = color.rgb;
  m.alpha = core * color.a * (base + (1.0 - base) * trail);
  return m;
}
`;

/** Ion exhaust: s = 0 at the nozzle, 1 at the tip. */
export const PLUME_SOURCE = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput mi) {
  czm_material m = czm_getDefaultMaterial(mi);
  float s = mi.st.s;
  float across = abs(mi.st.t - 0.5) * 2.0;
  float body = pow(1.0 - s, 1.6);
  float flicker = 0.86 + 0.14 * sin(time * 31.0 + s * 18.0);
  float core = 1.0 - smoothstep(0.0, 0.8 * (1.0 - s * 0.55), across);
  m.diffuse = vec3(0.0);
  m.emission = mix(color.rgb, vec3(1.0), (1.0 - s) * core * 0.55);
  m.alpha = clamp(body * core * strength * flicker, 0.0, 1.0);
  return m;
}
`;
