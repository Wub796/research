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

def calculate_rewards():
    # 1. Zero thrust baseline
    env = SpacecraftEnv()
    obs, info = env.reset()
    total_rew_zero = 0
    zero_action = np.array([0.0, 0.0, 0.0], dtype=np.float32)
    for step in range(11040):
        obs, reward, done, truncated, info = env.step(zero_action)
        total_rew_zero += reward
        if done:
            break
    print(f"Zero thrust cumulative reward: {total_rew_zero:,.2f}")
    
    # 2. Trained agent
    eval_env = DummyVecEnv([lambda: SpacecraftEnv()])
    vec_path = "/Users/bnjw/Documents/Personal_Project/research/artifacts/vec_normalize_phase5_final.pkl"
    eval_env = VecNormalize.load(vec_path, eval_env)
    eval_env.training = False
    eval_env.norm_reward = False
    
    model = PPO.load("/Users/bnjw/Documents/Personal_Project/research/artifacts/ppo_spacecraft_phase5_final")
    
    obs = eval_env.reset()
    total_rew_agent = 0
    for step in range(11040):
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, done, info = eval_env.step(action)
        # Note: reward returned by VecNormalize is the un-normalized reward if norm_reward=False,
        # but let's confirm what the step returned.
        total_rew_agent += reward[0]
        if done[0]:
            break
    print(f"Trained agent cumulative reward: {total_rew_agent:,.2f}")

if __name__ == "__main__":
    calculate_rewards()
