const API_URL = import.meta.env.VITE_API_URL || "/api";
import mockApi from "../mock/mockApi";

const DEFAULT_TIMEOUT_MS = 60000; // long enough for report/PDF downloads

function getToken() {
  return localStorage.getItem("rclpg_token");
}

function getExpiry() {
  return localStorage.getItem("rclpg_expires_at");
}

export { getToken, getExpiry };

export function clearSession() {
  localStorage.removeItem("rclpg_token");
  localStorage.removeItem("rclpg_expires_at");
  localStorage.removeItem("rclpg_admin");
}

class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code; // "TIMEOUT" | "NETWORK" | "HTTP"
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isSessionExpired() {
  const expiry = getExpiry();
  if (!expiry) return true;
  return new Date() >= new Date(expiry);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ApiError("The connection is too slow. Please try again.", {
        code: "TIMEOUT",
      });
    }
    throw new ApiError(
      "Can't reach the server. Check your internet connection.",
      { code: "NETWORK" },
    );
  } finally {
    clearTimeout(timer);
  }
}

async function request(
  path,
  options = {},
  { timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const token = getToken();
  if (token && !isSessionExpired()) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetchWithTimeout(
    `${API_URL}${path}`,
    { ...options, headers },
    timeoutMs,
  );

  if (response.status === 401) {
    clearSession();
    if (!path.includes("/auth/login")) {
      window.location.href = "/login";
    }
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(data.message || "Request failed", {
        status: response.status,
        code: "HTTP",
      });
    }
    return data;
  }

  // Non-JSON error (e.g. HTML 502/504 from a proxy) must not look like success
  if (!response.ok) {
    throw new ApiError(`Server error (${response.status}). Please try again.`, {
      status: response.status,
      code: "HTTP",
    });
  }

  return response; // blobs/downloads
}

function isRetryable(err) {
  return (
    err.code === "TIMEOUT" ||
    err.code === "NETWORK" ||
    [502, 503, 504].includes(err.status)
  );
}

async function requestWithRetry(
  path,
  options = {},
  { attempts = 3, delayMs = 1500, timeoutMs } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await request(path, options, { timeoutMs });
    } catch (err) {
      lastError = err;
      if (attempt === attempts || !isRetryable(err)) throw err;
      await delay(delayMs * attempt); // 1.5s, 3s, ...
    }
  }
  throw lastError;
}

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

