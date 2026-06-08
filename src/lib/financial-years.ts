export function getFinancialYears(startYear = 2020, endYear = new Date().getFullYear()) {
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => {
    const year = startYear + index;
    return `${year}-${year + 1}`;
  });
}

export function getCurrentFinancialYear(today = new Date()) {
  const year = today.getFullYear();
  return today.getMonth() >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}
