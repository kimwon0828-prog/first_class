export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string }
