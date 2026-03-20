declare module "@modelcontextprotocol/sdk/client/index.js" {
  export interface Client {
    close?(): Promise<void> | void;
    connect?(...args: unknown[]): Promise<unknown> | unknown;
    request?(...args: unknown[]): Promise<unknown> | unknown;
    notify?(...args: unknown[]): Promise<unknown> | unknown;
  }
}
