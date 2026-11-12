/** A leading `=`, `+`, `-` or `@` would run as a spreadsheet formula. */
export const csvCell = (text: string) => {
  const inert = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${inert.replaceAll('"', '""')}"`;
};

export const commaDecimal = (value: string) => value.replace(".", ",");

/** pt-BR spreadsheets read `;` columns, comma decimals and need the BOM to see UTF-8. */
export const downloadCsv = (filename: string, lines: string[]) => {
  const text = [...lines, ""].join("\r\n");
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Safari and Firefox cancel a download whose URL is revoked in the same task.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
