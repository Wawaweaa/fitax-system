import pandas as pd
import sys

# Check if file path is provided as command line argument
if len(sys.argv) < 2:
    print("Usage: python check_excel.py <excel_file_path>")
    sys.exit(1)

# Get the file path from command line argument
file_path = sys.argv[1]

try:
    # Read the Excel file
    print(f"Reading Excel file: {file_path}")
    excel_file = pd.ExcelFile(file_path)

    # Print sheet names
    print(f"Sheet names: {excel_file.sheet_names}")

    # Read each sheet
    for sheet_name in excel_file.sheet_names:
        df = pd.read_excel(file_path, sheet_name=sheet_name)
        print(f"\nSheet: {sheet_name}")
        print(f"Shape: {df.shape}")
        print("Columns:")
        for col in df.columns:
            print(f"  - {col}")

        # Print first few rows
        print("\nFirst 5 rows:")
        print(df.head())

except Exception as e:
    print(f"Error: {e}")