import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { isValidCnpj, isValidCpf, isValidIe, isValidNfeChaveAcesso } from '../validation/br-tax-id.util';

export function IsChaveNFe(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isChaveNFe',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidNfeChaveAcesso(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid NF-e chave de acesso`;
        },
      },
    });
  };
}

export function IsCnpj(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isCnpj',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidCnpj(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid CNPJ`;
        },
      },
    });
  };
}

export function IsCpf(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isCpf',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidCpf(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid CPF`;
        },
      },
    });
  };
}

export function IsIe(ufProperty: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isIe',
      target: object.constructor,
      propertyName: propertyName as string,
      constraints: [ufProperty],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (value === undefined || value === null || value === '') {
            return true;
          }
          if (typeof value !== 'string') {
            return false;
          }
          const record = args.object as Record<string, string>;
          const uf = record[args.constraints[0] as string];
          return isValidIe(value, uf ?? '');
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid inscrição estadual for UF ${String(args.constraints[0])}`;
        },
      },
    });
  };
}
