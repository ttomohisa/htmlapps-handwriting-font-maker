"""Extract an untrusted static artifact without links, traversal, or zip bombs."""
import os
import shutil
import stat
import zipfile
from pathlib import Path, PurePosixPath

MAX_BYTES = 2 * 1024 * 1024 * 1024
MAX_FILES = 20000

def unpack(archive, destination, max_bytes=MAX_BYTES):
    root = Path(destination).resolve()
    root.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        infos = z.infolist()
        if len(infos) > MAX_FILES or sum(i.file_size for i in infos) > max_bytes:
            raise ValueError('Artifact exceeds static site budget')
        seen = set()
        for info in infos:
            parts = PurePosixPath(info.filename).parts
            mode = info.external_attr >> 16
            if (not parts or info.filename.startswith('/') or '\\' in info.filename or
                ':' in info.filename or '..' in parts or stat.S_ISLNK(mode) or
                (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR))):
                raise ValueError('Unsafe artifact path or file type')
            target = root.joinpath(*parts).resolve()
            if not target.is_relative_to(root) or str(target).casefold() in seen:
                raise ValueError('Artifact path collision or escape')
            seen.add(str(target).casefold())
        total = 0
        for info in infos:
            target = root.joinpath(*PurePosixPath(info.filename).parts)
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as source, target.open('xb') as out:
                while True:
                    block = source.read(1024 * 1024)
                    if not block:
                        break
                    total += len(block)
                    if total > max_bytes:
                        raise ValueError('Expanded artifact exceeds budget')
                    out.write(block)
    if not (root / 'index.html').is_file():
        raise ValueError('Artifact has no index.html')

if __name__ == '__main__':
    unpack(Path(os.environ['RUNNER_TEMP']) / 'preview-site.zip', Path(os.environ['RUNNER_TEMP']) / 'preview-site')
