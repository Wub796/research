import numpy as np

def check_evals():
    path = "/Users/bnjw/Documents/Personal_Project/research/logs/evaluations.npz"
    try:
        data = np.load(path)
        print("Keys in evaluations.npz:", list(data.keys()))
        print("Timesteps:", data['timesteps'])
        print("Results shape:", data['results'].shape)
        # Calculate mean rewards at each eval step
        mean_rewards = np.mean(data['results'], axis=1)
        print("Mean rewards at each eval step:", mean_rewards)
    except Exception as e:
        print("Error loading npz:", e)

if __name__ == "__main__":
    check_evals()
