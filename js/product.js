import { updateModal } from "./modules/product-update.js";
import { deactivateModal } from "./modules/product-delete.js";
import { showToast, showError, showSuccess } from "./swal-helper.js";

const baseApiUrl = "api";
sessionStorage.setItem("baseAPIUrl", baseApiUrl);

let productCategoryList = [];
let unitOfMeasureList = [];
let promotionList = [];
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("btn-add").addEventListener("click", () => {
    renderAddModal();
  });
  document.getElementById("product-master-search")?.addEventListener("input", () => {
    filterAndRenderProducts();
  });
  await loadProductCategory();
  await loadUnitOfMeasure();
  await loadPromotions();
  await displayRecords();
  document.getElementById("add-product-form").addEventListener("submit", (event) => {
    event.preventDefault();
    insertProduct();
  });
});

const renderAddModal = () => {
  document.getElementById("blank-modal-title").innerText = "Add Product";
  document.getElementById("blank-main-div").innerHTML = `
    <div class="col-md-6">
      <input type="text" class="form-control" id="product_name" placeholder="Product Name" maxlength="200" required />
    </div>
    <div class="col-md-6">
      <input type="number" step="0.01" min="0" max="99999999.99" class="form-control" id="price" placeholder="Price" />
    </div>
    <div class="col-md-6">
      <select class="form-select" id="category_id" required>
        <option value="">-- SELECT CATEGORY --</option>
      </select>
    </div>
    <div class="col-md-6">
      <select class="form-select" id="unit_of_measure_id" required>
        <option value="">-- SELECT UNIT OF MEASURE --</option>
      </select>
    </div>
    <div class="col-md-6">
      <div class="form-control bg-light text-muted fw-bold" style="cursor: not-allowed;" title="Static price tier">Retail</div>
      <input type="hidden" id="price_tier" value="Retail" />
    </div>
    <div class="col-md-6"><input type="number" step="0.01" min="0" class="form-control" id="wholesale_price" placeholder="Wholesale Price" /></div>
    <div class="col-md-12">
      <select class="form-select" id="promo_id">
        <option value="">-- NO PROMOTION --</option>
      </select>
    </div>
  `;
  document.getElementById("blank-modal-footer").innerHTML = `
    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
    <button type="submit" class="btn btn-primary" id="btn-submit" form="add-product-form">Submit</button>
  `;

  const select = document.getElementById("category_id");
  select.innerHTML = '<option value="">-- SELECT CATEGORY --</option>';
  productCategoryList.forEach((productCategory) => {
    const option = document.createElement("option");
    option.innerText = productCategory.category_name;
    option.value = productCategory.category_id;
    select.appendChild(option);
  });

  const unitSelect = document.getElementById("unit_of_measure_id");
  unitSelect.innerHTML = '<option value="">-- SELECT UNIT OF MEASURE --</option>';
  unitOfMeasureList.forEach((unit) => {
    const option = document.createElement("option");
    option.textContent = unit.measure_name;
    option.value = unit.unit_of_measure_id;
    unitSelect.appendChild(option);
  });

  const promoSelect = document.getElementById("promo_id");
  if (promoSelect) {
    promoSelect.innerHTML = '<option value="">-- NO PROMOTION --</option>';
    promotionList.forEach((promo) => {
      const option = document.createElement("option");
      option.innerText = `${promo.promo_name} (${Number(promo.discount_rate).toFixed(0)}% off)`;
      option.value = promo.promo_id;
      promoSelect.appendChild(option);
    });
  }
};

const loadProductCategory = async () => {
  const response = await axios.get(`${baseApiUrl}/product_category.php`, {
    params: { operation: "getAllProductCategories" },
    withCredentials: true,
  });
  if (response.status == 200) {
    productCategoryList = response.data;
    const select = document.getElementById("category_id");
    if (select) {
      select.innerHTML = '<option value="">-- SELECT CATEGORY --</option>';
      productCategoryList.forEach((productCategory) => {
        let option = document.createElement("option");
        option.innerText = productCategory.category_name;
        option.value = productCategory.category_id;
        select.appendChild(option);
      });
    }
  } else {
    showError("Error loading product categories!");
  }
};

const loadUnitOfMeasure = async () => {
  const response = await axios.get(`${baseApiUrl}/product.php`, {
    params: { operation: "getAllUnitsOfMeasure" },
    withCredentials: true,
  });
  if (response.status == 200) {
    unitOfMeasureList = response.data;
    const unitSelect = document.getElementById("unit_of_measure_id");
    if (unitSelect) {
      unitSelect.innerHTML = '<option value="">-- SELECT UNIT OF MEASURE --</option>';
      unitOfMeasureList.forEach((unit) => {
        const option = document.createElement("option");
        option.textContent = unit.measure_name;
        option.value = unit.unit_of_measure_id;
        unitSelect.appendChild(option);
      });
    }
  } else {
    showError("Error loading units of measure!");
  }
};

