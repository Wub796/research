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

def print_final_state_details():
    model_path = "/Users/bnjw/Documents/Personal_Project/research/logs/best_model/best_model"
    vec_path = "/Users/bnjw/Documents/Personal_Project/research/artifacts/vec_normalize_phase5_final.pkl"
    # Wait, we can load the vec_normalize from checkspoints too if needed, but artifacts is fine
    
    eval_env = DummyVecEnv([lambda: SpacecraftEnv()])
    eval_env = VecNormalize.load(vec_path, eval_env)
    eval_env.training = False
    eval_env.norm_reward = False
    model = PPO.load(model_path)
    
    obs = eval_env.reset()
    raw_env = eval_env.envs[0]
    
    last_dist = None
    last_error = None
    last_phase = None
    
    for step in range(11040):
        last_dist = np.linalg.norm(raw_env.state[3:6])
        last_error = raw_env.prev_error
        last_phase = raw_env.prev_phase_angle
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, done, info = eval_env.step(action)
        if done[0]:
            break
            
    print("\n--- Current Best Model Final State (recorded before step 11040) ---")
    print(f"Distance to Mars: {last_dist:,.2f} km")
    print(f"Energy Error:     {last_error:,.2f}")
    print(f"Phase Angle (rad):{last_phase:.4f}")

if __name__ == "__main__":
    print_final_state_details()
