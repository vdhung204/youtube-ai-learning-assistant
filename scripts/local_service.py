"""Windows process control: lock ownership, cooperative stop, confined cache cleanup."""
import argparse
import asyncio
import contextlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "local-rag-service"))
from app.core.config import Settings, SERVICE_ROOT
from app.core.paths import no_links

RUNTIME = SERVICE_ROOT / "data" / "runtime"


def cache_path(settings):
    target = no_links(settings.cache_dir).resolve()
    data_root = no_links(SERVICE_ROOT / "data").resolve()
    if data_root not in target.parents or target.name != "chroma":
        raise ValueError("Cache target must be a chroma directory inside project data")
    return target


@contextlib.contextmanager
def instance_lock():
    import msvcrt
    no_links(RUNTIME)
    RUNTIME.mkdir(parents=True, exist_ok=True)
    lock_path = no_links(RUNTIME / "service.lock")
    with lock_path.open("a+b") as handle:
        if handle.tell() == 0:
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        try:
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            raise RuntimeError("Service is running or another maintenance operation holds the lock") from None
        try:
            yield
        finally:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def is_running():
    try:
        with instance_lock():
            return False
    except RuntimeError:
        return True


def write_state(data):
    no_links(RUNTIME / "service.json").write_text(json.dumps(data), encoding="utf-8")


def read_state():
    try:
        return json.loads(no_links(RUNTIME / "service.json").read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


async def serve(settings, instance):
    import uvicorn
    from app.core.main import create_app
    stop_file = no_links(RUNTIME / f"{instance}.stop")
    server = uvicorn.Server(uvicorn.Config(create_app(settings), host=settings.host, port=settings.port,
                           access_log=False, log_level="critical", proxy_headers=False,
                           timeout_graceful_shutdown=30))

    async def watch():
        while not server.started:
            if stop_file.exists():
                server.should_exit = True
            await asyncio.sleep(0.1)
        write_state({"pid": os.getpid(), "instance": instance, "port": settings.port, "listening": True})
        while not stop_file.exists():
            await asyncio.sleep(0.1)
        server.should_exit = True

    watcher = asyncio.create_task(watch())
    try:
        await server.serve()
    finally:
        watcher.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await watcher
        stop_file.unlink(missing_ok=True)


def run(settings, instance):
    with instance_lock():
        write_state({"pid": os.getpid(), "instance": instance, "port": settings.port, "listening": False})
        try:
            asyncio.run(serve(settings, instance))
        finally:
            no_links(RUNTIME / "service.json").unlink(missing_ok=True)


def start(settings):
    cache_path(settings)
    with instance_lock():
        # Detect port conflicts before spawning; never terminate an unrelated listener.
        with socket.socket() as probe:
            probe.bind((settings.host, settings.port))
    instance = uuid.uuid4().hex
    process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "run", "--instance", instance],
                               cwd=SERVICE_ROOT, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    deadline = time.monotonic() + settings.lifecycle_timeout_sec + 10
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Service exited during startup. Run python -m app.core.main for diagnosis")
        state = read_state()
        if state.get("instance") == instance and state.get("listening"):
            print(f"Service listening: http://127.0.0.1:{settings.port}/api/v1/health")
            print("Health is 503 until the TV3 RAG facade is configured and ready.")
            return
        time.sleep(0.1)
    # Stop only the instance this invocation created; never kill a PID.
    no_links(RUNTIME / f"{instance}.stop").touch()
    raise RuntimeError("Startup timed out; cooperative stop requested")


def stop(settings):
    if not is_running():
        print("Service is already stopped.")
        return
    state = read_state()
    instance = state.get("instance", "")
    if len(instance) != 32 or any(c not in "0123456789abcdef" for c in instance):
        raise RuntimeError("Cannot identify the project service; no process was terminated")
    no_links(RUNTIME / f"{instance}.stop").touch()
    deadline = time.monotonic() + settings.lifecycle_timeout_sec + 35
    while time.monotonic() < deadline:
        if not is_running():
            print("Service stopped cleanly.")
            return
        time.sleep(0.1)
    raise RuntimeError("Shutdown still pending; no process was forcibly terminated")


def clear(settings):
    target = cache_path(settings)
    print(f"Cache target: {target}")
    with instance_lock():
        if target.exists():
            # Verify every descendant before recursive deletion, including junctions.
            for directory, subdirs, files in os.walk(target, followlinks=False):
                no_links(directory)
                for name in subdirs + files:
                    no_links(Path(directory) / name)
            shutil.rmtree(target)
        print("Project ChromaDB cache cleared.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("start", "stop", "run", "clear", "cache-path"))
    parser.add_argument("--instance", default="")
    args = parser.parse_args()
    try:
        settings = Settings.from_env()
        if args.command == "cache-path":
            print(cache_path(settings))
        elif args.command == "run":
            if len(args.instance) != 32 or any(c not in "0123456789abcdef" for c in args.instance):
                raise ValueError("Invalid service instance")
            run(settings, args.instance)
        else:
            {"start": start, "stop": stop, "clear": clear}[args.command](settings)
    except (ValueError, RuntimeError, OSError):
        print("Operation failed: check configuration, port availability, and service state. No unrelated process was stopped.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
