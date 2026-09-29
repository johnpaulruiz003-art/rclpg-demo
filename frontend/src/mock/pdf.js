// Minimal PDF writer used by the demo (mock) API.
//
// Demo downloads previously returned `new Blob(["Demo report"], { type:
// "application/pdf" })`, which is plain text, not a PDF — every viewer
// reported "failed to load the PDF". This builds a real, openable PDF
// (header, catalog, page tree, fonts, content streams, xref table, trailer)
// using the standard Helvetica fonts, with light table layout and paging.

// A4 landscape, points — reports are wide tables, so landscape keeps the
// columns readable without shrinking the font.
const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 40;
const TITLE_SIZE = 16;
const HEADING_SIZE = 11;
const BODY_SIZE = 9;
const LINE_HEIGHT = 13;
const BOTTOM_LIMIT = MARGIN + 24;

// Helvetica averages ~0.5em per character, which is accurate enough for
// truncating table cells without embedding font metrics.
const CHAR_WIDTH_RATIO = 0.5;

function escapePdfText(value) {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, "?") // keep the stream ASCII-safe (WinAnsi subset)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function textWidth(text, size) {
  return String(text ?? "").length * size * CHAR_WIDTH_RATIO;
}

function fitText(text, maxWidth, size) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  const maxChars = Math.max(1, Math.floor((maxWidth - 6) / (size * CHAR_WIDTH_RATIO)));
  return clean.length > maxChars ? `${clean.slice(0, Math.max(1, maxChars - 2))}..` : clean;
}

function textOp(text, { x, y, font = "F1", size = BODY_SIZE }) {
  return `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`;
}

function ruleOp(y) {
  return `0.5 w 0.65 0.65 0.65 RG ${MARGIN} ${y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${y.toFixed(2)} l S`;
}

function columnWidths(columns, usableWidth) {
  const weights = columns.map((column) => Number(column.width) || 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return weights.map((weight) => (weight / total) * usableWidth);
}

function columnX(widths, index) {
  return MARGIN + widths.slice(0, index).reduce((sum, width) => sum + width, 0);
}

function layoutPages({ title, subtitle, meta = [], sections = [] }) {
  const pages = [];
  const usableWidth = PAGE_WIDTH - MARGIN * 2;
  let ops = [];
  let y = PAGE_HEIGHT - MARGIN;

  const startPage = () => {
    if (ops.length) pages.push(ops);
    ops = [];
    y = PAGE_HEIGHT - MARGIN;
  };
  const ensureSpace = (needed) => {
    if (y - needed < BOTTOM_LIMIT) startPage();
  };

  if (title) {
    ops.push(textOp(title, { x: MARGIN, y, font: "F2", size: TITLE_SIZE }));
    y -= TITLE_SIZE + 6;
  }
  [subtitle, ...meta].filter(Boolean).forEach((line) => {
    ops.push(textOp(line, { x: MARGIN, y }));
    y -= LINE_HEIGHT;
  });
  y -= 6;

  sections.forEach((section) => {
    const columns = section.columns || [];
    const rows = section.rows || [];
    if (!columns.length) return;

    if (section.heading) {
      ensureSpace(LINE_HEIGHT * 2);
      ops.push(textOp(section.heading, { x: MARGIN, y, font: "F2", size: HEADING_SIZE }));
      y -= HEADING_SIZE + 4;
    }

    const widths = columnWidths(columns, usableWidth);
    const xs = columns.map((column, index) => columnX(widths, index));

    // Table header (repeated on every page).
    ensureSpace(LINE_HEIGHT * 2);
    columns.forEach((column, index) => {
      const text = fitText(column.label, widths[index], BODY_SIZE);
      const x = column.align === "right" ? xs[index] + widths[index] - 4 - textWidth(text, BODY_SIZE) : xs[index];
      ops.push(textOp(text, { x, y, font: "F2" }));
    });
    y -= LINE_HEIGHT + 2;
    ops.push(ruleOp(y + 7));
    y -= 4;

    if (!rows.length) {
      ensureSpace(LINE_HEIGHT);
      ops.push(textOp(section.emptyText || "No records for the selected period.", { x: MARGIN, y }));
      y -= LINE_HEIGHT;
    }

    rows.forEach((row) => {
      ensureSpace(LINE_HEIGHT);
      columns.forEach((column, index) => {
        const raw = row[index];
        if (raw === undefined || raw === null || raw === "") return;
        const text = fitText(raw, widths[index], BODY_SIZE);
        const x = column.align === "right" ? xs[index] + widths[index] - 4 - textWidth(text, BODY_SIZE) : xs[index];
        ops.push(textOp(text, { x, y }));
      });
      y -= LINE_HEIGHT;
    });

    y -= 10;
  });

  pages.push(ops);
  return pages;
}

function serializePdf(pages) {
  // Object layout: 1 catalog, 2 page tree, 3/4 fonts, then per page a page
  // object (5 + 2i) and its content stream (6 + 2i).
  const pageNumbers = pages.map((_, index) => 5 + index * 2);
  const contentNumbers = pages.map((_, index) => 6 + index * 2);
  const objects = [];

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  pages.forEach((ops, index) => {
    const pageNumber = pageNumbers[index];
    const contentNumber = contentNumbers[index];
    objects[pageNumber - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNumber} 0 R >>`;
    const stream = ops.join("\n");
    // Content is ASCII-only, so string length equals the byte length.
    objects[contentNumber - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return pdf;
}

export function buildPdf({ title, subtitle, meta = [], sections = [] }) {
  const pages = layoutPages({ title, subtitle, meta, sections });
  const total = pages.length;

  // Page footers (added once the page count is known).
  pages.forEach((ops, index) => {
    const label = `Page ${index + 1} of ${total}`;
    ops.push(ruleOp(BOTTOM_LIMIT + 4));
    ops.push(
      textOp(label, {
        x: PAGE_WIDTH - MARGIN - textWidth(label, BODY_SIZE),
        y: BOTTOM_LIMIT - 6,
      }),
    );
  });

  return new Blob([serializePdf(pages)], { type: "application/pdf" });
}

// ASCII-safe money formatter (the "₱" glyph is outside the base-14 font set).
export function formatPdfMoney(value) {
  const amount = Number(value || 0);
  const formatted = amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `PHP ${formatted}`;
}
