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

def evaluate_true_final_distance(model_path, vec_path):
    print(f"\nEvaluating: {model_path}")
    if not os.path.exists(model_path + ".zip") and not os.path.exists(model_path):
        print(f"File not found: {model_path}")
        return None
        
    eval_env = DummyVecEnv([lambda: SpacecraftEnv()])
    eval_env = VecNormalize.load(vec_path, eval_env)
    eval_env.training = False
    eval_env.norm_reward = False
    
    model = PPO.load(model_path)
    
    obs = eval_env.reset()
    raw_env = eval_env.envs[0]
    
    last_sc_pos = None
    last_mars_pos = None
    last_dist = None
    
    for step in range(11040):
        # Record state before action
        last_sc_pos = raw_env.state[0:3].copy()
        last_mars_pos = raw_env.mars_pos_table[step].copy()
        last_dist = np.linalg.norm(raw_env.state[3:6])
        
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, done, info = eval_env.step(action)
        
        if done[0]:
            print(f"Simulation terminated at step {step}")
            break
            
    print(f"True Final Dist to Mars: {last_dist:,.2f} km")
    print(f"Spacecraft Final Position: {last_sc_pos}")
    print(f"Mars Final Position:       {last_mars_pos}")
    return last_dist

if __name__ == "__main__":
    vec_normalize_path = "/Users/bnjw/Documents/Personal_Project/research/artifacts/vec_normalize_phase5_final.pkl"
    
    models = [
        "/Users/bnjw/Documents/Personal_Project/research/artifacts/ppo_spacecraft_phase5_final",
        "/Users/bnjw/Documents/Personal_Project/research/logs/best_model/best_model",
        "/Users/bnjw/Documents/Personal_Project/research/logs/best_model_flat"
    ]
    
    for m in models:
        evaluate_true_final_distance(m, vec_normalize_path)
