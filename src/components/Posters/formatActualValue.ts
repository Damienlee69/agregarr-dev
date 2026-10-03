export const formatActualValue = (
  value: unknown,
  missingLabel: string
): string =>
  value === undefined || value === null ? missingLabel : JSON.stringify(value);
