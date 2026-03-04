# LinenOps — Product Requirements Document

## 1. Executive Summary

LinenOps is a tablet-first web application for managing bin tracking and logistics at a commercial laundry operation. The application provides real-time visibility into where every linen cart (bin) is in its lifecycle — from clean and staged at the plant, to loaded on the truck, delivered to a customer, picked up soiled, received back at the plant, and processed.

The system replaces pen-and-paper logistics and disconnected Google Forms/Sheets with a unified, scannable, real-time tracking platform. Every bin is barcoded (Code 128), and every status change is captured by scanning — creating a complete audit trail of bin movement across the operation.

**MVP Goal:** Deliver a tablet-based bin scanning and status tracking application backed by Supabase, enabling plant staff and the driver to track bin locations in real time across the full bin lifecycle.

---

## 2. Mission

**Mission Statement:** Provide real-time visibility into linen bin movement across the entire laundry operation, replacing manual tracking with barcode-driven status updates.

### Core Principles

1. **Scan-First** — Every status change is triggered by a barcode scan. If it wasn't scanned, it didn't happen.
2. **Tablet-Native** — Designed for tablet use in the field and on the plant floor. Big tap targets, minimal typing.
3. **Operational Truth** — The system is the single source of truth for where bins are and who has them.
4. **Event-Sourced** — Never overwrite status; append scan events. Full audit trail by design.
5. **Incremental Value** — Start with bin tracking, then layer on route management, invoicing, wash tracking, and dashboards over time.

---

## 3. Target Users

### Primary Persona: Driver

- **Who:** Single full-time driver making daily delivery and pickup rounds
- **Device:** Tablet (browser-based)
- **Workflow:** Loads bins at the plant, delivers to customers, picks up soiled bins, returns to plant
- **Needs:** Fast scanning, minimal taps, clear indication of what to do at each stop
- **Pain Points:** Currently pen-and-paper; no digital record of deliveries or pickups

### Secondary Persona: Production Staff

- **Who:** Staff at the laundry plant handling receiving, processing, and staging
- **Device:** Tablet or desktop (browser-based)
- **Workflow:** Receives soiled bins off the truck, moves bins through wash/iron/fold, stages clean bins
- **Needs:** Quick scan to update bin status, visibility into what's coming in and what's ready to go
- **Pain Points:** No visibility into how many bins are at customers vs. in-house

### Tertiary Persona: Owner/Operator

- **Who:** Business owner overseeing the full operation (has full access to all features)
- **Device:** Desktop or tablet (browser-based)
- **Workflow:** Monitors bin locations, manages customers, oversees driver activity; will eventually manage invoicing and logistics through the same system
- **Needs:** Dashboard showing the state of the operation at a glance; customer management; long-term path to unified invoicing and logistics
- **Pain Points:** Currently no consolidated view; data lives in disconnected Google Sheets and Forms

---

## 4. Business Context

### Customer Types

- Hotels (full-service)
- Limited-service hotels
- Massage Envy locations
- Hand & Stone locations

### Current Systems

| Function | Current Tool | Problem |
|----------|-------------|---------|
| Linen delivery/pickup recording | HTML form → Google Sheet | No real-time visibility; data entry after the fact |
| Invoicing | Manual from Google Sheet | Slow, error-prone reconciliation |
| Wash/process tracking | Separate Google Forms | Disconnected from delivery data |
| Route/logistics | Pen and paper | Can't be shared, optimized, or audited |
| Bin tracking | None | No idea where bins are at any given time |

### Physical Assets

- **Bins:** < 150 barcoded carts (Code 128)
- **Vehicles:** Single delivery truck
- **Personnel:** One full-time driver, plant staff

---

## 5. MVP Scope

### In Scope

**Core Functionality**
- ✅ Register and manage bins (barcode, description, customer assignment)
- ✅ Scan bin barcode via tablet camera to identify bin
- ✅ Update bin status with a single tap after scan
- ✅ Six statuses: `clean_staged`, `loaded`, `delivered`, `picked_up_soiled`, `received_at_plant`, `in_process`
- ✅ Exception statuses: `lost`, `retired`
- ✅ Full scan event log (who, what, when, status change)
- ✅ Customer management: add, edit customers with codes and types
- ✅ Bins permanently assigned to customers
- ✅ Delivery validation: driver selects stop, system shows required bin count, validates scans match the customer
- ✅ Delivery accountability: system tracks how many bins were picked up per customer and ensures that many are delivered back (including empties)
- ✅ Pre-departure checklist: before leaving the plant, driver sees how many bins are needed per customer and scans to confirm all are loaded
- ✅ Dashboard showing bin counts by status and by customer
- ✅ Customer view showing bins currently at each customer
- ✅ Basic authentication (driver vs. production roles, owner has full access)

