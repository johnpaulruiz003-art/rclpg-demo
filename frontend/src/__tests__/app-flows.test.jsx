import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

beforeAll(() => {
  // jsdom lacks matchMedia/ResizeObserver which the app uses.
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; },
    });
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // Seed an active admin session so admin-only UI renders.
  localStorage.setItem("rclpg_token", "demo-token");
  localStorage.setItem("rclpg_expires_at", new Date(Date.now() + 24 * 3600 * 1000).toISOString());
  localStorage.setItem("rclpg_admin", JSON.stringify({ admin_id: 1, name: "Demo Admin", role: "Admin" }));
});

beforeEach(() => {
  // Fresh sample data for every test.
  localStorage.removeItem("rclpg_mock_data_v2");
});

afterEach(() => {
  cleanup();
});

import SalesLogPage from "../pages/SalesLogPage";
import CreditLogsPage from "../pages/CreditLogsPage";
import InventoryPage from "../pages/InventoryPage";
import SalesReportSection from "../components/SalesReportSection";
import mockApi from "../mock/mockApi";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import { MantineProvider } from "@mantine/core";

function renderApp(ui) {
  return render(
    <MantineProvider defaultColorScheme="light">
      <ToastProvider>
        <AuthProvider>{ui}</AuthProvider>
      </ToastProvider>
    </MantineProvider>,
  );
}

function findPaidRow() {
  const typeLabels = screen.getAllByText("Fully Paid");
  return typeLabels
    .map((el) => el.closest("tr"))
    .find((row) => row && row.textContent.includes("Override"));
}

