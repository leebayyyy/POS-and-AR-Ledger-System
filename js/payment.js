import { showToast, showError, showSuccess } from "./swal-helper.js";

const baseApiUrl = "api";

let openInvoices = [];
let paymentMethods = [];
let customersList = [];
let allInvoicesData = [];
let allPaymentsData = [];
let allLedgerEntriesData = [];
let overduePolicy = {
  default_term_days: 30,
  interest_mode: "fixed",
  interest_rate_pct: 5.0,
  penalty_mode: "flat",
  penalty_value: 50.0,
  block_overdue_accounts: 1
};
let canRecordPayment = false;
let currentPreview = null;

let invoiceSortDirection = "desc";
let paymentSortDirection = "desc";

document.addEventListener("DOMContentLoaded", () => {
  sessionStorage.setItem("baseAPIUrl", baseApiUrl);

  const form = document.getElementById("payment-form");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitFifoPayment();
    });
  }

  document.getElementById("ar_customer_id")?.addEventListener("change", handleCustomerChange);
  document.getElementById("btn-add")?.addEventListener("click", preparePaymentForm);
  document.getElementById("btn-pay-full")?.addEventListener("click", handlePayFullDebt);
  document.getElementById("btn-preview-allocation")?.addEventListener("click", previewAllocation);

  // WP-5 Memo Modal Listeners
  document.getElementById("btn-open-memo-modal")?.addEventListener("click", () => prepareMemoForm());
  document.getElementById("memo_customer_id")?.addEventListener("change", populateMemoInvoiceSelect);
  document.getElementById("memo-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitArMemo();
  });

  document.getElementById("btn-open-overdue-policy")?.addEventListener("click", prepareOverduePolicyModal);

  // Tab 3 Ledger View Mode Toggles
  document.getElementById("btn-ledger-view-running")?.addEventListener("click", () => {
    ledgerViewMode = "running";
    document.getElementById("btn-ledger-view-running")?.classList.add("active");
    document.getElementById("btn-ledger-view-memos")?.classList.remove("active");
    filterLedgerEntries();
  });
  document.getElementById("btn-ledger-view-memos")?.addEventListener("click", () => {
    ledgerViewMode = "memos";
    document.getElementById("btn-ledger-view-memos")?.classList.add("active");
    document.getElementById("btn-ledger-view-running")?.classList.remove("active");
    filterLedgerEntries();
  });
  document.getElementById("overdue-policy-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitOverduePolicy();
  });
  document.getElementById("overdue_target_invoice_id")?.addEventListener("change", previewOverdueChargeUI);
  document.getElementById("btn-preview-overdue-charge")?.addEventListener("click", previewOverdueChargeUI);
  document.getElementById("btn-apply-overdue-charge")?.addEventListener("click", applyOverdueChargeUI);

  // Trigger preview on amount Enter or blur
  document.getElementById("amount")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!currentPreview) {
        previewAllocation();
      } else {
        submitFifoPayment();
      }
    }
  });

  // Modal-level keyboard handlers & focus restoration
  ["payment-modal", "memo-modal", "overdue-policy-modal", "receipt-modal"].forEach((mid) => {
    const modalEl = document.getElementById(mid);
    if (!modalEl) return;
    modalEl.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key === "Home" || e.code === "Home") {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }
    });
    modalEl.addEventListener("shown.bs.modal", () => {
      const firstInput = modalEl.querySelector("select:not([disabled]), input:not([type='hidden']):not([disabled])");
      firstInput?.focus();
    });
  });

  // Global Zero-Mouse Keyboard Shortcuts for Payments, Memos & Overdue Engine
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "p" || e.key === "P")) {
      e.preventDefault();
      preparePaymentForm();
      bootstrap.Modal.getOrCreateInstance(document.getElementById("payment-modal")).show();
    } else if (e.altKey && (e.key === "m" || e.key === "M")) {
      e.preventDefault();
      prepareMemoForm();
      bootstrap.Modal.getOrCreateInstance(document.getElementById("memo-modal")).show();
    } else if (e.altKey && (e.key === "o" || e.key === "O")) {
      e.preventDefault();
      prepareOverduePolicyModal();
      bootstrap.Modal.getOrCreateInstance(document.getElementById("overdue-policy-modal")).show();
    } else if (e.altKey && e.key === "1") {
      e.preventDefault();
      document.getElementById("pills-invoices-tab")?.click();
    } else if (e.altKey && e.key === "2") {
      e.preventDefault();
      document.getElementById("pills-payments-tab")?.click();
    } else if (e.altKey && e.key === "3") {
      e.preventDefault();
      document.getElementById("pills-memos-tab")?.click();
    }
  });

  // Search & Filter Listeners
  document.getElementById("invoice-customer-filter")?.addEventListener("change", filterInvoices);
  document.getElementById("invoice-search-filter")?.addEventListener("input", filterInvoices);
  document.getElementById("payment-search-filter")?.addEventListener("input", filterPayments);
  document.getElementById("memo-customer-filter")?.addEventListener("change", filterLedgerEntries);
  document.getElementById("memo-search-filter")?.addEventListener("input", filterLedgerEntries);

  loadPaymentData();
  loadInvoicesData();
  displayRecords();
  loadLedgerEntries();
});

const loadPaymentData = async () => {
  try {
    const response = await axios.get(`${baseApiUrl}/payment.php`, {
      params: { operation: "getPaymentFormData" },
    });
    openInvoices = response.data.invoices || [];
    customersList = response.data.customers || [];
    paymentMethods = response.data.paymentMethods || [];
    if (response.data.overduePolicy) {
      overduePolicy = { ...overduePolicy, ...response.data.overduePolicy };
    }
    canRecordPayment = !!response.data.canRecordPayment;
    document.getElementById("btn-add")?.classList.toggle("d-none", !canRecordPayment);

    populateCustomerDropdown();
    populateMemoCustomerDropdown();
    populateSelect("payment_method_id", paymentMethods, "payment_method_id", "-- SELECT PAYMENT METHOD --", (method) => method.method_name);
  } catch (error) {
    console.error(error);
    showError("Unable to load payment options.");
  }
};

const populateCustomerDropdown = () => {
  const select = document.getElementById("ar_customer_id");
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">-- SELECT AR CUSTOMER --</option>';

  customersList.forEach((cust) => {
    const debt = Number(cust.total_debt || 0);
    const invCount = Number(cust.open_invoice_count || 0);
    const opt = document.createElement("option");
    opt.value = cust.ar_customer_id;
    opt.textContent = `${cust.customer_name} ${debt > 0 ? `(Debt: ₱${debt.toFixed(2)} — ${invCount} open)` : "(No open balance)"}`;
    opt.dataset.debt = debt;
    opt.dataset.creditLimit = cust.credit_limit || 0;
    opt.dataset.invCount = invCount;
    select.appendChild(opt);
  });

  if (currentVal) select.value = currentVal;
};