**Technical**
- ✅ React frontend (Vite build tool)
- ✅ Supabase backend (Postgres database, auth, real-time)
- ✅ Code 128 barcode scanning via tablet camera
- ✅ Hosted on Vercel (accessible via URL on any device)
- ✅ Mobile/tablet-first responsive design

### Out of Scope (Future Phases)

- ❌ Route planning and optimization
- ❌ Invoicing integration
- ❌ Wash/process tracking beyond bin status
- ❌ Par level management
- ❌ Customer portal
- ❌ Offline/intermittent connectivity support
- ❌ SMS or push notifications
- ❌ Reporting and analytics beyond the dashboard
- ❌ Integration with existing Google Sheets/Forms
- ❌ Multi-vehicle support
- ❌ Individual linen item tracking

---

## 6. User Stories

### Driver Stories

1. **As the driver, I want to see a pre-departure checklist showing how many bins I need per customer, so that I load the right bins before leaving.**
   - Checklist shows: Hotel A — 8 bins, Massage Envy B — 5 bins, etc.
   - Scan bins onto truck → system validates they match the expected customers

2. **As the driver, I want to scan bins as I load the truck, so that the system confirms I have everything.**
   - Scan bin → system checks it belongs to a customer on today's route → status changes to `loaded`
   - Warning if a bin doesn't match any customer on the route

3. **As the driver, I want to select my current stop and scan bins for delivery, so that the system validates I'm delivering the right bins.**
   - Select stop (Hotel A) → scan bins → system confirms each bin belongs to Hotel A → status changes to `delivered`
   - System shows progress: "6 of 8 bins delivered" — won't complete stop until all are accounted for

4. **As the driver, I want to scan soiled bins when I pick them up from a customer, so that pickup is recorded.**
   - Scan bin → system confirms bin belongs to this customer → status changes to `picked_up_soiled`

5. **As the driver, I want to see my stop list for the day, so that I know where I'm going and what's expected.**
   - View route with customer names, addresses, and delivery/pickup counts per stop

### Production Stories

6. **As production staff, I want to scan soiled bins off the truck, so that receiving is recorded.**
   - Scan bin → status changes to `received_at_plant`

7. **As production staff, I want to mark bins as in process, so that we know what's being worked on.**
   - Scan bin → status changes to `in_process`

8. **As production staff, I want to mark bins as clean and staged, so that we know what's ready to go out.**
   - Scan bin → status changes to `clean_staged`

### Owner Stories

9. **As the owner, I want to add a new customer and assign their code and type, so that bins can be assigned to them.**
   - Add customer form: name, code, type (hotel, limited_service, massage_envy, hand_and_stone), address

10. **As the owner, I want to see how many bins are at each customer, so that I can identify hoarding or loss.**
    - Dashboard shows bin count per customer with aging

11. **As the owner, I want to see the overall bin distribution, so that I know the state of my operation.**
    - Dashboard shows bins by status: X clean, Y on truck, Z at customers, etc.

12. **As the owner, I want to see that all picked-up bins are being delivered back, so that empties aren't left behind at the plant.**
    - Dashboard shows delivery accountability: bins owed per customer vs. bins loaded/delivered

13. **As the owner, I want to flag a bin as lost or retired, so that it's removed from active tracking.**
    - Mark bin with exception status

---

## 7. Core Architecture

### High-Level Architecture

```
┌─────────────────┐       HTTPS/JSON       ┌─────────────────┐
│                 │ ◄──────────────────► │                 │
│  React + Vite   │                        │    Supabase     │
│   (Frontend)    │                        │   (Backend)     │
│   Vercel        │                        │  Postgres + Auth│
└─────────────────┘                        └─────────────────┘
       │
       ▼
 Tablet Camera
 (Code 128 scan)
```

### Data Model

#### bins
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| barcode | text | Unique Code 128 barcode value |
| description | text | Optional label/description |
| customer_id | uuid | FK to customers — the customer this bin is permanently assigned to |
| current_status | text | Current lifecycle status |
| created_at | timestamp | When bin was registered |
| retired_at | timestamp | When bin was retired (nullable) |

#### customers
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Customer name |
| code | text | Internal customer code/identifier |
| type | text | hotel, limited_service, massage_envy, hand_and_stone |
| address | text | Delivery address |
| created_at | timestamp | When customer was added |

#### scan_events
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| bin_id | uuid | FK to bins |
| status | text | Status set by this scan |
| scanned_by | uuid | FK to auth.users |
| scanned_at | timestamp | When the scan occurred |
| notes | text | Optional notes |

#### Valid Statuses

| Status | Set By | Meaning |
|--------|--------|---------|
| `clean_staged` | Production | Clean, ready for delivery |
| `loaded` | Production / Driver | On the truck |
| `delivered` | Driver | Dropped off at customer |
| `picked_up_soiled` | Driver | Picked up dirty from customer |
| `received_at_plant` | Production | Back at the plant |
| `in_process` | Production | Being washed, ironed, etc. |
| `lost` | Owner | Cannot be located |
| `retired` | Owner | Permanently out of service |

