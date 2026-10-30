"""Build the local VS Code extension without additional dependencies."""

import json
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile


def main():
    root = Path(__file__).resolve().parent
    package = json.loads((root / "package.json").read_text(encoding="utf-8"))
    manifest = ET.fromstring((root / "extension.vsixmanifest").read_bytes())
    identity = manifest.find("{*}Metadata/{*}Identity")
    if identity is None or any(
        identity.get(key) != package[field]
        for key, field in (("Id", "name"), ("Version", "version"), ("Publisher", "publisher"))
    ):
        raise ValueError("package.json und extension.vsixmanifest stimmen nicht überein.")

    output = root / f"{package['name']}-{package['version']}.vsix"
    files = [root / name for name in ("package.json", "extension.js", "hardware.js", "arduino-stepping.js", "variable-search.js", "jtag-driver.js", "windows-jtag.ps1", "README.md")]
    files += sorted((root / "media").rglob("*.svg"))
    files += sorted((root / "python").rglob("*.py"))
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for name in ("[Content_Types].xml", "extension.vsixmanifest"):
            archive.write(root / name, name)
        for source in files:
            archive.write(source, "extension/" + source.relative_to(root).as_posix())
    with ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise ValueError("VSIX-Archiv ist beschädigt.")
    print(f"VSIX erstellt: {output}")


if __name__ == "__main__":
    main()
