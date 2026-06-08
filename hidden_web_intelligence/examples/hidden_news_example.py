import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from hidden_web_intelligence.tool_router import tool_live_context


def main() -> None:
    result = asyncio.run(tool_live_context("latest artificial intelligence news"))
    print(result)


if __name__ == "__main__":
    main()
