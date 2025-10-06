import os
import csv
import shutil

# === CONFIGURATION ===
base_dir = "./voicelines/fallout76"
reference_file = "./reference_table.tsv"  # can also be .csv
# ======================

# --- detect whether it's CSV or TSV automatically ---
def detect_delimiter(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        first_line = f.readline()
        if '\t' in first_line:
            return '\t'
        elif ',' in first_line:
            return ','
        else:
            return '\t'  # default to tab

delimiter = detect_delimiter(reference_file)

# --- load FormID -> EditorID mapping ---
formid_to_editor = {}
with open(reference_file, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f, delimiter=delimiter)
    for row in reader:
        formid = row.get('Form ID', '').strip().lower()
        editor = row.get('Editor ID', '').strip()
        if formid and editor:
            formid_to_editor[formid] = editor

if not formid_to_editor:
    print("⚠️ No valid entries found in reference file. Check headers and format.")
    exit()

# --- process all wav files in fallout76 ---
for filename in os.listdir(base_dir):
    if not filename.lower().endswith(".wav"):
        continue

    formid_prefix = filename.split("_")[0].lower()
    src_path = os.path.join(base_dir, filename)

    if formid_prefix in formid_to_editor:
        editor_id = formid_to_editor[formid_prefix]
        dest_folder = os.path.join(base_dir, editor_id)
        os.makedirs(dest_folder, exist_ok=True)

        dest_path = os.path.join(dest_folder, filename)
        shutil.move(src_path, dest_path)
        print(f"✅ Moved {filename} → {editor_id}/")
    else:
        print(f"⚠️ No match found for {filename}")

print("\n🎉 Done! All matching files have been organized.")
