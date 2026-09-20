/// <reference types="vite/client" />

declare module '*.glsl?raw' {
  const source: string
  export default source
}

declare module '*.json' {
  const value: any
  export default value
}
