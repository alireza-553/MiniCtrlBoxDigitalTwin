"""Select the checked GDB explicitly in PlatformIO build/debug metadata."""

import sys

Import("env")

# A shared project may also be opened on Windows, where this Linux repair
# must not select a path belonging to another machine.
if sys.platform != "win32":
    gdb = env.GetProjectOption("custom_mcb_gdb_path", "")
    if gdb:
        env.Replace(GDB=gdb)
