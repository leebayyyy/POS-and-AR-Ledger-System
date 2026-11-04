import { updateModal } from "./modules/role-update.js";
import { deleteModal } from "./modules/role-delete.js";
import { showToast, showError } from "./swal-helper.js";

const baseApiUrl = "api";
sessionStorage.setItem("baseAPIUrl", baseApiUrl);

document.addEventListener("DOMContentLoaded", () => {
  const addFieldsHtml = document.getElementById("blank-main-div").innerHTML;
  document.getElementById("btn-add").addEventListener("click", () => {
    document.getElementById("blank-modal-title").innerText = "Add Role";
    document.getElementById("blank-main-div").innerHTML = addFieldsHtml;
    document.getElementById("add-form").reset();
    document.getElementById("blank-modal-footer").innerHTML = `
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
      <button type="submit" class="btn btn-primary" id="btn-submit" form="add-form">Submit</button>`;
  });
  document.getElementById("role-search-filter")?.addEventListener("input", () => {
    filterAndRenderRoles();
  });
  displayRecords();
  document.getElementById("add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    insertRole();
  });
});

let allRolesCache = [];

const filterAndRenderRoles = () => {
  const q = (document.getElementById("role-search-filter")?.value || "").toLowerCase().trim();
  if (!q) {
    displayRecordsTable(allRolesCache);
    return;
  }
  const filtered = allRolesCache.filter((r) =>
    String(r.role_id || "").toLowerCase().includes(q) ||
    String(r.role_name || "").toLowerCase().includes(q) ||
    String(r.description || "").toLowerCase().includes(q)
  );
  displayRecordsTable(filtered);
};

const displayRecords = async () => {
  const response = await axios.get(`${baseApiUrl}/role.php`, {
    params: { operation: "getAllRoles" },
  });
  if (response.status == 200) {
    allRolesCache = Array.isArray(response.data) ? response.data : [];
    filterAndRenderRoles();
  } else {
    showError("Unable to load roles.");
  }
};

const displayRecordsTable = (records) => {
  const tableDiv = document.getElementById("table-div");
  tableDiv.innerHTML = "";
  const table = document.createElement("table");
  table.classList.add("table", "table-hover", "table-striped", "table-sm");

  const thead = document.createElement("thead");
  thead.innerHTML = `
      <tr>
        <th>ROLE NAME</th>
        <th>DESCRIPTION</th>
        <th>ACTION</th>
      </tr>
    `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  records.forEach((role) => {
    let row = document.createElement("tr");
    row.innerHTML = `
        <td>${role.role_name}</td>
        <td>${role.description}</td>
        <td>
          <button type='button' class='btn btn-success btn-sm btn-update'>Update</button>
          <button type='button' class='btn btn-danger btn-sm btn-delete'>Delete</button>
        </td>
      `;
    tbody.appendChild(row);

    row.querySelector(".btn-update").addEventListener("click", () => {
      updateModal(role.role_id, displayRecords);
    });

    row.querySelector(".btn-delete").addEventListener("click", () => {
      deleteModal(role.role_id, displayRecords);
    });
  });
  table.appendChild(tbody);
  tableDiv.appendChild(table);
};

const insertRole = async () => {
  const jsonData = {
    roleName: document.getElementById("role_name").value,
    description: document.getElementById("description").value,
  };
  const formData = new FormData();
  formData.append("operation", "insertRole");
  formData.append("json", JSON.stringify(jsonData));
  const response = await axios({
    url: `${baseApiUrl}/role.php`,
    method: "POST",
    data: formData,
  });
  if (response.data == 1) {
    displayRecords();
    document.getElementById("add-form").reset();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("blank-modal")).hide();
    showToast("Role successfully saved!", "success");
  } else {
    showError("Failed to save role.");
  }
};
