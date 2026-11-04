# POS & AR System — Localhost Defense Runbook & Demo Guide

This runbook contains the exact steps and commands to launch, configure, and demonstrate the **PHP + MySQL (XAMPP) Point of Sale (POS) & Accounts Receivable (AR) System** on **LOCALHOST** for final defense. It requires **no active internet connection** once local setup is complete.

---

## 1. System Requirements & Local Prerequisites

| Component | Path / Requirement | Status / Note |
|---|---|---|
| **PHP Engine** | `C:\xampp\php\php.exe` (PHP 8.0.30+) | `pdo_mysql` extension enabled (default in XAMPP) |
| **MySQL / MariaDB** | XAMPP MySQL on `localhost:3306` | Start **MySQL** from the XAMPP Control Panel; use phpMyAdmin at `http://localhost/phpmyadmin` |
| **Web Browser** | Google Chrome or Microsoft Edge | Supports kiosk/app mode for zero-mouse cashier testing |

---

## 2. Database Setup & Migrations

### Option A: Initialize Database from Scratch (Clean Setup)
Start **MySQL** in the XAMPP Control Panel, then open PowerShell from the project folder (`masterfile`):

```powershell
# 1. Create the database
C:\xampp\mysql\bin\mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS pos_ar_system CHARACTER SET utf8mb4"

# 2. Import the base schema and seed data
C:\xampp\mysql\bin\mysql.exe -u root pos_ar_system < database\pos_ar_system.sql

# 3. Apply the revisions (supervisor/cashier accounts, shifts, drawer events, held transactions, wholesale prices, ...)
C:\xampp\mysql\bin\mysql.exe -u root pos_ar_system < database\revisions_mysql.sql

# 4. Apply WP-1 → WP-5 migrations (PostgreSQL equivalents in database\migrations\*.pg.sql)
C:\xampp\mysql\bin\mysql.exe -u root pos_ar_system < database\migrations\wp1_shifting_cash_management.mysql.sql
C:\xampp\mysql\bin\mysql.exe -u root pos_ar_system < database\migrations\wp2_terminal_cashier_binding.mysql.sql
C:\xampp\mysql\bin\mysql.exe -u root pos_ar_system < database\migrations\wp3_hold_resume_logic.mysql.sql
C:\xampp\mysql\bin\mysql.exe -u root pos_ar_system < database\migrations\wp4_search_and_discounts.mysql.sql
C:\xampp\mysql\bin\mysql.exe -u root pos_ar_system < database\migrations\wp5_ar_overdue_and_memos.mysql.sql
```

(You can also import both `.sql` files through phpMyAdmin → `pos_ar_system` → **Import**, base schema first.)

### Option B: Update an Existing Database
If `pos_ar_system` already exists, only run the revisions script (it is safe to re-run):

```powershell
C:\xampp\mysql\bin\mysql.exe -u root pos_ar_system < database\revisions_mysql.sql
```

### Verify Database Tables:
Run this quick query in phpMyAdmin or the `mysql` client:
```sql
SHOW TABLES;
```
Ensure `tblshifts`, `tbldrawer_events`, `tblauthorization_log`, `tblpayment_allocations`, `tblheld_transactions`, and `tblwholesale_prices` are present.

---

## 3. Local Environment Configuration

1. The API reads `api/config.local.php`. If it does not exist, copy the example:
   ```powershell
   Copy-Item api\config.local.php.example api\config.local.php
   ```

2. Open `api/config.local.php` and verify your XAMPP MySQL credentials:
   ```php
   return [
     'db_host'   => 'localhost',
     'db_port'   => 3306,
     'db_name'   => 'pos_ar_system',
     'db_user'   => 'root',
     'db_pass'   => ''               // XAMPP default: empty password for root
   ];
   ```

---

## 4. Starting the Local PHP Server

Run the built-in PHP server from the workspace root:

```powershell
cd path\to\masterfile
C:\xampp\php\php.exe -S localhost:8000
```

> **Note:** Leave this terminal running in the background throughout the defense demo.

---

## 5. Launching the POS Terminal in Defense Kiosk Mode

To demonstrate the **"Gaisano-Style" zero-mouse cashier register** without browser shortcut conflicts (like F1 opening Chrome Help, F3 opening Find, F5 refreshing, or F11 toggling fullscreen), launch Chrome in kiosk app mode:

```powershell
# Google Chrome Kiosk Mode:
start chrome.exe --kiosk --app=http://localhost:8000/login.html

# OR Standard App Window Mode (Frameless window):
start chrome.exe --app=http://localhost:8000/login.html

# (Optional: Microsoft Edge App Mode)
start msedge.exe --app=http://localhost:8000/login.html
```

