"""
design_transfer.py — a physically consistent ARES-1 Earth→Mars transfer.

Why this exists
  artifacts/optimal_mars_trajectory.csv is a geometric blend between Earth's
  and Mars' ephemerides (see research/scripts/generate_transfer_trajectory.py).
  It needs ~25× the acceleration the thruster can produce, and replaying its
  thrust commands through real dynamics ends ~360M km from Mars. This script
  builds a trajectory that actually obeys the equations of motion.

Model
  • Heliocentric point-mass Sun (μ = 1.32712440018e11 km³/s²); planetary
    perturbations neglected (Jupiter's pull is < 0.4% of thrust acceleration).
  • SPT-140 engine from the study: T ≤ 0.289 N, Isp 1,782 s → logarithmic decay
    from hour 1,000 → locked at 1,514.7 s from hour 1,500; ṁ = T / (Isp·g0).
  • 2,747 kg wet, 1,648 kg dry. Launch at 2027-02-19T00:00Z from Earth's centre
    with a launch-vehicle hyperbolic excess velocity v∞ (patched conic).
  • Fixed time of flight, 11,040 h; the spacecraft must reach Mars' position
    (intercept — the same success test as the research environment).
    A rendezvous is not reachable on these dates: the ballistic arc arrives at
    9.1 km/s relative to Mars, about twice the engine's whole Δv budget.

Guidance parameterisation
  Smooth steering and throttle histories: in-plane and out-of-plane thrust
  angles in the local radial/transverse/normal frame and a tanh-mapped throttle,
  each a degree-7 Chebyshev series over the mission. The solver minimises
  |v∞ launch|² + |v rel Mars at arrival|² while hitting Mars, starting
  from the ballistic Lambert arc (SLSQP), then an exact-intercept polish.
  Every state is integrated with DOP853.

Outputs
  artifacts/ares1_transfer_solution.json   decision vector + summary
  artifacts/ares1_physical_transfer.csv    hourly states in the original CSV
                                           schema (barycentric ICRS km, km/s)

Run with an astropy + scipy interpreter (the research repo's venv has both):
    python scripts/design_transfer.py --optimize      # solve, then export
    python scripts/design_transfer.py                 # export saved solution
"""
import argparse
import json
import os
import time

import numpy as np
import pandas as pd
import astropy.units as u
from astropy.coordinates import get_body_barycentric_posvel
from astropy.time import Time
from numpy.polynomial import chebyshev as C
from scipy.integrate import solve_ivp
from scipy.optimize import least_squares, minimize

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOLUTION = os.path.join(ROOT, "artifacts", "ares1_transfer_solution.json")
CSV_OUT = os.path.join(ROOT, "artifacts", "ares1_physical_transfer.csv")

MU = 1.32712440018e11
G0 = 9.80665
TOF_H = 11040
TOF = TOF_H * 3600.0
M0 = 2747.0
M_DRY = 1648.0
T_MAX = 0.289
ISP_NOM = 1782.0
ISP_LOCK = 1514.7
DEG = 8
EPOCH = Time("2027-02-19T00:00:00", scale="utc")
BREAKS = [0.0, 1000 * 3600.0, 1500 * 3600.0, TOF]  # Isp schedule kinks


def isp_at(hour):
    if hour < 1000:
        return ISP_NOM
    if hour < 1500:
        return ISP_NOM - (ISP_NOM - ISP_LOCK) / np.log(501) * np.log(hour - 1000 + 1)
    return ISP_LOCK


def barycentric(body, hours):
    t = EPOCH + np.atleast_1d(hours) * u.hour
    p, v = get_body_barycentric_posvel(body, t)
    return p.xyz.to(u.km).value.T, v.xyz.to(u.km / u.s).value.T


def heliocentric(body, hours):
    p, v = barycentric(body, hours)
    sp, sv = barycentric("sun", hours)
    return p - sp, v - sv


R_E0, V_E0 = [x[0] for x in heliocentric("earth", 0)]
R_MF, V_MF = [x[0] for x in heliocentric("mars", TOF_H)]


def unpack(z):
    return z[:3], z[3:3 + DEG], z[3 + DEG:3 + 2 * DEG], z[3 + 2 * DEG:3 + 3 * DEG]


def controls(t, r, v, a, b, c):
    """Thrust unit vector and throttle at time t (s) for state r, v."""
    tau = 2 * t / TOF - 1
    alpha, beta = C.chebval(tau, a), C.chebval(tau, b)
    throttle = 0.5 * (1 + np.tanh(C.chebval(tau, c)))
    rhat = r / np.sqrt(r @ r)
    h = np.cross(r, v)
    nhat = h / np.sqrt(h @ h)
    that = np.cross(nhat, rhat)
    d = np.cos(beta) * (np.cos(alpha) * that + np.sin(alpha) * rhat) + np.sin(beta) * nhat
    return d, throttle


