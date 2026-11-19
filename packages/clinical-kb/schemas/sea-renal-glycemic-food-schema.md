# SEA Renal & Glycemic Food DB — Schema Design (Phase 2, NOT wired into POC)

Status: design archive only. Nothing in the POC imports or executes this. Lives in
`packages/clinical-kb/schemas/` as an architecture-reserve exhibit for reviewers.

## Why a localized DB (not USDA-only)

Malaysian/Singaporean staples are absent from Western nutrition databases. Renal
management additionally requires electrolyte columns Western diet apps skip.

## Proposed fields (per 100 g + per-portion)

| Field | Type | Notes |
| --- | --- | --- |
| `food_id` | TEXT PK | stable slug, e.g. `nasi-lemak` |
| `name_en` / `name_zh` / `name_ms` | TEXT | tri-lingual display names |
| `kcal` | REAL | energy |
| `carb_g` / `gi` | REAL | glycemic index for diabetes module |
| `protein_g` | REAL | renal protein tracking |
| `sodium_mg` | REAL | **renal-critical** |
| `potassium_mg` | REAL | **renal-critical** (red-line rule K) |
| `phosphorus_mg` | REAL | **renal-critical** |
| `hidden_fluid_ml` | REAL | soup/gravy/broth water content folded into fluid totals |
| `source` / `source_date` | TEXT | provenance; verified vs unverified labels required |

## Future integration point

Feeds AI Missy's food-logging explanation layer and PAIR's threshold rules
(via the PAIR engine only — `clinical-kb` never runs at gateway runtime, per
`spec.md > 0. Single source of truth`).

## Explicitly out of scope for the POC (spec.md > Simplifications)

No food data, no drug/nephrotoxicity DB, no lookups wired in this build.
