"""
export_json.py — Processes optimal_mars_trajectory.csv, precomputes Earth and Mars
ephemerides using Astropy, and exports a downsampled JSON file to public/trajectory_data.json
for client-side 3D rendering.

Run from the project root:
    python scripts/export_json.py
"""
import os
import json
import numpy as np
import pandas as pd
from astropy.time import Time
import astropy.units as u
from astropy.coordinates import get_body_barycentric_posvel

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_CSV_PATH = os.path.join(_PROJECT_ROOT, "artifacts", "optimal_mars_trajectory.csv")
_OUT_JSON = os.path.join(_PROJECT_ROOT, "public", "trajectory_data.json")

def precompute_ephemeris(planet_name, num_steps=11041):
    launch = Time('2027-02-19')
    times = launch + np.arange(num_steps) * u.hour
    pos_bary, _ = get_body_barycentric_posvel(planet_name, times)
    pos = pos_bary.xyz.value.T * 149597870.7  # Convert AU to km
    return pos

def reconstruct_isp(step):
    if step < 1000:
        return 1782.0
    elif step < 1500:
        beta = (1782.0 - 1514.7) / np.log(501)
        return 1782.0 - beta * np.log(step - 1000 + 1)
    else:
        return 1514.7

def main():
    if not os.path.exists(_CSV_PATH):
        print(f"ERROR: Trajectory CSV not found at {_CSV_PATH}")
        return
        
    df = pd.read_csv(_CSV_PATH)
    num_rows = len(df)
    print(f"Loaded {num_rows} rows from CSV. Generating planet orbits...")
    
    # Precompute Earth and Mars orbits
    earth_pos = precompute_ephemeris('earth', num_rows + 1)
    mars_pos = precompute_ephemeris('mars', num_rows + 1)
    
    # We downsample the data (take every 10th step) to optimize loading and rendering performance
    downsample_factor = 10
    indices = np.arange(0, num_rows, downsample_factor)
    if indices[-1] != num_rows - 1:
        indices = np.append(indices, num_rows - 1)
        
    # Reconstruct data
    data = {
        "steps": [],
        "sc_pos": [],
        "mars_pos": [],
        "earth_pos": [],
        "thrust": [],
        "isp": [],
        "mass": [],
        "anomaly": []
    }
    
    for idx in indices:
        row = df.iloc[idx]
        step = int(row['time_step_hr'])
        
        data["steps"].append(step)
        data["sc_pos"].append([float(row['sc_x_km']), float(row['sc_y_km']), float(row['sc_z_km'])])
        data["mars_pos"].append([float(mars_pos[step, 0]), float(mars_pos[step, 1]), float(mars_pos[step, 2])])
        data["earth_pos"].append([float(earth_pos[step, 0]), float(earth_pos[step, 1]), float(earth_pos[step, 2])])
        data["thrust"].append(float(row['thrust_cmd_N']))
        data["isp"].append(float(reconstruct_isp(step)))
        data["mass"].append(float(row['mass_kg']))
        data["anomaly"].append(bool(row['anomaly_active'] or step >= 1497))  # active if Isp dropped or flagged
        
    os.makedirs(os.path.dirname(_OUT_JSON), exist_ok=True)
    with open(_OUT_JSON, 'w') as f:
        json.dump(data, f, indent=2)
        
    print(f"Successfully exported downsampled trajectory data to {_OUT_JSON}")
    print(f"Total downsampled points: {len(data['steps'])}")

if __name__ == "__main__":
    main()
