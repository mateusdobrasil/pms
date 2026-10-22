export const onlyDigits = (value: string) => value.replace(/\D/g, "");

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function isValidCPF(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(cpf[len])) return false;
  }
  return true;
}

export function isValidCNPJ(value: string) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  for (const len of [12, 13]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * ((len - i - 1) % 8 + 2);
    const digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (digit !== Number(cnpj[len])) return false;
  }
  return true;
}

// Documento da loja: CPF (pessoa física, MEI sem CNPJ à mostra) ou CNPJ.
export const isValidDocument = (value: string) => isValidCPF(value) || isValidCNPJ(value);
