import os
import sys
import numpy as np

# Patch numpy 2.x references
import numpy.core.multiarray as multiarray
import numpy.core.numeric as numeric
sys.modules['numpy._core'] = np
sys.modules['numpy._core.multiarray'] = multiarray
sys.modules['numpy._core.numeric'] = numeric

from stable_baselines3.common.save_util import load_from_zip_file
sys.path.append("/Users/bnjw/Documents/Personal_Project/research")
from src.env.spacecraft_env import SpacecraftEnv

def inspect_env():
    env = SpacecraftEnv()
    env.reset()
    
    print("Precomputed Mars Pos at step 0:", env.mars_pos_table[0])
    print("Precomputed Mars Vel at step 0:", env.mars_vel_table[0])
    
    print("Precomputed Mars Pos at step 11040:", env.mars_pos_table[11040])
    print("Precomputed Mars Vel at step 11040:", env.mars_vel_table[11040])
    
    # Calculate Earth's position at step 0 and 11040 from astropy
    from astropy.time import Time
    import astropy.units as u
    from astropy.coordinates import get_body_barycentric_posvel
    
    launch = Time('2027-02-19')
    times = launch + np.array([0, 11040]) * u.hour
    earth_pos, earth_vel = get_body_barycentric_posvel('earth', times)
    earth_pos_km = earth_pos.xyz.value.T * 149597870.7
    earth_vel_km = earth_vel.xyz.value.T * 1731.4568
    
    print("Earth Barycentric Pos (km) at step 0:", earth_pos_km[0])
    print("Earth Barycentric Vel (km/s) at step 0:", earth_vel_km[0])
    print("Earth Barycentric Pos (km) at step 11040:", earth_pos_km[1])
    print("Earth Barycentric Vel (km/s) at step 11040:", earth_vel_km[1])
    
    # Let's check initial spacecraft position and velocity relative to Earth barycentric
    sc_pos_init = env.state[0:3]
    sc_vel_init = env.vel
    
    print("SC Pos Init:", sc_pos_init)
    print("SC Vel Init:", sc_vel_init)
    
    print("SC Pos Init - Earth Barycentric Pos:", sc_pos_init - earth_pos_km[0])
    print("SC Vel Init - Earth Barycentric Vel:", sc_vel_init - earth_vel_km[0])

if __name__ == "__main__":
    inspect_env()
