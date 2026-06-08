import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from hidden_web_intelligence.stealth_fetcher import hidden_fetch_page


def main() -> None:
    result = asyncio.run(hidden_fetch_page("https://example.com"))
    print(result)


if __name__ == "__main__":
    main()