def make_rhs(z):
    _, a, b, c = unpack(z)

    def rhs(t, y):
        r, v, m = y[:3], y[3:6], y[6]
        rn = np.sqrt(r @ r)
        d, thr = controls(t, r, v, a, b, c)
        thrust = T_MAX * thr
        acc = -MU * r / rn**3 + d * (thrust / m / 1000.0)
        return np.concatenate((v, acc, [-thrust / (isp_at(t / 3600.0) * G0)]))

    return rhs


def propagate(z, rtol=1e-10, dense=False, method="DOP853"):
    vinf = unpack(z)[0]
    rhs = make_rhs(z)
    y = np.concatenate((R_E0, V_E0 + vinf, [M0]))
    sols = []
    for t0, t1 in zip(BREAKS[:-1], BREAKS[1:]):
        sol = solve_ivp(rhs, (t0, t1), y, method=method, rtol=rtol,
                        atol=[1e-3] * 3 + [1e-9] * 3 + [1e-7], dense_output=dense)
        sols.append(sol)
        y = sol.y[:, -1]
    return y, sols


def lambert_vinf():
    """Ballistic long-way Lambert arc Earth(t0) → Mars(tf); returns launch v∞."""
    def stumpff(psi):
        if psi > 1e-8:
            s = np.sqrt(psi)
            return (1 - np.cos(s)) / psi, (s - np.sin(s)) / s**3
        if psi < -1e-8:
            s = np.sqrt(-psi)
            return (1 - np.cosh(s)) / psi, (np.sinh(s) - s) / s**3
        return 0.5, 1 / 6

    n1, n2 = np.linalg.norm(R_E0), np.linalg.norm(R_MF)
    cosd = R_E0 @ R_MF / (n1 * n2)
    A = -np.sqrt(n1 * n2 * (1 + cosd))
    lo, hi, psi = -4 * np.pi**2, 4 * np.pi**2, 0.0
    for _ in range(500):
        c2, c3 = stumpff(psi)
        y = n1 + n2 + A * (psi * c3 - 1) / np.sqrt(c2)
        chi = np.sqrt(y / c2)
        dt = (chi**3 * c3 + A * np.sqrt(y)) / np.sqrt(MU)
        if abs(dt - TOF) < 1e-3:
            break
        lo, hi = (psi, hi) if dt <= TOF else (lo, psi)
        psi = (lo + hi) / 2
    f = 1 - y / n1
    g = A * np.sqrt(y / MU)
    return (R_MF - f * R_E0) / g - V_E0


def optimize():
    """SLSQP from the ballistic Lambert arc with the engine nearly off (a
    feasible start): minimise |v∞ launch|² + |v rel Mars|² subject to hitting
    Mars, then polish() closes the intercept exactly. SLSQP wanders through
    infeasible iterates on this problem; 160 iterations reach the low-speed
    basin (≈4.26 km/s launch, ≈3.6 km/s arrival) and the polish pins it.
    The committed artifacts/ares1_transfer_solution.json is the reference
    result; re-solving may settle on a nearby local optimum."""
    t_start = time.time()
    z = np.zeros(3 + 3 * DEG)
    z[:3] = lambert_vinf()
    z[3 + 2 * DEG] = -4.0  # throttle ≈ 3e-4: the ballistic arc is feasible
    fix = least_squares(lambda v3: (propagate(np.r_[v3, z[3:]])[0][:3] - R_MF) / 1e5, z[:3], diff_step=1e-7)
    z[:3] = fix.x

    def objective(zz):
        y = propagate(zz)[0]
        return zz[:3] @ zz[:3] + (y[3:6] - V_MF) @ (y[3:6] - V_MF)

    cons = [{"type": "eq", "fun": lambda zz: (propagate(zz)[0][:3] - R_MF) / 1e5}]
    res = minimize(objective, z, method="SLSQP", constraints=cons,
                   options={"maxiter": 160, "ftol": 1e-10, "eps": 1e-6})
    y = propagate(res.x)[0]
    print(f"SLSQP ({res.nit} it): miss {np.linalg.norm(y[:3] - R_MF):,.0f} km  launch v∞ {np.linalg.norm(res.x[:3]):.3f}  "
          f"arrival rel {np.linalg.norm(y[3:6] - V_MF):.3f} km/s  ({time.time() - t_start:.0f}s)", flush=True)
    return polish(res.x)


def polish(z_opt):
    """Close the intercept exactly with the smallest change to the optimum:
    terminal miss (per 1,000 km) plus a light pull back toward z_opt."""
    fun = lambda zz: np.concatenate(((propagate(zz, rtol=1e-12)[0][:3] - R_MF) / 1e3, 1e-2 * (zz - z_opt)))
    z = least_squares(fun, z_opt, diff_step=1e-8, xtol=1e-12, ftol=1e-12).x
    print(f"polish: miss {np.linalg.norm(propagate(z, rtol=1e-12)[0][:3] - R_MF):.1f} km")
    return z