const populateMemoCustomerDropdown = () => {
  const select = document.getElementById("memo_customer_id");
  const filterSelect = document.getElementById("memo-customer-filter");
  if (select) {
    const cur = select.value;
    select.innerHTML = '<option value="">-- SELECT CUSTOMER --</option>';
    customersList.forEach((c) => {
      const debt = Number(c.total_debt || 0);
      const opt = document.createElement("option");
      opt.value = c.ar_customer_id;
      opt.textContent = `${c.customer_name} (Open Debt: ₱${debt.toFixed(2)})`;
      select.appendChild(opt);
    });
    if (cur) select.value = cur;
  }
  if (filterSelect) {
    const curF = filterSelect.value;
    filterSelect.innerHTML = '<option value="">-- All Customers --</option>';
    customersList.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.ar_customer_id;
      opt.textContent = c.customer_name;
      filterSelect.appendChild(opt);
    });
    if (curF) filterSelect.value = curF;
  }
};

const populateMemoInvoiceSelect = () => {
  const custId = document.getElementById("memo_customer_id")?.value || "";
  const invSelect = document.getElementById("memo_invoice_id");
  if (!invSelect) return;
  invSelect.innerHTML = '<option value="">-- Auto-select oldest open invoice --</option>';
  const matching = allInvoicesData.filter(
    (inv) => String(inv.ar_customer_id) === String(custId) && Number(inv.balance || 0) > 0
  );
  matching.forEach((inv) => {
    const opt = document.createElement("option");
    opt.value = inv.ar_invoice_id;
    opt.textContent = `${inv.invoice_number} — Balance: ₱${Number(inv.balance).toFixed(2)} (Due: ${inv.due_date || "—"})`;
    invSelect.appendChild(opt);
  });
  if (matching.length === 1) {
    invSelect.value = matching[0].ar_invoice_id;
  }
};

const prepareMemoForm = (customerId = "", invoiceId = "", memoType = "credit_memo") => {
  document.getElementById("memo-form")?.reset();
  populateMemoCustomerDropdown();
  const typeEl = document.getElementById("memo_type");
  if (typeEl) typeEl.value = memoType;
  const custEl = document.getElementById("memo_customer_id");
  if (custEl && customerId) {
    custEl.value = String(customerId);
  }
  populateMemoInvoiceSelect();
  const invEl = document.getElementById("memo_invoice_id");
  if (invEl && invoiceId) {
    invEl.value = String(invoiceId);
  }
  const refEl = document.getElementById("memo_reference_no");
  if (refEl && !refEl.value) {
    const prefix = memoType === "debit_memo" ? "DM" : "CM";
    refEl.value = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;
  }
};

const submitArMemo = async () => {
  const memoType = document.getElementById("memo_type")?.value || "credit_memo";
  const customerId = document.getElementById("memo_customer_id")?.value || "";
  const invoiceId = document.getElementById("memo_invoice_id")?.value || "";
  const amount = parseFloat(document.getElementById("memo_amount")?.value || "0");
  const referenceNo = (document.getElementById("memo_reference_no")?.value || "").trim();
  const reason = (document.getElementById("memo_reason")?.value || "").trim();

  if (!customerId || !amount || amount <= 0 || !referenceNo || !reason) {
    showError("Please complete Customer, positive Amount, Reference Number, and Reason.");
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
      await Promise.all([loadPaymentData(), loadInvoicesData(), loadLedgerEntries()]);
      showSuccess(
        `${memoType === "credit_memo" ? "Credit Memo" : "Debit Memo"} (${referenceNo}) posted.\nNew Invoice Balance: ₱${Number(data.entry?.balance_after || 0).toFixed(2)}`,
        "AR Memo Posted"
      );
    } else {
      showError(data.message || "Unable to post memo.");
    }
  } catch (error) {
    console.error(error);
    showError(error.response?.data?.message || "Failed to post Credit/Debit Memo.");
  }
};

const prepareOverduePolicyModal = async () => {
  try {
    const { data } = await axios.get(`${baseApiUrl}/payment.php`, {
      params: { operation: "getOverduePolicy" },
      withCredentials: true
    });
    if (data.policy) {
      overduePolicy = { ...overduePolicy, ...data.policy };
    }
  } catch (err) {
    console.error(err);
  }

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setVal("policy_default_term_days", overduePolicy.default_term_days ?? 30);
  setVal("policy_interest_mode", overduePolicy.interest_mode ?? "fixed");
  setVal("policy_interest_rate_pct", Number(overduePolicy.interest_rate_pct ?? 5).toFixed(2));
  setVal("policy_penalty_mode", overduePolicy.penalty_mode ?? "flat");
  setVal("policy_penalty_value", Number(overduePolicy.penalty_value ?? 50).toFixed(2));
  const blockChk = document.getElementById("policy_block_overdue");
  if (blockChk) blockChk.checked = Number(overduePolicy.block_overdue_accounts ?? 1) === 1;

  const invSelect = document.getElementById("overdue_target_invoice_id");
  if (invSelect) {
    invSelect.innerHTML = '<option value="">-- Select Invoice --</option>';
    const openInvs = allInvoicesData.filter((i) => Number(i.balance || 0) > 0);
    openInvs.forEach((inv) => {
      const opt = document.createElement("option");
      opt.value = inv.ar_invoice_id;
      const ovLabel = Number(inv.days_overdue || 0) > 0 ? `[OVERDUE ${inv.days_overdue}d]` : "[Current]";
      opt.textContent = `${inv.invoice_number} — ${inv.customer_name} — Bal: ₱${Number(inv.balance).toFixed(2)} ${ovLabel}`;
      invSelect.appendChild(opt);
    });
    const firstOverdue = openInvs.find((i) => Number(i.days_overdue || 0) > 0) || openInvs[0];
    if (firstOverdue) {
      invSelect.value = firstOverdue.ar_invoice_id;
      previewOverdueChargeUI();
    }
  }
};

const submitOverduePolicy = async () => {
  const payload = {
    default_term_days: parseInt(document.getElementById("policy_default_term_days")?.value || "30", 10),
    interest_mode: document.getElementById("policy_interest_mode")?.value || "fixed",
    interest_rate_pct: parseFloat(document.getElementById("policy_interest_rate_pct")?.value || "5"),
    penalty_mode: document.getElementById("policy_penalty_mode")?.value || "flat",
    penalty_value: parseFloat(document.getElementById("policy_penalty_value")?.value || "0"),
    block_overdue_accounts: document.getElementById("policy_block_overdue")?.checked ? 1 : 0
  };

  try {
    const formData = new FormData();
    formData.append("operation", "saveOverduePolicy");
    formData.append("json", JSON.stringify(payload));
    const { data } = await axios.post(`${baseApiUrl}/payment.php`, formData, { withCredentials: true });
    if (data.returnValue === 1) {
      overduePolicy = data.policy || payload;
      showToast("Store AR Overdue Policy saved.", "success");
      previewOverdueChargeUI();
    } else {
      showError(data.message || "Unable to save overdue policy.");
    }
  } catch (err) {
    showError(err.response?.data?.message || "Failed to save overdue policy.");
  }
};

