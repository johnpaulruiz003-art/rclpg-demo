import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "../api/client";
import { useToast } from "../context/ToastContext";
import { Select } from "@mantine/core";


function formatDateLabel(dateValue) {
  if (!dateValue) return "Unknown date";

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";

  return parsed.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatWeightClassLabel(weightClass) {
  const normalized = Number(weightClass);
  const displayValue = Number.isInteger(normalized)
    ? `${normalized}`
    : normalized.toFixed(1).replace(/\.0$/, "");

  return `Weight - ${displayValue} kg`;
}

function getWeightClassColor(weightClass) {
  switch (Number(weightClass)) {
    case 2.7:
      return "#FFFF00";
    case 5:
      return "#FF00FF";
    case 11:
      return "#1E90FF";
    case 22:
      return "#7CFC00";
    case 50:
      return "#FF6347";
    default:
      return "#334155";
  }
}

function productOptionLabel(product) {
  const createdAtLabel = formatDateLabel(product.created_at);

  if (Number(product.stock_quantity) === 0) {
    return `OUT OF STOCK (${createdAtLabel})`;
  }

  const isLowStock = product.health_indicator === "Low Stock";
  const stockLabel = isLowStock ? "LOW STOCK" : "GOOD STOCK";
  return `${stockLabel} — Stock: ${product.stock_quantity} (${createdAtLabel})`;
}

export default function SaleForm({
  customers,
  products,
  brands,
  onSubmit,
  initialValues,
  submitLabel = "Save Sale",
  title = "Record New Sale",
  description = "Inventory base price loads automatically but can be edited manually",
  compact = false,
  showPaymentMethod = true,
}) {
  const { showToast } = useToast();
  const [mode, setMode] = useState(
    initialValues?.customerId ? "existing" : "existing",
  );
  const [customerId, setCustomerId] = useState(initialValues?.customerId || "");
  const [customerName, setCustomerName] = useState(
    initialValues?.customerName || "",
  );
  const [location, setLocation] = useState(initialValues?.location || "");
  const [phoneNumber, setPhoneNumber] = useState(
    initialValues?.phoneNumber || "",
  );
  const [priceType, setPriceType] = useState(
    initialValues?.priceType || "Regular Retail",
  );
  const [paymentMethod, setPaymentMethod] = useState(
    initialValues?.paymentMethod || "Fully Paid",
  );
  const [initialPayment, setInitialPayment] = useState(
    initialValues?.initialPayment ?? "0.00",
  );
  const [brand, setBrand] = useState(initialValues?.brand || brands[0] || "");
  const [isFilled, setIsFilled] = useState(initialValues?.isFilled ?? true);
  const [purchaseTank, setPurchaseTank] = useState(
    initialValues?.is_purchased_tank ?? initialValues?.purchaseTank ?? false,
  );
  const [productId, setProductId] = useState(initialValues?.productId || "");
  const [quantity, setQuantity] = useState(initialValues?.quantity || 1);
  const [unitPrice, setUnitPrice] = useState(initialValues?.unitPrice || 0);
  const [lpgTankVariant, setLpgTankVariant] = useState(
    initialValues?.lpgTankVariant || brands[0] || "Regasco",
  );

  const productStatus = isFilled ? "Filled Tank" : "Empty Cylinder";

  const filteredProducts = useMemo(() => {
    const matchedProducts = products.filter(
      (p) => p.status === productStatus && p.brand === brand,
    );

    const groupedProducts = new Map();
    matchedProducts.forEach((product) => {
      const group = groupedProducts.get(product.weight_class) || [];
      group.push(product);
      groupedProducts.set(product.weight_class, group);
    });

    return Array.from(groupedProducts.entries())
      .sort(([left], [right]) => Number(left) - Number(right))
      .flatMap(([, productsForWeight]) => {
        const sortedProducts = [...productsForWeight].sort(
          (left, right) =>
            new Date(left.created_at) - new Date(right.created_at),
        );

        if (sortedProducts.length === 1) {
          return sortedProducts;
        }

        let firstAvailableIndex = -1;
        for (let index = 0; index < sortedProducts.length; index += 1) {
          if (Number(sortedProducts[index].stock_quantity) > 0) {
            firstAvailableIndex = index;
            break;
          }
        }

        if (firstAvailableIndex === -1) {
          return sortedProducts.slice(-1);
        }

        return sortedProducts.slice(firstAvailableIndex);
      });
  }, [products, productStatus, brand]);

  const groupedProductOptions = useMemo(() => {
    // Group products by exact weight class value. Each group's options
    // already respect the FIFO / availability logic from `filteredProducts`.
    const grouped = new Map();

    filteredProducts.forEach((product) => {
      const key = String(product.weight_class);
      const items = grouped.get(key) || [];
      items.push({
        product,
        value: product.product_id,
        label: productOptionLabel(product),
        weightColor: getWeightClassColor(product.weight_class),
      });
      grouped.set(key, items);
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([weightClass, options]) => ({
        weightClass,
        displayLabel: `${Number.isInteger(Number(weightClass)) ? Number(weightClass) : Number(weightClass).toFixed(1).replace(/\.0$/, '')} kg`,
        color: options[0]?.weightColor || "#334155",
        options,
      }));
  }, [filteredProducts]);

  const [selectedWeight, setSelectedWeight] = useState(
    String(initialValues?.weightClass ?? initialValues?.weight_class ?? ""),
  );
  const [selectedEmptyTankId, setSelectedEmptyTankId] = useState(
    initialValues?.emptyTankProductId || "",
  );

  const weightGroups = groupedProductOptions;

  const stockOptions = useMemo(() => {
    const group = weightGroups.find((g) => g.weightClass === selectedWeight);
    return group ? group.options : [];
  }, [weightGroups, selectedWeight]);

  // Searchable customer list: dedupe by name (case-insensitive) so
  // customers with multiple historical records only appear once, sorted
  // alphabetically. Mantine's Select performs case-insensitive partial
  // matching as the user types.
  const customerOptions = useMemo(() => {
    const seen = new Map();
    customers.forEach((c) => {
      const key = c.name?.trim().toLowerCase();
      // Mantine Select requires string option values — numeric ids throw
      // ("Option value must be a string"), which crashes the whole tree.
      if (key && !seen.has(key)) {
        seen.set(key, { value: String(c.customer_id), label: c.name });
      }
    });
    return Array.from(seen.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [customers]);

  useEffect(() => {
    if (mode !== "existing" || !customerId) return;

    const selected = customers.find(
      (c) => String(c.customer_id) === String(customerId),
    );
    if (!selected) return;

    setCustomerName(selected.name || "");
    setLocation(selected.location || "");
    setPhoneNumber(selected.phone_number || "");
  }, [mode, customerId, customers]);

  const selectedProduct = filteredProducts.find(
    (p) => p.product_id === productId,
  );
  const emptyTankOptions = useMemo(() => {
    if (!purchaseTank || !brand || !selectedWeight) return [];

    return products
      .filter(
        (product) =>
          product.status === "Empty Cylinder" &&
          product.brand === brand &&
          Number(product.weight_class) === Number(selectedWeight) &&
          Number(product.stock_quantity) > 0,
      )
      .sort(
        (left, right) =>
          new Date(left.created_at) - new Date(right.created_at) ||
          String(left.product_id).localeCompare(String(right.product_id)),
      );
  }, [brand, products, purchaseTank, selectedWeight]);

  const selectedEmptyTank = useMemo(
    () =>
      emptyTankOptions.find(
        (product) => product.product_id === selectedEmptyTankId,
      ) || null,
    [emptyTankOptions, selectedEmptyTankId],
  );

  const filledTankInitialPrice = Number(selectedProduct?.initial_price ?? 0);
  const filledTankUnitPrice = Number(
    priceType === "Regular Retail"
      ? selectedProduct?.regular_retail ?? 0
      : selectedProduct?.wholesale_price ?? 0,
  );
  const emptyTankInitialPrice = Number(selectedEmptyTank?.initial_price ?? 0);
  const emptyTankUnitPrice = Number(
    priceType === "Regular Retail"
      ? selectedEmptyTank?.regular_retail ?? 0
      : selectedEmptyTank?.wholesale_price ?? 0,
  );

  const shouldEnableLpgField = !purchaseTank && isFilled;
  const customerLpgValue = shouldEnableLpgField ? lpgTankVariant : "N/A";
  const total = Number(quantity) * Number(unitPrice);

  useEffect(() => {
    if (!brand && brands.length) setBrand(brands[0]);
  }, [brand, brands]);

  useEffect(() => {
    if (!initialValues?.emptyTankProductId) {
      if (!purchaseTank) setSelectedEmptyTankId("");
      return;
    }

    setSelectedEmptyTankId(initialValues.emptyTankProductId);
  }, [initialValues?.emptyTankProductId, purchaseTank]);

  useEffect(() => {
    if (filteredProducts.length) {
      // Ensure selectedWeight is valid for the new filtered set
      if (!weightGroups.find((g) => g.weightClass === selectedWeight)) {
        const firstGroup = weightGroups[0];
        const firstProduct = firstGroup?.options?.[0];
        setSelectedWeight(firstGroup?.weightClass || "");
        setProductId(firstProduct?.value || "");
      } else {
        // If the current productId is no longer available, pick first in group
        const currentGroup = weightGroups.find((g) => g.weightClass === selectedWeight);
        if (currentGroup && !currentGroup.options.find((o) => o.value === productId)) {
          setProductId(currentGroup.options[0]?.value || "");
        }
      }
      return;
    }

    setSelectedWeight("");
    setProductId("");
    setUnitPrice(0);
  }, [filteredProducts, productId, selectedWeight, weightGroups]);

  useEffect(() => {
    if (!selectedProduct) return;
    const base =
      priceType === "Regular Retail"
        ? selectedProduct.regular_retail
        : selectedProduct.wholesale_price;

    const nextUnitPrice = purchaseTank && selectedEmptyTank
      ? Number(base) + Number(emptyTankUnitPrice)
      : Number(base);

    setUnitPrice(Number(nextUnitPrice));
  }, [selectedProduct, priceType, purchaseTank, selectedEmptyTank, emptyTankUnitPrice]);

  useEffect(() => {
    if (!purchaseTank) {
      setSelectedEmptyTankId("");
      return;
    }

    if (!brand || !selectedWeight) {
      setSelectedEmptyTankId("");
      return;
    }

    if (
      selectedEmptyTankId &&
      !emptyTankOptions.some((product) => product.product_id === selectedEmptyTankId)
    ) {
      setSelectedEmptyTankId("");
    }
  }, [brand, emptyTankOptions, purchaseTank, selectedEmptyTankId, selectedWeight]);

  useEffect(() => {
    if (!weightGroups.length) {
      setSelectedWeight("");
      setProductId("");
      setUnitPrice(0);
      return;
    }

    let currentGroup = weightGroups.find(
      (g) => g.weightClass === selectedWeight,
    );

    if (!currentGroup) {
      currentGroup = weightGroups[0];
      setSelectedWeight(currentGroup.weightClass);
    }

    if (
      currentGroup &&
      !currentGroup.options.some((option) => option.value === productId)
    ) {
      setProductId(currentGroup.options[0]?.value || "");
    }
  }, [weightGroups, selectedWeight, productId]);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (mode === "existing" && !customerId) {
      showToast("Validation Error", "Please select a customer.", "error");
      return;
    }

    // The customer Select keeps ids as strings (Mantine requirement); send
    // numeric ids back as numbers so backend/mock strict-id comparisons match.
    const parsedCustomerId = Number(customerId);
    const submitCustomerId =
      mode === "existing" && customerId !== "" && customerId != null
        ? Number.isNaN(parsedCustomerId)
          ? customerId
          : parsedCustomerId
        : undefined;

    onSubmit({
      customerId: submitCustomerId,
      customerName,
      location,
      phoneNumber,
      priceType,
      paymentMethod: showPaymentMethod ? paymentMethod : "Fully Paid",
      initialPayment:
        paymentMethod === "Credit" ? Number(initialPayment) || 0 : undefined,
      productId,
      quantity: Number(quantity),
      unitPrice: Number(unitPrice),
      isFilled,
      purchaseTank,
      is_purchased_tank: purchaseTank,
      brand,
      lpgTankVariant: shouldEnableLpgField ? lpgTankVariant : undefined,
      emptyTankProductId: purchaseTank ? selectedEmptyTankId || undefined : undefined,
      emptyTankBrand: purchaseTank && selectedEmptyTank ? selectedEmptyTank.brand : undefined,
      emptyTankWeightClass: purchaseTank && selectedEmptyTank ? selectedEmptyTank.weight_class : undefined,
      emptyTankInitialPrice: purchaseTank ? emptyTankInitialPrice : undefined,
      filledTankInitialPrice: purchaseTank ? filledTankInitialPrice : undefined,
      emptyTankUnitPrice: purchaseTank ? emptyTankUnitPrice : undefined,
      filledTankUnitPrice: purchaseTank ? filledTankUnitPrice : undefined,
    });
  };

  return (
    <div
      className={`bg-white rounded-xl space-y-4 ${compact ? "" : "p-6 border border-slate-200 shadow-sm"}`}
    >
      {!compact && (
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-400">{description}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold uppercase text-slate-500">
            Customer Mode
          </legend>
          <label className="inline-flex items-center gap-2 mr-4 text-sm">
            <input
              type="radio"
              name="customerMode"
              checked={mode === "existing"}
              onChange={() => setMode("existing")}
            />
            Existing Customer
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="customerMode"
              checked={mode === "new"}
              onChange={() => setMode("new")}
            />
            New Customer
          </label>
        </fieldset>

        {mode === "existing" ? (
          <div>
            <Select
              id="customer-select"
              label="Customer Name"
              placeholder="Search or select a customer..."
              data={customerOptions}
              value={customerId === "" || customerId == null ? null : String(customerId)}
              onChange={(value) => setCustomerId(value || "")}
              searchable
              nothingFoundMessage="No matching customers"
              required
              classNames={{
                label: "text-xs font-bold uppercase text-slate-500 mb-1",
              }}
            />
          </div>
        ) : (
          <div>
            <label
              htmlFor="customer-name"
              className="block text-xs font-bold uppercase text-slate-500 mb-1"
            >
              Customer Name
            </label>
            <input
              id="customer-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
              className="w-full text-sm p-3 border border-slate-200 rounded-xl"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="location"
              className="block text-xs font-bold uppercase text-slate-500 mb-1"
            >
              Location
            </label>
            <input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full text-sm p-3 border border-slate-200 rounded-xl"
            />
          </div>
          <div>
            <label
              htmlFor="phone"
              className="block text-xs font-bold uppercase text-slate-500 mb-1"
            >
              Phone Number
            </label>
            <input
              id="phone"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full text-sm p-3 border border-slate-200 rounded-xl"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="price-type"
            className="block text-xs font-bold uppercase text-slate-500 mb-1"
          >
            Price Type
          </label>
          <select
            id="price-type"
            value={priceType}
            onChange={(e) => setPriceType(e.target.value)}
            className="w-full text-sm py-3 px-4 border border-slate-200 bg-white rounded-xl"
          >
            <option value="Regular Retail">Consumer Price</option>
            <option value="Wholesale">Retail Price</option>
          </select>
        </div>

        {showPaymentMethod && (
          <div className="space-y-3">
            <div>
              <label
                htmlFor="payment-method"
                className="block text-xs font-bold uppercase text-slate-500 mb-1"
              >
                Payment Method
              </label>
              <select
                id="payment-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full text-sm py-3 px-4 border border-slate-200 bg-white rounded-xl"
              >
                <option value="Fully Paid">Fully Paid</option>
                <option value="Credit">Credit</option>
              </select>
            </div>
          </div>
        )}

        <fieldset className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
          <legend className="text-xs font-bold uppercase text-slate-500">
            Tank Type
          </legend>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isFilled}
                onChange={(e) => setIsFilled(e.target.checked)}
              />
              Filled
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={purchaseTank}
                onChange={(e) => setPurchaseTank(e.target.checked)}
              />
              Purchase Tank
            </label>
          </div>
        </fieldset>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="brand"
              className="block text-xs font-bold uppercase text-slate-500 mb-1"
            >
              Brand (Filled Tank Sold)
            </label>
            <select
              id="brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="w-full text-sm py-3 px-4 border border-slate-200 bg-white rounded-xl"
            >
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="product-weight"
                className="block text-xs font-bold uppercase text-slate-500 mb-1"
              >
                Weight Class
              </label>
              <select
                id="product-weight"
                value={selectedWeight}
                onChange={(e) => {
                  setSelectedWeight(e.target.value);
                  setSelectedEmptyTankId("");
                }}
                className="w-full text-xs py-3 px-4 border border-slate-200 bg-white rounded-xl"
              >
                <option value="" disabled>
                  Select a weight
                </option>
                {weightGroups.map((group) => (
                  <option key={group.weightClass} value={group.weightClass}>
                    {group.displayLabel}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="product"
                className="block text-xs font-bold uppercase text-slate-500 mb-1"
              >
                Stock Entry
              </label>
              <select
                id="product"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                required
                className="w-full text-xs py-3 px-4 border border-slate-200 bg-white rounded-xl font-mono"
              >
                <option value="" disabled>
                  Select a stock entry
                </option>
                {stockOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    style={{
                      backgroundColor: option.weightColor,
                      color: "#0f172a",
                      fontWeight: 600,
                    }}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {purchaseTank && (
            <div className="space-y-2">
              <label
                htmlFor="empty-tank"
                className="block text-xs font-bold uppercase text-slate-500 mb-1"
              >
                Empty Tank
              </label>

              {emptyTankOptions.length > 0 ? (
                <select
                  id="empty-tank"
                  value={selectedEmptyTankId}
                  onChange={(e) => setSelectedEmptyTankId(e.target.value)}
                  className="w-full text-sm py-3 px-4 border border-slate-200 bg-white rounded-xl"
                >
                  <option value="" disabled>
                    Select an empty tank
                  </option>
                  {emptyTankOptions.map((option) => (
                    <option key={option.product_id} value={option.product_id}>
                      {`${option.brand} - ${formatWeightClassLabel(option.weight_class)} - Stock: ${option.stock_quantity} (${formatDateLabel(option.created_at)})`}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full text-sm py-3 px-4 border border-slate-200 bg-slate-50 rounded-xl text-slate-500">
                  No empty tanks available
                </div>
              )}

              {selectedEmptyTank && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Empty Tank Initial Price
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-800">
                      {formatCurrency(emptyTankInitialPrice)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Filled Tank Initial Price
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-800">
                      {formatCurrency(filledTankInitialPrice)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Empty Tank Unit Price
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-800">
                      {formatCurrency(emptyTankUnitPrice)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Filled Tank Unit Price
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-800">
                      {formatCurrency(filledTankUnitPrice)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
          <div>
            <label
              htmlFor="qty"
              className="block text-xs font-bold uppercase text-slate-500 mb-1"
            >
              Quantity
            </label>
            <input
              id="qty"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              className="w-full text-sm p-2 border border-slate-200 rounded-lg text-center font-bold"
            />
          </div>
          <div>
            <label
              htmlFor="unit-price"
              className="block text-xs font-bold uppercase text-slate-500 mb-1"
            >
              Unit Price
            </label>
            <input
              id="unit-price"
              type="number"
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              required
              className="w-full text-sm p-2 bg-amber-50 border border-amber-300 rounded-lg text-center font-bold"
            />
          </div>
        </div>

        <fieldset className="space-y-2 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
          <legend className="text-xs font-bold uppercase text-indigo-700 px-1">
            Customer LPG Tank
          </legend>
          <p className="text-[11px] text-slate-500">
            Brand of the empty cylinder returned by the customer (same weight as
            filled tank sold)
          </p>
          <div>
            <label
              htmlFor="customer-lpg"
              className="block text-xs font-bold uppercase text-slate-500 mb-1"
            >
              Customer LPG
            </label>
            <select
              id="customer-lpg"
              value={customerLpgValue}
              onChange={(e) => setLpgTankVariant(e.target.value)}
              required={shouldEnableLpgField}
              disabled={!shouldEnableLpgField}
              className="w-full text-sm py-3 px-4 border border-slate-200 bg-white rounded-xl disabled:bg-slate-100 disabled:text-slate-500"
            >
              {shouldEnableLpgField ? (
                brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))
              ) : (
                <option value="N/A">N/A</option>
              )}
            </select>
          </div>
        </fieldset>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Total Bill Summary:
          </span>
          <span className="text-xl font-black text-red-600" aria-live="polite">
            {formatCurrency(total)}
          </span>
        </div>

        <button
          type="submit"
          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl shadow transition text-sm"
        >
          {submitLabel}
        </button>
      </form>
    </div>
  );
}