### Key Design Decisions

- **Event-sourced:** `scan_events` is the append-only log of truth. `bins.current_status` is a denormalized convenience field updated on each scan.
- **Scan = status change:** Every scan creates a `scan_event` row and updates the bin's current status.
- **Bins belong to customers:** Each bin is permanently assigned to a customer. This enables delivery validation — the system knows which bins should go where.
- **Pickup-to-delivery accountability:** Because bins are assigned to customers, the system knows exactly how many bins were picked up soiled from each customer, and therefore how many must be delivered back — including empties. The driver's stop view shows required delivery counts and won't allow completing a stop until all bins are accounted for. This prevents the common problem of empty carts being left behind at the plant.
- **No individual linen tracking:** The bin is the unit of tracking. What's inside the bin is outside scope for MVP.
- **Logistics is a core goal:** While MVP focuses on bin tracking, the data model and workflows are designed to support route management and invoicing in future phases.

---

## 8. Features

### 8.1 Barcode Scanning

**Purpose:** Identify bins quickly via tablet camera

**Implementation:**
- Code 128 scanning via `html5-qrcode` or `quagga2` library
- Camera viewfinder on the main scan screen
- Audible/haptic feedback on successful scan
- Scanned barcode looks up the bin and shows current status
- If barcode is unknown, prompt to register new bin

### 8.2 Status Update

**Purpose:** Advance a bin through its lifecycle

**Workflow:**
- Scan bin → see current status → tap new status → confirm
- Valid transitions are guided (suggest the logical next status)
- Delivery requires selecting a stop/customer first; system validates bin belongs to that customer
- Each update creates a scan_event and updates the bin record

### 8.3 Customer Management

**Purpose:** Maintain the customer roster

**Operations:**
- Add new customer with name, code, type, and address
- Edit customer details
- View all customers with bin counts
- Assign/reassign bins to customers

**Customer Types:**
- Hotel (full-service)
- Limited service
- Massage Envy
- Hand & Stone

### 8.4 Delivery Accountability

**Purpose:** Ensure every bin picked up gets delivered back — no empties left behind

**How It Works:**
- The system knows how many bins are assigned to each customer
- When soiled bins are picked up, the system tracks the obligation: those bins (or equivalent clean ones) must go back
- Pre-departure checklist shows bins needed per customer on the route
- Stop view shows delivery progress (e.g., "6 of 8 bins delivered")
- Stop cannot be marked complete until all expected bins are scanned
- Dashboard surfaces any delivery shortfalls

### 8.5 Dashboard

**Purpose:** Bird's-eye view of the operation

**Displays:**
- Bin count by status (clean_staged: 45, loaded: 12, delivered: 60, etc.)
- Bins by customer (Customer A: 15 bins, Customer B: 8 bins)
- Delivery accountability: bins owed per customer vs. bins loaded/delivered
- Bins aging at customer (delivered > X days ago)
- Recent scan activity feed

### 8.6 Customer View

**Purpose:** See what a specific customer has

**Displays:**
- All bins assigned to the customer and their current status
- Delivery history
- Average turnaround time

### 8.7 Bin Registry

**Purpose:** Manage the fleet of bins

**Operations:**
- View all bins with current status
- Register a new bin (scan barcode + add description)
- Mark bin as lost or retired
- View full scan history for any bin

---

## 9. Technology Stack

### Frontend

| Component | Technology |
|-----------|------------|
| Framework | React 18+ |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Barcode Scanning | html5-qrcode or quagga2 |
| Routing | react-router-dom |
| State/Data | Supabase JS client + React context |

### Backend

| Component | Technology |
|-----------|------------|
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| Real-time | Supabase Realtime subscriptions |
| API | Supabase auto-generated REST API |
| Hosting | Supabase cloud (free tier) |

### Infrastructure

| Component | Technology |
|-----------|------------|
| Frontend Hosting | Vercel (free tier) |
| Source Control | GitHub |
| CI/CD | Vercel auto-deploy from GitHub |

---

## 10. Security & Configuration

### Authentication

- Supabase Auth with email/password
- Three roles: `driver`, `production`, `owner`
- Owner has full access to all features (dashboard, customer management, bin registry, settings)
- Production can access scan screen, plant workflow, and production dashboard
- Driver can access scan screen, route/stop view, and delivery checklist
- Role stored in Supabase user metadata or a `profiles` table

### Environment Variables

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Row Level Security

- Supabase RLS policies to ensure authenticated access
- All authenticated users can read bins and customers
- All authenticated users can insert scan_events
- Only owner can manage customers (add, edit)
- Only owner can modify bins (register, retire, reassign)
- Driver and production can update bin status via scanning

