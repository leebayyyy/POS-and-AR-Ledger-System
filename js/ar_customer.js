import { updateModal } from "./modules/ar_customer-update.js";
import { deactivateModal } from "./modules/ar_customer-delete.js";
import { showToast, showError, showSuccess } from "./swal-helper.js";

const baseApiUrl = "api";
sessionStorage.setItem("baseAPIUrl", baseApiUrl);

let arCustomerTypeList = [];
let canManageCustomers = false;
let canManageCreditLimits = false;

document.addEventListener("DOMContentLoaded", () => {
  const addFieldsHtml = document.getElementById("blank-main-div").innerHTML;
  document.getElementById("btn-add").addEventListener("click", () => {
    if (!canManageCustomers) return;
    document.getElementById("blank-modal-title").innerText = "Add AR Customer";
    document.getElementById("blank-main-div").innerHTML = addFieldsHtml;
    document.getElementById("add-form").reset();
    loadArCustomerType();
    document.getElementById("blank-modal-footer").innerHTML = `
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
      <button type="submit" class="btn btn-primary" id="btn-submit" form="add-form">Submit</button>`;
  });
  loadPermissions()
    .then(async () => {
      if (canManageCustomers) await loadArCustomerType();
      await displayRecords();
    })
    .catch((error) => {
      console.error(error);
      document.getElementById("table-div").innerHTML =
        '<div class="alert alert-danger">Unable to load AR customer data.</div>';
    });
  document.getElementById("ar-customer-master-search")?.addEventListener("input", () => {
    applySortAndRender();
  });
  document.getElementById("add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    insertArCustomer();
  });
});

const loadPermissions = async () => {
  const response = await axios.get(`${baseApiUrl}/auth.php`, {
    params: { operation: "session" },
    withCredentials: true,
  });
  canManageCustomers = response.data.user?.role_name === "Admin";
  canManageCreditLimits = ["Admin", "Accounts Receivable Staff"].includes(response.data.user?.role_name);
  document.getElementById("btn-add").classList.toggle("d-none", !canManageCustomers);
};

const loadArCustomerType = async () => {
  const select = document.getElementById("customer_type_id");
  try {
    const response = await axios.get(`${baseApiUrl}/ar_customer_type.php`, {
      params: { operation: "getAllCustomerTypes" },
    });
    if (response.status == 200) {
      arCustomerTypeList = response.data;
      select.innerHTML = '<option value="">-- SELECT CUSTOMER TYPE --</option>';
      arCustomerTypeList.forEach((customerType) => {
        let option = document.createElement("option");
        option.innerText = customerType.type_name;
        option.value = customerType.customer_type_id;
        select.appendChild(option);
      });
    }
  } catch (err) {
    showError("Error loading customer types.");
  }
};

let allCustomerRecords = [];
let customerSortOrder = "desc";

const applySortAndRender = () => {
  allCustomerRecords.sort((a, b) => {
    const idA = Number(a.ar_customer_id || 0);
    const idB = Number(b.ar_customer_id || 0);
    return customerSortOrder === "desc" ? idB - idA : idA - idB;
  });
  const q = (document.getElementById("ar-customer-master-search")?.value || "").toLowerCase().trim();
  const filtered = !q
    ? allCustomerRecords
    : allCustomerRecords.filter((c) =>
        String(c.ar_customer_id || "").toLowerCase().includes(q) ||
        String(c.customer_name || "").toLowerCase().includes(q) ||
        String(c.contact_name || "").toLowerCase().includes(q) ||
        String(c.type_name || "").toLowerCase().includes(q) ||
        String(c.contact_phone || "").toLowerCase().includes(q) ||
        String(c.billing_address || "").toLowerCase().includes(q)
      );
  displayRecordsTable(filtered);
};

const displayRecords = async () => {
  try {
    const response = await axios.get(`${baseApiUrl}/ar_customer.php`, {
      params: { operation: "getAllCustomers" },
    });
    if (response.status == 200) {
      allCustomerRecords = Array.isArray(response.data) ? response.data : [];
      applySortAndRender();
    }
  } catch (err) {
    showError("Unable to fetch customer records.");
  }
};

