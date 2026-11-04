import "./delete-as-backspace.js";
import { requirePageRole, addLogout, getSession, logoutUser, confirmLogout } from "./auth.js?v=20261022";

const page = window.location.pathname.split("/").pop() || "index.html";

if (page === "ar_transactions.html") {
  window.location.replace("payment.html");
}

const permissions = {
  "index.html": ["Admin", "Accounts Receivable Staff", "Manager", "Cashier", "Supervisor"],
  "role.html": ["Admin", "Manager", "Supervisor"],
  "user.html": ["Admin", "Manager", "Supervisor"],
  "product_category.html": ["Admin", "Manager", "Supervisor"],
  "product.html": ["Admin", "Manager", "Supervisor"],
  "pos_terminal.html": ["Admin", "Manager", "Supervisor"],
  "ar_customer_type.html": ["Admin", "Accounts Receivable Staff", "Manager", "Supervisor"],
  "ar_customer.html": ["Admin", "Accounts Receivable Staff", "Manager", "Supervisor"],
  "payment.html": ["Admin", "Accounts Receivable Staff", "Manager", "Supervisor"],
  "sales.html": ["Admin", "Cashier", "Manager", "Supervisor"],
  "reports.html": ["Admin", "Accounts Receivable Staff", "Manager", "Supervisor"],
  "settings.html": ["Admin", "Manager", "Supervisor"],
  "suki_card.html": ["Admin", "Manager", "Supervisor"],
  "terminal_select.html": ["Cashier"],
};

