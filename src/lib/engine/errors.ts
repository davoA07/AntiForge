export type EngineErrorCode =
  | "EMPTY_SIGNATURE"
  | "DEGENERATE_SIGNATURE"
  | "TOO_FEW_REFERENCES"
  | "DIMENSION_MISMATCH";

export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = "EngineError";
    this.code = code;
  }
}
