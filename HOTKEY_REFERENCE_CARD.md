# 🏷️ GAISANO-STYLE POS TERMINAL — CASHIER HOTKEY REFERENCE CARD

> **DEFENSE DEMO QUICK-REFERENCE**  
> *Zero-Mouse POS Terminal Workflow: Designed for high-speed keypad and function-key cashier operations.*

---

## ⚡ Main Function Key Operations

| Key | Operation / Command | Access Level | Description & Operational Flow |
|:---:|:---|:---:|:---|
| <kbd>F1</kbd> | **Product Search** | Cashier | Search items by barcode or description. High-frequency search action matching F2 Lookup. |
| <kbd>F2</kbd> | **Product Lookup** | Cashier | Search items by barcode or description. Navigate with <kbd>↑</kbd> <kbd>↓</kbd> and press <kbd>Enter</kbd> to add. *(Product ID hidden from cashier view)* |
| <kbd>F3</kbd> | **Quantity Field** | Cashier / Supervisor* | Focuses quantity input for quantity-first scan (`[Qty]` → <kbd>Enter</kbd> → `[Barcode]`). <br>*Editing an existing cart line requires Supervisor Override. |
| <kbd>F4</kbd> | **Void Line Item** | **SUPERVISOR** | Deletes the currently selected item in the transaction cart. Prompts for supervisor credentials and logs audit entry. |
| <kbd>F5</kbd> | **Void Entire Transaction** | **SUPERVISOR** | Clears the entire cart and aborts the ongoing sale. Requires supervisor approval. |
| <kbd>F6</kbd> | **Hold Sale** | Cashier | Snapshots the active cart, customer, sale mode, and discounts server-side under a ticket ID and clears the register for the next customer. |
| <kbd>F7</kbd> | **Drawer Movement (Float / Lift)** | **SUPERVISOR** | Consolidated drawer event: add starting/supplemental change float or remove excess cash lift to safe. |
| <kbd>F8</kbd> | **AR Credit Mode / Customer Picker** | Cashier | Switches to AR mode and opens the registered-customer picker. |
| <kbd>F9</kbd> | **Cash Mode & Payment Method** | Cashier | Switches transaction to Cash mode, focuses payment method control, and opens the Payment Method modal (<kbd>&uarr;</kbd> <kbd>&darr;</kbd> navigate, <kbd>Enter</kbd> select). Default is Cash. Non-tender action. |
| <kbd>F10</kbd> | **On-Hold** | Cashier | Opens the On-Hold screen listing tickets held under the current pairing (`same cashier + same terminal + same shift`) with Ticket ID, Time, Item Count, and Total. |
| <kbd>F11</kbd> | **Fullscreen Toggle** | All Staff | Toggles full-screen kiosk display mode via Fullscreen API. Inert while a modal is open. |
| <kbd>F12</kbd> | **Checkout / Tender** | Cashier | Opens tender from the register; in tender, completes the sale, prints receipt, and resets the cart. |
| <kbd>Alt+D</kbd> | **Discount Modal** | Cashier | Opens the Discount modal to apply statutory discounts (<kbd>1</kbd> Senior Citizen 20%, <kbd>2</kbd> PWD 20%, or Remove Discount). Selecting type prompts for BIR ID number. <kbd>Home</kbd> steps back or closes modal with cart intact. Ungated. |
| <kbd>Alt+E</kbd> | **End of Shift (EOS)** | **SUPERVISOR** | Initiates supervisor-verified End-of-Shift reconciliation, displays 5-component summary + variance, closes shift, locks session, and prints EOS report. |

---

## ⌨️ Navigation & Confirmation Keys

| Key | Context | Action / Result |
|:---:|:---|:---|
| <kbd>Enter</kbd> | **Quantity Field** | Confirms quantity multiplier, auto-selects barcode scan field. |
| <kbd>Enter</kbd> | **Barcode Field** | Scans/adds item with designated quantity, resets qty to `1`, stays focused in barcode field. |
| <kbd>Enter</kbd> | **Lookup Modal** | Selects highlighted product from table and inserts it into cart. |
| <kbd>Enter</kbd> | **Payment Method Modal** | Sets selected payment method (Cash, GCash, Bank Transfer), updates UI badge, and returns focus without tendering. |
| <kbd>Enter</kbd> | **Tender Field** | Confirms amount tendered and calculates change. |
| <kbd>Enter</kbd> | **AR FIFO Modal** | Generates FIFO cascade preview or confirms allocation. |
| <kbd>Enter</kbd> | **Clear Cart Button** | Opens "Clear Active Cart?" confirmation dialog. |
| <kbd>Home</kbd> | **Topmost Modal** | Closes the topmost active modal without side effects. Event is strictly consumed; background cart is 100% preserved. |
| <kbd>Home</kbd> | **Register Idle** | Returns focus to barcode scan field. If already focused on scan field with active items, opens "Clear Active Cart?" confirmation dialog (`Keep Cart [Home]` / `Clear Cart [Enter]`). Empty cart is a silent no-op. |
| <kbd>↑</kbd> / <kbd>↓</kbd> | **Cart Line Table** | Moves active cursor between transaction items (for void or inspection). |
| <kbd>↑</kbd> / <kbd>↓</kbd> | **Product Lookup / Payment Modal** | Moves selection highlight up and down options. |
| <kbd>Tab</kbd> | **Register Screen** | Moves focus between primary zones (Scan Bar ↔ Cart Table ↔ Totals). |

