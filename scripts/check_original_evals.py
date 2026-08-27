import numpy as np

def check_original_evals():
    path = "/Users/bnjw/Documents/Personal_Project/research/logs/results/evaluations.npz"
    data = np.load(path)
    
    timesteps = data['timesteps']
    results = data['results']
    mean_rewards = np.mean(results, axis=1)
    
    print("--- Original Evaluations Progress ---")
    print(f"Total evaluation steps recorded: {len(timesteps)}")
    
    # Print progress every 10 evals
    for idx in range(0, len(timesteps), 25):
        print(f"Step {timesteps[idx]:,}: Mean Reward = {mean_rewards[idx]:,.2f}")
        
    print(f"Step {timesteps[-1]:,}: Mean Reward = {mean_rewards[-1]:,.2f}")

if __name__ == "__main__":
    check_original_evals()
