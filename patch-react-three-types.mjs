/**
 * Patch @react-three/fiber type declarations
 *
 * @react-three/fiber augments JSX.IntrinsicElements globally with Three.js
 * elements. These elements lack `className`, which causes TypeScript to resolve
 * `className` as `never` when used with `React.ElementType` across the entire
 * project (56+ errors).
 *
 * This script comments out the module augmentation blocks entirely.
 * Three.js components still work at runtime — only type-level JSX element
 * recognition is affected (the 3 Three.js component files use @ts-expect-error).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

const targetFile = join(
  projectRoot,
  'node_modules/@react-three/fiber/dist/declarations/src/three-types.d.ts'
)

if (!existsSync(targetFile)) {
  console.log('[@react-three/fiber patch] Package not installed, skipping.')
  process.exit(0)
}

const content = readFileSync(targetFile, 'utf8')

// Already patched?
if (content.includes('PATCHED: Module augmentations disabled')) {
  console.log('[@react-three/fiber patch] Already patched, skipping.')
  process.exit(0)
}

// Comment out the three `declare module` blocks that augment JSX.IntrinsicElements
const patched = content
  .replace(
    /declare module 'react' \{[\s\S]*?\n\}/g,
    '// PATCHED: Module augmentations disabled to prevent className type pollution\n// See scripts/patch-react-three-types.mjs for details'
  )
  .replace(
    /declare module 'react\/jsx-runtime' \{[\s\S]*?\n\}/g,
    ''
  )
  .replace(
    /declare module 'react\/jsx-dev-runtime' \{[\s\S]*?\n\}/g,
    ''
  )

writeFileSync(targetFile, patched, 'utf8')
console.log('[@react-three/fiber patch] Disabled JSX module augmentations to prevent className type pollution.')
