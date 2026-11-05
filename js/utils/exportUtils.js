/**
 * CSV EXPORT UTILITY (js/utils/exportUtils.js)
 * 
 * Generates RFC 4180 compliant CSV files directly in the browser
 * and triggers automated file download without server dependencies.
 */

/**
 * Escapes CSV field value handling quotes, commas, and line breaks.
 * @param {any} val 
 * @returns {string}
 */
function escapeCSVValue(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // If string contains quotes, commas, or newlines, wrap in quotes and escape internal quotes
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  } else {
    str = `"${str}"`;
  }
  return str;
}

/**
 * Converts array of customer objects into CSV format and initiates download.
 * @param {Array<Object>} customers - List of customer records
 * @param {string} [filename] - Output file name
 */
export function exportCustomersToCSV(customers, filename = null) {
  if (!customers || customers.length === 0) {
    throw new Error("No customer records available to export.");
  }

  const today = new Date().toISOString().split('T')[0];
  const outputFilename = filename || `furniture_customers_${today}.csv`;

  // Standard CSV Headers
  const headers = [
    "Customer ID",
    "Full Name",
    "Mobile Phone",
    "Email Address",
    "Gender",
    "Date of Birth",
    "House/Building",
    "Street/Locality",
    "City",
    "State",
    "Postal Code",
    "Total Orders",
    "Total Spent (INR)",
    "Registration Date",
    "Notes"
  ];

  const rows = customers.map(c => {
    let regDate = "";
    if (c.registrationDate) {
      if (typeof c.registrationDate.toDate === 'function') {
        regDate = c.registrationDate.toDate().toISOString().split('T')[0];
      } else {
        regDate = new Date(c.registrationDate).toISOString().split('T')[0];
      }
    }

    const addr = c.address || {};

    return [
      escapeCSVValue(c.customerId || ""),
      escapeCSVValue(c.fullName || ""),
      escapeCSVValue(c.phone || ""),
      escapeCSVValue(c.email || ""),
      escapeCSVValue(c.gender || ""),
      escapeCSVValue(c.dob || ""),
      escapeCSVValue(addr.houseNo || ""),
      escapeCSVValue(addr.street || ""),
      escapeCSVValue(addr.city || ""),
      escapeCSVValue(addr.state || ""),
      escapeCSVValue(addr.postalCode || ""),
      escapeCSVValue(c.totalOrders || 0),
      escapeCSVValue(c.totalSpent || 0),
      escapeCSVValue(regDate),
      escapeCSVValue(c.notes || "")
    ].join(",");
  });

  const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  // Trigger download
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = url;
  downloadLink.setAttribute("download", outputFilename);
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(url);
}

