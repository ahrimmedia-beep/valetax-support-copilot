"""Vercel entry point: the same FastAPI app as `copilot serve`.

The serverless file system is read-only except /tmp, so the agent feedback log goes there
(it does not survive a cold start; the production version writes to an append-only store).
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from copilot.web.app import create_app  # noqa: E402

app = create_app(data_dir=Path("/tmp/copilot-data"))
