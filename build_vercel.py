"""Package the same static assets for Vercel's CDN."""
from pathlib import Path
from shutil import copytree

copytree(Path('static'), Path('public/static'), dirs_exist_ok=True)