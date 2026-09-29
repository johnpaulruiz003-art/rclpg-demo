import { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatCurrency } from "../api/client";
import { formatDateLocale } from "../utils/dates";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "../components/LoadingSpinner";
import SaleForm from "../components/SaleForm";
import RecordSaleModal from "../components/RecordSaleModal";
import RecordExpenseModal from "../components/RecordExpenseModal";
import DownloadSalesLogModal from "../components/DownloadSalesLogModal";
import Modal from "../components/Modal";
import ResponsiveDetailModal from "../components/ResponsiveDetailModal";
import { subscribeRealtime } from "../utils/realtime";
import { getSalesEntrySummary } from "../utils/salesTable";
import { saveBlob } from "../utils/download";
import useIsMobile from "../hooks/useIsMobile";
import useDebounce from "../hooks/useDebounce";

export default function SalesLogPage() {
  const { showToast } = useToast();
  const { isAdministrator } = useAuth();
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [dateFilter, setDateFilter] = useState("");
  const [customerNameInput, setCustomerNameInput] = useState("");
  const customerNameFilter = useDebounce(customerNameInput, 400);
  const [productFilter, setProductFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [weightClassFilter, setWeightClassFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedSaleId, setSelectedSaleId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [paymentEditTarget, setPaymentEditTarget] = useState(null);
  const [paymentDeleteTarget, setPaymentDeleteTarget] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseEditTarget, setExpenseEditTarget] = useState(null);
  const [expenseDeleteTarget, setExpenseDeleteTarget] = useState(null);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [expenseFilter, setExpenseFilter] = useState("today");
  const [expenseStartDate, setExpenseStartDate] = useState("");
  const [expenseEndDate, setExpenseEndDate] = useState("");
  const [expenseSingleDate, setExpenseSingleDate] = useState("");
  const [expensePage, setExpensePage] = useState(1);
  const [expensePagination, setExpensePagination] = useState({ page: 1, totalPages: 1 });
  const [downloadExpenseLoading, setDownloadExpenseLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState({ field: "log_date", direction: "desc" });
  const [page, setPage] = useState(1);
  const [mobileDetail, setMobileDetail] = useState(null);
  const isMobile = useIsMobile();
  const pageSize = 10;

  const selectedSale = sales.find((s) => s.sale_id === selectedSaleId);

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const matchesCustomer = !customerNameInput || String(sale.customer_name || "")
        .toLowerCase()
        .includes(customerNameInput.trim().toLowerCase());

      const matchesDate = !dateFilter || (() => {
        const rowDate = new Date(sale.log_date || sale.date_created || sale.date_paid || 0);
        const filterDate = new Date(dateFilter);
        return rowDate.getFullYear() === filterDate.getFullYear()
          && rowDate.getMonth() === filterDate.getMonth()
          && rowDate.getDate() === filterDate.getDate();
      })();

      const matchesBrand = !brandFilter || String(sale.brand || "").toLowerCase() === brandFilter.toLowerCase();
      const matchesWeight = !weightClassFilter || String(sale.weight_class) === String(weightClassFilter);
      const matchesProduct = !productFilter || [sale.brand, sale.weight_class, sale.product_status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(productFilter.trim().toLowerCase()));

      return matchesCustomer && matchesDate && matchesBrand && matchesWeight && matchesProduct;
    });
  }, [sales, customerNameInput, dateFilter, productFilter, brandFilter, weightClassFilter]);

  const sortedSales = useMemo(() => {
    const field = sortConfig.field;
    if (!field) return filteredSales;

    const mapped = filteredSales.map((sale) => {
      const isPayment = sale.entry_type === "payment";
      const logDate = new Date(sale.log_date || sale.date_created || sale.date_paid || 0);
      return {
        sale,
        sortValue: (() => {
          switch (field) {
            case "log_date":
              return logDate;
            case "product":
              return `${sale.weight_class || ""} ${sale.brand || ""}`;
            case "customer":
              return sale.customer_name || "";
            case "type":
              return isPayment ? "Credit Payment" : sale.payment_option || "";
            case "traded":
              return sale.lpg_tank_variant || "";
            case "qty":
              return Number(sale.sale_quantity || 0);
            case "unit_price":
              return Number(sale.unit_price || 0);
            case "total_billing":
              return Number(isPayment ? sale.balance_paid || 0 : sale.total_amount || 0);
            case "balance_paid":
              return Number(sale.balance_paid || 0);
            default:
              return sale[sortConfig.field] || "";
          }
        })(),
      };
    });

    mapped.sort((a, b) => {
      const left = a.sortValue;
      const right = b.sortValue;
      if (left === right) return 0;
      if (left instanceof Date && right instanceof Date) {
        return left - right;
      }
      if (typeof left === "number" && typeof right === "number") {
        return left - right;
      }
      return String(left).localeCompare(String(right), "en", { numeric: true });
    });

    if (sortConfig.direction === "desc") {
      mapped.reverse();
    }

    return mapped.map((item) => item.sale);
  }, [filteredSales, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedSales.length / pageSize));
  const pagedSales = sortedSales.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [dateFilter, customerNameInput, productFilter, brandFilter, weightClassFilter]);

  useEffect(() => {
    setExpensePage(1);
  }, [expenseFilter, expenseStartDate, expenseEndDate]);

  const handleSort = (field) => {
    setSortConfig((prev) =>
      prev.field === field
        ? {
            field,
            direction: prev.direction === "asc" ? "desc" : "asc",
          }
        : { field, direction: "asc" },
    );
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params = { limit: "100" };
      if (dateFilter) params.dateFilter = dateFilter;
      if (customerNameFilter) params.customerName = customerNameFilter;
      if (productFilter) params.productFilter = productFilter;

      const [salesRes, productsRes, customersRes] = await Promise.all([
        api.getSales(params),
        api.getProducts({ allInstances: "true" }),
        api.getCustomers(),
      ]);
      setSales(salesRes.data);
  
      setProducts(productsRes.data);
      setCustomers(customersRes.data);
    } catch (err) {
      showToast("Load Failed", err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [dateFilter, customerNameFilter, productFilter, showToast]);

  const loadExpenses = useCallback(async () => {
    try {
      const expenseParams = {
        limit: String(pageSize),
        page: String(expensePage),
        quickFilter: expenseFilter,
      };
      if (expenseFilter === "custom") {
        if (expenseStartDate) expenseParams.startDate = expenseStartDate;
        if (expenseEndDate) expenseParams.endDate = expenseEndDate;
      } else if (expenseFilter === "single") {
        if (expenseSingleDate) expenseParams.startDate = expenseSingleDate;
      }
      const expensesRes = await api.getExpenses(expenseParams);
      setExpenses(expensesRes.data || []);
      setExpensePagination(expensesRes.pagination || { page: expensePage, totalPages: 1 });
    } catch (err) {
      showToast("Expenses Load Failed", err.message, "error");
    }
  }, [expenseEndDate, expenseSingleDate, expenseFilter, expensePage, expenseStartDate, showToast]);

  const handleDownloadExpenses = async () => {
    try {
      setDownloadExpenseLoading(true);
      if (expenseFilter === "custom" && (!expenseStartDate || !expenseEndDate)) {
        showToast("Date Range Required", "Select both start and end dates.", "error");
        return;
      }

      const params = {
        period: expenseFilter,
        format: "pdf",
      };
      if (expenseFilter === "custom") {
        params.startDate = expenseStartDate;
        params.endDate = expenseEndDate;
      }

      const { blob, filename } = await api.downloadExpenseLog(params);
      saveBlob(blob, filename);
      showToast("Report Ready", "Expenses downloaded successfully.");
    } catch (err) {
      showToast("Download Failed", err.message, "error");
    } finally {
      setDownloadExpenseLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    const unsubscribeSales = subscribeRealtime("sales:changed", () => {
      loadData();
    });
    const unsubscribeCredits = subscribeRealtime("credits:changed", () => {
      loadData();
    });
    const unsubscribeInventory = subscribeRealtime("inventory:changed", () => {
      loadData();
    });
    const unsubscribeExpenses = subscribeRealtime("expenses:changed", () => {
      loadExpenses();
    });

    return () => {
      unsubscribeSales();
      unsubscribeCredits();
      unsubscribeInventory();
      unsubscribeExpenses();
    };
  }, [loadData, loadExpenses]);

  const brands = [...new Set(products.map((p) => p.brand))];
  const weightOptions = [...new Set(products.map((p) => String(p.weight_class)).filter(Boolean))];

  const handleOverride = async (payload) => {
    if (!selectedSaleId) return;
    try {
      setSaving(true);
      await api.updateSale(selectedSaleId, payload);
      showToast("Ledger Corrected", "Transaction updated successfully.");
      setSelectedSaleId(null);
      await loadData();
    } catch (err) {
      showToast("Update Failed", err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setSaving(true);
      await api.deleteSale(deleteTarget.sale_id);
      showToast("Transaction Deleted", "Sale removed and stock restored.");
      if (selectedSaleId === deleteTarget.sale_id) setSelectedSaleId(null);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      showToast("Delete Failed", err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handlePaymentOverride = async () => {
    if (!paymentEditTarget) return;
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      showToast("Invalid Amount", "Enter a valid payment amount.", "error");
      return;
    }
    try {
      setSaving(true);
      await api.updateCreditPayment(paymentEditTarget.credit_id, amount);
      showToast("Payment Updated", "Credit payment updated successfully.");
      setPaymentEditTarget(null);
      setPaymentAmount("");
      await loadData();
    } catch (err) {
      showToast("Update Failed", err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmPaymentDelete = async () => {
    if (!paymentDeleteTarget) return;
    try {
      setSaving(true);
      await api.deleteCreditPayment(paymentDeleteTarget.credit_id);
      showToast("Payment Deleted", "Credit payment removed successfully.");
      setPaymentDeleteTarget(null);
      await loadData();
    } catch (err) {
      showToast("Delete Failed", err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmExpenseDelete = async () => {
    if (!expenseDeleteTarget) return;
    try {
      setSaving(true);
      await api.deleteExpense(expenseDeleteTarget.expenses_id);
      showToast("Expense Deleted", "Expense removed successfully.");
      setExpenseDeleteTarget(null);
      await loadExpenses();
    } catch (err) {
      showToast("Delete Failed", err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const openExpenseEditor = (expense) => {
    setExpenseEditTarget(expense);
    setExpenseModalOpen(true);
  };

  const openSaleDetails = (sale) => {
    const isPayment = sale.entry_type === "payment";
    const entrySummary = getSalesEntrySummary(sale);
    setMobileDetail({
      title: "Sales Log Details",
      details: [
        { label: "Customer", value: sale.customer_name },
        { label: "Product", value: `${sale.brand} - ${sale.weight_class}kg - ${sale.product_status}` },
        { label: "Type", value: entrySummary.typeLabel },
        { label: "Traded", value: sale.lpg_tank_variant || "-" },
        { label: "Quantity", value: isPayment ? "—" : sale.sale_quantity },
        { label: "Unit Price", value: isPayment ? "—" : formatCurrency(sale.unit_price) },
        { label: "Total Billing", value: isPayment ? formatCurrency(sale.balance_paid || 0) : formatCurrency(sale.total_amount) },
        { label: "Balance Paid", value: entrySummary.balancePaidLabel },
        { label: "Date", value: formatDateLocale(sale.log_date || sale.date_created || sale.date_paid) },
      ],
      footer: isAdministrator ? (
        <>
          {!isPayment ? (
            <button
              type="button"
              onClick={() => {
                setMobileDetail(null);
                setSelectedSaleId(sale.sale_id);
              }}
              className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
            >
              Override
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMobileDetail(null);
                setPaymentEditTarget(sale);
                setPaymentAmount(sale.balance_paid || "");
              }}
              className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
            >
              Override
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMobileDetail(null);
              if (isPayment) {
                setPaymentDeleteTarget(sale);
              } else {
                setDeleteTarget(sale);
              }
            }}
            className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600"
          >
            Delete
          </button>
        </>
      ) : null,
    });
  };

  const closeExpenseModal = () => {
    setExpenseModalOpen(false);
    setExpenseEditTarget(null);
  };

  if (loading && !sales.length) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
        <div className="border-b border-slate-100 pb-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">
              Customer & Sales Log
            </h2>
            {isAdministrator && (
              <button
                type="button"
                onClick={() => setDownloadModalOpen(true)}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-5 py-2.5 rounded-xl"
              >
                Download Sales Log
              </button>
            )}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            {isAdministrator && (
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setExpenseEditTarget(null);
                    setExpenseModalOpen(true);
                  }}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-5 py-2.5 rounded-xl"
                >
                  Add Expenses
                </button>
                <button
                  type="button"
                  onClick={() => setSaleModalOpen(true)}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl"
                >
                  Record Sale
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <span className="mb-1 block">Customer</span>
                <input
                  type="text"
                  value={customerNameInput}
                  onChange={(e) => setCustomerNameInput(e.target.value)}
                  placeholder="Filter by customer"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <span className="mb-1 block">Date</span>
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              {isMobile ? (
                <>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <span className="mb-1 block">Brand</span>
                    <select
                      value={brandFilter}
                      onChange={(e) => setBrandFilter(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    >
                      <option value="">All Brands</option>
                      {brands.map((brand) => (
                        <option key={brand} value={brand}>
                          {brand}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <span className="mb-1 block">Weight Class</span>
                    <select
                      value={weightClassFilter}
                      onChange={(e) => setWeightClassFilter(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    >
                      <option value="">All Weights</option>
                      {weightOptions.map((weight) => (
                        <option key={weight} value={weight}>
                          {weight}kg
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <span className="mb-1 block">Product</span>
                  <input
                    type="text"
                    value={productFilter}
                    onChange={(e) => setProductFilter(e.target.value)}
                    placeholder="Brand, weight, status"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        {isAdministrator && selectedSale && (
          <div className="bg-red-50/50 p-5 rounded-xl border-2 border-red-200 shadow-inner space-y-4">
            <div className="border-b border-slate-200 pb-2 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Modify Transaction Values
                </h3>
                <p className="text-[11px] text-slate-400">
                  Sale ID: {selectedSale.sale_id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSaleId(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                aria-label="Close override panel"
              >
                &times;
              </button>
            </div>
            <SaleForm
              compact
              showPaymentMethod={false}
              customers={customers}
              products={products}
              brands={brands}
              initialValues={{
                customerId: selectedSale.customer_id,
                customerName: selectedSale.customer_name,
                location: selectedSale.location,
                phoneNumber: selectedSale.phone_number,
                priceType: selectedSale.price_type,
                brand: selectedSale.brand,
                weightClass: selectedSale.weight_class,
                isFilled: selectedSale.product_status === "Filled Tank",
                productId: selectedSale.product_id,
                quantity: selectedSale.sale_quantity,
                unitPrice: selectedSale.unit_price,
                lpgTankVariant: selectedSale.lpg_tank_variant || "",
                purchaseTank: Boolean(selectedSale.is_purchased_tank),
                is_purchased_tank: Boolean(selectedSale.is_purchased_tank),
                emptyTankProductId: selectedSale.empty_tank_product_id || "",
              }}
              submitLabel={saving ? "Saving..." : "Commit Entry Correction"}
              onSubmit={handleOverride}
            />
          </div>
        )}

        {isMobile ? (
          <div className="space-y-2 mt-2">
            {pagedSales.map((sale) => {
              const entrySummary = getSalesEntrySummary(sale);
              return (
                <button
                  key={`${sale.entry_type}-${sale.sale_id}-${sale.log_date}`}
                  type="button"
                  onClick={() => openSaleDetails(sale)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-slate-800">{sale.customer_name}</span>
                    <span className="font-black text-red-600">{entrySummary.balancePaidLabel}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {sale.brand} - {sale.weight_class}kg - {sale.product_status}
                  </p>
                </button>
              );
            })}
            {pagedSales.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
                No transactions found.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm mt-2">
            <table className="w-full min-w-[1100px] text-left text-xs sm:text-sm whitespace-nowrap">
              <thead className="bg-red-500 text-slate-100 font-bold uppercase tracking-wider">
                <tr>
                  {[
                    { key: "log_date", label: "Log Date", align: "text-left" },
                    { key: "product", label: "Product", align: "text-left" },
                    { key: "customer", label: "Customer", align: "text-left" },
                    { key: "type", label: "Type", align: "text-left" },
                    { key: "traded", label: "Traded", align: "text-center" },
                    { key: "qty", label: "Qty", align: "text-center" },
                    { key: "unit_price", label: "Unit Price", align: "text-right" },
                    { key: "total_billing", label: "Total Billing", align: "text-right" },
                    { key: "balance_paid", label: "Balance Paid", align: "text-right" },
                  ].map((column) => (
                    <th
                      key={column.key}
                      className={`p-3 ${column.align} cursor-pointer select-none`}
                      onClick={() => handleSort(column.key)}
                    >
                      <div className="inline-flex items-center gap-1">
                        {column.label}
                        {sortConfig.field === column.key && (
                          <span className="text-xs">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
                        )}
                      </div>
                    </th>
                  ))}
                  {isAdministrator && (
                    <th className="p-3 text-center">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="font-medium text-slate-600">
                {pagedSales.map((sale) => {
                  const isPayment = sale.entry_type === "payment";
                  const entrySummary = getSalesEntrySummary(sale);
                  return (
                    <tr
                      key={`${sale.entry_type}-${sale.sale_id}-${sale.log_date}`}
                      className={
                        selectedSaleId === sale.sale_id
                          ? "bg-red-50"
                          : "odd:bg-white even:bg-slate-50/70 hover:bg-slate-100/80 transition-colors"
                      }
                    >
                      <td className="p-3">
                        {formatDateLocale(sale.log_date || sale.date_created || sale.date_paid)}
                      </td>
                      <td className="p-3">
                          {sale.weight_class}kg - {sale.brand}
                      </td>
                      <td className="p-3 font-bold text-slate-800 ">
                        {sale.customer_name}
                      </td>
                      <td className="p-3">
                        {entrySummary.typeLabel}
                      </td>
                      <td className="p-3 font-semibold text-indigo-700 text-center">
                          {sale.lpg_tank_variant || ""}
                      </td>
                      <td className="p-3 text-center font-bold">
                        {
                          isPayment ? " " : sale.sale_quantity
                        }
                      </td>
                      <td className="p-3 text-center">
                        {isPayment ? "" : formatCurrency(sale.unit_price)}
                      </td>
                      <td className="p-3 text-center text-red-600 font-extrabold">
                        {isPayment ? formatCurrency(sale.balance_paid || 0) : formatCurrency(sale.total_amount)}
                      </td>
                      <td className="p-3 text-center font-semibold text-slate-700">
                        {entrySummary.balancePaidLabel}
                      </td>
                      {isAdministrator && (
                        <td className="p-3 text-center space-x-1">
                          {!isPayment && (
                            <>
                              <button
                                type="button"
                                onClick={() => setSelectedSaleId(sale.sale_id)}
                                className="text-xs font-bold bg-slate-100 hover:bg-slate-800 hover:text-white px-2 py-1 rounded-lg"
                              >
                                Override
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(sale)}
                                className="text-xs font-bold bg-red-50 text-red-600 hover:bg-red-600 hover:text-white px-2 py-1 rounded-lg"
                              >
                                Delete
                              </button>
                            </>
                          )}
                          {isPayment && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setPaymentEditTarget(sale);
                                  setPaymentAmount(sale.balance_paid || "");
                                }}
                                className="text-xs font-bold bg-slate-100 hover:bg-slate-800 hover:text-white px-2 py-1 rounded-lg"
                              >
                                Override
                              </button>
                              <button
                                type="button"
                                onClick={() => setPaymentDeleteTarget(sale)}
                                className="text-xs font-bold bg-red-50 text-red-600 hover:bg-red-600 hover:text-white px-2 py-1 rounded-lg"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {pagedSales.length === 0 && (
                  <tr>
                    <td
                      colSpan={isAdministrator ? 11 : 10}
                      className="text-center py-8 text-slate-400"
                    >
                      No transactions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {sortedSales.length > pageSize && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page <= 1}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <div>
              Page {page} of {totalPages}
            </div>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={page >= totalPages}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {mobileDetail && (
          <ResponsiveDetailModal
            title={mobileDetail.title}
            onClose={() => setMobileDetail(null)}
            details={mobileDetail.details}
            footer={mobileDetail.footer}
          />
        )}

        {isAdministrator && (
        <Modal
            open={!!deleteTarget}
            title="Delete Sale"
            onClose={() => setDeleteTarget(null)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-sm font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={confirmDelete}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold"
                >
                  Confirm Delete
                </button>
              </>
            }
          >
            <p className="text-sm text-slate-600">
              Permanently delete this sale for{" "}
              <strong>{deleteTarget?.customer_name}</strong>? Stock will be
              restored and all payment records will be removed.
            </p>
          </Modal>
        )}

        {isAdministrator && (
        <Modal
            open={!!paymentEditTarget}
            title="Override Payment"
            onClose={() => setPaymentEditTarget(null)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setPaymentEditTarget(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-sm font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handlePaymentOverride}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold"
                >
                  {saving ? "Saving..." : "Save Payment"}
                </button>
              </>
            }
          >
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase text-slate-500">
                Payment Amount
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full text-sm p-3 border border-slate-200 rounded-xl"
              />
            </div>
          </Modal>
        )}

{isAdministrator && (
        <Modal
            open={!!expenseDeleteTarget}
            title="Delete Expense"
            onClose={() => setExpenseDeleteTarget(null)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setExpenseDeleteTarget(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-sm font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={confirmExpenseDelete}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold"
                >
                  Confirm Delete
                </button>
              </>
            }
          >
            <p className="text-sm text-slate-600">
              Delete <strong>{expenseDeleteTarget?.expenses}</strong> expense of{" "}
              <strong>{formatCurrency(expenseDeleteTarget?.amount)}</strong>?
            </p>
          </Modal>
        )}

        {isAdministrator && paymentDeleteTarget && (
        <Modal
            open={true}
            title="Delete Payment"
            onClose={() => setPaymentDeleteTarget(null)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setPaymentDeleteTarget(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-sm font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={confirmPaymentDelete}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold"
                >
                  Confirm Delete
                </button>
              </>
            }
          >
            <p className="text-sm text-slate-600">
              Delete this payment record for <strong>{paymentDeleteTarget?.customer_name}</strong>? The sale itself will remain unchanged and remaining credit will be recalculated.
            </p>
          </Modal>
        )}

        <RecordSaleModal
          open={saleModalOpen}
          onClose={() => setSaleModalOpen(false)}
          onSuccess={loadData}
        />
        <RecordExpenseModal
          open={expenseModalOpen}
          onClose={closeExpenseModal}
          editingExpense={expenseEditTarget}
          onSuccess={() => {
            loadData();
            loadExpenses();
          }}
        />
        {downloadModalOpen && (
          <DownloadSalesLogModal onClose={() => setDownloadModalOpen(false)} />
        )}
      </div>
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
      <section className="rounded-xl sm:p-1 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Expense Overview</h3>
            <p className="text-[11px] text-slate-400">
              Review expenses for the selected time period.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={expenseFilter}
              onChange={(e) => setExpenseFilter(e.target.value)}
              className="text-xs p-2.5 border border-slate-200 rounded-xl"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="first_half">First Half (Jan-Jun)</option>
              <option value="second_half">Second Half (Jul-Dec)</option>
              <option value="year">This Year</option>
              <option value="single">Custom Date</option>
              <option value="custom">Custom Date Range</option>
            </select>
            {expenseFilter === "single" && (
              <input
                type="date"
                value={expenseSingleDate}
                onChange={(e) => setExpenseSingleDate(e.target.value)}
                className="text-xs p-2.5 border border-slate-200 rounded-xl"
              />
            )}
            {expenseFilter === "custom" && (
              <div className="flex gap-2">
                <input
                  type="date"
                  value={expenseStartDate}
                  onChange={(e) => setExpenseStartDate(e.target.value)}
                  className="text-xs p-2.5 border border-slate-200 rounded-xl"
                />
                <input
                  type="date"
                  value={expenseEndDate}
                  onChange={(e) => setExpenseEndDate(e.target.value)}
                  className="text-xs p-2.5 border border-slate-200 rounded-xl"
                />
              </div>
            )}
            {isAdministrator && (
              <button
                type="button"
                disabled={downloadExpenseLoading}
                onClick={handleDownloadExpenses}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2.5 rounded-xl disabled:opacity-60"
              >
                {downloadExpenseLoading ? 'Downloading...' : 'Download Expenses'}
              </button>
            )}
          </div>
        </div>
        {isMobile ? (
          <div className="space-y-2">
            {expenses.map((item) => (
              <div
                key={item.expenses_id}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Expense</p>
                    <p className="mt-1 font-bold text-slate-800">{item.expenses}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Amount</p>
                    <p className="mt-1 font-black text-red-600">{formatCurrency(item.amount)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                  <span>{formatDateLocale(item.date)}</span>
                  {isAdministrator && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openExpenseEditor(item)}
                        className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpenseDeleteTarget(item)}
                        className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {expenses.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
                No expenses recorded for the selected period.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[480px] text-left text-xs whitespace-nowrap">
                <thead className="bg-red-500 text-slate-100 font-bold uppercase tracking-wide">
                  <tr>
                    <th className="p-3 text-center">Expense</th>
                    <th className="p-3 text-center">Amount</th>
                    <th className="p-3 text-center">Date</th>
                    {isAdministrator && <th className="p-3 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="font-medium text-slate-600">
                  {expenses.map((item) => (
                    <tr
                      key={item.expenses_id}
                      className="odd:bg-white even:bg-slate-50/70 hover:bg-slate-100/80 transition-colors"
                    >
                      <td className="p-3 font-bold text-slate-800 text-center">
                        {item.expenses}
                      </td>
                      <td className="p-3 text-red-600 font-bold text-center">
                        {formatCurrency(item.amount)}
                      </td>
                      <td className="p-3 text-center">
                        {formatDateLocale(item.date)}
                      </td>
                      {isAdministrator && (
                        <td className="p-3 text-center space-x-1">
                          <button
                            type="button"
                            onClick={() => openExpenseEditor(item)}
                            className="text-xs font-bold bg-amber-100 hover:bg-amber-500 hover:text-white px-2.5 py-1 rounded-lg"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpenseDeleteTarget(item)}
                            className="text-xs font-bold bg-red-50 text-red-600 hover:bg-red-600 hover:text-white px-2.5 py-1 rounded-lg"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr>
                      <td colSpan={isAdministrator ? 4 : 3} className="text-center py-4 text-slate-400">
                        No expenses recorded for the selected period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {expensePagination.totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
                <button
                  type="button"
                  onClick={() => setExpensePage((prev) => Math.max(prev - 1, 1))}
                  disabled={expensePagination.page <= 1}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <div>
                  Page {expensePagination.page} of {expensePagination.totalPages}
                </div>
                <button
                  type="button"
                  onClick={() => setExpensePage((prev) => Math.min(prev + 1, expensePagination.totalPages))}
                  disabled={expensePagination.page >= expensePagination.totalPages}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  </div>
  );
}
