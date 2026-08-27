import pandas as pd

def check_csv():
    path = "/Users/bnjw/Documents/Personal_Project/research/artifacts/optimal_mars_trajectory.csv"
    df = pd.read_csv(path)
    print("CSV Columns:", df.columns)
    print("CSV Rows:", len(df))
    print("\n--- First Row ---")
    print(df.iloc[0])
    print("\n--- Last Row ---")
    print(df.iloc[-1])
    
    # Check max thrust and mean thrust in the CSV
    print(f"\nCSV Thrust Command: max = {df['thrust_cmd_N'].max():.6f} N, mean = {df['thrust_cmd_N'].mean():.6f} N")

if __name__ == "__main__":
    check_csv()
