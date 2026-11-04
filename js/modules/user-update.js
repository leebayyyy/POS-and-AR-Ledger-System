import { showToast } from "../swal-helper.js";

export const updateModal = async (userId, roleList, refreshDisplay, currentUserId, terminalList = []) => {
  const myModal = new bootstrap.Modal(document.getElementById("blank-modal"), {
    keyboard: true,
    backdrop: "static",
  });

  document.getElementById("blank-modal-title").innerText = "Update User & Terminal Binding";
  const record = await getUserDetails(userId);
  const roles = [...roleList];
  if (!roles.some((role) => Number(role.role_id) === Number(record.role_id))) {
    roles.push({ role_id: record.role_id, role_name: record.role_name });
  }
  const isCurrentUser = Number(userId) === Number(currentUserId);

  let myHtml = `
        <table class="table table-sm align-middle">
          <tr>
            <td>Username</td>
            <td><input type="text" id="update-username" class="form-control" maxlength="50" value="${escapeHtml(record.username)}" required /></td>
          </tr>
          <tr>
            <td>First Name</td>
            <td><input type="text" id="update-first_name" class="form-control" maxlength="50" value="${escapeHtml(record.first_name)}" required /></td>
          </tr>
          <tr>
            <td>Last Name</td>
            <td><input type="text" id="update-last_name" class="form-control" maxlength="50" value="${escapeHtml(record.last_name)}" required /></td>
          </tr>
          <tr>
            <td>Role</td>
            <td><select class="form-select" id="update-role_id"></select></td>
          </tr>
          <tr>
            <td>Assigned Terminal</td>
            <td><select class="form-select" id="update-assigned_terminal_id"></select></td>
          </tr>
          <tr>
            <td>Email</td>
            <td><input type="email" id="update-email" class="form-control" maxlength="100" value="${escapeHtml(record.email)}" /></td>
          </tr>
          <tr>
            <td>Phone</td>
            <td><input type="text" id="update-phone" class="form-control" maxlength="30" value="${escapeHtml(record.phone)}" /></td>
          </tr>
          <tr>
            <td>New Password</td>
            <td><input type="password" id="update-password" class="form-control" minlength="8" placeholder="Leave blank to keep current password" /></td>
          </tr>
        </table>
    `;
  document.getElementById("blank-main-div").innerHTML = myHtml;

  let optionsHtml = '<option value="">-- SELECT ROLE --</option>';
  roles.forEach((role) => {
    const selected = record.role_id == role.role_id ? "selected" : "";
    optionsHtml += `<option value="${role.role_id}" ${selected}>${escapeHtml(role.role_name)}</option>`;
  });
  document.getElementById("update-role_id").innerHTML = optionsHtml;

  let termOptionsHtml = '<option value="">-- Exempt / Unassigned --</option>';
  terminalList.forEach((t) => {
    const selected = Number(record.assigned_terminal_id) === Number(t.pos_terminal_id) ? "selected" : "";
    termOptionsHtml += `<option value="${t.pos_terminal_id}" ${selected}>${escapeHtml(t.terminal_name)} (ID #${t.pos_terminal_id})</option>`;
  });
  document.getElementById("update-assigned_terminal_id").innerHTML = termOptionsHtml;

  if (isCurrentUser) {
    document.getElementById("update-role_id").disabled = true;
    document.getElementById("update-role_id").insertAdjacentHTML(
      "afterend",
      '<small class="form-text">You cannot change your own role assignment.</small>'
    );
  }

  const modalFooter = document.getElementById("blank-modal-footer");
  modalFooter.innerHTML = `
      <button type="button" class="btn btn-primary btn-sm w-100 btn-update">UPDATE</button>
      <button type="button" class="btn btn-secondary btn-sm w-100" data-bs-dismiss="modal">Close</button>
    `;

  modalFooter.querySelector(".btn-update").addEventListener("click", async () => {
    try {
      if (await updateUser(userId) == 1) {
        await refreshDisplay();
        showToast("Employee account successfully updated.", "success");
        myModal.hide();
      } else {
        throw new Error("Employee account was not updated.");
      }
    } catch (error) {
      console.error(error);
      const errorDiv = document.getElementById("users-error");
      errorDiv.textContent = error.response?.data?.message || "Unable to update employee account.";
      errorDiv.classList.remove("d-none");
    }
  });

  myModal.show();
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

const getUserDetails = async (userId) => {
  const params = {
    operation: "getUser",
    json: JSON.stringify({ userId: userId }),
  };
  const response = await axios.get(
    `${sessionStorage.baseAPIUrl}/user.php`,
    { params: params }
  );
  return response.data[0];
};

const updateUser = async (userId) => {
  const jsonData = {
    username: document.getElementById("update-username").value,
    firstName: document.getElementById("update-first_name").value,
    lastName: document.getElementById("update-last_name").value,
    roleId: document.getElementById("update-role_id").value,
    assignedTerminalId: document.getElementById("update-assigned_terminal_id")?.value || null,
    email: document.getElementById("update-email").value,
    phone: document.getElementById("update-phone").value,
    password: document.getElementById("update-password").value,
    userId: userId,
  };
  const formData = new FormData();
  formData.append("operation", "updateUser");
  formData.append("json", JSON.stringify(jsonData));
  const response = await axios({
    url: `${sessionStorage.baseAPIUrl}/user.php`,
    method: "POST",
    data: formData,
  });
  return response.data;
};