---

## 11. Implementation Phases

### Phase 1: Foundation

**Goal:** Database schema, auth, and basic bin management

**Deliverables:**
- Supabase project set up with tables and RLS
- React app scaffolded with Vite + Tailwind
- Supabase auth integration (login screen)
- Bin registry: list, register, view detail
- Deployed to Vercel

**Validation:** Can log in, see bins, add a new bin manually

### Phase 2: Scanning & Status

**Goal:** Core scanning workflow

**Deliverables:**
- Camera-based Code 128 scanning
- Scan → identify bin → show status → update status flow
- Customer selection on delivery
- Scan events being recorded
- Basic scan history per bin

**Validation:** Driver can scan a bin and update its status on a tablet

### Phase 3: Dashboard & Views

**Goal:** Operational visibility

**Deliverables:**
- Dashboard with bin counts by status
- Customer view with current bin inventory
- Aging alerts for bins at customers too long
- Recent activity feed
- Real-time updates via Supabase subscriptions

**Validation:** Manager can see the state of the operation at a glance

### Phase 4: Polish & Driver Workflow

**Goal:** Smooth daily-use experience

**Deliverables:**
- Driver route/stop list view
- Batch scanning (scan multiple bins, apply same status)
- Loading and error states
- Audible/haptic scan feedback
- Responsive refinements for tablet

**Validation:** Driver can complete a full day's route using only the tablet

---

## 12. Future Considerations

### Near-Term (Post-MVP)

- **Route optimization** — Order stops efficiently, integrate with maps
- **Invoicing integration** — Generate invoices from delivery data
- **Wash/process tracking** — More granular plant workflow
- **Par level management** — Set target bin counts per customer, alert on variance
- **Offline support** — Cache scans locally, sync when connectivity returns

### Long-Term

- **Customer portal** — Customers can see their own bin status and history
- **Multi-vehicle support** — Track which truck bins are on
- **Reporting & analytics** — Turnaround time, delivery frequency, loss rates
- **Integration with existing Google Sheets** — Bridge current invoicing workflow
- **Mobile app** — Native iOS/Android if browser limitations become an issue
- **Individual linen tracking** — RFID or per-item barcoding (significant scope increase)

---

## 13. Success Criteria

### MVP Success Definition

The MVP is successful when:
1. Every bin's location is known at all times
2. The driver can complete a full route using the tablet app
3. Plant staff can scan bins through receiving and processing
4. The manager can see a real-time dashboard of bin distribution
5. The paper route sheet is no longer needed

### Quality Indicators

- Barcode scan success rate > 95% in normal conditions
- Status update completes in under 2 seconds
- Dashboard loads in under 3 seconds
- System handles 150 bins and ~500 scan events per day without issue
- Works reliably on tablet Chrome/Safari

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Camera scanning unreliable** | Driver can't use the app | Test multiple scanning libraries; add manual barcode entry as fallback |
| **Tablet connectivity gaps** | Scans lost on the road | Future: offline queue. MVP: manual entry fallback |
| **Driver adoption resistance** | App doesn't get used | Design for minimal taps; must be faster than pen and paper |
| **Barcode label damage** | Bin can't be identified | Manual entry fallback; re-label process |
| **Scope creep** | MVP never ships | Strict phase boundaries; defer features explicitly |
| **Supabase free tier limits** | Service interruption | Monitor usage; upgrade plan if needed (unlikely at this scale) |

---

## 15. Appendix

### Bin Lifecycle Diagram

```
                    ┌──────────────┐
                    │ clean_staged │◄──────────────────────┐
                    └──────┬───────┘                       │
                           │ scan: load onto truck         │
                           ▼                               │
                    ┌──────────────┐                       │
                    │    loaded    │                       │
                    └──────┬───────┘                       │
                           │ scan: deliver to customer     │
                           ▼                               │
                    ┌──────────────┐                       │
                    │  delivered   │                       │
                    └──────┬───────┘                       │
                           │ scan: pick up soiled          │
                           ▼                               │
                  ┌────────────────────┐                   │
                  │ picked_up_soiled   │                   │
                  └────────┬───────────┘                   │
                           │ scan: receive at plant        │
                           ▼                               │
                 ┌─────────────────────┐                   │
                 │ received_at_plant   │                   │
                 └─────────┬───────────┘                   │
                           │ scan: begin processing        │
                           ▼                               │
                    ┌──────────────┐                       │
                    │  in_process  │───────────────────────┘
                    └──────────────┘  scan: done, clean & staged

  Exception exits from any status:
  ─── lost
  ─── retired
```

### Barcode Specification

- **Format:** Code 128
- **Count:** < 150 bins
- **Labels:** Physically affixed to each bin/cart
- **Scanning:** Tablet camera via browser-based scanning library