const displayRecordsTable = (records) => {
  const tableDiv = document.getElementById("table-div");
  tableDiv.innerHTML = "";

  if (!records.length) {
    tableDiv.innerHTML = '<div class="alert alert-secondary text-center">No AR customers found.</div>';
    return;
  }

  // 1. Mobile Cards View (< 768px)
  const mobileContainer = document.createElement("div");
  mobileContainer.className = "d-md-none";

  records.forEach((customer) => {
    const card = document.createElement("div");
    card.className = "customer-card";
    const statusBadge = customer.is_active == 1
      ? '<span class="badge bg-success">Active</span>'
      : '<span class="badge bg-secondary">Inactive</span>';

    const mobileActionButtons = (canManageCustomers || canManageCreditLimits) ? `
      <div class="d-flex flex-wrap gap-1 mt-2 pt-2 border-top justify-content-end">
        ${canManageCreditLimits ? `<button type="button" class="btn btn-sm btn-action-compact btn-credit-limit" data-id="${customer.ar_customer_id}">Credit Limit</button>` : ""}
        ${canManageCustomers ? `<button type="button" class="btn btn-sm btn-action-compact btn-update" data-id="${customer.ar_customer_id}">Update</button>` : ""}
        ${canManageCustomers && customer.is_active == 1 ? `<button type="button" class="btn btn-sm btn-action-compact btn-delete" style="background-color: #dc3545 !important; color: #ffffff !important; border-color: #dc3545 !important;" data-id="${customer.ar_customer_id}">Deactivate</button>` : ""}
        ${canManageCustomers && customer.is_active != 1 ? `<button type="button" class="btn btn-sm btn-action-compact btn-restore" style="background-color: #198754 !important; color: #ffffff !important; border-color: #198754 !important;" data-id="${customer.ar_customer_id}">Restore</button>` : ""}
      </div>` : "";

    card.innerHTML = `
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div class="me-2">
          <div class="d-flex align-items-center gap-1">
            <span class="badge bg-light text-secondary border font-monospace small">#${customer.ar_customer_id}</span>
            <span class="fw-bold text-dark fs-6 text-break">${customer.customer_name}</span>
          </div>
          <div class="small text-muted">${customer.type_name || "General"}</div>
        </div>
        <div class="d-flex align-items-center gap-1 flex-shrink-0">
          ${statusBadge}
        </div>
      </div>
      <div class="row g-1 text-center my-2">
        <div class="col-4">
          <div class="customer-stat-box">
            <div class="customer-stat-label">Limit</div>
            <div class="customer-stat-val text-dark">${Number(customer.credit_limit || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>
        <div class="col-4">
          <div class="customer-stat-box">
            <div class="customer-stat-label">Balance</div>
            <div class="customer-stat-val text-danger">${Number(customer.credit_exposure || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>
        <div class="col-4">
          <div class="customer-stat-box">
            <div class="customer-stat-label">Avail</div>
            <div class="customer-stat-val text-success">${Number(customer.available_credit || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>
      ${customer.contact_phone ? `<div class="small text-muted mt-1 text-truncate"><span class="fw-semibold">Phone:</span> ${customer.contact_phone}</div>` : ""}
      ${customer.billing_address ? `<div class="small text-muted text-truncate"><span class="fw-semibold">Addr:</span> ${customer.billing_address}</div>` : ""}
      ${mobileActionButtons}
    `;
    mobileContainer.appendChild(card);
  });

  // 2. Desktop Table View (>= 768px)
  const desktopContainer = document.createElement("div");
  desktopContainer.className = "d-none d-md-block table-responsive";

  const table = document.createElement("table");
  table.className = "table table-hover table-striped table-sm align-middle table-ar-compact w-100 mb-0";

  table.innerHTML = `
    <thead>
      <tr>
        <th class="sortable-customer-id text-nowrap" style="cursor: pointer; user-select: none;" title="Click to sort by ID">
          ID <span class="text-primary">${customerSortOrder === "desc" ? "▼" : "▲"}</span>
        </th>
        <th>Customer</th>
        <th>Type</th>
        <th class="d-none d-lg-table-cell">Phone</th>
        <th class="d-none d-xl-table-cell">Address</th>
        <th class="text-end">Limit</th>
        <th class="text-end">Balance</th>
        <th class="text-end">Avail</th>
        <th class="text-center">Status</th>
        ${canManageCustomers || canManageCreditLimits ? "<th class='text-center text-nowrap'>Action</th>" : ""}
      </tr>
    </thead>
    <tbody>
      ${records.map((c) => {
        const desktopActionButtons = (canManageCustomers || canManageCreditLimits) ? `
          <div class="d-inline-flex gap-1 align-items-center justify-content-center">
            ${canManageCreditLimits ? `<button type="button" class="btn btn-sm btn-action-compact btn-credit-limit" data-id="${c.ar_customer_id}" title="Credit Limit">Credit Limit</button>` : ""}
            ${canManageCustomers ? `<button type="button" class="btn btn-sm btn-action-compact btn-update" data-id="${c.ar_customer_id}" title="Update Customer">Update</button>` : ""}
            ${canManageCustomers && c.is_active == 1 ? `<button type="button" class="btn btn-sm btn-action-compact btn-delete" style="background-color: #dc3545 !important; color: #ffffff !important; border-color: #dc3545 !important;" data-id="${c.ar_customer_id}" title="Deactivate Customer">Deactivate</button>` : ""}
            ${canManageCustomers && c.is_active != 1 ? `<button type="button" class="btn btn-sm btn-action-compact btn-restore" style="background-color: #198754 !important; color: #ffffff !important; border-color: #198754 !important;" data-id="${c.ar_customer_id}" title="Restore Customer">Restore</button>` : ""}
          </div>` : "";

        return `
          <tr>
            <td><span class="badge bg-light text-secondary font-monospace border">${c.ar_customer_id}</span></td>
            <td>
              <div class="fw-semibold text-truncate" style="max-width: 180px;" title="${c.customer_name}">${c.customer_name}</div>
              ${c.contact_name ? `<small class="text-muted text-truncate d-block" style="max-width: 180px;">${c.contact_name}</small>` : ""}
            </td>
            <td><span class="badge bg-light text-dark border">${c.type_name || "General"}</span></td>
            <td class="d-none d-lg-table-cell small">${c.contact_phone || "—"}</td>
            <td class="d-none d-xl-table-cell small text-truncate" style="max-width: 200px;" title="${c.billing_address || ""}">${c.billing_address || "—"}</td>
            <td class="text-end font-monospace">${Number(c.credit_limit || 0).toFixed(2)}</td>
            <td class="text-end font-monospace text-danger">${Number(c.credit_exposure || 0).toFixed(2)}</td>
            <td class="text-end font-monospace text-success">${Number(c.available_credit || 0).toFixed(2)}</td>
            <td class="text-center">${c.is_active == 1 ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-secondary">Inactive</span>'}</td>
            ${canManageCustomers || canManageCreditLimits ? `<td class="text-center text-nowrap">${desktopActionButtons}</td>` : ""}
          </tr>
        `;
      }).join("")}
    </tbody>
  `;
  desktopContainer.appendChild(table);

  const sortBtn = desktopContainer.querySelector(".sortable-customer-id");
  if (sortBtn) {
    sortBtn.addEventListener("click", () => {
      customerSortOrder = customerSortOrder === "desc" ? "asc" : "desc";
      applySortAndRender();
    });
  }

  tableDiv.appendChild(mobileContainer);
  tableDiv.appendChild(desktopContainer);

  // Wire action events for both mobile and desktop via data-id
  tableDiv.querySelectorAll(".btn-credit-limit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = records.find((r) => String(r.ar_customer_id) === btn.dataset.id);
      if (c) updateCreditLimitModal(c);
    });
  });

  tableDiv.querySelectorAll(".btn-update").forEach((btn) => {
    btn.addEventListener("click", () => {
      updateModal(btn.dataset.id, arCustomerTypeList, displayRecords);
    });
  });

  tableDiv.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      deactivateModal(btn.dataset.id, displayRecords);
    });
  });

  tableDiv.querySelectorAll(".btn-restore").forEach((btn) => {
    btn.addEventListener("click", () => {
      restoreRecord(btn.dataset.id);
    });
  });
};

