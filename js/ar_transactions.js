// AR Transaction Ledger Module & Running Balance Engine
const baseApiUrl =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost/masterfile/api"
    : "/masterfile/api";

let allCustomers = [];
let currentCustomer = null;
let currentLedgerData = null;
let currentAccountType = "AR";

// Configurable Account Balance Rules:
// AR (Asset / Receivable): Normal balance is DEBIT (+Dr, -Cr).
// AP (Liability / Payable): Normal balance is CREDIT (+Cr, -Dr).
export const ACCOUNT_RULES = {
  AR: {
    normalBalance: "Debit",
    computeBalance: (prevBal, debit, credit) => Number((prevBal + debit - credit).toFixed(2))
  },
  AP: {
    normalBalance: "Credit",
    computeBalance: (prevBal, debit, credit) => Number((prevBal + credit - debit).toFixed(2))
  }
};

const escapeHtml = (text) => {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  return "₱" + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Initialize Page
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  loadCustomerList();
});

const setupEventListeners = () => {
  document.getElementById("ledger-customer-select")?.addEventListener("change", (e) => {
    const cid = e.target.value;
    if (cid) {
      loadCustomerLedger(cid);
    } else {
      resetLedgerView();
    }
  });

  document.getElementById("account-type-select")?.addEventListener("change", (e) => {
    currentAccountType = e.target.value || "AR";
    const cid = document.getElementById("ledger-customer-select")?.value;
    if (cid) loadCustomerLedger(cid);
  });

  document.getElementById("ledger-search-input")?.addEventListener("input", filterLedgerRows);

  document.getElementById("btn-reload-ledger")?.addEventListener("click", () => {
    const cid = document.getElementById("ledger-customer-select")?.value;
    if (cid) loadCustomerLedger(cid);
  });

  // Credit / Debit Memo Form Handlers
  document.getElementById("btn-open-memo-modal")?.addEventListener("click", prepareMemoForm);
  document.getElementById("memo_customer_id")?.addEventListener("change", populateMemoInvoices);
  document.getElementById("memo_type")?.addEventListener("change", () => {
    const memoType = document.getElementById("memo_type")?.value;
    const refEl = document.getElementById("memo_reference_no");
    if (refEl && (!refEl.value || refEl.value.startsWith("CM-") || refEl.value.startsWith("DM-"))) {
      const prefix = memoType === "debit_memo" ? "DM" : "CM";
      refEl.value = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;
    }
  });

  document.getElementById("memo-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitArMemo();
  });
};

const loadCustomerList = async () => {
  try {
    const { data } = await axios.get(`${baseApiUrl}/payment.php?operation=getCustomerLedger`, {
      withCredentials: true
    });

    if (data.returnValue === 1 && Array.isArray(data.customers)) {
      allCustomers = data.customers;
      populateCustomerSelects();

      // Check URL parameters for pre-selected customer
      const urlParams = new URLSearchParams(window.location.search);
      const urlCustId = urlParams.get("customerId") || urlParams.get("ar_customer_id");

      if (urlCustId && allCustomers.some((c) => String(c.ar_customer_id) === String(urlCustId))) {
        document.getElementById("ledger-customer-select").value = String(urlCustId);
        loadCustomerLedger(urlCustId);
      } else if (allCustomers.length > 0) {
        // Default to first customer with open balance or first customer
        const preferred = allCustomers.find((c) => Number(c.current_balance) > 0) || allCustomers[0];
        document.getElementById("ledger-customer-select").value = String(preferred.ar_customer_id);
        loadCustomerLedger(preferred.ar_customer_id);
      }
    }
  } catch (err) {
    console.error("Failed to load customer list:", err);
    Swal.fire("Error", "Unable to load customer list. Please check your connection.", "error");
  }
};

const populateCustomerSelects = () => {
  const ledgerSelect = document.getElementById("ledger-customer-select");
  const memoSelect = document.getElementById("memo_customer_id");

  let ledgerHtml = '<option value="">-- SELECT AR CUSTOMER ACCOUNT --</option>';
  let memoHtml = '<option value="">-- SELECT CUSTOMER --</option>';

  allCustomers.forEach((c) => {
    const balFormatted = formatCurrency(c.current_balance);
    ledgerHtml += `<option value="${c.ar_customer_id}">${escapeHtml(c.customer_name)} (Bal: ${balFormatted})</option>`;
    memoHtml += `<option value="${c.ar_customer_id}">${escapeHtml(c.customer_name)}</option>`;
  });

  if (ledgerSelect) ledgerSelect.innerHTML = ledgerHtml;
  if (memoSelect) memoSelect.innerHTML = memoHtml;
};

