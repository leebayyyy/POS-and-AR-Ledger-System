import { updateModal } from "./modules/wholesale_price-update.js";
import { deleteModal } from "./modules/wholesale_price-delete.js";
import { showToast, showError } from "./swal-helper.js";

const baseApiUrl = "api";
sessionStorage.setItem("baseAPIUrl", baseApiUrl);

let productList = [];
document.addEventListener("DOMContentLoaded", () => {
  loadProduct();
  displayRecords();
  document.getElementById("btn-submit").addEventListener("click", () => {
    insertWholesalePrice();
  });
});

const loadProduct = async () => {
  const select = document.getElementById("product_id");
  const response = await axios.get(`${baseApiUrl}/product.php`, {
    params: { operation: "getAllProducts" },
  });
  if (response.status == 200) {
    productList = response.data;
    select.innerHTML = '<option value="">-- SELECT PRODUCT --</option>';
    productList.forEach((product) => {
      let option = document.createElement("option");
      option.innerText = product.product_name;
      option.value = product.product_id;
      select.appendChild(option);
    });
  } else {
    showError("Unable to load product list.");
  }
};

const displayRecords = async () => {
  const response = await axios.get(`${baseApiUrl}/wholesale_price.php`, {
    params: { operation: "getAllWholesalePrices" },
  });
  if (response.status == 200) {
    displayRecordsTable(response.data);
  } else {
    showError("Unable to load wholesale prices.");
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
        <th>PRODUCT</th>
        <th>WHOLESALE PRICE</th>
        <th>PRICE TIER</th>
        <th>EFFECTIVE FROM</th>
        <th>EFFECTIVE TO</th>
        <th>ACTION</th>
      </tr>
    `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  records.forEach((wholesalePrice) => {
    let row = document.createElement("tr");
    row.innerHTML = `
        <td>${wholesalePrice.product_name}</td>
        <td>${wholesalePrice.wholesale_price}</td>
        <td>${wholesalePrice.price_tier}</td>
        <td>${wholesalePrice.effective_from}</td>
        <td>${wholesalePrice.effective_to}</td>
        <td>
          <button type='button' class='btn btn-success btn-sm btn-update'>Update</button>
          <button type='button' class='btn btn-danger btn-sm btn-delete'>Delete</button>
        </td>
      `;
    tbody.appendChild(row);

    row.querySelector(".btn-update").addEventListener("click", () => {
      updateModal(wholesalePrice.wholesale_price_id, productList, displayRecords);
    });

    row.querySelector(".btn-delete").addEventListener("click", () => {
      deleteModal(wholesalePrice.wholesale_price_id, displayRecords);
    });
  });
  table.appendChild(tbody);
  tableDiv.appendChild(table);
};

const insertWholesalePrice = async () => {
  const jsonData = {
    productId: document.getElementById("product_id").value,
    wholesalePrice: document.getElementById("wholesale_price").value,
    priceTier: document.getElementById("price_tier").value,
    effectiveFrom: document.getElementById("effective_from").value,
    effectiveTo: document.getElementById("effective_to").value,
  };
  const formData = new FormData();
  formData.append("operation", "insertWholesalePrice");
  formData.append("json", JSON.stringify(jsonData));
  const response = await axios({
    url: `${baseApiUrl}/wholesale_price.php`,
    method: "POST",
    data: formData,
  });
  if (response.data == 1) {
    displayRecords();
    document.getElementById("btn-submit").closest("#main-div").querySelectorAll("input, select").forEach((el) => (el.value = ""));
    showToast("Wholesale Price successfully saved!", "success");
  } else {
    showError("Failed to save wholesale price.");
  }
};