const productionApi = {
  login: (username, password) =>
    requestWithRetry(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      },
      { attempts: 3, delayMs: 1500, timeoutMs: 15000 },
    ),
  register: (name, username, email, password, phoneNumber) =>
    request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, username, email, password, phoneNumber }),
    }),
  me: () => request("/auth/me"),
  getProfile: () => request("/users/me"),
  updateProfile: (body) =>
    request("/users/me", { method: "PUT", body: JSON.stringify(body) }),
  getUsers: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/users${qs ? `?${qs}` : ""}`);
  },
  getUser: (adminId) => request(`/users/${adminId}`),
  updateUser: (adminId, body) =>
    request(`/users/${adminId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteUser: (adminId) =>
    request(`/users/${adminId}`, { method: "DELETE" }),
  archiveUser: (adminId) =>
    request(`/users/${adminId}/archive`, { method: "PATCH" }),
  createUser: (body) =>
    request("/users", { method: "POST", body: JSON.stringify(body) }),
  getMetrics: () => request("/dashboard/metrics"),
  getProducts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/products${qs ? `?${qs}` : ""}`);
  },
  createProduct: (body) =>
    request("/products", { method: "POST", body: JSON.stringify(body) }),
  archiveProduct: (productId) =>
    request(`/products/${productId}/archive`, { method: "PATCH" }),
  updateProduct: (productId, body) =>
    request(`/products/${productId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteProduct: (productId) =>
    request(`/products/${productId}`, { method: "DELETE" }),
  getWeeklySummary: () => request("/products/summary/weekly"),
  getBrandOverview: () => request("/products/summary/brands"),
  getSalesReport: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/dashboard/sales-report${qs ? `?${qs}` : ""}`);
  },
  getDailyMetrics: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/dashboard/daily-metrics${qs ? `?${qs}` : ""}`);
  },
  getCustomers: (search = "") =>
    request(`/customers?search=${encodeURIComponent(search)}`),
  getSales: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/sales?${qs}`);
  },
  createSale: (body) =>
    request("/sales", { method: "POST", body: JSON.stringify(body) }),
  updateSale: (saleId, body) =>
    request(`/sales/${saleId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSale: (saleId) => request(`/sales/${saleId}`, { method: "DELETE" }),
  getCredits: () => request("/credits"),
  getCreditSummary: (saleId) => request(`/credits/${saleId}/summary`),
  getCreditHistory: (saleId) => request(`/credits/${saleId}/history`),
  createCreditPayment: (saleId, amount) =>
    request(`/credits/${saleId}/payments`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),
  updateCreditPayment: (creditId, amount) =>
    request(`/credits/${creditId}`, {
      method: "PUT",
      body: JSON.stringify({ amount }),
    }),
  deleteCreditPayment: (creditId) =>
    request(`/credits/${creditId}`, { method: "DELETE" }),
  getExpenses: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/expenses${qs ? `?${qs}` : ""}`);
  },
  getExpenseCategories: () => request("/expenses/categories"),
  createExpense: (body) =>
    request("/expenses", { method: "POST", body: JSON.stringify(body) }),
  updateExpense: (expensesId, body) =>
    request(`/expenses/${expensesId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteExpense: (expensesId) =>
    request(`/expenses/${expensesId}`, { method: "DELETE" }),
  getBrands: () => request("/brands"),
  createBrand: (name) =>
    request("/brands", { method: "POST", body: JSON.stringify({ name }) }),
  exportReport: async (params) => {
    const qs = new URLSearchParams(params).toString();
    const response = await request(`/dashboard/export?${qs}`);
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="(.+)"/);
    const filename =
      match?.[1] || `RCLPG_Report.${params.format === "pdf" ? "pdf" : "xlsx"}`;
    return { blob, filename };
  },
  downloadSalesReport: async (params) => {
    const qs = new URLSearchParams(params).toString();
    const response = await request(`/dashboard/download-sales-report?${qs}`);
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="(.+)"/);
    const filename = match?.[1] || `RCLPG_Sales_Report_${Date.now()}.pdf`;
    return { blob, filename };
  },
  downloadSalesLog: async (params) => {
    const qs = new URLSearchParams(params).toString();
    const response = await request(`/dashboard/download-sales-log?${qs}`);
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="(.+)"/);
    const filename = match?.[1] || `RCLPG_Sales_Log_${Date.now()}.pdf`;
    return { blob, filename };
  },
  downloadCreditLog: async (params) => {
    const qs = new URLSearchParams(params).toString();
    const response = await request(`/dashboard/download-credit-log?${qs}`);
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="(.+)"/);
    const filename = match?.[1] || `RCLPG_Credit_Log_${Date.now()}.pdf`;
    return { blob, filename };
  },
  downloadExpenseLog: async (params) => {
    const qs = new URLSearchParams(params).toString();
    const response = await request(`/dashboard/download-expense-log?${qs}`);
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="(.+)"/);
    const filename = match?.[1] || `RCLPG_Expense_Log_${Date.now()}.pdf`;
    return { blob, filename };
  },
};

export const api = USE_MOCK ? mockApi.api : productionApi;

export function saveSession({ token, expiresAt, admin }) {
  localStorage.setItem("rclpg_token", token);
  localStorage.setItem("rclpg_expires_at", expiresAt);
  localStorage.setItem("rclpg_admin", JSON.stringify(admin));
}

export function getStoredAdmin() {
  const raw = localStorage.getItem("rclpg_admin");
  if (!raw || raw === "undefined") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0,
  );