*(To exit Kiosk Mode at any time, press `Alt + F4` or `Esc`)*

---

## 6. Seed Accounts & Roles

| Role | Username | Password | Purpose |
|---|---|---|---|
| **Supervisor** | `supervisor` | `supervisor123` | Authorizes voids, line overrides, cash float, and cash lift |
| **Cashier** | `cashier` | `cashier123` | Operates cashier terminal, scanning, tender, hold/resume |
| **Admin** | `admin` | `admin123` | Full system configuration, roles, terminals, products |
| **Manager** | `RC` | `manager123` | Oversees products, terminals, loyalty cards, AR, sales, and reports |
| **AR Staff** | `ar_staff` | `ar123` | Handles credit limits, invoices, and FIFO collections |
| **AR Staff backup** | `pedro` | `ar123` | Backup Accounts Receivable Staff account |

---

## 7. Step-by-Step Defense Demo Script

### Demo 1: Mandatory Beginning Float & Shift Protection (WP-1 1A)
1. Navigate to `http://localhost:8000/login.html`.
2. Login as `cashier` / `cashier123`.
3. System detects no open shift and immediately displays the **Mandatory Beginning Float** modal.
4. Notice there is **no close "X" button**, and pressing **Esc** or clicking the backdrop does not dismiss the modal. The only exits are entering a valid float (`>= min_opening_float` from `tblsystem_settings`, default `₱0.00`) or activating **"Cancel & Logout"** to abandon the session.
5. Type `2000.00` and press **Enter**.
6. Shift is opened in `tblshifts` with status `open` and starting balance ₱2,000.00 (`event_type = 'opening_float'` in `tbldrawer_events`).
7. Server-side enforcement: Any direct API call to `createSale`, `holdTransaction`, or `recordDrawerEvent` without an active open shift is rejected with HTTP 403.

### Demo 1B: Terminal & Cashier Binding + Localhost Multi-Terminal Simulation (WP-2)
1. **No Counter Picker on Cashier Login**:
   - Navigate to `http://localhost:8000/login.html`. Notice there is **no counter/terminal dropdown** on the login screen.
2. **Simulating 2 Terminals on 1 Localhost PC at Defense**:
   - **Method A (URL Query Parameter — Fastest for Defense)**:
     - Window 1 (Counter 1): `http://localhost:8000/login.html?terminal=1` (or `?terminal=DEV-TERM-01`)
     - Window 2 (Counter 2, Incognito / second browser profile): `http://localhost:8000/login.html?terminal=2` (or `?terminal=DEV-TERM-02`)
   - **Method B (Device Token Cookie / `localStorage`)**:
     - Persists `pos_device_token` automatically when visiting `?device_token=DEV-TERM-01` or `?terminal=1`.
   - **Method C (Admin Provisioning Screen)**:
     - Login as `admin` / `admin123` → **POS Terminals** (`pos_terminal.html`) to register terminal machine identifiers/tokens (`machine_identifier`, `device_token`) and **Users** (`user.html`) to bind each Cashier account to an `assigned_terminal_id`.
3. **Cashier Terminal Lock & Supervisor/Admin Exemption Rule**:
   - `cashier` is bound to **Counter 1** (`assigned_terminal_id = 1`); `maria` is bound to **Counter 2** (`assigned_terminal_id = 2`).
   - Logging in as `cashier` on Counter 2 (`login.html?terminal=2`) is **rejected (HTTP 403)**: *"This account is assigned to Counter 1 (Terminal 1)."*
   - **Supervisor / Admin / Manager / AR Staff Rule**: Exempt from single-terminal lock (`assigned_terminal_id = NULL`) so they can inspect or authorize across any counter.

### Demo 2: Quantity-First Scanning Workflow ("Una ang Quantity, Ayha Scanning")
1. At the register (`sales.html`), notice cursor is automatically placed in the **QTY [F3]** field.
2. Type `5` and press **Enter**.
3. Cursor instantly jumps to the **SCAN BARCODE** field.
4. Type barcode `00000001` (or scan barcode) and press **Enter**.
5. Product is added to the cart with **Quantity: 5**.
6. The Quantity field **automatically resets to 1** and cursor remains ready in the barcode field for the next scan.
7. Repeat without typing quantity: press Enter or scan barcode `00000002` -> item adds with default quantity 1.