const loadPromotions = async () => {
  try {
    const response = await axios.get(`${baseApiUrl}/product.php`, {
      params: { operation: "getAllPromotions" },
      withCredentials: true,
    });
    if (response.status == 200 && Array.isArray(response.data)) {
      promotionList = response.data;
      const select = document.getElementById("promo_id");
      if (select) {
        select.innerHTML = '<option value="">-- NO PROMOTION --</option>';
        promotionList.forEach((promo) => {
          let option = document.createElement("option");
          option.innerText = `${promo.promo_name} (${Number(promo.discount_rate).toFixed(0)}% off)`;
          option.value = promo.promo_id;
          select.appendChild(option);
        });
      }
    }
  } catch (err) {
    console.error("Error loading promotions", err);
  }
};

let allProductsCache = [];
let productSortColumn = "product_id";
let productSortDirection = "desc";

const filterAndRenderProducts = () => {
  const q = (document.getElementById("product-master-search")?.value || "").toLowerCase().trim();
  if (!q) {
    displayRecordsTable(allProductsCache);
    return;
  }
  const filtered = allProductsCache.filter((p) => {
    const code = String(p.product_id || "").padStart(8, "0");
    return (
      String(p.product_id || "").toLowerCase().includes(q) ||
      code.includes(q) ||
      String(p.barcode || "").toLowerCase().includes(q) ||
      String(p.product_name || "").toLowerCase().includes(q) ||
      String(p.category_name || "").toLowerCase().includes(q)
    );
  });
  displayRecordsTable(filtered);
};

const displayRecords = async () => {
  const response = await axios.get(`${baseApiUrl}/product.php`, {
    params: { operation: "getAllProducts" },
    withCredentials: true,
  });
  if (response.status == 200) {
    allProductsCache = Array.isArray(response.data) ? response.data : [];
    filterAndRenderProducts();
  } else {
    showError("Error loading products!");
  }
};