---

## 🔒 Protected Actions Requiring Supervisor Authorization

The following actions **immediately prompt for supervisor credentials** (`supervisor` / `supervisor123`) and log the event in `tblauthorization_log`:

1. **Void Cart Item (<kbd>F4</kbd>)**
2. **Void Transaction (<kbd>F5</kbd>)**
3. **Change Quantity of Existing Item in Cart (<kbd>F3</kbd>)**
4. **Drawer Movement Float / Lift (<kbd>F7</kbd>)**
5. **End of Shift Reconciliation (<kbd>Alt+E</kbd>)**
6. **AR Credit & Debit Memos (<kbd>Alt+M</kbd> on `payment.html`)**

---

## 📑 AR Collections, Overdue Policy & Credit/Debit Memo Shortcuts (`payment.html` — WP-5)

| Key | Operation / Command | Access Level | Description |
|:---:|:---|:---:|:---|
| <kbd>Alt+P</kbd> | **Record FIFO Payment** | Cashier / AR / Admin | Opens the FIFO Payment Collection modal (`#form-modal`). |
| <kbd>Alt+M</kbd> | **Credit / Debit Memo** | **SUPERVISOR / OWNER** | Opens the Supervisor-Gated Credit/Debit Memo modal (`#memo-modal`). Captures Reference #, Reason, and Supervisor credentials; updates AR balance and EOS shift summary. |
| <kbd>Alt+O</kbd> | **Overdue Policy & Ledger Charge** | AR / Supervisor / Admin | Opens Overdue Policy settings (`ar_default_term_days`, `fixed` vs `compounding` interest, flat/percent penalty, `ar_block_overdue_accounts`) and explicit overdue ledger entry posting. |
| <kbd>Alt+1</kbd> | **AR Invoices Tab** | All Staff | Switches to Tab 1 (`#pills-invoices`) showing open/settled invoices, due dates, days overdue, and 4 aging buckets (`Current`, `1–30d`, `31–60d`, `60+d`). |
| <kbd>Alt+2</kbd> | **Payment History Tab** | All Staff | Switches to Tab 2 (`#pills-payments`) showing FIFO payment collections. |
| <kbd>Alt+3</kbd> | **Credit/Debit Memos & Ledger Tab** | All Staff | Switches to Tab 3 (`#pills-memos`) showing auditable Credit Memos, Debit Memos, and Overdue Interest/Penalty ledger entries. |

---

## 📋 Quantity-First Scan Rules ("Una ang Quantity, Ayha Scanning")

```
[Type Quantity (e.g. 12)] ──► Press [Enter] ──► [Scan/Enter Barcode] ──► Added: 12x Product
                                                                              │
                                       Auto-resets Quantity back to 1 ◄───────┘
                                       Focus automatically stays in Barcode Scan Bar
```

---

## 💵 Shift & Cash Drawer Lifecycle (WP-1)

1. **Mandatory Beginning Float**: Appears immediately whenever a cashier session starts with no open shift. No close `"X"` button; `Home` and backdrop click are inert. Only exits: valid numeric float (`>= min_opening_float`) or `"Cancel & Logout"`. Server API rejects transactions without an open shift.
2. **Mid-Shift Float / Lift**: Registered under `tbldrawer_events` with supervisor stamp (`event_type = 'float'` / `'lift'`).
3. **Completed Cash Sales**: Automatically appended to `tbldrawer_events` with `event_type = 'sale'` and linked to `shift_id` on `tblsales`.
4. **Supervisor-Verified End of Shift (<kbd>Alt+E</kbd>)**: Requires supervisor override, displays 5-component summary (`Starting Balance`, `Expected Cash = Opening Float + Floats Added + Cash Sales - Refunds - Lifts`, `Current Float`, `Total Posted to AR: count & sum`, `Actual Counted Cash vs Expected -> Over/Short Variance`), closes shift, locks session, and persists reprintable EOS report.