const loadCustomerLedger = async (customerId) => {
  if (!customerId) return;
  const tbody = document.getElementById("ledger-table-body");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center p-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted small">Computing running balance ledger...</div></td></tr>`;
  }

  try {
    const { data } = await axios.get(
      `${baseApiUrl}/payment.php?operation=getCustomerLedger&customerId=${customerId}&accountType=${currentAccountType}`,
      { withCredentials: true }
    );

    if (data.returnValue === 1) {
      currentLedgerData = data;
      currentCustomer = data.customer;
      renderAccountSummary(data);
      renderLedgerTable(data.rows || []);
    } else {
      Swal.fire("Notice", data.message || "Failed to load account ledger.", "warning");
    }
  } catch (err) {
    console.error("Failed to load account ledger:", err);
    Swal.fire("Error", "Error communicating with AR Ledger server.", "error");
  }
};

const renderAccountSummary = (data) => {
  const cust = data.customer;
  document.getElementById("sum-customer-name").textContent = cust.customer_name || "—";
  document.getElementById("sum-credit-limit").textContent = formatCurrency(cust.credit_limit || 0);
  document.getElementById("sum-total-dr").textContent = formatCurrency(data.totalDebits || 0);
  document.getElementById("sum-total-cr").textContent = formatCurrency(data.totalCredits || 0);
  document.getElementById("sum-ledger-balance").textContent = formatCurrency(data.finalBalance || 0);
  document.getElementById("sum-system-balance").textContent = formatCurrency(data.currentBalance || 0);

  const statusEl = document.getElementById("sum-match-status");
  if (statusEl) {
    if (data.matches) {
      statusEl.innerHTML = '<span class="badge bg-success py-1 px-2">✓ Balance In Sync (100% Match)</span>';
    } else {
      statusEl.innerHTML = '<span class="badge bg-danger py-1 px-2">⚠ Variance Detected</span>';
    }
  }

  // Update table footer totals
  document.getElementById("foot-total-dr").textContent = formatCurrency(data.totalDebits || 0);
  document.getElementById("foot-total-cr").textContent = formatCurrency(data.totalCredits || 0);
  document.getElementById("foot-final-bal").textContent = formatCurrency(data.finalBalance || 0);
  document.getElementById("ledger-table-foot").style.display = "";
};

const renderLedgerTable = (rows) => {
  const tbody = document.getElementById("ledger-table-body");
  const countEl = document.getElementById("ledger-row-count");
  if (!tbody) return;

  if (countEl) countEl.textContent = `${rows.length} transaction${rows.length === 1 ? "" : "s"}`;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted p-5">No transactions recorded for this account.</td></tr>`;
    document.getElementById("ledger-table-foot").style.display = "none";
    return;
  }

  const getBadgeClass = (type) => {
    if (type === "Invoice") return "badge-type-Invoice";
    if (type === "Payment") return "badge-type-Payment";
    if (type === "Credit Memo") return "badge-type-CreditMemo";
    if (type === "Debit Memo") return "badge-type-DebitMemo";
    if (type === "Overdue Interest") return "badge-type-Interest";
    if (type === "Overdue Penalty") return "badge-type-Penalty";
    return "badge-type-BeginningBalance";
  };

  tbody.innerHTML = rows
    .map((r) => {
      const drText = r.debit > 0 ? `<span class="text-primary font-monospace fw-bold">+${formatCurrency(r.debit)}</span>` : "—";
      const crText = r.credit > 0 ? `<span class="text-success font-monospace fw-bold">-${formatCurrency(r.credit)}</span>` : "—";
      const balClass = r.balance > 0 ? "text-danger" : "text-dark";

      return `
        <tr>
          <td>
            <div class="fw-semibold">${escapeHtml(r.date)}</div>
            <span class="badge ${getBadgeClass(r.type)} small px-2 py-1 mt-1">${escapeHtml(r.type)}</span>
          </td>
          <td class="font-monospace fw-bold">${escapeHtml(r.reference_no || "—")}</td>
          <td class="small">${escapeHtml(r.description || "—")}</td>
          <td class="text-end font-monospace">${drText}</td>
          <td class="text-end font-monospace">${crText}</td>
          <td class="text-end font-monospace fw-bold ${balClass} h6 mb-0">${formatCurrency(r.balance)}</td>
        </tr>
      `;
    })
    .join("");
};

const filterLedgerRows = () => {
  if (!currentLedgerData || !Array.isArray(currentLedgerData.rows)) return;
  const query = (document.getElementById("ledger-search-input")?.value || "").toLowerCase().trim();

  if (!query) {
    renderLedgerTable(currentLedgerData.rows);
    return;
  }

  const filtered = currentLedgerData.rows.filter((r) => {
    return (
      String(r.date || "").toLowerCase().includes(query) ||
      String(r.type || "").toLowerCase().includes(query) ||
      String(r.reference_no || "").toLowerCase().includes(query) ||
      String(r.description || "").toLowerCase().includes(query) ||
      String(r.debit || "").includes(query) ||
      String(r.credit || "").includes(query) ||
      String(r.balance || "").includes(query)
    );
  });

  renderLedgerTable(filtered);
};

