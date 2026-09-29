// Lightweight mock dataset for demo mode. Data persists to localStorage.
// v2: rich sales sample rows (entry_type/payment_option/denormalized fields)
// so existing v1 caches in localStorage can't shadow the fixed sample shape.
const STORAGE_KEY = "rclpg_mock_data_v2";

const sample = {
  admins: [
    { admin_id: 1, name: "Demo Admin", username: "demo", email: "demo@example.com", role: "Admin" },
  ],
  brands: [
    { id: 1, name: "Regasco" },
    { id: 2, name: "PetroMax" },
    { id: 3, name: "GasPro" },
  ],
  products: [
    {
      product_id: "000001",
      brand: "Regasco",
      weight_class: 11,
      status: "Filled Tank",
      stock_quantity: 12,
      health_indicator: "Good Stock",
      regular_retail: 850,
      wholesale_price: 800,
      initial_price: 0,
      is_archived: false,
      created_at: new Date().toISOString(),
    },
    {
      product_id: "000002",
      brand: "Regasco",
      weight_class: 11,
      status: "Empty Cylinder",
      stock_quantity: 5,
      health_indicator: "Low Stock",
      regular_retail: 0,
      wholesale_price: 0,
      initial_price: 0,
      is_archived: false,
      created_at: new Date().toISOString(),
    },
    {
      product_id: "000003",
      brand: "PetroMax",
      weight_class: 14,
      status: "Filled Tank",
      stock_quantity: 2,
      health_indicator: "Low Stock",
      regular_retail: 1100,
      wholesale_price: 1050,
      initial_price: 0,
      is_archived: false,
      created_at: new Date().toISOString(),
    },
  ],
  customers: [
    { customer_id: 1, name: "A. Santos", location: "Makati", phone_number: "09171234567" },
    { customer_id: 2, name: "B. Reyes", location: "Quezon City", phone_number: "09179876543" },
  ],
  sales: [
    // Fully paid sale
    {
      sale_id: 1,
      product_id: "000001",
      customer_id: 1,
      customer_name: "A. Santos",
      brand: "Regasco",
      weight_class: 11,
      product_status: "Filled Tank",
      entry_type: "sale",
      payment_option: "Fully Paid",
      price_type: "Regular Retail",
      sale_quantity: 1,
      unit_price: 850,
      total_amount: 850,
      balance_paid: 850,
      remaining_balance: 0,
      lpg_tank_variant: "Regasco",
      log_date: new Date().toISOString(),
      date_created: new Date().toISOString(),
      date_paid: new Date().toISOString(),
    },
    // Credit sale (no payments yet)
    {
      sale_id: 2,
      product_id: "000001",
      customer_id: 2,
      customer_name: "B. Reyes",
      brand: "Regasco",
      weight_class: 11,
      product_status: "Filled Tank",
      entry_type: "sale",
      payment_option: "Credit",
      price_type: "Regular Retail",
      sale_quantity: 2,
      unit_price: 850,
      total_amount: 1700,
      balance_paid: 0,
      remaining_balance: 1700,
      lpg_tank_variant: "Regasco",
      log_date: new Date().toISOString(),
      date_created: new Date().toISOString(),
    },
    // Credit payment entry
    {
      sale_id: 3,
      product_id: "000001",
      customer_id: 2,
      customer_name: "B. Reyes",
      brand: "Regasco",
      weight_class: 11,
      product_status: "Filled Tank",
      entry_type: "payment",
      payment_option: "Credit",
      price_type: "Regular Retail",
      credit_id: 3,
      credit_sale_id: 2,
      sale_quantity: 0,
      unit_price: 0,
      total_amount: 1700,
      balance_paid: 500,
      remaining_balance: 1200,
      lpg_tank_variant: "Regasco",
      log_date: new Date().toISOString(),
      date_paid: new Date().toISOString(),
    },
  ],
  credits: [],
  expenses: [
    // Use both backend/backward-compatible keys: `expenses_id` and `expense_id`.
    {
      expenses_id: 1,
      expense_id: 1,
      expenses: "Transport",
      category: "Transport",
      amount: 250,
      note: "Fuel",
      date: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
  ],
};

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(sample));
    return JSON.parse(raw);
  } catch (err) {
    return JSON.parse(JSON.stringify(sample));
  }
}

function write(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export { read, write };
