import { read, write } from "./data";

function randDelay() {
  return 200 + Math.floor(Math.random() * 300);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextId(items, key = "id") {
  const max = items.reduce((m, it) => Math.max(m, Number(it[key] || 0)), 0);
  return max + 1;
}

const api = {
  async login(username) {
    await sleep(randDelay());
    const store = read();
    const admin = store.admins[0];
    return { data: { token: "demo-token", expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), admin } };
  },
  async register() {
    await sleep(randDelay());
    return { message: "registered" };
  },
  async me() {
    await sleep(randDelay());
    const store = read();
    return { data: { admin: store.admins[0] } };
  },
  async getProfile() {
    await sleep(randDelay());
    const store = read();
    return { data: store.admins[0] };
  },
  async updateProfile(body) {
    await sleep(randDelay());
    const store = read();
    const admin = { ...store.admins[0], ...body };
    store.admins[0] = admin;
    write(store);
    return admin;
  },
  async getUsers() {
    await sleep(randDelay());
    const store = read();
    return { data: store.admins };
  },
  async getUser(adminId) {
    await sleep(randDelay());
    const store = read();
    return { data: store.admins.find((a) => String(a.admin_id) === String(adminId)) };
  },
  async updateUser(adminId, body) {
    await sleep(randDelay());
    const store = read();
    const i = store.admins.findIndex((a) => String(a.admin_id) === String(adminId));
    if (i === -1) throw new Error("not found");
    store.admins[i] = { ...store.admins[i], ...body };
    write(store);
    return store.admins[i];
  },
  async deleteUser(adminId) {
    await sleep(randDelay());
    const store = read();
    store.admins = store.admins.filter((a) => String(a.admin_id) !== String(adminId));
    write(store);
    return { success: true };
  },
  async archiveUser(adminId) {
    await sleep(randDelay());
    return { success: true };
  },
  async createUser(body) {
    await sleep(randDelay());
    const store = read();
    const id = nextId(store.admins, "admin_id");
    const user = { admin_id: id, ...body };
    store.admins.push(user);
    write(store);
    return user;
  },
  async getMetrics() {
    await sleep(randDelay());
    const store = read();
    const payload = { total_products: store.products.length, total_sales: store.sales.length, lowStockProducts: [], totalItemsSold: store.sales.length, totalFilledStock: store.products.filter(p=>p.status==='Filled Tank').reduce((s,p)=>s+Number(p.stock_quantity||0),0), totalEmptyStock: store.products.filter(p=>p.status==='Empty Cylinder').reduce((s,p)=>s+Number(p.stock_quantity||0),0) };
    return { data: payload };
  },
  async getProducts({} = {}) {
    await sleep(randDelay());
    const store = read();
    return { data: store.products };
  },
  async createProduct(body) {
    await sleep(randDelay());
    const store = read();
    const next = String((Number(store.products[store.products.length - 1]?.product_id || 0) + 1)).padStart(6, "0");
    const product = { product_id: next, created_at: new Date().toISOString(), ...body };
    store.products.push(product);
    write(store);
    return product;
  },
  async archiveProduct(productId) {
    await sleep(randDelay());
    const store = read();
    const p = store.products.find((x) => x.product_id === productId);
    if (p) p.is_archived = true;
    write(store);
    return p;
  },
  async updateProduct(productId, body) {
    await sleep(randDelay());
    const store = read();
    const i = store.products.findIndex((x) => x.product_id === productId);
    if (i === -1) throw new Error("not found");
    store.products[i] = { ...store.products[i], ...body };
    write(store);
    return store.products[i];
  },
  async deleteProduct(productId) {
    await sleep(randDelay());
    const store = read();
    store.products = store.products.filter((x) => x.product_id !== productId);
    write(store);
    return { success: true };
  },
  async getWeeklySummary() {
    await sleep(randDelay());
    const store = read();
    // Simplified grouping
    const byWeight = {};
    store.products.forEach((p) => {
      const k = String(p.weight_class);
      byWeight[k] = byWeight[k] || { weight_class: p.weight_class, filled_stock: 0, empty_stock: 0 };
      if (p.status === "Filled Tank") byWeight[k].filled_stock += Number(p.stock_quantity || 0);
      if (p.status === "Empty Cylinder") byWeight[k].empty_stock += Number(p.stock_quantity || 0);
    });
    return { data: Object.values(byWeight) };
  },
  async getBrandOverview() {
    await sleep(randDelay());
    const store = read();
    const byBrand = {};
    store.products.forEach((p) => {
      const b = p.brand || "(unknown)";
      byBrand[b] = byBrand[b] || { brand: b, total_filled: 0, total_empty: 0 };
      if (p.status === "Filled Tank") byBrand[b].total_filled += Number(p.stock_quantity || 0);
      if (p.status === "Empty Cylinder") byBrand[b].total_empty += Number(p.stock_quantity || 0);
    });
    return { data: Object.values(byBrand) };
  },
  async getSalesReport() {
    await sleep(randDelay());
    const store = read();
    return { data: store.sales };
  },
  async getDailyMetrics() {
    await sleep(randDelay());
    return { daily: [] };
  },
  async getCustomers(search = "") {
    await sleep(randDelay());
    const store = read();
    const results = !search ? store.customers : store.customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
    return { data: results };
  },
  async getSales(params = {}) {
    await sleep(randDelay());
    const store = read();
    // Simple pagination support
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || store.sales.length;
    const start = (page - 1) * limit;
    const items = store.sales.slice(start, start + limit);
    const total = store.sales.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { data: items, pagination: { page, totalPages, total } };
  },
  async createSale(body) {
    await sleep(randDelay());
    const store = read();
    const id = nextId(store.sales, "sale_id");
    const sale = { sale_id: id, created_at: new Date().toISOString(), ...body };
    store.sales.push(sale);
    write(store);
    return { data: sale };
  },
  async updateSale(saleId, body) {
    await sleep(randDelay());
    const store = read();
    const i = store.sales.findIndex((s) => String(s.sale_id) === String(saleId));
    if (i === -1) throw new Error("not found");
    store.sales[i] = { ...store.sales[i], ...body };
    write(store);
    return store.sales[i];
  },
  async deleteSale(saleId) {
    await sleep(randDelay());
    const store = read();
    store.sales = store.sales.filter((s) => String(s.sale_id) !== String(saleId));
    write(store);
    return { success: true };
  },
  async getCredits() {
    await sleep(randDelay());
    const store = read();
    return { data: store.credits };
  },
  async getCreditSummary() {
    await sleep(randDelay());
    return {};
  },
  async getCreditHistory() {
    await sleep(randDelay());
    return [];
  },
  async createCreditPayment() {
    await sleep(randDelay());
    return { success: true };
  },
  async updateCreditPayment() {
    await sleep(randDelay());
    return { success: true };
  },
  async deleteCreditPayment() {
    await sleep(randDelay());
    return { success: true };
  },
  async getExpenses() {
    await sleep(randDelay());
    const store = read();
    return { data: store.expenses };
  },
  async getExpenseCategories() {
    await sleep(randDelay());
    return ["Transport", "Supplies", "Maintenance"];
  },
  async createExpense(body) {
    await sleep(randDelay());
    const store = read();
    const id = nextId(store.expenses, "expense_id");
    const item = { expense_id: id, created_at: new Date().toISOString(), ...body };
    store.expenses.push(item);
    write(store);
    return { data: item };
  },
  async updateExpense(expenseId, body) {
    await sleep(randDelay());
    const store = read();
    const i = store.expenses.findIndex((e) => String(e.expense_id) === String(expenseId));
    if (i === -1) throw new Error("not found");
    store.expenses[i] = { ...store.expenses[i], ...body };
    write(store);
    return store.expenses[i];
  },
  async deleteExpense(expenseId) {
    await sleep(randDelay());
    const store = read();
    store.expenses = store.expenses.filter((e) => String(e.expense_id) !== String(expenseId));
    write(store);
    return { success: true };
  },
  async getBrands() {
    await sleep(randDelay());
    const store = read();
    return { data: store.brands };
  },
  async createBrand(name) {
    await sleep(randDelay());
    const store = read();
    const id = nextId(store.brands);
    const b = { id, name };
    store.brands.push(b);
    write(store);
    return { data: b };
  },
  async exportReport() {
    await sleep(randDelay());
    const blob = new Blob(["Demo report"], { type: "application/pdf" });
    return { blob, filename: "RCLPG_Report_demo.pdf" };
  },
  async downloadSalesReport() {
    await sleep(randDelay());
    const blob = new Blob(["Demo sales report"], { type: "application/pdf" });
    return { blob, filename: "RCLPG_Sales_Report_demo.pdf" };
  },
  async downloadSalesLog() {
    await sleep(randDelay());
    const blob = new Blob(["Demo sales log"], { type: "application/pdf" });
    return { blob, filename: "RCLPG_Sales_Log_demo.pdf" };
  },
  async downloadCreditLog() {
    await sleep(randDelay());
    const blob = new Blob(["Demo credit log"], { type: "application/pdf" });
    return { blob, filename: "RCLPG_Credit_Log_demo.pdf" };
  },
  async downloadExpenseLog() {
    await sleep(randDelay());
    const blob = new Blob(["Demo expense log"], { type: "application/pdf" });
    return { blob, filename: "RCLPG_Expense_Log_demo.pdf" };
  },
};

export default { api };
