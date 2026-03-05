# LinenOps — Product Requirements Document V2

## 1. Executive Summary

LinenOps is a comprehensive, tablet-first operations platform for White Sail Linen, a commercial laundry serving hotels, limited-service hotels, and wellness locations (Massage Envy, Hand & Stone) across the Atlanta metro area. The platform unifies bin tracking, logistics, wash production, linen production, and delivery into a single real-time system — replacing disconnected Google Forms, Google Sheets, paper route logs, and manual invoicing workflows.

Every cart is barcoded (Code 128), every status change is scan-driven, every wash load is logged, and every production sheet is digitized. LinenOps is the single source of truth for the entire operation — from the moment soiled linen arrives at the plant to the moment clean linen is delivered to the customer's shelf.

**Live URL:** Hosted on Vercel, accessible from any device at the company's Vercel domain.

---

## 2. Mission

**Mission Statement:** Digitize and unify the entire White Sail Linen operation — bin tracking, logistics, washing, production, and invoicing — into one tablet-native platform that provides real-time visibility and eliminates paper-based processes.

### Core Principles

1. **Scan-First** — Every bin status change is triggered by a barcode scan. If it wasn't scanned, it didn't happen.
2. **Tap-First** — Minimize typing. Every form is designed around tappable selections — customer logos, washer icons, cycle buttons. The only typed inputs are weights and counts.
3. **Tablet-Native** — Designed for tablet use on the plant floor, in the truck, and at customer sites. Large tap targets, large logos, readable across the room.
4. **Logo-Driven** — Customer logos replace text names throughout the UI. The team identifies accounts by logo, not by reading names.
5. **Event-Sourced** — Never overwrite data; append events. Full audit trail for scans, washes, and production by design.
6. **Role-Based** — Each user role sees only what they need. Drivers see routes and scanning. Production sees washing, bins, and production. Owners see everything.
7. **Operational Truth** — The system is the single source of truth for where bins are, what's been washed, what's been produced, and what's been delivered.

---

## 3. Target Users

### Owner/Operator
- **Who:** Theodore (business owner), full access to all features
- **Device:** Desktop and tablet
- **Sees:** Dashboard, Scan, Bins, Wash Form, Wash Info, Customers, Routes
- **Key needs:** At-a-glance plant overview, analytics, customer management, route management, full system configuration

