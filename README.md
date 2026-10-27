# Run Planner batch

Precomputes the Run Planner's "Through Time" plans on GitHub's machines instead of a laptop.

1. Push this folder to a **private** GitHub repo.
2. Actions tab -> "Precompute Through Time plans" -> Run workflow. The `chain` job also plans everything in `extra-chains.json` (add your own chains there).
3. When it finishes, download the `results-*` artifacts and unzip them side by side into one folder `X` (each has `results/*.json`).
4. Merge: `PT_BASE=<published through-time.json> node tools/merge-through-time.js X` (writes `run-planner-app/data/plans/through-time.json` in the DexCore folder; run it there).

`data/` is the published Run Planner's data (so results match the page). Refresh it from the artifact before a new round.
Locally: `PT_FILTER="best|default" node tools/precompute-through-time.js out`.