const navigationSections = [
  {
    heading: "OVERVIEW",
    items: [
      ["index.html", "Dashboard", `<svg viewBox="0 0 16 16" fill="currentColor" class="app-sidebar-icon"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/></svg>`]
    ]
  },
  {
    heading: "ADMINISTRATION",
    items: [
      ["role.html", "Roles", `<svg viewBox="0 0 16 16" fill="currentColor" class="app-sidebar-icon"><path d="M8 0c-.69 0-1.843.265-2.928.56-1.11.3-2.229.655-2.887.87a1.54 1.54 0 0 0-1.044 1.262c-.596 4.477.787 7.795 2.464 9.99a11.8 11.8 0 0 0 4.048 3.208.5.5 0 0 0 .494 0 11.8 11.8 0 0 0 4.048-3.208c1.677-2.195 3.06-5.513 2.464-9.99a1.54 1.54 0 0 0-1.044-1.263 63 63 0 0 0-2.887-.87C9.843.266 8.69 0 8 0m2.146 5.146a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 7.793z"/></svg>`],
      ["user.html", "Users", `<svg viewBox="0 0 16 16" fill="currentColor" class="app-sidebar-icon"><path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-5.784 6A2.24 2.24 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.3 6.3 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1zM4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5"/></svg>`],
      ["settings.html", "Settings", `<svg viewBox="0 0 16 16" fill="currentColor" class="app-sidebar-icon"><path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/></svg>`]
    ]
  },
  {
    heading: "STORE MASTER FILES",
    items: [
      ["product.html", "Products", `<svg viewBox="0 0 16 16" fill="currentColor" class="app-sidebar-icon"><path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5l2.404.961L10.404 2zm3.564 1.426L5.596 5 8 5.961 14.154 3.5zm3.25 1.7-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923zM7.443.184a1.5 1.5 0 0 1 1.114 0l6.229 2.492a.5.5 0 0 1 .314.464v8.528a1.5 1.5 0 0 1-.947 1.39l-6.228 2.49a1.5 1.5 0 0 1-1.114 0l-6.229-2.49A1.5 1.5 0 0 1 0 11.666V3.14a.5.5 0 0 1 .314-.464z"/></svg>`],
      ["product_category.html", "Product Categories", `<svg viewBox="0 0 16 16" fill="currentColor" class="app-sidebar-icon"><path d="M3 2v4.586l7 7L14.586 9l-7-7zM2 2a1 1 0 0 1 1-1h4.586a1 1 0 0 1 .707.293l7 7a1 1 0 0 1 0 1.414l-4.586 4.586a1 1 0 0 1-1.414 0l-7-7A1 1 0 0 1 2 6.586zm3.5 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3"/></svg>`],
      ["pos_terminal.html", "POS Terminals", `<svg viewBox="0 0 16 16" fill="currentColor" class="app-sidebar-icon"><path d="M0 4s0-2 2-2h12s2 0 2 2v6s0 2-2 2h-4c0 .667.083 1.167.25 1.5H11a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1h.75c.167-.333.25-.833.25-1.5H2s-2 0-2-2zm1.398-.855a.76.76 0 0 0-.254.302A1.5 1.5 0 0 0 1 4.01V10c0 .325.078.502.145.602.07.105.17.188.302.254a1.5 1.5 0 0 0 .553.144H14c.325 0 .502-.078.602-.145.105-.07.188-.17.254-.302.068-.138.144-.328.144-.553V4.01c0-.325-.078-.502-.145-.602-.07-.105-.17-.188-.302-.254A1.5 1.5 0 0 0 14 3.01H2c-.325 0-.502.078-.602.145"/></svg>`],
      ["suki_card.html", "Suki Cards", `<svg viewBox="0 0 16 16" fill="currentColor" class="app-sidebar-icon"><path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v1h14V4a1 1 0 0 0-1-1zm13 4H1v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1z"/><path d="M2 10a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/></svg>`]
    ]
  },
  {
    heading: "ACCOUNTS RECEIVABLE",
    items: [
      ["ar_customer.html", "AR Customers", `<svg viewBox="0 0 16 16" fill="currentColor" class="app-sidebar-icon"><path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0"/><path fill-rule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1"/></svg>`],
      ["ar_customer_type.html", "Customer Types", `<svg viewBox="0 0 16 16" fill="currentColor" class="app-sidebar-icon"><path d="M6 3.5A1.5 1.5 0 0 1 7.5 2h1A1.5 1.5 0 0 1 10 3.5v1A1.5 1.5 0 0 1 8.5 6v1H14a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0V8h-5v1.5a.5.5 0 0 1-1 0V8H2v.5a.5.5 0 0 1-1 0v-1A.5.5 0 0 1 1.5 7H7V6A1.5 1.5 0 0 1 6 4.5zm-5 7A1.5 1.5 0 0 1 2.5 9h1A1.5 1.5 0 0 1 5 10.5v1A1.5 1.5 0 0 1 3.5 13h-1A1.5 1.5 0 0 1 1 11.5zm6 0A1.5 1.5 0 0 1 8.5 9h1a1.5 1.5 0 0 1 1.5 1.5v1A1.5 1.5 0 0 1 9.5 13h-1A1.5 1.5 0 0 1 7 11.5zm6 0a1.5 1.5 0 0 1 1.5-1.5h1a1.5 1.5 0 0 1 1.5 1.5v1a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5z"/></svg>`],
      ["payment.html", "Payments & Collections", `<svg viewBox="0 0 16 16" fill="currentColor" class="app-sidebar-icon"><path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4"/><path d="M0 4a1 1 0 0 1 1-1h14a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1zm3 0a2 2 0 0 1-2 2v4a2 2 0 0 1 2 2h10a2 2 0 0 1 2-2V6a2 2 0 0 1-2-2z"/></svg>`]
    ]
  },
  {
    heading: "SALES & REPORTS",
    items: [
      ["sales.html", "Sales Register", `<svg viewBox="0 0 16 16" fill="currentColor" class="app-sidebar-icon"><path d="M0 1.5A.5.5 0 0 1 .5 1H2a.5.5 0 0 1 .485.379L2.89 3H14.5a.5.5 0 0 1 .491.592l-1.5 8A.5.5 0 0 1 13 12H4a.5.5 0 0 1-.491-.408L2.01 3.607 1.61 2H.5a.5.5 0 0 1-.5-.5M3.102 4l1.313 7h8.17l1.313-7zM5 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4m7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4"/></svg>`],
      ["reports.html", "Financial Reports", `<svg viewBox="0 0 16 16" fill="currentColor" class="app-sidebar-icon"><path d="M4 11H2v3h2zm5-4H7v7h2zm5-5h-2v12h2zm-2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM6 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zm-5 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z"/></svg>`]
    ]
  }
];