const resetLedgerView = () => {
  currentCustomer = null;
  currentLedgerData = null;
  document.getElementById("sum-customer-name").textContent = "Please select a customer";
  document.getElementById("sum-credit-limit").textContent = "₱0.00";
  document.getElementById("sum-total-dr").textContent = "₱0.00";
  document.getElementById("sum-total-cr").textContent = "₱0.00";
  document.getElementById("sum-ledger-balance").textContent = "₱0.00";
  document.getElementById("sum-system-balance").textContent = "₱0.00";
  document.getElementById("sum-match-status").innerHTML = '<span class="badge bg-secondary">Awaiting Account</span>';
  document.getElementById("ledger-table-foot").style.display = "none";
  document.getElementById("ledger-table-body").innerHTML = `
    <tr><td colspan="6" class="text-center text-muted p-5">Select an AR customer account above to view its transaction ledger.</td></tr>
  `;
};

// ==========================================
// Credit / Debit Memo Flow (Direct Posting)
// ==========================================
const prepareMemoForm = () => {
  document.getElementById("memo-form")?.reset();
  const activeCid = document.getElementById("ledger-customer-select")?.value;
  const memoCustSelect = document.getElementById("memo_customer_id");
  if (memoCustSelect && activeCid) {
    memoCustSelect.value = activeCid;
  }
  populateMemoInvoices();

  const refEl = document.getElementById("memo_reference_no");
  if (refEl) {
    refEl.value = `CM-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;
  }
};

const populateMemoInvoices = async () => {
  const custId = document.getElementById("memo_customer_id")?.value;
  const invSelect = document.getElementById("memo_invoice_id");
  if (!invSelect) return;

  invSelect.innerHTML = '<option value="">-- Auto-select oldest open invoice --</option>';
  if (!custId) return;

  try {
    const { data } = await axios.get(`${baseApiUrl}/payment.php?operation=getAllInvoices`, { withCredentials: true });
    if (Array.isArray(data)) {
      const openInvs = data.filter((i) => String(i.ar_customer_id) === String(custId) && Number(i.balance) > 0);
      openInvs.forEach((inv) => {
        invSelect.innerHTML += `<option value="${inv.ar_invoice_id}">Inv #${escapeHtml(inv.invoice_number)} — Open Bal: ${formatCurrency(inv.balance)}</option>`;
      });
    }
  } catch (err) {
    console.warn("Could not load customer open invoices:", err);
  }
};

const submitArMemo = async () => {
  const memoType = document.getElementById("memo_type")?.value || "credit_memo";
  const customerId = document.getElementById("memo_customer_id")?.value;
  const invoiceId = document.getElementById("memo_invoice_id")?.value;
  const amount = parseFloat(document.getElementById("memo_amount")?.value || "0");
  const referenceNo = (document.getElementById("memo_reference_no")?.value || "").trim();
  const reason = (document.getElementById("memo_reason")?.value || "").trim();

  if (!customerId || !amount || amount <= 0 || !referenceNo || !reason) {
    Swal.fire("Validation Error", "Please fill in all required fields (Customer, positive Amount, Reference #, and Reason).", "warning");
    return;
  }

  try {
    const payload = {
      memoType,
      customerId: parseInt(customerId, 10),
      invoiceId: invoiceId ? parseInt(invoiceId, 10) : null,
      amount: amount.toFixed(2),
      referenceNo,
      reason
    };

    const formData = new FormData();
    formData.append("operation", "createArMemo");
    formData.append("json", JSON.stringify(payload));

    const { data } = await axios.post(`${baseApiUrl}/payment.php`, formData, { withCredentials: true });

    if (data.returnValue === 1) {
      bootstrap.Modal.getInstance(document.getElementById("memo-modal"))?.hide();

      Swal.fire({
        icon: "success",
        title: `${memoType === "credit_memo" ? "Credit Memo" : "Debit Memo"} Posted`,
        text: `Memo ${referenceNo} posted successfully. Account balance updated.`,
        timer: 2000
      });

      // Refresh customer list and active ledger
      await loadCustomerList();
      document.getElementById("ledger-customer-select").value = String(customerId);
      await loadCustomerLedger(customerId);
    } else {
      Swal.fire("Posting Failed", data.message || "Failed to post memo.", "error");
    }
  } catch (err) {
    console.error("Failed to post memo:", err);
    Swal.fire("Posting Error", err.response?.data?.message || "Server error while posting memo.", "error");
  }
};

