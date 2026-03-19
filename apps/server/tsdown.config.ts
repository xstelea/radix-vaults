import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: 'src/main.ts',
  outDir: 'dist',
  format: 'esm',
  noExternal: [/^@radix-vaults\/database/, /^@radix-vaults\/shared/]
})