const pageTitles = {
  "index.html": "Dashboard Overview",
  "role.html": "Role Management",
  "user.html": "User Accounts",
  "product.html": "Product Master File",
  "product_category.html": "Product Categories",
  "pos_terminal.html": "POS Terminals",
  "ar_customer.html": "Accounts Receivable Customers",
  "ar_customer_type.html": "Customer Types",
  "payment.html": "Payments & Collections",
  "suki_card.html": "Suki Loyalty Cards",
  "sales.html": "POS Sales Register",
  "reports.html": "Financial Reports",
  "settings.html": "System Settings"
};

const user = await requirePageRole(permissions[page] || []);
if (user) {
  const session = await getSession();
  if (user.role_name === "Cashier") {
    if (page === "terminal_select.html" || page === "index.html") {
      window.location.replace("sales.html");
    }
  } else if (page === "terminal_select.html") {
    window.location.replace("index.html");
  }
  renderNavigation(user, session);
}

function renderNavigation(currentUser, session) {
  const nav = document.querySelector(".navbar");
  if (!nav) return;

  // CASHIER: PRESERVE EXACT DEDICATED POS HEADER (PHASE 1 ACCEPTED)
  if (currentUser.role_name === "Cashier") {
    renderCashierNavbar(nav, currentUser, session);
    return;
  }

  // ADMIN, MANAGER, AR STAFF: UNIFIED PROFESSIONAL SIDEBAR & TOPBAR LAYOUT
  renderSidebarLayout(nav, currentUser, session);
}