const previewOverdueChargeUI = async () => {
  const invoiceId = document.getElementById("overdue_target_invoice_id")?.value;
  const previewBox = document.getElementById("overdue-calc-preview");
  if (!invoiceId || !previewBox) return;

  try {
    const payload = {
      invoiceId: parseInt(invoiceId, 10),
      interest_mode: document.getElementById("policy_interest_mode")?.value || overduePolicy.interest_mode,
      interest_rate_pct: parseFloat(document.getElementById("policy_interest_rate_pct")?.value || overduePolicy.interest_rate_pct),
      penalty_mode: document.getElementById("policy_penalty_mode")?.value || overduePolicy.penalty_mode,
      penalty_value: parseFloat(document.getElementById("policy_penalty_value")?.value || overduePolicy.penalty_value)
    };
    const { data } = await axios.post(
      `${baseApiUrl}/payment.php`,
      new URLSearchParams({ operation: "previewOverdueCharge", json: JSON.stringify(payload) }),
      { withCredentials: true }
    );
    if (data.returnValue === 1 && data.calculation) {
      const c = data.calculation;
      previewBox.innerHTML = `
        <div class="d-flex justify-content-between"><span>Principal Amount:</span><strong>₱${Number(c.principal_amount).toFixed(2)}</strong></div>
        <div class="d-flex justify-content-between"><span>Days Overdue / 30d Periods:</span><strong>${c.days_overdue}d (${c.periods} period(s))</strong></div>
        <div class="d-flex justify-content-between text-primary"><span>Interest (${c.interest_mode.toUpperCase()} @ ${Number(c.interest_rate_pct).toFixed(2)}%):</span><strong>+₱${Number(c.interest_amount).toFixed(2)}</strong></div>
        <div class="d-flex justify-content-between text-danger"><span>Penalty (${c.penalty_mode.toUpperCase()}):</span><strong>+₱${Number(c.penalty_amount).toFixed(2)}</strong></div>
        <hr class="my-1" />
        <div class="d-flex justify-content-between fw-bold"><span>Total Ledger Adjustment:</span><span>+₱${Number(c.total_overdue_charge).toFixed(2)}</span></div>
        <div class="d-flex justify-content-between fw-bold text-danger"><span>Resulting Invoice Balance:</span><span>₱${Number(data.resulting_balance).toFixed(2)}</span></div>
      `;
    }
  } catch (err) {
    previewBox.textContent = err.response?.data?.message || "Unable to preview overdue calculation.";
  }
};

const applyOverdueChargeUI = async () => {
  const invoiceId = document.getElementById("overdue_target_invoice_id")?.value;
  if (!invoiceId) {
    showError("Please select an overdue invoice first.");
    return;
  }
  try {
    const payload = {
      invoiceId: parseInt(invoiceId, 10),
      interest_mode: document.getElementById("policy_interest_mode")?.value || overduePolicy.interest_mode,
      interest_rate_pct: parseFloat(document.getElementById("policy_interest_rate_pct")?.value || overduePolicy.interest_rate_pct),
      penalty_mode: document.getElementById("policy_penalty_mode")?.value || overduePolicy.penalty_mode,
      penalty_value: parseFloat(document.getElementById("policy_penalty_value")?.value || overduePolicy.penalty_value)
    };
    const formData = new FormData();
    formData.append("operation", "applyOverdueCharge");
    formData.append("json", JSON.stringify(payload));
    const { data } = await axios.post(`${baseApiUrl}/payment.php`, formData, { withCredentials: true });
    if (data.returnValue === 1) {
      await Promise.all([loadPaymentData(), loadInvoicesData(), loadLedgerEntries()]);
      showSuccess(
        `Posted explicit overdue adjustment (+₱${Number(data.calculation?.total_overdue_charge || 0).toFixed(2)}) on ${data.invoice_number}.\nNew Balance: ₱${Number(data.new_balance || 0).toFixed(2)}`,
        "Overdue Ledger Adjustment Posted"
      );
      previewOverdueChargeUI();
    } else {
      showError(data.message || "Unable to apply overdue charge.");
    }
  } catch (err) {
    showError(err.response?.data?.message || "Failed to apply overdue charge.");
  }
};

let ledgerViewMode = "running";
let currentCustomerLedgerData = null;

// Configurable Account Balance Rule:
// AR (Asset / Receivable): Normal balance is DEBIT (+Dr, -Cr).
// AP (Liability / Payable): Normal balance is CREDIT (+Cr, -Dr).
const computeRunningBalance = (prevBal, debit, credit, accountType = "AR") => {
  return accountType === "AR"
    ? Number((prevBal + debit - credit).toFixed(2))
    : Number((prevBal + credit - debit).toFixed(2));
};

const loadLedgerEntries = async () => {
  try {
    const { data } = await axios.get(`${baseApiUrl}/payment.php`, {
      params: { operation: "getLedgerEntries" },
      withCredentials: true
    });
    allLedgerEntriesData = Array.isArray(data) ? data : [];
    filterLedgerEntries();
  } catch (err) {
    console.error(err);
  }
};

