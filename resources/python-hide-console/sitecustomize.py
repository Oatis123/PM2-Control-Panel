"""
Auto-imported by Python when this directory is first on PYTHONPATH.

Hides console windows for child processes (ollama, choco, npm, git, …)
when PM2 apps run under Windows.
"""
from __future__ import annotations

import os
import re
import sys

if sys.platform == "win32":
    import subprocess

    CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    CREATE_NEW_CONSOLE = getattr(subprocess, "CREATE_NEW_CONSOLE", 0x00000010)
    STARTF_USESHOWWINDOW = getattr(subprocess, "STARTF_USESHOWWINDOW", 1)
    SW_HIDE = getattr(subprocess, "SW_HIDE", 0)

    _orig_popen_init = subprocess.Popen.__init__

    def _rewrite_shell_cmd(cmd: object) -> object:
        if not isinstance(cmd, str):
            return cmd
        if not re.search(r"\bstart\s+/b\b", cmd, flags=re.IGNORECASE):
            cmd = re.sub(r"\bstart\s+", "start /B ", cmd, count=1, flags=re.IGNORECASE)
        if re.search(r"Start-Process\b", cmd, flags=re.IGNORECASE) and not re.search(
            r"WindowStyle", cmd, flags=re.IGNORECASE
        ):
            cmd = re.sub(
                r"Start-Process\b",
                "Start-Process -WindowStyle Hidden",
                cmd,
                count=1,
                flags=re.IGNORECASE,
            )
        return cmd

    def _popen_init(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        kwargs = dict(kwargs)

        # creationflags
        flags = int(kwargs.get("creationflags") or 0)
        flags |= CREATE_NO_WINDOW
        flags &= ~CREATE_NEW_CONSOLE
        kwargs["creationflags"] = flags

        # STARTUPINFO: hide window (extra belt-and-suspenders on Windows)
        try:
            si = kwargs.get("startupinfo")
            if si is None:
                si = subprocess.STARTUPINFO()
            si.dwFlags = getattr(si, "dwFlags", 0) | STARTF_USESHOWWINDOW
            si.wShowWindow = SW_HIDE
            kwargs["startupinfo"] = si
        except Exception:
            pass

        # shell command string rewrites
        if kwargs.get("shell") and args:
            new_args = list(args)
            new_args[0] = _rewrite_shell_cmd(new_args[0])
            args = tuple(new_args)

        return _orig_popen_init(self, *args, **kwargs)

    subprocess.Popen.__init__ = _popen_init  # type: ignore[method-assign]

    # os.system
    _orig_system = os.system

    def _system(command: str) -> int:  # type: ignore[no-untyped-def]
        try:
            return int(
                subprocess.call(
                    _rewrite_shell_cmd(command),
                    shell=True,
                    creationflags=CREATE_NO_WINDOW,
                )
            )
        except Exception:
            return int(_orig_system(command))

    os.system = _system  # type: ignore[assignment]