const displayRecordsTable = (records) => {
  const tableDiv = document.getElementById("table-div");
  tableDiv.innerHTML = "";
  const table = document.createElement("table");
  table.classList.add("table", "table-hover", "table-striped", "table-sm");

  const sorted = [...records].sort((a, b) => {
    let comparison = 0;
    if (productSortColumn === "product_id") {
      comparison = Number(a.product_id || 0) - Number(b.product_id || 0);
    } else if (productSortColumn === "product_name") {
      comparison = (a.product_name || "").localeCompare(b.product_name || "");
    } else if (productSortColumn === "price") {
      comparison = Number(a.price || 0) - Number(b.price || 0);
    } else if (productSortColumn === "category_name") {
      comparison = (a.category_name || "").localeCompare(b.category_name || "");
    } else if (productSortColumn === "unit_of_measure") {
      const uA = a.measure_name || unitOfMeasureList.find((unit) => Number(unit.unit_of_measure_id) === Number(a.unit_of_measure_id))?.measure_name || "";
      const uB = b.measure_name || unitOfMeasureList.find((unit) => Number(unit.unit_of_measure_id) === Number(b.unit_of_measure_id))?.measure_name || "";
      comparison = uA.localeCompare(uB);
    }
    return productSortDirection === "desc" ? -comparison : comparison;
  });

  const getSortIcon = (col) => (productSortColumn === col ? (productSortDirection === "desc" ? "▼" : "▲") : "");

  const thead = document.createElement("thead");
  thead.innerHTML = `
      <tr>
        <th id="th-product-id" class="text-nowrap" style="cursor: pointer; user-select: none;" title="Click to sort by Product ID">
          PRODUCT ID <span class="sort-icon text-primary">${getSortIcon("product_id")}</span>
        </th>
        <th id="th-product-name" class="text-nowrap" style="cursor: pointer; user-select: none;" title="Click to sort by Product Name">
          PRODUCT NAME <span class="sort-icon text-primary">${getSortIcon("product_name")}</span>
        </th>
        <th id="th-product-price" class="text-nowrap" style="cursor: pointer; user-select: none;" title="Click to sort by Price">
          PRICE <span class="sort-icon text-primary">${getSortIcon("price")}</span>
        </th>
        <th id="th-product-category" class="text-nowrap" style="cursor: pointer; user-select: none;" title="Click to sort by Category">
          CATEGORY <span class="sort-icon text-primary">${getSortIcon("category_name")}</span>
        </th>
        <th id="th-product-unit" class="text-nowrap" style="cursor: pointer; user-select: none;" title="Click to sort by Unit of Measure">
          UNIT OF MEASURE <span class="sort-icon text-primary">${getSortIcon("unit_of_measure")}</span>
        </th>
        <th>PRICE TIER</th>
        <th>WHOLESALE PRICE</th>
        <th>STATUS</th>
        <th>ACTION</th>
      </tr>
    `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  sorted.forEach((product) => {
    const measureName = product.measure_name || unitOfMeasureList.find((unit) => Number(unit.unit_of_measure_id) === Number(product.unit_of_measure_id))?.measure_name || "";
    let row = document.createElement("tr");
    row.innerHTML = `
        <td class="font-monospace fw-bold">#${product.product_id}</td>
        <td>${product.product_name}</td>
        <td>₱${Number(product.price || 0).toFixed(2)}</td>
        <td>${product.category_name || ""}</td>
        <td>${measureName}</td>
        <td>${product.price_tier ?? ""}</td>
        <td>${product.wholesale_price ? `₱${Number(product.wholesale_price).toFixed(2)}` : ""}</td>
        <td>${product.is_active == 1 ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-secondary">Inactive</span>'}</td>
        <td>
          <button type='button' class='btn btn-success btn-sm btn-update'>Update</button>
          ${product.is_active == 1
            ? `<button type='button' class='btn btn-danger btn-sm btn-delete'>Deactivate</button>`
            : `<button type='button' class='btn btn-secondary btn-sm btn-restore'>Restore</button>`}
        </td>
      `;
    tbody.appendChild(row);

    row.querySelector(".btn-update").addEventListener("click", () => {
      updateModal(product.product_id, productCategoryList, unitOfMeasureList, displayRecords, promotionList);
    });

    if (product.is_active == 1) {
      row.querySelector(".btn-delete").addEventListener("click", () => {
        deactivateModal(product.product_id, displayRecords);
      });
    } else {
      row.querySelector(".btn-restore").addEventListener("click", () => {
        restoreRecord(product.product_id);
      });
    }
  });
  table.appendChild(tbody);
  tableDiv.appendChild(table);

  const handleSortClick = (col) => {
    if (productSortColumn === col) {
      productSortDirection = productSortDirection === "desc" ? "asc" : "desc";
    } else {
      productSortColumn = col;
      productSortDirection = col === "product_id" ? "desc" : "asc";
    }
    displayRecordsTable(records);
  };

  document.getElementById("th-product-id")?.addEventListener("click", () => handleSortClick("product_id"));
  document.getElementById("th-product-name")?.addEventListener("click", () => handleSortClick("product_name"));
  document.getElementById("th-product-price")?.addEventListener("click", () => handleSortClick("price"));
  document.getElementById("th-product-category")?.addEventListener("click", () => handleSortClick("category_name"));
  document.getElementById("th-product-unit")?.addEventListener("click", () => handleSortClick("unit_of_measure"));
};

const insertProduct = async () => {
  const jsonData = {
    productName: document.getElementById("product_name")?.value || "",
    price: document.getElementById("price")?.value || "",
    categoryId: document.getElementById("category_id")?.value || "",
    unitOfMeasureId: document.getElementById("unit_of_measure_id")?.value || "",
    priceTier: document.getElementById("price_tier")?.value?.trim() || "Retail",
    wholesalePrice: document.getElementById("wholesale_price")?.value || "",
    promoId: document.getElementById("promo_id")?.value || null,
  };
  const formData = new FormData();
  formData.append("operation", "insertProduct");
  formData.append("json", JSON.stringify(jsonData));
  try {
    const response = await axios({
      url: `${baseApiUrl}/product.php`,
      method: "POST",
      data: formData,
      withCredentials: true,
    });
    if (response.data == 1) {
      await displayRecords();
      document.getElementById("add-product-form")?.reset();
      bootstrap.Modal.getOrCreateInstance(document.getElementById("blank-modal")).hide();
      showToast("Product successfully saved!");
    } else {
      showError("ERROR: " + (response.data?.message || "Could not save product."));
    }
  } catch (err) {
    showError("Save error: " + (err.response?.data?.message || err.message));
  }
};

const restoreRecord = async (productId) => {
  const formData = new FormData();
  formData.append("operation", "restoreProduct");
  formData.append("json", JSON.stringify({ productId: productId }));
  const response = await axios({
    url: `${baseApiUrl}/product.php`,
    method: "POST",
    data: formData,
    withCredentials: true,
  });
  if (response.data == 1) {
    displayRecords();
    showToast("Product restored successfully.");
  } else {
    showError("Could not restore product.");
  }
};