const filterLedgerEntries = async () => {
  const custId = document.getElementById("memo-customer-filter")?.value || "";
  const query = (document.getElementById("memo-search-filter")?.value || "").toLowerCase().trim();
  const summaryBar = document.getElementById("ledger-account-summary-bar");
  const fullLedgerBtn = document.getElementById("btn-open-full-ledger");

  if (fullLedgerBtn) {
    fullLedgerBtn.href = custId ? `ar_transactions.html?customerId=${custId}` : `ar_transactions.html`;
  }

  if (ledgerViewMode === "running") {
    if (custId) {
      if (summaryBar) summaryBar.classList.remove("d-none");
      try {
        const { data } = await axios.get(`${baseApiUrl}/payment.php`, {
          params: { operation: "getCustomerLedger", customerId: custId, accountType: "AR" },
          withCredentials: true
        });

        if (data.returnValue === 1) {
          currentCustomerLedgerData = data;
          const cust = data.customer;
          document.getElementById("ledger-cust-name").textContent = cust.customer_name || "—";
          document.getElementById("ledger-cust-limit").textContent = `₱${Number(cust.credit_limit || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
          document.getElementById("ledger-cust-dr").textContent = `₱${Number(data.totalDebits || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
          document.getElementById("ledger-cust-cr").textContent = `₱${Number(data.totalCredits || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
          document.getElementById("ledger-cust-bal").textContent = `₱${Number(data.currentBalance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

          const syncBadge = document.getElementById("ledger-sync-badge");
          if (syncBadge) {
            if (data.matches) {
              syncBadge.className = "badge bg-success";
              syncBadge.textContent = "✓ In Sync with System";
            } else {
              syncBadge.className = "badge bg-danger";
              syncBadge.textContent = "⚠ Variance Detected";
            }
          }

          let rows = data.rows || [];
          if (query) {
            rows = rows.filter((r) =>
              String(r.date || "").toLowerCase().includes(query) ||
              String(r.type || "").toLowerCase().includes(query) ||
              String(r.reference_no || "").toLowerCase().includes(query) ||
              String(r.description || "").toLowerCase().includes(query) ||
              String(r.debit || "").includes(query) ||
              String(r.credit || "").includes(query) ||
              String(r.balance || "").includes(query)
            );
          }
          renderRunningLedgerTable(rows, data);
          return;
        }
      } catch (err) {
        console.error("Failed to load customer ledger:", err);
      }
    } else {
      // No specific customer selected -> Show account overview
      if (summaryBar) summaryBar.classList.add("d-none");
      try {
        const { data } = await axios.get(`${baseApiUrl}/payment.php`, {
          params: { operation: "getCustomerLedger" },
          withCredentials: true
        });
        if (data.returnValue === 1 && Array.isArray(data.customers)) {
          let list = data.customers;
          if (query) {
            list = list.filter((c) => String(c.customer_name || "").toLowerCase().includes(query));
          }
          renderCustomerLedgerOverviewTable(list);
          return;
        }
      } catch (err) {
        console.error(err);
      }
    }
  }

  // Memos Only View
  if (summaryBar) summaryBar.classList.add("d-none");
  const filtered = allLedgerEntriesData.filter((e) => {
    const matchesCust = !custId || String(e.ar_customer_id) === String(custId);
    const matchesQuery =
      !query ||
      String(e.reference_no || "").toLowerCase().includes(query) ||
      String(e.customer_name || "").toLowerCase().includes(query) ||
      String(e.invoice_number || "").toLowerCase().includes(query) ||
      String(e.entry_type || "").toLowerCase().includes(query) ||
      String(e.reason || "").toLowerCase().includes(query) ||
      String(e.supervisor_name || "").toLowerCase().includes(query);
    return matchesCust && matchesQuery;
  });
  renderLedgerEntriesTable(filtered);
};

const renderRunningLedgerTable = (rows, summary) => {
  const container = document.getElementById("memos-table-div");
  if (!container) return;

  if (!rows || rows.length === 0) {
    container.innerHTML = '<p class="text-muted p-4 mb-0 text-center">No ledger transactions found for this account.</p>';
    return;
  }

  const getBadgeClass = (type) => {
    if (type === "Invoice") return "bg-primary text-white";
    if (type === "Payment") return "bg-success text-white";
    if (type === "Credit Memo") return "bg-info text-dark";
    if (type === "Debit Memo") return "bg-warning text-dark";
    if (type === "Overdue Interest") return "bg-danger text-white";
    if (type === "Overdue Penalty") return "bg-dark text-white";
    return "bg-secondary text-white";
  };

  container.innerHTML = `
    <table class="table table-hover table-striped table-sm mb-0 align-middle">
      <thead class="table-light">
        <tr>
          <th style="width: 15%;">Transaction / Date</th>
          <th style="width: 15%;">Reference #</th>
          <th style="width: 34%;">Description</th>
          <th style="width: 12%;" class="text-end">Debit (Dr)</th>
          <th style="width: 12%;" class="text-end">Credit (Cr)</th>
          <th style="width: 12%;" class="text-end">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const drText = r.debit > 0 ? `<span class="text-primary font-monospace fw-bold">+₱${Number(r.debit).toFixed(2)}</span>` : "—";
            const crText = r.credit > 0 ? `<span class="text-success font-monospace fw-bold">-₱${Number(r.credit).toFixed(2)}</span>` : "—";
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
                <td class="text-end font-monospace fw-bold ${balClass} h6 mb-0">₱${Number(r.balance).toFixed(2)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
      <tfoot class="table-light fw-bold">
        <tr>
          <td colspan="3" class="text-end text-uppercase">Account Totals:</td>
          <td class="text-end font-monospace text-primary">₱${Number(summary?.totalDebits || 0).toFixed(2)}</td>
          <td class="text-end font-monospace text-success">₱${Number(summary?.totalCredits || 0).toFixed(2)}</td>
          <td class="text-end font-monospace text-danger h6 mb-0">₱${Number(summary?.finalBalance || 0).toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
  `;
};

const renderCustomerLedgerOverviewTable = (customers) => {
  const container = document.getElementById("memos-table-div");
  if (!container) return;

  if (!customers.length) {
    container.innerHTML = '<p class="text-muted p-4 mb-0 text-center">No active AR customers found.</p>';
    return;
  }

  container.innerHTML = `
    <table class="table table-hover table-striped table-sm mb-0 align-middle">
      <thead class="table-light">
        <tr>
          <th>Customer Account</th>
          <th class="text-end">Credit Limit</th>
          <th class="text-center">Open Invoices</th>
          <th class="text-end">Current Outstanding Balance</th>
          <th class="text-center" style="width: 160px;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${customers
          .map((c) => {
            const bal = Number(c.current_balance || 0);
            return `
              <tr>
                <td class="fw-bold">${escapeHtml(c.customer_name)}</td>
                <td class="text-end font-monospace">₱${Number(c.credit_limit || 0).toFixed(2)}</td>
                <td class="text-center"><span class="badge ${c.open_invoices > 0 ? 'bg-warning text-dark' : 'bg-secondary'}">${c.open_invoices || 0}</span></td>
                <td class="text-end font-monospace fw-bold ${bal > 0 ? 'text-danger' : 'text-success'}">₱${bal.toFixed(2)}</td>
                <td class="text-center">
                  <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2 fw-semibold select-ledger-cust-btn" data-customer-id="${c.ar_customer_id}">
                    View Ledger &rarr;
                  </button>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  container.querySelectorAll(".select-ledger-cust-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cid = btn.dataset.customerId;
      const select = document.getElementById("memo-customer-filter");
      if (select) {
        select.value = String(cid);
        filterLedgerEntries();
      }
    });
  });
};

const renderLedgerEntriesTable = (records) => {
  const container = document.getElementById("memos-table-div");
  if (!container) return;
  if (!records.length) {
    container.innerHTML = '<p class="text-muted p-4 mb-0 text-center">No Credit/Debit Memos or Ledger Adjustments recorded yet.</p>';
    return;
  }

  const badgeForType = (t) => {
    if (t === "credit_memo") return '<span class="badge bg-success">CREDIT MEMO (-Balance)</span>';
    if (t === "debit_memo") return '<span class="badge bg-warning text-dark">DEBIT MEMO (+Balance)</span>';
    if (t === "overdue_interest") return '<span class="badge bg-danger">OVERDUE INTEREST</span>';
    if (t === "overdue_penalty") return '<span class="badge bg-dark">OVERDUE PENALTY</span>';
    return `<span class="badge bg-secondary">${escapeHtml(t)}</span>`;
  };

  container.innerHTML = `
    <table class="table table-hover table-striped table-sm mb-0 align-middle">
      <thead class="table-light">
        <tr>
          <th>ENTRY #</th>
          <th>DATE / TIME</th>
          <th>REFERENCE #</th>
          <th>TYPE</th>
          <th>CUSTOMER</th>
          <th>INVOICE #</th>
          <th>REASON / AUDIT NOTE</th>
          <th class="text-end">BEFORE</th>
          <th class="text-end">ADJUSTMENT</th>
          <th class="text-end">AFTER</th>
          <th>AUTHORIZED BY</th>
        </tr>
      </thead>
      <tbody>
        ${records
          .map((r) => {
            const isCredit = r.entry_type === "credit_memo";
            const sign = isCredit ? "-" : "+";
            const cls = isCredit ? "text-success" : "text-danger";
            return `
              <tr>
                <td class="font-monospace fw-bold">#${r.entry_id}</td>
                <td class="small font-monospace">${escapeHtml(r.created_at || "")}</td>
                <td class="font-monospace fw-bold">${escapeHtml(r.reference_no || "")}</td>
                <td>${badgeForType(r.entry_type)}</td>
                <td class="fw-semibold">${escapeHtml(r.customer_name || "")}</td>
                <td class="font-monospace">${escapeHtml(r.invoice_number || "—")}</td>
                <td class="small">${escapeHtml(r.reason || "")}</td>
                <td class="text-end font-monospace">₱${Number(r.balance_before || 0).toFixed(2)}</td>
                <td class="text-end font-monospace fw-bold ${cls}">${sign}₱${Number(r.amount || 0).toFixed(2)}</td>
                <td class="text-end font-monospace fw-bold">₱${Number(r.balance_after || 0).toFixed(2)}</td>
                <td class="small">${escapeHtml(r.supervisor_name || r.created_by_name || "Supervisor")}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
};

const handleCustomerChange = () => {
  const customerId = document.getElementById("ar_customer_id")?.value;
  const cust = customersList.find((c) => String(c.ar_customer_id) === String(customerId));

  currentPreview = null;
  const previewContainer = document.getElementById("fifo-preview-table-container");
  const footerEl = document.getElementById("fifo-summary-footer");
  if (footerEl) footerEl.classList.add("d-none");

  if (!cust) {
    document.getElementById("cust-credit-limit").textContent = "₱0.00";
    document.getElementById("cust-total-debt").textContent = "₱0.00";
    document.getElementById("cust-available-credit").textContent = "₱0.00";
    document.getElementById("cust-invoice-badge").textContent = "0 Open Invoices";
    if (previewContainer) {
      previewContainer.innerHTML = '<p class="text-muted text-center py-4 mb-0">Select a customer and enter a payment amount to preview the FIFO cascade.</p>';
    }
    return;
  }

  const limit = Number(cust.credit_limit || 0);
  const debt = Number(cust.total_debt || 0);
  const available = Math.max(0, limit - debt);
  const invCount = Number(cust.open_invoice_count || 0);

  document.getElementById("cust-credit-limit").textContent = `₱${limit.toFixed(2)}`;
  document.getElementById("cust-total-debt").textContent = `₱${debt.toFixed(2)}`;
  document.getElementById("cust-available-credit").textContent = `₱${available.toFixed(2)}`;
  document.getElementById("cust-invoice-badge").textContent = `${invCount} Open Invoice${invCount === 1 ? "" : "s"}`;

  if (invCount === 0) {
    if (previewContainer) {
      previewContainer.innerHTML = '<div class="alert alert-info m-3 mb-0">This customer currently has no unpaid open invoices.</div>';
    }
  } else {
    if (previewContainer) {
      previewContainer.innerHTML = '<p class="text-muted text-center py-4 mb-0">Customer selected. Enter payment amount and click Preview or press Enter.</p>';
    }
    const amtInput = document.getElementById("amount");
    if (amtInput && !amtInput.value && debt > 0) {
      amtInput.value = debt.toFixed(2);
      previewAllocation();
    }
  }
};

const handlePayFullDebt = () => {
  const customerId = document.getElementById("ar_customer_id")?.value;
  const cust = customersList.find((c) => String(c.ar_customer_id) === String(customerId));
  if (!cust) {
    showToast("Please select a customer first.", "warning");
    return;
  }
  const amtInput = document.getElementById("amount");
  if (amtInput) {
    amtInput.value = Number(cust.total_debt || 0).toFixed(2);
    previewAllocation();
  }
};

const previewAllocation = async () => {
  const customerId = document.getElementById("ar_customer_id")?.value;
  const amount = parseFloat(document.getElementById("amount")?.value || "0");
  const previewContainer = document.getElementById("fifo-preview-table-container");
  const footerEl = document.getElementById("fifo-summary-footer");

  if (!customerId) {
    showToast("Please select an AR Customer.", "warning");
    document.getElementById("ar_customer_id")?.focus();
    return;
  }
  if (!amount || amount <= 0) {
    showToast("Please enter a valid positive payment amount.", "warning");
    document.getElementById("amount")?.focus();
    return;
  }

  if (previewContainer) {
    previewContainer.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-success" role="status"></div><p class="small text-muted mt-2">Calculating FIFO cascade across oldest invoices...</p></div>';
  }

  try {
    const payload = { customerId: parseInt(customerId, 10), amount };
    const response = await axios.post(`${baseApiUrl}/payment.php`, new URLSearchParams({
      operation: "previewFifoAllocation",
      json: JSON.stringify(payload)
    }));

    if (response.data.returnValue === 1) {
      currentPreview = response.data;
      renderAllocationPreview(response.data);
    } else {
      currentPreview = null;
      if (footerEl) footerEl.classList.add("d-none");
      if (previewContainer) {
        previewContainer.innerHTML = `<div class="alert alert-warning m-3">${escapeHtml(response.data.message || "Unable to calculate allocation.")}</div>`;
      }
    }
  } catch (error) {
    console.error(error);
    currentPreview = null;
    if (footerEl) footerEl.classList.add("d-none");
    const msg = error.response?.data?.message || "Error calculating FIFO allocation.";
    if (previewContainer) {
      previewContainer.innerHTML = `<div class="alert alert-danger m-3">${escapeHtml(msg)}</div>`;
    }
  }
};

const renderAllocationPreview = (data) => {
  const previewContainer = document.getElementById("fifo-preview-table-container");
  const footerEl = document.getElementById("fifo-summary-footer");
  if (!previewContainer) return;

  const rows = data.allocations || [];
  if (!rows.length) {
    previewContainer.innerHTML = '<p class="text-muted text-center py-4 mb-0">No invoices found for allocation.</p>';
    if (footerEl) footerEl.classList.add("d-none");
    return;
  }

  let html = `
    <table class="table table-sm table-hover align-middle mb-0">
      <thead class="table-light">
        <tr>
          <th>QUEUE #</th>
          <th>INVOICE #</th>
          <th>INVOICE DATE</th>
          <th class="text-end">CURRENT BALANCE</th>
          <th class="text-end text-success fw-bold">AMOUNT APPLIED</th>
          <th class="text-end">NEW BALANCE</th>
          <th class="text-center">RESULTING STATUS</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach((row, index) => {
    const isApplied = Number(row.amount_applied || 0) > 0;
    const isFullSettlement = Number(row.remaining_balance || 0) === 0 && isApplied;
    const statusBadge = isFullSettlement
      ? '<span class="badge bg-success">Fully Paid</span>'
      : isApplied
      ? '<span class="badge bg-warning text-dark">Partially Paid</span>'
      : '<span class="badge bg-light text-muted border">No Payment Applied</span>';

    html += `
      <tr class="${isApplied ? "table-success-subtle" : ""}">
        <td class="small font-monospace">${index === 0 ? '<span class="badge bg-primary">1st (Oldest)</span>' : `#${index + 1}`}</td>
        <td class="font-monospace fw-bold">${escapeHtml(row.invoice_number)}</td>
        <td class="small">${escapeHtml(row.invoice_date || "—")}</td>
        <td class="text-end font-monospace">₱${Number(row.current_balance).toFixed(2)}</td>
        <td class="text-end font-monospace fw-bold ${isApplied ? "text-success" : "text-muted"}">
          ₱${Number(row.amount_applied).toFixed(2)}
        </td>
        <td class="text-end font-monospace fw-bold ${Number(row.remaining_balance) > 0 ? "text-danger" : "text-success"}">
          ₱${Number(row.remaining_balance).toFixed(2)}
        </td>
        <td class="text-center">${statusBadge}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  previewContainer.innerHTML = html;

  if (footerEl) {
    footerEl.classList.remove("d-none");
    document.getElementById("preview-total-entered").textContent = `₱${Number(data.total_payment_entered || 0).toFixed(2)}`;
    document.getElementById("preview-total-applied").textContent = `₱${Number(data.total_applied || 0).toFixed(2)}`;
    document.getElementById("preview-unapplied").textContent = `₱${Number(data.unallocated_amount || 0).toFixed(2)}`;
    document.getElementById("preview-new-debt").textContent = `₱${Number(data.new_customer_debt || 0).toFixed(2)}`;
  }
};

const submitFifoPayment = async () => {
  const customerId = document.getElementById("ar_customer_id")?.value;
  const amount = parseFloat(document.getElementById("amount")?.value || "0");
  const paymentMethodId = document.getElementById("payment_method_id")?.value;
  const paymentDate = document.getElementById("payment_date")?.value;
  const notes = document.getElementById("notes")?.value?.trim() || "";

  if (!customerId) {
    showToast("Please select an AR Customer.", "warning");
    document.getElementById("ar_customer_id")?.focus();
    return;
  }
  if (!amount || amount <= 0) {
    showToast("Please enter a valid payment amount.", "warning");
    document.getElementById("amount")?.focus();
    return;
  }
  if (!paymentMethodId) {
    showToast("Please choose a payment method.", "warning");
    document.getElementById("payment_method_id")?.focus();
    return;
  }
  if (!paymentDate) {
    showToast("Please choose a payment date.", "warning");
    document.getElementById("payment_date")?.focus();
    return;
  }

  if (!currentPreview) {
    await previewAllocation();
    if (!currentPreview) return;
  }

  try {
    const payload = {
      customerId: parseInt(customerId, 10),
      amount: amount,
      paymentMethodId: parseInt(paymentMethodId, 10),
      paymentDate: paymentDate,
      notes: notes
    };

    const formData = new FormData();
    formData.append("operation", "insertFifoPayment");
    formData.append("json", JSON.stringify(payload));

    const response = await axios.post(`${baseApiUrl}/payment.php`, formData);
    if (response.data.returnValue === 1) {
      bootstrap.Modal.getInstance(document.getElementById("payment-modal"))?.hide();

      await Promise.all([displayRecords(), loadPaymentData(), loadInvoicesData(), loadLedgerEntries()]);

      showPaymentReceipt(response.data.paymentId);

      showSuccess(
        `FIFO Payment successfully settled across ${response.data.allocations.length} invoice(s).\nReference: ${response.data.referenceNumber}`,
        "Payment Recorded"
      );
    } else {
      showError(response.data.message || "Unable to save FIFO payment.");
    }
  } catch (error) {
    console.error(error);
    showError(error.response?.data?.message || "Unable to process FIFO payment.");
  }
};

const showPaymentReceipt = async (paymentId) => {
  try {
    const response = await axios.get(`${baseApiUrl}/payment.php`, {
      params: { operation: "getPaymentAllocations", payment_id: paymentId }
    });

    if (response.data.returnValue !== 1) {
      showError(response.data.message || "Unable to load receipt details.");
      return;
    }

    const { header, allocations } = response.data;
    const bodyEl = document.getElementById("receipt-modal-body");
    if (!bodyEl) return;

    let allocRows = (allocations || []).map((a, i) => `
      <tr>
        <td class="font-monospace">${i + 1}</td>
        <td class="font-monospace fw-bold">${escapeHtml(a.invoice_number)}</td>
        <td class="small">${escapeHtml(a.invoice_date || "—")}</td>
        <td class="text-end font-monospace">₱${Number(a.invoice_amount || 0).toFixed(2)}</td>
        <td class="text-end font-monospace fw-bold text-success">₱${Number(a.amount_applied || 0).toFixed(2)}</td>
        <td class="text-end font-monospace">₱${Number(a.remaining_balance || 0).toFixed(2)}</td>
        <td><span class="badge ${a.invoice_status === "Paid" ? "bg-success" : "bg-warning text-dark"}">${escapeHtml(a.invoice_status || "")}</span></td>
      </tr>
    `).join("");

    bodyEl.innerHTML = `
      <div class="text-center pb-3 border-bottom mb-3">
        <h4 class="fw-bold mb-1">OFFICIAL AR COLLECTION RECEIPT</h4>
        <div class="text-muted small">Department Store POS &amp; Accounts Receivable System</div>
        <div class="font-monospace fw-bold text-primary mt-1">${escapeHtml(header?.reference_number || `REF-#${header?.payment_id}`)}</div>
      </div>
      <div class="row g-2 mb-3 small">
        <div class="col-6"><strong>Customer:</strong> ${escapeHtml(allocations[0]?.customer_name || "—")}</div>
        <div class="col-6 text-end"><strong>Payment Date:</strong> ${escapeHtml(header?.payment_date || "")}</div>
        <div class="col-6"><strong>Payment Method:</strong> ${escapeHtml(header?.method_name || "—")}</div>
        <div class="col-6 text-end"><strong>Processed By:</strong> ${escapeHtml(header?.processed_by || "Cashier")}</div>
        <div class="col-12"><strong>Notes:</strong> ${escapeHtml(header?.notes || "FIFO Settlement")}</div>
      </div>
      <h6 class="fw-bold mb-2">Settled Invoice Allocations (FIFO Order)</h6>
      <div class="table-responsive mb-3">
        <table class="table table-sm table-bordered align-middle">
          <thead class="table-light">
            <tr>
              <th>#</th>
              <th>Invoice #</th>
              <th>Date</th>
              <th class="text-end">Amount</th>
              <th class="text-end">Applied</th>
              <th class="text-end">Remaining</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${allocRows || '<tr><td colspan="7" class="text-center text-muted">No details found</td></tr>'}
          </tbody>
          <tfoot class="table-light fw-bold">
            <tr>
              <td colspan="4" class="text-end">Total Payment Applied:</td>
              <td class="text-end text-success font-monospace">₱${Number(header?.amount || 0).toFixed(2)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="alert alert-light border small text-muted mb-0">
        Receipt generated automatically on ${new Date().toLocaleString()}. All invoices settled according to FIFO debt aging rules.
      </div>
    `;

    const receiptModal = new bootstrap.Modal(document.getElementById("receipt-modal"));
    receiptModal.show();
  } catch (error) {
    console.error(error);
    showError("Unable to open receipt breakdown.");
  }
};

const openPayModalForCustomer = (customerId, suggestedAmount = null) => {
  preparePaymentForm();
  const select = document.getElementById("ar_customer_id");
  if (select) {
    select.value = customerId;
    handleCustomerChange();
  }
  if (suggestedAmount !== null) {
    const amtInput = document.getElementById("amount");
    if (amtInput) {
      amtInput.value = Number(suggestedAmount).toFixed(2);
      previewAllocation();
    }
  }
  const modalEl = document.getElementById("payment-modal");
  if (modalEl) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
};

const preparePaymentForm = () => {
  document.getElementById("payment-form")?.reset();
  populateCustomerDropdown();
  populateSelect("payment_method_id", paymentMethods, "payment_method_id", "-- SELECT PAYMENT METHOD --", (method) => method.method_name);
  const dateInput = document.getElementById("payment_date");
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

  currentPreview = null;
  const previewContainer = document.getElementById("fifo-preview-table-container");
  if (previewContainer) {
    previewContainer.innerHTML = '<p class="text-muted text-center py-4 mb-0">Select a customer and enter a payment amount to preview the FIFO cascade.</p>';
  }
  document.getElementById("fifo-summary-footer")?.classList.add("d-none");
  document.getElementById("cust-credit-limit").textContent = "₱0.00";
  document.getElementById("cust-total-debt").textContent = "₱0.00";
  document.getElementById("cust-available-credit").textContent = "₱0.00";
  document.getElementById("cust-invoice-badge").textContent = "0 Open Invoices";
};

const updateAgingSummaryCards = (invoices) => {
  let curCnt = 0, curBal = 0;
  let d30Cnt = 0, d30Bal = 0;
  let d60Cnt = 0, d60Bal = 0;
  let d60pCnt = 0, d60pBal = 0;

  (invoices || []).forEach((inv) => {
    const bal = Number(inv.balance || 0);
    if (bal <= 0) return;
    const b = inv.aging_bucket || "Current";
    if (b === "Current") {
      curCnt++;
      curBal += bal;
    } else if (b === "1-30 Days") {
      d30Cnt++;
      d30Bal += bal;
    } else if (b === "31-60 Days") {
      d60Cnt++;
      d60Bal += bal;
    } else if (b === "60+ Days") {
      d60pCnt++;
      d60pBal += bal;
    }
  });

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setTxt("aging-bucket-current-cnt", String(curCnt));
  setTxt("aging-bucket-current-bal", `₱${curBal.toFixed(2)}`);
  setTxt("aging-bucket-1-30-cnt", String(d30Cnt));
  setTxt("aging-bucket-1-30-bal", `₱${d30Bal.toFixed(2)}`);
  setTxt("aging-bucket-31-60-cnt", String(d60Cnt));
  setTxt("aging-bucket-31-60-bal", `₱${d60Bal.toFixed(2)}`);
  setTxt("aging-bucket-60-plus-cnt", String(d60pCnt));
  setTxt("aging-bucket-60-plus-bal", `₱${d60pBal.toFixed(2)}`);
};

const loadInvoicesData = async () => {
  try {
    const response = await axios.get(`${baseApiUrl}/payment.php`, {
      params: { operation: "getAllInvoices" },
    });
    allInvoicesData = response.data || [];
    updateAgingSummaryCards(allInvoicesData);
    populateCustomerFilter(allInvoicesData);
    filterInvoices();
  } catch (error) {
    console.error(error);
    const container = document.getElementById("invoices-table-div");
    if (container) {
      container.innerHTML = '<p class="text-danger p-3">Unable to load customer invoice records.</p>';
    }
  }
};

const populateCustomerFilter = (invoices) => {
  const select = document.getElementById("invoice-customer-filter");
  if (!select) return;
  const currentVal = select.value;
  const customersMap = new Map();
  invoices.forEach((inv) => {
    if (inv.ar_customer_id && inv.customer_name) {
      customersMap.set(String(inv.ar_customer_id), inv.customer_name);
    }
  });

  select.innerHTML = '<option value="">-- All Customers --</option>';
  Array.from(customersMap.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([id, name]) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = name;
      select.appendChild(opt);
    });
  if (currentVal) select.value = currentVal;
};

const filterInvoices = () => {
  const custId = document.getElementById("invoice-customer-filter")?.value || "";
  const query = (document.getElementById("invoice-search-filter")?.value || "").toLowerCase().trim();

  const filtered = allInvoicesData.filter((inv) => {
    const matchesCust = !custId || String(inv.ar_customer_id) === custId;
    const matchesQuery =
      !query ||
      String(inv.invoice_number || "").toLowerCase().includes(query) ||
      String(inv.ar_invoice_id || "").toLowerCase().includes(query) ||
      String(inv.customer_name || "").toLowerCase().includes(query) ||
      String(inv.status || "").toLowerCase().includes(query) ||
      String(inv.collection_status || "").toLowerCase().includes(query) ||
      String(inv.aging_bucket || "").toLowerCase().includes(query);
    return matchesCust && matchesQuery;
  });

  renderInvoicesTable(filtered);
};

const renderInvoicesTable = (records) => {
  const container = document.getElementById("invoices-table-div");
  if (!container) return;

  const sorted = [...records].sort((a, b) => {
    const idA = Number(a.ar_invoice_id || 0);
    const idB = Number(b.ar_invoice_id || 0);
    return invoiceSortDirection === "desc" ? idB - idA : idA - idB;
  });

  if (!sorted.length) {
    container.innerHTML = '<p class="text-muted p-4 mb-0 text-center">No invoice records found.</p>';
    return;
  }

  const agingBadge = (bucket) => {
    if (bucket === "Paid") return '<span class="badge bg-success">Paid</span>';
    if (bucket === "Current") return '<span class="badge bg-primary">Current</span>';
    if (bucket === "1-30 Days") return '<span class="badge bg-info text-dark">1–30 Days</span>';
    if (bucket === "31-60 Days") return '<span class="badge bg-warning text-dark">31–60 Days</span>';
    if (bucket === "60+ Days") return '<span class="badge bg-danger">60+ Days</span>';
    return `<span class="badge bg-secondary">${escapeHtml(bucket || "Current")}</span>`;
  };

  container.innerHTML = `
    <table class="table table-hover table-striped table-sm mb-0 align-middle">
      <thead class="table-light">
        <tr>
          <th id="th-invoice-id" style="cursor: pointer; user-select: none;" title="Click to sort by Invoice ID">
            INVOICE # <span class="sort-icon">${invoiceSortDirection === "desc" ? "▼" : "▲"}</span>
          </th>
          <th>CUSTOMER</th>
          <th>INVOICE DATE</th>
          <th>DUE DATE</th>
          <th class="text-end">AMOUNT</th>
          <th class="text-end">BALANCE</th>
          <th>STATUS</th>
          <th>AGING BUCKET</th>
          <th class="text-center">ACTION</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
          .map((inv) => {
            const hasBalance = Number(inv.balance || 0) > 0;
            return `
              <tr>
                <td class="font-monospace fw-bold">${escapeHtml(inv.invoice_number || `#${inv.ar_invoice_id}`)}</td>
                <td class="fw-semibold">${escapeHtml(inv.customer_name || "")}</td>
                <td class="small">${escapeHtml(inv.invoice_date || "")}</td>
                <td class="small font-monospace">${escapeHtml(inv.due_date || "—")}</td>
                <td class="text-end font-monospace">₱${Number(inv.invoice_amount || 0).toFixed(2)}</td>
                <td class="text-end font-monospace fw-bold ${hasBalance ? "text-danger" : "text-success"}">
                  ₱${Number(inv.balance || 0).toFixed(2)}
                </td>
                <td><span class="badge ${inv.status === "Approved" ? "bg-info text-dark" : "bg-secondary"}">${escapeHtml(inv.status || "")}</span></td>
                <td>${agingBadge(inv.aging_bucket)} ${Number(inv.days_overdue || 0) > 0 ? `<small class="text-danger fw-bold">(${inv.days_overdue}d)</small>` : ""}</td>
                <td class="text-center text-nowrap">
                  ${
                    hasBalance && canRecordPayment
                      ? `<button type="button" class="btn btn-sm btn-outline-success py-0 px-2 pay-invoice-btn" data-customer-id="${inv.ar_customer_id}" data-balance="${inv.balance}">Pay Debt</button>
                         <button type="button" class="btn btn-sm btn-outline-warning text-dark py-0 px-2 ms-1 memo-invoice-btn" data-customer-id="${inv.ar_customer_id}" data-invoice-id="${inv.ar_invoice_id}">Memo</button>`
                      : hasBalance
                      ? `<span class="badge bg-warning text-dark">Unpaid</span>`
                      : `<span class="badge bg-success-subtle text-success border border-success-subtle">Settled</span>`
                  }
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  document.getElementById("th-invoice-id")?.addEventListener("click", () => {
    invoiceSortDirection = invoiceSortDirection === "desc" ? "asc" : "desc";
    renderInvoicesTable(records);
  });

  container.querySelectorAll(".pay-invoice-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const custId = btn.dataset.customerId;
      const bal = btn.dataset.balance;
      openPayModalForCustomer(custId, bal);
    });
  });

  container.querySelectorAll(".memo-invoice-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      prepareMemoForm(btn.dataset.customerId, btn.dataset.invoiceId, "credit_memo");
      bootstrap.Modal.getOrCreateInstance(document.getElementById("memo-modal")).show();
    });
  });
};

