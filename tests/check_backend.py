"""Quick backend readiness check - measures how long until /health responds."""

import time
import urllib.request
import sys

from tests.utils.runtime_config import get_api_base_url

url = f"{get_api_base_url()}/health"
start = time.time()
max_wait = 60  # seconds

for i in range(max_wait):
    try:
        with urllib.request.urlopen(url, timeout=2) as resp:
            elapsed = time.time() - start
            data = resp.read().decode()
            print(f"Backend READY after {elapsed:.1f}s (attempt {i + 1})")
            print(f"Response: {data}")
            sys.exit(0)
    except Exception:
        if i % 5 == 0:
            elapsed = time.time() - start
            print(f"Attempt {i + 1}: Not ready yet ({elapsed:.1f}s)")
    time.sleep(1)

elapsed = time.time() - start
print(f"TIMEOUT: Backend not ready after {elapsed:.1f}s")
sys.exit(1)