const updateCreditLimitModal = (customer) => {
  const modalElement = document.getElementById("blank-modal");
  document.getElementById("blank-modal-title").innerText = `Credit Limit — ${customer.customer_name}`;
  document.getElementById("blank-main-div").innerHTML = `
    <label class="form-label" for="credit-limit-input">Approved credit limit</label>
    <input class="form-control" type="number" id="credit-limit-input" min="0" max="9999999999.99" step="0.01" value="${Number(customer.credit_limit || 0).toFixed(2)}" required />
    <small class="form-text">Current outstanding: ${Number(customer.credit_exposure || 0).toFixed(2)}. A lower limit will not change existing balances, but will prevent additional credit purchases until the account is within its limit.</small>`;
  document.getElementById("blank-modal-footer").innerHTML = `
    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
    <button type="button" class="btn btn-primary" id="save-credit-limit">Save Credit Limit</button>`;
  document.getElementById("save-credit-limit").addEventListener("click", async () => {
    const input = document.getElementById("credit-limit-input");
    if (!input.reportValidity()) return;
    const formData = new FormData();
    formData.append("operation", "updateCreditLimit");
    formData.append("json", JSON.stringify({
      arCustomerId: customer.ar_customer_id,
      creditLimit: input.value,
    }));
    try {
      const { data } = await axios.post(`${baseApiUrl}/ar_customer.php`, formData, { withCredentials: true });
      if (data !== 1) throw new Error("The credit limit was not updated.");
      bootstrap.Modal.getOrCreateInstance(modalElement).hide();
      await displayRecords();
      showToast("Credit limit updated successfully.");
    } catch (error) {
      console.error(error);
      showError(error.response?.data?.message || error.message || "Unable to update the credit limit.");
    }
  });
  bootstrap.Modal.getOrCreateInstance(modalElement).show();
};

