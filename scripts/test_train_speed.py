import time
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
from stable_baselines3.common.monitor import Monitor

sys.path.append("/Users/bnjw/Documents/Personal_Project/research")
from src.env.spacecraft_env import SpacecraftEnv

def test_train_speed():
    def make_env():
        return Monitor(SpacecraftEnv())
    
    train_env = DummyVecEnv([make_env])
    train_env = VecNormalize(
        train_env,
        norm_obs=True,
        norm_reward=True,
        clip_obs=10.0,
        clip_reward=10.0,
    )
    
    model = PPO(
        "MlpPolicy",
        train_env,
        n_steps=2760,
        batch_size=460,
        ent_coef=0.01,
        learning_rate=3e-4,
        clip_range=0.2,
        clip_range_vf=0.2,
        verbose=0,
    )
    
    print("Starting speed test...")
    start_time = time.time()
    model.learn(total_timesteps=55200)
    end_time = time.time()
    
    elapsed = end_time - start_time
    sps = 55200 / elapsed
    print(f"Completed 55,200 steps in {elapsed:.2f} seconds ({sps:.2f} steps/second)")
    print(f"Estimated time for 5.52M steps: {5520000 / sps / 60:.2f} minutes")

if __name__ == "__main__":
    test_train_speed()
