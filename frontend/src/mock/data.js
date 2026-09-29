// Lightweight mock dataset for demo mode. Data persists to localStorage under `rclpg_mock_data`.

const STORAGE_KEY = "rclpg_mock_data_v1";

const sample = {
  admins: [
    { admin_id: 1, name: "Demo Admin", username: "demo", email: "demo@example.com", role: "owner" },
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
    {
      sale_id: 1,
      product_id: "000001",
      customer_id: 1,
      amount: 850,
      created_at: new Date().toISOString(),
      payment_type: "cash",
    },
  ],
  credits: [],
  expenses: [
    { expense_id: 1, category: "Transport", amount: 250, note: "Fuel", created_at: new Date().toISOString() },
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
