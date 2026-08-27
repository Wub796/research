def scan_errors():
    log_path = "/Users/bnjw/.gemini/antigravity/brain/95ef1206-9f8b-441a-8c7e-cda9520d6336/.system_generated/tasks/task-781.log"
    import os
    if not os.path.exists(log_path):
        print("Log not found.")
        return
        
    print("Scanning log for traceback/errors...")
    found = False
    with open(log_path, 'r', errors='ignore') as f:
        for idx, line in enumerate(f):
            if "traceback" in line.lower() or "exception" in line.lower() or "error" in line.lower() or "fail" in line.lower():
                # Ignore expected scikit-learn InconsistentVersionWarning and Tensorboard import warning
                if "InconsistentVersionWarning" in line or "ImportError" in line or "UserWarning" in line:
                    continue
                print(f"Line {idx+1}: {line.strip()}")
                found = True
    if not found:
        print("No unexpected tracebacks or errors found in the log.")

if __name__ == "__main__":
    scan_errors()
