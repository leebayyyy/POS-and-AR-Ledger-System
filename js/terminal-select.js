import { getSession } from "./auth.js?v=20261021";

// WP-2: Manual terminal picker is deprecated and removed for Cashiers.
// Redirect immediately to the POS register (or dashboard for non-cashiers).
const redirectAutoAssignedTerminal = async () => {
  try {
    const session = await getSession();
    if (!session.authenticated) {
      window.location.replace("login.html");
      return;
    }
    window.location.replace(session.user?.role_name === "Cashier" ? "sales.html" : "index.html");
  } catch (err) {
    window.location.replace("sales.html");
  }
};

redirectAutoAssignedTerminal();
