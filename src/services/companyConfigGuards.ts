export interface CompanyConfigIdentity {
  company_name: string;
  id?: string;
}

export function normalizeCompanyName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-MX');
}

export function hasDuplicateCompanyConfig(
  configs: readonly CompanyConfigIdentity[],
  companyName: string,
  currentId?: string,
): boolean {
  const normalized = normalizeCompanyName(companyName);
  return configs.some(config => config.id !== currentId && normalizeCompanyName(config.company_name) === normalized);
}
