"""
visualize.py — Generates publication-grade, academic plots for the Mars trajectory.
Plots are saved as high-resolution PNG and vector PDF files in the artifacts directory.

Run from the project root:
    python scripts/visualize.py
"""
import os
import sys
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from astropy.time import Time
import astropy.units as u
from astropy.coordinates import get_body_barycentric_posvel

# ---------------------------------------------------------------------------
# Path Configuration
# ---------------------------------------------------------------------------
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ARTIFACTS_DIR = os.path.join(_PROJECT_ROOT, "artifacts")
_CSV_PATH = os.path.join(_ARTIFACTS_DIR, "optimal_mars_trajectory.csv")

# ---------------------------------------------------------------------------
# Academic Styling Setup
# ---------------------------------------------------------------------------
def setup_academic_style():
    """Configures matplotlib/seaborn parameters for IEEE paper submission."""
    sns.set_theme(style="whitegrid", context="paper")
    plt.rcParams.update({
        "font.family": "serif",
        "font.size": 10,
        "axes.labelsize": 11,
        "axes.titlesize": 12,
        "xtick.labelsize": 9,
        "ytick.labelsize": 9,
        "legend.fontsize": 9,
        "figure.titlesize": 13,
        "text.usetex": False,  # Fallback to standard matplotlib math styling
        "mathtext.fontset": "dejavuserif",
        "figure.dpi": 300,
    })

# ---------------------------------------------------------------------------
# Data Reconstructors
# ---------------------------------------------------------------------------
def precompute_mars_ephemeris(num_steps=11041):
    """
    Computes the heliocentric coordinates of Mars using Astropy.
    """
    launch = Time('2027-02-19')
    times = launch + np.arange(num_steps) * u.hour
    mars_pos_bary, _ = get_body_barycentric_posvel('mars', times)
    # Convert AU to km
    mars_pos = mars_pos_bary.xyz.value.T * 149597870.7
    return mars_pos

def reconstruct_isp_timeline(num_steps=11040):
    """
    Reconstructs the specific impulse (Isp) degradation curve over time.
    
    - Hours 0 to 1,000: Nominal baseline of 1,782 seconds.
    - Hours 1,000 to 1,500: Logarithmic degradation down to 1,514.7 seconds.
    - Hours 1,500 to end: Steady catastrophic degraded state at 1,514.7 seconds.
    """
    isp_array = np.zeros(num_steps)
    
    # 1. Nominal Phase
    isp_array[:1000] = 1782.0
    
    # 2. Logarithmic Degradation Phase (Hours 1,000 to 1,500)
    # Isp(t) = 1782 - beta * ln(t - 1000 + 1)
    # At t = 1500 (relative step 500), Isp = 1514.7
    beta = (1782.0 - 1514.7) / np.log(501)
    
    for t in range(1000, 1500):
        isp_array[t] = 1782.0 - beta * np.log(t - 1000 + 1)
        
    # 3. Degraded Phase (Hours 1,500 to End)
    isp_array[1500:] = 1514.7
    
    return isp_array

# ---------------------------------------------------------------------------
# Plotting Functions
# ---------------------------------------------------------------------------
def plot_3d_trajectory(df, mars_pos):
    """Generates the 3D Heliocentric Trajectory Transfer plot."""
    fig = plt.figure(figsize=(7, 7))
    ax = fig.add_subplot(111, projection='3d')
    
    # Convert coordinates from km to Astronomical Units (AU) for standard astrodynamics scale
    km_to_au = 1.0 / 149597870.7
    
    sc_x = df['sc_x_km'] * km_to_au
    sc_y = df['sc_y_km'] * km_to_au
    sc_z = df['sc_z_km'] * km_to_au
    
    mars_x = mars_pos[:len(df), 0] * km_to_au
    mars_y = mars_pos[:len(df), 1] * km_to_au
    mars_z = mars_pos[:len(df), 2] * km_to_au
    
    # Plot orbital trajectories
    ax.plot(sc_x, sc_y, sc_z, label='Spacecraft (PPO Agent)', color='#1f77b4', linewidth=2.0)
    ax.plot(mars_x, mars_y, mars_z, label='Mars Orbit Reference', color='#d62728', linestyle='--', linewidth=1.5)
    
    # Draw the Sun at the origin
    ax.scatter(0, 0, 0, color='#ff7f0e', s=200, label='Sun', edgecolors='black', zorder=5)
    
    # Mark departure (Earth launch epoch) and arrival (Mars capture epoch)
    ax.scatter(sc_x.iloc[0], sc_y.iloc[0], sc_z.iloc[0], color='#2ca02c', s=80, marker='^', label='Earth Departure (t=0)', zorder=5)
    ax.scatter(sc_x.iloc[-1], sc_y.iloc[-1], sc_z.iloc[-1], color='#9467bd', s=80, marker='o', label='Mars Capture (t=final)', zorder=5)
    
    # Set labels and limits
    ax.set_xlabel('Heliocentric X (AU)', labelpad=10)
    ax.set_ylabel('Heliocentric Y (AU)', labelpad=10)
    ax.set_zlabel('Heliocentric Z (AU)', labelpad=10)
    ax.set_title('3D Heliocentric Earth-Mars Transfer Trajectory', fontsize=12, pad=15)
    
    # Visual grid and equal aspect ratio configuration
    ax.grid(True, linestyle=':', alpha=0.6)
    ax.set_box_aspect([1, 1, 1])
    
    # Set limits to fit orbits nicely
    max_val = 1.8
    ax.set_xlim(-max_val, max_val)
    ax.set_ylim(-max_val, max_val)
    ax.set_zlim(-0.2, 0.2)
    
    ax.legend(loc='upper right', frameon=True, facecolor='white', edgecolor='none', shadow=True)
    
    # Save files
    png_path = os.path.join(_ARTIFACTS_DIR, "3d_heliocentric_trajectory.png")
    pdf_path = os.path.join(_ARTIFACTS_DIR, "3d_heliocentric_trajectory.pdf")
    plt.savefig(png_path, dpi=300, bbox_inches='tight')
    plt.savefig(pdf_path, bbox_inches='tight')
    plt.close()
    print(f"Saved 3D Trajectory plots to: {png_path} and {pdf_path}")

