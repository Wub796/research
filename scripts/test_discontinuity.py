import numpy as np
import sys

# Patch numpy 2.x references
import numpy.core.multiarray as multiarray
import numpy.core.numeric as numeric
sys.modules['numpy._core'] = np
sys.modules['numpy._core.multiarray'] = multiarray
sys.modules['numpy._core.numeric'] = numeric

sys.path.append("/Users/bnjw/Documents/Personal_Project/research")
from src.env.spacecraft_env import SpacecraftEnv

def test_discontinuity():
    env = SpacecraftEnv()
    obs, info = env.reset()
    
    print("Step 0 (Initial state):")
    print("  SC Position:        ", env.state[0:3])
    print("  SC Velocity (abs):  ", env.vel)
    print("  Mars Position:      ", env.mars_pos_table[0])
    print("  Mars Velocity:      ", env.mars_vel_table[0])
    print("  SC-Mars Rel Position (state[3:6]):", env.state[3:6])
    print("  SC-Mars Rel Velocity (state[6:9]):", env.state[6:9])
    
    # Take a step with zero thrust
    action = np.array([0.0, 0.0, 0.0], dtype=np.float32)
    obs, reward, done, truncated, info = env.step(action)
    
    print("\nStep 1 (After 1 step):")
    print("  SC Position:        ", env.state[0:3])
    print("  SC Velocity (abs):  ", env.vel)
    print("  Mars Position:      ", env.mars_pos_table[1])
    print("  Mars Velocity:      ", env.mars_vel_table[1])
    print("  SC-Mars Rel Position (state[3:6]):", env.state[3:6])
    print("  SC-Mars Rel Velocity (state[6:9]):", env.state[6:9])

if __name__ == "__main__":
    test_discontinuity()
