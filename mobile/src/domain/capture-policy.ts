export function allowsTestCapture(development: boolean, flag: string | undefined): boolean {
  return development === true && flag === 'true';
}
