import "./delete-as-backspace.js";

const authUrl = "api/auth.php";

const passwordInput = document.getElementById("password");
const usernameInput = document.getElementById("username");
const togglePasswordButton = document.getElementById("toggle-password");
const loginForm = document.getElementById("login-form");
const submitBtn = document.getElementById("login-submit-btn");
const submitText = document.getElementById("login-submit-text");
const spinner = document.getElementById("login-spinner");
const errorAlert = document.getElementById("login-error");
const errorText = document.getElementById("login-error-text");
const detectedTextEl = document.getElementById("detected-workstation-text");

let activeWorkstationToken = "";

const setWorkstationCookie = (token) => {
  if (!token) {
    document.cookie = "pos_device_token=; path=/; max-age=0; SameSite=Lax";
    document.cookie = "pos_simulated_terminal=; path=/; max-age=0; SameSite=Lax";
    return;
  }
  document.cookie = `pos_device_token=${encodeURIComponent(token)}; path=/; max-age=31536000; SameSite=Lax`;
  document.cookie = `pos_simulated_terminal=${encodeURIComponent(token)}; path=/; max-age=31536000; SameSite=Lax`;
};

const resolveClientWorkstationToken = () => {
  const params = new URLSearchParams(window.location.search);
  const urlToken =
    params.get("terminal") ||
    params.get("workstation") ||
    params.get("device_token") ||
    params.get("machine_identifier");

  if (urlToken) {
    if (urlToken.toLowerCase() === "reset" || urlToken.toLowerCase() === "default") {
      localStorage.removeItem("pos_device_token");
      setWorkstationCookie("");
      return "";
    }
    localStorage.setItem("pos_device_token", urlToken.trim());
    setWorkstationCookie(urlToken.trim());
    return urlToken.trim();
  }

  const stored = localStorage.getItem("pos_device_token") || "";
  if (stored) {
    setWorkstationCookie(stored);
  }
  return stored;
};

const initWorkstationDetection = async () => {
  activeWorkstationToken = resolveClientWorkstationToken();
  try {
    const { data } = await axios.get(authUrl, {
      params: {
        operation: "detectWorkstation",
        ...(activeWorkstationToken ? { workstation: activeWorkstationToken } : {})
      },
      withCredentials: true
    });
    const det = data?.detectedTerminal;
    if (det) {
      const code = det.machine_identifier || det.device_token || `ID-${det.pos_terminal_id}`;
      if (detectedTextEl) {
        detectedTextEl.textContent = `Workstation: ${det.terminal_name} [${code}]`;
      }
      if (det.device_token && !activeWorkstationToken) {
        activeWorkstationToken = det.device_token;
      }
    } else if (detectedTextEl) {
      detectedTextEl.textContent = "Workstation: Unregistered Terminal";
    }
  } catch (err) {
    if (detectedTextEl) {
      detectedTextEl.textContent = "Workstation: Auto-Detect Active";
    }
  }
};

initWorkstationDetection();

// Password visibility toggle
togglePasswordButton?.addEventListener("click", () => {
  const isVisible = passwordInput.type === "password";
  passwordInput.type = isVisible ? "text" : "password";
  togglePasswordButton.setAttribute("aria-label", isVisible ? "Hide password" : "Show password");
  togglePasswordButton.setAttribute("aria-pressed", String(isVisible));
  document.getElementById("password-visible-icon").hidden = !isVisible;
  document.getElementById("password-hidden-icon").hidden = isVisible;
  passwordInput.focus();
});

// Form submission with loading and error states
loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = usernameInput?.value.trim();
  const password = passwordInput?.value;

  if (!username || !password) {
    showError("Please enter both username and password.");
    if (!username) usernameInput?.focus();
    else passwordInput?.focus();
    return;
  }

  // Set loading state
  setLoading(true);
  hideError();

  const workstationToken = resolveClientWorkstationToken() || activeWorkstationToken;

  const formData = new FormData();
  formData.append("operation", "login");
  formData.append(
    "json",
    JSON.stringify({
      username,
      password,
      ...(workstationToken ? { workstation: workstationToken, deviceToken: workstationToken } : {})
    })
  );

  try {
    const response = await axios.post(authUrl, formData, { withCredentials: true });
    if (response.data.returnValue === 1) {
      const role = response.data.user?.role_name;
      // WP-2: Terminal is auto-assigned on login; Cashiers proceed directly to POS register (no terminal picker)
      window.location.href = role === "Cashier" ? "sales.html" : "index.html";
    } else {
      showError(response.data.message || "Invalid credentials.");
      setLoading(false);
    }
  } catch (error) {
    if (error.response?.status !== 401 && error.response?.status !== 403) {
      console.error("Login request failed:", error);
    }
    showError(error.response?.data?.message || "Invalid username or password. Please try again.");
    setLoading(false);
  }
});

function setLoading(isLoading) {
  if (submitBtn) submitBtn.disabled = isLoading;
  if (usernameInput) usernameInput.disabled = isLoading;
  if (passwordInput) passwordInput.disabled = isLoading;
  if (spinner) spinner.classList.toggle("d-none", !isLoading);
  if (submitText) submitText.textContent = isLoading ? "Authenticating..." : "Sign In to Workspace";
}

function showError(msg) {
  if (errorText) errorText.textContent = msg;
  if (errorAlert) errorAlert.classList.remove("d-none");
  if (passwordInput) {
    passwordInput.focus();
    passwordInput.select();
  }
}

function hideError() {
  if (errorAlert) errorAlert.classList.add("d-none");
}
