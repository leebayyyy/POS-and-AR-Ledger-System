import { showToast, showError, showSuccess } from "./swal-helper.js";

const arUrl = "api/ar_transactions.php";
let arData;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("memo-form").addEventListener("submit", saveMemo);
  loadAr();
});

const loadAr = async () => {
  try {
    const response = await axios.get(arUrl, {
      params: { operation: "getData" },
      withCredentials: true,
    });
    arData = response.data;
    renderAr();
  } catch (error) {
    console.error(error);
    document.getElementById("invoices").innerHTML =
      '<div class="alert alert-danger">Unable to load AR transactions.</div>';
  }
};

const renderAr = () => {
  const invoices = arData.invoices || [];
  const memos = arData.memos || [];
  document.getElementById("btn-new-memo").classList.toggle("d-none", !arData.canManageAr);
  document.getElementById("invoices").innerHTML = `
    <h4>Invoices and Collection Follow-up</h4>
    <div class="table-responsive"><table class="table table-sm">
      <thead><tr><th>Invoice</th><th>Customer</th><th>Invoice Date</th><th>Due Date</th><th>Amount</th><th>Balance</th><th>Invoice Status</th><th>Collection Status</th><th>Days Overdue</th></tr></thead>
      <tbody>${invoices.map((invoice) => `
        <tr><td>${invoice.invoice_number}</td><td>${invoice.customer_name}</td>
        <td>${invoice.invoice_date || ""}</td><td>${invoice.due_date || ""}</td>
        <td>${Number(invoice.invoice_amount).toFixed(2)}</td><td>${Number(invoice.balance).toFixed(2)}</td>
        <td>${invoice.status}</td>
        <td>${invoice.collection_status === "Overdue"
          ? '<span class="badge bg-danger">Overdue</span>'
          : invoice.collection_status === "Due today"
            ? '<span class="badge bg-warning text-dark">Due today</span>'
            : invoice.collection_status === "Paid"
              ? '<span class="badge bg-success">Paid</span>'
              : invoice.collection_status === "No due date"
                ? '<span class="badge bg-secondary">No due date</span>'
                : '<span class="badge bg-primary">Current</span>'}</td>
        <td>${Number(invoice.days_overdue || 0) > 0 ? invoice.days_overdue : ""}</td></tr>`).join("") || '<tr><td colspan="9">No invoices recorded.</td></tr>'}
      </tbody>
    </table></div>`;

  document.getElementById("memos").innerHTML = `
    <h4>Memos</h4>
    <div class="table-responsive"><table class="table table-sm">
      <thead><tr><th>Type</th><th>Invoice</th><th>Customer</th><th>Date</th><th>Amount</th><th>Issued By</th><th>Status</th></tr></thead>
      <tbody>${memos.map((memo) => `
        <tr><td>${memo.memo_type}</td><td>${memo.invoice_number || `Invoice #${memo.ar_invoice_id}`}</td>
        <td>${memo.customer_name}</td><td>${memo.issue_date || ""}</td>
        <td>${Number(memo.amount).toFixed(2)}</td><td>${memo.issued_by}</td><td>${memo.status}</td></tr>`).join("") ||
        '<tr><td colspan="7">No memos recorded.</td></tr>'}
      </tbody>
    </table></div>`;

  document.getElementById("memo_invoice").innerHTML =
    '<option value="">-- SELECT INVOICE --</option>' +
    invoices.filter((invoice) => Number(invoice.balance) > 0)
      .map((invoice) => `<option value="${invoice.ar_invoice_id}">${invoice.invoice_number} - ${invoice.customer_name}</option>`)
      .join("");
};

const saveMemo = async (event) => {
  event.preventDefault();
  const formData = new FormData();
  formData.append("operation", "createMemo");
  formData.append("json", JSON.stringify({
    memoType: document.getElementById("memo_type").value,
    invoiceId: document.getElementById("memo_invoice").value,
    amount: document.getElementById("memo_amount").value,
  }));
  try {
    const response = await axios.post(arUrl, formData, { withCredentials: true });
    bootstrap.Modal.getOrCreateInstance(document.getElementById("memo-modal")).hide();
    event.target.reset();
    await loadAr();
    const memoLabel = response.data.memoType === "Credit" ? "Credit memo" : "Debit memo";
    showToast(`${memoLabel} recorded. Updated balance: ${Number(response.data.remainingBalance).toFixed(2)}`);
  } catch (error) {
    showError(error.response?.data?.message || "Unable to save memo.");
  }
};