### Drivers (Dennin, Justin, Mark, Generic Driver)
- **Who:** Delivery drivers making daily rounds
- **Device:** Tablet in the truck
- **Sees:** Scan, Routes (Today's Route with stop-by-stop workflow)
- **Key needs:** Route for the day, barcode scanning at each stop, par-based wellness delivery tracking, minimal taps

### Production Staff
- **Who:** Plant floor staff handling receiving, washing, processing, staging
- **Device:** Tablet on the plant floor
- **Sees:** Scan, Bins, Wash Form, Wash Info
- **Key needs:** Fast wash logging (tap washer → tap customer → tap cycle → enter weight), bin status scanning, production form entry

---

## 4. Business Context

### Company
White Sail Linen — commercial laundry operation based in the Atlanta metro area.

### Customer Types

| Type | Description | Examples |
|------|-------------|---------|
| Hotel (Full-Service) | Full-service hotels with diverse linen SKUs | Epicurean Atlanta, Hotel Forty-Five |
| Limited Service | Budget/chain hotels with standard linen | Hampton Inn Locust Grove, Motel 6 McDonough, EconoLodge Union City, Super 8 Locust Grove, Dorsen Stay, Black Swan, IPIC Colony Square, Minty Living |
| Wellness | Massage/spa locations under a single parent customer, twin sheets only | 23 Hand & Stone, Massage Envy, and LaVida locations |
| Specialty | Other account types as needed | (future) |

### Wellness Locations (23 locations under "Wellness" parent customer)
Each location has a weekly par (sheets/week) and the driver counts the shelf to determine delivery amount.

**Hand & Stone:** Alpharetta 1 (450), East Cobb (650), McDonough (650), Peachtree City (480), Sandy Springs (380), Alpharetta 2 (600), Johns Creek (900), Canton (430), Kennesaw (650), Sugar Hill (280), Smyrna (250), Chamblee (240), Cumming (550), Marietta (via LaVida, 350)

**Massage Envy:** Acworth (300), Woodstock (400), Midtown (800), Howell Mill (600), Canton (600), Flowery Branch (320), Mall of Georgia (530), Peachtree Corner (350), Sandy Plains (360)

### Physical Assets

| Asset | Details |
|-------|---------|
| Bins/Carts | ~150 barcoded carts (Code 128) |
| Trucks | 2 — 16' Truck and 26' Truck |
| Washers | 6 — W1 (200 lbs), W2 (200 lbs), W3 (60 lbs), W4 (80 lbs), W5 (100 lbs), W6 (200 lbs) |
| Wash Cycles | 10-15 cycles (to be named) |
| Personnel | Owner, 3 named drivers + 1 generic, production staff (shared account) |

### Systems Replaced

| Function | Previous Tool | LinenOps Module |
|----------|--------------|-----------------|
| Bin tracking | None | Bins + Scan |
| Route/logistics | Pen and paper | Routes |
| Delivery recording | HTML form → Google Sheet | Routes (driver stop workflow) |
| Wash tracking | Separate Google Forms | Wash Form + Wash Info |
| Production/cart sheets | HTML form → Google Sheet + printer | Production Form + Production Info (planned) |
| Invoicing | Manual from Google Sheet | Invoicing (planned, fed by production data) |

---

## 5. System Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite, Tailwind CSS |
| Backend | Supabase (Postgres + Auth + Storage + RLS) |
| Barcode Scanning | html5-qrcode (Code 128 via tablet camera) |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| Frontend Hosting | Vercel (auto-deploy from GitHub) |
| Logo Storage | Supabase Storage (`logos` bucket, public) |
| Source Control | GitHub (Tloles/LinenOps) |

### Architecture Diagram

```
┌─────────────────────┐     HTTPS/JSON     ┌──────────────────────┐
│                     │ ◄────────────────► │                      │
│  React + Vite       │                     │  Supabase            │
│  (Vercel)           │                     │  - Postgres DB       │
│                     │                     │  - Auth              │
│  Roles:             │                     │  - Storage (logos)   │
│  - Owner (all)      │                     │  - RLS policies      │
│  - Driver (scan +   │                     │  - record_scan() fn  │
│    routes)          │                     │                      │
│  - Production (scan │                     └──────────────────────┘
│    + bins + wash)   │
└─────────────────────┘
       │
       ▼
 Tablet Camera (Code 128 barcode scanning)
 Production Printer (cart sheet printing)
```

---

## 6. Database Schema

### Core Tables

**profiles** — Extends Supabase auth.users with role (owner/driver/production) and name.

**customers** — Name, code, type (hotel/limited_service/wellness/specialty), address, logo_url. Logos stored in Supabase Storage.

**bins** — Barcode, description, customer_id (permanent assignment), current_status, retired_at. Retired bins excluded from all counts and views.

**scan_events** — Append-only log. bin_id, status, scanned_by, truck_id (when loaded), timestamp. Full audit trail.

**trucks** — 16' Truck and 26' Truck. Referenced by scan_events when status is "loaded".

### Logistics Tables

**routes** — Named routes assigned to a day of the week. Multiple routes per day allowed. Flexible: some days have 1 route, some have 2-3.

**route_stops** — Ordered stops within a route. Each stop is either a customer_id (hotel stop) or a location_id (wellness stop). Drag-and-drop reorderable.

**route_progress** — Tracks which stops are completed per date.

**locations** — Wellness sub-locations under the Wellness parent customer. Each has weekly_par and deliveries_per_week. Used for par-based delivery calculations.

**delivery_logs** — Records shelf count and delivery amount at each wellness stop.

### Wash Tables

**washers** — 6 washers with name and capacity_lbs.

**wash_cycles** — 10 placeholder cycles (to be named with real cycle names).

**wash_logs** — One entry per wash load: washer_id, customer_id, wash_cycle_id, weight_lbs, washed_by, washed_at. Timestamped for daily/range queries.

### Production Tables (Planned)

**hotel_skus** — Master SKU list: Duvet King, Duvet Queen, Flat Sheet King, Flat Sheet Queen, Pillow Case King, Pillow Case Queen, Fitted Sheet, Bath Towel, Hand Towel, Wash Cloth, Bath Mat, Pool Towel, Comforter, Shower Curtain, Pillow, Blanket, Robe, Bed Skirt. Categorized as Flatwork, Towels, or Special Items.

**production_logs** — One entry per cart: customer_id, bin_id, date, total_weight, cart_weight, linen_weight.

**production_log_items** — Line items: production_log_id, sku_id, quantity.

### Invoicing Tables (Future)

To be designed. Will aggregate production_log_items by customer and date range to generate invoices. Replaces manual Google Sheets invoicing.

---

## 7. Features — Built

### 7.1 Dashboard (Owner only)

The owner's landing page providing at-a-glance operational visibility.

**Plant Overview:** Two cards showing bins with "Soiled" (received_at_plant) and "In Process" status, broken down by customer logo with counts.

**By Location:** "At Plant" card showing all bins at the plant by customer logo. Per-truck cards ("16' Truck", "26' Truck") showing bins loaded on each truck by customer logo. Truck assignment captured when bins scanned to "loaded" status.

**By Status:** Each active status (clean_staged, loaded, delivered, picked_up_soiled, received_at_plant, in_process) as a section with customer logos and counts. Only statuses with bins shown.

**Design:** Dark navy (#1B2541) brand color from White Sail logo. Customer logos at 200px. Numbers and labels same font size. Professional, minimal, readable across the room.

### 7.2 Scanning

Camera-based Code 128 barcode scanning with manual entry fallback. Scan a bin → see its current status, customer logo, and description → tap to update status.

**Truck selection:** When scanning to "loaded" status, a truck selector appears (16' Truck / 26' Truck) before confirming.

**Status workflow:** Suggested next status shown as a large primary button. All other statuses available as secondary buttons.

**Role-specific context below the scanner:**
- Driver sees: By Location (At Plant + per-truck breakdown)
- Production sees: By Status, then By Location below
- Owner sees: Both

### 7.3 Bin Management

**Bin List:** All active bins (retired excluded) with barcode, description, customer logo, current status badge. Register new bins (owner + production).

**Bin Detail:** Full bin info, scan history, change customer assignment, remove bin (with confirmation dialog + undo capability).

**Retired bins:** Excluded from all counts and views. Can be restored via "Undo Remove" on the bin detail page.

### 7.4 Customer Management (Owner only)

**Customer List:** All customers with logos (48px), code, type, bin count. Click to view customer detail.

**Customer Detail:** Large logo, name, code, type, address. Edit button. List of all active bins assigned to this customer with status. For Wellness customer, shows all linked locations with par levels.

**Logo Upload:** File upload in the add/edit customer form. Uploads to Supabase Storage `logos` bucket. Logo URL saved on customer record.

### 7.5 Routes (Owner manages, Drivers consume)

**Route Management (Owner):** 7 day tabs (Mon-Sun). Each day can have 0, 1, or multiple routes. Create routes per day, name them, drag-and-drop reorder stops. Add stops from dropdown (customers or wellness locations). Edit route names inline. Delete routes and stops.

**Driver Route Selection:** Driver logs in → sees today's routes as tappable cards → selects their route → sees ordered stop list. Stops worked sequentially.

**Stop Types:**
- Hotel/Limited Service: Scan bins for delivery and pickup, mark complete.
- Wellness: See location name + delivery par (weekly_par / deliveries_per_week). Driver enters shelf count → app calculates delivery amount → driver confirms → delivery_log created.

### 7.6 Wash Form (Owner + Production)

Tablet-optimized, tap-first wash logging. Used dozens of times per day.

**Form flow:** Tap washer (6 buttons with WashingMachine icon, capacity shown) → Tap customer (logo grid, 200px, 4 per row) → Tap wash cycle → Enter weight (only typed input) → Log Wash.

**Smart defaults:** After logging, washer and cycle stay selected (common to run same washer/cycle consecutively). Customer and weight reset.

**Recent Washes table:** Shows last 24 hours in reverse chronological order. Columns: Time, W (W1/W2 etc.), Customer (logo 120px), Cycle, Lbs. Edit and Delete on each row for corrections.

### 7.7 Wash Info (Owner + Production)

Analytics dashboard for wash data.

**Washer Utilization (Today):** 6 washer cards in a row with WashingMachine icons. Color-coded by utilization (green/yellow/red). Shows loads, lbs, and utilization percentage.

**Filters:** Date range picker, customer filter, washer filter. All sections update based on filters.

**Summary Stats:** Total loads, total lbs, average lbs/load.

**By Customer:** Customer logos with load count and total lbs for filtered range.

**By Cycle:** Wash cycle breakdown with load count and total lbs.

---

## 8. Features — Planned

### 8.1 Production Form (Next Priority)

Digital replacement for the current HTML cart sheet form. One form per cart.

**Form flow:** Select customer (logo tap) → Enter cart number (bin assignment) → SKU grid organized by category (Flatwork, Towels, Special Items) with tappable count fields → Total weight / cart weight / linen weight → Submit & Print.

**On submit:**
1. Saves production_log + production_log_items to database
2. Triggers browser print of a formatted cart sheet matching the current physical form layout
3. Links the production log to the bin/cart in the system

**Print format:** Matches current cart sheet design — White Sail logo, client name, date, cart number, SKU counts in a table, weights at bottom. Bilingual (English/Spanish) labels.

**SKU List (same for all hotel customers):**

Flatwork: Duvet King, Duvet Queen, Flat Sheet King, Flat Sheet Queen, Pillow Case King, Pillow Case Queen, Fitted Sheet

Towels: Bath Towel, Hand Towel, Wash Cloth, Bath Mat, Pool Towel

Special Items: Comforter, Shower Curtain, Pillow, Blanket, Robe, Bed Skirt

### 8.2 Production Info

Analytics dashboard for production data. Mirrors Wash Info pattern.

**Planned views:** Production by customer (total pieces, weight, over time), production by SKU (which items are being produced most), daily production output trends.

### 8.3 Invoicing

Generate invoices from production data. Aggregates production_log_items by customer and date range.

**Planned flow:** Select customer → select date range → system pulls all production logs → generates invoice with line items (SKU × quantity × price) → export/print.

Replaces manual Google Sheets invoicing entirely.

### 8.4 Additional Planned Features

- **Code cleanup pass** — Remove debug console.logs, dead code, ensure consistent styling
- **Batch scanning** — Scan multiple bins and apply same status
- **Aging alerts** — Flag bins at customers too long
- **Offline support** — Cache scans locally, sync when connectivity returns
- **Customer portal** — Customers see their own delivery history
- **Reporting & analytics** — Turnaround time, delivery frequency, loss rates

---

## 9. Role-Based Access

| Feature | Owner | Driver | Production |
|---------|-------|--------|------------|
| Dashboard | ✅ (home page) | ❌ | ❌ |
| Scan | ✅ | ✅ (home page) | ✅ (home page) |
| Bins | ✅ (full edit) | ❌ | ✅ (full edit) |
| Wash Form | ✅ | ❌ | ✅ |
| Wash Info | ✅ | ❌ | ✅ |
| Customers | ✅ (full edit) | ❌ | ❌ |
| Routes | ✅ (manage) | ✅ (today's route) | ❌ |
| Production Form | ✅ (planned) | ❌ | ✅ (planned) |
| Production Info | ✅ (planned) | ❌ | ✅ (planned) |

---

## 10. User Accounts

| Name | Email | Role |
|------|-------|------|
| Theodore | theodoreloles@gmail.com | Owner |
| Mark | mark@wslinen.com | Driver |
| Justin | justin@wslinen.com | Driver |
| Dennin | dennin@wslinen.com | Driver |
| Generic Driver | driver@wslinen.com | Driver |
| Production | production@wslinen.com | Production |

---

## 11. Security & Configuration

### Authentication
- Supabase Auth with email/password
- Roles stored in `profiles` table (not JWT metadata)
- AuthContext fetches role from profiles table after login

### Row Level Security
- All authenticated users can read all data
- Write permissions scoped by role via RLS policies
- `record_scan()` function uses SECURITY DEFINER for atomic scan + status update
- Supabase Storage `logos` bucket: public reads, authenticated uploads/updates

### Environment Variables
```
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=[anon-key]
```

---

## 12. Design System

### Brand
- **Primary color:** Dark navy #1B2541 (from White Sail logo)
- **Header:** Dark navy background with White Sail logo (header-logo.png)
- **Favicon:** White Sail logo (favicon.png)

### Logo-Driven UI
Customer logos replace text names throughout the app. Logos are the primary identifier — the team recognizes accounts by logo, not by name. Text name shown only as fallback when no logo exists.

**Logo sizes by context:**
- Dashboard sections: 200px
- Wash Form customer grid: 200px
- Wash Form recent washes table: 120px
- Customer list: 48px
- Bin list: 24px
- Scan page bin info: 32px

### Typography
- Section headers: Bold, uppercase, navy, tracking-wider
- Count numbers and labels: Same font size (text-4xl typically), displayed as single line (e.g., "4 At Plant")
- Minimal text, maximum visual information

### Washer Icons
- Lucide React `WashingMachine` icon
- 125px on Wash Info, responsive on Wash Form
- Color-coded by utilization: green (light), yellow (moderate), red (heavy)

---

## 13. Bin Lifecycle

```
                ┌──────────────┐
                │ clean_staged │◄──────────────────────┐
                └──────┬───────┘                       │
                       │ scan: load onto truck          │
                       │ (select truck: 16' or 26')     │
                       ▼                               │
                ┌──────────────┐                       │
                │    loaded    │                       │
                └──────┬───────┘                       │
                       │ scan: deliver to customer      │
                       ▼                               │
                ┌──────────────┐                       │
                │  delivered   │                       │
                └──────┬───────┘                       │
                       │ scan: pick up soiled           │
                       ▼                               │
              ┌────────────────────┐                   │
              │ picked_up_soiled   │                   │
              └────────┬───────────┘                   │
                       │ scan: receive at plant         │
                       ▼                               │
             ┌─────────────────────┐                   │
             │ received_at_plant   │                   │
             └─────────┬───────────┘                   │
                       │ scan: begin processing         │
                       ▼                               │
                ┌──────────────┐                       │
                │  in_process  │───────────────────────┘
                └──────────────┘  scan: done → clean_staged

  Exception: retired (removable + restorable via UI)
```

---

## 14. Success Criteria

### Current Success (Achieved)
1. ✅ Every bin's location is known at all times
2. ✅ Real-time dashboard shows plant overview, by location (per truck), by status
3. ✅ Plant staff can log washes with full washer/customer/cycle/weight tracking
4. ✅ Routes configurable per day with drag-and-drop stop ordering
5. ✅ Role-based access ensures each user sees only what they need
6. ✅ Customer logos used as primary identifiers throughout the UI
7. ✅ Live on Vercel, accessible from any device

### Next Milestones
1. Production Form replaces HTML form → Google Sheets workflow
2. Cart sheet prints from the app
3. Production data feeds invoicing
4. Wash cycle names finalized and entered
5. Full bin inventory registered with real barcodes
6. Drivers completing routes entirely through the app

### Quality Indicators
- Barcode scan success rate > 95% in normal conditions
- Wash log entry in under 10 seconds (tap-tap-tap-type-tap)
- Dashboard loads in under 3 seconds
- System handles 150 bins, ~500 scan events/day, ~50 wash logs/day
- Works reliably on tablet Chrome/Safari
