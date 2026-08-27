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

def check_actions():
    eval_env = DummyVecEnv([lambda: SpacecraftEnv()])
    vec_path = "/Users/bnjw/Documents/Personal_Project/research/artifacts/vec_normalize_phase5_final.pkl"
    eval_env = VecNormalize.load(vec_path, eval_env)
    eval_env.training = False
    eval_env.norm_reward = False
    
    model = PPO.load("/Users/bnjw/Documents/Personal_Project/research/artifacts/ppo_spacecraft_phase5_final")
    
    obs = eval_env.reset()
    raw_env = eval_env.envs[0]
    
    print("Step 0:")
    print("  Obs (normalized by VecNormalize):", obs)
    print("  Raw env state:", raw_env.state)
    
    # Predict step 0
    action, _ = model.predict(obs, deterministic=True)
    print("  Action predicted (T, theta, phi):", action)
    
    # Run a few steps
    thrusts = []
    for step in range(100):
        action, _ = model.predict(obs, deterministic=True)
        thrusts.append(action[0][0])
        obs, reward, done, info = eval_env.step(action)
        
    print(f"First 100 steps: mean thrust = {np.mean(thrusts):.4f} N, max thrust = {np.max(thrusts):.4f} N, min thrust = {np.min(thrusts):.4f} N")

if __name__ == "__main__":
    check_actions()
