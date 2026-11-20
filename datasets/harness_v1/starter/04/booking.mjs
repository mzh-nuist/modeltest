export function createDesk() {
  return {
    book() { throw new Error('预约还未实现'); },
    list() { return []; },
  };
}