const populateSelect = (id, records, valueKey, placeholder, labelBuilder = (record) => record[valueKey]) => {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  records.forEach((record) => {
    const option = document.createElement("option");
    option.value = record[valueKey];
    option.textContent = labelBuilder(record);
    select.appendChild(option);
  });
};

const displayRecords = async () => {
  try {
    const response = await axios.get(`${baseApiUrl}/payment.php`, {
      params: { operation: "getAllPayments" },
    });
    allPaymentsData = response.data || [];
    filterPayments();
  } catch (error) {
    console.error(error);
    showError("Unable to load payment records.");
  }
};

const filterPayments = () => {
  const query = (document.getElementById("payment-search-filter")?.value || "").toLowerCase().trim();
  const filtered = allPaymentsData.filter((p) => {
    return (
      !query ||
      String(p.payment_id || "").toLowerCase().includes(query) ||
      String(p.invoice_number || "").toLowerCase().includes(query) ||
      String(p.customer_name || "").toLowerCase().includes(query) ||
      String(p.reference_number || "").toLowerCase().includes(query) ||
      String(p.method_name || "").toLowerCase().includes(query)
    );
  });
  renderPaymentsTable(filtered);
};

const renderPaymentsTable = (records) => {
  const tableDiv = document.getElementById("table-div");
  if (!tableDiv) return;

  const sorted = [...records].sort((a, b) => {
    const idA = Number(a.payment_id || 0);
    const idB = Number(b.payment_id || 0);
    return paymentSortDirection === "desc" ? idB - idA : idA - idB;
  });

  if (!sorted.length) {
    tableDiv.innerHTML = '<p class="text-muted p-4 mb-0 text-center">No payment records found.</p>';
    return;
  }

  tableDiv.innerHTML = `
    <table class="table table-hover table-striped table-sm mb-0 align-middle">
      <thead class="table-light">
        <tr>
          <th id="th-payment-id" style="cursor: pointer; user-select: none;" title="Click to sort by Payment ID">
            PAYMENT # <span class="sort-icon">${paymentSortDirection === "desc" ? "▼" : "▲"}</span>
          </th>
          <th>DATE</th>
          <th>CUSTOMER</th>
          <th>INVOICE(S) SETTLED</th>
          <th class="text-end">TOTAL PAID</th>
          <th>METHOD</th>
          <th>REFERENCE #</th>
          <th class="text-center">RECEIPT</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
          .map((payment) => `
          <tr>
            <td class="font-monospace fw-bold">#${payment.payment_id}</td>
            <td class="small">${escapeHtml(payment.payment_date || "")}</td>
            <td class="fw-semibold">${escapeHtml(payment.customer_name || "—")}</td>
            <td class="font-monospace small">
              <span class="badge bg-light text-dark border">${escapeHtml(payment.invoice_number || "—")}</span>
              ${Number(payment.invoice_count || 1) > 1 ? `<span class="badge bg-secondary ms-1">${payment.invoice_count} inv</span>` : ""}
            </td>
            <td class="text-end font-monospace fw-bold text-success">₱${Number(payment.amount).toFixed(2)}</td>
            <td><span class="badge bg-light text-dark border">${escapeHtml(payment.method_name || "")}</span></td>
            <td class="font-monospace small">${escapeHtml(payment.reference_number || "—")}</td>
            <td class="text-center">
              <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2 view-receipt-btn" data-payment-id="${payment.payment_id}">
                View Breakdown
              </button>
            </td>
          </tr>`)
          .join("")}
      </tbody>
    </table>`;

  document.getElementById("th-payment-id")?.addEventListener("click", () => {
    paymentSortDirection = paymentSortDirection === "desc" ? "asc" : "desc";
    renderPaymentsTable(records);
  });

  tableDiv.querySelectorAll(".view-receipt-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pid = btn.dataset.paymentId;
      showPaymentReceipt(pid);
    });
  });
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