describe("SalesLogPage", () => {
  it("shows the Traded column value for sales (issue: traded not showing)", async () => {
    renderApp(<SalesLogPage />);

    await waitFor(
      () => {
        expect(screen.getAllByText("Fully Paid").length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );

    const paidRow = findPaidRow();
    expect(paidRow).toBeTruthy();
    // Sample fully-paid sale trades an empty Regasco cylinder — the cell must
    // render the standalone "Regasco" value.
    expect(
      within(paidRow).getAllByText("Regasco", { exact: true }).length,
    ).toBeGreaterThan(0);
  }, 15000);

  it("opens the override panel for a fully paid sale without crashing (issue: white screen)", async () => {
    renderApp(<SalesLogPage />);

    await waitFor(
      () => {
        expect(screen.getAllByText("Fully Paid").length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );

    const paidRow = findPaidRow();
    expect(paidRow).toBeTruthy();

    const overrideButton = Array.from(paidRow.querySelectorAll("button")).find(
      (btn) => btn.textContent.trim() === "Override",
    );
    expect(overrideButton).toBeTruthy();
    fireEvent.click(overrideButton);

    await waitFor(
      () => {
        expect(screen.getByText("Commit Entry Correction")).toBeTruthy();
      },
      { timeout: 5000 },
    );

    // Submit the correction — exercises mock updateSale normalization +
    // table reload without crashing.
    const commitButton = screen.getByText("Commit Entry Correction");
    fireEvent.submit(commitButton.closest("form"));
    await waitFor(
      () => {
        expect(screen.getAllByText("Ledger Corrected").length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );
    expect(screen.queryByText("Commit Entry Correction")).toBeNull();
  }, 15000);

  it("opens the override panel for a credit sale too", async () => {
    renderApp(<SalesLogPage />);

    await waitFor(
      () => {
        expect(screen.getAllByText("Credit").length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );

    const creditLabels = screen.getAllByText("Credit");
    const creditRow = creditLabels
      .map((el) => el.closest("tr"))
      .find((row) => row && row.textContent.includes("Override"));
    expect(creditRow).toBeTruthy();

    const overrideButton = Array.from(creditRow.querySelectorAll("button")).find(
      (btn) => btn.textContent.trim() === "Override",
    );
    fireEvent.click(overrideButton);

    await waitFor(
      () => {
        expect(screen.getByText("Commit Entry Correction")).toBeTruthy();
      },
      { timeout: 5000 },
    );
  }, 15000);
});

describe("CreditLogsPage", () => {
  it("lists credit sales from the credit register (issue: credit sale not showing)", async () => {
    renderApp(<CreditLogsPage />);

    // The sample credit sale for B. Reyes must appear with its status.
    await waitFor(
      () => {
        expect(screen.getAllByText("B. Reyes").length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );
    expect(screen.getAllByText("Not Paid").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Regasco - 11kg - Filled Tank").length).toBeGreaterThan(0);

    // Managing the credit opens a working summary modal (payment history).
    fireEvent.click(screen.getAllByText("Manage Credit")[0]);
    await waitFor(
      () => {
        expect(screen.getAllByText("Payment History").length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );
    expect(screen.getAllByText("Remaining Credit").length).toBeGreaterThan(0);
  }, 15000);
});

describe("SalesReportSection", () => {
  it("loads a real report with summary values (issue: report not working)", async () => {
    renderApp(<SalesReportSection />);

    await waitFor(
      () => {
        expect(screen.getByText("Sales Report")).toBeTruthy();
      },
      { timeout: 5000 },
    );

    // Wait for data to replace the loader, then verify computed totals:
    // today = fully paid ₱850 + recorded credit payment ₱500 = ₱1,350.
    await waitFor(
      () => {
        expect(screen.getAllByText("₱1,350.00").length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );
    expect(screen.getByText("Total Orders")).toBeTruthy();
    expect(screen.getByText("Remaining Credit Balance")).toBeTruthy();
    expect(screen.getAllByText("₱1,200.00").length).toBeGreaterThan(0); // credit balance after ₱500 payment
    expect(screen.getAllByText("Regasco").length).toBeGreaterThan(0); // brand metrics section
  }, 15000);
});

describe("InventoryPage product records", () => {
  it("saves a new product with weight, stock, health and prices (issue: prices 0 / fields missing)", async () => {
    renderApp(<InventoryPage />);

    await waitFor(
      () => {
        expect(screen.getByText("Inventory Holdings")).toBeTruthy();
      },
      { timeout: 5000 },
    );

    fireEvent.click(screen.getByRole("button", { name: "Add New Product" }));

    // 50kg Filled Tank, 3 in stock, prices 700 / 1200 / 1100.
    fireEvent.change(document.getElementById("weight"), { target: { value: "50" } });
    fireEvent.change(document.getElementById("status"), { target: { value: "Filled Tank" } });
    fireEvent.change(document.getElementById("stock"), { target: { value: "3" } });
    fireEvent.change(document.getElementById("initial"), { target: { value: "700" } });
    fireEvent.change(document.getElementById("retail"), { target: { value: "1200" } });
    fireEvent.change(document.getElementById("wholesale"), { target: { value: "1100" } });
    fireEvent.submit(document.getElementById("add-product-form"));

    await waitFor(
      () => {
        expect(screen.getAllByText("Record Created").length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );

    // The saved row must carry the real values (not 0 / undefined).
    // The toast fires before loadData() re-renders, so wait for the row.
    await waitFor(
      () => {
        expect(screen.getByText("₱1,200.00")).toBeTruthy();
      },
      { timeout: 5000 },
    );
    const row = screen.getByText("₱1,200.00").closest("tr");
    expect(within(row).getByText("3")).toBeTruthy(); // stock_quantity
    expect(within(row).getByText("Low Stock")).toBeTruthy(); // health recomputed (< 5)
    expect(within(row).getByText("₱700.00")).toBeTruthy(); // initial_price
    expect(within(row).getByText("₱1,100.00")).toBeTruthy(); // wholesale_price

    // Weight must round-trip as a real number (NaN/0 would fall back to 2.7kg).
    fireEvent.click(within(row).getByRole("button", { name: "Edit" }));
    await waitFor(
      () => {
        expect(screen.getByDisplayValue("50kg")).toBeTruthy();
      },
      { timeout: 5000 },
    );
  }, 20000);

  it("recomputes health status when the stock quantity is edited", async () => {
    renderApp(<InventoryPage />);

    await waitFor(
      () => {
        expect(screen.getByText("Inventory Holdings")).toBeTruthy();
      },
      { timeout: 5000 },
    );

    // Sample Regasco 11kg Filled Tank: 12 in stock, "Good Stock".
    await waitFor(
      () => {
        expect(screen.getByText("₱850.00")).toBeTruthy();
      },
      { timeout: 5000 },
    );
    const row = screen.getByText("₱850.00").closest("tr");
    expect(within(row).getByText("Good Stock")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: "Edit" }));

    // Edit modal numeric inputs render in order: Stock, Original, Consumer, Retail.
    await waitFor(
      () => {
        expect(screen.getAllByRole("spinbutton").length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(
      () => {
        expect(screen.getAllByText("Updated").length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );

    await waitFor(
      () => {
        const updatedRow = screen.getByText("₱850.00").closest("tr");
        expect(within(updatedRow).getByText("Out of Stock")).toBeTruthy();
        expect(within(updatedRow).getByText("0")).toBeTruthy();
      },
      { timeout: 5000 },
    );
  }, 20000);

  it("repairs inventory rows saved by the old (camelCase) mock", async () => {
    // Simulate a product stored by the previous mock version, which persisted
    // the raw API payload instead of the product columns.
    localStorage.setItem(
      "rclpg_mock_data_v2",
      JSON.stringify({
        admins: [{ admin_id: 1, name: "Demo Admin", username: "demo", email: "demo@example.com", role: "Admin" }],
        brands: [{ id: 1, name: "GasPro" }],
        customers: [],
        sales: [],
        credits: [],
        expenses: [],
        products: [
          {
            product_id: "000009",
            brand: "GasPro",
            weightClass: 22,
            status: "Filled Tank",
            stockQuantity: 2,
            regularRetail: 1400,
            wholesalePrice: 1300,
            initialPrice: 900,
            created_at: new Date().toISOString(),
          },
        ],
      }),
    );

    renderApp(<InventoryPage />);

    await waitFor(
      () => {
        expect(screen.getByText("₱1,400.00")).toBeTruthy();
      },
      { timeout: 5000 },
    );

    const row = screen.getByText("₱1,400.00").closest("tr");
    expect(within(row).getByText("2")).toBeTruthy(); // stock_quantity
    expect(within(row).getByText("Low Stock")).toBeTruthy(); // recomputed health
    expect(within(row).getByText("₱1,300.00")).toBeTruthy(); // wholesale_price
    expect(within(row).getByText("₱900.00")).toBeTruthy(); // initial_price
    expect(screen.getByText("Weight - 22 kg")).toBeTruthy(); // weight_class restored
  }, 20000);
});

describe("Demo PDF downloads", () => {
  // A previous mock returned `new Blob(["Demo report"], { type: "application/pdf" })`,
  // i.e. plain text with a .pdf name, which every viewer rejected.
  async function expectOpenablePdf(blob) {
    expect(blob.type).toBe("application/pdf");
    const text = await blob.text();

    expect(text.startsWith("%PDF-1.")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/Type /Pages");
    expect(text).toContain("/BaseFont /Helvetica");
    expect(text).toContain("stream");
    expect(text).toContain("/MediaBox [0 0 842 595]"); // A4 landscape
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);

    // The xref offset must actually point at the xref table.
    const startxref = Number(text.match(/startxref\s+(\d+)/)[1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");

    // Every xref entry must point at a real "N 0 obj" header.
    const entries = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries.length).toBeGreaterThan(4);
    entries.forEach((offset) => {
      expect(text.slice(offset, offset + 40)).toMatch(/^\d+ 0 obj/);
    });

    return text;
  }

  it("builds a real, openable sales report PDF (issue: failed to load the PDF)", async () => {
    const { blob, filename } = await mockApi.api.downloadSalesReport({ quickFilter: "today" });
    expect(filename).toMatch(/\.pdf$/);

    const text = await expectOpenablePdf(blob);
    expect(text).toContain("RCLPG Sales Report");
    expect(text).toContain("Total Sales Revenue");
    expect(text).toContain("1,350.00"); // ₱850 fully paid + ₱500 credit payment
  }, 15000);

  it("builds sales log, credit log and expense log PDFs from the demo data", async () => {
    const sales = await mockApi.api.downloadSalesLog({ period: "today" });
    expect(sales.filename).toMatch(/\.pdf$/);
    const salesText = await expectOpenablePdf(sales.blob);
    expect(salesText).toContain("RCLPG Sales Log");
    expect(salesText).toContain("A. Santos");
    expect(salesText).toContain("Regasco"); // traded cylinder

    const credit = await mockApi.api.downloadCreditLog({ period: "daily" });
    const creditText = await expectOpenablePdf(credit.blob);
    expect(creditText).toContain("RCLPG Credit Log");
    expect(creditText).toContain("B. Reyes");
    expect(creditText).toContain("Not Paid");

    const expense = await mockApi.api.downloadExpenseLog({ period: "today" });
    const expenseText = await expectOpenablePdf(expense.blob);
    expect(expenseText).toContain("RCLPG Expense Log");
    expect(expenseText).toContain("Transport");
    // Date / Expense / Amount only — the Category and Note columns were removed.
    expect(expenseText).toContain("(Date)");
    expect(expenseText).toContain("(Expense)");
    expect(expenseText).toContain("(Amount)");
    expect(expenseText).not.toContain("(Category)");
    expect(expenseText).not.toContain("(Note)");
  }, 20000);

  it("splits long exports across multiple valid pages", async () => {
    const today = new Date().toISOString();
    const sales = Array.from({ length: 90 }, (_, index) => ({
      sale_id: index + 1,
      entry_type: "sale",
      product_id: "000001",
      customer_id: 1,
      customer_name: `Customer ${index + 1}`,
      brand: "Regasco",
      weight_class: 11,
      product_status: "Filled Tank",
      price_type: "Regular Retail",
      payment_option: "Fully Paid",
      sale_quantity: 1,
      unit_price: 850,
      total_amount: 850,
      balance_paid: 850,
      remaining_balance: 0,
      lpg_tank_variant: "Regasco",
      log_date: today,
      date_created: today,
    }));
    localStorage.setItem(
      "rclpg_mock_data_v2",
      JSON.stringify({
        admins: [{ admin_id: 1, name: "Demo Admin", username: "demo", email: "demo@example.com", role: "Admin" }],
        brands: [{ id: 1, name: "Regasco" }],
        customers: [],
        sales,
        credits: [],
        expenses: [],
        products: [],
      }),
    );

    const { blob } = await mockApi.api.downloadSalesLog({ period: "today" });
    const text = await expectOpenablePdf(blob);

    const pageObjects = text.match(/\/Type \/Page /g) || [];
    expect(pageObjects.length).toBeGreaterThan(1); // genuinely paginated
    expect(text).toContain("Customer 90"); // last row present
    expect(text).toContain("Page 1 of");
  }, 20000);
});
