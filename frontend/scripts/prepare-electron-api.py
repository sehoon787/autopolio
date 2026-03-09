"""
Prepare API source for Electron packaging.

Copies api/, config/, data/ to frontend/_electron_api/,
compiles .py to .pyc bytecode, then removes .py source files.
The packaged Electron app will only contain .pyc files.

Usage: python frontend/scripts/prepare-electron-api.py
"""

import compileall
import os
import shutil
import sys

# ---------- Configuration ----------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.dirname(SCRIPT_DIR)
PROJECT_ROOT = os.path.dirname(FRONTEND_DIR)
OUTPUT_DIR = os.path.join(FRONTEND_DIR, "_electron_api")

# Directories to copy (relative to PROJECT_ROOT)
COPY_TARGETS = [
    "api",
    "config",
    os.path.join("data", "platform_templates"),
    os.path.join("data", "templates"),
]

# Patterns to exclude when copying
EXCLUDE_DIRS = {"__pycache__", "tests", ".pytest_cache", "migrations", ".git"}

# ---------- Helpers ----------

def check_python_version():
    """Verify build Python version matches bundled runtime (if present)."""
    current = (sys.version_info.major, sys.version_info.minor)

    # Detect bundled runtime version from python-runtime/ directory
    bundled_version = _detect_bundled_python_version()
    if bundled_version and current != bundled_version:
        print(
            f"ERROR: Build Python is {current[0]}.{current[1]}, "
            f"but bundled runtime is {bundled_version[0]}.{bundled_version[1]}. "
            f".pyc files are NOT compatible across Python minor versions."
        )
        sys.exit(1)
    else:
        extra = f" (bundled: {bundled_version[0]}.{bundled_version[1]})" if bundled_version else " (no bundled runtime found, skipping check)"
        print(f"Python version OK: {current[0]}.{current[1]}{extra}")


def _detect_bundled_python_version():
    """Detect bundled Python version from python-runtime/ directory. Returns (major, minor) or None."""
    runtime_dir = os.path.join(FRONTEND_DIR, "python-runtime")
    if not os.path.exists(runtime_dir):
        return None
    # Look for python binary in any platform subdirectory
    for platform_dir in os.listdir(runtime_dir):
        python_bin = os.path.join(runtime_dir, platform_dir, "python", "bin", "python3")
        if os.path.exists(python_bin):
            try:
                import subprocess
                result = subprocess.run(
                    [python_bin, "--version"], capture_output=True, text=True, timeout=5
                )
                # "Python 3.14.2" → (3, 14)
                ver_str = result.stdout.strip().split()[-1]
                parts = ver_str.split(".")
                return (int(parts[0]), int(parts[1]))
            except Exception:
                pass
    return None


def ignore_factory(src, names):
    """shutil.copytree ignore callback: skip excluded directories."""
    return [n for n in names if n in EXCLUDE_DIRS]


def copy_sources():
    """Copy source directories to output."""
    if os.path.exists(OUTPUT_DIR):
        print(f"Cleaning previous build: {OUTPUT_DIR}")
        shutil.rmtree(OUTPUT_DIR)

    for target in COPY_TARGETS:
        src = os.path.join(PROJECT_ROOT, target)
        dst = os.path.join(OUTPUT_DIR, target)

        if not os.path.exists(src):
            print(f"  SKIP (not found): {src}")
            continue

        print(f"  Copying: {target}")
        shutil.copytree(src, dst, ignore=ignore_factory)


def compile_to_pyc():
    """Compile all .py files in the api directory to .pyc (in-place, legacy layout)."""
    api_dir = os.path.join(OUTPUT_DIR, "api")
    if not os.path.exists(api_dir):
        print("ERROR: api directory not found in output")
        sys.exit(1)

    print(f"  Compiling .py -> .pyc in: {api_dir}")
    # legacy=True puts .pyc next to .py (not in __pycache__/)
    success = compileall.compile_dir(
        api_dir,
        quiet=1,
        legacy=True,
        optimize=0,
    )
    if not success:
        print("ERROR: Some files failed to compile")
        sys.exit(1)


def remove_py_files():
    """Remove all .py source files, keeping only .pyc."""
    api_dir = os.path.join(OUTPUT_DIR, "api")
    removed = 0
    kept_pyc = 0

    for root, dirs, files in os.walk(api_dir):
        for f in files:
            if f.endswith(".py"):
                py_path = os.path.join(root, f)
                pyc_path = py_path + "c"  # .pyc companion

                if os.path.exists(pyc_path):
                    os.remove(py_path)
                    removed += 1
                    kept_pyc += 1
                else:
                    print(f"  WARNING: No .pyc for {py_path}, keeping .py")

    print(f"  Removed {removed} .py files, kept {kept_pyc} .pyc files")


def cleanup_pycache():
    """Remove any __pycache__ directories that may have been created."""
    api_dir = os.path.join(OUTPUT_DIR, "api")
    for root, dirs, files in os.walk(api_dir, topdown=False):
        for d in dirs:
            if d == "__pycache__":
                pycache_path = os.path.join(root, d)
                shutil.rmtree(pycache_path)
                print(f"  Cleaned: {pycache_path}")


def verify_output():
    """Print summary of the output directory."""
    api_dir = os.path.join(OUTPUT_DIR, "api")
    pyc_count = 0
    py_count = 0

    for root, dirs, files in os.walk(api_dir):
        for f in files:
            if f.endswith(".pyc"):
                pyc_count += 1
            elif f.endswith(".py"):
                py_count += 1

    print(f"  .pyc files: {pyc_count}")
    print(f"  .py files:  {py_count}")

    if py_count > 0:
        print("  WARNING: Some .py files remain!")
    if pyc_count == 0:
        print("  ERROR: No .pyc files found!")
        sys.exit(1)

    print("  Output directory ready for electron-builder")


# ---------- Main ----------

def main():
    print("=" * 60)
    print("Autopolio - Prepare Electron API")
    print("=" * 60)

    print("\n[1/6] Checking Python version...")
    check_python_version()

    print("\n[2/6] Copying sources...")
    copy_sources()

    print("\n[3/6] Compiling .py -> .pyc...")
    compile_to_pyc()

    print("\n[4/6] Removing .py source files...")
    remove_py_files()

    print("\n[5/6] Cleaning __pycache__ directories...")
    cleanup_pycache()

    print("\n[6/6] Verifying output...")
    verify_output()

    print("\nDone!")


if __name__ == "__main__":
    main()
