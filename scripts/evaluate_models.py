import os
import sys
import numpy as np
import numpy.core.multiarray as multiarray
import numpy.core.numeric as numeric
sys.modules['numpy._core'] = np
sys.modules['numpy._core.multiarray'] = multiarray
sys.modules['numpy._core.numeric'] = numeric

from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize

# Add the research/src directory to path so SpacecraftEnv can be imported
sys.path.append("/Users/bnjw/Documents/Personal_Project/research")
from src.env.spacecraft_env import SpacecraftEnv

def evaluate_model(model_path, vec_path):
    print(f"\nEvaluating model: {model_path}")
    if not os.path.exists(model_path + ".zip") and not os.path.exists(model_path):
        print(f"File not found: {model_path}")
        return None
        
    eval_env = DummyVecEnv([lambda: SpacecraftEnv()])
    try:
        eval_env = VecNormalize.load(vec_path, eval_env)
        eval_env.training = False
        eval_env.norm_reward = False
    except Exception as e:
        print(f"Error loading VecNormalize: {e}")
        return None

    try:
        model = PPO.load(model_path)
    except Exception as e:
        print(f"Error loading PPO model: {e}")
        return None

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
    return final_dist

if __name__ == "__main__":
    vec_normalize_path = "/Users/bnjw/Documents/Personal_Project/research/artifacts/vec_normalize_phase5_final.pkl"
    
    models = [
        "/Users/bnjw/Documents/Personal_Project/research/artifacts/ppo_spacecraft_phase5_final",
        "/Users/bnjw/Documents/Personal_Project/research/logs/best_model/best_model",
        "/Users/bnjw/Documents/Personal_Project/research/logs/best_model"
    ]
    
    for m in models:
        evaluate_model(m, vec_normalize_path)
