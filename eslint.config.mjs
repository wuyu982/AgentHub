import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const filename = fileURLToPath(import.meta.url)
const projectRoot = path.dirname(filename)
const require = createRequire(import.meta.url)
const requireFromEslint = createRequire(require.resolve('eslint/package.json'))
const { FlatCompat } = requireFromEslint('@eslint/eslintrc')

const compat = new FlatCompat({ baseDirectory: projectRoot })

const eslintConfig = [
  {
    ignores: ['.next/**', 'node_modules/**', 'data/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
]

export default eslintConfig
