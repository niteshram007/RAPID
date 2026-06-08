import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from hidden_web_intelligence.hidden_search import hidden_search_web


def main() -> None:
    result = asyncio.run(hidden_search_web("best EV startups in India"))
    print(result)


if __name__ == "__main__":
    main()
