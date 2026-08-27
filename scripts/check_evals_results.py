import numpy as np

def check_evals_results():
    path = "/Users/bnjw/Documents/Personal_Project/research/logs/results/evaluations.npz"
    try:
        data = np.load(path)
        print("Keys in evaluations.npz:", list(data.keys()))
        print("Timesteps (first 10):", data['timesteps'][:10])
        print("Timesteps (last 10):", data['timesteps'][-10:])
        print("Results shape:", data['results'].shape)
        # Calculate mean rewards at each eval step
        mean_rewards = np.mean(data['results'], axis=1)
        print("Mean rewards (last 10):", mean_rewards[-10:])
        print("Max reward overall:", np.max(mean_rewards))
    except Exception as e:
        print("Error loading npz:", e)

if __name__ == "__main__":
    check_evals_results()
