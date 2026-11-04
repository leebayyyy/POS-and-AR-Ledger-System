import { getSession } from "./auth.js?v=20261021";

const reportsApiUrl = "api/reports.php";

document.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById("dashboard-root");
  if (!root) return;

  try {
    const session = await getSession();
    if (!session || !session.authenticated || !session.user) {
      return; // page-auth handles redirect
    }

    const user = session.user;

    // Cashiers are redirected by page-auth; if on index, show redirect message
    if (user.role_name === "Cashier") {
      root.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-primary mb-3" role="status"></div>
          <p class="text-muted">Redirecting to Cashier Workspace...</p>
        </div>
      `;
      return;
    }

    // Fetch operational summary data
    let summary = null;
    try {
      const now = new Date();
      const today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
      const res = await axios.get(reportsApiUrl, {
        params: { operation: "summary", date: today },
        withCredentials: true,
      });
      summary = res.data;
    } catch (apiErr) {
      console.warn("Could not load summary metrics for dashboard:", apiErr);
    }

    if (user.role_name === "Admin") {
      renderAdminDashboard(root, user, summary);
    } else if (user.role_name === "Manager" || user.role_name === "Supervisor") {
      renderManagerDashboard(root, user, summary);
    } else if (user.role_name === "Accounts Receivable Staff") {
      renderArStaffDashboard(root, user, summary);
    } else {
      renderFallbackDashboard(root, user);
    }
  } catch (err) {
    console.error("Dashboard render error:", err);
    root.innerHTML = `
      <div class="alert alert-danger my-4">
        Failed to load dashboard. Please refresh or contact support.
      </div>
    `;
  }
});

function formatPhp(val) {
  const num = parseFloat(val) || 0;
  return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ==========================================================================
   1. ADMIN DASHBOARD
   ========================================================================== */
function renderAdminDashboard(container, user, summary) {
  const salesTotal = summary?.sales?.total ? formatPhp(summary.sales.total) : "₱0.00";
  const salesCount = summary?.sales?.count ?? 0;
  const arTotal = summary?.ar?.outstanding ? formatPhp(summary.ar.outstanding) : "₱0.00";
  const arInvoices = summary?.ar?.invoices ?? 0;
  const paymentsTotal = summary?.payments?.total ? formatPhp(summary.payments.total) : "₱0.00";
  const paymentsCount = summary?.payments?.count ?? 0;

  container.innerHTML = `
    <!-- Header Banner -->
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1 text-dark">System Administration Workspace</h1>
        <p class="text-muted small mb-0">System health, configuration, store catalog, and operational oversight</p>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="badge bg-primary px-3 py-2 fs-6">Administrator</span>
      </div>
    </div>

    <!-- Live Operational Pulse -->
    ${summary ? `
    <div class="row g-3 mb-4">
      <div class="col-12 col-md-4">
        <div class="app-card mb-0 h-100 p-3 border-start border-4 border-primary">
          <div class="text-muted small text-uppercase fw-semibold mb-1">Today's Sales Pulse</div>
          <div class="h3 fw-bold text-dark mb-1">${salesTotal}</div>
          <div class="small text-muted">${salesCount} completed transaction${salesCount === 1 ? "" : "s"} today</div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="app-card mb-0 h-100 p-3 border-start border-4 border-warning">
          <div class="text-muted small text-uppercase fw-semibold mb-1">Customer Receivables Debt</div>
          <div class="h3 fw-bold text-dark mb-1">${arTotal}</div>
          <div class="small text-muted">${arInvoices} active invoice${arInvoices === 1 ? "" : "s"} in ledger</div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="app-card mb-0 h-100 p-3 border-start border-4 border-success">
          <div class="text-muted small text-uppercase fw-semibold mb-1">Today's Collections</div>
          <div class="h3 fw-bold text-dark mb-1">${paymentsTotal}</div>
          <div class="small text-muted">${paymentsCount} payment transaction${paymentsCount === 1 ? "" : "s"} today</div>
        </div>
      </div>
    </div>
    ` : ""}

    <!-- Administrative Modules Grid -->
    <div class="row g-4">
      <!-- Cluster 1: System Security & Access -->
      <div class="col-12 col-lg-6">
        <div class="app-card h-100">
          <div class="app-card-header bg-light">
            <h2 class="app-card-title d-flex align-items-center gap-2 text-primary">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0c-.69 0-1.843.265-2.928.56-1.11.3-2.229.655-2.887.87a1.54 1.54 0 0 0-1.044 1.262c-.596 4.477.787 7.795 2.464 9.99a11.8 11.8 0 0 0 4.048 3.208.5.5 0 0 0 .494 0 11.8 11.8 0 0 0 4.048-3.208c1.677-2.195 3.06-5.513 2.464-9.99a1.54 1.54 0 0 0-1.044-1.263 63 63 0 0 0-2.887-.87C9.843.266 8.69 0 8 0m2.146 5.146a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 7.793z"/></svg>
              System Security &amp; Access Control
            </h2>
          </div>
          <div class="app-card-body p-3">
            <div class="list-group list-group-flush">
              <a href="user.html" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3">
                <div>
                  <div class="fw-semibold text-dark">User Accounts</div>
                  <div class="text-muted small">Manage staff logins, passwords, statuses, and assigned roles</div>
                </div>
                <span class="btn btn-sm btn-outline-primary px-3">Manage Users &rarr;</span>
              </a>
              <a href="role.html" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3">
                <div>
                  <div class="fw-semibold text-dark">Roles &amp; Permissions</div>
                  <div class="text-muted small">Define system roles and authorized operations</div>
                </div>
                <span class="btn btn-sm btn-outline-primary px-3">Manage Roles &rarr;</span>
              </a>
              <a href="settings.html" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3">
                <div>
                  <div class="fw-semibold text-dark">System Settings</div>
                  <div class="text-muted small">Tax rates, store defaults, and operational configurations</div>
                </div>
                <span class="btn btn-sm btn-outline-primary px-3">Settings &rarr;</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Cluster 2: Store Master Catalog -->
      <div class="col-12 col-lg-6">
        <div class="app-card h-100">
          <div class="app-card-header bg-light">
            <h2 class="app-card-title d-flex align-items-center gap-2 text-primary">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5l2.404.961L10.404 2zm3.564 1.426L5.596 5 8 5.961 14.154 3.5zm3.25 1.7-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923zM7.443.184a1.5 1.5 0 0 1 1.114 0l6.229 2.492a.5.5 0 0 1 .314.464v8.528a1.5 1.5 0 0 1-.947 1.39l-6.228 2.49a1.5 1.5 0 0 1-1.114 0l-6.229-2.49A1.5 1.5 0 0 1 0 11.666V3.14a.5.5 0 0 1 .314-.464z"/></svg>
              Retail Catalog &amp; Store Setup
            </h2>
          </div>
          <div class="app-card-body p-3">
            <div class="list-group list-group-flush">
              <a href="product.html" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3">
                <div>
                  <div class="fw-semibold text-dark">Product Master File</div>
                  <div class="text-muted small">Items, retail and wholesale prices, categories, units</div>
                </div>
                <span class="btn btn-sm btn-outline-primary px-3">Products &rarr;</span>
              </a>
              <a href="product_category.html" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3">
                <div>
                  <div class="fw-semibold text-dark">Product Categories</div>
                  <div class="text-muted small">Classify merchandise and organize department catalogs</div>
                </div>
                <span class="btn btn-sm btn-outline-primary px-3">Categories &rarr;</span>
              </a>
              <a href="pos_terminal.html" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3">
                <div>
                  <div class="fw-semibold text-dark">POS Terminals</div>
                  <div class="text-muted small">Checkout counters, active stations, and register setup</div>
                </div>
                <span class="btn btn-sm btn-outline-primary px-3">Terminals &rarr;</span>
              </a>
              <a href="suki_card.html" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3">
                <div>
                  <div class="fw-semibold text-dark">Suki Loyalty Cards</div>
                  <div class="text-muted small">Customer discount cards and loyalty membership</div>
                </div>
                <span class="btn btn-sm btn-outline-primary px-3">Suki Cards &rarr;</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Cluster 3: Accounts Receivable & Credit -->
      <div class="col-12 col-lg-6">
        <div class="app-card h-100">
          <div class="app-card-header bg-light">
            <h2 class="app-card-title d-flex align-items-center gap-2 text-primary">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0"/><path fill-rule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1"/></svg>
              Accounts Receivable &amp; Credit Ledger
            </h2>
          </div>
          <div class="app-card-body p-3">
            <div class="list-group list-group-flush">
              <a href="ar_customer.html" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3">
                <div>
                  <div class="fw-semibold text-dark">AR Customers</div>
                  <div class="text-muted small">Credit account holders, credit limits, and contact profiles</div>
                </div>
                <span class="btn btn-sm btn-outline-primary px-3">Customers &rarr;</span>
              </a>
              <a href="payment.html" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3">
                <div>
                  <div class="fw-semibold text-dark">Payments &amp; Collections</div>
                  <div class="text-muted small">Record customer debt settlements and review collections</div>
                </div>
                <span class="btn btn-sm btn-outline-primary px-3">Payments &rarr;</span>
              </a>
              <a href="payment.html" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3">
                <div>
                  <div class="fw-semibold text-dark">AR Invoices &amp; Credit Sales</div>
                  <div class="text-muted small">Generate billing invoices and audit customer debt transactions</div>
                </div>
                <span class="btn btn-sm btn-outline-primary px-3">Invoices &rarr;</span>
              </a>
              <a href="ar_customer_type.html" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3">
                <div>
                  <div class="fw-semibold text-dark">Customer Types</div>
                  <div class="text-muted small">Credit tiers, terms of payment, and rate classifications</div>
                </div>
                <span class="btn btn-sm btn-outline-primary px-3">Customer Types &rarr;</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Cluster 4: Operations & Financial Reporting -->
      <div class="col-12 col-lg-6">
        <div class="app-card h-100">
          <div class="app-card-header bg-light">
            <h2 class="app-card-title d-flex align-items-center gap-2 text-primary">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M4 11H2v3h2zm5-4H7v7h2zm5-5h-2v12h2zm-2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM6 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zm-5 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z"/></svg>
              Operations &amp; Financial Auditing
            </h2>
          </div>
          <div class="app-card-body p-3">
            <div class="list-group list-group-flush">
              <a href="reports.html" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3">
                <div>
                  <div class="fw-semibold text-dark">Financial &amp; Audit Reports</div>
                  <div class="text-muted small">Daily sales summary, terminal breakdown, customer debt aging</div>
                </div>
                <span class="btn btn-sm btn-outline-primary px-3">View Reports &rarr;</span>
              </a>
              <a href="sales.html" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3">
                <div>
                  <div class="fw-semibold text-dark">POS Sales Register</div>
                  <div class="text-muted small">Live checkout terminal interface and sales transaction register</div>
                </div>
                <span class="btn btn-sm btn-outline-primary px-3">Open POS &rarr;</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   2. MANAGER DASHBOARD
   ========================================================================== */
function renderManagerDashboard(container, user, summary) {
  const salesTotal = summary?.sales?.total ? formatPhp(summary.sales.total) : "₱0.00";
  const salesCount = summary?.sales?.count ?? 0;
  const taxTotal = summary?.sales?.tax ? formatPhp(summary.sales.tax) : "₱0.00";
  const promoDiscount = summary?.promotions?.total_discount ? formatPhp(summary.promotions.total_discount) : "₱0.00";
  const arTotal = summary?.ar?.outstanding ? formatPhp(summary.ar.outstanding) : "₱0.00";

  const terminalSales = summary?.terminalSales || [];
  const dailySales = summary?.dailySales || [];

  container.innerHTML = `
    <!-- Header Banner -->
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1 text-dark">Store Supervision Dashboard</h1>
        <p class="text-muted small mb-0">Operational performance, register activity, transactions, and store audit</p>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="badge ${user.role_name === 'Supervisor' ? 'bg-warning text-dark' : 'bg-info text-dark'} px-3 py-2 fs-6">${user.role_name === 'Supervisor' ? 'Store Supervisor' : 'Store Manager'}</span>
        <a href="reports.html" class="btn btn-primary btn-sm px-3">Full Audit Reports &rarr;</a>
      </div>
    </div>

    <!-- Sales & Operational Performance Cards -->
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-3">
        <div class="app-card mb-0 p-3 h-100 border-top border-4 border-primary">
          <div class="text-muted small text-uppercase fw-semibold mb-1">Today's Sales Total</div>
          <div class="h3 fw-bold text-dark mb-0">${salesTotal}</div>
          <div class="small text-muted mt-1">${salesCount} completed sale${salesCount === 1 ? "" : "s"}</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="app-card mb-0 p-3 h-100 border-top border-4 border-success">
          <div class="text-muted small text-uppercase fw-semibold mb-1">Tax Collected</div>
          <div class="h3 fw-bold text-dark mb-0">${taxTotal}</div>
          <div class="small text-muted mt-1">VAT on today's register</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="app-card mb-0 p-3 h-100 border-top border-4 border-info">
          <div class="text-muted small text-uppercase fw-semibold mb-1">Promo Discounts</div>
          <div class="h3 fw-bold text-dark mb-0">${promoDiscount}</div>
          <div class="small text-muted mt-1">Discounts granted today</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="app-card mb-0 p-3 h-100 border-top border-4 border-warning">
          <div class="text-muted small text-uppercase fw-semibold mb-1">Outstanding AR Debt</div>
          <div class="h3 fw-bold text-dark mb-0">${arTotal}</div>
          <div class="small text-muted mt-1">Customer credit balance</div>
        </div>
      </div>
    </div>

    <div class="row g-4 mb-4">
      <!-- Terminal Activity Breakdown -->
      <div class="col-12 col-lg-5">
        <div class="app-card h-100">
          <div class="app-card-header bg-light">
            <h2 class="app-card-title d-flex align-items-center gap-2">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M0 4s0-2 2-2h12s2 0 2 2v6s0 2-2 2h-4c0 .667.083 1.167.25 1.5H11a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1h.75c.167-.333.25-.833.25-1.5H2s-2 0-2-2zm1.398-.855a.76.76 0 0 0-.254.302A1.5 1.5 0 0 0 1 4.01V10c0 .325.078.502.145.602.07.105.17.188.302.254a1.5 1.5 0 0 0 .553.144H14c.325 0 .502-.078.602-.145.105-.07.188-.17.254-.302.068-.138.144-.328.144-.553V4.01c0-.325-.078-.502-.145-.602-.07-.105-.17-.188-.302-.254A1.5 1.5 0 0 0 14 3.01H2c-.325 0-.502.078-.602.145"/></svg>
              POS Terminal Activity
            </h2>
            <a href="pos_terminal.html" class="btn btn-outline-secondary btn-sm">Terminals &rarr;</a>
          </div>
          <div class="app-card-body p-0">
            <div class="app-table-wrapper">
              <table class="table app-table mb-0">
                <thead>
                  <tr>
                    <th>Counter</th>
                    <th class="text-center">Transactions</th>
                    <th class="text-end">Sales Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${terminalSales.length ? terminalSales.map(t => `
                    <tr>
                      <td class="fw-semibold">${t.terminal_name}</td>
                      <td class="text-center">${t.sale_count}</td>
                      <td class="text-end num-cell fw-bold">${formatPhp(t.sales_total)}</td>
                    </tr>
                  `).join("") : `
                    <tr><td colspan="3" class="text-center py-3 text-muted">No terminals active.</td></tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Supervisor Actions -->
      <div class="col-12 col-lg-7">
        <div class="app-card h-100">
          <div class="app-card-header bg-light">
            <h2 class="app-card-title">Supervisory Workspaces</h2>
          </div>
          <div class="app-card-body p-3">
            <div class="row g-2">
              <div class="col-6 col-sm-4">
                <a href="product.html" class="btn btn-outline-primary w-100 text-start p-3 h-100 d-flex flex-column justify-content-between">
                  <div class="fw-bold">Product Catalog</div>
                  <small class="text-muted">Review prices &amp; inventory</small>
                </a>
              </div>
              <div class="col-6 col-sm-4">
                <a href="sales.html" class="btn btn-outline-primary w-100 text-start p-3 h-100 d-flex flex-column justify-content-between">
                  <div class="fw-bold">Sales Register</div>
                  <small class="text-muted">Monitor POS checkout</small>
                </a>
              </div>
              <div class="col-6 col-sm-4">
                <a href="reports.html" class="btn btn-outline-primary w-100 text-start p-3 h-100 d-flex flex-column justify-content-between">
                  <div class="fw-bold">Reports &amp; Audits</div>
                  <small class="text-muted">Sales and debt summaries</small>
                </a>
              </div>
              <div class="col-6 col-sm-4">
                <a href="payment.html" class="btn btn-outline-primary w-100 text-start p-3 h-100 d-flex flex-column justify-content-between">
                  <div class="fw-bold">AR Invoices</div>
                  <small class="text-muted">Customer transactions</small>
                </a>
              </div>
              <div class="col-6 col-sm-4">
                <a href="ar_customer.html" class="btn btn-outline-primary w-100 text-start p-3 h-100 d-flex flex-column justify-content-between">
                  <div class="fw-bold">AR Customers</div>
                  <small class="text-muted">Credit limits &amp; status</small>
                </a>
              </div>
              <div class="col-6 col-sm-4">
                <a href="payment.html" class="btn btn-outline-primary w-100 text-start p-3 h-100 d-flex flex-column justify-content-between">
                  <div class="fw-bold">Collections</div>
                  <small class="text-muted">Debt payments received</small>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Completed Sales Feed -->
    <div class="app-card">
      <div class="app-card-header bg-light">
        <h2 class="app-card-title d-flex align-items-center gap-2">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M0 1.5A.5.5 0 0 1 .5 1H2a.5.5 0 0 1 .485.379L2.89 3H14.5a.5.5 0 0 1 .491.592l-1.5 8A.5.5 0 0 1 13 12H4a.5.5 0 0 1-.491-.408L2.01 3.607 1.61 2H.5a.5.5 0 0 1-.5-.5M3.102 4l1.313 7h8.17l1.313-7zM5 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4m7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4"/></svg>
          Today's Sales Register Transactions
        </h2>
        <span class="badge bg-secondary">${dailySales.length} record${dailySales.length === 1 ? "" : "s"}</span>
      </div>
      <div class="app-card-body p-0">
        <div class="app-table-wrapper">
          <table class="table app-table mb-0">
            <thead>
              <tr>
                <th>Sale ID</th>
                <th>Counter</th>
                <th>Cashier</th>
                <th>Type</th>
                <th>Payment / Account</th>
                <th class="text-end">Total Amount</th>
              </tr>
            </thead>
            <tbody>
              ${dailySales.length ? dailySales.slice(0, 10).map(s => `
                <tr>
                  <td class="num-cell fw-bold">#${s.sale_id}</td>
                  <td>${s.terminal_name}</td>
                  <td>${s.cashier}</td>
                  <td>
                    <span class="badge ${s.sale_type === 'Cash' ? 'bg-success' : 'bg-warning text-dark'}">
                      ${s.sale_type}
                    </span>
                  </td>
                  <td>${s.sale_type === 'Cash' ? (s.payment_method || 'Cash') : (s.customer_name || 'Credit Account')}</td>
                  <td class="text-end num-cell fw-bold">${formatPhp(s.total_amount)}</td>
                </tr>
              `).join("") : `
                <tr><td colspan="6" class="text-center py-4 text-muted">No sales completed today yet.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   3. AR STAFF DASHBOARD
   ========================================================================== */
function renderArStaffDashboard(container, user, summary) {
  const arTotal = summary?.ar?.outstanding ? formatPhp(summary.ar.outstanding) : "₱0.00";
  const billedBalance = summary?.ar?.invoice_outstanding ? formatPhp(summary.ar.invoice_outstanding) : "₱0.00";
  const billedCount = summary?.ar?.invoices ?? 0;
  const pendingSalesTotal = summary?.ar?.pending_sales_total ? formatPhp(summary.ar.pending_sales_total) : "₱0.00";
  const pendingSalesCount = summary?.ar?.pending_sales ?? 0;
  const overdueTotal = summary?.ar?.overdue_balance ? formatPhp(summary.ar.overdue_balance) : "₱0.00";
  const overdueCount = summary?.ar?.overdue_invoices ?? 0;
  const collectionsTotal = summary?.payments?.total ? formatPhp(summary.payments.total) : "₱0.00";
  const collectionsCount = summary?.payments?.count ?? 0;

  const customerBalances = summary?.customerBalances || [];

  container.innerHTML = `
    <!-- Header Banner -->
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1 text-dark">Accounts Receivable Workspace</h1>
        <p class="text-muted small mb-0">Customer credit ledger, pending invoices, debt collections, and credit limits</p>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="badge bg-success px-3 py-2 fs-6">AR Staff</span>
        <a href="payment.html" class="btn btn-primary btn-sm px-3">+ Record Payment</a>
      </div>
    </div>

    <!-- Alert for Pending Invoices (Manual AR Workflow preserved) -->
    ${pendingSalesCount > 0 ? `
    <div class="alert alert-warning border-start border-4 border-warning d-flex align-items-center justify-content-between flex-wrap gap-2 mb-4 py-3" role="alert">
      <div class="d-flex align-items-center gap-2">
        <svg width="22" height="22" fill="currentColor" class="text-warning flex-shrink-0" viewBox="0 0 16 16"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>
        <div>
          <strong>${pendingSalesCount} Unbilled Credit Sale${pendingSalesCount === 1 ? "" : "s"} (${pendingSalesTotal})</strong>
          <div class="small text-muted">Credit purchases from the POS register requiring formal AR invoice creation.</div>
        </div>
      </div>
      <a href="payment.html" class="btn btn-warning btn-sm fw-bold">Process Invoices in AR &rarr;</a>
    </div>
    ` : ""}

    <!-- Key Credit & Debt Metrics -->
    <div class="row g-3 mb-4">
      <div class="col-12 col-sm-6 col-lg-3">
        <div class="app-card mb-0 p-3 h-100 border-start border-4 border-primary">
          <div class="text-muted small text-uppercase fw-semibold mb-1">Total Customer Debt</div>
          <div class="h3 fw-bold text-dark mb-1">${arTotal}</div>
          <div class="small text-muted">All outstanding customer debt</div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-lg-3">
        <div class="app-card mb-0 p-3 h-100 border-start border-4 border-info">
          <div class="text-muted small text-uppercase fw-semibold mb-1">Pending Invoices</div>
          <div class="h3 fw-bold text-dark mb-1">${pendingSalesTotal}</div>
          <div class="small text-muted">${pendingSalesCount} unbilled credit sale${pendingSalesCount === 1 ? "" : "s"}</div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-lg-3">
        <div class="app-card mb-0 p-3 h-100 border-start border-4 border-danger">
          <div class="text-muted small text-uppercase fw-semibold mb-1">Overdue Invoices</div>
          <div class="h3 fw-bold text-dark mb-1">${overdueTotal}</div>
          <div class="small text-muted">${overdueCount} past-due invoice${overdueCount === 1 ? "" : "s"}</div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-lg-3">
        <div class="app-card mb-0 p-3 h-100 border-start border-4 border-success">
          <div class="text-muted small text-uppercase fw-semibold mb-1">Payments Received</div>
          <div class="h3 fw-bold text-dark mb-1">${collectionsTotal}</div>
          <div class="small text-muted">${collectionsCount} collection${collectionsCount === 1 ? "" : "s"} today</div>
        </div>
      </div>
    </div>

    <!-- Customer Debt & Credit Balances Table -->
    <div class="app-card mb-4">
      <div class="app-card-header bg-light">
        <h2 class="app-card-title d-flex align-items-center gap-2">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0"/><path fill-rule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1"/></svg>
          Customer Balances &amp; Credit Limits
        </h2>
        <a href="ar_customer.html" class="btn btn-outline-secondary btn-sm">All AR Customers &rarr;</a>
      </div>
      <div class="app-card-body p-0">
        <div class="app-table-wrapper">
          <table class="table app-table mb-0">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th class="text-end">Credit Limit</th>
                <th class="text-end">Billed Balance</th>
                <th class="text-end">Unbilled Debt</th>
                <th class="text-end">Total Outstanding</th>
                <th class="text-end">Available Credit</th>
                <th class="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              ${customerBalances.length ? customerBalances.map(c => `
                <tr>
                  <td class="fw-semibold text-dark">${c.customer_name}</td>
                  <td class="text-end num-cell">${formatPhp(c.credit_limit)}</td>
                  <td class="text-end num-cell">${formatPhp(c.invoice_balance)}</td>
                  <td class="text-end num-cell ${parseFloat(c.pending_balance) > 0 ? 'text-warning fw-bold' : ''}">${formatPhp(c.pending_balance)}</td>
                  <td class="text-end num-cell fw-bold ${parseFloat(c.total_balance) > 0 ? 'text-danger' : 'text-success'}">${formatPhp(c.total_balance)}</td>
                  <td class="text-end num-cell fw-semibold">${formatPhp(c.available_credit)}</td>
                  <td class="text-center">
                    <a href="payment.html" class="btn btn-outline-success btn-sm py-0 px-2" title="Accept payment">Pay</a>
                  </td>
                </tr>
              `).join("") : `
                <tr><td colspan="7" class="text-center py-4 text-muted">No customer records found.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- AR Quick Actions -->
    <div class="row g-3">
      <div class="col-12 col-md-4">
        <div class="app-card p-3 mb-0 h-100">
          <h3 class="h6 fw-bold mb-2">Collections &amp; Receipts</h3>
          <p class="text-muted small mb-3">Accept and record customer credit balance settlements and cash receipts.</p>
          <a href="payment.html" class="btn btn-outline-primary btn-sm w-100">Open Payments &rarr;</a>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="app-card p-3 mb-0 h-100">
          <h3 class="h6 fw-bold mb-2">Invoices &amp; Transactions</h3>
          <p class="text-muted small mb-3">Generate official invoices from POS sales and review customer ledgers.</p>
          <a href="payment.html" class="btn btn-outline-primary btn-sm w-100">Open Invoices &rarr;</a>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="app-card p-3 mb-0 h-100">
          <h3 class="h6 fw-bold mb-2">Aging &amp; Reports</h3>
          <p class="text-muted small mb-3">Analyze customer aging balances, collection summaries, and audit ledgers.</p>
          <a href="reports.html" class="btn btn-outline-primary btn-sm w-100">Open Reports &rarr;</a>
        </div>
      </div>
    </div>
  `;
}

function renderFallbackDashboard(container, user) {
  container.innerHTML = `
    <div class="text-center py-5">
      <h1 class="h4 fw-bold">Welcome, ${user.first_name || user.username}</h1>
      <p class="text-muted">Use the navigation menu on the left to access your authorized modules.</p>
    </div>
  `;
}
