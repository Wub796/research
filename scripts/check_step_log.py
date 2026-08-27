def check_step():
    log_path = "/Users/bnjw/.gemini/antigravity/brain/95ef1206-9f8b-441a-8c7e-cda9520d6336/.system_generated/tasks/task-781.log"
    import os
    if not os.path.exists(log_path):
        print("Log not found.")
        return
        
    print("Searching for lines around 905280...")
    lines = []
    with open(log_path, 'r', errors='ignore') as f:
        lines = f.readlines()
        
    for idx, line in enumerate(lines):
        if "905280" in line:
            print(f"Line {idx+1}: {line.strip()}")
            # Print 5 lines before and 20 lines after
            start = max(0, idx - 5)
            end = min(len(lines), idx + 20)
            for j in range(start, end):
                print(f"  {j+1}: {lines[j].strip()}")
            break

if __name__ == "__main__":
    check_step()
