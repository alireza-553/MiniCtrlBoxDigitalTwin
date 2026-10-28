# Repository workflow

- For each new requested change, create a separate feature or fix branch from
  the current `origin/main`. Do not commit changes directly to `main`.
- Every pull request must target `main`, including changes that depend on
  another unmerged PR. Never use a feature, fix, or documentation branch as
  the pull request base. Preserve required dependency changes on the working
  branch, but keep the pull request base set to `main`.
- Verify the pull request base is `main` when creating or updating a PR.
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
