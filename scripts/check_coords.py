import os
import sys
import numpy as np
from astropy.time import Time
import astropy.units as u
from astropy.coordinates import get_body_barycentric_posvel

# Patch numpy 2.x references
import numpy.core.multiarray as multiarray
import numpy.core.numeric as numeric
sys.modules['numpy._core'] = np
sys.modules['numpy._core.multiarray'] = multiarray
sys.modules['numpy._core.numeric'] = numeric

from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize

sys.path.append("/Users/bnjw/Documents/Personal_Project/research")
from src.env.spacecraft_env import SpacecraftEnv

def inspect_coordinates():
    print("--- Epoch Coordinates ---")
    launch = Time('2027-02-19')
    times = launch + np.arange(2) * u.hour
    
    sun_pos, sun_vel = get_body_barycentric_posvel('sun', times)
    earth_pos, earth_vel = get_body_barycentric_posvel('earth', times)
    mars_pos, mars_vel = get_body_barycentric_posvel('mars', times)
    
    sun_pos_km = sun_pos.xyz.value.T[0] * 149597870.7
    earth_pos_km = earth_pos.xyz.value.T[0] * 149597870.7
    mars_pos_km = mars_pos.xyz.value.T[0] * 149597870.7
    
    earth_heliocentric = earth_pos_km - sun_pos_km
    mars_heliocentric = mars_pos_km - sun_pos_km
    
    print("Sun Barycentric Pos (km):", sun_pos_km)
    print("Earth Barycentric Pos (km):", earth_pos_km)
    print("Earth Heliocentric Pos (km):", earth_heliocentric)
    print("Mars Barycentric Pos (km):", mars_pos_km)
    print("Mars Heliocentric Pos (km):", mars_heliocentric)
    
    env = SpacecraftEnv()
    env.reset()
    print("Env Initial State (Heliocentric/Barycentric sc pos):", env.state[0:3])
    print("Env Initial Relative Pos to Mars (Mars - sc):", env.state[3:6])
    
    # Check if relative position is mars_pos_bary - sc_pos or mars_pos_helio - sc_pos
    print("mars_pos_bary - sc_pos:", mars_pos_km - env.state[0:3])
    print("mars_pos_helio - sc_pos:", mars_heliocentric - env.state[0:3])

def test_flat_best_model():
    print("\n--- Testing best_model.zip Flat File ---")
    import shutil
    src_zip = "/Users/bnjw/Documents/Personal_Project/research/logs/best_model.zip"
    dest_zip = "/Users/bnjw/Documents/Personal_Project/research/logs/best_model_flat.zip"
    shutil.copyfile(src_zip, dest_zip)
    
    eval_env = DummyVecEnv([lambda: SpacecraftEnv()])
    vec_path = "/Users/bnjw/Documents/Personal_Project/research/artifacts/vec_normalize_phase5_final.pkl"
    eval_env = VecNormalize.load(vec_path, eval_env)
    eval_env.training = False
    eval_env.norm_reward = False
    
    model = PPO.load("/Users/bnjw/Documents/Personal_Project/research/logs/best_model_flat")
    obs = eval_env.reset()
    raw_env = eval_env.envs[0]
    done = [False]
    step = 0
    while not done[0] and step < 11040:
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, done, info = eval_env.step(action)
        step += 1
    
    final_dist = np.linalg.norm(raw_env.state[3:6])
    print(f"Completed in {step} steps. Final distance: {final_dist:,.2f} km")

if __name__ == "__main__":
    inspect_coordinates()
    test_flat_best_model()
