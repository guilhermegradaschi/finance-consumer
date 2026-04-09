import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { isValidNfeChaveAcesso } from '../validation/br-tax-id.util';

@Injectable()
export class ChaveAcessoParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isValidNfeChaveAcesso(value)) {
      throw new BadRequestException({
        message: 'Invalid NF-e access key (chave de acesso)',
        errorCode: 'NF400_CHAVE',
      });
    }
    return value;
  }
}
