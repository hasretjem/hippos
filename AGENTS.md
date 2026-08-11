# Hippos AI Repository Guide

## Before editing
- Read `docs/AI_RULES.md` and `docs/ARCHITECTURE.md`.
- Inspect only the files relevant to the requested feature.
- Do not read or rewrite the entire repository to make a small change.
- Do not rewrite large files from partial context.

## Current architecture work
The current refactor is intentionally incremental.

### Data layer
- `src/hooks/useHipposData.js` is still the compatibility facade and central legacy hook.
- `src/constants/hipposConstants.js` contains shared business constants extracted from the legacy hook.
- `src/utils/dataMappers.js` contains pure Supabase-row-to-app mappers extracted from the legacy hook.

### Planned domain hooks
- `src/hooks/useProducts.js` — product/category/subcategory/menu operations.
- `src/hooks/useTables.js` — table state and table-specific operations.
- `src/hooks/useOrders.js` — order persistence and order synchronization.
- `src/hooks/useSales.js` — sales history and sold-item data.
- `src/hooks/useCariler.js` — cari records, movements, payments, invoices and history.
- `src/hooks/usePackages.js` — package/delivery data and realtime operations.

These hooks should be introduced one domain at a time. Keep `useHipposData()` as the compatibility facade until callers are migrated and the build is verified.

## Page hotspots
Largest/most important UI areas should be handled later, in this order:
1. `src/pages/DirectSale/DirectSale.jsx`
2. `src/pages/Tables/Tables.jsx`
3. `src/pages/Settings/Settings.jsx`
4. `src/pages/Cariler/Cariler.jsx`
5. `src/pages/Muhasebe/Muhasebe.jsx`
6. `src/pages/GunSonu/GunSonu.jsx`
7. `src/pages/Products/Products.jsx`

## Safe change protocol
1. Make one logical change.
2. Run `npm run build`.
3. Run `npm run lint` when the change is lint-relevant.
4. Review `git diff`.
5. Commit the logical change separately.
6. Never merge the refactor branch into `main` automatically.
7. Never change Supabase schema or production behavior as part of a structural refactor.
