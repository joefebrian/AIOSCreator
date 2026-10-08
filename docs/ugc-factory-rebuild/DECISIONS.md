# Decisions from the repository

- The new board is the page at `/create/ugc-factory`. The old board file stays as `legacy-board.tsx` so it can be put back. The old `/api/ugc-factory/board` route is still there and is not the create path.
- Persistence is `data/db/ugc-factory-v2.json`. No new database was added.
- One Create click writes one production. Markets are a single choice: ID, MY, SG, TH, US. A second market is a second explicit production, or only a saved listing.
- A catalog product plus a package label and piece count is the physical SKU. A different package label or piece count in the same family is a new SKU. Listing equivalence starts as PROPOSED.
- Price currency is stored as imported. It is not converted into the market currency.
- New productions accept only the five pilot recipes. The 33 legacy templates are listed on the page and are rejected by the create API.
- There is no workspace id. Ownership is the single local data directory.
- Jev 1.13 runs only when more than one pilot is feasible. Zero feasible pilots record that Jev was not called. One feasible pilot is selected in code. An operator pick is stored as an override. Confidence is not a virality or conversion probability. The five recipes stay pilots.
- Astra runs only through `factoryScriptLlm()` after the plan blockers are empty. The model id stored on a plan is the configured model. Reference-analysis text is not a production script. Approve does not submit a job. Generate does not call Wan or Seedance unless a later change adds a reviewed budget, and this pass did not add one.
- The supplied benchmark stays a quality reference for delivery, framing, handling, rhythm, and editing. Its category does not add a hair-care recipe and does not validate a pilot. Speech stays unknown. On-screen lines are source evidence. Structure lines are mechanisms from the sample, not a required sequence and not a rule that a recommendation must be dropped. A new production keeps its own arc and duration.
