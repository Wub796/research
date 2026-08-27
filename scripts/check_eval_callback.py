def check_eval_callback():
    log_path = "/Users/bnjw/.gemini/antigravity/brain/95ef1206-9f8b-441a-8c7e-cda9520d6336/.system_generated/tasks/task-781.log"
    import os
    if not os.path.exists(log_path):
        print("Log not found.")
        return
        
    print("Scanning for Eval num_timesteps...")
    count = 0
    with open(log_path, 'r', errors='ignore') as f:
        for line in f:
            if "Eval num_timesteps" in line:
                print(line.strip())
                count += 1
    print(f"Total EvalCallback evaluations: {count}")

if __name__ == "__main__":
    check_eval_callback()