### Demo 3: Product Lookup (Product ID Hidden from Cashier)
1. Press **F2** to open Product Lookup.
2. Notice the table headers: only **Barcode**, **Product Name**, and **Price** are shown. The internal `product_id` is completely hidden from the cashier.
3. Type a product name (e.g. `Milk` or `Coffee`).
4. Use **Arrow Down** and **Arrow Up** to navigate rows.
5. Press **Enter** to add the selected product to the cart.

### Demo 4: Supervisor Authorization for Protected Actions
1. **Void Line Item**:
   - Navigate cart lines using **Arrow Down / Arrow Up**.
   - Press **F4** to void the selected item.
   - Cashier is blocked by the **Supervisor Override Modal**.
   - Enter `supervisor` and `supervisor123` and press **Enter**.
   - Line is voided. Action is recorded in `tblauthorization_log` (`action_type: void_item`).
2. **Change Cart Item Quantity**:
   - Press **F3** when an item is selected in the cart.
   - Enter new quantity. Supervisor authorization prompt intercepts.
   - Upon supervisor verification, quantity is updated and logged (`action_type: edit_quantity`).
3. **Void Entire Transaction**:
   - Press **F5**.
   - Prompts for supervisor credentials.
   - Upon supervisor verification, cart is emptied and logged (`action_type: void_transaction`).

### Demo 5: Cash Drawer Float & Lift
1. Press **F6** (Float Fund):
   - Enter amount added to drawer (e.g. `500.00`).
   - Supervisor credentials entered.
   - Record created in `tbldrawer_events` (`event_type: 'float'`).
2. Press **F7** (Lift / Drop Fund):
   - Enter amount removed to safe (e.g. `1000.00`).
   - Supervisor credentials entered.
   - Record created in `tbldrawer_events` (`event_type: 'lift'`).

### Demo 6: Tender & Completed Cash Sale Recording
1. Scan items to total ₱450.00.
2. Press **F12** to open the Tender / Payment modal.
3. Select Cash Tender (`C`), type `500.00`, and press **Enter**.
4. System displays Change: `₱50.00`.
5. Press **F12** to complete the sale.
6. Receipt prints.
7. Backend automatically creates a `tbldrawer_events` record with `event_type: 'sale'`, linked to the active shift.

### Demo 6B: Supervisor-Verified End of Shift (EOS) Reconciliation (WP-1 1B)
1. Press **Alt+E** (or click the **End Shift** button in the hotkey dock / shift badge).
2. System requires **Supervisor Override** (`supervisor` / `supervisor123`). Without supervisor credentials, EOS is blocked.
3. Once verified, the **End-of-Shift Reconciliation Modal** displays all 5 required components:
   - **Starting Balance (Opening Float)**
   - **Cash in Hand (Expected)** = `Opening Float + Mid-Shift Floats Added (F6) + Cash Sales - Refunds - Cash Lifts/Drops (F7)` (each component itemized)
   - **Current Float** = `Opening Float + Mid-Shift Floats Added`
   - **Total Posted to AR (Utang) This Shift**: transaction **count** and **sum**
   - **Actual Counted Cash vs Expected**: live **Over / Short / Balanced** variance banner
4. Enter the actual physical cash counted and press **Enter**.
5. Shift closes (`status = 'closed'`), full reconciliation summary is persisted in `tblshifts`, session locks (`$_SESSION['shift_closed_lock'] = true`), and the **Official EOS Report** is displayed for immediate printing (`Enter` / `P`) or reprinting later under **Receipts & Reprint → Shift EOS Reports**.

### Demo 6C: Order Hold & Resume Logic (WP-3)
1. **Hold Sale (`F6`)**:
   - Scan items into the cart, optionally switch to AR Mode (`F8`), select a customer, or configure discounts/tax.
   - Press **F6** (Hold Sale), optionally enter a customer/reference note, and press **Enter**.
   - The server snapshots `cart + customer + saleMode + discounts + taxRate + sukiCard` under a ticket ID (`HOLD-YYYYMMDD-######`) in `tblheld_transactions` bound to `(cashier_user_id, terminal_id, shift_id)`.
   - The active register cart clears immediately for the next customer.
2. **Stock Policy**:
   - **NO stock decrement on hold** — `tblproducts.stock_quantity` is decremented only upon sale completion (`createSale`).
   - **Re-validation on resume**: When a held ticket is resumed (`F10`), the server checks live `stock_quantity` for every line item; if any item's available stock is now less than the held quantity, a keyboard-accessible **Insufficient Stock Warning** popup fires.
