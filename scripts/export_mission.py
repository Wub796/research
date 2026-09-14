"""
export_mission.py — builds the flight data for the ARES-1 site.

Outputs
  public/mission.json          the console's dataset (spacecraft, planets, telemetry)
  src/lib/orrery.generated.ts  precomputed geometry for the landing orrery (no fetch)

Frame & time
  Heliocentric, mean ecliptic and equinox of J2000: astropy's ICRS barycentric
  states have the Sun's barycentric offset removed (up to ~1.5M km, two solar
  radii) and are rotated about +X by the J2000 obliquity (84381.448"). The
  previous export drew barycentric *equatorial* coordinates, so every orbit sat
  tilted 23.4 degrees out of the ecliptic around a Sun placed at the barycentre.
  Time is hours after 2027-02-19T00:00:00 UTC — the SpacecraftEnv launch epoch.

Sampling
  Spacecraft every 2 h with central-difference velocities, planets every 24 h
  with ephemeris velocities: the site interpolates both with cubic Hermite
  splines, which reproduces the planets to well under a kilometre.

Run with an astropy-enabled interpreter (e.g. the research repo's venv):
    /path/to/research/.venv/bin/python scripts/export_mission.py
"""
import json
import os

import numpy as np
import pandas as pd
import astropy.units as u
from astropy.coordinates import get_body_barycentric_posvel
from astropy.time import Time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "artifacts", "optimal_mars_trajectory.csv")
OUT_JSON = os.path.join(ROOT, "public", "mission.json")
OUT_TS = os.path.join(ROOT, "src", "lib", "orrery.generated.ts")

EPOCH = Time("2027-02-19T00:00:00", scale="utc")
AU_KM = 149_597_870.7
C_KMS = 299_792.458
G0 = 9.80665
MU_SUN = 1.32712440018e11  # km^3 / s^2

MISSION_H = 11_040
SC_STEP_H = 2
PLANET_STEP_H = 24
MARS_YEAR_D = 686.980
EARTH_YEAR_D = 365.256

ISP_NOMINAL = 1782.0
ISP_LOCKED = 1514.7
DRY_MASS = 1648.0
T_MAX = 0.289

EPS = np.deg2rad(84381.448 / 3600.0)
ICRS_TO_ECLIPTIC = np.array([
    [1.0, 0.0, 0.0],
    [0.0, np.cos(EPS), np.sin(EPS)],
    [0.0, -np.sin(EPS), np.cos(EPS)],
])


def barycentric(body, hours):
    pos, vel = get_body_barycentric_posvel(body, EPOCH + np.asarray(hours) * u.hour)
    return pos.xyz.to(u.km).value.T, vel.xyz.to(u.km / u.s).value.T


def to_ecliptic(vectors):
    return vectors @ ICRS_TO_ECLIPTIC.T


def isp_at(hour):
    """Logarithmic decay from hour 1,000 to the 1,514.7 s lock at hour 1,500
    (the degradation model the CSV's mass flow was generated with)."""
    if hour < 1000:
        return ISP_NOMINAL
    if hour < 1500:
        beta = (ISP_NOMINAL - ISP_LOCKED) / np.log(501)
        return ISP_NOMINAL - beta * np.log(hour - 1000 + 1)
    return ISP_LOCKED


def flat(array, decimals):
    out = np.round(np.asarray(array, dtype=float).ravel(), decimals)
    if decimals == 0:
        return [int(v) for v in out]
    return [float(v) for v in out]


