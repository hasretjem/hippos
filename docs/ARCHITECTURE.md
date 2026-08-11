# Hippos Architecture

## Current refactor direction

The application is being moved from large page/data files toward domain-focused modules without changing behavior.

### Shared constants

`src/constants/hipposConstants.js`

Contains fixed business constants such as table lists, bread-stock definitions, quick-sale name, and currency formatting.

### Data mappers

`src/utils/dataMappers.js`

Contains pure transformations from Supabase rows to the application data shape. These functions should remain side-effect free.

### Planned data domains

The central `src/hooks/useHipposData.js` currently contains multiple domains. The target structure is:

- `useProducts.js` — products, categories, subcategories, product status, menu-related product operations.
- `useTables.js` — table state and table-specific operations.
- `useOrders.js` — order persistence and order-related realtime data.
- `useSales.js` — sales history and sold-item data.
- `useCariler.js` — cari records, movements, payments, invoices and related history.
- `usePackages.js` — package/delivery data and related realtime operations.

`useHipposData.js` should initially remain as a compatibility facade that combines these domains. It should only be removed after all callers have migrated.

## Refactor principle

One domain at a time. Preserve the existing public data API. No UI redesign or business-rule changes during structural refactors.
