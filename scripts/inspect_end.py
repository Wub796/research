def inspect_end():
    log_path = "/Users/bnjw/.gemini/antigravity/brain/95ef1206-9f8b-441a-8c7e-cda9520d6336/.system_generated/tasks/task-781.log"
    import os
    if not os.path.exists(log_path):
        print("Log file not found.")
        return
        
    size = os.path.getsize(log_path)
    print(f"Log file size: {size/1e6:.2f} MB")
    
    # Read last 20 lines
    with open(log_path, 'r', errors='ignore') as f:
        # Go near the end
        f.seek(max(0, size - 2000))
        lines = f.readlines()
        print("--- End of Log (last 20 lines) ---")
        for line in lines[-20:]:
            print(line.strip())

if __name__ == "__main__":
    inspect_end()
