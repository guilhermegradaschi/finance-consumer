import { BadRequestException } from '@nestjs/common';
import { ChaveAcessoParamPipe } from '@shared/pipes/chave-acesso-param.pipe';

describe('ChaveAcessoParamPipe', () => {
  const pipe = new ChaveAcessoParamPipe();

  it('should return the chave when valid', () => {
    const chave = '35240112345678000195550010000001231234567891';
    expect(pipe.transform(chave)).toBe(chave);
  });

  it('should throw BadRequestException when invalid', () => {
    expect(() => pipe.transform('invalid')).toThrow(BadRequestException);
  });
});
