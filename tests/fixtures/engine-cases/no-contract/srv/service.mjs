// Hand-written fixture: a package without the call contract module.
export function allocate(amount, quota) {
  return (amount * quota) / 100;
}
