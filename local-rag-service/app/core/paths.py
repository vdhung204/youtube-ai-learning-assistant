from pathlib import Path


def no_links(path):
    """Reject symlinks and Windows junctions before accessing project data."""
    path = Path(path).absolute()
    for candidate in (path, *path.parents):
        if candidate.is_symlink():
            raise ValueError("Linked data paths are not supported")
        if candidate.exists() and getattr(candidate.lstat(), "st_file_attributes", 0) & 0x400:
            raise ValueError("Reparse data paths are not supported")
    return path
