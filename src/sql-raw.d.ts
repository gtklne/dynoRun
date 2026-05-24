declare module '*.sql?raw' {
  const content: string;
  export default content;
}

declare module '*.wasm?url' {
  const url: string;
  export default url;
}
