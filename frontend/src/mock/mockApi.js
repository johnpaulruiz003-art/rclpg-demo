import { read, write } from "./data";
import { buildPdf, formatPdfMoney } from "./pdf";

function randDelay() {
  return 200 + Math.floor(Math.random() * 300);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextId(items, key = "id") {
  const max = items.reduce((m, it) => Math.max(m, Number((it && it[key]) || 0)), 0);
  return max + 1;
}

// ---------------------------------------------------------------------------
// Shared helpers that mirror the backend sales/credit/report services so the
// demo UI gets the exact payload shapes the real API provides.
// ---------------------------------------------------------------------------
function round2(value) {
  return Number(Number(value || 0).toFixed(2));
}

function productFor(store, productId) {
  return (store.products || []).find(
    (p) => String(p.product_id) === String(productId),
  );
}

function findCustomer(store, sale) {
  return (
    (store.customers || []).find(
      (c) => String(c.customer_id) === String(sale.customer_id),
    ) || {}
  );
}

// Payment entries linked to a credit sale (explicit credit_sale_id, with a
// legacy fallback matching customer + invoice total for older rows).
function linkedPayments(store, sale) {
  return (store.sales || []).filter(
    (p) =>
      p.entry_type === "payment" &&
      (String(p.credit_sale_id) === String(sale.sale_id) ||
        (p.credit_sale_id == null &&
          String(p.customer_id) === String(sale.customer_id) &&
          Number(p.total_amount || 0) === Number(sale.total_amount || 0))),
  );
}

function creditTotals(store, sale) {
  const initial = Number(sale.balance_paid || 0);
  const installments = linkedPayments(store, sale).reduce(
    (sum, p) => sum + Number(p.balance_paid || 0),
    0,
  );
  const totalPaid = round2(initial + installments);
  const remaining = Math.max(
    round2(Number(sale.total_amount || 0) - totalPaid),
    0,
  );
  return { totalPaid, remaining };
}

function productDetails(sale) {
  return `${sale.brand ?? ""} - ${sale.weight_class ?? ""}kg - ${
    sale.product_status ?? ""
  }`;
}

function cogsOfSale(store, sale) {
  const product = productFor(store, sale.product_id);
  return round2(
    Number(product?.initial_price || 0) * Number(sale.sale_quantity || 0),
  );
}

// Credit register derived from sales rows — mirrors backend
// getCreditRegister() (one row per credit sale, payments rolled up).
function buildCreditRegisterRows(store) {
  return (store.sales || [])
    .filter((s) => s.entry_type !== "payment" && s.payment_option === "Credit")
    .map((sale) => {
      const customer = findCustomer(store, sale);
      const { totalPaid, remaining } = creditTotals(store, sale);
      return {
        sale_id: sale.sale_id,
        total_amount: Number(sale.total_amount || 0),
        sale_quantity: Number(sale.sale_quantity || 0),
        price_type: sale.price_type || "Regular Retail",
        date_created: sale.date_created || sale.log_date || sale.date_paid || "",
        customer_id: sale.customer_id,
        customer_name: sale.customer_name || customer.name || "",
        phone_number: customer.phone_number || "",
        brand: sale.brand || "",
        weight_class: sale.weight_class,
        product_status: sale.product_status || "",
        total_paid: totalPaid,
        remaining_credit: remaining,
        credit_status: remaining <= 0 ? "Paid" : "Not Paid",
        product_details: productDetails(sale),
      };
    });
}

// Unpaid first, newest first (mirrors backend sortCreditRegisterRows).
function sortCreditRegisterRows(rows) {
  return [...rows].sort((a, b) => {
    const aPaid = a.credit_status === "Paid";
    const bPaid = b.credit_status === "Paid";
    if (aPaid !== bPaid) return aPaid ? 1 : -1;
    return Date.parse(b.date_created || 0) - Date.parse(a.date_created || 0);
  });
}

function buildCreditHistory(store, sale) {
  const history = [];
  if (Number(sale.balance_paid || 0) > 0) {
    history.push({
      credit_id: sale.sale_id,
      sales_id: sale.sale_id,
      payment_option: "Credit",
      balance_paid: Number(sale.balance_paid),
      date_paid: sale.date_created || sale.log_date || new Date().toISOString(),
    });
  }
  linkedPayments(store, sale).forEach((p) => {
    history.push({
      credit_id: p.credit_id ?? p.sale_id,
      sales_id: sale.sale_id,
      payment_option: "Credit",
      balance_paid: Number(p.balance_paid || 0),
      date_paid: p.date_paid || p.log_date || p.date_created || new Date().toISOString(),
    });
  });
  history.sort((a, b) => Date.parse(a.date_paid || 0) - Date.parse(b.date_paid || 0));
  return history;
}

function dayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

// Period matcher for report queries (today/week/month/year/halves/custom),
// comparing local calendar-day keys so demo dates always line up.
function makePeriodMatcher({ quickFilter = "month", startDate, endDate } = {}) {
  return (value) => {
    const key = dayKey(value);
    if (!key) return false;
    const nowKey = dayKey(new Date());
    switch (quickFilter) {
      case "today":
      case "daily":
        return key === nowKey;
      case "week":
      case "weekly": {
        const diff = Date.parse(nowKey) - Date.parse(key);
        return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
      }
      case "month":
      case "monthly":
        return key.slice(0, 7) === nowKey.slice(0, 7);
      case "year":
      case "yearly":
        return key.slice(0, 4) === nowKey.slice(0, 4);
      case "first_half":
        return key.slice(0, 4) === nowKey.slice(0, 4) && Number(key.slice(5, 7)) <= 6;
      case "second_half":
        return key.slice(0, 4) === nowKey.slice(0, 4) && Number(key.slice(5, 7)) >= 7;
      case "single":
      case "custom": {
        if (!startDate && !endDate) return true;
        const startKey = startDate ? dayKey(startDate) : null;
        const endKey = endDate ? dayKey(endDate) : null;
        if (startKey && key < startKey) return false;
        if (endKey && key > endKey) return false;
        return true;
      }
      default:
        return true;
    }
  };
}

function formatCurrencyValue(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

// Mirrors backend computeHealthIndicator (backend/src/utils/constants.js).
function computeHealthIndicator(stockQuantity) {
  const stock = Number(stockQuantity || 0);
  if (stock <= 0) return "Out of Stock";
  if (stock < 5) return "Low Stock";
  return "Good Stock";
}

// Backend update uses COALESCE, so an omitted field keeps its stored value.
// Legacy mock rows may still hold camelCase keys, so fall back to those too.
function resolveProductField(payloadValue, storedValue, legacyValue) {
  if (payloadValue === undefined || payloadValue === null || payloadValue === "") {
    return storedValue ?? legacyValue;
  }
  if (typeof payloadValue === "number" && Number.isNaN(payloadValue)) {
    return storedValue ?? legacyValue;
  }
  return payloadValue;
}

function numericProductField(payloadValue, storedValue, legacyValue, fallback = 0) {
  const resolved = resolveProductField(payloadValue, storedValue, legacyValue);
  const num = Number(resolved);
  return Number.isNaN(num) ? fallback : num;
}

// Mirrors backend generateProductId(): max existing id + 1 (6-digit string).
function nextProductId(products) {
  const max = (products || []).reduce((highest, product) => {
    const parsed = parseInt(product?.product_id, 10);
    return Number.isNaN(parsed) ? highest : Math.max(highest, parsed);
  }, 0);
  return String(max + 1).padStart(6, "0");
}

const LEGACY_PRODUCT_KEYS = [
  "weightClass",
  "stockQuantity",
  "regularRetail",
  "wholesalePrice",
  "initialPrice",
];

// Older mock versions stored the raw camelCase API payload, so those rows have
// no weight/stock/health/price columns at all. This rebuilds them in place.
function productNeedsRepair(product) {
  return (
    !product ||
    LEGACY_PRODUCT_KEYS.some((key) => product[key] !== undefined) ||
    product.health_indicator == null ||
    product.weight_class == null ||
    product.stock_quantity == null
  );
}

function repairProduct(product) {
  const stock = product.stock_quantity ?? product.stockQuantity;
  const repaired = {
    ...product,
    weight_class: numericProductField(product.weight_class ?? product.weightClass, undefined, undefined, 0),
    status: product.status,
    stock_quantity: numericProductField(stock, undefined, undefined, 0),
    health_indicator: product.health_indicator || computeHealthIndicator(stock),
    regular_retail: numericProductField(product.regular_retail ?? product.regularRetail, undefined, undefined, 0),
    wholesale_price: numericProductField(product.wholesale_price ?? product.wholesalePrice, undefined, undefined, 0),
    initial_price: numericProductField(product.initial_price ?? product.initialPrice, undefined, undefined, 0),
    is_archived: Boolean(product.is_archived),
    archived_at: product.archived_at ?? null,
    created_at: product.created_at || new Date().toISOString(),
  };
  LEGACY_PRODUCT_KEYS.forEach((key) => delete repaired[key]);
  return repaired;
}

const api = {
  async login(username) {
    await sleep(randDelay());
    const store = read();
    const admin = store.admins[0];
    return { success: true, token: "demo-token", expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), admin };
  },
  async register() {
    await sleep(randDelay());
    return { message: "registered" };
  },
  async me() {
    await sleep(randDelay());
    const store = read();
    return { success: true, admin: store.admins[0], expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString() };
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
    return { data: admin };
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
    return { data: store.admins[i] };
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
    return { data: user };
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
    // Self-heal rows saved by older mock versions that stored the camelCase
    // payload (no weight/stock/health/price columns), so previously broken
    // inventory records stop rendering as 0 / blank.
    if ((store.products || []).some(productNeedsRepair)) {
      store.products = (store.products || []).map(repairProduct);
      write(store);
    }
    return { data: store.products };
  },
  async createProduct(body) {
    await sleep(randDelay());
    const store = read();
    const stockQuantity = numericProductField(body.stockQuantity, undefined, undefined, 0);
    const now = new Date().toISOString();

    // Store the same snake_case row shape the backend returns. The API payload
    // is camelCase (weightClass/stockQuantity/regularRetail/...), so mapping it
    // explicitly is what keeps weight, stock, health and prices correct.
    const product = {
      product_id: nextProductId(store.products),
      brand: body.brand,
      weight_class: numericProductField(body.weightClass, undefined, undefined, 0),
      status: body.status,
      stock_quantity: stockQuantity,
      health_indicator: computeHealthIndicator(stockQuantity),
      regular_retail: numericProductField(body.regularRetail, undefined, undefined, 0),
      wholesale_price: numericProductField(body.wholesalePrice, undefined, undefined, 0),
      initial_price: numericProductField(body.initialPrice, undefined, undefined, 0),
      is_archived: false,
      archived_at: null,
      created_at: now,
      updated_at: now,
    };
    store.products.push(product);
    write(store);
    return { data: product };
  },
  async archiveProduct(productId) {
    await sleep(randDelay());
    const store = read();
    const p = (store.products || []).find(
      (x) => String(x.product_id) === String(productId),
    );
    if (p) {
      p.is_archived = true;
      p.archived_at = new Date().toISOString();
      p.updated_at = p.archived_at;
    }
    write(store);
    return { data: p };
  },
  async updateProduct(productId, body) {
    await sleep(randDelay());
    const store = read();
    const i = (store.products || []).findIndex(
      (x) => String(x.product_id) === String(productId),
    );
    if (i === -1) throw new Error("not found");
    const existing = store.products[i];
    const stockQuantity = numericProductField(
      body.stockQuantity,
      existing.stock_quantity,
      existing.stockQuantity,
      0,
    );

    // Mirrors the backend UPDATE: COALESCE per field, stock always applied and
    // health recomputed from it.
    const updated = {
      ...existing,
      brand: resolveProductField(body.brand, existing.brand),
      weight_class: numericProductField(body.weightClass, existing.weight_class, existing.weightClass, 0),
      status: resolveProductField(body.status, existing.status),
      stock_quantity: stockQuantity,
      health_indicator: computeHealthIndicator(stockQuantity),
      regular_retail: numericProductField(body.regularRetail, existing.regular_retail, existing.regularRetail, 0),
      wholesale_price: numericProductField(body.wholesalePrice, existing.wholesale_price, existing.wholesalePrice, 0),
      initial_price: numericProductField(body.initialPrice, existing.initial_price, existing.initialPrice, 0),
      updated_at: new Date().toISOString(),
    };

    // Drop the legacy camelCase keys written by older mock rows so they can't
    // shadow the normalized values later.
    LEGACY_PRODUCT_KEYS.forEach((key) => delete updated[key]);

    store.products[i] = updated;
    write(store);
    return { data: updated };
  },
  async deleteProduct(productId) {
    await sleep(randDelay());
    const store = read();
    store.products = store.products.filter(
      (x) => String(x.product_id) !== String(productId),
    );
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
  async getSalesReport(params = {}) {
    await sleep(randDelay());
    return { data: buildSalesReportPayload(params) };
  },
  async getDailyMetrics(params = {}) {
    await sleep(randDelay());
    const store = read();
    const matches = makePeriodMatcher(params);
    const days = new Map();

    // Bucket everything by local calendar day; returns null when the date is
    // outside the requested period (mirrors backend date-grouped metrics).
    const dayFor = (value) => {
      const key = dayKey(value);
      if (!key || !matches(value)) return null;
      if (!days.has(key)) {
        days.set(key, {
          date: key,
          orders: 0,
          grossIncome: 0,
          costOfGoodsSold: 0,
          volumeKg: 0,
          totalExpenses: 0,
          fullyPaidRevenue: 0,
          fullyPaidCogs: 0,
          creditRevenue: 0,
          creditCogs: 0,
        });
      }
      return days.get(key);
    };

    (store.sales || [])
      .filter((s) => s.entry_type !== "payment")
      .forEach((s) => {
        const entry = dayFor(s.date_created || s.log_date);
        if (!entry) return;
        const total = Number(s.total_amount || 0);
        const cogs = cogsOfSale(store, s);
        entry.orders += 1;
        entry.grossIncome += total;
        entry.costOfGoodsSold += cogs;
        entry.volumeKg += Number(s.weight_class || 0) * Number(s.sale_quantity || 0);
        if (s.payment_option === "Credit") {
          entry.creditRevenue += total;
          entry.creditCogs += cogs;
        } else {
          entry.fullyPaidRevenue += total;
          entry.fullyPaidCogs += cogs;
        }
      });

    (store.expenses || []).forEach((e) => {
      const entry = dayFor(e.date || e.created_at);
      if (entry) entry.totalExpenses += Number(e.amount || 0);
    });

    const rows = [...days.values()]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((entry) => {
        const netIncomeFullyPaid = round2(entry.fullyPaidRevenue - entry.fullyPaidCogs);
        const expectedNetIncome = round2(entry.creditRevenue - entry.creditCogs);
        return {
          date: entry.date,
          orders: entry.orders,
          grossIncome: round2(entry.grossIncome),
          costOfGoodsSold: round2(entry.costOfGoodsSold),
          volumeKg: round2(entry.volumeKg),
          totalExpenses: round2(entry.totalExpenses),
          netIncome: round2(netIncomeFullyPaid + expectedNetIncome - entry.totalExpenses),
          expectedCreditIncome: expectedNetIncome,
          creditSales: round2(entry.creditRevenue),
          netIncomeFullyPaid,
        };
      });

    return { data: rows };
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

    // Ensure the customer exists (Record Sale allows brand-new customers).
    let customer = body.customerId
      ? (store.customers || []).find(
          (c) => String(c.customer_id) === String(body.customerId),
        )
      : (store.customers || []).find(
          (c) =>
            c.name?.trim().toLowerCase() ===
            String(body.customerName || "").trim().toLowerCase(),
        );
    if (!customer) {
      customer = {
        customer_id: nextId(store.customers, "customer_id"),
        name: body.customerName || "Unknown Customer",
        location: body.location || "",
        phone_number: body.phoneNumber || "",
      };
      store.customers.push(customer);
    }

    const product = productFor(store, body.productId);
    const quantity = Number(body.quantity) || 1;
    const unitPrice = Number(body.unitPrice) || 0;
    const totalAmount = round2(quantity * unitPrice);
    const paymentOption = body.paymentMethod === "Credit" ? "Credit" : "Fully Paid";
    const balancePaid =
      paymentOption === "Credit" ? round2(body.initialPayment || 0) : totalAmount;
    const now = new Date().toISOString();

    // Store the same snake_case/denormalized row shape the backend returns so
    // every table (Sales Log, Dashboard, Credit Logs, Traded column) renders.
    const sale = {
      sale_id: id,
      entry_type: "sale",
      product_id: body.productId,
      customer_id: customer.customer_id,
      customer_name: customer.name,
      brand: body.brand || product?.brand || "",
      weight_class: product?.weight_class ?? "",
      product_status:
        product?.status || (body.isFilled ? "Filled Tank" : "Empty Cylinder"),
      price_type: body.priceType || "Regular Retail",
      payment_option: paymentOption,
      sale_quantity: quantity,
      unit_price: unitPrice,
      total_amount: totalAmount,
      balance_paid: balancePaid,
      remaining_balance:
        paymentOption === "Credit"
          ? Math.max(round2(totalAmount - balancePaid), 0)
          : 0,
      lpg_tank_variant: body.lpgTankVariant || null,
      is_purchased_tank: Boolean(body.is_purchased_tank ?? body.purchaseTank),
      log_date: now,
      date_created: now,
    };
    store.sales.push(sale);
    write(store);
    return { data: sale };
  },
  async updateSale(saleId, body) {
    await sleep(randDelay());
    const store = read();
    const i = store.sales.findIndex((s) => String(s.sale_id) === String(saleId));
    if (i === -1) throw new Error("not found");
    const existing = store.sales[i];

    // Mirror the backend override: only the sale row is rewritten — credit
    // history (payment entries / payment_option) is intentionally untouched.
    const quantity = Number(body.quantity ?? existing.sale_quantity) || 1;
    const unitPrice = Number(body.unitPrice ?? existing.unit_price) || 0;
    const totalAmount = round2(quantity * unitPrice);
    const customer = body.customerId
      ? (store.customers || []).find(
          (c) => String(c.customer_id) === String(body.customerId),
        )
      : null;
    const product = productFor(store, body.productId ?? existing.product_id);

    const updated = {
      ...existing,
      product_id: body.productId ?? existing.product_id,
      customer_id: customer ? customer.customer_id : existing.customer_id,
      customer_name: customer ? customer.name : existing.customer_name,
      brand: body.brand ?? existing.brand,
      weight_class: product ? product.weight_class : existing.weight_class,
      product_status: product ? product.status : existing.product_status,
      price_type: body.priceType ?? existing.price_type,
      sale_quantity: quantity,
      unit_price: unitPrice,
      total_amount: totalAmount,
      lpg_tank_variant: body.lpgTankVariant || null,
      is_purchased_tank: Boolean(
        body.is_purchased_tank ?? body.purchaseTank ?? existing.is_purchased_tank,
      ),
    };

    if (updated.entry_type !== "payment") {
      if (updated.payment_option === "Credit") {
        const { totalPaid } = creditTotals(store, updated);
        updated.remaining_balance = Math.max(round2(totalAmount - totalPaid), 0);
      } else {
        updated.balance_paid = totalAmount;
        updated.remaining_balance = 0;
      }
    }

    store.sales[i] = updated;
    write(store);
    return { data: updated };
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
    return { data: sortCreditRegisterRows(buildCreditRegisterRows(store)) };
  },
  async getCreditSummary(saleId) {
    await sleep(randDelay());
    const store = read();
    const sale = (store.sales || []).find(
      (s) => String(s.sale_id) === String(saleId) && s.entry_type !== "payment",
    );
    if (!sale) throw new Error("Sale not found");
    const customer = findCustomer(store, sale);
    const { totalPaid, remaining } = creditTotals(store, sale);
    return {
      data: {
        sale_id: sale.sale_id,
        customer_name: sale.customer_name || customer.name || "",
        phone_number: customer.phone_number || "",
        product_details: productDetails(sale),
        total_cost: Number(sale.total_amount || 0),
        total_paid: totalPaid,
        remaining_credit: remaining,
        credit_status: remaining <= 0 ? "Paid" : "Not Paid",
        payment_history: buildCreditHistory(store, sale),
      },
    };
  },
  async getCreditHistory(saleId) {
    await sleep(randDelay());
    const store = read();
    const sale = (store.sales || []).find(
      (s) => String(s.sale_id) === String(saleId) && s.entry_type !== "payment",
    );
    if (!sale) throw new Error("Sale not found");
    const { totalPaid, remaining } = creditTotals(store, sale);
    return {
      data: {
        history: buildCreditHistory(store, sale),
        totalPaid,
        remainingCredit: remaining,
      },
    };
  },
  async createCreditPayment(saleId, amount) {
    await sleep(randDelay());
    const store = read();
    const sale = (store.sales || []).find(
      (s) => String(s.sale_id) === String(saleId) && s.entry_type !== "payment",
    );
    if (!sale) throw new Error("Sale not found");
    const paid = Number(amount);
    if (!paid || paid <= 0) throw new Error("Payment amount must be greater than zero");
    const { remaining } = creditTotals(store, sale);
    if (remaining <= 0) throw new Error("This sale is already fully paid");
    if (paid > remaining) {
      throw new Error(`Payment exceeds remaining balance of ${remaining.toFixed(2)}`);
    }

    const paymentId = nextId(store.sales, "sale_id");
    const now = new Date().toISOString();
    const payment = {
      sale_id: paymentId,
      credit_id: paymentId,
      credit_sale_id: sale.sale_id,
      entry_type: "payment",
      payment_option: "Credit",
      product_id: sale.product_id,
      customer_id: sale.customer_id,
      customer_name: sale.customer_name,
      brand: sale.brand,
      weight_class: sale.weight_class,
      product_status: sale.product_status,
      price_type: sale.price_type,
      sale_quantity: 0,
      unit_price: 0,
      total_amount: Number(sale.total_amount || 0),
      balance_paid: round2(paid),
      remaining_balance: round2(remaining - paid),
      lpg_tank_variant: sale.lpg_tank_variant || null,
      log_date: now,
      date_paid: now,
    };
    sale.remaining_balance = payment.remaining_balance;
    store.sales.push(payment);
    write(store);
    return { data: payment };
  },
  async updateCreditPayment(creditId, amount) {
    await sleep(randDelay());
    const store = read();
    const i = (store.sales || []).findIndex(
      (p) =>
        p.entry_type === "payment" &&
        String(p.credit_id ?? p.sale_id) === String(creditId),
    );
    if (i === -1) throw new Error("not found");
    const payment = store.sales[i];
    const next = round2(amount);
    const parent = (store.sales || []).find(
      (s) =>
        String(s.sale_id) === String(payment.credit_sale_id) &&
        s.entry_type !== "payment",
    );

    if (parent) {
      const others = linkedPayments(store, parent)
        .filter((p) => p !== payment)
        .reduce((sum, p) => sum + Number(p.balance_paid || 0), 0);
      const paidElsewhere = round2(Number(parent.balance_paid || 0) + others);
      const allowed = Math.max(
        round2(Number(parent.total_amount || 0) - paidElsewhere),
        0,
      );
      if (next > allowed) {
        throw new Error(`Payment exceeds remaining balance of ${allowed.toFixed(2)}`);
      }
      const remainingAfter = round2(allowed - next);
      payment.balance_paid = next;
      payment.remaining_balance = remainingAfter;
      parent.remaining_balance = remainingAfter;
    } else {
      payment.balance_paid = next;
    }

    write(store);
    return { data: payment };
  },
  async deleteCreditPayment(creditId) {
    await sleep(randDelay());
    const store = read();
    const payment = (store.sales || []).find(
      (p) =>
        p.entry_type === "payment" &&
        String(p.credit_id ?? p.sale_id) === String(creditId),
    );
    if (payment) {
      const parent = (store.sales || []).find(
        (s) =>
          String(s.sale_id) === String(payment.credit_sale_id) &&
          s.entry_type !== "payment",
      );
      if (parent) {
        const others = linkedPayments(store, parent)
          .filter((p) => p !== payment)
          .reduce((sum, p) => sum + Number(p.balance_paid || 0), 0);
        parent.remaining_balance = Math.max(
          round2(
            Number(parent.total_amount || 0) -
              Number(parent.balance_paid || 0) -
              others,
          ),
          0,
        );
      }
      store.sales = store.sales.filter((p) => p !== payment);
    }
    write(store);
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
    return { data: store.expenses[i] };
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
    // The real backend returns brand names as plain strings, but the mock
    // store keeps richer { id, name } records. Normalize to strings here so
    // every consumer (e.g. brand.slice(0, 2)) matches the API contract even
    // if older localStorage payloads contain objects.
    const names = (Array.isArray(store.brands) ? store.brands : [])
      .map((b) => (typeof b === "string" ? b : b && b.name))
      .filter((name) => typeof name === "string" && name.trim() !== "");
    return { data: names };
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
  async exportReport(params = {}) {
    await sleep(randDelay());
    return { blob: buildSalesReportPdf(params), filename: "RCLPG_Report_demo.pdf" };
  },
  async downloadSalesReport(params = {}) {
    await sleep(randDelay());
    return { blob: buildSalesReportPdf(params), filename: "RCLPG_Sales_Report_demo.pdf" };
  },
  async downloadSalesLog(params = {}) {
    await sleep(randDelay());
    const store = read();
    return { blob: buildSalesLogPdf(store, params), filename: "RCLPG_Sales_Log_demo.pdf" };
  },
  async downloadCreditLog(params = {}) {
    await sleep(randDelay());
    const store = read();
    return { blob: buildCreditLogPdf(store, params), filename: "RCLPG_Credit_Log_demo.pdf" };
  },
  async downloadExpenseLog(params = {}) {
    await sleep(randDelay());
    const store = read();
    return { blob: buildExpenseLogPdf(store, params), filename: "RCLPG_Expense_Log_demo.pdf" };
  },
};

// Shared sales-report payload (used by the dashboard section and the PDF export).
function buildSalesReportPayload(params) {
  const store = read();
  const matches = makePeriodMatcher(params);
  const allSales = (store.sales || []).filter((s) => s.entry_type !== "payment");
  const allPayments = (store.sales || []).filter((s) => s.entry_type === "payment");
  const scopedSales = allSales.filter((s) => matches(s.date_created || s.log_date));
  const scopedPayments = allPayments.filter((p) => matches(p.date_paid || p.log_date));
  const scopedExpenses = (store.expenses || []).filter((e) =>
    matches(e.date || e.created_at),
  );

  const isCreditSale = (s) => s.payment_option === "Credit";
  const sumOf = (rows, fn) => round2(rows.reduce((total, row) => total + fn(row), 0));

  const fullyPaidSales = scopedSales.filter((s) => !isCreditSale(s));
  const creditSales = scopedSales.filter(isCreditSale);
  const fullyPaidRevenue = sumOf(fullyPaidSales, (s) => Number(s.total_amount || 0));
  const fullyPaidCogs = sumOf(fullyPaidSales, (s) => cogsOfSale(store, s));
  const expectedCreditRevenue = sumOf(creditSales, (s) => Number(s.total_amount || 0));
  const expectedCreditCogs = sumOf(creditSales, (s) => cogsOfSale(store, s));
  const actualCreditRevenue = sumOf(
    scopedPayments.filter((p) => p.payment_option === "Credit"),
    (p) => Number(p.balance_paid || 0),
  );
  const totalExpenses = sumOf(scopedExpenses, (e) => Number(e.amount || 0));
  const totalOrders = scopedSales.length;
  const totalVolumeKg = round2(
    scopedSales.reduce(
      (total, s) => total + Number(s.weight_class || 0) * Number(s.sale_quantity || 0),
      0,
    ),
  );
  const totalCreditBalance = round2(
    creditSales.reduce((total, s) => total + creditTotals(store, s).remaining, 0),
  );
  const totalSalesRevenue = round2(fullyPaidRevenue + actualCreditRevenue);

  const netIncomeFullyPaid = round2(fullyPaidRevenue - fullyPaidCogs);
  const expectedNetIncome = round2(expectedCreditRevenue - expectedCreditCogs);
  const netIncomeQualified = round2(netIncomeFullyPaid + expectedNetIncome - totalExpenses);

  const summary = {
    totalSalesRevenue,
    netIncomeFullyPaid,
    netIncomeQualified,
    expectedNetIncome,
    totalVolumeKg,
    creditOnlySalesRevenue: expectedCreditRevenue,
    creditOnlyCostOfGoods: expectedCreditCogs,
    totalCreditBalance,
    totalExpenses,
    totalOrders,
    netIncomeQualifiedFormula: `(${formatCurrencyValue(netIncomeFullyPaid)} + ${formatCurrencyValue(expectedNetIncome)}) - ${formatCurrencyValue(totalExpenses)}`,
    netIncomeFullyPaidFormula: `${formatCurrencyValue(fullyPaidRevenue)} - ${formatCurrencyValue(fullyPaidCogs)}`,
    expectedNetIncomeFormula: `${formatCurrencyValue(expectedCreditRevenue)} - ${formatCurrencyValue(expectedCreditCogs)}`,
  };

  // Brand volume distribution (mirrors getBrandSalesMetrics).
  const brandTotals = new Map();
  scopedSales.forEach((s) => {
    const brand = s.brand || "Unknown";
    brandTotals.set(brand, (brandTotals.get(brand) || 0) + Number(s.sale_quantity || 0));
  });
  const brandGrandTotal = [...brandTotals.values()].reduce((sum, v) => sum + v, 0) || 1;
  const brandMetrics = [...brandTotals.entries()]
    .map(([brand, totalItemsSold]) => ({
      brand,
      total_items_sold: totalItemsSold,
      percentage: Number(((totalItemsSold / brandGrandTotal) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.total_items_sold - a.total_items_sold);

  // Product mix by brand + weight class.
  const mix = new Map();
  scopedSales.forEach((s) => {
    const key = `${s.brand || ""}|${s.weight_class ?? ""}`;
    const entry = mix.get(key) || {
      brand: s.brand || "",
      weightClass: Number(s.weight_class || 0),
      unitsSold: 0,
      revenue: 0,
    };
    entry.unitsSold += Number(s.sale_quantity || 0);
    entry.revenue += Number(s.total_amount || 0);
    mix.set(key, entry);
  });
  const mixTotalUnits = [...mix.values()].reduce((sum, m) => sum + m.unitsSold, 0) || 1;
  const productMix = [...mix.values()].map((m) => ({
    ...m,
    revenue: round2(m.revenue),
    percentage: Number(((m.unitsSold / mixTotalUnits) * 100).toFixed(1)),
  }));

  // Revenue breakdown by product status (filled = gas refill).
  const paidByStatus = (status) =>
    round2(
      fullyPaidSales
        .filter((s) => productFor(store, s.product_id)?.status === status)
        .reduce((total, s) => total + Number(s.total_amount || 0), 0) +
        scopedPayments
          .filter((p) => productFor(store, p.product_id)?.status === status)
          .reduce((total, p) => total + Number(p.balance_paid || 0), 0),
    );
  const gasRefill = paidByStatus("Filled Tank");
  const newCylinder = paidByStatus("Empty Cylinder");
  const revTotal = gasRefill + newCylinder || 1;

  // Customer type segments use recognized revenue (fully paid totals plus
  // recorded credit payments) so percentages stay consistent with the cards.
  const recognizedRevenueOf = (s) =>
    isCreditSale(s) ? creditTotals(store, s).totalPaid : Number(s.total_amount || 0);
  const customerMap = new Map();
  scopedSales.forEach((s) => {
    const raw = s.price_type || "Regular Retail";
    const label = raw === "Wholesale" ? "Retail Price" : "Consumer Price";
    const entry = customerMap.get(label) || { label, orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += recognizedRevenueOf(s);
    customerMap.set(label, entry);
  });
  const customerType = [...customerMap.values()].map((entry) => ({
    ...entry,
    revenue: round2(entry.revenue),
    percentage:
      totalSalesRevenue > 0
        ? Number(((entry.revenue / totalSalesRevenue) * 100).toFixed(1))
        : 0,
  }));

  const paymentMethod = [];
  if (fullyPaidSales.length > 0) {
    paymentMethod.push({
      label: "Cash",
      orders: fullyPaidSales.length,
      revenue: fullyPaidRevenue,
      percentage:
        totalSalesRevenue > 0
          ? Number(((fullyPaidRevenue / totalSalesRevenue) * 100).toFixed(1))
          : 0,
    });
  }
  if (scopedPayments.length > 0 || actualCreditRevenue > 0) {
    paymentMethod.push({
      label: "Invoice / Credit",
      orders: scopedPayments.length,
      revenue: actualCreditRevenue,
      percentage:
        totalSalesRevenue > 0
          ? Number(((actualCreditRevenue / totalSalesRevenue) * 100).toFixed(1))
          : 0,
    });
  }

  return {
    brandMetrics,
    summary,
    productMix,
    revenueBreakdown: {
      gasRefill: {
        revenue: gasRefill,
        percentage: Number(((gasRefill / revTotal) * 100).toFixed(1)),
      },
      newCylinder: {
        revenue: newCylinder,
        percentage: Number(((newCylinder / revTotal) * 100).toFixed(1)),
      },
    },
    customerType,
    fulfillmentMethod: [
      { label: "Walk-in Pickup", orders: totalOrders, revenue: totalSalesRevenue, percentage: 100 },
      { label: "Delivery", orders: 0, revenue: 0, percentage: 0 },
    ],
    paymentMethod,
  };
}

// ---------------------------------------------------------------------------
// Demo PDF exports. Each builder produces a real PDF via ./pdf.js and fills it
// with the current demo data, so downloads are readable instead of a text file
// with a .pdf extension.
// ---------------------------------------------------------------------------
const PERIOD_LABELS = {
  today: "Today",
  daily: "Today",
  week: "This Week",
  weekly: "This Week",
  month: "This Month",
  monthly: "This Month",
  year: "This Year",
  yearly: "This Year",
  first_half: "First Half",
  second_half: "Second Half",
  single: "Single Date",
  custom: "Custom Range",
};

function describePeriod(params = {}) {
  const label =
    PERIOD_LABELS[params.period] || PERIOD_LABELS[params.quickFilter] || "All Records";
  const range = [params.startDate, params.endDate].filter(Boolean).join(" to ");
  return range ? `${label} (${range})` : label;
}

function pdfMeta() {
  return [
    `Generated: ${new Date().toLocaleString("en-PH")}`,
    "RCLPG Portal - demo mode report generated in the browser",
  ];
}

function newestFirst(rows, keyIndex = 0) {
  return [...rows].sort((left, right) => {
    const a = String(left[keyIndex] || "");
    const b = String(right[keyIndex] || "");
    return a < b ? 1 : a > b ? -1 : 0;
  });
}

function buildSalesReportPdf(params) {
  const report = buildSalesReportPayload(params);
  const summary = report.summary || {};
  return buildPdf({
    title: "RCLPG Sales Report",
    subtitle: `Reporting period: ${describePeriod(params)}`,
    meta: pdfMeta(),
    sections: [
      {
        heading: "Summary",
        columns: [
          { label: "Metric", width: 2 },
          { label: "Value", align: "right" },
        ],
        rows: [
          ["Total Sales Revenue", formatPdfMoney(summary.totalSalesRevenue)],
          ["Total Net Income", formatPdfMoney(summary.netIncomeQualified)],
          ["Fully Paid Net Income", formatPdfMoney(summary.netIncomeFullyPaid)],
          ["Expected Credit Income", formatPdfMoney(summary.expectedNetIncome)],
          ["Remaining Credit Balance", formatPdfMoney(summary.totalCreditBalance)],
          ["Total Expenses", formatPdfMoney(summary.totalExpenses)],
          ["Total Volume", `${summary.totalVolumeKg ?? 0} kg`],
          ["Total Orders", String(summary.totalOrders ?? 0)],
        ],
      },
      {
        heading: "Brand Volume Distribution",
        columns: [
          { label: "Brand" },
          { label: "Items Sold", align: "right" },
          { label: "Share", align: "right" },
        ],
        rows: (report.brandMetrics || []).map((row) => [
          row.brand,
          String(row.total_items_sold),
          `${row.percentage}%`,
        ]),
      },
      {
        heading: "Product Mix",
        columns: [
          { label: "Product", width: 2 },
          { label: "Units", align: "right" },
          { label: "Revenue", align: "right" },
          { label: "Share", align: "right" },
        ],
        rows: (report.productMix || []).map((row) => [
          `${row.brand} - ${row.weightClass}kg`,
          String(row.unitsSold),
          formatPdfMoney(row.revenue),
          `${row.percentage}%`,
        ]),
      },
      {
        heading: "Payment Method",
        columns: [
          { label: "Method", width: 2 },
          { label: "Orders", align: "right" },
          { label: "Revenue", align: "right" },
          { label: "Share", align: "right" },
        ],
        rows: (report.paymentMethod || []).map((row) => [
          row.label,
          String(row.orders),
          formatPdfMoney(row.revenue),
          `${row.percentage}%`,
        ]),
      },
      {
        heading: "Customer Type",
        columns: [
          { label: "Segment", width: 2 },
          { label: "Orders", align: "right" },
          { label: "Revenue", align: "right" },
          { label: "Share", align: "right" },
        ],
        rows: (report.customerType || []).map((row) => [
          row.label,
          String(row.orders),
          formatPdfMoney(row.revenue),
          `${row.percentage}%`,
        ]),
      },
    ],
  });
}

function salesLogRows(store, params) {
  const matches = makePeriodMatcher(params);
  return newestFirst(
    (store.sales || [])
      .filter((sale) => matches(sale.log_date || sale.date_created || sale.date_paid))
      .map((sale) => {
        const isPayment = sale.entry_type === "payment";
        const isCredit = sale.payment_option === "Credit";
        return [
          dayKey(sale.log_date || sale.date_created || sale.date_paid) || "",
          `${sale.brand ?? ""} - ${sale.weight_class ?? ""}kg - ${sale.product_status ?? ""}`,
          sale.customer_name || "",
          isPayment ? "Credit Payment" : isCredit ? "Credit" : "Fully Paid",
          sale.lpg_tank_variant || "-",
          isPayment ? "-" : String(sale.sale_quantity ?? 0),
          isPayment ? "-" : formatPdfMoney(sale.unit_price),
          isPayment ? formatPdfMoney(sale.balance_paid) : formatPdfMoney(sale.total_amount),
          isPayment
            ? formatPdfMoney(sale.balance_paid)
            : isCredit
              ? "Credit"
              : formatPdfMoney(sale.total_amount),
        ];
      }),
  );
}

function buildSalesLogPdf(store, params) {
  return buildPdf({
    title: "RCLPG Sales Log",
    subtitle: `Reporting period: ${describePeriod(params)}`,
    meta: pdfMeta(),
    sections: [
      {
        heading: "Sales Entries",
        columns: [
          { label: "Date", width: 1.1 },
          { label: "Product", width: 2 },
          { label: "Customer", width: 1.2 },
          { label: "Type", width: 1 },
          { label: "Traded", width: 0.8 },
          { label: "Qty", width: 0.5, align: "right" },
          { label: "Unit Price", width: 1, align: "right" },
          { label: "Total", width: 1, align: "right" },
          { label: "Balance Paid", width: 1, align: "right" },
        ],
        rows: salesLogRows(store, params),
      },
    ],
  });
}

function buildCreditLogPdf(store, params) {
  const matches = makePeriodMatcher(params);
  const rows = buildCreditRegisterRows(store)
    .filter((row) => matches(row.date_created))
    .map((row) => [
      dayKey(row.date_created) || "",
      row.customer_name,
      row.product_details,
      formatPdfMoney(row.total_amount),
      formatPdfMoney(row.total_paid),
      formatPdfMoney(row.remaining_credit),
      row.credit_status,
    ]);

  return buildPdf({
    title: "RCLPG Credit Log",
    subtitle: `Reporting period: ${describePeriod(params)}`,
    meta: pdfMeta(),
    sections: [
      {
        heading: "Credit Register",
        columns: [
          { label: "Date", width: 1.1 },
          { label: "Customer", width: 1.3 },
          { label: "Product", width: 2 },
          { label: "Total", width: 1, align: "right" },
          { label: "Paid", width: 1, align: "right" },
          { label: "Remaining", width: 1, align: "right" },
          { label: "Status", width: 0.9 },
        ],
        rows,
      },
    ],
  });
}

function buildExpenseLogPdf(store, params) {
  const matches = makePeriodMatcher(params);
  const rows = newestFirst(
    (store.expenses || [])
      .filter((expense) => matches(expense.date || expense.created_at))
      .map((expense) => [
        dayKey(expense.date || expense.created_at) || "",
        expense.expenses || expense.category || "",
        formatPdfMoney(expense.amount),
      ]),
  );

  return buildPdf({
    title: "RCLPG Expense Log",
    subtitle: `Reporting period: ${describePeriod(params)}`,
    meta: pdfMeta(),
    sections: [
      {
        heading: "Expenses",
        columns: [
          { label: "Date", width: 1.2 },
          { label: "Expense", width: 3 },
          { label: "Amount", width: 1, align: "right" },
        ],
        rows,
      },
    ],
  });
}

export default { api };
