import { describe, expect, it } from "vitest";
import { formatCnpj, formatCpf, isValidCnpj, isValidCpf } from "../client/src/lib/brDocuments";

describe("documentos brasileiros nos formulários públicos", () => {
  it("formata e valida CPF", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });

  it("formata e valida CNPJ", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });
});

