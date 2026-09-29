// Shared file download helper for generated blobs (PDF / Excel exports).
const TYPE_EXTENSIONS = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
};

export function saveBlob(blob, filename) {
  if (!blob) return;

  // Fall back to an extension matching the blob type so the viewer picks the
  // right application (a PDF blob saved as a bare name won't open).
  const extension = TYPE_EXTENSIONS[blob.type] || "bin";
  const name = filename && filename.includes(".")
    ? filename
    : `${filename || "download"}.${extension}`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoke on a later tick: revoking in the same tick as click() can cancel the
  // download in some browsers and leave a truncated/unopenable file on disk.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
