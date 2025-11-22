import BadRequestException from "./bad-request-exception.js";

export class ParamsValidateException {
  validateStringParam(value: any, fieldName: string) {
    const specialCharRegex = /[^a-z0-9]/i;
    const trimmedValue = value?.trim();

    if (!trimmedValue || trimmedValue === "null" || trimmedValue === "undefined" || specialCharRegex.test(trimmedValue)) {
      throw new BadRequestException(`Invalid ${fieldName}`);
    }

    return trimmedValue;
  }

  validateId(value: any, fieldName: string) {
    const id = Number(value);
    if (!id || Number.isNaN(id) || id <= 0) {
      throw new BadRequestException(`Invalid ${fieldName}`);
    }
    return id;
  }

  validateIpv6Param(value: any) {
    const ipv6Regex = /[^a-z0-9:]/i;
    const trimmedValue = value?.trim();

    if (!trimmedValue || trimmedValue === "null" || trimmedValue === "undefined" || ipv6Regex.test(trimmedValue)) {
      throw new BadRequestException("Invalid Ipv6");
    }

    return trimmedValue;
  }

  validateIds(value: any, fieldName: string): number[] {
    if (!Array.isArray(value)) {
      value = [value];
    }

    const ids = value.map((v: string) => {
      const id = Number(v);
      if (!id || Number.isNaN(id) || id <= 0) {
        throw new BadRequestException(`Invalid ${fieldName}: ${v}`);
      }
      return id;
    });

    if (ids.length === 0) {
      throw new BadRequestException(`No ${fieldName}s provided`);
    }

    return ids;
  }

  emptyBodyValidation(reqBody: any){
    if (!reqBody || Object.keys(reqBody).length === 0) throw new BadRequestException("Empty payload received");
  }
}
