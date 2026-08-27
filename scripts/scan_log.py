def scan_log_last():
    log_path = "/Users/bnjw/.gemini/antigravity/brain/95ef1206-9f8b-441a-8c7e-cda9520d6336/.system_generated/tasks/task-781.log"
    import os
    if not os.path.exists(log_path):
        print("Log file not found.")
        return
        
    eval_lines = []
    success_lines = []
    
    with open(log_path, 'r', errors='ignore') as f:
        for line in f:
            if "[EVALUATION]" in line:
                eval_lines.append(line.strip())
            if "SUCCESS!" in line or "🎯" in line:
                success_lines.append(line.strip())
                
    print(f"Total evaluation steps so far: {len(eval_lines)}")
    print("--- Last 10 Evaluations ---")
    for line in eval_lines[-10:]:
        print(line)
        
    if success_lines:
        print("\n--- SUCCESS MESSAGES ---")
        for line in success_lines:
            print(line)

if __name__ == "__main__":
    scan_log_last()
