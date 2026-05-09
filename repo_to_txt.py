import os

# ==========================================
# CONFIGURATION
# ==========================================
# The directory to scan. "." means the current directory.
ROOT_DIR = "."  
# The name of the final output file
OUTPUT_FILE = "repo_dump.txt" 

# Directories to explicitly ignore
IGNORE_DIRS = {
    ".git", "node_modules", "dist", "build", "__pycache__", 
    ".venv", "venv", "env", ".idea", ".vscode", "coverage", "out", "target"
}

# Exact file names to ignore
IGNORE_FILES = {
    ".DS_Store", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"
}

# File extensions to ignore (binaries, media, or files useless to an LLM)
IGNORE_EXTENSIONS = {
    # Images / Media
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp",
    ".mp4", ".mp3", ".wav", ".avi", ".mkv",
    # Documents / Binaries / Archives
    ".pdf", ".zip", ".tar", ".gz", ".rar", ".7z", 
    ".exe", ".dll", ".so", ".dylib", ".class", ".jar"
}

# Maximum file size to include (in Megabytes). Prevents huge logs from crashing the output.
MAX_FILE_SIZE_MB = 1  


# ==========================================
# UTILITY FUNCTIONS
# ==========================================
def is_binary(file_path):
    """
    Checks if a file is binary by reading a small chunk and looking for null bytes.
    """
    try:
        with open(file_path, "rb") as f:
            chunk = f.read(1024)
            return b"\0" in chunk
    except Exception:
        # If we can't read it, assume it's unreadable/binary to be safe
        return True

def should_skip(file_path, file_name):
    """
    Determines if a file should be skipped based on extension, size, security, or binary content.
    """
    # 1. SECURITY: Never dump environment variables
    if file_name.startswith(".env"):
        return True

    # 2. Check exact file names we want to skip (like lock files)
    if file_name in IGNORE_FILES: 
         return True
         
    # 3. Check extensions
    _, ext = os.path.splitext(file_path)
    if ext.lower() in IGNORE_EXTENSIONS:
        return True

    # 4. Check file size
    try:
        if os.path.getsize(file_path) > MAX_FILE_SIZE_MB * 1024 * 1024:
            return True
    except OSError:
        return True # Skip if we can't get the size

    # 5. Check if it's a binary file
    if is_binary(file_path):
        return True

    return False


# ==========================================
# MAIN LOGIC
# ==========================================
def generate_repo_dump():
    """Walks the directory structure and writes the content to the output file."""
    
    print(f"Starting repository scan from: {os.path.abspath(ROOT_DIR)}")
    files_processed = 0
    files_skipped = 0
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        for root, dirs, files in os.walk(ROOT_DIR):
            
            # Modify the 'dirs' list IN-PLACE to prevent os.walk from entering ignored directories
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

            for file in files:
                # Never include the output file itself or the script itself
                if file == OUTPUT_FILE or file == "repo_to_txt.py":
                    continue

                file_path = os.path.join(root, file)

                if should_skip(file_path, file):
                    files_skipped += 1
                    continue

                # Get a clean relative path to display in the header
                relative_path = os.path.relpath(file_path, ROOT_DIR)

                try:
                    # Attempt to read the file. We use errors='replace' to avoid crashing on weird encoding.
                    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()
                        
                    # Write the clearly defined separator and filename
                    out.write(f"\n{'='*80}\n")
                    out.write(f"FILE: {relative_path}\n")
                    out.write(f"{'='*80}\n\n")
                    
                    out.write(content)
                    out.write("\n\n")
                    
                    files_processed += 1
                    
                except Exception as e:
                    print(f"Warning: Could not process {relative_path}. Error: {e}")
                    files_skipped += 1

    print("-" * 40)
    print("✅ Generation Complete!")
    print(f"Output saved to: {OUTPUT_FILE}")
    print(f"Files included:  {files_processed}")
    print(f"Files skipped:   {files_skipped} (Ignored folders, .env files, binaries, or > {MAX_FILE_SIZE_MB}MB)")


if __name__ == "__main__":
    generate_repo_dump()