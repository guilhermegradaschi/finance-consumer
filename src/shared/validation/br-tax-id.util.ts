function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidNfeChaveAcesso(raw: string): boolean {
  const chave = onlyDigits(raw);
  if (chave.length !== 44) {
    return false;
  }
  let sum = 0;
  let weight = 2;
  for (let i = 42; i >= 0; i -= 1) {
    sum += parseInt(chave[i], 10) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const dv = remainder < 2 ? 0 : 11 - remainder;
  return dv === parseInt(chave[43], 10);
}

function cnpjCheckDigit(base: string, factors: number[]): number {
  let sum = 0;
  for (let i = 0; i < factors.length; i += 1) {
    sum += parseInt(base[i], 10) * factors[i];
  }
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

export function isValidCnpj(raw: string): boolean {
  const c = onlyDigits(raw);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) {
    return false;
  }
  const d1 = cnpjCheckDigit(c, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = cnpjCheckDigit(c, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === parseInt(c[12], 10) && d2 === parseInt(c[13], 10);
}

function cpfCheckDigit(base: string, factorStart: number): number {
  let sum = 0;
  for (let i = 0; i < base.length; i += 1) {
    sum += parseInt(base[i], 10) * (factorStart - i);
  }
  const mod = (sum * 10) % 11;
  return mod === 10 ? 0 : mod;
}

export function isValidCpf(raw: string): boolean {
  const c = onlyDigits(raw);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) {
    return false;
  }
  const d1 = cpfCheckDigit(c.slice(0, 9), 10);
  const d2 = cpfCheckDigit(c.slice(0, 10), 11);
  return d1 === parseInt(c[9], 10) && d2 === parseInt(c[10], 10);
}

export function isValidIe(value: string, uf: string): boolean {
  if (!value?.trim() || !uf?.trim()) {
    return false;
  }
  const cleaned = value.replace(/\s/g, '');
  const u = uf.toUpperCase();
  if (u === 'SP') {
    const digits = onlyDigits(cleaned);
    return digits.length >= 8 && digits.length <= 12;
  }
  return /^[\dA-Za-z.\-/]{2,14}$/.test(cleaned);
}
