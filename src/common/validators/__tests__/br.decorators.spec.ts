import { validateSync } from 'class-validator';
import { IsCnpj, IsCpf, IsChaveNFe, IsIe } from '../br.decorators';

class CnpjDto {
  @IsCnpj()
  cnpj!: string;
}

class CpfDto {
  @IsCpf()
  cpf!: string;
}

class ChaveDto {
  @IsChaveNFe()
  chave!: string;
}

class IeDto {
  uf!: string;

  @IsIe('uf')
  ie!: string;
}

describe('br.decorators', () => {
  it('should validate CNPJ on DTO', () => {
    expect(validateSync(Object.assign(new CnpjDto(), { cnpj: '12345678000195' }))).toHaveLength(0);
    expect(validateSync(Object.assign(new CnpjDto(), { cnpj: 'invalid' })).length).toBeGreaterThan(0);
  });

  it('should validate CPF on DTO', () => {
    expect(validateSync(Object.assign(new CpfDto(), { cpf: '39053344705' }))).toHaveLength(0);
    expect(validateSync(Object.assign(new CpfDto(), { cpf: '11111111111' })).length).toBeGreaterThan(0);
  });

  it('should validate chave NFe on DTO', () => {
    expect(
      validateSync(
        Object.assign(new ChaveDto(), { chave: '35240112345678000195550010000001231234567891' }),
      ),
    ).toHaveLength(0);
    expect(validateSync(Object.assign(new ChaveDto(), { chave: '35240112345678000195550010000001231234567890' })).length).toBeGreaterThan(0);
  });

  it('should validate IE with UF', () => {
    expect(validateSync(Object.assign(new IeDto(), { uf: 'SP', ie: '118000000119' }))).toHaveLength(0);
  });
});
