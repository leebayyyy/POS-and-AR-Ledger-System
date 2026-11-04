import { updateModal } from "./modules/ar_customer_type-update.js";
import { deleteModal } from "./modules/ar_customer_type-delete.js";
import { showToast, showError } from "./swal-helper.js";

const baseApiUrl = "api";
sessionStorage.setItem("baseAPIUrl", baseApiUrl);

let canManageCustomerTypes = false;
document.addEventListener("DOMContentLoaded", () => {
  const addFieldsHtml = document.getElementById("blank-main-div").innerHTML;
  document.getElementById("btn-add").addEventListener("click", () => {
    if (!canManageCustomerTypes) return;
    document.getElementById("blank-modal-title").innerText = "Add Customer Type";
    document.getElementById("blank-main-div").innerHTML = addFieldsHtml;
    document.getElementById("add-form").reset();
    document.getElementById("blank-modal-footer").innerHTML = `
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
      <button type="submit" class="btn btn-primary" id="btn-submit" form="add-form">Submit</button>`;
  });
  loadPermissions()
    .then(displayRecords)
    .catch((error) => {
      console.error(error);
      document.getElementById("table-div").innerHTML =
        '<div class="alert alert-danger">Unable to load customer type data.</div>';
    });
  document.getElementById("customer-type-search-filter")?.addEventListener("input", () => {
    filterAndRenderCustomerTypes();
  });
  document.getElementById("add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    insertArCustomerType();
  });
});

let allCustomerTypesCache = [];

const filterAndRenderCustomerTypes = () => {
  const q = (document.getElementById("customer-type-search-filter")?.value || "").toLowerCase().trim();
  if (!q) {
    displayRecordsTable(allCustomerTypesCache);
    return;
  }
  const filtered = allCustomerTypesCache.filter((t) =>
    String(t.customer_type_id || "").toLowerCase().includes(q) ||
    String(t.type_name || "").toLowerCase().includes(q) ||
    String(t.description || "").toLowerCase().includes(q)
  );
  displayRecordsTable(filtered);
};

const loadPermissions = async () => {
  const response = await axios.get(`${baseApiUrl}/auth.php`, {
    params: { operation: "session" },
    withCredentials: true,
  });
  canManageCustomerTypes = response.data.user?.role_name === "Admin";
  document.getElementById("btn-add").classList.toggle("d-none", !canManageCustomerTypes);
};

const displayRecords = async () => {
  const response = await axios.get(`${baseApiUrl}/ar_customer_type.php`, {
    params: { operation: "getAllCustomerTypes" },
  });
  if (response.status == 200) {
    allCustomerTypesCache = Array.isArray(response.data) ? response.data : [];
    filterAndRenderCustomerTypes();
  } else {
    showError("Unable to load customer types.");
  }
};

let customerTypeSortDirection = "desc";

const displayRecordsTable = (records) => {
  const tableDiv = document.getElementById("table-div");
  tableDiv.innerHTML = "";
  const table = document.createElement("table");
  table.classList.add("table", "table-hover", "table-striped", "table-sm");

  const sorted = [...records].sort((a, b) => {
    const idA = Number(a.customer_type_id || 0);
    const idB = Number(b.customer_type_id || 0);
    return customerTypeSortDirection === "desc" ? idB - idA : idA - idB;
  });

  const thead = document.createElement("thead");
  thead.innerHTML = `
      <tr>
        <th id="th-customer-type-id" style="cursor: pointer; user-select: none;" title="Click to sort by Customer Type ID">
          TYPE ID <span class="sort-icon">${customerTypeSortDirection === "desc" ? "▼" : "▲"}</span>
        </th>
        <th>TYPE NAME</th>
        <th>DESCRIPTION</th>
        <th>DAYS</th>
        ${canManageCustomerTypes ? "<th>ACTION</th>" : ""}
      </tr>
    `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  sorted.forEach((customerType) => {
    let row = document.createElement("tr");
    row.innerHTML = `
        <td class="font-monospace fw-bold">#${customerType.customer_type_id}</td>
        <td>${customerType.type_name}</td>
        <td>${customerType.description}</td>
        <td>${customerType.days ?? ""}</td>
        ${canManageCustomerTypes ? `<td>
          <button type='button' class='btn btn-success btn-sm btn-update'>Update</button>
          <button type='button' class='btn btn-danger btn-sm btn-delete'>Delete</button>
        </td>` : ""}
      `;
    tbody.appendChild(row);

    if (canManageCustomerTypes) {
      row.querySelector(".btn-update").addEventListener("click", () => {
        updateModal(customerType.customer_type_id, displayRecords);
      });

      row.querySelector(".btn-delete").addEventListener("click", () => {
        deleteModal(customerType.customer_type_id, displayRecords);
      });
    }
  });
  table.appendChild(tbody);
  tableDiv.appendChild(table);

  document.getElementById("th-customer-type-id")?.addEventListener("click", () => {
    customerTypeSortDirection = customerTypeSortDirection === "desc" ? "asc" : "desc";
    displayRecordsTable(records);
  });
};

const insertArCustomerType = async () => {
  const jsonData = {
    typeName: document.getElementById("type_name").value,
    description: document.getElementById("description").value,
    days: document.getElementById("days").value,
  };
  const formData = new FormData();
  formData.append("operation", "insertCustomerType");
  formData.append("json", JSON.stringify(jsonData));
  const response = await axios({
    url: `${baseApiUrl}/ar_customer_type.php`,
    method: "POST",
    data: formData,
  });
  if (response.data == 1) {
    displayRecords();
    document.getElementById("add-form").reset();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("blank-modal")).hide();
    showToast("Customer Type successfully saved!", "success");
  } else {
    showError("Failed to save customer type.");
  }
};
