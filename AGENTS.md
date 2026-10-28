# Repository workflow

- For each new requested change, create a separate feature or fix branch from
  the current `origin/main`. Do not commit changes directly to `main`.
- If a change depends on an unmerged PR, create a separate stacked branch from
  that PR's branch and use it as the new PR's base so existing work is preserved.
- Push the branch and open a GitHub pull request for that change. Do not merge
  the pull request unless the user requests it.
- Run the checks relevant to the change before pushing. For extension changes,
  run `node --check vscode-extension/extension.js` and
  `node vscode-extension/test/upload.test.js`.
- For simulator changes, run `python -m unittest discover -s mcb_digital_twin
  -p "test_*.py"`. The optional native integration test uses
  `MCB_NATIVE_TEST_PROJECT` to select the user's C++ exercise project.
- Build the installable extension with `python vscode-extension/build_vsix.py`.
  Include only the current VSIX when a release package is requested; generated
  VSIX files are ignored by default and require explicit `git add -f`.
- Keep temporary builds, logs, Python caches, credentials and local hardware
  reference materials out of commits.