def plot_isp_degradation(df, isp_timeline):
    """Generates the Specific Impulse (Isp) Degradation & Anomaly Detection plot."""
    fig, ax = plt.subplots(figsize=(7, 4.5))
    
    hours = df['time_step_hr']
    
    # Plot Isp over time
    ax.plot(hours, isp_timeline, color='#1f77b4', linewidth=2.0, label='Specific Impulse ($I_{sp}$)')
    
    # Plot nominal baseline reference
    ax.axhline(1782, color='#2ca02c', linestyle=':', linewidth=1.5, label=r'Nominal Baseline ($1,782\text{ s}$)')
    
    # Shade degradation zone (Hours 1000 to 1500)
    ax.axvspan(1000, 1500, color='#ffe6e6', alpha=0.5, label='Degradation Phase')
    
    # Highlight Critical Detection Point at Hour 1,497
    isp_1497 = isp_timeline[1497]
    ax.scatter(1497, isp_1497, color='#d62728', s=60, edgecolor='black', zorder=5, 
               label="Isolation Forest Detection\n" + r"(Hour 1,497 | $I_{sp} \approx 1,515\text{ s}$)")
    
    # Highlight Catastrophic Failure Point at Hour 1,500
    ax.axvline(1500, color='#7f7f7f', linestyle='--', linewidth=1.5, 
               label="Catastrophic Failure Threshold\n" + r"(Hour 1,500 | $I_{sp} = 1,514.7\text{ s}$)")
    
    # Annotate Logarithmic Decay
    ax.annotate('Logarithmic Decay Begins', xy=(1000, 1782), xytext=(1800, 1700),
                arrowprops=dict(facecolor='black', arrowstyle='->', lw=1.0),
                fontsize=9, fontweight='semibold')
    
    # Labels and styling
    ax.set_xlabel('Mission Elapsed Time (Hours)')
    ax.set_ylabel('Specific Impulse, $I_{sp}$ (seconds)')
    ax.set_title('$I_{sp}$ Degradation Timeline & Anomaly Detection Boundary', fontsize=12)
    ax.set_xlim(0, 3000)  # Focus on the first 3,000 hours to make the degradation visible
    ax.set_ylim(1450, 1850)
    
    ax.legend(loc='upper right', frameon=True, facecolor='white', framealpha=0.95)
    ax.grid(True, which='both', linestyle=':', alpha=0.5)
    
    # Save files
    png_path = os.path.join(_ARTIFACTS_DIR, "isp_degradation_anomaly_detection.png")
    pdf_path = os.path.join(_ARTIFACTS_DIR, "isp_degradation_anomaly_detection.pdf")
    plt.savefig(png_path, dpi=300, bbox_inches='tight')
    plt.savefig(pdf_path, bbox_inches='tight')
    plt.close()
    print(f"Saved Isp Degradation plots to: {png_path} and {pdf_path}")