3. **Session Isolation ("Original Paired Conditions")**:
   - Held tickets are resumable **ONLY by the same cashier + same terminal + same shift**.
   - Attempting to resume a ticket from a different cashier, different terminal, or after the shift closes is rejected by `api/sales.php` (`HTTP 403`) with an explicit pairing message.
4. **End-of-Shift (EOS) Hold Rule**:
   - **EOS is BLOCKED while open holds exist** for the active shift (both in the UI at `Alt+E` and server-side in `closeShift` with `HTTP 409`). Cashiers must resume & complete or discard (`Del`) all held sales before closing the shift.
5. **Resume Sale (`F10`)**:
   - Press **F10** to open the **Resume Sale** modal listing all tickets held under the current pairing (showing Ticket ID, Time, Item Count, Total, and Customer/Note) with keyboard search (`#held-search-filter`) and `↑`/`↓`/`Enter` navigation.
   - Selecting a ticket restores the full snapshot into the register and removes the ticket from `tblheld_transactions`.

### Demo 6D: PH-Standard Statutory & Custom Discounts (WP-4)
1. **Item-Scope Rule**: Whole-transaction scope on net-of-promo gross total (`G`).
2. **Senior Citizen (`RA 9994`) & PWD (`RA 10754`) — 20% + 12% VAT-Exempt**:
   - Press **Alt+D** to focus `#discount_type`, select **Senior Citizen (20% + VAT-Exempt, RA 9994)** or **PWD (20% + VAT-Exempt, RA 10754)**.
   - Enter the customer's **OSCA / PWD ID Number** in `#discount_id_number` (mandatory per BIR; checkout is blocked if blank).
   - **Math**:
     - `VAT-Exempt Sales = round(G / 1.12, 2)`
     - `Less 12% VAT (Exempt) = round(G - VAT-Exempt Sales, 2)`
     - `Less 20% SC/PWD Discount = round(VAT-Exempt Sales * 0.20, 2)`
     - `Total Amount Due = round(VAT-Exempt Sales - Less 20% SC/PWD Discount, 2)`
   - All breakdown lines and the OSCA/PWD ID number print on the official receipt and reprint slip.
3. **Custom Discount (`%` or `Fixed PHP`) + Supervisor Gate**:
   - Select **Custom Discount (% or Fixed PHP)**, choose `Percent (%)` or `Fixed (₱)`, type the discount value, and press **Enter**.
   - **Threshold Rule**: Configured in `tblsystem_settings` (`custom_discount_threshold_pct = 10`, `custom_discount_threshold_amt = 100.00`). Any custom discount `> 10%` or `> ₱100.00` triggers the **Supervisor Override Gate** (`supervisor` / `supervisor123`) before it can be applied or tendered.

### Demo 7: AR Payment — FIFO Auto-Allocation
1. Navigate to **Payments & Collections** (`payment.html`).
2. Click **Record FIFO Payment** (or press Pay).
3. Select an AR Customer with open invoices (e.g. `ABC Enterprises`).
4. Notice dynamic exposure card updates with Credit Limit, Total Debt, and Available Credit.
5. Enter a single payment amount (e.g. `₱3,500.00`).
6. Click **Preview Allocation** (or press **Enter**).
7. The **FIFO Cascade Preview** displays:
   - Queue #1 (Oldest invoice) receives payment first until settled.
   - Remaining balance cascades to Queue #2, #3, etc.
   - Preview shows: Current Balance, Amount Applied, Resulting Balance, Resulting Status.
   - Summary shows Total Entered, Total Applied, Unapplied, and New Customer Debt.
8. Press **Enter** to confirm.
9. Backend saves `tblpayment_header`, `tblpayment_allocations`, and `tblpayment_detail` in a single atomic transaction.
10. Customer credit exposure updates immediately.
11. The **Official AR Collection Receipt Modal** pops up with the full breakdown of settled invoices and a Print button.

### Demo 8: AR Overdue Policies, Aging Buckets & Credit/Debit Memos (WP-5)
1. **Configurable AR Due Date (`ar_default_term_days`)**:
   - Every new AR sale automatically receives `due_date = CURRENT_DATE + ar_default_term_days` (default `30` days, configurable in **Payments & Collections → Overdue Policy (`Alt+O`)**), stored in `tblar_invoice.due_date` and printed on the official AR receipt.
