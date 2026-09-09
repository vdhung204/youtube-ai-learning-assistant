import contextlib
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "local-rag-service"))
import local_service
from app.core.config import Settings, SERVICE_ROOT


@unittest.skipUnless(sys.platform == "win32", "Windows operation scripts")
class OperationsTests(unittest.TestCase):
    def setUp(self):
        data = SERVICE_ROOT / "data"
        data.mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="tv2-test-", dir=data)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.settings = Settings(data_dir=self.root)
        self.runtime = patch.object(local_service, "RUNTIME", self.root / "runtime")
        self.runtime.start()
        self.addCleanup(self.runtime.stop)

    def test_clear_only_cache_and_repeat_is_safe(self):
        self.settings.cache_dir.mkdir()
        (self.settings.cache_dir / "synthetic.txt").write_text("test")
        sibling = self.root / "keep.txt"
        sibling.write_text("keep")
        with contextlib.redirect_stdout(io.StringIO()):
            local_service.clear(self.settings)
            local_service.clear(self.settings)
        self.assertFalse(self.settings.cache_dir.exists())
        self.assertEqual(sibling.read_text(), "keep")

    def test_clear_refuses_running_service_lock(self):
        self.settings.cache_dir.mkdir()
        marker = self.settings.cache_dir / "synthetic.txt"
        marker.write_text("keep")
        with local_service.instance_lock(), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(RuntimeError):
                local_service.clear(self.settings)
        self.assertEqual(marker.read_text(), "keep")

    def test_rejects_external_or_project_root_target(self):
        for target in (ROOT, Path.home(), SERVICE_ROOT):
            with self.subTest(target=target), self.assertRaises(ValueError):
                Settings(data_dir=target)

    def test_stale_pid_never_terminates_a_process(self):
        with local_service.instance_lock():
            local_service.write_state({"pid": 1, "instance": "a" * 32, "listening": True})
        with patch("subprocess.Popen") as spawn, contextlib.redirect_stdout(io.StringIO()):
            local_service.stop(self.settings)
        spawn.assert_not_called()
        self.assertFalse((local_service.RUNTIME / ("a" * 32 + ".stop")).exists())
