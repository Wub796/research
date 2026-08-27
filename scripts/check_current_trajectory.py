import os
import sys
import numpy as np

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

def analyze_current_trajectory():
    model_path = "/Users/bnjw/Documents/Personal_Project/research/artifacts/ppo_spacecraft_phase5_final"
    vec_path = "/Users/bnjw/Documents/Personal_Project/research/artifacts/vec_normalize_phase5_final.pkl"
    
    if not os.path.exists(model_path + ".zip"):
        print("Model file not found. Let's load the best model checkpoint from logs.")
        model_path = "/Users/bnjw/Documents/Personal_Project/research/logs/best_model/best_model"
        
    eval_env = DummyVecEnv([lambda: SpacecraftEnv()])
    eval_env = VecNormalize.load(vec_path, eval_env)
    eval_env.training = False
    eval_env.norm_reward = False
    
    model = PPO.load(model_path)
    
    obs = eval_env.reset()
    raw_env = eval_env.envs[0]
    
    dists = []
    thrusts = []
    
    for step in range(11040):
        action, _ = model.predict(obs, deterministic=True)
        thrusts.append(action[0][0])
        dists.append(np.linalg.norm(raw_env.state[3:6]))
        obs, reward, done, info = eval_env.step(action)
        if done[0]:
            break
            
    dists = np.array(dists)
    thrusts = np.array(thrusts)
    
    print("--- Current Telemetry Analysis ---")
    print(f"Initial distance to Mars: {dists[0]:,.2f} km")
    print(f"Minimum distance to Mars: {np.min(dists):,.2f} km at step {np.argmin(dists)}")
    print(f"Final distance to Mars:   {dists[-1]:,.2f} km")
    print(f"Thrust stats: max = {np.max(thrusts):.4f} N, mean = {np.mean(thrusts):.4f} N, zero-thrust steps = {np.sum(thrusts < 0.005)}")

if __name__ == "__main__":
    analyze_current_trajectory()