def main():
    df = pd.read_csv(CSV_PATH)
    hours_all = df["time_step_hr"].to_numpy(dtype=int)
    assert hours_all[0] == 0 and hours_all[-1] == MISSION_H, "CSV must span 0…11,040 h"

    # ---- spacecraft: barycentric ICRS → heliocentric ecliptic ----------------
    sun_p, sun_v = barycentric("sun", hours_all)
    sc_bary = df[["sc_x_km", "sc_y_km", "sc_z_km"]].to_numpy()
    sc = to_ecliptic(sc_bary - sun_p)
    sc_vel = np.gradient(sc, 3600.0, axis=0)  # central differences, km/s

    thrust = df["thrust_cmd_N"].to_numpy()
    theta = df["thrust_theta_rad"].to_numpy()
    phi = df["thrust_phi_rad"].to_numpy()
    thrust_dir = to_ecliptic(np.stack([
        np.sin(phi) * np.cos(theta), np.sin(phi) * np.sin(theta), np.cos(phi),
    ], axis=1))
    mass = df["mass_kg"].to_numpy()
    isp = np.array([isp_at(h) for h in hours_all])

    # Δv actually delivered by the engine (∫ T/m dt), hour by hour.
    dv_kms = np.concatenate([[0.0], np.cumsum(thrust[:-1] / mass[:-1] * 3600.0 / 1000.0)])

    idx = np.arange(0, MISSION_H + 1, SC_STEP_H)

    # ---- planets: daily states over a full Martian year ----------------------
    p_hours = np.arange(0, int(np.ceil(MARS_YEAR_D)) * 24 + PLANET_STEP_H, PLANET_STEP_H)
    sun_pp, sun_pv = barycentric("sun", p_hours)
    earth_p, earth_v = barycentric("earth", p_hours)
    mars_p, mars_v = barycentric("mars", p_hours)
    earth_p, earth_v = to_ecliptic(earth_p - sun_pp), to_ecliptic(earth_v - sun_pv)
    mars_p, mars_v = to_ecliptic(mars_p - sun_pp), to_ecliptic(mars_v - sun_pv)

    # ---- summary numbers the site quotes -------------------------------------
    e_h, m_h = barycentric("earth", hours_all), barycentric("mars", hours_all)
    earth_h = to_ecliptic(e_h[0] - sun_p)
    mars_h = to_ecliptic(m_h[0] - sun_p)
    mars_vel_h = to_ecliptic(m_h[1] - sun_v)
    r_sun = np.linalg.norm(sc, axis=1)
    speed = np.linalg.norm(sc_vel, axis=1)
    range_earth = np.linalg.norm(sc - earth_h, axis=1)
    path_km = float(np.sum(np.linalg.norm(np.diff(sc, axis=0), axis=1)))
    summary = {
        "launchUtc": EPOCH.utc.isot + "Z",
        "arrivalUtc": (EPOCH + MISSION_H * u.hour).utc.isot + "Z",
        "earthMarsAtLaunchKm": round(float(np.linalg.norm(mars_h[0] - earth_h[0])), 0),
        "earthMarsAtArrivalKm": round(float(np.linalg.norm(mars_h[-1] - earth_h[-1])), 0),
        "pathLengthKm": round(path_km, 0),
        "maxRangeEarthKm": round(float(range_earth.max()), 0),
        "maxLightTimeS": round(float(range_earth.max() / C_KMS), 1),
        "sunDistanceMinKm": round(float(r_sun.min()), 0),
        "sunDistanceMaxKm": round(float(r_sun.max()), 0),
        "speedMinKms": round(float(speed.min()), 3),
        "speedMaxKms": round(float(speed.max()), 3),
        "propellantUsedKg": round(float(mass[0] - mass[-1]), 2),
        "deltaVKms": round(float(dv_kms[-1]), 3),
        "arrivalMarsRelSpeedKms": round(float(np.linalg.norm(sc_vel[-1] - mars_vel_h[-1])), 3),
        "burnHours": int(np.sum(thrust > 0.005)),
    }

    mission = {
        "meta": {
            "name": "ARES-1",
            "frame": "heliocentric mean ecliptic J2000",
            "units": {"position": "km", "velocity": "km/s", "time": "h after epoch"},
            "epochUtc": summary["launchUtc"],
            "missionHours": MISSION_H,
            "source": os.path.relpath(CSV_PATH, ROOT),
            "ephemeris": "astropy builtin (ERFA)",
            "constants": {
                "auKm": AU_KM, "cKms": C_KMS, "g0": G0, "muSun": MU_SUN,
                "ispNominal": ISP_NOMINAL, "ispLocked": ISP_LOCKED,
                "dryMassKg": DRY_MASS, "wetMassKg": float(mass[0]), "thrustMaxN": T_MAX,
                "radiiKm": {"sun": 695_700.0, "earth": 6_371.0, "mars": 3_389.5},
            },
            "summary": summary,
        },
        "events": [
            {"h": 0, "key": "launch", "label": "Earth departure", "detail": "PPO policy engaged at 1,782 s Isp"},
            {"h": 1000, "key": "decay", "label": "Isp decay onset", "detail": "logarithmic specific-impulse slide begins"},
            {"h": 1497, "key": "flag", "label": "Isolation Forest flag", "detail": "anomalous engine signature detected"},
            {"h": 1500, "key": "lock", "label": "Failure lock", "detail": "Isp locked at 1,514.7 s for the rest of the cruise"},
            {"h": MISSION_H, "key": "arrival", "label": "Mars arrival", "detail": "spacecraft reaches Mars' position"},
        ],
        "sc": {
            "stepH": SC_STEP_H,
            "pos": flat(sc[idx], 0),
            "vel": flat(sc_vel[idx], 5),
            "thrust": flat(thrust[idx], 5),
            "dir": flat(thrust_dir[idx], 4),
            "mass": flat(mass[idx], 3),
            "isp": flat(isp[idx], 2),
            "dv": flat(dv_kms[idx], 4),
        },
        "planets": {
            "stepH": PLANET_STEP_H,
            "earth": {"pos": flat(earth_p, 0), "vel": flat(earth_v, 6), "periodDays": EARTH_YEAR_D},
            "mars": {"pos": flat(mars_p, 0), "vel": flat(mars_v, 6), "periodDays": MARS_YEAR_D},
        },
    }

    with open(OUT_JSON, "w") as f:
        json.dump(mission, f, separators=(",", ":"))

    # ---- landing orrery geometry (ecliptic plane, AU) ------------------------
    o_idx = np.linspace(0, MISSION_H, 241).round().astype(int)
    au = lambda v: [[round(float(p[0]) / AU_KM, 4), round(float(p[1]) / AU_KM, 4)] for p in v]
    earth_orbit_idx = np.linspace(0, int(EARTH_YEAR_D), 181).round().astype(int)
    mars_orbit_idx = np.linspace(0, int(MARS_YEAR_D), 241).round().astype(int)
    orrery = {
        "hours": [int(h) for h in o_idx],
        "sc": au(sc[o_idx]),
        "earth": au(earth_h[o_idx]),
        "mars": au(mars_h[o_idx]),
        "earthOrbit": au(earth_p[earth_orbit_idx]),
        "marsOrbit": au(mars_p[mars_orbit_idx]),
        "events": [e["h"] for e in mission["events"]],
        # Isp over the degradation window (every hour, 800–1,700 h) for the
        # landing's scroll-drawn signal chart.
        "isp": [[int(h), round(isp_at(h), 2)] for h in range(800, 1701)],
        "summary": summary,
    }
    with open(OUT_TS, "w") as f:
        f.write("// Generated by scripts/export_mission.py — do not edit by hand.\n")
        f.write("// Heliocentric mean-ecliptic J2000 coordinates in AU (x, y).\n")
        f.write("export const orrery = ")
        f.write(json.dumps(orrery, separators=(",", ":")))
        f.write(" as const;\n")

    size_kb = os.path.getsize(OUT_JSON) / 1024
    print(f"mission.json  {size_kb:,.0f} KB  ({len(idx)} spacecraft samples, {len(p_hours)} planet samples)")
    print(f"orrery.generated.ts  {os.path.getsize(OUT_TS) / 1024:,.1f} KB")
    for k, v in summary.items():
        print(f"  {k:24s} {v}")


if __name__ == "__main__":
    main()
