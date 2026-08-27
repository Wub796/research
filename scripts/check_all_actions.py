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

def check_all_actions():
    eval_env = DummyVecEnv([lambda: SpacecraftEnv()])
    vec_path = "/Users/bnjw/Documents/Personal_Project/research/artifacts/vec_normalize_phase5_final.pkl"
    eval_env = VecNormalize.load(vec_path, eval_env)
    eval_env.training = False
    eval_env.norm_reward = False
    
    model = PPO.load("/Users/bnjw/Documents/Personal_Project/research/artifacts/ppo_spacecraft_phase5_final")
    
    obs = eval_env.reset()
    raw_env = eval_env.envs[0]
    
    thrusts = []
    for step in range(11040):
        action, _ = model.predict(obs, deterministic=True)
        thrusts.append(action[0][0])
        obs, reward, done, info = eval_env.step(action)
        if done[0]:
            break
            
    print(f"Total steps simulated: {len(thrusts)}")
    print(f"Thrust stats: max = {np.max(thrusts):.6f} N, min = {np.min(thrusts):.6f} N, mean = {np.mean(thrusts):.6f} N")
    print(f"Number of steps with thrust > 0.001 N: {np.sum(np.array(thrusts) > 0.001)}")

if __name__ == "__main__":
    check_all_actions()