const insertArCustomer = async () => {
  const jsonData = {
    customerName: document.getElementById("customer_name").value,
    customerTypeId: document.getElementById("customer_type_id").value,
    contactName: document.getElementById("contact_name").value,
    contactPhone: document.getElementById("contact_phone").value,
    billingAddress: document.getElementById("billing_address").value,
    email: document.getElementById("email").value,
  };
  const formData = new FormData();
  formData.append("operation", "insertCustomer");
  formData.append("json", JSON.stringify(jsonData));
  try {
    const response = await axios({
      url: `${baseApiUrl}/ar_customer.php`,
      method: "POST",
      data: formData,
    });
    if (response.data == 1) {
      displayRecords();
      document.getElementById("add-form").reset();
      bootstrap.Modal.getOrCreateInstance(document.getElementById("blank-modal")).hide();
      showToast("AR Customer successfully saved!");
    } else {
      showError("Could not save customer.");
    }
  } catch (err) {
    showError(err.response?.data?.message || "Failed to save customer.");
  }
};

const restoreRecord = async (arCustomerId) => {
  const formData = new FormData();
  formData.append("operation", "restoreCustomer");
  formData.append("json", JSON.stringify({ arCustomerId: arCustomerId }));
  try {
    const response = await axios({
      url: `${baseApiUrl}/ar_customer.php`,
      method: "POST",
      data: formData,
    });
    if (response.data == 1) {
      displayRecords();
      showToast("AR Customer restored successfully.");
    } else {
      showError("Could not restore customer.");
    }
  } catch (err) {
    showError("Failed to restore customer.");
  }
};