def export(z):
    hours = np.arange(TOF_H + 1, dtype=float)
    _, sols = propagate(z, rtol=1e-12, dense=True)
    _, a, b, c = unpack(z)
    states = np.zeros((len(hours), 7))
    for i, h in enumerate(hours):
        t = h * 3600.0
        k = 0 if h < 1000 else 1 if h < 1500 else 2
        states[i] = sols[k].sol(t)
    r, v, m = states[:, :3], states[:, 3:6], states[:, 6]

    thrust = np.zeros(len(hours))
    dirs = np.zeros((len(hours), 3))
    for i, h in enumerate(hours):
        d, thr = controls(h * 3600.0, r[i], v[i], a, b, c)
        dirs[i], thrust[i] = d, T_MAX * thr

    mars_r, mars_v = heliocentric("mars", hours)
    sun_p, sun_v = barycentric("sun", hours)
    df = pd.DataFrame({
        "time_step_hr": hours.astype(int),
        "sc_x_km": r[:, 0] + sun_p[:, 0], "sc_y_km": r[:, 1] + sun_p[:, 1], "sc_z_km": r[:, 2] + sun_p[:, 2],
        "sc_vx_km_s": v[:, 0] + sun_v[:, 0], "sc_vy_km_s": v[:, 1] + sun_v[:, 1], "sc_vz_km_s": v[:, 2] + sun_v[:, 2],
        "mars_dist_km": np.linalg.norm(mars_r - r, axis=1),
        "mass_kg": m,
        "thrust_cmd_N": thrust,
        "thrust_theta_rad": np.mod(np.arctan2(dirs[:, 1], dirs[:, 0]), 2 * np.pi),
        "thrust_phi_rad": np.arccos(np.clip(dirs[:, 2], -1, 1)),
        "anomaly_active": hours >= 1000,
    })
    df.to_csv(CSV_OUT, index=False)

    # ---- independent checks ------------------------------------------------
    y_radau = propagate(z, rtol=1e-11, method="Radau")[0]
    acc_fd = (v[2:] - v[:-2]) / (2 * 3600.0)
    rn = np.linalg.norm(r[1:-1], axis=1)[:, None]
    grav = -MU * r[1:-1] / rn**3
    model = grav + dirs[1:-1] * (thrust[1:-1] / m[1:-1] / 1000.0)[:, None]
    resid = np.linalg.norm(acc_fd - model, axis=1) * 1e3  # m/s²
    thrust_acc = np.linalg.norm(acc_fd - grav, axis=1) * 1e3
    bound = T_MAX / m[1:-1]
    dv = np.sum(thrust[:-1] / m[:-1] * 3600.0) / 1000.0
    checks = {
        "launch_vinf_kms": float(np.linalg.norm(z[:3])),
        "launch_c3_km2s2": float(z[:3] @ z[:3]),
        "arrival_miss_km": float(np.linalg.norm(r[-1] - R_MF)),
        "arrival_rel_speed_kms": float(np.linalg.norm(v[-1] - V_MF)),
        "radau_vs_dop853_terminal_km": float(np.linalg.norm(y_radau[:3] - r[-1])),
        "max_accel_residual_m_s2": float(resid.max()),
        "max_thrust_accel_over_bound": float((thrust_acc / bound).max()),
        "propellant_used_kg": float(M0 - m[-1]),
        "final_mass_kg": float(m[-1]),
        "engine_dv_kms": float(dv),
        "mean_throttle": float(thrust.mean() / T_MAX),
        "sun_distance_au": [float(np.linalg.norm(r, axis=1).min() / 1.495978707e8), float(np.linalg.norm(r, axis=1).max() / 1.495978707e8)],
    }
    assert m[-1] > M_DRY, "propellant exhausted"
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--optimize", action="store_true", help="re-solve instead of loading the saved solution")
    parser.add_argument("--solution", default=SOLUTION)
    parser.add_argument("--polish", action="store_true", help="re-close the intercept on a loaded solution")
    args = parser.parse_args()

    if args.optimize or not os.path.exists(args.solution):
        z = optimize()
    else:
        z = np.array(json.load(open(args.solution))["z"])
        if args.polish:
            z = polish(z)
    checks = export(z)
    json.dump({"model": "heliocentric two-body + continuous thrust, DOP853", "deg": DEG, "z": z.tolist(), "checks": checks},
              open(SOLUTION, "w"), indent=1)
    print(f"wrote {os.path.relpath(CSV_OUT, ROOT)}")
    for k, val in checks.items():
        print(f"  {k:32s} {val}")


if __name__ == "__main__":
    main()
