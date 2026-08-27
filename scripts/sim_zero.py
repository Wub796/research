import os
import sys
import numpy as np

# Patch numpy 2.x references
import numpy.core.multiarray as multiarray
import numpy.core.numeric as numeric
sys.modules['numpy._core'] = np
sys.modules['numpy._core.multiarray'] = multiarray
sys.modules['numpy._core.numeric'] = numeric

sys.path.append("/Users/bnjw/Documents/Personal_Project/research")
from src.env.spacecraft_env import SpacecraftEnv

def simulate_zero_thrust():
    env = SpacecraftEnv()
    env.reset()
    
    sc_pos = []
    mars_pos = []
    
    # Run with 0 thrust action
    zero_action = np.array([0.0, 0.0, 0.0], dtype=np.float32)
    
    for step in range(11040):
        sc_pos.append(env.state[0:3].copy())
        mars_pos.append(env.mars_pos_table[step].copy())
        
        # Step with 0 thrust
        env.step(zero_action)
        
    sc_pos = np.array(sc_pos)
    mars_pos = np.array(mars_pos)
    
    # Calculate radius from Sun
    sc_r = np.linalg.norm(sc_pos, axis=1)
    mars_r = np.linalg.norm(mars_pos, axis=1)
    
    print("--- Zero Thrust Simulation ---")
    print(f"Spacecraft initial radius: {sc_r[0]/1e6:.2f} M km")
    print(f"Spacecraft final radius: {sc_r[-1]/1e6:.2f} M km")
    print(f"Mars initial radius: {mars_r[0]/1e6:.2f} M km")
    print(f"Mars final radius: {mars_r[-1]/1e6:.2f} M km")
    
    # Check if spacecraft escapes or falls into the Sun
    print(f"Spacecraft min radius: {np.min(sc_r)/1e6:.2f} M km")
    print(f"Spacecraft max radius: {np.max(sc_r)/1e6:.2f} M km")

if __name__ == "__main__":
    simulate_zero_thrust()
