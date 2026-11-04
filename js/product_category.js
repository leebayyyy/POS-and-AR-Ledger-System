import { updateModal } from "./modules/product_category-update.js";
import { deleteModal } from "./modules/product_category-delete.js";
import { showToast, showError } from "./swal-helper.js";

const baseApiUrl = "api";
sessionStorage.setItem("baseAPIUrl", baseApiUrl);

document.addEventListener("DOMContentLoaded", () => {
  const addFieldsHtml = document.getElementById("blank-main-div").innerHTML;
  document.getElementById("btn-add").addEventListener("click", () => {
    document.getElementById("blank-modal-title").innerText = "Add Product Category";
    document.getElementById("blank-main-div").innerHTML = addFieldsHtml;
    document.getElementById("add-form").reset();
    document.getElementById("blank-modal-footer").innerHTML = `
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
      <button type="submit" class="btn btn-primary" id="btn-submit" form="add-form">Submit</button>`;
  });
  document.getElementById("category-search-filter")?.addEventListener("input", () => {
    filterAndRenderCategories();
  });
  displayRecords();
  document.getElementById("add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    insertProductCategory();
  });
});

let allCategoriesCache = [];

const filterAndRenderCategories = () => {
  const q = (document.getElementById("category-search-filter")?.value || "").toLowerCase().trim();
  if (!q) {
    displayRecordsTable(allCategoriesCache);
    return;
  }
  const filtered = allCategoriesCache.filter((c) =>
    String(c.category_id || "").toLowerCase().includes(q) ||
    String(c.category_name || "").toLowerCase().includes(q) ||
    String(c.description || "").toLowerCase().includes(q)
  );
  displayRecordsTable(filtered);
};

const displayRecords = async () => {
  const response = await axios.get(`${baseApiUrl}/product_category.php`, {
    params: { operation: "getAllProductCategories" },
  });
  if (response.status == 200) {
    allCategoriesCache = Array.isArray(response.data) ? response.data : [];
    filterAndRenderCategories();
  } else {
    showError("Unable to load product categories.");
  }
};

let categorySortDirection = "desc";

const displayRecordsTable = (records) => {
  const tableDiv = document.getElementById("table-div");
  tableDiv.innerHTML = "";
  const table = document.createElement("table");
  table.classList.add("table", "table-hover", "table-striped", "table-sm");

  const sorted = [...records].sort((a, b) => {
    const idA = Number(a.category_id || 0);
    const idB = Number(b.category_id || 0);
    return categorySortDirection === "desc" ? idB - idA : idA - idB;
  });

  const thead = document.createElement("thead");
  thead.innerHTML = `
      <tr>
        <th id="th-category-id" style="cursor: pointer; user-select: none;" title="Click to sort by Category ID">
          CATEGORY ID <span class="sort-icon">${categorySortDirection === "desc" ? "▼" : "▲"}</span>
        </th>
        <th>CATEGORY NAME</th>
        <th>DESCRIPTION</th>
        <th>ACTION</th>
      </tr>
    `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  sorted.forEach((productCategory) => {
    let row = document.createElement("tr");
    row.innerHTML = `
        <td class="font-monospace fw-bold">#${productCategory.category_id}</td>
        <td>${productCategory.category_name}</td>
        <td>${productCategory.description || ""}</td>
        <td>
          <button type='button' class='btn btn-success btn-sm btn-update'>Update</button>
          <button type='button' class='btn btn-danger btn-sm btn-delete'>Delete</button>
        </td>
      `;
    tbody.appendChild(row);

    row.querySelector(".btn-update").addEventListener("click", () => {
      updateModal(productCategory.category_id, displayRecords);
    });

    row.querySelector(".btn-delete").addEventListener("click", () => {
      deleteModal(productCategory.category_id, displayRecords);
    });
  });
  table.appendChild(tbody);
  tableDiv.appendChild(table);

  document.getElementById("th-category-id")?.addEventListener("click", () => {
    categorySortDirection = categorySortDirection === "desc" ? "asc" : "desc";
    displayRecordsTable(records);
  });
};

const insertProductCategory = async () => {
  const jsonData = {
    categoryName: document.getElementById("category_name").value,
    description: document.getElementById("description").value,
  };
  const formData = new FormData();
  formData.append("operation", "insertProductCategory");
  formData.append("json", JSON.stringify(jsonData));
  const response = await axios({
    url: `${baseApiUrl}/product_category.php`,
    method: "POST",
    data: formData,
  });
  if (response.data == 1) {
    displayRecords();
    document.getElementById("add-form").reset();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("blank-modal")).hide();
    showToast("Product Category successfully saved!", "success");
  } else {
    showError("Failed to save product category.");
  }
};