def plot_thrust_and_propellant(df):
    """Generates the Thrust Magnitude & Propellant Conservation plot (vertical subplots)."""
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(7.5, 6), sharex=True)
    
    hours = df['time_step_hr']
    T_max = 0.289 # N
    thrust_pct = (df['thrust_cmd_N'] / T_max) * 100.0
    
    # Extract mass components: dry mass is 1,648 kg. Propellant is sc_mass - 1648
    sc_mass = df['mass_kg']
    prop_mass = sc_mass - 1648.0
    
    # 1. Panel 1: Thrust Command Profile
    ax1.plot(hours, thrust_pct, color='#1f77b4', linewidth=1.2, label='Thrust Command ($T / T_{max}$)')
    ax1.set_ylabel('Thrust Magnitude (% of Max)')
    ax1.set_title('PPO Controller Burn Profile & Propellant Conservation', fontsize=12)
    ax1.set_ylim(-5, 105)
    ax1.grid(True, linestyle=':', alpha=0.5)
    
    # Shade active burn periods to demonstrate "pulsed burn" behavior vs coasting
    # Find contiguous blocks where thrust is active (> 1% capacity)
    active_burn = thrust_pct > 1.0
    diff = np.diff(active_burn.astype(int))
    starts = np.where(diff == 1)[0] + 1
    ends = np.where(diff == -1)[0] + 1
    
    # Handle edge cases for boundaries
    if active_burn.iloc[0]:
        starts = np.insert(starts, 0, 0)
    if active_burn.iloc[-1]:
        ends = np.append(ends, len(df) - 1)
        
    for s, e in zip(starts, ends):
        ax1.axvspan(hours.iloc[s], hours.iloc[e], color='#ffe699', alpha=0.4, zorder=0)
        ax2.axvspan(hours.iloc[s], hours.iloc[e], color='#ffe699', alpha=0.4, zorder=0)
    
    # Draw dummy shaded region for legend
    ax1.axvspan(np.nan, np.nan, color='#ffe699', alpha=0.4, label='Active Burn Phase')
    ax1.legend(loc='upper right', frameon=True, facecolor='white', framealpha=0.9)
    
    # 2. Panel 2: Propellant Consumption Curve
    ax2.plot(hours, prop_mass, color='#2ca02c', linewidth=2.0, label='Propellant Mass Remaining')
    ax2.set_ylabel('Propellant Mass (kg)')
    ax2.set_xlabel('Mission Elapsed Time (Hours)')
    ax2.set_ylim(prop_mass.min() - 50, prop_mass.max() + 50)
    ax2.grid(True, linestyle=':', alpha=0.5)
    
    # Add annotation about propellant conservation
    final_prop = prop_mass.iloc[-1]
    ax2.annotate(f'Propellant Conserved: {final_prop:.1f} kg remaining', 
                 xy=(hours.iloc[-1], final_prop), 
                 xytext=(hours.iloc[-1] - 4500, final_prop + 150),
                 arrowprops=dict(facecolor='black', arrowstyle='->', lw=1.0),
                 fontsize=9, fontweight='semibold')
    
    ax2.legend(loc='upper right', frameon=True, facecolor='white', framealpha=0.9)
    
    plt.tight_layout()
    
    # Save files
    png_path = os.path.join(_ARTIFACTS_DIR, "thrust_magnitude_propellant.png")
    pdf_path = os.path.join(_ARTIFACTS_DIR, "thrust_magnitude_propellant.pdf")
    plt.savefig(png_path, dpi=300, bbox_inches='tight')
    plt.savefig(pdf_path, bbox_inches='tight')
    plt.close()
    print(f"Saved Thrust and Propellant plots to: {png_path} and {pdf_path}")

# ---------------------------------------------------------------------------
# Main Execution
# ---------------------------------------------------------------------------
def main():
    print("Loading academic style setup...")
    setup_academic_style()
    
    print(f"Reading optimal trajectory CSV from: {_CSV_PATH}...")
    if not os.path.exists(_CSV_PATH):
        print(f"ERROR: Optimal trajectory CSV not found at '{_CSV_PATH}'.")
        sys.exit(1)
        
    df = pd.read_csv(_CSV_PATH)
    print(f"Successfully loaded {len(df)} rows of flight telemetry.")
    
    print("Precomputing Mars ephemeris coordinates...")
    try:
        # Reconstruct Mars positions
        mars_pos = precompute_mars_ephemeris(num_steps=len(df) + 1)
    except Exception as e:
        print(f"ERROR: Failed to precompute Mars positions using Astropy: {e}")
        sys.exit(1)
        
    print("Reconstructing specific impulse (Isp) degradation curve...")
    isp_timeline = reconstruct_isp_timeline(num_steps=len(df))
    
    print("Generating Academic Figures...")
    # Plot 1: 3D Trajectory
    plot_3d_trajectory(df, mars_pos)
    
    # Plot 2: Isp Degradation & Anomaly Detection
    plot_isp_degradation(df, isp_timeline)
    
    # Plot 3: Thrust and Propellant Profiles
    plot_thrust_and_propellant(df)
    
    print("\nVisualizations successfully compiled in the artifacts directory!")

if __name__ == "__main__":
    main()