function renderSidebarLayout(existingNav, currentUser, session) {
  // Ensure app-theme stylesheet is attached
  if (!document.getElementById("app-theme-css")) {
    const link = document.createElement("link");
    link.id = "app-theme-css";
    link.rel = "stylesheet";
    link.href = "./css/app-theme.css?v=4";
    document.head.appendChild(link);
  }

  document.body.classList.add("has-app-sidebar");

  // Create Backdrop for mobile drawer
  const backdrop = document.createElement("div");
  backdrop.id = "app-sidebar-backdrop";
  backdrop.addEventListener("click", closeSidebar);

  // Create Sidebar
  const sidebar = document.createElement("aside");
  sidebar.id = "app-sidebar";

  // Sidebar Brand Header
  const brand = document.createElement("a");
  brand.href = "index.html";
  brand.className = "app-sidebar-brand";
  brand.innerHTML = `
    <span class="app-sidebar-brand-badge">POS-AR</span>
    <div>
      <div class="app-sidebar-brand-title">Retail Manager</div>
      <div class="app-sidebar-brand-sub">Master Suite</div>
    </div>
  `;
  sidebar.appendChild(brand);

  // Sidebar Scrollable Nav
  const scrollContainer = document.createElement("div");
  scrollContainer.className = "app-sidebar-scroll";

  navigationSections.forEach((sec) => {
    // Filter items permitted for this role
    const allowed = sec.items.filter(([href]) => permissions[href]?.includes(currentUser.role_name));
    if (!allowed.length) return;

    const heading = document.createElement("div");
    heading.className = "app-sidebar-heading";
    heading.textContent = sec.heading;
    scrollContainer.appendChild(heading);

    const ul = document.createElement("ul");
    ul.className = "app-sidebar-nav";

    allowed.forEach(([href, label, iconSvg]) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = href;
      a.className = `app-sidebar-link${page === href ? " active" : ""}`;
      if (page === href) a.setAttribute("aria-current", "page");
      a.innerHTML = `${iconSvg}<span>${label}</span>`;
      li.appendChild(a);
      ul.appendChild(li);
    });

    scrollContainer.appendChild(ul);
  });

  sidebar.appendChild(scrollContainer);

  // Sidebar Footer: Logged-in Staff (Single logout control is in Topbar header)
  const footer = document.createElement("div");
  footer.className = "app-sidebar-footer";
  footer.innerHTML = `
    <div class="app-sidebar-user-info">
      <div class="app-sidebar-user-name" title="${currentUser.first_name} ${currentUser.last_name}">
        ${currentUser.first_name} ${currentUser.last_name}
      </div>
      <div class="app-sidebar-user-role">${currentUser.role_name}</div>
    </div>
  `;
  sidebar.appendChild(footer);

  // Create Topbar
  const topbar = document.createElement("header");
  topbar.id = "app-topbar";

  const topbarLeft = document.createElement("div");
  topbarLeft.className = "app-topbar-left";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.id = "btn-sidebar-toggle";
  toggleBtn.className = "app-topbar-toggle";
  toggleBtn.setAttribute("aria-label", "Toggle sidebar menu");
  toggleBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
      <path fill-rule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5"/>
    </svg>
  `;
  toggleBtn.addEventListener("click", toggleSidebar);

  const title = document.createElement("h1");
  title.className = "app-topbar-title";
  title.textContent = pageTitles[page] || "Retail Management";

  topbarLeft.append(toggleBtn, title);

  const topbarRight = document.createElement("div");
  topbarRight.className = "app-topbar-right";

  const rolePill = document.createElement("span");
  const roleBadgeClass =
    currentUser.role_name === "Admin"
      ? "bg-primary text-white"
      : currentUser.role_name === "Manager"
      ? "bg-info text-dark"
      : currentUser.role_name === "Supervisor"
      ? "bg-warning text-dark"
      : "bg-success text-white";
  rolePill.className = `badge app-topbar-role-badge ${roleBadgeClass}`;
  rolePill.textContent = currentUser.role_name;

  const topbarLogout = document.createElement("button");
  topbarLogout.type = "button";
  topbarLogout.id = "btn-topbar-logout";
  topbarLogout.className = "btn btn-outline-danger btn-sm app-topbar-logout-btn";
  topbarLogout.setAttribute("data-action", "logout");
  topbarLogout.textContent = "Logout";

  topbarRight.append(rolePill, topbarLogout);
  topbar.append(topbarLeft, topbarRight);

  // Replace existing <nav> with clean layout nodes
  existingNav.replaceWith(backdrop, sidebar, topbar);

  // Wire Escape key to close mobile sidebar if open
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("sidebar-open")) {
      closeSidebar();
    }
  });

  hideUnauthorizedDashboardCards(currentUser.role_name);
  addLogout(currentUser);
}

function toggleSidebar() {
  document.body.classList.toggle("sidebar-open");
}

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
}

function renderCashierNavbar(nav, currentUser, session) {
  nav.className = "navbar navbar-expand-lg navbar-dark bg-dark sticky-top app-navbar";
  nav.replaceChildren();

  const container = document.createElement("div");
  container.className = "container-fluid px-3";

  // Brand / Title
  const brand = document.createElement("span");
  brand.className = "navbar-brand fw-bold mb-0 text-white d-flex align-items-center gap-2";
  brand.innerHTML = `<span class="badge bg-primary px-2 py-1">POS</span> <span class="fs-6 fs-md-5">Cashier Workspace</span>`;
  container.appendChild(brand);

  // Mobile toggle button
  const toggle = document.createElement("button");
  toggle.className = "navbar-toggler";
  toggle.type = "button";
  toggle.setAttribute("data-bs-toggle", "collapse");
  toggle.setAttribute("data-bs-target", "#cashier-navbar-collapse");
  toggle.setAttribute("aria-controls", "cashier-navbar-collapse");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Toggle navigation");
  toggle.innerHTML = `<span class="navbar-toggler-icon"></span>`;
  container.appendChild(toggle);

  const collapse = document.createElement("div");
  collapse.className = "collapse navbar-collapse";
  collapse.id = "cashier-navbar-collapse";

  // Navigation items: Checkout, Recent Sales, Receipts
  const navList = document.createElement("ul");
  navList.className = "navbar-nav me-auto mb-2 mb-lg-0 gap-1 mt-2 mt-lg-0";

  const tabs = [
    { id: "nav-tab-checkout", label: "Checkout / POS", view: "view-checkout", active: true },
    { id: "nav-tab-recent", label: "Recent Completed Sales", view: "view-recent-sales", active: false },
    { id: "nav-tab-receipts", label: "Receipts & Reprinting", view: "view-receipts", active: false }
  ];

  tabs.forEach((tab) => {
    const li = document.createElement("li");
    li.className = "nav-item";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = tab.id;
    btn.className = `btn btn-sm text-start w-100 ${tab.active ? "btn-primary active fw-bold text-white" : "btn-outline-secondary text-light border-0"}`;
    btn.textContent = tab.label;
    btn.addEventListener("click", () => {
      document.querySelectorAll("#cashier-navbar-collapse .btn-sm").forEach((b) => {
        if (b.id?.startsWith("nav-tab-")) {
          b.className = "btn btn-sm btn-outline-secondary text-start w-100 text-light border-0";
        }
      });
      btn.className = "btn btn-sm btn-primary active fw-bold text-white text-start w-100";
      window.dispatchEvent(new CustomEvent("pos:switch-view", { detail: { view: tab.view } }));
    });
    li.appendChild(btn);
    navList.appendChild(li);
  });
  collapse.appendChild(navList);

  // Right Side Info: Active Terminal, Cashier Name, Logout
  const rightList = document.createElement("div");
  rightList.className = "d-flex flex-wrap align-items-center gap-2 mt-2 mt-lg-0";

  const termSpan = document.createElement("span");
  termSpan.className = "badge bg-secondary text-light px-2 py-1";
  termSpan.id = "cashier-nav-terminal";
  termSpan.setAttribute("aria-readonly", "true");
  termSpan.title = "Auto-assigned POS Terminal (Read-Only)";
  termSpan.textContent = session?.selectedTerminalName || "Loading Terminal...";

  const userSpan = document.createElement("span");
  userSpan.className = "navbar-text text-light small fw-semibold me-2";
  userSpan.textContent = `${currentUser.first_name} ${currentUser.last_name}`;

  const logoutBtn = document.createElement("button");
  logoutBtn.type = "button";
  logoutBtn.id = "btn-cashier-logout";
  logoutBtn.className = "btn btn-outline-danger btn-sm px-3";
  logoutBtn.textContent = "Logout";
  logoutBtn.addEventListener("click", async () => {
    await confirmLogout();
  });

  rightList.append(termSpan, userSpan, logoutBtn);
  collapse.appendChild(rightList);
  container.appendChild(collapse);
  nav.appendChild(container);
}

function hideUnauthorizedDashboardCards(roleName) {
  document.querySelectorAll("a[href]").forEach((link) => {
    if (link.closest("#app-sidebar") || link.closest(".navbar")) return;
    const target = link.getAttribute("href").split("#")[0].split("?")[0];
    const targetPage = target.substring(target.lastIndexOf("/") + 1);
    const allowedRoles = permissions[targetPage];
    if (!allowedRoles || allowedRoles.includes(roleName)) return;
    const card = link.closest(".col-md-3") || link.closest(".card");
    if (card) card.remove();
  });
}
