import os
import csv
import shutil
import re

# === CONFIGURATION ===
base_dir = "./voicelines/fallout76"
reference_file = "./reference_table.tsv"      # Editor ID ↔ Form ID
reference_table = "./reference_table.tsv"     # Has Response Text column
summary_file = "./classified_summary.tsv"     # Output summary file (TSV)
# ======================

# --- detect delimiter automatically ---
def detect_delimiter(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        first_line = f.readline()
        if '\t' in first_line:
            return '\t'
        elif ',' in first_line:
            return ','
        else:
            return '\t'

delimiter_ref = detect_delimiter(reference_file)
delimiter_gen = detect_delimiter(reference_table)

# --- load FormID -> EditorID mapping ---
formid_to_editor = {}
with open(reference_file, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f, delimiter=delimiter_ref)
    for row in reader:
        formid = row.get('Form ID', '').strip().lower()
        editor = row.get('Editor ID', '').strip()
        if formid and editor:
            formid_to_editor[formid] = editor

if not formid_to_editor:
    print("⚠️ No valid entries found in reference file.")
    exit()

# --- classify intros / outros using response text ---
formid_to_type = {}
summary_data = []

intro_patterns = re.compile(r"\b(up next|coming up|here'?s|let'?s listen|we'?ve got|this next song|how about|and now)\b", re.IGNORECASE)
outro_patterns = re.compile(r"\b(that was|you just heard|and that was|hope you liked|we just heard|from .+|played earlier)\b", re.IGNORECASE)

with open(reference_table, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f, delimiter=delimiter_gen)
    for row in reader:
        formid = row.get('Form ID', '').strip().lower()
        text = row.get('Response Text', '').strip()
        editor = row.get('Editor ID', '').strip() or formid_to_editor.get(formid, "")
        if not formid:
            continue

        if re.search(intro_patterns, text):
            vo_type = "intro"
        elif re.search(outro_patterns, text):
            vo_type = "outro"
        else:
            vo_type = "normal"

        formid_to_type[formid] = vo_type
        summary_data.append({
            "Form ID": formid,
            "Editor ID": editor,
            "Type": vo_type,
            "Response Text": text
        })

# --- write summary TSV ---
with open(summary_file, "w", newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=["Form ID", "Editor ID", "Type", "Response Text"], delimiter='\t')
    writer.writeheader()
    writer.writerows(summary_data)

print(f"📄 Summary saved as {summary_file} ({len(summary_data)} entries)")

# --- process all wav files ---
for filename in os.listdir(base_dir):
    if not filename.lower().endswith(".wav"):
        continue

    # Extract Form ID from filename (first 8 hex digits)
    formid_match = re.match(r'^([0-9a-f]{8})', filename.lower())
    if not formid_match:
        print(f"⚠️ Could not extract Form ID from {filename}")
        continue
    formid = formid_match.group(1)

    src_path = os.path.join(base_dir, filename)

    if formid in formid_to_editor:
        editor_id = formid_to_editor[formid]
        vo_type = formid_to_type.get(formid, "normal")

        dest_folder = os.path.join(base_dir, editor_id)
        if vo_type in ("intro", "outro"):
            dest_folder = os.path.join(dest_folder, vo_type)

        os.makedirs(dest_folder, exist_ok=True)
        dest_path = os.path.join(dest_folder, filename)

        shutil.move(src_path, dest_path)
        print(f"✅ Moved {filename} → {editor_id}/{vo_type if vo_type != 'normal' else ''}")
    else:
        print(f"⚠️ No match found for {filename}")

print("\n🎉 Done! Files organized by Editor ID and intro/outro classification.")