2. **Config-Driven Overdue Interest & Penalty Engine (`Alt+O` on `payment.html`)**:
   - Stored in `tblsystem_settings`:
     - `ar_default_term_days` (default `30`)
     - `ar_interest_mode`: `fixed` (simple interest per 30-day overdue period: $I = \text{round}(P \times r \times n, 2)$) vs `compounding` (compounded per 30-day overdue period: $I = \text{round}(P \times ((1 + r)^n - 1), 2)$, where $n = \max(1, \lfloor \text{days\_overdue} / 30 \rfloor)$)
     - `ar_interest_rate_pct` (default `5.00%`)
     - `ar_penalty_mode` (`flat`, `percent`, or `none`) & `ar_penalty_value` (default `₱50.00`)
     - `ar_block_overdue_accounts` (`1` = ON, `0` = OFF)
   - **Explicit Ledger Adjustment Entries (Auditable)**:
     - Overdue interest and penalties are **not** silent computed-only values. Clicking **Post Explicit Overdue Ledger Entry** records auditable rows in `tblar_ledger_entries` (`entry_type = 'overdue_interest'` and `'overdue_penalty'`) with `balance_before`, `balance_after`, `reason`, and `reference_no`, and updates `tblar_invoice.balance`.
3. **4-Bucket AR Aging Schedule (`Current`, `1–30 Days`, `31–60 Days`, `60+ Days`)**:
   - Visible on both **Payments & Collections** (`payment.html`) and **Reports** (`reports.html`), showing open invoice counts and balances per aging bucket plus per-customer aging columns.
4. **Overdue Account Block at `F8` / `F12` Checkout**:
   - When `ar_block_overdue_accounts = 1` (recommended default ON), selecting an AR customer with any past-due unpaid invoice (`due_date < CURRENT_DATE AND balance > 0`) displays a red **`BLOCKED (OVERDUE AR)`** badge in `#credit-eligibility` and blocks `F12` checkout (both in the UI and server-side in `createSale`).
   - Settling the overdue balance via FIFO payment or Credit Memo immediately unblocks the customer.
5. **Supervisor/Owner-Gated Credit & Debit Memos (`Alt+M` on `payment.html`)**:
   - **Credit Memo (`credit_memo`)**: Reduces customer AR balance (owner-approved rebate/discount/write-off).
   - **Debit Memo (`debit_memo`)**: Increases customer AR balance (manual fee/correction).
   - **Mandatory Gating & Audit Capture**: Requires Supervisor/Owner credentials (`supervisor` / `supervisor123` or `admin` / `admin123`), **Reference Number**, and **Reason**. Posts to `tblar_ledger_entries`, updates `tblar_invoice.balance`, appears in **Tab 3: Credit/Debit Memos & Ledger (`Alt+3`)**, and is included in **End-of-Shift (EOS) AR Summary Totals** (`Credit Memos`, `Debit Memos`, and `Net AR Impact This Shift`).

---

## 8. Hotkey Summary (Printable Reference)

| Key | Action | Protected? | Notes |
|---|---|---|---|
| **F1** | Product Search | No | High-frequency item search (matches F2 Lookup) |
| **F2** | Product Lookup | No | Search barcode/name; Arrows + Enter to pick |
| **F3** | Quantity Field | Partial | Una ang quantity; existing line qty edit requires supervisor |
| **F4** | Void Line Item | **SUPERVISOR** | Requires supervisor username + password |
| **F5** | Void Transaction | **SUPERVISOR** | Requires supervisor username + password |
| **F6** | Hold Sale | No | Snapshots cart + customer + mode + discounts server-side |
| **F7** | Drawer Movement (Float / Lift) | **SUPERVISOR** | Adds change fund or skims excess cash to safe |
| **F8** | AR Credit Mode / Customer Picker | No | Switches to AR mode and opens the customer picker |
| **F9** | Cash Mode | No | Switches transaction mode to Cash; never opens checkout |
| **F10** | Resume Sale | No | Recalls held sale under same cashier + terminal + shift |
| **F11** | Fullscreen Toggle | No | Toggles kiosk fullscreen display mode |
| **F12** | Checkout / Tender | No | Opens tender from the register; completes the sale from tender |
| **Alt+D** | Discount Picker | Partial | Senior Citizen / PWD (20% + VAT-Exempt) or Custom Discount (Supervisor Gate >10% or >₱100) |
| **Alt+E** | End of Shift (EOS) | **SUPERVISOR** | Supervisor-verified EOS reconciliation, closes shift, locks session, prints report |
| **Enter** | Confirm / Scan / Add | No | Context-aware execution key |
| **Home** | Cancel / Close Modal | No | Safely exits dialogs without losing transaction |
| **Up / Down** | Navigate Rows | No | Selects items in cart or lookup table |
