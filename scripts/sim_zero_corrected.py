import os
import sys
import numpy as np

# Patch numpy 2.x references
import numpy.core.multiarray as multiarray
import numpy.core.numeric as numeric
sys.modules['numpy._core'] = np
sys.modules['numpy._core.multiarray'] = multiarray
sys.modules['numpy._core.numeric'] = numeric

sys.path.append("/Users/bnjw/Documents/Personal_Project/research")
from src.env.spacecraft_env import SpacecraftEnv

def check_corrected_zero_thrust():
    env = SpacecraftEnv()
    env.reset()
    
    # 0 thrust action
    zero_action = np.array([0.0, 0.0, 0.0], dtype=np.float32)
    
    for step in range(11040):
        env.step(zero_action)
        
    final_dist = np.linalg.norm(env.state[3:6])
    print(f"Corrected Zero Thrust Final Dist to Mars: {final_dist:,.2f} km")
    print(f"Final SC Pos:   {env.state[0:3]}")
    print(f"Final Mars Pos: {env.mars_pos_table[11039]}")

if __name__ == "__main__":
    check_corrected_zero_thrust()
