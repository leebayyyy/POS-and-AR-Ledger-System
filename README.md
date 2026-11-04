# POS & AR Master Files

This is your original master-file scope (Roles, Users, Product Categories,
Products, POS Terminals, AR Customer Types, AR Customers)
rebuilt to match your reference document's conventions:

- **Frontend**: vanilla JS + ES6 modules, Axios, Bootstrap 5.3.7, `sessionStorage.baseAPIUrl`
- **Backend**: one PDO-based PHP class per entity, dispatched with `switch($operation)`,
  `$returnValue` 1/0 convention on insert/update/delete
- **Naming**: `tblxxx` tables, `xxx_id` snake_case columns
- **Business rules kept**: Users/Products/AR Customers are soft-deleted (`is_active`)
  with a Restore action; Roles/Product Categories/POS Terminals/Customer Types are
  hard-deleted but blocked (with a message) if another table still references them

## Setup (XAMPP)

1. Copy or link this whole `masterfile` folder into `htdocs/`.
2. Create the database `pos_ar_system` and import `database/pos_ar_system.sql` in phpMyAdmin (or via MySQL CLI).
3. Apply `database/revisions_mysql.sql` so the documented seeded accounts and required revisions are installed.
4. If your MySQL root user has a password, edit `api/config.local.php`.
5. Open `http://localhost/masterfile/login.html` in your browser.

### Default Login Accounts

| Username | Password | Role |
| :--- | :--- | :--- |
| `admin` | `admin123` | Admin |
| `cashier` | `cashier123` | Cashier |
| `maria` | `cashier123` | Cashier backup |
| `ar_staff` | `ar123` | Accounts Receivable Staff |
| `pedro` | `ar123` | Accounts Receivable Staff backup |
| `RC` | `manager123` | Manager |
| `supervisor` | `supervisor123` | Supervisor |

For an existing installation, apply these migrations in order using phpMyAdmin:

1. `database/migrations/2026-09-26-suki-sale-snapshot.sql`
2. `database/migrations/2026-09-26-ar-invoice-handoff.sql`
3. `database/migrations/2026-09-26-customer-credit-limit.sql`
4. `database/migrations/2026-09-26-sales-promotion-audit.sql`
5. `database/migrations/2026-09-26-pos-terminal-assignments.sql`
6. `database/migrations/2026-09-26-sales-payment-method.sql`
7. `database/migrations/2026-09-26-cashier-terminal-session-selection.sql`

The AR handoff migration associates existing credit sales with their customers
and adds invoice due dates before the updated Sales and AR Transactions pages are used.
The customer credit-limit migration adds a zero-default limit; AR Staff or Admin
must assign an approved limit before a customer can make a credit purchase.
The sales-promotion migration records the promotion and promotion discount used
on each new sale line for receipt and reporting audit.
After login, each Cashier selects the POS terminal in use. That selection is
stored in the login session and applies to all sales until logout; the Admin
does not assign terminals to employees. Managers can review daily transaction
counts and sales totals by terminal. The terminal session-selection migration
removes the obsolete assignment table from existing installations.
The sales payment-method migration adds an optional method reference to historical
sales and records the selected active method on new POS cash sales. AR credit
sales remain payable through the Accounts Receivable payment workflow. Admin
adds or deactivates methods in System Settings; Cashiers select an active method
for POS cash sales, AR Staff select one when applying invoice payments, and
Managers can monitor methods in the sales and payment reports.
Admin manages employee accounts and assigns the Cashier, Accounts Receivable
Staff, or Manager role. User-management API mutations are Admin-only; employees
cannot change their own role assignment.
Authenticated pages render a shared, role-filtered navigation menu with a
consistent link order and active-page indicator. The navbar stays pinned to the
top; wider menus scroll horizontally instead of wrapping links out of view, and
small screens use a consistent expandable Menu button. Links hidden from a role
in the menu are also hidden from that role's dashboard shortcuts.
Registered SUKI cards are linked to AR customers. Cashier POS can select a
registered card and records its associated customer and points snapshot on the
sale. Sale snapshots do not change registered card balances. Admin maintains
cards; Manager has read-only access to card balances and linked sale activity.

## File layout

```
masterfile/
├── database/schema.sql
├── api/
│   ├── connection-pdo.php        shared PDO connection (included by every api/*.php)
│   ├── role.php
│   ├── user.php
│   ├── product_category.php
│   ├── product.php
│   ├── pos_terminal.php
│   ├── ar_customer_type.php
│   └── ar_customer.php
├── index.html                    dashboard / nav
├── role.html, user.html, ...     one page per entity
└── js/
    ├── role.js, user.js, ...     page bootstrap + list + insert (one per entity)
    └── modules/
        ├── role-update.js, role-delete.js
        └── ...update.js / ...delete.js for each entity
```

Each entity page follows the same shape as your reference's Students example:
an inline add-form + table on the page, and Update/Delete open the shared
`#blank-modal`. Entities with `is_active` show a Restore button instead of
Delete once deactivated.
