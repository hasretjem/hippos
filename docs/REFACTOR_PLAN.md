# Hippos Data Layer Refactor Plan

## Goal
Reduce AI context size and improve maintainability without changing Hippos behavior.

## Current hotspot
`src/hooks/useHipposData.js` is the central data source and currently combines product/menu management, table/order state, realtime subscriptions, sales history, cari data, package delivery data, presence, and shared mapping helpers.

## Phase 1 — safe extraction
Extract only pure/shared code first:

- `src/constants/hipposConstants.js`
  - QUICK_SALE
  - EKMEK_TURLERI_STOK
  - SALON_TABLES
  - ALT_TABLES
  - TABLE_PAIRS
  - FIXED_TABLES
  - TL

- `src/utils/dataMappers.js`
  - rowToProduct
  - rowToCategory
  - rowToSubcategory
  - rowToSale
  - rowToSoldItem
  - rowToAction
  - rowToCari
  - rowToHareket
  - rowToOdeme
  - rowToFatura
  - rowToGecmis
  - rowToPaketTeslimat
  - rowToCariTeslimatBildirim

## Phase 2 — domain hooks
Do not change the public API of `useHipposData` yet. Move domain state/functions behind these hooks:

### useProducts
State/functions related to:
- products
- categories
- subcategories
- favorites
- product status
- category/subcategory status/order
- add/update/delete product
- bulk product/category/subcategory updates
- small-portion variants
- kitchen menu application
- menu refetch/broadcast

### useTables
State/functions related to:
- fixed/active tables
- table notes
- table discounts
- table opened timestamps
- table state persistence
- table presence
- table-specific realtime handling

### useOrders
State/functions related to:
- orders
- draft/remote table order synchronization
- order item updates
- order/table state writes

### useSales
State/functions related to:
- salesHistory
- soldItems
- actionHistory
- sales history realtime and persistence

### useCariler
State/functions related to:
- cariler
- cariHareketler
- cariOdemeler
- cariFaturalar
- cariGecmis
- cari-related realtime and writes

### usePackages
State/functions related to:
- packages
- packageMeta
- paketTeslimatlari
- cariTeslimatBildirimleri
- mutfakHazirNotlar
- package delivery realtime and writes

## Phase 3 — compatibility facade
Keep `useHipposData(scope)` as a compatibility facade temporarily. It composes the domain hooks and returns the same property/function names currently consumed by pages.

Do NOT change DirectSale, Tables, Settings, Products, Cariler, Muhasebe or GunSonu until this phase passes build/runtime verification.

## Phase 4 — page refactor
After the data layer is stable, refactor the largest pages in this order:

1. DirectSale
2. Tables
3. Settings
4. Cariler
5. Muhasebe
6. GunSonu
7. Products

## Safety rules
- Never merge this branch into `main` automatically.
- Never change Supabase schema/columns as part of this refactor.
- Preserve realtime subscriptions and broadcast behavior.
- Preserve the public return shape of `useHipposData` during the compatibility phase.
- One domain extraction per commit.
- Build/test after every domain extraction.
- If a change requires altering a page, stop the domain refactor and isolate that change in a separate commit.
